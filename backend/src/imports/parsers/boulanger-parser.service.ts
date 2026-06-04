import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

export interface ParsedTourRow {
  /** Tour number e.g. 804, 702, 502 */
  tourNumber: number;
  /** Derived type from tour number */
  tourType: 'Standard' | 'GV' | 'Mono' | 'Install' | 'Spéciale' | 'Après-midi' | 'SAV' | 'Unknown';
  /** Platform code: F166 or GARONOR */
  platform: 'F166' | 'GARONOR';
  /** Pickup date */
  date: Date;
  /** Pickup time e.g. "7:00", "8:30" */
  horaire: string | null;
  /** Dock number / quai */
  quai: string | null;
  /** Number of parcels */
  nbColis: number | null;
  /** Company (prestataire) name as-is from file */
  prestataire: string;
  /** Truck plate */
  immatriculation: string | null;
  /** Driver / crew name 1 */
  equipage1: string | null;
  /** Driver / crew name 2 */
  equipage2: string | null;
  /** Phone number */
  telephone: string | null;
  /** Source file info for traceability */
  sourceSheet: string;
  sourceRow: number;
}

export interface ParseResult {
  platform: 'F166' | 'GARONOR';
  date: Date;
  allRows: ParsedTourRow[];
  /** Only STP rows */
  stpRows: ParsedTourRow[];
  totalRows: number;
  parseErrors: string[];
}

@Injectable()
export class BoulangerParserService {
  private readonly logger = new Logger(BoulangerParserService.name);

  /**
   * Detect file family and dispatch to the correct parser.
   * For Garonor files, tomorrow's date is calculated internally — no external input needed.
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    this.logger.log(`Sheets found: ${sheetNames.join(', ')}`);

    // ── Alfortville / F166 — detected by sheet name ─────────────────────────
    const alfortSheet = workbook.worksheets.find((ws) =>
      ws.name.toLowerCase().includes('alfortville') ||
      ws.name.toLowerCase().includes('mise à quai alfortville') ||
      ws.name.toLowerCase().includes('f166'),
    );

    if (alfortSheet) {
      return this.parseAlfortville(alfortSheet);
    }

    // ── Garonor — detected by 'Historique' sheet (trim guards whitespace in names)
    // Uses SheetJS for reading (ExcelJS misses rows in files with grouped/hidden rows)
    if (sheetNames.some((n) => n.trim() === 'Historique')) {
      return this.parseGaronor(filePath, this.tomorrowDate());
    }

    throw new BadRequestException(
      `Cannot detect file family. Sheets found: ${sheetNames.slice(0, 8).join(', ')}. ` +
        `Expected an Alfortville sheet name, or a Garonor workbook (must contain a 'Historique' sheet).`,
    );
  }

  /**
   * Returns tomorrow's date at local midnight.
   * Uses local-time arithmetic (new Date → setDate) so getDate() gives the correct
   * day number regardless of server timezone — no UTC/ISO string parsing involved.
   */
  private tomorrowDate(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ─────────────────────────────────────────────
  // ALFORTVILLE (F166) PARSER
  // ─────────────────────────────────────────────

  /**
   * Structure: 1 sheet named "Plan de mise à quai Alfortville"
   * Row 1: Date in col B (index 1)
   * Row 2: Time slot labels at col indices 1, 12, 24, 35
   * Row 3: Headers per block (Quai, TRN, Société, Immat, Contact, Tél, ...)
   * Rows 4-28: Data (25 dock slots per block)
   *
   * 4 horizontal blocks:
   *   7H00   → Quai[1], TRN[2], Société[3], Immat[4], Contact[5], Tél[6], qté[10]
   *   7H30   → Quai[12], TRN[13], Société[14], Immat[15], Contact[16], Tél[17], qté[22]
   *   8H00   → Quai[24], TRN[25], Société[26], Immat[27], Contact[28], Tél[29], qté[33]
   *   08H30  → Quai[35], TRN[36], Société[37], Immat[38], Contact[39], Tél[40], qté[44]
   */
  private parseAlfortville(ws: ExcelJS.Worksheet): ParseResult {
    const errors: string[] = [];
    const allRows: ParsedTourRow[] = [];

    // Row 1: get date from col index 1 (B1)
    const dateRow = ws.getRow(1);
    const rawDate = this.getCellValue(dateRow, 1);
    const date = this.parseDate(rawDate);

    if (!date) {
      errors.push(`Row 1: Cannot parse date from cell B1: ${rawDate}`);
    }

    // Row 2: get time slot labels
    const timeRow = ws.getRow(2);
    const blocks = [
      { colOffset: 1, horaire: this.normalizeTime(this.getCellValue(timeRow, 1)) },
      { colOffset: 12, horaire: this.normalizeTime(this.getCellValue(timeRow, 12)) },
      { colOffset: 24, horaire: this.normalizeTime(this.getCellValue(timeRow, 24)) },
      { colOffset: 35, horaire: this.normalizeTime(this.getCellValue(timeRow, 35)) },
    ];

    this.logger.log(
      `Alfortville date: ${date?.toISOString().split('T')[0]} | blocks: ${blocks.map((b) => b.horaire).join(', ')}`,
    );

    // Rows 4-28 (25 slots per block)
    for (let rowNum = 4; rowNum <= 28; rowNum++) {
      const row = ws.getRow(rowNum);

      for (const block of blocks) {
        const o = block.colOffset;
        // cols: Quai=o, TRN=o+1, Société=o+2, Immat=o+3, Contact=o+4, Tél=o+5, qté=o+9(approx)
        const quaiRaw = this.getCellValue(row, o);
        const trnRaw = this.getCellValue(row, o + 1);
        const societeRaw = this.getCellValue(row, o + 2);
        const immatRaw = this.getCellValue(row, o + 3);
        const contactRaw = this.getCellValue(row, o + 4);
        const telRaw = this.getCellValue(row, o + 5);

        if (!trnRaw && !societeRaw) continue; // Empty slot

        const tourNumber = this.parseTourNumber(trnRaw);
        if (tourNumber === null) continue;

        allRows.push({
          tourNumber,
          tourType: this.deriveTourType(tourNumber, String(societeRaw || '')),
          platform: 'F166',
          date: date || new Date(),
          horaire: block.horaire,
          quai: quaiRaw != null ? String(quaiRaw).trim() : null,
          nbColis: null,
          prestataire: String(societeRaw || '').trim(),
          immatriculation: this.cleanPlate(immatRaw),
          equipage1: contactRaw ? String(contactRaw).trim() : null,
          equipage2: null,
          telephone: telRaw ? this.cleanPhone(String(telRaw)) : null,
          sourceSheet: ws.name,
          sourceRow: rowNum,
        });
      }
    }

    const stpRows = allRows.filter((r) => this.isStp(r.prestataire));
    this.logger.log(
      `Alfortville: ${allRows.length} total rows, ${stpRows.length} STP rows`,
    );

    return {
      platform: 'F166',
      date: date || new Date(),
      allRows,
      stpRows,
      totalRows: allRows.length,
      parseErrors: errors,
    };
  }

  // ─────────────────────────────────────────────
  // GARONOR PARSER  (uses SheetJS — reads every row from raw XML)
  // ─────────────────────────────────────────────

  /**
   * Reads the Garonor file with SheetJS (xlsx package) instead of ExcelJS.
   *
   * ExcelJS builds a sparse internal row map as it processes the worksheet XML.
   * When a sheet has Excel outline groups (collapsible row sections) or hidden rows,
   * ExcelJS can stop updating its map early — causing lastRow / eachRow to cut off
   * at row 64 even though the file contains rows up to 84 or beyond.
   *
   * SheetJS reads the raw <row> XML elements unconditionally and returns a complete
   * 2-D array, so no rows are ever silently dropped.
   *
   * Sheet layout: row 1 = labels, row 2 = date in col B, row 3 = headers, row 4+ = data.
   * Column mapping (0-indexed):
   *   A(0) Quantité · B(1) Horaire · C(2) Quai · D(3) Tournée
   *   E(4) Spécificité · F(5) Prestataires · G(6) Équipage1
   *   H(7) Équipage2  · I(8) Numéro(phone) · J(9) Immatriculation
   */
  private parseGaronor(filePath: string, date: Date): ParseResult {
    const errors: string[] = [];
    const day = date.getDate();
    const sheetName = String(day);

    // Read the whole workbook with SheetJS (cellFormula:false → use cached values)
    const wb = XLSX.readFile(filePath, { cellFormula: false, cellDates: true });

    if (!wb.Sheets[sheetName]) {
      const available = wb.SheetNames
        .filter((n) => /^([1-9]|[12]\d|3[01])$/.test(n.trim()))
        .join(', ');
      throw new BadRequestException(
        `Sheet '${sheetName}' (tomorrow) not found in this Garonor file. ` +
          `Available day sheets: ${available || 'none'}.`,
      );
    }

    // sheet_to_json with header:1 gives a plain 2-D array, defval:null fills empty cells
    const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
    });

    // Row 2 (index 1), col B (index 1) = canonical date stored in the sheet
    const rawSheetDate = grid[1]?.[1];
    const sheetDate = (rawSheetDate instanceof Date ? rawSheetDate : this.parseDate(rawSheetDate)) ?? date;

    this.logger.log(
      `Garonor: sheet '${sheetName}' — ${grid.length} total rows in XML, ` +
        `sheet date: ${sheetDate.toISOString().split('T')[0]}`,
    );

    const allRows: ParsedTourRow[] = [];

    for (let i = 3; i < grid.length; i++) {   // i=3 → Excel row 4 (data start)
      const r = grid[i];
      if (!r) continue;

      const tournee     = r[3]; // col D — skip if null/empty
      const prestataire = r[5]; // col F — skip if null/empty
      if (tournee == null || tournee === '') continue;
      if (prestataire == null || String(prestataire).trim() === '') continue;
      const tourNumber = this.parseTourNumber(tournee);
      if (tourNumber === null) continue;

      const quantite    = r[0]; // A
      const horaire     = r[1]; // B
      // Quai (col C) may be a number (e.g. 17) or a named string (e.g. 'RETOUR A', 'RETOUR B').
      // The Tour.quai field is String? — both forms are stored as strings.
      const quai        = r[2]; // C
      const specificite = r[4]; // E
      const equipage1   = r[6]; // G
      const equipage2   = r[7]; // H
      const telephone   = r[8]; // I
      const immat       = r[9]; // J

      allRows.push({
        tourNumber,
        tourType: this.deriveTourType(tourNumber, String(specificite ?? '')),
        platform: 'GARONOR',
        date: sheetDate,
        horaire: horaire != null ? this.normalizeTime(String(horaire)) : null,
        quai: quai != null ? String(quai).trim() : null,
        nbColis: quantite != null ? this.parseNumber(quantite) : null,
        prestataire: String(prestataire ?? '').trim(),
        immatriculation: this.cleanPlate(immat),
        equipage1: equipage1 != null ? String(equipage1).trim() : null,
        equipage2: equipage2 != null ? String(equipage2).trim() : null,
        telephone: telephone != null ? this.cleanPhone(String(telephone)) : null,
        sourceSheet: sheetName,
        sourceRow: i + 1, // Excel row number (1-indexed)
      });
    }

    const stpRows = allRows.filter((r) => this.isStp(r.prestataire));
    this.logger.log(
      `Garonor sheet '${sheetName}': ${allRows.length} rows total, ${stpRows.length} STP`,
    );

    return {
      platform: 'GARONOR',
      date: sheetDate,
      allRows,
      stpRows,
      totalRows: allRows.length,
      parseErrors: errors,
    };
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  /** Derive tour type from tour number range + Spécificité/Société text */
  private deriveTourType(
    tourNumber: number,
    specificite: string,
  ): ParsedTourRow['tourType'] {
    const spec = specificite.toUpperCase();

    if (spec.includes('SPÉCIALE') || spec.includes('SPECIALE') || spec.includes('SPC')) return 'Spéciale';
    if (spec.includes('APRÈS') || spec.includes('APRES') || spec.includes('MIDI')) return 'Après-midi';
    if (spec.includes('SAV')) return 'SAV';
    if (spec.includes('INSTALL')) return 'Install';
    if (spec.includes('MONO')) return 'Mono';
    if (spec.includes('GV') || spec.includes('GRAND VOLUME')) return 'GV';
    if (spec.includes('STANDARD')) return 'Standard';

    // Fall back to number range
    if (tourNumber >= 500 && tourNumber <= 599) return 'Install';
    if (tourNumber >= 600 && tourNumber <= 699) return 'Mono';
    if (tourNumber >= 700 && tourNumber <= 799) return 'GV';
    if (tourNumber >= 800 && tourNumber <= 899) return 'Standard';
    if (tourNumber >= 250 && tourNumber <= 299) return 'Après-midi';

    return 'Unknown';
  }

  /**
   * STP filter: company name contains "STP" (case insensitive, exact word)
   * Handles: STP, STP-GV, STP_GV 1, STP-INSTALL, STP 1, STP_Mono, etc.
   */
  isStp(prestataire: string): boolean {
    if (!prestataire) return false;
    return prestataire.toUpperCase().includes('STP');
  }

  private parseTourNumber(raw: unknown): number | null {
    if (raw == null) return null;
    const n = Number(raw);
    if (isNaN(n) || n <= 0 || n > 9999) return null;
    return Math.round(n);
  }

  private parseNumber(raw: unknown): number | null {
    if (raw == null) return null;
    const n = Number(raw);
    return isNaN(n) ? null : Math.round(n);
  }

  private parseDate(raw: unknown): Date | null {
    if (!raw) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const d = new Date(raw as string);
    return isNaN(d.getTime()) ? null : d;
  }

  private normalizeTime(raw: unknown): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    // Normalize "7H00" → "7:00", "08h30" → "8:30", "7:00" → "7:00"
    const match = s.match(/(\d{1,2})[Hh:](\d{2})/);
    if (match) return `${parseInt(match[1], 10)}:${match[2]}`;
    return s || null;
  }

  private cleanPlate(raw: unknown): string | null {
    if (!raw) return null;
    return String(raw).trim().toUpperCase().replace(/\s+/g, '-') || null;
  }

  private cleanPhone(raw: string): string | null {
    if (!raw) return null;
    // Remove scientific notation artifacts (e.g., 7.80029663e8 → 780029663)
    const num = Number(raw);
    if (!isNaN(num) && num > 1e8) {
      return String(Math.round(num));
    }
    return raw.trim() || null;
  }

  private getCellValue(row: ExcelJS.Row, colIndex: number): unknown {
    const cell = row.getCell(colIndex + 1); // ExcelJS is 1-indexed
    const val = cell.value;
    if (val === null || val === undefined) return null;
    // Handle rich text
    if (typeof val === 'object' && 'richText' in (val as any)) {
      return (val as any).richText.map((r: any) => r.text).join('');
    }
    // Handle formula result
    if (typeof val === 'object' && 'result' in (val as any)) {
      return (val as any).result;
    }
    return val;
  }
}
