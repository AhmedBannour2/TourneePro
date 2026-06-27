import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { NotFoundException } from '@nestjs/common';
import { EmployeeRole } from './dto/create-employee.dto';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const mockPrismaService = {
    employee: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEmployee = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    phone: '+33612345678',
    role: EmployeeRole.CHAUFFEUR,
    address: null,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    userId: null,
    user: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: CloudinaryService,
          useValue: { uploadBuffer: jest.fn(), deleteByUrl: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an employee', async () => {
      const dto = {
        firstName: 'Jean',
        lastName: 'Dupont',
        role: EmployeeRole.CHAUFFEUR,
        phone: '+33612345678',
      };
      mockPrismaService.employee.create.mockResolvedValue(mockEmployee);
      const result = await service.create(dto);
      expect(result).toEqual(mockEmployee);
    });
  });

  describe('findAll', () => {
    it('should return an array of employees', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([mockEmployee]);
      const result = await service.findAll();
      expect(result).toEqual([mockEmployee]);
    });
  });

  describe('findOne', () => {
    it('should return an employee', async () => {
      mockPrismaService.employee.findUnique.mockResolvedValue(mockEmployee);
      const result = await service.findOne(mockEmployee.id);
      expect(result).toEqual(mockEmployee);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.employee.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an employee', async () => {
      const dto = { firstName: 'Jean', lastName: 'Updated' };
      const updated = { ...mockEmployee, name: 'Jean Updated', lastName: 'Updated' };
      mockPrismaService.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrismaService.employee.update.mockResolvedValue(updated);
      const result = await service.update(mockEmployee.id, dto);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.employee.findUnique.mockResolvedValue(null);
      await expect(service.update('non-existent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete an employee', async () => {
      mockPrismaService.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrismaService.employee.update.mockResolvedValue({ ...mockEmployee, isActive: false });
      const result = await service.remove(mockEmployee.id);
      expect(result.isActive).toBe(false);
    });
  });
});
