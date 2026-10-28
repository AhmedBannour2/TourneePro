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
});
