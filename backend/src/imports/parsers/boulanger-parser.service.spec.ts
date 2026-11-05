import { BoulangerParserService } from './boulanger-parser.service';

describe('BoulangerParserService', () => {
  const parser = new BoulangerParserService();

  describe('parseAlfortvilleGrid — afternoon ("Après-midi") block', () => {
    function buildGrid(afternoonRows: Record<number, any[]>): any[][] {
      const grid: any[][] = [];
      grid[0] = ['', 46324]; // B1 date serial
      grid[1] = []; // time labels (unused by afternoon block)
      for (const [rowNum, cols] of Object.entries(afternoonRows)) {
        grid[Number(rowNum) - 1] = cols;
      }
      return grid;
    }

    it('parses an STP tour from the afternoon block (rows 32-49, offset 34)', () => {
      const grid = buildGrid({
        32: [
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          '53', // Quai (col 34)
          '205', // TRN (col 35)
          'STP-MONO', // Société (col 36)
          'DG-398-MR', // Immat (col 37)
          'alaa', // Contact (col 38)
          '0662707372', // Tél (col 39)
        ],
      });

      const result = parser.parseAlfortvilleGrid(grid, 'Plan de mise à quai Alfortville 2026');

      expect(result.stpRows).toHaveLength(1);
      const row = result.stpRows[0];
      expect(row.tourNumber).toBe(205);
      expect(row.tourType).toBe('Après-midi');
      expect(row.horaire).toBe('Après-midi');
      expect(row.prestataire).toBe('STP-MONO');
      expect(row.quai).toBe('53');
    });

    it('ignores a non-STP tour in the afternoon block', () => {
      const grid = buildGrid({
        32: [
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          '49',
          '201',
          'MNS',
          'EL210LR',
          'KHERDINE',
          '0647346736',
        ],
      });

      const result = parser.parseAlfortvilleGrid(grid, 'Plan de mise à quai Alfortville 2026');

      expect(result.allRows).toHaveLength(1);
      expect(result.stpRows).toHaveLength(0);
    });

    it('does not pick up afternoon-range rows outside 32-49', () => {
      const grid = buildGrid({
        50: [
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          '70',
          '220',
          'STP',
          'XX-000-XX',
          'Test',
          '0600000000',
        ],
      });

      const result = parser.parseAlfortvilleGrid(grid, 'Plan de mise à quai Alfortville 2026');

      expect(result.allRows).toHaveLength(0);
    });
  });

  describe('parseAlfortvilleDayGrid — new day-numbered-tab format (Nov 2026)', () => {
    // Row 1 = labels, row 2 = date in col B, row 3 = headers, row 4+ = data.
    // Same column shape Garonor already uses: Quantité, Horaire, Quai, Tournée,
    // Spécificité, Prestataires, Équipage1, Équipage2, Numéro, Immatriculation.
    function buildGrid(dataRows: any[][]): any[][] {
      const grid: any[][] = [];
      grid[0] = ['Contact', 'Plan de mise à quai'];
      grid[1] = [null, new Date(2026, 10, 6)]; // row 2, col B = date
      grid[2] = [
        'Quantité',
        'Horaire',
        'Quai',
        'Tournée',
        'Spécificité',
        'Prestataires',
        'Équipages',
        null,
        'Numéro',
        'Immatriculation',
      ];
      for (let i = 0; i < dataRows.length; i++) {
        grid[3 + i] = dataRows[i];
      }
      return grid;
    }

    it('parses an STP standard tour and tags it F166', () => {
      const grid = buildGrid([
        [
          null,
          '7:30',
          '63',
          827,
          'Standard',
          'STP 1',
          'khaled',
          'wassim',
          '0766890594',
          'BQ-909-LD',
        ],
      ]);

      const result = parser.parseAlfortvilleDayGrid(grid, '6', new Date(2026, 10, 6), []);

      expect(result.platform).toBe('F166');
      expect(result.stpRows).toHaveLength(1);
      const row = result.stpRows[0];
      expect(row.tourNumber).toBe(827);
      expect(row.tourType).toBe('Standard');
      expect(row.prestataire).toBe('STP 1');
      expect(row.dateStr).toBe('2026-11-06');
    });

    it('derives tourType from the Spécificité/number range (Spéciale, Install)', () => {
      const grid = buildGrid([
        [15, '7:00', '50', 891, 'Spéciale', 'STP-SPC 1', 'alaa', 'nejd', '0662707372', 'FL-688-NB'],
        [
          6,
          '7:00',
          '75',
          502,
          'Install',
          'STP-INSTALL 1',
          'karim',
          'lassad',
          '0749563351',
          'FG-483-XA',
        ],
      ]);

      const result = parser.parseAlfortvilleDayGrid(grid, '6', new Date(2026, 10, 6), []);

      expect(result.stpRows).toHaveLength(2);
      expect(result.stpRows[0].tourType).toBe('Spéciale');
      expect(result.stpRows[1].tourType).toBe('Install');
    });

    it('ignores non-STP providers', () => {
      const grid = buildGrid([
        [
          null,
          '7:00',
          '53',
          803,
          'Standard',
          'TRANS75 1',
          'Youcef',
          'Yassine',
          '0755091973',
          'ET-245-TB',
        ],
      ]);

      const result = parser.parseAlfortvilleDayGrid(grid, '6', new Date(2026, 10, 6), []);

      expect(result.allRows).toHaveLength(1);
      expect(result.stpRows).toHaveLength(0);
    });
  });
});
