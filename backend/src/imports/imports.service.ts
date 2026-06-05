import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoulangerParserService } from './parsers/boulanger-parser.service';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  private readonly uploadsDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: BoulangerParserService,
  ) {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
      this.logger.log(`Created uploads directory: ${this.uploadsDir}`);
    }
  }

  /**
   * List recent import batches
   */
  async listBatches(limit: number = 10) {
    return this.prisma.importBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  /**
   * Handle file upload, parse immediately, and save rows to DB.
   * Synchronous — no Redis/BullMQ required.
   */
  async uploadFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    this.logger.log(`Processing upload: ${file.originalname}`);

    // Create batch record first so we can mark it failed on any error
    const batch = await this.prisma.importBatch.create({
      data: { fileName: file.originalname, status: 'processing' },
    });

    const safeName = path.basename(file.originalname).replace(/[^A-Za-z0-9._-]/g, '_');
    const fileName = `${Date.now()}_${safeName}`;
    const filePath = path.join(this.uploadsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    this.logger.log(`Created batch ${batch.id}, parsing file...`);

    try {
      // Garonor sheet selection (tomorrow's day-of-month) is computed inside the parser.
      const result = await this.parser.parseFile(filePath);

      this.logger.log(
        `${result.platform}: ${result.allRows.length} rows total, ` +
          `${result.stpRows.length} STP rows`,
      );

      // Build all rows (parsed/skipped) + error rows in one array for a single createMany
      const importRowsData = result.allRows.map((row) => ({
        batchId: batch.id,
        sheetName: row.sourceSheet,
        rowIndex: row.sourceRow,
        rawData: {
          tourNumber: row.tourNumber,
          prestataire: row.prestataire,
          horaire: row.horaire,
          quai: row.quai,
          nbColis: row.nbColis,
          immatriculation: row.immatriculation,
          equipage1: row.equipage1,
          equipage2: row.equipage2,
          telephone: row.telephone,
          platform: row.platform,
          date: row.date?.toISOString() ?? null,
        } as Prisma.InputJsonValue,
        parsedData: {
          tourCode: String(row.tourNumber),
          tourType: row.tourType,
          platform: row.platform,
          date: row.dateStr ?? null,
          horaire: row.horaire,
          quai: row.quai,
          nbColis: row.nbColis,
          prestataire: row.prestataire,
          isStp: this.parser.isStp(row.prestataire),
          immatriculation: row.immatriculation,
          equipage1: row.equipage1,
          equipage2: row.equipage2,
          telephone: row.telephone,
        } as Prisma.InputJsonValue,
        status: this.parser.isStp(row.prestataire) ? 'parsed' : 'skipped',
        errorMessage: null as string | null,
      }));

      // Append parse-error rows so the entire insert is one atomic operation
      for (const errMsg of result.parseErrors) {
        importRowsData.push({
          batchId: batch.id,
          sheetName: 'parser',
          rowIndex: -1,
          rawData: {} as Prisma.InputJsonValue,
          parsedData: {} as Prisma.InputJsonValue,
          status: 'error',
          errorMessage: errMsg,
        });
      }

      if (importRowsData.length > 0) {
        await this.prisma.importRow.createMany({ data: importRowsData });
      }

      // Update batch to preview
      const updatedBatch = await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: 'preview',
          rowCount: result.allRows.length,
          errorCount: result.parseErrors.length,
        },
      });

      this.logger.log(`Batch ${batch.id} ready: ${result.stpRows.length} STP tours to import`);

      return updatedBatch;
    } catch (err: any) {
      this.logger.error(`Parse failed for batch ${batch.id}: ${err.message}`);
      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: 'failed' },
      });
      throw new BadRequestException(`File parsing failed: ${err.message}`);
    }
  }

  /**
   * Get import batch status
   */
  async getBatchStatus(batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    return batch;
  }

  /**
   * Get import rows with pagination and filtering
   */
  async getImportRows(batchId: string, status?: string, page: number = 1, limit: number = 50) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    const where = {
      batchId,
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.importRow.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { rowIndex: 'asc' },
      }),
      this.prisma.importRow.count({ where }),
    ]);

    return {
      rows,
      total,
      page,
      limit,
    };
  }

  /**
   * Commit import batch - create Tour records from STP-parsed rows idempotently
   */
  async commitBatch(batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    if (batch.status !== 'preview') {
      throw new BadRequestException(
        `Cannot commit batch with status ${batch.status}. Expected status: preview`,
      );
    }

    this.logger.log(`Committing import batch ${batchId}`);

    // Get only STP-parsed rows (status='parsed')
    const parsedRows = await this.prisma.importRow.findMany({
      where: { batchId, status: 'parsed' },
      orderBy: { rowIndex: 'asc' },
    });

    this.logger.log(`Found ${parsedRows.length} STP rows to commit`);

    let toursCreated = 0;
    let toursUpdated = 0;
    let toursSkipped = 0;

    for (const row of parsedRows) {
      const data = row.parsedData as any;

      if (!data?.tourCode || !data?.date || !data?.platform) {
        this.logger.warn(`Skipping row ${row.rowIndex}: missing tourCode, date, or platform`);
        toursSkipped++;
        continue;
      }

      // Parse date to start-of-day UTC
      let tourDate: Date;
      try {
        tourDate = new Date(data.date);
        tourDate.setUTCHours(0, 0, 0, 0);
        if (isNaN(tourDate.getTime())) throw new Error('Invalid date');
      } catch {
        this.logger.warn(`Skipping row ${row.rowIndex}: invalid date ${data.date}`);
        toursSkipped++;
        continue;
      }

      // Upsert platform atomically to avoid race conditions on concurrent commits
      const platformName =
        data.platform === 'F166'
          ? 'Alfortville'
          : data.platform === 'GARONOR'
            ? 'Garonor'
            : data.platform;
      const platform = await this.prisma.platform.upsert({
        where: { code: data.platform },
        update: {},
        create: { code: data.platform, name: platformName },
      });

      // Upsert tour using unique constraint tourCode + date + platformId
      try {
        const existing = await this.prisma.tour.findFirst({
          where: {
            tourCode: String(data.tourCode),
            date: tourDate,
            platformId: platform.id,
          },
        });

        if (existing) {
          // Update with latest Boulanger data (horaire, quai, etc.)
          await this.prisma.tour.update({
            where: { id: existing.id },
            data: {
              tourType: data.tourType || existing.tourType,
              horaire: data.horaire ?? existing.horaire,
              quai: data.quai ?? existing.quai,
              nbColis: data.nbColis ?? existing.nbColis,
              prestataire: data.prestataire ?? existing.prestataire,
              immatriculation: data.immatriculation ?? existing.immatriculation,
              importBatchId: batchId,
            },
          });
          toursUpdated++;
        } else {
          await this.prisma.tour.create({
            data: {
              tourCode: String(data.tourCode),
              tourType: data.tourType || null,
              date: tourDate,
              platformId: platform.id,
              status: 'imported',
              importBatchId: batchId,
              horaire: data.horaire || null,
              quai: data.quai || null,
              nbColis: data.nbColis || null,
              prestataire: data.prestataire || null,
              immatriculation: data.immatriculation || null,
            },
          });
          toursCreated++;
        }
      } catch (err: any) {
        this.logger.error(`Failed to upsert tour ${data.tourCode} on ${data.date}: ${err.message}`);
        toursSkipped++;
      }
    }

    if (parsedRows.length > 0 && toursSkipped === parsedRows.length) {
      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'failed' },
      });
      throw new BadRequestException(
        'All rows were skipped — no tours were created or updated. Check row data for missing tourCode, date, or platform fields.',
      );
    }

    // Update batch status to committed
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'committed' },
    });

    this.logger.log(
      `Batch ${batchId} committed: ${toursCreated} created, ${toursUpdated} updated, ${toursSkipped} skipped`,
    );

    return {
      batchId,
      toursCreated,
      toursUpdated,
      toursSkipped,
      status: 'committed',
    };
  }

  /**
   * Cancel import batch
   */
  async cancelBatch(batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} not found`);
    }

    if (!['pending', 'processing', 'preview'].includes(batch.status)) {
      throw new BadRequestException(`Cannot cancel batch with status ${batch.status}`);
    }

    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'cancelled' },
    });

    this.logger.log(`Import batch ${batchId} cancelled`);

    return { batchId, status: 'cancelled' };
  }
}
