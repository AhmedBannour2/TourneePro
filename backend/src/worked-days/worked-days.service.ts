import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TourType, EmployeeRole, WorkedDayStatus, ExpressMissionType } from '@prisma/client';
import { GetWorkedDaysQueryDto } from './dto/get-worked-days-query.dto';
import { OverrideWorkedDayDto } from './dto/override-worked-day.dto';
import { AddExpressDto } from './dto/add-express.dto';
import { CreateManualWorkedDayDto } from './dto/create-manual-worked-day.dto';
import { WorkedDaysSummaryResponseDto } from './dto/worked-days-summary-response.dto';

// ── System defaults ──────────────────────────────────────────────────────────

export const SYSTEM_PAY_DEFAULTS: Record<
  TourType,
  { chauffeurRate: number; aideRate: number | null }
> = {
  STANDARD: { chauffeurRate: 80, aideRate: 60 },
  GV: { chauffeurRate: 115, aideRate: 110 },
  INSTALL: { chauffeurRate: 100, aideRate: 110 },
  MONO: { chauffeurRate: 90, aideRate: null },
  SPECIAL: { chauffeurRate: 100, aideRate: 100 },
};

export const EXPRESS_PAY: Record<ExpressMissionType, number> = {
  STANDARD: 30,
  GV: 50,
  AUTRE: 0,
};

// ── Tour type detection from tour code ────────────────────────────────────────

export function detectTourType(tourCode: string): TourType {
  const num = parseInt(tourCode, 10);
  if (isNaN(num)) return TourType.STANDARD;
  if (num >= 500 && num <= 599) return TourType.INSTALL;
  if (num >= 600 && num <= 699) return TourType.MONO;
  if (num >= 700 && num <= 799) return TourType.GV;
  if (num >= 800 && num <= 889) return TourType.STANDARD;
  if (num >= 890 && num <= 999) return TourType.SPECIAL;
  return TourType.STANDARD;
}

// ── Shared include ────────────────────────────────────────────────────────────

const WORKED_DAY_INCLUDE = {
  employee: { select: { id: true, name: true, firstName: true, lastName: true, role: true } },
  tour: {
    select: {
      id: true,
      tourCode: true,
      date: true,
      platform: { select: { name: true, code: true } },
    },
  },
  expressMissions: {
    include: { addedBy: { select: { id: true, email: true } } },
    orderBy: { addedAt: 'asc' as const },
  },
  overrideBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class WorkedDaysService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Pay rate lookup ────────────────────────────────────────────────────────

  async getPayRate(employeeId: string, tourType: TourType, role: EmployeeRole): Promise<number> {
    // Priority 1: employee-specific override
    const custom = await this.prisma.employeePayRate.findUnique({
      where: { employeeId_tourType: { employeeId, tourType } },
    });
    if (custom) {
      return role === EmployeeRole.CHAUFFEUR ? custom.chauffeurRate : (custom.aideRate ?? 0);
    }

    // Priority 2: global pay rate set by dispatcher
    const global = await this.prisma.globalPayRate.findUnique({ where: { tourType } });
    if (global) {
      return role === EmployeeRole.CHAUFFEUR ? global.chauffeurRate : (global.aideRate ?? 0);
    }

    // Priority 3: hardcoded system fallback
    const defaults = SYSTEM_PAY_DEFAULTS[tourType];
    return role === EmployeeRole.CHAUFFEUR ? defaults.chauffeurRate : (defaults.aideRate ?? 0);
  }

  // For custom platforms (Creil, Coignières…): check platform-specific rate first.
  // Returns null if no platform rate is configured (caller falls back to tour-type rate).
  private async getPlatformPayRate(
    employeeId: string,
    platformId: string,
    role: EmployeeRole,
  ): Promise<number | null> {
    // Priority 1: employee override for this platform
    const empRate = await this.prisma.employeePlatformPayRate.findUnique({
      where: { employeeId_platformId: { employeeId, platformId } },
    });
    if (empRate && empRate.chauffeurRate > 0) {
      return role === EmployeeRole.CHAUFFEUR ? empRate.chauffeurRate : (empRate.aideRate ?? 0);
    }

    // Priority 2: global platform rate
    const platRate = await this.prisma.platformPayRate.findUnique({ where: { platformId } });
    if (platRate && platRate.chauffeurRate > 0) {
      return role === EmployeeRole.CHAUFFEUR ? platRate.chauffeurRate : (platRate.aideRate ?? 0);
    }

    return null;
  }

  // ── finalPay recalculation ─────────────────────────────────────────────────

  private computeFinalPay(
    basePay: number,
    overridePay: number | null,
    expressMissionsTotal: number,
  ): number {
    return (overridePay ?? basePay) + expressMissionsTotal;
  }

  private async recalcAndSaveFinalPay(workedDayId: string): Promise<number> {
    const wd = await this.prisma.workedDay.findUniqueOrThrow({
      where: { id: workedDayId },
      include: { expressMissions: true },
    });
    const expressTotal = wd.expressMissions.reduce((s, m) => s + m.pay, 0);
    const finalPay = this.computeFinalPay(wd.basePay, wd.overridePay, expressTotal);
    await this.prisma.workedDay.update({ where: { id: workedDayId }, data: { finalPay } });
    return finalPay;
  }

  // ── Auto-create from tour assignment ──────────────────────────────────────

  async createFromAssignment(params: {
    tourId: string;
    tourCode: string;
    tourDate: Date;
    chauffeurId: string | null;
    aideId: string | null;
    platformId?: string | null;
  }) {
    const { tourId, tourCode, tourDate, chauffeurId, aideId, platformId } = params;
    const tourType = detectTourType(tourCode);
    // Use UTC midnight to avoid timezone offset shifting the stored date
    const d = new Date(tourDate);
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    // Cancel any existing ASSIGNED worked days for this tour (handles re-assignment)
    await this.prisma.workedDay.updateMany({
      where: { tourId, status: WorkedDayStatus.ASSIGNED },
      data: { status: WorkedDayStatus.CANCELLED },
    });

    const resolveBasePay = async (employeeId: string, role: EmployeeRole): Promise<number> => {
      if (platformId) {
        const platPay = await this.getPlatformPayRate(employeeId, platformId, role);
        if (platPay !== null) return platPay;
      }
      return this.getPayRate(employeeId, tourType, role);
    };

    const creates: Promise<any>[] = [];

    if (chauffeurId) {
      const basePay = await resolveBasePay(chauffeurId, EmployeeRole.CHAUFFEUR);
      creates.push(
        this.prisma.workedDay.create({
          data: {
            employeeId: chauffeurId,
            tourId,
            date,
            tourType,
            employeeRole: EmployeeRole.CHAUFFEUR,
            basePay,
            finalPay: basePay,
            status: WorkedDayStatus.ASSIGNED,
          },
        }),
      );
    }

    if (aideId) {
      const basePay = await resolveBasePay(aideId, EmployeeRole.AIDE);
      creates.push(
        this.prisma.workedDay.create({
          data: {
            employeeId: aideId,
            tourId,
            date,
            tourType,
            employeeRole: EmployeeRole.AIDE,
            basePay,
            finalPay: basePay,
            status: WorkedDayStatus.ASSIGNED,
          },
        }),
      );
    }

    await Promise.all(creates);
  }

  async cancelFromUnassignment(tourId: string) {
    await this.prisma.workedDay.updateMany({
      where: { tourId, status: WorkedDayStatus.ASSIGNED },
      data: { status: WorkedDayStatus.CANCELLED },
    });
  }

  // ── Manual creation (dispatcher) ──────────────────────────────────────────

  async createManual(dto: CreateManualWorkedDayDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const basePay = await this.getPayRate(dto.employeeId, dto.tourType, dto.employeeRole);
    const date = new Date(dto.date);

    return this.prisma.workedDay.create({
      data: {
        employeeId: dto.employeeId,
        tourId: dto.tourId ?? null,
        date,
        tourType: dto.tourType,
        employeeRole: dto.employeeRole,
        basePay,
        finalPay: basePay,
        status: WorkedDayStatus.ASSIGNED,
      },
      include: WORKED_DAY_INCLUDE,
    });
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async findAll(query: GetWorkedDaysQueryDto) {
    const { employeeId, month, year } = query;
    const where: any = {};

    if (employeeId) where.employeeId = employeeId;

    const m = month ?? new Date().getMonth() + 1;
    const y = year ?? new Date().getFullYear();
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
    where.date = { gte: startOfMonth, lte: endOfMonth };

    return this.prisma.workedDay.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: WORKED_DAY_INCLUDE,
    });
  }

  async findOne(id: string) {
    const wd = await this.prisma.workedDay.findUnique({
      where: { id },
      include: WORKED_DAY_INCLUDE,
    });
    if (!wd) throw new NotFoundException(`WorkedDay ${id} not found`);
    return wd;
  }

  // ── Confirm (employee only) ────────────────────────────────────────────────

  async confirm(id: string, userId: string) {
    const wd = await this.findOne(id);

    // Ensure it belongs to the calling employee
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee || employee.id !== wd.employeeId) {
      throw new ForbiddenException('You can only confirm your own worked days');
    }

    if (wd.status === WorkedDayStatus.CANCELLED) {
      throw new BadRequestException('Cannot confirm a cancelled worked day');
    }
    if (wd.status === WorkedDayStatus.CONFIRMED) {
      return wd; // idempotent
    }

    return this.prisma.workedDay.update({
      where: { id },
      data: {
        status: WorkedDayStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      include: WORKED_DAY_INCLUDE,
    });
  }

  // ── Override (dispatcher only) ────────────────────────────────────────────

  async override(id: string, dto: OverrideWorkedDayDto, userId: string) {
    await this.findOne(id);

    await this.prisma.workedDay.update({
      where: { id },
      data: {
        overridePay: dto.overridePay,
        overrideNote: dto.overrideNote ?? null,
        overrideById: userId,
        overrideAt: new Date(),
      },
    });

    await this.recalcAndSaveFinalPay(id);
    return this.findOne(id);
  }

  // ── Cancel (dispatcher only) ──────────────────────────────────────────────

  async cancel(id: string) {
    const wd = await this.findOne(id);
    if (wd.status === WorkedDayStatus.CONFIRMED) {
      throw new BadRequestException('Cannot cancel a confirmed worked day');
    }
    return this.prisma.workedDay.update({
      where: { id },
      data: { status: WorkedDayStatus.CANCELLED },
      include: WORKED_DAY_INCLUDE,
    });
  }

  // ── Express missions ──────────────────────────────────────────────────────

  async addExpress(id: string, dto: AddExpressDto, userId: string) {
    await this.findOne(id);

    await this.prisma.expressMission.create({
      data: {
        workedDayId: id,
        type: dto.type,
        pay: EXPRESS_PAY[dto.type],
        notes: dto.notes ?? null,
        addedById: userId,
      },
    });

    await this.recalcAndSaveFinalPay(id);
    return this.findOne(id);
  }

  async removeExpress(id: string, expressId: string) {
    await this.findOne(id);

    const mission = await this.prisma.expressMission.findUnique({ where: { id: expressId } });
    if (!mission || mission.workedDayId !== id) {
      throw new NotFoundException('Express mission not found');
    }

    await this.prisma.expressMission.delete({ where: { id: expressId } });
    await this.recalcAndSaveFinalPay(id);
    return this.findOne(id);
  }

  // ── Summary (dispatcher payroll view) ─────────────────────────────────────

  async getSummary(query: {
    month?: number;
    year?: number;
  }): Promise<WorkedDaysSummaryResponseDto> {
    const m = query.month ?? new Date().getMonth() + 1;
    const y = query.year ?? new Date().getFullYear();
    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);

    const workedDays = await this.prisma.workedDay.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      include: {
        employee: { select: { id: true, name: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Group by employee
    const byEmployee = new Map<string, typeof workedDays>();
    for (const wd of workedDays) {
      const key = wd.employeeId;
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key)!.push(wd);
    }

    const employees = Array.from(byEmployee.values()).map((days) => {
      const emp = days[0].employee;
      const nonCancelled = days.filter((d) => d.status !== WorkedDayStatus.CANCELLED);
      const confirmed = days.filter((d) => d.status === WorkedDayStatus.CONFIRMED);
      const cancelled = days.filter((d) => d.status === WorkedDayStatus.CANCELLED);
      const unconfirmed = days.filter((d) => d.status === WorkedDayStatus.ASSIGNED);
      const totalFinalPay = nonCancelled.reduce((s, d) => s + d.finalPay, 0);

      // Group by tour type (null = express-only day)
      const tourTypeMap = new Map<string, { count: number; totalPay: number }>();
      for (const d of nonCancelled) {
        const tt = d.tourType ?? 'EXPRESS';
        if (!tourTypeMap.has(tt)) tourTypeMap.set(tt, { count: 0, totalPay: 0 });
        const entry = tourTypeMap.get(tt)!;
        entry.count++;
        entry.totalPay += d.finalPay;
      }

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        firstName: emp.firstName,
        lastName: emp.lastName,
        totalWorkedDays: nonCancelled.length,
        confirmedCount: confirmed.length,
        unconfirmedCount: unconfirmed.length,
        cancelledCount: cancelled.length,
        totalFinalPay,
        byTourType: Array.from(tourTypeMap.entries()).map(([tourType, v]) => ({
          tourType,
          count: v.count,
          totalPay: v.totalPay,
        })),
      };
    });

    const totalWorkedDays = workedDays.filter((d) => d.status !== WorkedDayStatus.CANCELLED).length;
    const totalPayroll = employees.reduce((s, e) => s + e.totalFinalPay, 0);
    const unconfirmedDays = workedDays.filter((d) => d.status === WorkedDayStatus.ASSIGNED).length;
    const cancelledDays = workedDays.filter((d) => d.status === WorkedDayStatus.CANCELLED).length;

    return {
      month: m,
      year: y,
      totalWorkedDays,
      totalPayroll,
      unconfirmedDays,
      cancelledDays,
      employees,
    };
  }

  // ── Pay rates ─────────────────────────────────────────────────────────────

  async getPayRates(employeeId: string) {
    const custom = await this.prisma.employeePayRate.findMany({
      where: { employeeId },
    });
    const customMap = new Map(custom.map((r) => [r.tourType, r]));

    return Object.entries(SYSTEM_PAY_DEFAULTS).map(([tourType, defaults]) => {
      const c = customMap.get(tourType as TourType);
      return {
        tourType: tourType as TourType,
        chauffeurRate: c?.chauffeurRate ?? defaults.chauffeurRate,
        aideRate: c?.aideRate !== undefined ? c.aideRate : defaults.aideRate,
        isCustomChauffeur: c !== undefined && c.chauffeurRate !== defaults.chauffeurRate,
        isCustomAide: c !== undefined && (c.aideRate ?? null) !== defaults.aideRate,
        systemChauffeurRate: defaults.chauffeurRate,
        systemAideRate: defaults.aideRate,
      };
    });
  }

  async upsertPayRates(
    employeeId: string,
    rates: { tourType: TourType; chauffeurRate: number; aideRate?: number | null }[],
    userId: string,
  ) {
    await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });

    await Promise.all(
      rates.map((r) =>
        this.prisma.employeePayRate.upsert({
          where: { employeeId_tourType: { employeeId, tourType: r.tourType } },
          update: {
            chauffeurRate: r.chauffeurRate,
            aideRate: r.aideRate ?? null,
            updatedById: userId,
          },
          create: {
            employeeId,
            tourType: r.tourType,
            chauffeurRate: r.chauffeurRate,
            aideRate: r.aideRate ?? null,
            updatedById: userId,
          },
        }),
      ),
    );

    return this.getPayRates(employeeId);
  }
}
