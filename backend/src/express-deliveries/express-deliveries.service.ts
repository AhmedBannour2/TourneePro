import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ExpressDeliveryType,
  ExpressDeliveryStatus,
  ExpressMissionType,
  EmployeeRole,
  WorkedDayStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpressDeliveryDto } from './dto/create-express-delivery.dto';
import { AssignExpressDeliveryDto } from './dto/assign-express-delivery.dto';
import { ConfirmExpressDeliveryDto } from './dto/confirm-express-delivery.dto';
import { UpdateExpressDeliveryDto } from './dto/update-express-delivery.dto';
import { GetExpressDeliveriesQueryDto } from './dto/get-express-deliveries-query.dto';

const EXPRESS_PAY: Record<ExpressDeliveryType, number> = {
  STANDARD: 30,
  GV: 50,
};

const DELIVERY_INCLUDE = {
  createdBy: { select: { id: true, email: true } },
  assignments: {
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
        },
      },
    },
    orderBy: { confirmedAt: 'asc' as const },
  },
} as const;

@Injectable()
export class ExpressDeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  private utcMidnight(date: string | Date): Date {
    const d = new Date(date);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(dto: CreateExpressDeliveryDto, userId: string) {
    const delivery = await this.prisma.expressDelivery.create({
      data: {
        type: dto.type,
        date: new Date(dto.date),
        notes: dto.notes ?? null,
        createdById: userId,
      },
      include: DELIVERY_INCLUDE,
    });

    if (dto.employeeIds && dto.employeeIds.length > 0) {
      await this.doAssign(delivery.id, dto.employeeIds, dto.type, delivery.date, userId);
      await this.prisma.expressDelivery.update({
        where: { id: delivery.id },
        data: { status: ExpressDeliveryStatus.ASSIGNED },
      });
      return this.findOne(delivery.id);
    }

    return delivery;
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async findAll(query: GetExpressDeliveriesQueryDto) {
    const where: any = {};

    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const d = new Date(query.dateTo);
        d.setUTCHours(23, 59, 59, 999);
        where.date.lte = d;
      }
    }

    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.employeeId) {
      where.assignments = { some: { employeeId: query.employeeId } };
    }

    return this.prisma.expressDelivery.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: DELIVERY_INCLUDE,
    });
  }

  // ── Find one ───────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const delivery = await this.prisma.expressDelivery.findUnique({
      where: { id },
      include: DELIVERY_INCLUDE,
    });
    if (!delivery) throw new NotFoundException(`Express delivery ${id} not found`);
    return delivery;
  }

  // ── Assign employees ───────────────────────────────────────────────────────

  async assign(id: string, dto: AssignExpressDeliveryDto, userId: string) {
    const delivery = await this.findOne(id);

    if (delivery.status === ExpressDeliveryStatus.CONFIRMED) {
      throw new BadRequestException('Cannot reassign a confirmed express delivery');
    }
    if (delivery.status === ExpressDeliveryStatus.CANCELLED) {
      throw new BadRequestException('Cannot assign a cancelled express delivery');
    }

    // Remove assignments that are no longer in the new list
    const existing = delivery.assignments.map((a) => a.employeeId);
    const toRemove = existing.filter((eid) => !dto.employeeIds.includes(eid));
    if (toRemove.length > 0) {
      await this.prisma.expressAssignment.deleteMany({
        where: { expressDeliveryId: id, employeeId: { in: toRemove } },
      });
    }

    await this.doAssign(id, dto.employeeIds, delivery.type, delivery.date, userId);

    await this.prisma.expressDelivery.update({
      where: { id },
      data: { status: ExpressDeliveryStatus.ASSIGNED },
    });

    return this.findOne(id);
  }

  // ── Upload photo ───────────────────────────────────────────────────────────

  async savePhoto(id: string, filePath: string) {
    await this.findOne(id);
    await this.prisma.expressDelivery.update({
      where: { id },
      data: { photo: filePath },
    });
    return this.findOne(id);
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  async confirm(id: string, userId: string, dto: ConfirmExpressDeliveryDto) {
    const delivery = await this.findOne(id);

    if (delivery.status === ExpressDeliveryStatus.CONFIRMED) {
      return delivery; // idempotent
    }
    if (delivery.status === ExpressDeliveryStatus.CANCELLED) {
      throw new BadRequestException('Cannot confirm a cancelled express delivery');
    }
    if (delivery.status === ExpressDeliveryStatus.PENDING) {
      throw new BadRequestException('Cannot confirm an unassigned express delivery');
    }

    // Verify the calling user is an assigned employee
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new ForbiddenException('No employee profile linked to this account');

    const isAssigned = delivery.assignments.some((a) => a.employeeId === employee.id);
    if (!isAssigned) throw new ForbiddenException('You are not assigned to this express delivery');

    const now = new Date();

    // Mark all assignments confirmed
    await this.prisma.expressAssignment.updateMany({
      where: { expressDeliveryId: id },
      data: { confirmedAt: now, confirmedNotes: dto.notes ?? null },
    });

    // Mark delivery confirmed, append notes if provided
    await this.prisma.expressDelivery.update({
      where: { id },
      data: {
        status: ExpressDeliveryStatus.CONFIRMED,
        ...(dto.notes ? { notes: dto.notes } : {}),
      },
    });

    // Confirm express-only WorkedDays (those with no linked tour)
    const utcDate = this.utcMidnight(delivery.date);
    for (const a of delivery.assignments) {
      await this.prisma.workedDay.updateMany({
        where: {
          employeeId: a.employeeId,
          date: utcDate,
          tourId: null,
          status: WorkedDayStatus.ASSIGNED,
        },
        data: { status: WorkedDayStatus.CONFIRMED, confirmedAt: now },
      });
    }

    return this.findOne(id);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateExpressDeliveryDto) {
    const delivery = await this.findOne(id);
    if (delivery.status === ExpressDeliveryStatus.CONFIRMED) {
      throw new BadRequestException('Cannot update a confirmed express delivery');
    }

    const data: any = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.notes !== undefined) data.notes = dto.notes;

    await this.prisma.expressDelivery.update({ where: { id }, data });
    return this.findOne(id);
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(id: string) {
    const delivery = await this.findOne(id);
    if (delivery.status === ExpressDeliveryStatus.CONFIRMED) {
      throw new BadRequestException('Cannot cancel a confirmed express delivery');
    }

    await this.prisma.expressDelivery.update({
      where: { id },
      data: { status: ExpressDeliveryStatus.CANCELLED },
    });
    return this.findOne(id);
  }

  // ── Employee: my express assignments ──────────────────────────────────────

  async getMyExpress(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('No employee profile linked to this account');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const assignments = await this.prisma.expressAssignment.findMany({
      where: {
        employeeId: employee.id,
        expressDelivery: {
          date: { gte: thirtyDaysAgo },
          status: { not: ExpressDeliveryStatus.CANCELLED },
        },
      },
      include: {
        expressDelivery: {
          include: {
            assignments: {
              include: {
                employee: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: { expressDelivery: { date: 'asc' } },
    });

    return assignments.map((a) => {
      const delivery = a.expressDelivery;
      const partner = delivery.assignments.find((x) => x.employeeId !== employee.id);
      return {
        id: delivery.id,
        type: delivery.type,
        date: delivery.date,
        status: delivery.status,
        photo: delivery.photo,
        notes: delivery.notes,
        pay: a.pay,
        confirmedAt: a.confirmedAt,
        partner: partner ? partner.employee : null,
      };
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async doAssign(
    deliveryId: string,
    employeeIds: string[],
    type: ExpressDeliveryType,
    date: Date,
    userId: string,
  ) {
    const pay = EXPRESS_PAY[type];
    const utcDate = this.utcMidnight(date);
    const missionType =
      type === ExpressDeliveryType.GV ? ExpressMissionType.GV : ExpressMissionType.STANDARD;

    for (const employeeId of employeeIds) {
      const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
      if (!employee.isActive) {
        throw new BadRequestException(`Employee ${employee.name} is not active`);
      }

      // Upsert the assignment record
      const existing = await this.prisma.expressAssignment.findUnique({
        where: { expressDeliveryId_employeeId: { expressDeliveryId: deliveryId, employeeId } },
      });

      if (!existing) {
        await this.prisma.expressAssignment.create({
          data: { expressDeliveryId: deliveryId, employeeId, pay },
        });

        // Integrate with WorkedDay
        await this.integrateWithWorkedDay(
          employeeId,
          employee.role,
          utcDate,
          missionType,
          pay,
          userId,
        );
      }
    }
  }

  private async integrateWithWorkedDay(
    employeeId: string,
    employeeRoleStr: string,
    utcDate: Date,
    missionType: ExpressMissionType,
    pay: number,
    userId: string,
  ) {
    // Find existing non-cancelled WorkedDay for this employee+date
    const existingWD = await this.prisma.workedDay.findFirst({
      where: {
        employeeId,
        date: utcDate,
        status: { not: WorkedDayStatus.CANCELLED },
      },
      include: { expressMissions: true },
    });

    if (existingWD) {
      // Add express mission to the existing worked day
      await this.prisma.expressMission.create({
        data: {
          workedDayId: existingWD.id,
          type: missionType,
          pay,
          addedById: userId,
        },
      });
      // Recalculate finalPay
      const expressTotal = existingWD.expressMissions.reduce((s, m) => s + m.pay, 0) + pay;
      const finalPay = (existingWD.overridePay ?? existingWD.basePay) + expressTotal;
      await this.prisma.workedDay.update({ where: { id: existingWD.id }, data: { finalPay } });
    } else {
      // No regular tour that day — create an express-only WorkedDay
      const employeeRole =
        employeeRoleStr === 'CHAUFFEUR' ? EmployeeRole.CHAUFFEUR : EmployeeRole.AIDE;

      await this.prisma.workedDay.create({
        data: {
          employeeId,
          date: utcDate,
          tourType: null,
          employeeRole,
          basePay: 0,
          finalPay: pay,
          status: WorkedDayStatus.ASSIGNED,
          expressMissions: {
            create: { type: missionType, pay, addedById: userId },
          },
        },
      });
    }
  }
}
