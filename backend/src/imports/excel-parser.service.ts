import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ParsedRow {
  rowIndex: number;
  sheetName: string;
  rawData: Record<string, any>;
  parsedData?: {
    tourCode?: string;
    date?: string;
    platform?: string;
    transporteur?: string;
    chauffeur?: string;
    aide?: string;
    phone?: string;
    truck?: string;
    tourType?: string;
    quai?: number;
    quantity?: number;
    horaire?: string;
  };
  status: 'parsed' | 'error';
  errorMessage?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  totalRows: number;
  parsedRows: number;
  errorRows: number;
}

@Injectable()
export class ExcelParserService {
  private readonly logger = new Logger(ExcelParserService.name);

  /**
   * Helper: extract the real value from an ExcelJS cell
   * (handles formula cells, Date objects, plain values)
   */
  private getCellValue(cell: ExcelJS.Cell): any {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && 'result' in v) return (v as any).result;
    if (typeof v === 'object' && 'text' in v) return (v as any).text;
    if (v instanceof Date) return v;
    return v;
  }

  /**
   * Format a date value to ISO string (YYYY-MM-DD)
   */
  private formatDate(val: any): string | undefined {
    if (!val) return undefined;
    try {
      const d = val instanceof Date ? val : new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { /* ignore */ }
    return undefined;
  }

  async parseExcelFile(filePath: string): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Detect file type by sheet names
    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    this.logger.log(`File sheets: ${sheetNames.join(', ')}`);

    const isGaronor = sheetNames.some((n) => /^\d+$/.test(n)); // numbered sheets 1-31
    const isAlfortville = sheetNames.some((n) =>
      n.toLowerCase().includes('alfortville'),
    );

    if (isGaronor) {
      this.logger.log('Detected format: GARONOR (numbered day sheets)');
      return this.parseGaronor(workbook);
    } else if (isAlfortville) {
      this.logger.log('Detected format: ALFORTVILLE (single/multi layout sheet)');
      return this.parseAlfortville(workbook);
    } else {
      this.logger.warn('Unknown file format â€” attempting generic parse');
      return this.parseGaronor(workbook); // fallback
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // GARONOR FORMAT
  //
  // Structure: sheets named "1" to "31" (one per day of month)
  // Each sheet:
  //   Row 1: ["Contact", "Plan de mise Ã  quai", ...]
  //   Row 2: [contact_info, date, date, ...]   â† date is in col B (index 2)
  //   Row 3: ["QuantitÃ©","Horaire","Quai","TournÃ©e","SpÃ©cificitÃ©","Prestataires","Ã‰quipages","Ã‰quipages","NumÃ©ro","Immatriculation"]
  //           col:  1        2       3      4           5              6              7           8          9         10
  //   Row 4+: actual data rows
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async parseGaronor(workbook: ExcelJS.Workbook): Promise<ParseResult> {
    const rows: ParsedRow[] = [];
    let totalRows = 0;
    let parsedRows = 0;
    let errorRows = 0;

    workbook.eachSheet((ws) => {
      const sheetName = ws.name;

      // Only process numbered day sheets (1-31)
      if (!/^\d+$/.test(sheetName)) return;

      // Get date from row 2 col B (index 2)
      const dateRow = ws.getRow(2);
      const dateVal = this.getCellValue(dateRow.getCell(2));
      const sheetDate = this.formatDate(dateVal);

      if (!sheetDate) {
        this.logger.warn(`Sheet ${sheetName}: no valid date in R2C2, skipping`);
        return;
      }

      this.logger.log(`Sheet [${sheetName}] â†’ date: ${sheetDate}`);

      // Data starts at row 4 (row 3 is header)
      // Column mapping (1-based):
      // 1=QuantitÃ©, 2=Horaire, 3=Quai, 4=TournÃ©e, 5=SpÃ©cificitÃ©,
      // 6=Prestataires, 7=Ã‰quipages(chauffeur), 8=Ã‰quipages(aide),
      // 9=NumÃ©ro(phone), 10=Immatriculation
      for (let rowNum = 4; rowNum <= ws.rowCount; rowNum++) {
        const row = ws.getRow(rowNum);

        const quantity  = this.getCellValue(row.getCell(1));
        const horaire   = this.getCellValue(row.getCell(2));
        const quai      = this.getCellValue(row.getCell(3));
        const tournee   = this.getCellValue(row.getCell(4));
        const specificite = this.getCellValue(row.getCell(5));
        const prestataire = this.getCellValue(row.getCell(6));
        const chauffeur = this.getCellValue(row.getCell(7));
        const aide      = this.getCellValue(row.getCell(8));
        const phone     = this.getCellValue(row.getCell(9));
        const immat     = this.getCellValue(row.getCell(10));

        // Skip rows without a tour number
        if (tournee === null || isNaN(Number(tournee))) continue;

        totalRows++;

        try {
          rows.push({
            rowIndex: rowNum,
            sheetName,
            rawData: { quantity, horaire, quai, tournee, specificite, prestataire, chauffeur, aide, phone, immat, date: sheetDate },
            parsedData: {
              tourCode:     String(tournee),
              date:         sheetDate,
              platform:     'GARONOR',
              transporteur: prestataire ? String(prestataire).trim() : undefined,
              chauffeur:    chauffeur   ? String(chauffeur).trim()   : undefined,
              aide:         aide        ? String(aide).trim()        : undefined,
              phone:        phone       ? String(phone)              : undefined,
              truck:        immat       ? String(immat).trim()       : undefined,
              tourType:     specificite ? String(specificite).trim() : undefined,
              quai:         quai        ? Number(quai)               : undefined,
              quantity:     quantity    ? Number(quantity)           : undefined,
              horaire:      horaire     ? String(horaire)            : undefined,
            },
            status: 'parsed',
          });
          parsedRows++;
        } catch (err) {
          rows.push({
            rowIndex: rowNum,
            sheetName,
            rawData: { tournee, prestataire },
            status: 'error',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
          });
          errorRows++;
        }
      }
    });

    this.logger.log(`GARONOR parse complete: ${totalRows} rows scanned, ${parsedRows} parsed, ${errorRows} errors`);
    return { rows, totalRows, parsedRows, errorRows };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ALFORTVILLE FORMAT
  //
  // Structure: one main sheet "Plan de mise Ã  quai Alfortville"
  //   (plus holiday sheets like " Jours FÃ©riÃ©s Dimanche" with same layout)
  // Each sheet is a WIDE layout with TWO column groups side by side:
  //   LEFT GROUP (cols 1-11):
  //     Row 1: [null, date...]
  //     Row 2: [null, horaire...]
  //     Row 3: [null, "Quai","TRN","SociÃ©tÃ©","Immat","Contact Equipage","TÃ©l Ã‰quipe","DEEE","ID","EPI","qtÃ©"]
  //     Row 4+: [slot#, quai, tournee, sociÃ©tÃ©, immat, chauffeur, phone, ...]
  //   RIGHT GROUP (cols 13-15+): same structure shifted right
  //     Col 13=Quai, 14=TRN, 15=SociÃ©tÃ©, 16=Immat, 17=Contact, 18=TÃ©l...
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async parseAlfortville(workbook: ExcelJS.Workbook): Promise<ParseResult> {
    const rows: ParsedRow[] = [];
    let totalRows = 0;
    let parsedRows = 0;
    let errorRows = 0;

    // Sheets to parse: main + holiday/special sheets with same layout
    const TARGET_SHEETS = [
      'Plan de mise Ã  quai Alfortville',
      ' Jours FÃ©riÃ©s Dimanche',
      'test',
    ];

    workbook.eachSheet((ws) => {
      const sheetName = ws.name;
      if (!TARGET_SHEETS.includes(sheetName)) return;

      // Date is in row 1 col B (index 2) â€” may span multiple rows
      const dateRow = ws.getRow(1);
      const dateVal = this.getCellValue(dateRow.getCell(2));
      // For " Jours FÃ©riÃ©s Dimanche", dates are in row 2 (two dates, left and right)
      const dateRow2 = ws.getRow(2);
      const dateLeftVal  = this.getCellValue(dateRow2.getCell(2));
      const dateRightVal = this.getCellValue(dateRow2.getCell(13));

      const dateLeft  = this.formatDate(dateVal || dateLeftVal);
      const dateRight = this.formatDate(dateRightVal);

      this.logger.log(`Sheet [${sheetName}] â†’ dateLeft: ${dateLeft}, dateRight: ${dateRight}`);

      // Data starts at row 4 (row 3 is header)
      for (let rowNum = 4; rowNum <= ws.rowCount; rowNum++) {
        const row = ws.getRow(rowNum);

        // â”€â”€ LEFT GROUP â”€â”€
        // Col 1=slot, 2=quai, 3=TRN(tournee), 4=sociÃ©tÃ©, 5=immat, 6=chauffeur, 7=phone
        const leftTournee   = this.getCellValue(row.getCell(3));
        const leftSociete   = this.getCellValue(row.getCell(4));
        const leftImmat     = this.getCellValue(row.getCell(5));
        const leftChauffeur = this.getCellValue(row.getCell(6));
        const leftPhone     = this.getCellValue(row.getCell(7));
        const leftQuai      = this.getCellValue(row.getCell(2));

        if (leftTournee !== null && !isNaN(Number(leftTournee))) {
          totalRows++;
          try {
            rows.push({
              rowIndex: rowNum,
              sheetName,
              rawData: { tournee: leftTournee, societe: leftSociete, immat: leftImmat, date: dateLeft },
              parsedData: {
                tourCode:     String(leftTournee),
                date:         dateLeft,
                platform:     'ALFORTVILLE',
                transporteur: leftSociete   ? String(leftSociete).trim()   : undefined,
                chauffeur:    leftChauffeur ? String(leftChauffeur).trim() : undefined,
                phone:        leftPhone     ? String(leftPhone)            : undefined,
                truck:        leftImmat     ? String(leftImmat).trim()     : undefined,
                quai:         leftQuai      ? Number(leftQuai)             : undefined,
              },
              status: 'parsed',
            });
            parsedRows++;
          } catch (err) {
            rows.push({ rowIndex: rowNum, sheetName, rawData: { leftTournee }, status: 'error', errorMessage: String(err) });
            errorRows++;
          }
        }

        // â”€â”€ RIGHT GROUP â”€â”€
        // Col 13=quai, 14=TRN, 15=sociÃ©tÃ©, 16=immat, 17=chauffeur, 18=phone
        const rightTournee   = this.getCellValue(row.getCell(14));
        const rightSociete   = this.getCellValue(row.getCell(15));
        const rightImmat     = this.getCellValue(row.getCell(16));
        const rightChauffeur = this.getCellValue(row.getCell(17));
        const rightPhone     = this.getCellValue(row.getCell(18));
        const rightQuai      = this.getCellValue(row.getCell(13));

        if (rightTournee !== null && !isNaN(Number(rightTournee))) {
          totalRows++;
          try {
            rows.push({
              rowIndex: rowNum,
              sheetName,
              rawData: { tournee: rightTournee, societe: rightSociete, immat: rightImmat, date: dateRight || dateLeft },
              parsedData: {
                tourCode:     String(rightTournee),
                date:         dateRight || dateLeft,
                platform:     'ALFORTVILLE',
                transporteur: rightSociete   ? String(rightSociete).trim()   : undefined,
                chauffeur:    rightChauffeur ? String(rightChauffeur).trim() : undefined,
                phone:        rightPhone     ? String(rightPhone)            : undefined,
                truck:        rightImmat     ? String(rightImmat).trim()     : undefined,
                quai:         rightQuai      ? Number(rightQuai)             : undefined,
              },
              status: 'parsed',
            });
            parsedRows++;
          } catch (err) {
            rows.push({ rowIndex: rowNum, sheetName, rawData: { rightTournee }, status: 'error', errorMessage: String(err) });
            errorRows++;
          }
        }
      }
    });

    this.logger.log(`ALFORTVILLE parse complete: ${totalRows} rows scanned, ${parsedRows} parsed, ${errorRows} errors`);
    return { rows, totalRows, parsedRows, errorRows };
  }
}
