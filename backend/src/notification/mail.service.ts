import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';

export interface InspectionRequestParams {
  to: string;
  employeeName: string;
  truckImmatriculation: string;
  scheduledDate: Date;
}

export interface InspectionProblemParams {
  to: string;
  truckImmatriculation: string;
  employeeName: string;
  problemItems: { item: string; comment: string | null }[];
  generalComment: string | null;
  scheduledDate: Date;
}

export interface AssignmentNotificationParams {
  to: string;
  employeeName: string;
  role: 'chauffeur' | 'aide';
  tourCode: string;
  tourDate: Date;
  platformName: string;
  quai: string | null;
  horaire: string | null;
  partnerName: string | null;
  truckImmatriculation: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly RESEND_URL = 'https://api.resend.com/emails';

  constructor(
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private async getApiKey(): Promise<string | null> {
    const dbKey = await this.systemConfig.get('resend.api_key');
    return dbKey || this.config.get<string>('RESEND_API_KEY') || null;
  }

  private async getFrom(): Promise<string> {
    const dbFrom = await this.systemConfig.get('mail.from');
    return dbFrom || this.config.get<string>('MAIL_FROM') || 'TourneePro <noreply@tournee.pro>';
  }

  private async send(params: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set — email notifications disabled');
      return;
    }

    const from = await this.getFrom();

    const body = {
      from,
      to: [params.to],
      subject: params.subject,
      ...(params.html ? { html: params.html } : {}),
      ...(params.text ? { text: params.text } : {}),
    };

    this.logger.debug(`Resend API → ${params.to} — ${params.subject}`);

    const res = await fetch(this.RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend API ${res.status}: ${text}`);
    }

    this.logger.log(`Email sent to ${params.to} (${params.subject})`);
  }

  async sendAssignmentNotification(params: AssignmentNotificationParams): Promise<void> {
    await this.send({
      to: params.to,
      subject: `Tournée ${params.tourCode} assignée — ${this.formatDate(params.tourDate)}`,
      html: this.buildHtml(params),
    });
  }

  async sendInspectionRequestEmail(params: InspectionRequestParams): Promise<void> {
    const firstName = params.employeeName.split(' ')[0];
    const dateStr = this.formatDate(params.scheduledDate);
    await this.send({
      to: params.to,
      subject: `Contrôle à effectuer — ${params.truckImmatriculation} — ${dateStr}`,
      html: `<!DOCTYPE html><html lang="fr"><body style="font-family:sans-serif;background:#f1f5f9;padding:40px 16px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
          <div style="background:#1d4ed8;padding:24px 32px;">
            <p style="margin:0;color:#fff;font-size:20px;font-weight:800;">🚚 TourneePro</p>
            <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Contrôle technique hebdomadaire</p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;">Bonjour, ${firstName}&nbsp;!</p>
            <p style="margin:0 0 24px;color:#4b5563;">Un contrôle technique est à effectuer pour votre camion.</p>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:11px;color:#3b82f6;font-weight:700;text-transform:uppercase;">Camion</p>
              <p style="margin:0 0 16px;font-size:26px;font-weight:800;color:#1e40af;">${params.truckImmatriculation}</p>
              <p style="margin:0;font-size:14px;color:#374151;">📅 À effectuer le : <strong>${dateStr}</strong></p>
            </div>
            <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">Connectez-vous à TourneePro pour soumettre votre contrôle.</p>
          </div>
        </div>
      </body></html>`,
    });
  }

  async sendInspectionProblemEmail(params: InspectionProblemParams): Promise<void> {
    const dateStr = this.formatDate(params.scheduledDate);
    const itemLabels: Record<string, string> = {
      HUILE: "Niveau d'huile",
      RADIATEUR: 'Eau du radiateur',
      CAISSE_OUTILS: 'Caisse à outils',
      CHARIOT: 'Chariot',
      ROULETTES: 'Roulettes',
      COUVERCLE: 'Couvercle de produit',
    };
    const itemRows = params.problemItems
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;color:#dc2626;font-weight:600;">${itemLabels[i.item] ?? i.item}</td>` +
          `<td style="padding:8px 0 8px 16px;color:#374151;">${i.comment ?? '—'}</td></tr>`,
      )
      .join('');
    await this.send({
      to: params.to,
      subject: `⚠️ Problème signalé — ${params.truckImmatriculation} — ${dateStr}`,
      html: `<!DOCTYPE html><html lang="fr"><body style="font-family:sans-serif;background:#f1f5f9;padding:40px 16px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
          <div style="background:#dc2626;padding:24px 32px;">
            <p style="margin:0;color:#fff;font-size:20px;font-weight:800;">⚠️ TourneePro — Problème signalé</p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 8px;font-size:16px;color:#111827;">Le contrôle de <strong>${params.truckImmatriculation}</strong> du <strong>${dateStr}</strong> signale des anomalies.</p>
            <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Effectué par : ${params.employeeName}</p>
            <table style="width:100%;border-collapse:collapse;">${itemRows}</table>
            ${params.generalComment ? `<div style="margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;"><p style="margin:0;font-size:13px;color:#991b1b;"><strong>Commentaire général :</strong> ${params.generalComment}</p></div>` : ''}
          </div>
        </div>
      </body></html>`,
    });
  }

  async sendRaw(params: { to: string; subject: string; text: string }): Promise<void> {
    await this.send({ to: params.to, subject: params.subject, text: params.text });
  }

  // ── Day Validation emails ──────────────────────────────────────────────────

  async sendDayValidationEmail(params: {
    to: string;
    employeeName: string;
    emailType: 'assigned' | 'repos' | 'unassigned' | 'modified' | 'express';
    date: Date;
    tourCode?: string;
    platformName?: string;
    quai?: string | null;
    horaire?: string | null;
    role?: 'chauffeur' | 'aide';
    partnerName?: string | null;
    expressType?: string;
  }): Promise<void> {
    const firstName = params.employeeName.split(' ')[0];
    const dateStr = this.formatDate(params.date);
    const shortDate = new Date(params.date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });

    const configs = {
      assigned: {
        subject: `Tournée ${params.tourCode} — ${shortDate}`,
        accentColor: '#1d4ed8',
        lightBg: '#eff6ff',
        lightBorder: '#bfdbfe',
        accentText: '#1e40af',
        icon: '🚚',
        headline: `Vous êtes affecté(e) le ${dateStr}`,
        badgeLabel: params.role === 'chauffeur' ? 'Chauffeur-livreur' : 'Aide-livreur',
        body: `Votre mission pour la journée du <strong>${dateStr}</strong> est confirmée.`,
      },
      repos: {
        subject: `Repos — ${shortDate}`,
        accentColor: '#16a34a',
        lightBg: '#f0fdf4',
        lightBorder: '#bbf7d0',
        accentText: '#15803d',
        icon: '✅',
        headline: `Vous êtes en repos le ${dateStr}`,
        badgeLabel: 'Repos',
        body: `Vous n'avez pas de tournée assignée pour le <strong>${dateStr}</strong>.`,
      },
      unassigned: {
        subject: `Désaffectation — ${shortDate}`,
        accentColor: '#d97706',
        lightBg: '#fffbeb',
        lightBorder: '#fde68a',
        accentText: '#b45309',
        icon: '⚠️',
        headline: `Votre affectation du ${dateStr} a changé`,
        badgeLabel: 'Désaffecté(e)',
        body: `Vous n'êtes plus affecté(e) à la tournée <strong>${params.tourCode}</strong> du <strong>${dateStr}</strong>. Contactez votre dispatcher pour plus d'informations.`,
      },
      modified: {
        subject: `Modification — Tournée ${params.tourCode} — ${shortDate}`,
        accentColor: '#7c3aed',
        lightBg: '#f5f3ff',
        lightBorder: '#ddd6fe',
        accentText: '#6d28d9',
        icon: '✏️',
        headline: `Votre mission du ${dateStr} a été modifiée`,
        badgeLabel: 'Modifié(e)',
        body: `Les détails de votre tournée <strong>${params.tourCode}</strong> du <strong>${dateStr}</strong> ont été mis à jour.`,
      },
      express: {
        subject: `Livraison express — ${shortDate}`,
        accentColor: '#d97706',
        lightBg: '#fffbeb',
        lightBorder: '#fde68a',
        accentText: '#92400e',
        icon: '⚡',
        headline: `Vous avez une livraison express le ${dateStr}`,
        badgeLabel: params.expressType === 'GV' ? 'Express GV' : 'Express Standard',
        body: `Vous êtes assigné(e) à une livraison express le <strong>${dateStr}</strong>. Retrouvez les détails directement sur TourneePro.`,
      },
    };

    const cfg = configs[params.emailType];
    const roleLabel =
      params.role === 'chauffeur'
        ? 'Chauffeur-livreur'
        : params.role === 'aide'
          ? 'Aide-livreur'
          : null;
    const partnerLabel = params.role === 'chauffeur' ? 'Aide-livreur' : 'Chauffeur-livreur';

    const detailRows: string[] = [];
    if (params.tourCode && params.emailType !== 'repos') {
      detailRows.push(
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;">🚚 Tournée</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:700;">${params.tourCode}</td></tr>`,
      );
    }
    if (params.platformName) {
      detailRows.push(
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">🏭 Plateforme</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${params.platformName}</td></tr>`,
      );
    }
    if (params.quai) {
      detailRows.push(
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">🚪 Quai</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${params.quai}</td></tr>`,
      );
    }
    if (params.horaire) {
      detailRows.push(
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">⏰ Horaire</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${params.horaire}</td></tr>`,
      );
    }
    if (roleLabel) {
      detailRows.push(
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">👤 Rôle</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${roleLabel}</td></tr>`,
      );
    }
    if (params.partnerName) {
      detailRows.push(
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">👤 ${partnerLabel}</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;">${params.partnerName}</td></tr>`,
      );
    }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr>
          <td style="background:${cfg.accentColor};padding:28px 36px 24px;">
            <p style="margin:0;color:#fff;font-size:22px;font-weight:800;">${cfg.icon}&nbsp; TourneePro</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,.7);font-size:13px;">STP Logistics — Notification dispatcher</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 36px 28px;">
            <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Bonjour, ${firstName}&nbsp;! 👋</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">${cfg.headline}</p>
            ${
              detailRows.length > 0
                ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
              style="background:${cfg.lightBg};border:1px solid ${cfg.lightBorder};border-radius:12px;">
              <tr><td style="padding:20px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${detailRows.join('')}
                </table>
              </td></tr>
            </table>`
                : `
            <div style="background:${cfg.lightBg};border:1px solid ${cfg.lightBorder};border-radius:12px;padding:20px 24px;">
              <p style="margin:0;font-size:15px;color:${cfg.accentText};">${cfg.body}</p>
            </div>`
            }
            ${detailRows.length > 0 ? `<p style="margin:20px 0 0;font-size:15px;color:#374151;">${cfg.body}</p>` : ''}
            <div style="margin-top:24px;">
              <a href="https://tournee.pro" style="display:inline-block;background:${cfg.accentColor};color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
                Voir sur TourneePro →
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              Envoyé automatiquement par <strong style="color:#64748b;">TourneePro</strong> · STP Logistics<br>Ne pas répondre à cet email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await this.send({ to: params.to, subject: cfg.subject, html });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  private buildHtml(p: AssignmentNotificationParams): string {
    const firstName = p.employeeName.split(' ')[0];
    const roleLabel = p.role === 'chauffeur' ? 'Chauffeur-livreur' : 'Aide-livreur';
    const partnerLabel = p.role === 'chauffeur' ? 'Aide-livreur' : 'Chauffeur-livreur';

    const details: Array<{ icon: string; label: string; value: string }> = [
      { icon: '📅', label: 'Date', value: this.formatDate(p.tourDate) },
      { icon: '🏭', label: 'Platform', value: p.platformName },
    ];
    if (p.quai) details.push({ icon: '🚪', label: 'Quai', value: p.quai });
    if (p.horaire) details.push({ icon: '⏰', label: 'Horaire', value: p.horaire });
    if (p.partnerName) details.push({ icon: '👤', label: partnerLabel, value: p.partnerName });
    if (p.truckImmatriculation)
      details.push({ icon: '🚛', label: 'Camion', value: p.truckImmatriculation });

    const detailRows = details
      .map(
        (d) => `
          <tr>
            <td style="padding:10px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top;">
              ${d.icon}&nbsp; <span style="color:#374151;">${d.label}</span>
            </td>
            <td style="padding:10px 0 10px 20px;color:#111827;font-size:14px;font-weight:600;vertical-align:top;">
              ${d.value}
            </td>
          </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Tournée assignée</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f1f5f9;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0"
          style="width:100%;max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1d4ed8;padding:28px 36px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">
                      🚚&nbsp; TourneePro
                    </p>
                    <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">
                      STP Logistics — Notification automatique
                    </p>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;background:rgba(255,255,255,0.18);color:#e0f2fe;font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;white-space:nowrap;">
                      ${roleLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">
                Bonjour, ${firstName}&nbsp;! 👋
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Une tournée vous a été assignée. Voici les détails de votre mission.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#3b82f6;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
                      Tournée assignée
                    </p>
                    <p style="margin:0 0 20px;font-size:30px;font-weight:800;color:#1e40af;letter-spacing:-0.5px;">
                      Tour&nbsp;${p.tourCode}
                    </p>
                    <hr style="border:none;border-top:1px solid #bfdbfe;margin:0 0 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${detailRows}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 4px;font-size:15px;font-weight:600;color:#111827;">
                Bonne route&nbsp;! 🙌
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                Pour toute question, contactez votre dispatcher directement.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
                Cet email a été envoyé automatiquement par
                <strong style="color:#64748b;">TourneePro</strong> · STP Logistics<br>
                Merci de ne pas répondre à cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
