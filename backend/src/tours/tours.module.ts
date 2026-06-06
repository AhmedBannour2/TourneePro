import { Module } from '@nestjs/common';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkedDaysModule } from '../worked-days/worked-days.module';

@Module({
  imports: [PrismaModule, NotificationModule, NotificationsModule, WorkedDaysModule],
  controllers: [ToursController],
  providers: [ToursService],
  exports: [ToursService],
})
export class ToursModule {}
