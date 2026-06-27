import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TruckDocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpsertTruckDocumentDto } from './dto/truck-document.dto';

@Injectable()
export class TruckDocumentsService {
  private readonly logger = new Logger(TruckDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async list(truckId: string) {
    await this.assertTruckExists(truckId);
    return this.prisma.truckDocument.findMany({
      where: { truckId },
      include: { uploadedBy: { select: { email: true } } },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async upsert(
    truckId: string,
    dto: UpsertTruckDocumentDto,
    file: Express.Multer.File | undefined,
    userId: string | null,
  ) {
    await this.assertTruckExists(truckId);

    let filePath: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;

    if (file) {
      filePath = await this.cloudinary.uploadBuffer(
        file.buffer,
        file.mimetype,
        `tournee-pro/truck-docs/${truckId}`,
        file.originalname,
      );
      fileName = file.originalname;
      mimeType = file.mimetype;
      this.logger.log(`Truck doc uploaded to Cloudinary: ${filePath}`);
    }

    return this.prisma.truckDocument.create({
      data: {
        truckId,
        type: dto.type,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        notes: dto.notes ?? null,
        uploadedById: userId,
        ...(filePath ? { filePath, fileName, mimeType } : {}),
      },
      include: { uploadedBy: { select: { email: true } } },
    });
  }

  async delete(truckId: string, documentId: string) {
    const doc = await this.prisma.truckDocument.findFirst({
      where: { id: documentId, truckId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    if (doc.filePath?.startsWith('https://')) {
      await this.cloudinary.deleteByUrl(doc.filePath);
    }

    await this.prisma.truckDocument.delete({ where: { id: documentId } });
  }

  getFileUrl(doc: { filePath: string | null }): string | null {
    return doc.filePath ?? null;
  }

  async findDocumentOrThrow(truckId: string, documentId: string) {
    const doc = await this.prisma.truckDocument.findFirst({
      where: { id: documentId, truckId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async findExpiringDocuments(withinDays: number) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + withinDays);

    return this.prisma.truckDocument.findMany({
      where: {
        expiryDate: { not: null, lte: threshold },
      },
      include: { truck: true },
      orderBy: { expiryDate: 'asc' },
    });
  }

  private async assertTruckExists(truckId: string) {
    const truck = await this.prisma.truck.findUnique({ where: { id: truckId } });
    if (!truck) throw new NotFoundException(`Truck ${truckId} not found`);
  }
}
