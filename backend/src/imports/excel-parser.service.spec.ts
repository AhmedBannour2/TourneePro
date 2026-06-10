import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExcelParserService } from './excel-parser.service';

// Sheet names must match TARGET_SHEETS in excel-parser.service.ts exactly
const ALFORTVILLE_SHEET = 'Plan de mise Ã  quai Alfortville';

describe('ExcelParserService', () => {
  let service: ExcelParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExcelParserService],
    }).compile();

    service = module.get<ExcelParserService>(ExcelParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Helper ────────────────────────────────────────────────────────────────

  async function writeTempWorkbook(workbook: ExcelJS.Workbook, name: string): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `test-${name}-${Date.now()}.xlsx`);
    const buf = await workbook.xlsx.writeBuffer();
    fs.writeFileSync(tmpPath, buf as unknown as Uint8Array);
    return tmpPath;
  }

  // ── GARONOR format ────────────────────────────────────────────────────────

  describe('GARONOR format (numbered sheet)', () => {
    it('parses a tour row from a day-numbered sheet', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('10'); // numbered sheet triggers Garonor detection

      // Row 1: contact header (ignored)
      ws.addRow(['Contact', 'Plan de mise à quai']);
      // Row 2: date in col B
      ws.addRow([null, new Date('2026-06-10')]);
      // Row 3: column headers (ignored by parser)
      ws.addRow([
        'Quantité',
        'Horaire',
        'Quai',
        'Tournée',
        'Spécificité',
        'Prestataires',
        'Équipages',
        'Équipages',
        'Numéro',
        'Immatriculation',
      ]);
      // Row 4: first data row — col 4 must be numeric
      ws.addRow([
        50,
        '07:30',
        5,
        850,
        'Standard',
        'STP',
        'Jean Dupont',
        'Marie Martin',
        '0600000000',
        'AA-123-BB',
      ]);
      // Row 5: another data row
      ws.addRow([
        30,
        '08:00',
        6,
        751,
        'GV',
        'STP',
        'Pierre Durand',
        null,
        '0611111111',
        'BB-456-CC',
      ]);

      const tmpPath = await writeTempWorkbook(wb, 'garonor');
      try {
        const result = await service.parseExcelFile(tmpPath);

        expect(result.totalRows).toBe(2);
        expect(result.parsedRows).toBe(2);
        expect(result.errorRows).toBe(0);
        expect(result.rows).toHaveLength(2);

        const row850 = result.rows.find((r) => r.parsedData?.tourCode === '850');
        expect(row850).toBeDefined();
        expect(row850?.parsedData?.platform).toBe('GARONOR');
        expect(row850?.parsedData?.date).toBe('2026-06-10');
        expect(row850?.parsedData?.transporteur).toBe('STP');
        expect(row850?.parsedData?.chauffeur).toBe('Jean Dupont');
        expect(row850?.status).toBe('parsed');
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    it('skips rows where tour code is non-numeric', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('5');

      ws.addRow(['Contact', 'Header']);
      ws.addRow([null, new Date('2026-06-10')]);
      ws.addRow(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10']);
      ws.addRow([10, '07:00', 3, 'ABC', 'Spéc', 'STP', 'Dupont', null, null, null]); // non-numeric tournee

      const tmpPath = await writeTempWorkbook(wb, 'garonor-skip');
      try {
        const result = await service.parseExcelFile(tmpPath);
        expect(result.totalRows).toBe(0); // row was skipped
        expect(result.rows).toHaveLength(0);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });
  });

  // ── ALFORTVILLE format ────────────────────────────────────────────────────
  // Use 'test' sheet (in TARGET_SHEETS) + a dummy 'alfortville' sheet to
  // trigger isAlfortville detection without encoding issues.

  describe('ALFORTVILLE format (wide layout sheet)', () => {
    it('parses left and right column groups from the data sheet', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('alfortville'); // triggers isAlfortville detection; no data

      const ws = wb.addWorksheet('test'); // in TARGET_SHEETS, holds actual data

      // Row 1: date in col B (dateLeft)
      const row1 = ws.getRow(1);
      row1.getCell(2).value = new Date('2026-06-11');
      row1.commit();

      // Row 4: data — LEFT group (col 3 = tournee) + RIGHT group (col 14 = tournee)
      const row4 = ws.getRow(4);
      row4.getCell(2).value = 5; // leftQuai
      row4.getCell(3).value = 850; // leftTournee (numeric — must be numeric to be counted)
      row4.getCell(4).value = 'STP'; // leftSociete
      row4.getCell(5).value = 'AA-123-BB'; // leftImmat
      row4.getCell(6).value = 'Jean Dupont'; // leftChauffeur
      row4.getCell(7).value = '0600000000'; // leftPhone
      row4.getCell(13).value = 6; // rightQuai
      row4.getCell(14).value = 851; // rightTournee (numeric)
      row4.getCell(15).value = 'STP'; // rightSociete
      row4.getCell(16).value = 'BB-456-CC'; // rightImmat
      row4.getCell(17).value = 'Marie Martin'; // rightChauffeur
      row4.getCell(18).value = '0611111111'; // rightPhone
      row4.commit();

      const tmpPath = await writeTempWorkbook(wb, 'alfortville');
      try {
        const result = await service.parseExcelFile(tmpPath);

        expect(result.totalRows).toBe(2); // left + right
        expect(result.parsedRows).toBe(2);
        expect(result.errorRows).toBe(0);

        const left = result.rows.find((r) => r.parsedData?.tourCode === '850');
        expect(left).toBeDefined();
        expect(left?.parsedData?.platform).toBe('ALFORTVILLE');
        expect(left?.parsedData?.transporteur).toBe('STP');
        expect(left?.parsedData?.chauffeur).toBe('Jean Dupont');

        const right = result.rows.find((r) => r.parsedData?.tourCode === '851');
        expect(right).toBeDefined();
        expect(right?.parsedData?.platform).toBe('ALFORTVILLE');
        expect(right?.parsedData?.chauffeur).toBe('Marie Martin');
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    it('returns zero rows when the sheet has no numeric tour codes', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('alfortville'); // detection trigger only

      const ws = wb.addWorksheet('test');

      const row1 = ws.getRow(1);
      row1.getCell(2).value = new Date('2026-06-11');
      row1.commit();

      // Row 4 with non-numeric tournee — parser skips it
      const row4 = ws.getRow(4);
      row4.getCell(3).value = 'VIDE';
      row4.commit();

      const tmpPath = await writeTempWorkbook(wb, 'alfortville-empty');
      try {
        const result = await service.parseExcelFile(tmpPath);
        expect(result.totalRows).toBe(0);
        expect(result.rows).toHaveLength(0);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });
  });
});
