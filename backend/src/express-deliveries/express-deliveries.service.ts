import {
  Injectable,
  Logger,
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
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateExpressDeliveryDto } from './dto/create-express-delivery.dto';
import { AssignExpressDeliveryDto } from './dto/assign-express-delivery.dto';
import { ConfirmExpressDeliveryDto } from './dto/confirm-express-delivery.dto';
import { UpdateExpressDeliveryDto } from './dto/update-express-delivery.dto';
import { GetExpressDeliveriesQueryDto } from './dto/get-express-deliveries-query.dto';

const EXPRESS_PAY: Record<ExpressDeliveryType, number> = {
  STANDARD: 30,
  GV: 50,
  AUTRE: 0,
};

function toMissionType(type: ExpressDeliveryType): ExpressMissionType {
  if (type === ExpressDeliveryType.GV) return ExpressMissionType.GV;
  if (type === ExpressDeliveryType.AUTRE) return ExpressMissionType.AUTRE;
  return ExpressMissionType.STANDARD;
}

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
  confirmationPhotos: {
    orderBy: { uploadedAt: 'asc' as const },
  },
} as const;

@Injectable()
export class ExpressDeliveriesService {
  private readonly logger = new Logger(ExpressDeliveriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

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
        pay: dto.pay ?? null,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        createdById: userId,
      },
      include: DELIVERY_INCLUDE,
    });

    if (dto.employeeIds && dto.employeeIds.length > 0) {
      await this.doAssign(delivery.id, dto.employeeIds, dto.type, delivery.date, userId, dto.pay);
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

    if (delivery.status === ExpressDeliveryStatus.CANCELLED) {
      throw new BadRequestException('Cannot assign a cancelled express delivery');
    }

    const isConfirmed = delivery.status === ExpressDeliveryStatus.CONFIRMED;

    // Remove assignments no longer in the list
    const existing = delivery.assignments.map((a) => a.employeeId);
    const toRemove = existing.filter((eid) => !dto.employeeIds.includes(eid));
    if (toRemove.length > 0) {
      await this.prisma.expressAssignment.deleteMany({
        where: { expressDeliveryId: id, employeeId: { in: toRemove } },
      });
    }

    await this.doAssign(
      id,
      dto.employeeIds,
      delivery.type,
      delivery.date,
      userId,
      delivery.pay ?? undefined,
      isConfirmed, // skip WorkedDay creation when already confirmed
    );

    if (!isConfirmed) {
      await this.prisma.expressDelivery.update({
        where: { id },
        data: { status: ExpressDeliveryStatus.ASSIGNED },
      });
    }

    return this.findOne(id);
  }

  // ── Upload photo ───────────────────────────────────────────────────────────

  async savePhoto(id: string, file: Express.Multer.File) {
    await this.findOne(id);
    const url = await this.cloudinary.uploadBuffer(
      file.buffer,
      file.mimetype,
      `tournee-pro/express/${id}`,
      file.originalname,
    );
    this.logger.log(`Express photo uploaded to Cloudinary: ${url}`);
    await this.prisma.expressDelivery.update({
      where: { id },
      data: { photo: url },
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

    if (delivery.status === ExpressDeliveryStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled express delivery');
    }

    const data: any = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.pay !== undefined) data.pay = dto.pay;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.endTime !== undefined) data.endTime = dto.endTime;

    if (Object.keys(data).length === 0) return delivery;
    await this.prisma.expressDelivery.update({ where: { id }, data });
    return this.findOne(id);
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(id: string) {
    const delivery = await this.findOne(id);
    if (delivery.status === ExpressDeliveryStatus.CONFIRMED) {
      throw new BadRequestException('Cannot cancel a confirmed express delivery');
    }

    // Remove WorkedDay entries that were created when this delivery was assigned
    const utcDate = this.utcMidnight(delivery.date);
    const missionType = toMissionType(delivery.type);

    for (const assignment of delivery.assignments) {
      const workedDay = await this.prisma.workedDay.findFirst({
        where: {
          employeeId: assignment.employee.id,
          date: utcDate,
          status: { not: WorkedDayStatus.CANCELLED },
        },
        include: { expressMissions: true },
      });

      if (!workedDay) continue;

      // Match by type + pay (best effort — no FK from ExpressMission to ExpressDelivery)
      const missionToRemove = workedDay.expressMissions.find(
        (m) => m.type === missionType && m.pay === assignment.pay,
      );

      if (!missionToRemove) continue;

      await this.prisma.expressMission.delete({ where: { id: missionToRemove.id } });

      const remaining = workedDay.expressMissions.filter((m) => m.id !== missionToRemove.id);

      // If this WorkedDay existed only for this express mission, delete it entirely
      if (!workedDay.tourId && workedDay.basePay === 0 && remaining.length === 0) {
        await this.prisma.workedDay.delete({ where: { id: workedDay.id } });
      } else {
        const expressTotal = remaining.reduce((s, m) => s + m.pay, 0);
        const finalPay = (workedDay.overridePay ?? workedDay.basePay) + expressTotal;
        await this.prisma.workedDay.update({ where: { id: workedDay.id }, data: { finalPay } });
      }
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
            confirmationPhotos: { orderBy: { uploadedAt: 'asc' } },
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
        photo: delivery.photo?.startsWith('https://') ? delivery.photo : null,
        notes: delivery.notes,
        pay: a.pay,
        startTime: delivery.startTime,
        endTime: delivery.endTime,
        confirmedAt: a.confirmedAt,
        partner: partner ? partner.employee : null,
        confirmationPhotos: delivery.confirmationPhotos,
      };
    });
  }

  // ── Confirmation photos ────────────────────────────────────────────────────

  async addConfirmationPhoto(id: string, file: Express.Multer.File) {
    await this.findOne(id);
    const url = await this.cloudinary.uploadBuffer(
      file.buffer,
      file.mimetype,
      `tournee-pro/express/${id}/confirmation`,
      file.originalname,
    );
    this.logger.log(`Confirmation photo uploaded: ${url}`);
    await this.prisma.expressDeliveryPhoto.create({ data: { expressDeliveryId: id, url } });
    return this.findOne(id);
  }

  async deleteConfirmationPhoto(id: string, photoId: string) {
    const photo = await this.prisma.expressDeliveryPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.expressDeliveryId !== id) throw new NotFoundException('Photo not found');
    await this.cloudinary.deleteByUrl(photo.url);
    await this.prisma.expressDeliveryPhoto.delete({ where: { id: photoId } });
  }

  async getConfirmationPhoto(id: string, photoId: string) {
    const photo = await this.prisma.expressDeliveryPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.expressDeliveryId !== id) throw new NotFoundException('Photo not found');
    return this.cloudinary.downloadFile(photo.url);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async doAssign(
    deliveryId: string,
    employeeIds: string[],
    type: ExpressDeliveryType,
    date: Date,
    userId: string,
    customPay?: number,
    skipWorkedDays = false,
  ) {
    const pay = customPay ?? EXPRESS_PAY[type];
    const utcDate = this.utcMidnight(date);
    const missionType = toMissionType(type);

    for (const employeeId of employeeIds) {
      const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
      if (!employee.isActive) {
        throw new BadRequestException(`Employee ${employee.name} is not active`);
      }

      const existing = await this.prisma.expressAssignment.findUnique({
        where: { expressDeliveryId_employeeId: { expressDeliveryId: deliveryId, employeeId } },
      });

      if (!existing) {
        await this.prisma.expressAssignment.create({
          data: { expressDeliveryId: deliveryId, employeeId, pay },
        });

        if (!skipWorkedDays) {
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
