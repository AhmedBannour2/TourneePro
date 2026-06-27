import { Module } from '@nestjs/common';
import { ExpressDeliveriesController } from './express-deliveries.controller';
import { ExpressDeliveriesService } from './express-deliveries.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [ExpressDeliveriesController],
  providers: [ExpressDeliveriesService],
  exports: [ExpressDeliveriesService],
})
export class ExpressDeliveriesModule {}
