import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TrucksService } from './trucks.service';
import { TrucksController, InspectionsController } from './trucks.controller';
import { InspectionSchedulerService } from './inspection-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationModule, ConfigModule],
  controllers: [TrucksController, InspectionsController],
  providers: [TrucksService, InspectionSchedulerService],
  exports: [TrucksService],
})
export class TrucksModule {}
