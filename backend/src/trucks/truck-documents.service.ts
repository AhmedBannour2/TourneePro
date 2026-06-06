import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TruckDocumentType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertTruckDocumentDto } from './dto/truck-document.dto';

@Injectable()
export class TruckDocumentsService {
  private readonly logger = new Logger(TruckDocumentsService.name);
  private readonly uploadsDir = path.join(process.cwd(), 'uploads', 'truck-documents');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

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
      const truckDir = path.join(this.uploadsDir, truckId);
      if (!fs.existsSync(truckDir)) fs.mkdirSync(truckDir, { recursive: true });

      const safeName = `${Date.now()}_${file.originalname.replace(/[^A-Za-z0-9._-]/g, '_')}`;
      const dest = path.join(truckDir, safeName);
      fs.writeFileSync(dest, file.buffer);

      filePath = path.join('truck-documents', truckId, safeName);
      fileName = file.originalname;
      mimeType = file.mimetype;
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

    if (doc.filePath) {
      const abs = path.join(process.cwd(), 'uploads', doc.filePath);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }

    await this.prisma.truckDocument.delete({ where: { id: documentId } });
  }

  getFilePath(doc: { filePath: string | null }): string | null {
    if (!doc.filePath) return null;
    return path.join(process.cwd(), 'uploads', doc.filePath);
  }

  async findDocumentOrThrow(truckId: string, documentId: string) {
    const doc = await this.prisma.truckDocument.findFirst({
      where: { id: documentId, truckId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  // Used by the expiry scheduler — returns all docs with upcoming or past expiry
  async findExpiringDocuments(withinDays: number) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + withinDays);

    return this.prisma.truckDocument.findMany({
      where: {
        expiryDate: { not: null, lte: threshold },
      },
      include: {
        truck: true,
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  private async assertTruckExists(truckId: string) {
    const truck = await this.prisma.truck.findUnique({ where: { id: truckId } });
    if (!truck) throw new NotFoundException(`Truck ${truckId} not found`);
  }
}
