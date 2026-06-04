import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpressDeliveryDto } from './dto/create-express-delivery.dto';
import { UpdateExpressDeliveryDto } from './dto/update-express-delivery.dto';
import { GetExpressDeliveriesQueryDto } from './dto/get-express-deliveries-query.dto';

@Injectable()
export class ExpressDeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateExpressDeliveryDto) {
    return this.prisma.expressDelivery.create({
      data: {
        address: createDto.address,
        date: new Date(createDto.date),
        assigneeId: createDto.assigneeId || null,
        truckId: createDto.truckId || null,
        notes: createDto.notes || null,
        status: 'PENDING',
      },
      include: {
        assignee: true,
        truck: true,
      },
    });
  }

  async findAll(query: GetExpressDeliveriesQueryDto) {
    const { date, status } = query;
    const where: any = {};

    if (date) {
      const dateObj = new Date(date);
      where.date = {
        gte: new Date(dateObj.setHours(0, 0, 0, 0)),
        lt: new Date(dateObj.setHours(23, 59, 59, 999)),
      };
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.expressDelivery.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        assignee: true,
        truck: true,
      },
    });
  }

  async findOne(id: string) {
    const delivery = await this.prisma.expressDelivery.findUnique({
      where: { id },
      include: {
        assignee: true,
        truck: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException(
        `Express delivery with ID ${id} not found`,
      );
    }

    return delivery;
  }

  async update(id: string, updateDto: UpdateExpressDeliveryDto) {
    await this.findOne(id);

    const data: any = {
      ...updateDto,
    };

    if (updateDto.date) {
      data.date = new Date(updateDto.date);
    }

    return this.prisma.expressDelivery.update({
      where: { id },
      data,
      include: {
        assignee: true,
        truck: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft delete: set status to CANCELLED
    return this.prisma.expressDelivery.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        assignee: true,
        truck: true,
      },
    });
  }
}
