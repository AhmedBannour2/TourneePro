import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TrucksService } from './trucks.service';
import { TrucksController, InspectionsController } from './trucks.controller';
import { InspectionSchedulerService } from './inspection-scheduler.service';
import { TruckDocumentsService } from './truck-documents.service';
import { TruckDocumentsController } from './truck-documents.controller';
import { DocumentExpirySchedulerService } from './document-expiry-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationModule, ConfigModule],
  controllers: [TrucksController, InspectionsController, TruckDocumentsController],
  providers: [
    TrucksService,
    InspectionSchedulerService,
    TruckDocumentsService,
    DocumentExpirySchedulerService,
  ],
  exports: [TrucksService],
})
export class TrucksModule {}
