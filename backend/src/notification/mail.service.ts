import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('MAIL_HOST');
    if (!host) {
      this.logger.warn('MAIL_HOST not set — email notifications are disabled');
      return;
    }

    const port = Number(this.config.get<string>('MAIL_PORT') ?? '587');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });

    this.logger.log(`SMTP configured: ${host}:${port}`);
  }

  async sendAssignmentNotification(params: AssignmentNotificationParams): Promise<void> {
    if (!this.transporter) {
      this.logger.debug('Email skipped — SMTP not configured');
      return;
    }

    const from =
      this.config.get<string>('MAIL_FROM') ?? 'noreply@tourneepro.fr';

    const subject = `Tournée ${params.tourCode} assignée — ${this.formatDate(params.tourDate)}`;

    await this.transporter.sendMail({
      from,
      to: params.to,
      subject,
      html: this.buildHtml(params),
    });

    this.logger.log(
      `Assignment email sent to ${params.to} (tour ${params.tourCode})`,
    );
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
    const roleLabel =
      p.role === 'chauffeur' ? 'Chauffeur-livreur' : 'Aide-livreur';
    const partnerLabel =
      p.role === 'chauffeur' ? 'Aide-livreur' : 'Chauffeur-livreur';

    const details: Array<{ icon: string; label: string; value: string }> = [
      { icon: '📅', label: 'Date', value: this.formatDate(p.tourDate) },
      { icon: '🏭', label: 'Platform', value: p.platformName },
    ];
    if (p.quai) details.push({ icon: '🚪', label: 'Quai', value: p.quai });
    if (p.horaire)
      details.push({ icon: '⏰', label: 'Horaire', value: p.horaire });
    if (p.partnerName)
      details.push({ icon: '👤', label: partnerLabel, value: p.partnerName });
    if (p.truckImmatriculation)
      details.push({
        icon: '🚛',
        label: 'Camion',
        value: p.truckImmatriculation,
      });

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

        <!-- Card wrapper -->
        <table role="presentation" cellpadding="0" cellspacing="0"
          style="width:100%;max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;
                 box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- ── Header ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background:#1d4ed8;padding:28px 36px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;
                               letter-spacing:-0.3px;">
                      🚚&nbsp; TourneePro
                    </p>
                    <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">
                      STP Logistics — Notification automatique
                    </p>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;background:rgba(255,255,255,0.18);
                                 color:#e0f2fe;font-size:12px;font-weight:700;
                                 padding:5px 14px;border-radius:20px;white-space:nowrap;">
                      ${roleLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Body ──────────────────────────────────────────────────── -->
          <tr>
            <td style="padding:36px 36px 28px;">

              <!-- Greeting -->
              <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">
                Bonjour, ${firstName}&nbsp;! 👋
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Une tournée vous a été assignée. Voici les détails de votre mission.
              </p>

              <!-- Tour card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;">
                <tr>
                  <td style="padding:24px 28px;">

                    <!-- Tour code -->
                    <p style="margin:0 0 4px;font-size:12px;color:#3b82f6;
                               font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
                      Tournée assignée
                    </p>
                    <p style="margin:0 0 20px;font-size:30px;font-weight:800;color:#1e40af;
                               letter-spacing:-0.5px;">
                      Tour&nbsp;${p.tourCode}
                    </p>

                    <!-- Divider -->
                    <hr style="border:none;border-top:1px solid #bfdbfe;margin:0 0 16px;">

                    <!-- Detail rows -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${detailRows}
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Closing -->
              <p style="margin:28px 0 4px;font-size:15px;font-weight:600;color:#111827;">
                Bonne route&nbsp;! 🙌
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                Pour toute question, contactez votre dispatcher directement.
              </p>

            </td>
          </tr>

          <!-- ── Footer ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                       padding:16px 36px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;
                         line-height:1.6;">
                Cet email a été envoyé automatiquement par
                <strong style="color:#64748b;">TourneePro</strong>
                · STP Logistics<br>
                Merci de ne pas répondre à cet email.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card wrapper -->

      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
