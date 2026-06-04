import { Test, TestingModule } from '@nestjs/testing';
import { ExcelParserService } from './excel-parser.service';
import * as ExcelJS from 'exceljs';

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

  describe('parseExcelFile with mock workbook', () => {
    it('should detect and filter STP tours correctly', async () => {
      // Create a mock workbook in memory
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Alfortville');

      // Add header row
      worksheet.addRow([
        'N° tournée',
        'code tournée',
        'transporteur',
        'titulaire',
        'date',
        'nb colis',
        'volume',
      ]);

      // Add test data rows
      worksheet.addRow(['T001', 'ALF-001', 'STP', 'STP Logistics', '2026-05-27', 25, 10.5]);
      worksheet.addRow(['T002', 'ALF-002', 'OTHER', 'Other Transporter', '2026-05-27', 30, 12.0]);
      worksheet.addRow(['T003', 'ALF-003', 'STP France', 'STP', '2026-05-27', 20, 8.0]);
      worksheet.addRow(['T004', 'ALF-004', 'External', 'External Co', '2026-05-27', 15, 5.0]);

      // Write to a temporary buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const tempPath = 'test-temp.xlsx';
      const fs = require('fs');
      fs.writeFileSync(tempPath, buffer);

      try {
        // Parse the file
        const result = await service.parseExcelFile(tempPath);

        // Assertions
        expect(result).toBeDefined();
        expect(result.totalRows).toBe(4); // Total rows scanned (including non-STP)
        expect(result.parsedRows).toBe(2); // Only STP rows (T001 and T003)
        expect(result.errorRows).toBe(0);

        // Check that we got exactly 2 STP rows
        expect(result.rows.length).toBe(2);

        // Verify the parsed data for first STP tour
        const firstRow = result.rows.find((r) => r.parsedData?.tourCode === 'ALF-001');
        expect(firstRow).toBeDefined();
        expect(firstRow?.status).toBe('parsed');
        expect(firstRow?.parsedData?.platform).toBe('F166'); // Should infer Alfortville = F166
        expect(firstRow?.sheetName).toBe('Alfortville');

        // Verify the parsed data for second STP tour
        const secondRow = result.rows.find((r) => r.parsedData?.tourCode === 'ALF-003');
        expect(secondRow).toBeDefined();
        expect(secondRow?.status).toBe('parsed');
      } finally {
        // Cleanup temp file
        fs.unlinkSync(tempPath);
      }
    });

    it('should handle Garonor sheet correctly', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Garonor');

      worksheet.addRow(['code tournée', 'transporteur', 'date', 'nb colis']);
      worksheet.addRow(['GAR-001', 'STP', '2026-05-27', 50]);

      const buffer = await workbook.xlsx.writeBuffer();
      const tempPath = 'test-garonor.xlsx';
      const fs = require('fs');
      fs.writeFileSync(tempPath, buffer);

      try {
        const result = await service.parseExcelFile(tempPath);

        expect(result.parsedRows).toBe(1);
        const row = result.rows[0];
        expect(row.parsedData?.platform).toBe('GARONOR');
      } finally {
        fs.unlinkSync(tempPath);
      }
    });
  });
});
