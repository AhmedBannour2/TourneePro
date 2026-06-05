import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InspectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notification/mail.service';

@Injectable()
export class InspectionSchedulerService {
  private readonly logger = new Logger(InspectionSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Every Saturday at 06:00
  @Cron('0 6 * * 6')
  async createWeeklyInspections() {
    this.logger.log('Running weekly inspection scheduler...');

    const trucks = await this.prisma.truck.findMany({
      where: { responsibleEmployeeId: { not: null } },
      include: {
        responsibleEmployee: {
          include: { user: { select: { email: true } } },
        },
      },
    });

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let created = 0;
    for (const truck of trucks) {
      if (!truck.responsibleEmployee) continue;

      // Skip if a PENDING inspection already exists this week
      const existing = await this.prisma.truckInspection.findFirst({
        where: {
          truckId: truck.id,
          status: InspectionStatus.PENDING,
          scheduledDate: { gte: weekStart, lt: weekEnd },
        },
      });
      if (existing) continue;

      await this.prisma.truckInspection.create({
        data: {
          truckId: truck.id,
          assignedToId: truck.responsibleEmployee.id,
          scheduledDate: now,
          status: InspectionStatus.PENDING,
        },
      });
      created++;

      const email = truck.responsibleEmployee.user?.email;
      if (email) {
        this.mail
          .sendInspectionRequestEmail({
            to: email,
            employeeName: truck.responsibleEmployee.name,
            truckImmatriculation: truck.immatriculation,
            scheduledDate: now,
          })
          .catch(() => {});
      }
    }

    this.logger.log(`Weekly inspections created: ${created}`);
  }
}
