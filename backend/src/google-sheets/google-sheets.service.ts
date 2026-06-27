import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import { SystemConfigService } from '../system-config/system-config.service';
import { BoulangerParserService } from '../imports/parsers/boulanger-parser.service';
import { PrismaService } from '../prisma/prisma.service';

const KEYS = {
  refreshToken: 'google.refresh_token',
  connectedEmail: 'google.connected_email',
  sheet1Url: 'sheets.url_1',
  sheet2Url: 'sheets.url_2',
  exportSheetId: 'sheets.export_sheet_id',
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
    const state = randomBytes(16).toString('hex');
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
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
            range: `'${alfortSheetName}'!A1:AO28`,
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
                range: `'${joursFerriesName}'!A1:AO28`,
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

  // ── Export ──────────────────────────────────────────────────────────────────

  async checkAffectations(dateStr: string): Promise<{ warnings: string[] }> {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const tours = await this.prisma.tour.findMany({
      where: { date: { gte: date, lt: nextDay } },
      include: {
        platform: true,
        assignments: { include: { chauffeur: true, aide: true, truck: true } },
      },
    });

    const warnings: string[] = [];
    for (const tour of tours) {
      const assignment = tour.assignments[0] ?? null;
      const label = `Tournée ${tour.tourCode} (${tour.platform?.name ?? ''})`;
      if (!tour.horaire) warnings.push(`${label} : heure manquante`);
      if (!assignment?.truck && !tour.immatriculation)
        warnings.push(`${label} : immatriculation manquante`);
      if (!assignment?.chauffeur) warnings.push(`${label} : chauffeur non assigné`);
    }

    return { warnings };
  }

  private buildDisplayName(
    emp: { name: string; firstName: string | null; lastName: string | null },
    firstNameCounts: Map<string, number>,
  ): string {
    const firstName = emp.firstName ?? emp.name.split(' ')[0];
    const key = firstName.toLowerCase();
    if ((firstNameCounts.get(key) ?? 1) > 1) {
      const ln = emp.lastName ?? emp.name.split(' ').slice(1).join(' ');
      const abbr = ln.substring(0, 2).toLowerCase();
      return abbr ? `${firstName} ${abbr}` : firstName;
    }
    return firstName;
  }

  async exportAffectations(dateStr: string): Promise<{ url: string }> {
    const refreshToken = await this.systemConfig.get(KEYS.refreshToken);
    if (!refreshToken) {
      throw new ServiceUnavailableException(
        'Google account not connected. Go to Settings → Google Sheets to connect.',
      );
    }

    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const sheetsApi = google.sheets({ version: 'v4', auth: client });

    // Get or create the persistent export sheet
    let spreadsheetId = await this.systemConfig.get(KEYS.exportSheetId);
    let sheetTabId = 0;
    let sheetTabName = 'Sheet1';

    if (!spreadsheetId) {
      const created = await sheetsApi.spreadsheets.create({
        requestBody: { properties: { title: 'TourneePro — Affectations STP' } },
      });
      spreadsheetId = created.data.spreadsheetId!;
      sheetTabId = created.data.sheets?.[0]?.properties?.sheetId ?? 0;
      sheetTabName = created.data.sheets?.[0]?.properties?.title ?? 'Sheet1';
      await this.systemConfig.set(KEYS.exportSheetId, spreadsheetId);
      this.logger.log(`Export sheet created: ${spreadsheetId}`);
    } else {
      const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
      sheetTabId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;
      sheetTabName = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';
    }

    // Query all tours for the given date with full assignment data
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const tours = await this.prisma.tour.findMany({
      where: { date: { gte: date, lt: nextDay } },
      include: {
        platform: true,
        assignments: {
          include: { chauffeur: true, aide: true, truck: true },
        },
      },
      orderBy: [{ tourCode: 'asc' }],
    });

    // Group by platform, Alfortville first then Garonor
    const byPlatform = new Map<string, typeof tours>();
    for (const tour of tours) {
      const name = tour.platform?.name ?? 'Autre';
      if (!byPlatform.has(name)) byPlatform.set(name, []);
      byPlatform.get(name)!.push(tour);
    }
    const PLATFORM_ORDER = ['Alfortville', 'Garonor'];
    const sortedPlatforms = [...byPlatform.keys()].sort((a, b) => {
      const ai = PLATFORM_ORDER.indexOf(a);
      const bi = PLATFORM_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const dateLabel = date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    // ── Repos employees: active employees with no tour assignment today ─────────
    const assignedIds = new Set<string>();
    for (const tour of tours) {
      const a = tour.assignments[0];
      if (a?.chauffeurId) assignedIds.add(a.chauffeurId);
      if (a?.aideId) assignedIds.add(a.aideId);
    }

    const allActive = await this.prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true, firstName: true, lastName: true, role: true },
    });
    const reposEmps = allActive.filter((e) => !assignedIds.has(e.id));
    const reposEmpIds = new Set(reposEmps.map((e) => e.id));

    // Look at yesterday's assignments to group repos employees by their pairing
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayAssignments =
      reposEmps.length > 0
        ? await this.prisma.assignment.findMany({
            where: {
              tour: { date: { gte: yesterday, lt: date } },
              OR: [
                { chauffeurId: { in: reposEmps.map((e) => e.id) } },
                { aideId: { in: reposEmps.map((e) => e.id) } },
              ],
            },
            include: {
              chauffeur: true,
              aide: true,
              truck: true,
              tour: { include: { platform: true } },
            },
          })
        : [];

    // Flat repos rows list — one entry per display row (no platform grouping)
    type ReposEmp = (typeof reposEmps)[number];
    type ReposRow = { emps: ReposEmp[]; truck: string };
    const reposRows: ReposRow[] = [];
    const processedReposIds = new Set<string>();

    for (const ya of yesterdayAssignments) {
      const emps = [
        ya.chauffeurId && reposEmpIds.has(ya.chauffeurId) && !processedReposIds.has(ya.chauffeurId)
          ? reposEmps.find((e) => e.id === ya.chauffeurId)
          : null,
        ya.aideId && reposEmpIds.has(ya.aideId) && !processedReposIds.has(ya.aideId)
          ? reposEmps.find((e) => e.id === ya.aideId)
          : null,
      ].filter(Boolean) as ReposEmp[];

      if (emps.length > 0) {
        emps.forEach((e) => processedReposIds.add(e.id));
        reposRows.push({ emps, truck: ya.truck?.immatriculation ?? '' });
      }
    }

    // Remaining (no yesterday match) — zip chauffeurs with aides for clean CHAUFFEUR+AIDE pairs
    const unmatched = reposEmps.filter((e) => !processedReposIds.has(e.id));
    const unmatchedChauffeurs = unmatched.filter((e) => e.role.toUpperCase() === 'CHAUFFEUR');
    const unmatchedAides = unmatched.filter((e) => e.role.toUpperCase() !== 'CHAUFFEUR');
    for (let i = 0; i < Math.max(unmatchedChauffeurs.length, unmatchedAides.length); i++) {
      const pair = [unmatchedChauffeurs[i], unmatchedAides[i]].filter(Boolean) as ReposEmp[];
      if (pair.length > 0) reposRows.push({ emps: pair, truck: '' });
    }

    // ── First-name frequency map (tours + repos) for smart name display ────────
    const firstNameCounts = new Map<string, number>();
    for (const tour of tours) {
      const assignment = tour.assignments[0] ?? null;
      for (const emp of [assignment?.chauffeur, assignment?.aide]) {
        if (!emp) continue;
        const fn = (emp.firstName ?? emp.name.split(' ')[0]).toLowerCase();
        firstNameCounts.set(fn, (firstNameCounts.get(fn) ?? 0) + 1);
      }
    }
    for (const emp of reposEmps) {
      const fn = (emp.firstName ?? emp.name.split(' ')[0]).toLowerCase();
      firstNameCounts.set(fn, (firstNameCounts.get(fn) ?? 0) + 1);
    }

    // Colors (Google Sheets API uses 0-1 scale)
    const C = {
      orange: { red: 1, green: 0.6, blue: 0 },
      amber: { red: 1, green: 0.76, blue: 0.03 }, // REPOS section header
      cyan: { red: 0, green: 0.9, blue: 1 },
      cyanDark: { red: 0, green: 0.6, blue: 0.8 }, // QUAI column
      yellow: { red: 1, green: 1, blue: 0 },
      green: { red: 0, green: 0.85, blue: 0 },
      white: { red: 1, green: 1, blue: 1 },
    };

    const COLS = 5;
    const values: string[][] = [];
    const requests: any[] = [];

    const addMerge = (rowIndex: number) =>
      requests.push({
        mergeCells: {
          range: {
            sheetId: sheetTabId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: COLS,
          },
          mergeType: 'MERGE_ALL',
        },
      });

    const colorRow = (rowIndex: number, color: object, bold = false, fontSize = 11) =>
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetTabId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: COLS,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: color,
              textFormat: { bold, fontSize },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

    const colorCell = (rowIndex: number, colIndex: number, color: object, bold = false) =>
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetTabId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: color,
              textFormat: { bold },
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });

    // Title row
    values.push(['STP', '', '', '', '']);
    addMerge(0);
    colorRow(0, C.orange, true, 14);

    for (const platformName of sortedPlatforms) {
      const platformTours = byPlatform.get(platformName)!;

      const platformRow = values.length;
      values.push([`PLATE-FORME ${platformName.toUpperCase()}`, '', '', '', '']);
      addMerge(platformRow);
      colorRow(platformRow, C.cyan, true, 12);

      const dateRow = values.length;
      values.push([dateLabel, '', '', '', '']);
      addMerge(dateRow);
      colorRow(dateRow, C.cyan, false, 11);

      const headerRow = values.length;
      values.push(['QUAI', 'TOURNEE', 'HEURE', 'IMMATRICULATION', 'NOM DU LIVREUR']);
      colorRow(headerRow, C.cyan, true, 11);

      for (const tour of platformTours) {
        const assignment = tour.assignments[0] ?? null;
        const quai = tour.quai ?? '';
        const heure = tour.horaire ?? '';
        const immat = assignment?.truck?.immatriculation ?? tour.immatriculation ?? '';
        const nomParts = [assignment?.chauffeur, assignment?.aide]
          .filter(Boolean)
          .map((emp) => this.buildDisplayName(emp!, firstNameCounts));
        const nom = nomParts.join('+');

        const dataRow = values.length;
        values.push([quai, tour.tourCode, heure, immat, nom]);

        // All data cells always get their color — never white even when empty
        colorCell(dataRow, 0, C.cyanDark);
        colorCell(dataRow, 1, C.yellow);
        colorCell(dataRow, 2, C.green);
        colorCell(dataRow, 3, C.yellow);
        colorCell(dataRow, 4, C.yellow);
      }

      // Repos rows for this platform
      // Separator row between platforms — cyan to match theme
      const sepRow = values.length;
      values.push(['', '', '', '', '']);
      colorRow(sepRow, C.cyan);
    }

    // ── Dedicated REPOS section — all repos employees, after all platforms ──────
    if (reposRows.length > 0) {
      const reposTitleRow = values.length;
      values.push(['REPOS', '', '', '', '']);
      addMerge(reposTitleRow);
      colorRow(reposTitleRow, C.amber, true, 12);

      const reposColRow = values.length;
      values.push(['QUAI', 'TOURNEE', 'HEURE', 'IMMATRICULATION', 'NOM DU LIVREUR']);
      colorRow(reposColRow, C.amber, true, 11);

      for (const row of reposRows) {
        const displayNames = row.emps
          .map((emp) => this.buildDisplayName(emp, firstNameCounts))
          .join('+');
        const rRow = values.length;
        values.push(['', '', 'repos', row.truck, displayNames]);
        colorCell(rRow, 0, C.cyanDark);
        colorCell(rRow, 1, C.yellow);
        colorCell(rRow, 2, C.green);
        colorCell(rRow, 3, C.yellow);
        colorCell(rRow, 4, C.yellow);
      }
    }

    // Prepend: 1) unmerge all, 2) reset every cell to white — ensures no leftover colors
    const fullRange = {
      sheetId: sheetTabId,
      startRowIndex: 0,
      endRowIndex: 1000,
      startColumnIndex: 0,
      endColumnIndex: COLS,
    };
    const cleanupRequests = [
      { unmergeCells: { range: fullRange } },
      {
        repeatCell: {
          range: fullRange,
          cell: {
            userEnteredFormat: {
              backgroundColor: C.white,
              textFormat: { bold: false },
              horizontalAlignment: 'LEFT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      },
    ];
    const allRequests = [...cleanupRequests, ...requests];

    // Clear old content
    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId,
      range: sheetTabName,
    });

    // Write values
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    // Column widths: QUAI | TOURNEE | HEURE | IMMATRICULATION | NOM DU LIVREUR
    const colWidths = [90, 110, 110, 170, 220];
    colWidths.forEach((pixelSize, i) =>
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: sheetTabId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize },
          fields: 'pixelSize',
        },
      }),
    );

    // Apply formatting + merges + column widths (cleanup requests run first)
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: allRequests },
    });

    this.logger.log(`Exported ${tours.length} tours for ${dateStr} to sheet ${spreadsheetId}`);
    return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private extractSheetId(url: string): string | null {
    const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  }
}
