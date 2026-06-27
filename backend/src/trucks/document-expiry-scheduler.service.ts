import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notification/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

const DOC_LABELS: Record<string, string> = {
  ASSURANCE: 'Assurance',
  CONTROLE_TECHNIQUE: 'Contrôle technique',
  CONTROLE_HAYON: 'Contrôle hayon',
  CARTE_GRISE: 'Carte grise',
};

type Milestone = 'expired' | '7d' | '30d';

@Injectable()
export class DocumentExpirySchedulerService {
  private readonly logger = new Logger(DocumentExpirySchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  // Every day at 07:00
  @Cron('0 7 * * *')
  async checkExpiringDocuments() {
    this.logger.log('Checking truck document expiry...');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);

    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    const docs = await this.prisma.truckDocument.findMany({
      where: { expiryDate: { not: null, lte: in30 } },
      include: { truck: true },
      orderBy: { expiryDate: 'asc' },
    });

    if (!docs.length) {
      this.logger.log('No documents expiring within 30 days.');
      return;
    }

    const expired = docs.filter((d) => d.expiryDate! < now);
    const urgent = docs.filter((d) => d.expiryDate! >= now && d.expiryDate! <= in7);
    const warning = docs.filter((d) => d.expiryDate! > in7 && d.expiryDate! <= in30);

    // ── In-app notifications (one per doc per milestone, no duplicates) ──────
    for (const d of expired) await this.notifyIfNew(d, 'expired');
    for (const d of urgent) await this.notifyIfNew(d, '7d');
    for (const d of warning) await this.notifyIfNew(d, '30d');

    // ── Email digest (best-effort, may fail if no real email) ────────────────
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'DISPATCHER'] } },
      select: { email: true },
    });

    if (!admins.length) return;

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

  private async notifyIfNew(
    doc: {
      id: string;
      type: string;
      expiryDate: Date | null;
      truck: { id: string; immatriculation: string };
    },
    milestone: Milestone,
  ) {
    // Check if this doc+milestone was already notified
    const existing = await this.prisma.notification.findFirst({
      where: {
        type: 'DOCUMENT_EXPIRING',
        metadata: { path: ['docId'], equals: doc.id },
      },
      select: { metadata: true },
    });

    if (existing) {
      const meta = existing.metadata as Record<string, unknown>;
      if (meta?.milestone === milestone) return; // already sent for this milestone
    }

    const label = DOC_LABELS[doc.type] ?? doc.type;
    const immat = doc.truck.immatriculation;
    const fmt = (d: Date) =>
      new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

    const titles: Record<Milestone, string> = {
      expired: `🔴 Document expiré — ${immat}`,
      '7d': `🟠 Document expire dans 7j — ${immat}`,
      '30d': `🟡 Document expire dans 30j — ${immat}`,
    };

    const messages: Record<Milestone, string> = {
      expired: `${label} du camion ${immat} a expiré le ${fmt(doc.expiryDate!)}.`,
      '7d': `${label} du camion ${immat} expire le ${fmt(doc.expiryDate!)} — renouvellement urgent.`,
      '30d': `${label} du camion ${immat} expire le ${fmt(doc.expiryDate!)}.`,
    };

    await this.notifications.createForRole(['ADMIN', 'DISPATCHER'], {
      type: 'DOCUMENT_EXPIRING',
      title: titles[milestone],
      message: messages[milestone],
      link: `/trucks?truck=${doc.truck.id}&tab=documents`,
      metadata: { docId: doc.id, milestone, truckId: doc.truck.id },
    });

    this.logger.log(`In-app notification created: ${titles[milestone]}`);
  }
}
