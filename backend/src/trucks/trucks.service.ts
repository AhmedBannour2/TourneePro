import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateRepairLogDto } from './dto/create-repair-log.dto';
import { UpdateTruckStatusDto, TruckStatus } from './dto/update-truck-status.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TrucksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTruckDto: CreateTruckDto) {
    try {
      return await this.prisma.truck.create({
        data: {
          ...createTruckDto,
          isAvailable: createTruckDto.isAvailable ?? true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Truck with immatriculation ${createTruckDto.immatriculation} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async findAll(isAvailable?: boolean) {
    return this.prisma.truck.findMany({
      where: isAvailable !== undefined ? { isAvailable } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const truck = await this.prisma.truck.findUnique({
      where: { id },
    });

    if (!truck) {
      throw new NotFoundException(`Truck with ID ${id} not found`);
    }

    return truck;
  }

  async update(id: string, updateTruckDto: UpdateTruckDto) {
    // Check if truck exists
    await this.findOne(id);

    try {
      return await this.prisma.truck.update({
        where: { id },
        data: updateTruckDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Truck with immatriculation ${updateTruckDto.immatriculation} already exists`,
          );
        }
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.truck.delete({ where: { id } });
  }

  async getHistory(id: string) {
    await this.findOne(id);

    const [assignments, repairs] = await Promise.all([
      this.prisma.truckAssignmentHistory.findMany({
        where: { truckId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.truckRepairLog.findMany({
        where: { truckId: id },
        include: { createdBy: { select: { id: true, email: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    return { assignments, repairs };
  }

  async createRepairLog(id: string, dto: CreateRepairLogDto, userId?: string) {
    await this.findOne(id);

    return this.prisma.truckRepairLog.create({
      data: {
        truckId: id,
        date: new Date(dto.date),
        type: dto.type,
        description: dto.description,
        cost: dto.cost ?? null,
        createdById: userId ?? null,
      },
      include: { createdBy: { select: { id: true, email: true } } },
    });
  }

  async updateStatus(id: string, dto: UpdateTruckStatusDto, userId?: string) {
    await this.findOne(id);

    const truck = await this.prisma.truck.update({
      where: { id },
      data: {
        status: dto.status,
        isAvailable: dto.status === TruckStatus.AVAILABLE,
      },
    });

    if (dto.status === TruckStatus.IN_REPAIR) {
      await this.prisma.truckRepairLog.create({
        data: {
          truckId: id,
          date: new Date(),
          type: 'BREAKDOWN',
          description: dto.reason ?? 'Marked as in repair',
          createdById: userId ?? null,
        },
      });
    }

    return truck;
  }
}
