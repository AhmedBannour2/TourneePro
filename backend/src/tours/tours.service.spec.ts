import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TourSource, WorkedDayStatus } from '@prisma/client';
import { ToursService } from './tours.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notification/mail.service';
import { WorkedDaysService } from '../worked-days/worked-days.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ToursService', () => {
  let service: ToursService;

  const mockPrismaService = {
    tour: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    assignment: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
    },
    truck: {
      findUnique: jest.fn(),
    },
    truckAssignmentHistory: {
      create: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
    workedDay: {
      updateMany: jest.fn(),
    },
    tourConfirmation: {
      findUnique: jest.fn(),
    },
    platform: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockMailService = {
    sendAssignmentNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockWorkedDaysService = {
    createFromAssignment: jest.fn().mockResolvedValue(undefined),
    cancelFromUnassignment: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationsService = {
    create: jest.fn(),
    createForRole: jest.fn(),
  };

  const mockTour = {
    id: 'tour-uuid-1',
    tourCode: '850',
    date: new Date('2026-06-10'),
    status: 'imported',
    platformId: 'plat-uuid-1',
    platform: { id: 'plat-uuid-1', name: 'Garonor', code: 'GAR' },
    assignments: [],
    confirmation: null,
    importBatch: null,
    confirmationStatus: 'PENDING',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToursService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MailService, useValue: mockMailService },
        { provide: WorkedDaysService, useValue: mockWorkedDaysService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ToursService>(ToursService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the tour when found', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      const result = await service.findOne('tour-uuid-1');
      expect(result).toEqual(mockTour);
    });

    it('throws NotFoundException when tour does not exist', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── createTour ────────────────────────────────────────────────────────────

  describe('createTour', () => {
    const createDto = {
      tourCode: '850',
      date: '2026-06-10',
      platformId: 'plat-uuid-1',
    };

    it('throws NotFoundException when the platform does not exist', async () => {
      mockPrismaService.platform.findUnique.mockResolvedValue(null);
      await expect(service.createTour(createDto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the same tour code already exists on that date and platform', async () => {
      mockPrismaService.platform.findUnique.mockResolvedValue({ id: 'plat-uuid-1' });
      mockPrismaService.tour.findFirst.mockResolvedValue(mockTour);
      await expect(service.createTour(createDto)).rejects.toThrow(ConflictException);
    });

    it('creates and returns the tour when no duplicate exists', async () => {
      const newTour = { ...mockTour, source: TourSource.MANUAL };
      mockPrismaService.platform.findUnique.mockResolvedValue({ id: 'plat-uuid-1' });
      mockPrismaService.tour.findFirst.mockResolvedValue(null);
      mockPrismaService.tour.create.mockResolvedValue(newTour);

      const result = await service.createTour(createDto);

      expect(result).toEqual(newTour);
      expect(mockPrismaService.tour.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tourCode: '850',
            platformId: 'plat-uuid-1',
            source: TourSource.MANUAL,
          }),
        }),
      );
    });
  });

  // ── deleteTour ────────────────────────────────────────────────────────────

  describe('deleteTour', () => {
    it('throws BadRequestException when tour is assigned', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue({ ...mockTour, status: 'assigned' });
      await expect(service.deleteTour('tour-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('deletes the tour and returns { id, deleted: true }', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue({ ...mockTour, status: 'imported' });
      mockPrismaService.workedDay.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.tour.delete.mockResolvedValue(mockTour);

      const result = await service.deleteTour('tour-uuid-1');

      expect(result).toEqual({ id: 'tour-uuid-1', deleted: true });
      expect(mockPrismaService.tour.delete).toHaveBeenCalledWith({
        where: { id: 'tour-uuid-1' },
      });
    });
  });

  // ── assignTour — guard conditions ─────────────────────────────────────────

  describe('assignTour', () => {
    const baseDto = { chauffeurId: 'emp-1', truckId: 'truck-1' };

    it('throws NotFoundException when the chauffeur does not exist', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      mockPrismaService.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.assignTour('tour-uuid-1', { ...baseDto, chauffeurId: 'emp-missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the chauffeur is inactive', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      mockPrismaService.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        name: 'Jean',
        isActive: false,
      });

      await expect(service.assignTour('tour-uuid-1', baseDto)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the aide does not exist', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      mockPrismaService.employee.findUnique
        .mockResolvedValueOnce({ id: 'emp-1', name: 'Jean', isActive: true }) // chauffeur passes
        .mockResolvedValueOnce(null); // aide not found

      await expect(
        service.assignTour('tour-uuid-1', { ...baseDto, aideId: 'aide-missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the truck does not exist', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      mockPrismaService.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        name: 'Jean',
        isActive: true,
      });
      mockPrismaService.truck.findUnique.mockResolvedValue(null);

      await expect(
        service.assignTour('tour-uuid-1', { ...baseDto, truckId: 'truck-missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the truck is not available', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      mockPrismaService.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        name: 'Jean',
        isActive: true,
      });
      mockPrismaService.truck.findUnique.mockResolvedValue({
        id: 'truck-1',
        immatriculation: 'AA-123-BB',
        isAvailable: false,
      });

      await expect(service.assignTour('tour-uuid-1', baseDto)).rejects.toThrow(BadRequestException);
    });

    it('creates a new assignment and updates tour status to assigned', async () => {
      const mockAssignment = {
        id: 'assign-1',
        tourId: 'tour-uuid-1',
        chauffeurId: 'emp-1',
        aideId: null,
        truckId: 'truck-1',
        chauffeur: { id: 'emp-1', name: 'Jean', email: null },
        aide: null,
        truck: { id: 'truck-1', immatriculation: 'AA-123-BB' },
      };

      mockPrismaService.tour.findUnique.mockResolvedValue(mockTour);
      mockPrismaService.employee.findUnique
        .mockResolvedValueOnce({ id: 'emp-1', name: 'Jean', isActive: true }) // chauffeur active check
        .mockResolvedValueOnce({ userId: null }); // userId lookup for notification
      mockPrismaService.truck.findUnique.mockResolvedValue({
        id: 'truck-1',
        immatriculation: 'AA-123-BB',
        isAvailable: true,
      });
      mockPrismaService.tour.findMany.mockResolvedValue([]); // no same-day conflicts
      mockPrismaService.assignment.create.mockResolvedValue(mockAssignment);
      mockPrismaService.truckAssignmentHistory.create.mockResolvedValue({});
      mockPrismaService.tour.update.mockResolvedValue(mockTour);
      mockPrismaService.auditEvent.create.mockResolvedValue({});

      await service.assignTour('tour-uuid-1', baseDto);

      expect(mockPrismaService.assignment.create).toHaveBeenCalled();
      expect(mockPrismaService.tour.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'assigned' } }),
      );
      expect(mockWorkedDaysService.createFromAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ tourId: 'tour-uuid-1' }),
      );
    });
  });

  // ── unassignTour ──────────────────────────────────────────────────────────

  describe('unassignTour', () => {
    it('throws BadRequestException when the tour has no assignment', async () => {
      mockPrismaService.tour.findUnique.mockResolvedValue({ ...mockTour, assignments: [] });
      await expect(service.unassignTour('tour-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('deletes the assignment and resets tour status to imported', async () => {
      const tourWithAssignment = {
        ...mockTour,
        assignments: [
          {
            id: 'assign-1',
            chauffeurId: 'emp-1',
            aideId: null,
            truckId: null,
            chauffeur: { name: 'Jean' },
            aide: null,
          },
        ],
      };
      mockPrismaService.tour.findUnique.mockResolvedValue(tourWithAssignment);
      mockPrismaService.assignment.delete.mockResolvedValue({});
      mockPrismaService.tour.update.mockResolvedValue(mockTour);
      mockPrismaService.auditEvent.create.mockResolvedValue({});

      await service.unassignTour('tour-uuid-1');

      expect(mockWorkedDaysService.cancelFromUnassignment).toHaveBeenCalledWith('tour-uuid-1');
      expect(mockPrismaService.assignment.delete).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
      });
      expect(mockPrismaService.tour.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'imported' } }),
      );
    });
  });

  // ── confirmTour — guard conditions ────────────────────────────────────────

  describe('confirmTour', () => {
    it('throws ForbiddenException when no employee profile is linked to the user', async () => {
      mockPrismaService.employee.findUnique.mockResolvedValue(null);
      await expect(
        service.confirmTour(
          'tour-uuid-1',
          { totalClients: 10, delivered: 8, absent: 2, nonConform: 0 },
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when confirmation counts exceed total clients', async () => {
      const tourWithAssignment = {
        ...mockTour,
        assignments: [{ id: 'assign-1', chauffeurId: 'emp-1', aideId: null }],
      };
      mockPrismaService.employee.findUnique.mockResolvedValue({ id: 'emp-1', name: 'Jean' });
      mockPrismaService.tour.findUnique.mockResolvedValue(tourWithAssignment);
      mockPrismaService.tourConfirmation.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmTour(
          'tour-uuid-1',
          { totalClients: 10, delivered: 8, absent: 3, nonConform: 1 }, // 8+3+1=12 > 10
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tour is already confirmed', async () => {
      const tourWithAssignment = {
        ...mockTour,
        assignments: [{ id: 'assign-1', chauffeurId: 'emp-1', aideId: null }],
      };
      mockPrismaService.employee.findUnique.mockResolvedValue({ id: 'emp-1', name: 'Jean' });
      mockPrismaService.tour.findUnique.mockResolvedValue(tourWithAssignment);
      mockPrismaService.tourConfirmation.findUnique.mockResolvedValue({ id: 'confirm-1' });

      await expect(
        service.confirmTour(
          'tour-uuid-1',
          { totalClients: 10, delivered: 8, absent: 2, nonConform: 0 },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
