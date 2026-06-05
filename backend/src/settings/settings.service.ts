import { Injectable } from '@nestjs/common';
import { TourType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_PAY_DEFAULTS } from '../worked-days/worked-days.service';
import { GlobalRateItemDto } from './dto/upsert-global-pay-rates.dto';

const INCLUDE_UPDATED_BY = {
  updatedBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalPayRates() {
    const existing = await this.prisma.globalPayRate.findMany({
      include: INCLUDE_UPDATED_BY,
      orderBy: { tourType: 'asc' },
    });

    // Auto-seed from system defaults on first call
    if (existing.length === 0) {
      await Promise.all(
        Object.entries(SYSTEM_PAY_DEFAULTS).map(([tourType, d]) =>
          this.prisma.globalPayRate.create({
            data: {
              tourType: tourType as TourType,
              chauffeurRate: d.chauffeurRate,
              aideRate: d.aideRate,
            },
          }),
        ),
      );
      return this.prisma.globalPayRate.findMany({
        include: INCLUDE_UPDATED_BY,
        orderBy: { tourType: 'asc' },
      });
    }

    return existing;
  }

  async upsertGlobalPayRates(rates: GlobalRateItemDto[], userId: string) {
    await Promise.all(
      rates.map((r) =>
        this.prisma.globalPayRate.upsert({
          where: { tourType: r.tourType },
          update: {
            chauffeurRate: r.chauffeurRate,
            aideRate: r.aideRate ?? null,
            updatedById: userId,
          },
          create: {
            tourType: r.tourType,
            chauffeurRate: r.chauffeurRate,
            aideRate: r.aideRate ?? null,
            updatedById: userId,
          },
        }),
      ),
    );

    return this.prisma.globalPayRate.findMany({
      include: INCLUDE_UPDATED_BY,
      orderBy: { tourType: 'asc' },
    });
  }
}
