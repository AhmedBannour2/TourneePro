import { Injectable } from '@nestjs/common';
import { TourType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SYSTEM_PAY_DEFAULTS } from '../worked-days/worked-days.service';
import { GlobalRateItemDto } from './dto/upsert-global-pay-rates.dto';
import { MailConfigDto } from './dto/mail-config.dto';

export interface MailConfig {
  resendApiKey: string;
  from: string;
  testRecipient?: string;
}

const MAIL_KEYS = {
  resendApiKey: 'resend.api_key',
  from: 'mail.from',
  testRecipient: 'mail.test_recipient',
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

  // ── Mail config (Resend) ────────────────────────────────────────────────────

  async getMailConfig(): Promise<Partial<MailConfig>> {
    const cfg = await this.systemConfig.getMany(Object.values(MAIL_KEYS));
    return {
      resendApiKey: cfg[MAIL_KEYS.resendApiKey]
        ? cfg[MAIL_KEYS.resendApiKey].substring(0, 10) + '••••••••'
        : undefined,
      from: cfg[MAIL_KEYS.from] ?? undefined,
      testRecipient: cfg[MAIL_KEYS.testRecipient] ?? undefined,
    };
  }

  async saveMailConfig(cfg: MailConfigDto): Promise<Partial<MailConfig>> {
    // Only update API key if provided and not masked
    if (cfg.resendApiKey && !cfg.resendApiKey.includes('••••')) {
      await this.systemConfig.set(MAIL_KEYS.resendApiKey, cfg.resendApiKey);
    }
    // Update from address if provided
    if (cfg.from) {
      await this.systemConfig.set(MAIL_KEYS.from, cfg.from);
    }
    // Update test recipient if provided
    if (cfg.testRecipient) {
      await this.systemConfig.set(MAIL_KEYS.testRecipient, cfg.testRecipient);
    }
    // Return current config after updates
    return this.getMailConfig();
  }

  async getTestRecipient(): Promise<string | null> {
    return await this.systemConfig.get(MAIL_KEYS.testRecipient);
  }
}
