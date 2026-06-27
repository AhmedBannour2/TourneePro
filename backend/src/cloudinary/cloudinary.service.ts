import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

type ResourceType = 'image' | 'raw' | 'video';

function mimeToResourceType(mimetype: string): ResourceType {
  if (mimetype.startsWith('image/')) return 'image';
  return 'raw';
}

function parseCloudinaryUrl(url: string): { publicId: string; resourceType: string } | null {
  const match = url.match(/res\.cloudinary\.com\/[^/]+\/([^/]+)\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  return { resourceType: match[1], publicId: match[2] };
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      this.logger.log('Cloudinary configured');
    } else {
      this.logger.warn('Cloudinary env vars not set — file uploads will fail until configured');
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    mimetype: string,
    folder: string,
    originalName: string,
  ): Promise<string> {
    const resourceType = mimeToResourceType(mimetype);
    const safeBase = originalName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
    const publicId = `${folder}/${Date.now()}_${safeBase}`;
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      resource_type: resourceType,
      overwrite: false,
    });

    return result.secure_url;
  }

  /** Download a Cloudinary file and return its raw bytes + content-type. */
  async downloadFile(storedUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    const parsed = parseCloudinaryUrl(storedUrl);
    if (!parsed) throw new Error('Invalid Cloudinary URL');

    let downloadUrl: string;
    if (parsed.resourceType === 'image') {
      // Images are publicly accessible via CDN URL directly
      downloadUrl = storedUrl;
    } else {
      // Raw files (PDFs etc.) require signed API URL — CDN access is restricted on this account
      downloadUrl = cloudinary.utils.private_download_url(parsed.publicId, '', {
        resource_type: 'raw',
        type: 'upload',
        attachment: false,
      });
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Cloudinary download failed: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  async deleteByUrl(url: string): Promise<void> {
    const parsed = parseCloudinaryUrl(url);
    if (!parsed) {
      this.logger.warn(`Could not parse Cloudinary URL for deletion: ${url}`);
      return;
    }
    try {
      await cloudinary.uploader.destroy(parsed.publicId, {
        resource_type: parsed.resourceType as ResourceType,
        invalidate: true,
      });
    } catch (e: any) {
      this.logger.warn(`Cloudinary delete failed for ${parsed.publicId}: ${e.message}`);
    }
  }
}
