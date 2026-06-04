import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportQueueService } from './import-queue.service';
import { BoulangerParserService } from './parsers/boulanger-parser.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportQueueService, BoulangerParserService],
})
export class ImportsModule {}
