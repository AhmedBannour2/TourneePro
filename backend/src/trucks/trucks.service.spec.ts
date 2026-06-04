import { Test, TestingModule } from '@nestjs/testing';
import { TrucksService } from './trucks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('TrucksService', () => {
  let service: TrucksService;
  let prisma: PrismaService;

  const mockPrismaService = {
    truck: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockTruck = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    immatriculation: 'AB-123-CD',
    isAvailable: true,
    notes: 'Maintenance due soon',
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrucksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TrucksService>(TrucksService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a truck', async () => {
      const createDto = {
        immatriculation: 'AB-123-CD',
        notes: 'Maintenance due soon',
      };

      mockPrismaService.truck.create.mockResolvedValue(mockTruck);

      const result = await service.create(createDto);

      expect(result).toEqual(mockTruck);
      expect(mockPrismaService.truck.create).toHaveBeenCalledWith({
        data: {
          ...createDto,
          isAvailable: true,
        },
      });
    });

    it('should throw ConflictException for duplicate immatriculation', async () => {
      const createDto = {
        immatriculation: 'AB-123-CD',
      };

      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);

      mockPrismaService.truck.create.mockRejectedValue(prismaError);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of trucks', async () => {
      const trucks = [mockTruck];
      mockPrismaService.truck.findMany.mockResolvedValue(trucks);

      const result = await service.findAll();

      expect(result).toEqual(trucks);
      expect(mockPrismaService.truck.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a truck', async () => {
      mockPrismaService.truck.findUnique.mockResolvedValue(mockTruck);

      const result = await service.findOne(mockTruck.id);

      expect(result).toEqual(mockTruck);
      expect(mockPrismaService.truck.findUnique).toHaveBeenCalledWith({
        where: { id: mockTruck.id },
      });
    });

    it('should throw NotFoundException if truck not found', async () => {
      mockPrismaService.truck.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a truck', async () => {
      const updateDto = { notes: 'Updated notes' };
      const updatedTruck = { ...mockTruck, ...updateDto };

      mockPrismaService.truck.findUnique.mockResolvedValue(mockTruck);
      mockPrismaService.truck.update.mockResolvedValue(updatedTruck);

      const result = await service.update(mockTruck.id, updateDto);

      expect(result).toEqual(updatedTruck);
      expect(mockPrismaService.truck.update).toHaveBeenCalledWith({
        where: { id: mockTruck.id },
        data: updateDto,
      });
    });

    it('should throw ConflictException for duplicate immatriculation on update', async () => {
      const updateDto = { immatriculation: 'XY-999-ZZ' };

      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);

      mockPrismaService.truck.findUnique.mockResolvedValue(mockTruck);
      mockPrismaService.truck.update.mockRejectedValue(prismaError);

      await expect(service.update(mockTruck.id, updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a truck', async () => {
      mockPrismaService.truck.findUnique.mockResolvedValue(mockTruck);
      mockPrismaService.truck.delete.mockResolvedValue(mockTruck);

      const result = await service.remove(mockTruck.id);

      expect(result).toEqual(mockTruck);
      expect(mockPrismaService.truck.delete).toHaveBeenCalledWith({
        where: { id: mockTruck.id },
      });
    });

    it('should throw NotFoundException if truck not found', async () => {
      mockPrismaService.truck.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
