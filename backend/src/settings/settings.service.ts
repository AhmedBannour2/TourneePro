import { Injectable } from '@nestjs/common';
import { TourType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SYSTEM_PAY_DEFAULTS } from '../worked-days/worked-days.service';
import { GlobalRateItemDto } from './dto/upsert-global-pay-rates.dto';
import { MailConfigDto } from './dto/mail-config.dto';

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const MAIL_KEYS = {
  host: 'mail.host',
  port: 'mail.port',
  user: 'mail.user',
  pass: 'mail.pass',
  from: 'mail.from',
} as const;

const INCLUDE_UPDATED_BY = {
  updatedBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

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

  // ── Mail config ─────────────────────────────────────────────────────────────

  async getMailConfig(): Promise<Partial<MailConfig>> {
    const cfg = await this.systemConfig.getMany(Object.values(MAIL_KEYS));
    return {
      host: cfg[MAIL_KEYS.host] ?? undefined,
      port: cfg[MAIL_KEYS.port] ? Number(cfg[MAIL_KEYS.port]) : undefined,
      user: cfg[MAIL_KEYS.user] ?? undefined,
      pass: cfg[MAIL_KEYS.pass] ? '••••••••' : undefined,
      from: cfg[MAIL_KEYS.from] ?? undefined,
    };
  }

  async saveMailConfig(cfg: MailConfigDto): Promise<void> {
    await this.systemConfig.set(MAIL_KEYS.host, cfg.host);
    await this.systemConfig.set(MAIL_KEYS.port, String(cfg.port));
    await this.systemConfig.set(MAIL_KEYS.user, cfg.user);
    if (cfg.pass && cfg.pass !== '••••••••') {
      await this.systemConfig.set(MAIL_KEYS.pass, cfg.pass);
    }
    await this.systemConfig.set(MAIL_KEYS.from, cfg.from);
  }
}
