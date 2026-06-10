import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TourType, EmployeeRole, WorkedDayStatus } from '@prisma/client';
import { WorkedDaysService, detectTourType, SYSTEM_PAY_DEFAULTS } from './worked-days.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WorkedDaysService', () => {
  let service: WorkedDaysService;

  const mockPrismaService = {
    employeePayRate: { findUnique: jest.fn() },
    globalPayRate: { findUnique: jest.fn() },
    workedDay: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    employee: { findUnique: jest.fn() },
    expressMission: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockWorkedDay = {
    id: 'wd-uuid-1',
    employeeId: 'emp-uuid-1',
    tourId: 'tour-uuid-1',
    date: new Date('2026-06-10'),
    tourType: TourType.STANDARD,
    employeeRole: EmployeeRole.CHAUFFEUR,
    basePay: 80,
    overridePay: null,
    finalPay: 80,
    status: WorkedDayStatus.ASSIGNED,
    employee: {
      id: 'emp-uuid-1',
      name: 'Jean Dupont',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: EmployeeRole.CHAUFFEUR,
    },
    tour: {
      id: 'tour-uuid-1',
      tourCode: '850',
      date: new Date('2026-06-10'),
      platform: { name: 'Garonor', code: 'GAR' },
    },
    expressMissions: [],
    overrideBy: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkedDaysService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<WorkedDaysService>(WorkedDaysService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── detectTourType (pure exported function) ───────────────────────────────

  describe('detectTourType', () => {
    it.each([
      ['550', TourType.INSTALL],
      ['650', TourType.MONO],
      ['750', TourType.GV],
      ['850', TourType.STANDARD],
      ['950', TourType.SPECIAL],
      ['abc', TourType.STANDARD],
      ['100', TourType.STANDARD],
    ])('tourCode %s → %s', (code, expected) => {
      expect(detectTourType(code)).toBe(expected);
    });
  });

  // ── getPayRate ────────────────────────────────────────────────────────────

  describe('getPayRate', () => {
    it('returns employee-specific chauffeur rate when override exists', async () => {
      mockPrismaService.employeePayRate.findUnique.mockResolvedValue({
        chauffeurRate: 95,
        aideRate: 85,
      });
      const rate = await service.getPayRate('emp-1', TourType.STANDARD, EmployeeRole.CHAUFFEUR);
      expect(rate).toBe(95);
    });

    it('returns employee-specific aide rate when override exists', async () => {
      mockPrismaService.employeePayRate.findUnique.mockResolvedValue({
        chauffeurRate: 95,
        aideRate: 70,
      });
      const rate = await service.getPayRate('emp-1', TourType.STANDARD, EmployeeRole.AIDE);
      expect(rate).toBe(70);
    });

    it('falls back to global rate when no employee override', async () => {
      mockPrismaService.employeePayRate.findUnique.mockResolvedValue(null);
      mockPrismaService.globalPayRate.findUnique.mockResolvedValue({
        chauffeurRate: 88,
        aideRate: 65,
      });
      const rate = await service.getPayRate('emp-1', TourType.STANDARD, EmployeeRole.CHAUFFEUR);
      expect(rate).toBe(88);
    });

    it('falls back to system default when no employee or global override', async () => {
      mockPrismaService.employeePayRate.findUnique.mockResolvedValue(null);
      mockPrismaService.globalPayRate.findUnique.mockResolvedValue(null);
      const rate = await service.getPayRate('emp-1', TourType.GV, EmployeeRole.CHAUFFEUR);
      expect(rate).toBe(SYSTEM_PAY_DEFAULTS.GV.chauffeurRate);
    });

    it('returns 0 for aide when system default aide rate is null', async () => {
      mockPrismaService.employeePayRate.findUnique.mockResolvedValue(null);
      mockPrismaService.globalPayRate.findUnique.mockResolvedValue(null);
      const rate = await service.getPayRate('emp-1', TourType.MONO, EmployeeRole.AIDE);
      expect(rate).toBe(0); // MONO has aideRate: null in system defaults
    });
  });

  // ── createFromAssignment ──────────────────────────────────────────────────

  describe('createFromAssignment', () => {
    const baseParams = {
      tourId: 'tour-1',
      tourCode: '850',
      tourDate: new Date('2026-06-10'),
      chauffeurId: 'emp-1',
      aideId: null,
    };

    beforeEach(() => {
      mockPrismaService.employeePayRate.findUnique.mockResolvedValue(null);
      mockPrismaService.globalPayRate.findUnique.mockResolvedValue(null);
      mockPrismaService.workedDay.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.workedDay.create.mockResolvedValue(mockWorkedDay);
    });

    it('cancels existing ASSIGNED worked days before creating new ones', async () => {
      await service.createFromAssignment(baseParams);
      expect(mockPrismaService.workedDay.updateMany).toHaveBeenCalledWith({
        where: { tourId: 'tour-1', status: WorkedDayStatus.ASSIGNED },
        data: { status: WorkedDayStatus.CANCELLED },
      });
    });

    it('creates a worked day for the chauffeur with correct basePay and role', async () => {
      await service.createFromAssignment(baseParams);
      expect(mockPrismaService.workedDay.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: 'emp-1',
            tourType: TourType.STANDARD,
            employeeRole: EmployeeRole.CHAUFFEUR,
            basePay: SYSTEM_PAY_DEFAULTS.STANDARD.chauffeurRate,
            finalPay: SYSTEM_PAY_DEFAULTS.STANDARD.chauffeurRate,
            status: WorkedDayStatus.ASSIGNED,
          }),
        }),
      );
    });

    it('creates worked days for both chauffeur and aide when both are provided', async () => {
      await service.createFromAssignment({ ...baseParams, aideId: 'emp-2' });
      expect(mockPrismaService.workedDay.create).toHaveBeenCalledTimes(2);
    });

    it('skips creation when no chauffeur and no aide are provided', async () => {
      await service.createFromAssignment({ ...baseParams, chauffeurId: null });
      expect(mockPrismaService.workedDay.create).not.toHaveBeenCalled();
    });
  });

  // ── cancelFromUnassignment ────────────────────────────────────────────────

  describe('cancelFromUnassignment', () => {
    it('cancels all ASSIGNED worked days for the given tour', async () => {
      mockPrismaService.workedDay.updateMany.mockResolvedValue({ count: 2 });
      await service.cancelFromUnassignment('tour-1');
      expect(mockPrismaService.workedDay.updateMany).toHaveBeenCalledWith({
        where: { tourId: 'tour-1', status: WorkedDayStatus.ASSIGNED },
        data: { status: WorkedDayStatus.CANCELLED },
      });
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the worked day when found', async () => {
      mockPrismaService.workedDay.findUnique.mockResolvedValue(mockWorkedDay);
      const result = await service.findOne('wd-uuid-1');
      expect(result).toEqual(mockWorkedDay);
    });

    it('throws NotFoundException when the worked day does not exist', async () => {
      mockPrismaService.workedDay.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── confirm ───────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('throws ForbiddenException when called by a different employee', async () => {
      mockPrismaService.workedDay.findUnique.mockResolvedValue(mockWorkedDay);
      mockPrismaService.employee.findUnique.mockResolvedValue({ id: 'different-emp' });
      await expect(service.confirm('wd-uuid-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when worked day is CANCELLED', async () => {
      const cancelledWd = { ...mockWorkedDay, status: WorkedDayStatus.CANCELLED };
      mockPrismaService.workedDay.findUnique.mockResolvedValue(cancelledWd);
      mockPrismaService.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1' });
      await expect(service.confirm('wd-uuid-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('returns the existing worked day without updating when already CONFIRMED (idempotent)', async () => {
      const confirmedWd = { ...mockWorkedDay, status: WorkedDayStatus.CONFIRMED };
      mockPrismaService.workedDay.findUnique.mockResolvedValue(confirmedWd);
      mockPrismaService.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1' });
      const result = await service.confirm('wd-uuid-1', 'user-1');
      expect(result).toEqual(confirmedWd);
      expect(mockPrismaService.workedDay.update).not.toHaveBeenCalled();
    });

    it('updates status to CONFIRMED for the correct employee', async () => {
      mockPrismaService.workedDay.findUnique.mockResolvedValue(mockWorkedDay);
      mockPrismaService.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1' });
      const confirmedWd = { ...mockWorkedDay, status: WorkedDayStatus.CONFIRMED };
      mockPrismaService.workedDay.update.mockResolvedValue(confirmedWd);

      const result = await service.confirm('wd-uuid-1', 'user-1');

      expect(mockPrismaService.workedDay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: WorkedDayStatus.CONFIRMED }),
        }),
      );
      expect(result).toEqual(confirmedWd);
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws BadRequestException when the worked day is already CONFIRMED', async () => {
      const confirmedWd = { ...mockWorkedDay, status: WorkedDayStatus.CONFIRMED };
      mockPrismaService.workedDay.findUnique.mockResolvedValue(confirmedWd);
      await expect(service.cancel('wd-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('updates status to CANCELLED', async () => {
      mockPrismaService.workedDay.findUnique.mockResolvedValue(mockWorkedDay);
      const cancelledWd = { ...mockWorkedDay, status: WorkedDayStatus.CANCELLED };
      mockPrismaService.workedDay.update.mockResolvedValue(cancelledWd);

      const result = await service.cancel('wd-uuid-1');

      expect(result).toEqual(cancelledWd);
      expect(mockPrismaService.workedDay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: WorkedDayStatus.CANCELLED },
        }),
      );
    });
  });

  // ── override ──────────────────────────────────────────────────────────────

  describe('override', () => {
    it('throws NotFoundException when the worked day does not exist', async () => {
      mockPrismaService.workedDay.findUnique.mockResolvedValue(null);
      await expect(
        service.override('non-existent', { overridePay: 100 }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves the overridePay and recalculates finalPay', async () => {
      const wdWithOverride = { ...mockWorkedDay, overridePay: 100, expressMissions: [] };
      mockPrismaService.workedDay.findUnique.mockResolvedValue(mockWorkedDay);
      mockPrismaService.workedDay.update.mockResolvedValue(wdWithOverride);
      mockPrismaService.workedDay.findUniqueOrThrow.mockResolvedValue(wdWithOverride);

      await service.override('wd-uuid-1', { overridePay: 100 }, 'user-1');

      expect(mockPrismaService.workedDay.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overridePay: 100 }),
        }),
      );
    });
  });
});
