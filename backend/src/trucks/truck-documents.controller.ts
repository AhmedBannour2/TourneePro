import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpCode,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { TruckDocumentsService } from './truck-documents.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpsertTruckDocumentDto } from './dto/truck-document.dto';

@ApiTags('truck-documents')
@Controller('trucks/:truckId/documents')
export class TruckDocumentsController {
  constructor(
    private readonly service: TruckDocumentsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all documents for a truck' })
  list(@Param('truckId') truckId: string) {
    return this.service.list(truckId);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add a document entry (with optional file upload)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upsert(
    @Param('truckId') truckId: string,
    @Body() dto: UpsertTruckDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: any,
  ) {
    return this.service.upsert(truckId, dto, file, req.user?.id ?? null);
  }

  @Delete(':documentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a truck document' })
  delete(@Param('truckId') truckId: string, @Param('documentId') documentId: string) {
    return this.service.delete(truckId, documentId);
  }

  @Get(':documentId/file')
  @ApiOperation({ summary: 'Redirect to the cloud-hosted truck document file' })
  async getFile(
    @Param('truckId') truckId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const doc = await this.service.findDocumentOrThrow(truckId, documentId);
    const url = this.service.getFileUrl(doc);

    if (!url?.startsWith('https://')) {
      return res.status(404).json({ message: 'No file attached to this document' });
    }
    const { buffer, contentType } = await this.cloudinary.downloadFile(url);
    res.set('Content-Type', contentType);
    res.set(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.fileName ?? 'document')}"`,
    );
    res.set('Cache-Control', 'private, max-age=300');
    return res.send(buffer);
  }
}
