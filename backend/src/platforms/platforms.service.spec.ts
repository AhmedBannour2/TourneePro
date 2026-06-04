import { Test, TestingModule } from '@nestjs/testing';
import { PlatformsService } from './platforms.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('PlatformsService', () => {
  let service: PlatformsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    platform: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPlatform = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Alfortville',
    code: 'F166',
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PlatformsService>(PlatformsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a platform', async () => {
      const createDto = {
        name: 'Alfortville',
        code: 'F166',
      };

      mockPrismaService.platform.create.mockResolvedValue(mockPlatform);

      const result = await service.create(createDto);

      expect(result).toEqual(mockPlatform);
      expect(mockPrismaService.platform.create).toHaveBeenCalledWith({
        data: createDto,
      });
    });

    it('should throw ConflictException for duplicate code', async () => {
      const createDto = {
        name: 'Alfortville',
        code: 'F166',
      };

      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);

      mockPrismaService.platform.create.mockRejectedValue(prismaError);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of platforms', async () => {
      const platforms = [mockPlatform];
      mockPrismaService.platform.findMany.mockResolvedValue(platforms);

      const result = await service.findAll();

      expect(result).toEqual(platforms);
      expect(mockPrismaService.platform.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a platform', async () => {
      mockPrismaService.platform.findUnique.mockResolvedValue(mockPlatform);

      const result = await service.findOne(mockPlatform.id);

      expect(result).toEqual(mockPlatform);
      expect(mockPrismaService.platform.findUnique).toHaveBeenCalledWith({
        where: { id: mockPlatform.id },
      });
    });

    it('should throw NotFoundException if platform not found', async () => {
      mockPrismaService.platform.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a platform', async () => {
      const updateDto = { name: 'Alfortville Updated' };
      const updatedPlatform = { ...mockPlatform, ...updateDto };

      mockPrismaService.platform.findUnique.mockResolvedValue(mockPlatform);
      mockPrismaService.platform.update.mockResolvedValue(updatedPlatform);

      const result = await service.update(mockPlatform.id, updateDto);

      expect(result).toEqual(updatedPlatform);
      expect(mockPrismaService.platform.update).toHaveBeenCalledWith({
        where: { id: mockPlatform.id },
        data: updateDto,
      });
    });

    it('should throw ConflictException for duplicate code on update', async () => {
      const updateDto = { code: 'GARONOR' };

      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);

      mockPrismaService.platform.findUnique.mockResolvedValue(mockPlatform);
      mockPrismaService.platform.update.mockRejectedValue(prismaError);

      await expect(service.update(mockPlatform.id, updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
