import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { SystemConfigService } from '../system-config/system-config.service';
import { BoulangerParserService } from '../imports/parsers/boulanger-parser.service';
import { PrismaService } from '../prisma/prisma.service';

const KEYS = {
  refreshToken: 'google.refresh_token',
  connectedEmail: 'google.connected_email',
  sheet1Url: 'sheets.url_1',
  sheet2Url: 'sheets.url_2',
} as const;

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  sheets: { name: string; platform: string; stpRows: number }[];
}

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly parser: BoulangerParserService,
    private readonly prisma: PrismaService,
  ) {}

  // ── OAuth helpers ───────────────────────────────────────────────────────────

  private createOAuthClient() {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  getAuthUrl(): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  async handleCallback(code: string): Promise<{ email: string }> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'No refresh token received. Please revoke app access at myaccount.google.com/permissions and try again.',
      );
    }

    client.setCredentials(tokens);

    // Fetch account email
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? 'unknown';

    await this.systemConfig.set(KEYS.refreshToken, tokens.refresh_token);
    await this.systemConfig.set(KEYS.connectedEmail, email);

    this.logger.log(`Google account connected: ${email}`);
    return { email };
  }

  async getStatus() {
    const cfg = await this.systemConfig.getMany([
      KEYS.refreshToken,
      KEYS.connectedEmail,
      KEYS.sheet1Url,
      KEYS.sheet2Url,
    ]);

    return {
      connected: !!cfg[KEYS.refreshToken],
      email: cfg[KEYS.connectedEmail] ?? null,
      sheet1Url: cfg[KEYS.sheet1Url] ?? null,
      sheet2Url: cfg[KEYS.sheet2Url] ?? null,
    };
  }

  async disconnect(): Promise<void> {
    await this.systemConfig.delete(KEYS.refreshToken);
    await this.systemConfig.delete(KEYS.connectedEmail);
    this.logger.log('Google account disconnected');
  }

  async saveSheetUrls(url1: string, url2: string): Promise<void> {
    await this.systemConfig.set(KEYS.sheet1Url, url1.trim());
    await this.systemConfig.set(KEYS.sheet2Url, url2.trim());
  }

  // ── Sync ────────────────────────────────────────────────────────────────────

  async syncFromSheets(): Promise<SyncResult> {
    const refreshToken = await this.systemConfig.get(KEYS.refreshToken);
    if (!refreshToken) {
      throw new ServiceUnavailableException(
        'Google account not connected. Go to Settings → Google Sheets to connect.',
      );
    }

    const sheet1Url = await this.systemConfig.get(KEYS.sheet1Url);
    const sheet2Url = await this.systemConfig.get(KEYS.sheet2Url);
    const urls = [sheet1Url, sheet2Url].filter(Boolean) as string[];

    if (urls.length === 0) {
      throw new BadRequestException(
        'No sheet URLs configured. Go to Settings → Google Sheets to add them.',
      );
    }

    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const sheetsApi = google.sheets({ version: 'v4', auth: client });

    const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [], sheets: [] };

    for (const url of urls) {
      const sheetId = this.extractSheetId(url);
      if (!sheetId) {
        result.errors.push(`Invalid sheet URL: ${url}`);
        continue;
      }

      try {
        this.logger.log(`Fetching sheet metadata ${sheetId}...`);

        // Get sheet names to detect platform
        const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: sheetId });
        const sheetNames = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '');

        let parsed;

        // Detect Alfortville by sheet name
        const alfortSheetName = sheetNames.find(
          (n) =>
            n.toLowerCase().includes('alfortville') ||
            n.toLowerCase().includes('mise à quai alfortville') ||
            n.toLowerCase().includes('f166'),
        );

        if (alfortSheetName) {
          // Fetch main Alfortville sheet
          const res = await sheetsApi.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${alfortSheetName}'!A1:AK28`,
            valueRenderOption: 'UNFORMATTED_VALUE',
          });
          const grid: any[][] = res.data.values ?? [];
          parsed = this.parser.parseAlfortvilleGrid(grid, alfortSheetName);

          // Also parse "Jours Fériés /Dimanche" sheet if present — used on Sundays and holidays
          const joursFerriesName = sheetNames.find((n) => {
            const l = n.toLowerCase();
            return l.includes('jours') && (l.includes('rie') || l.includes('dimanche'));
          });
          if (joursFerriesName) {
            this.logger.log(`Parsing Jours Fériés/Dimanche sheet: ${joursFerriesName}`);
            try {
              const resJF = await sheetsApi.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: `'${joursFerriesName}'!A1:AK28`,
                valueRenderOption: 'UNFORMATTED_VALUE',
              });
              const gridJF: any[][] = resJF.data.values ?? [];
              const parsedJF = this.parser.parseAlfortvilleGrid(gridJF, joursFerriesName);
              this.logger.log(
                `Jours Fériés dates: ${parsedJF.stpRows.map((r) => r.dateStr).join(', ')}`,
              );
              // Merge STP rows from both sheets — deduplicate by tourCode
              const existingCodes = new Set(parsed.stpRows.map((r) => String(r.tourNumber)));
              const newRows = parsedJF.stpRows.filter(
                (r) => !existingCodes.has(String(r.tourNumber)),
              );
              parsed = {
                ...parsed,
                allRows: [...parsed.allRows, ...parsedJF.allRows],
                stpRows: [...parsed.stpRows, ...newRows],
                totalRows: parsed.totalRows + parsedJF.totalRows,
              };
              this.logger.log(`Jours Fériés/Dimanche: ${parsedJF.stpRows.length} STP rows merged`);
            } catch (e: any) {
              this.logger.warn(`Could not parse Jours Fériés sheet: ${e.message}`);
            }
          }
        } else if (sheetNames.some((n) => n.trim() === 'Historique')) {
          // Garonor — fetch tomorrow's day sheet
          const tomorrow = this.parser.tomorrowDate();
          const day = tomorrow.getDate();
          const res = await sheetsApi.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${day}'!A:J`,
            valueRenderOption: 'UNFORMATTED_VALUE',
          });
          const grid: any[][] = res.data.values ?? [];
          parsed = this.parser.parseGaronorGrid(grid, String(day), tomorrow, []);
        } else {
          throw new Error(
            `Cannot detect platform. Sheet names: ${sheetNames.slice(0, 5).join(', ')}`,
          );
        }

        this.logger.log(`Parsed ${parsed.platform}: ${parsed.stpRows.length} STP rows`);

        result.sheets.push({
          name: url,
          platform: parsed.platform,
          stpRows: parsed.stpRows.length,
        });

        // Upsert tours from STP rows
        for (const row of parsed.stpRows) {
          if (!row.tourNumber || !row.dateStr || !row.platform) {
            result.skipped++;
            continue;
          }

          try {
            const tourDate = new Date(row.dateStr + 'T00:00:00.000Z');

            const platformName =
              row.platform === 'F166'
                ? 'Alfortville'
                : row.platform === 'GARONOR'
                  ? 'Garonor'
                  : row.platform;

            const platform = await this.prisma.platform.upsert({
              where: { code: row.platform },
              update: {},
              create: { code: row.platform, name: platformName },
            });

            const existing = await this.prisma.tour.findFirst({
              where: {
                tourCode: String(row.tourNumber),
                date: tourDate,
                platformId: platform.id,
              },
            });

            if (existing) {
              await this.prisma.tour.update({
                where: { id: existing.id },
                data: {
                  tourType: row.tourType ?? existing.tourType,
                  horaire: row.horaire ?? existing.horaire,
                  quai: row.quai ?? existing.quai,
                  nbColis: row.nbColis ?? existing.nbColis,
                  prestataire: row.prestataire ?? existing.prestataire,
                  immatriculation: row.immatriculation ?? existing.immatriculation,
                },
              });
              result.updated++;
            } else {
              await this.prisma.tour.create({
                data: {
                  tourCode: String(row.tourNumber),
                  tourType: row.tourType ?? null,
                  date: tourDate,
                  platformId: platform.id,
                  status: 'imported',
                  horaire: row.horaire ?? null,
                  quai: row.quai ?? null,
                  nbColis: row.nbColis ?? null,
                  prestataire: row.prestataire ?? null,
                  immatriculation: row.immatriculation ?? null,
                },
              });
              result.created++;
            }
          } catch (err: any) {
            result.errors.push(`Tour ${row.tourNumber}: ${err.message}`);
          }
        }
      } catch (err: any) {
        const detail = err?.response?.data?.error?.message ?? err?.response?.data ?? err.message;
        this.logger.error(`Failed to sync sheet ${sheetId}: ${JSON.stringify(detail)}`);
        result.errors.push(`Sheet ${sheetId}: ${JSON.stringify(detail)}`);
      }
    }

    this.logger.log(
      `Sync complete — created: ${result.created}, updated: ${result.updated}, skipped: ${result.skipped}`,
    );

    return result;
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private extractSheetId(url: string): string | null {
    const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  }
}
