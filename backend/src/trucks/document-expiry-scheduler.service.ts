import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notification/mail.service';

const DOC_LABELS: Record<string, string> = {
  ASSURANCE: 'Assurance',
  CONTROLE_TECHNIQUE: 'Contrôle technique',
  CONTROLE_HAYON: 'Contrôle hayon',
  CARTE_GRISE: 'Carte grise',
};

@Injectable()
export class DocumentExpirySchedulerService {
  private readonly logger = new Logger(DocumentExpirySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Every day at 07:00
  @Cron('0 7 * * *')
  async checkExpiringDocuments() {
    this.logger.log('Checking truck document expiry...');

    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'DISPATCHER'] } },
      select: { email: true },
    });

    if (!admins.length) return;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);

    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    // Documents expiring within 30 days (includes already expired)
    const docs = await this.prisma.truckDocument.findMany({
      where: { expiryDate: { not: null, lte: in30 } },
      include: { truck: true },
      orderBy: { expiryDate: 'asc' },
    });

    if (!docs.length) {
      this.logger.log('No documents expiring within 30 days.');
      return;
    }

    // Build email body
    const expired = docs.filter((d) => d.expiryDate! < now);
    const urgent = docs.filter((d) => d.expiryDate! >= now && d.expiryDate! <= in7);
    const warning = docs.filter((d) => d.expiryDate! > in7 && d.expiryDate! <= in30);

    const fmt = (d: Date) =>
      new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

    const lines = (list: typeof docs, emoji: string) =>
      list
        .map(
          (d) =>
            `${emoji} ${d.truck.immatriculation} — ${DOC_LABELS[d.type] ?? d.type} : ${fmt(d.expiryDate!)}`,
        )
        .join('\n');

    const sections: string[] = [];
    if (expired.length) sections.push(`🔴 EXPIRÉS (${expired.length})\n${lines(expired, '•')}`);
    if (urgent.length)
      sections.push(`🟠 EXPIRE DANS 7 JOURS (${urgent.length})\n${lines(urgent, '•')}`);
    if (warning.length)
      sections.push(`🟡 EXPIRE DANS 30 JOURS (${warning.length})\n${lines(warning, '•')}`);

    const body = sections.join('\n\n');

    for (const admin of admins) {
      try {
        await this.mail.sendRaw({
          to: admin.email,
          subject: `⚠️ TourneePro — Documents camions à renouveler (${docs.length})`,
          text: `Bonjour,\n\nVoici les documents camions nécessitant une attention :\n\n${body}\n\nMerci de procéder aux renouvellements nécessaires.\n\nTourneePro`,
        });
        this.logger.log(`Document expiry alert sent to ${admin.email}`);
      } catch (e: any) {
        this.logger.error(`Failed to send expiry alert to ${admin.email}: ${e.message}`);
      }
    }
  }
}
