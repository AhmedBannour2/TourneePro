import { Module } from '@nestjs/common';
import { WorkedDaysController } from './worked-days.controller';
import { WorkedDaysService } from './worked-days.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkedDaysController],
  providers: [WorkedDaysService],
  exports: [WorkedDaysService],
})
export class WorkedDaysModule {}
