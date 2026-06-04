import { Injectable, Logger } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoulangerParserService } from './parsers/boulanger-parser.service';

export interface ParseExcelJobData {
  batchId: string;
  filePath: string;
}

@Injectable()
export class ImportQueueService {
  private readonly logger = new Logger(ImportQueueService.name);
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: BoulangerParserService,
  ) {
    const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };

    this.queue = new Queue('import-queue', { connection: redisConnection });

    this.worker = new Worker(
      'import-queue',
      async (job: Job<ParseExcelJobData>) => this.processParseJob(job),
      { connection: redisConnection, concurrency: 2 },
    );

    this.worker.on('completed', (job) =>
      this.logger.log(`Job ${job.id} completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('ImportQueueService initialized with BullMQ');
  }

  async queueParseJob(batchId: string, filePath: string): Promise<void> {
    // Try to add to BullMQ queue; if Redis is unavailable, fall back to inline processing
    try {
      await this.queue.add('parse-excel', { batchId, filePath });
      this.logger.log(`Queued parse job for batch ${batchId}`);
    } catch (err) {
      this.logger.warn(`BullMQ queue failed (${(err as Error).message}), processing inline`);
      // Process synchronously so the import always works even without Redis
      await this.processParseJob({ data: { batchId, filePath } } as any);
    }
  }

  private async processParseJob(job: Job<ParseExcelJobData>): Promise<void> {
    const { batchId, filePath } = job.data;
    this.logger.log(`Processing parse job for batch ${batchId}, file: ${filePath}`);

    try {
      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'processing' },
      });

      // ── Parse with the real Boulanger parser ──────────────────────────────
      const result = await this.parser.parseFile(filePath);

      this.logger.log(
        `Parsed ${result.platform}: ${result.allRows.length} total rows, ` +
          `${result.stpRows.length} STP rows, ${result.parseErrors.length} parse errors`,
      );

      // ── Save ALL rows (not just STP) so the user can review ───────────────
      const importRowsData = result.allRows.map((row, idx) => ({
        batchId,
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
          date: row.date?.toISOString(),
        } as Prisma.InputJsonValue,
        parsedData: {
          tourCode: String(row.tourNumber),
          tourType: row.tourType,
          platform: row.platform,
          date: row.date?.toISOString().split('T')[0],
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
        // Mark as 'parsed' for STP rows, 'skipped' for non-STP rows
        status: this.parser.isStp(row.prestataire) ? 'parsed' : 'skipped',
        errorMessage: null as string | null,
      }));

      // Add parse errors as special error rows
      for (const errMsg of result.parseErrors) {
        importRowsData.push({
          batchId,
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

      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'preview',
          rowCount: result.stpRows.length,       // STP rows = what will be imported
          errorCount: result.parseErrors.length,
        },
      });

      this.logger.log(
        `Batch ${batchId} ready for preview: ${result.stpRows.length} STP tours found`,
      );
    } catch (error) {
      this.logger.error(`Parse job failed for batch ${batchId}:`, error);

      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'failed' },
      });

      throw error;
    }
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.worker.close();
    this.logger.log('ImportQueueService shut down gracefully');
  }
}
