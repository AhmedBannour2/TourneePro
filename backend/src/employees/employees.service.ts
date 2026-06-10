import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { unlinkSync } from 'fs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateEmployeeAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TourType } from '@prisma/client';
import { SYSTEM_PAY_DEFAULTS } from '../worked-days/worked-days.service';

const WITH_USER = {
  user: { select: { email: true } },
  responsibleTruck: { select: { id: true, immatriculation: true } },
} as const;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto) {
    const name = `${dto.firstName} ${dto.lastName}`.trim();
    return this.prisma.employee.create({
      data: {
        name,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        address: dto.address,
        isActive: dto.isActive ?? true,
      },
      include: WITH_USER,
    });
  }

  async findAll(isActive?: boolean) {
    return this.prisma.employee.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      include: WITH_USER,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: WITH_USER,
    });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const existing = await this.findOne(id);

    const firstName = dto.firstName ?? existing.firstName ?? undefined;
    const lastName = dto.lastName ?? existing.lastName ?? undefined;
    const name =
      firstName !== undefined && lastName !== undefined
        ? `${firstName} ${lastName}`.trim()
        : existing.name;

    return this.prisma.employee.update({
      where: { id },
      data: {
        name,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        address: dto.address,
        isActive: dto.isActive,
      },
      include: WITH_USER,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
      include: WITH_USER,
    });
  }

  // ── Account management ─────────────────────────────────────────────────────

  async createAccount(employeeId: string, dto: CreateEmployeeAccountDto) {
    const employee = await this.findOne(employeeId);

    if (employee.userId) {
      throw new ConflictException('Employee already has a login account');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email: dto.email, passwordHash, role: 'EMPLOYEE' },
      });
      await tx.employee.update({ where: { id: employeeId }, data: { userId: newUser.id } });
      return newUser;
    });

    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
  }

  async updateAccount(employeeId: string, dto: UpdateAccountDto) {
    const employee = await this.findOne(employeeId);

    if (!employee.userId) throw new NotFoundException('Employee has no account to update');

    const data: any = {};
    if (dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: employee.userId } },
      });
      if (conflict) throw new ConflictException('Email already registered');
      data.email = dto.email;
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const user = await this.prisma.user.update({ where: { id: employee.userId }, data });
    return { id: user.id, email: user.email, role: user.role };
  }

  // ── Self-service profile (employee editing their own record) ──────────────

  async getMyProfile(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: WITH_USER,
    });
    if (!employee) throw new NotFoundException('No employee profile linked to this account');
    return employee;
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const employee = await this.getMyProfile(userId);
    const firstName = dto.firstName ?? employee.firstName ?? undefined;
    const lastName = dto.lastName ?? employee.lastName ?? undefined;
    const name =
      firstName !== undefined && lastName !== undefined
        ? `${firstName} ${lastName}`.trim()
        : employee.name;

    return this.prisma.employee.update({
      where: { id: employee.id },
      data: {
        name,
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
      },
      include: WITH_USER,
    });
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  async listDocuments(employeeId: string) {
    await this.findOne(employeeId);
    return this.prisma.employeeDocument.findMany({
      where: { employeeId },
      include: { uploadedBy: { select: { email: true } } },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async createDocument(
    employeeId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    uploadedById?: string,
  ) {
    await this.findOne(employeeId);
    return this.prisma.employeeDocument.create({
      data: {
        employeeId,
        fileName: file.filename,
        originalName: file.originalname,
        fileType: dto.fileType,
        filePath: file.path,
        mimeType: file.mimetype,
        uploadedById: uploadedById ?? null,
      },
      include: { uploadedBy: { select: { email: true } } },
    });
  }

  async findDocument(employeeId: string, docId: string) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id: docId, employeeId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async deleteDocument(employeeId: string, docId: string) {
    const doc = await this.findDocument(employeeId, docId);
    try {
      unlinkSync(doc.filePath);
    } catch {
      /* file already gone */
    }
    return this.prisma.employeeDocument.delete({ where: { id: docId } });
  }

  // ── Employee dashboard (employee-facing) ───────────────────────────────────

  async getEmployeeDashboard(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('No employee profile is linked to this account');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const include = {
      platform: { select: { name: true } },
      assignments: {
        include: {
          chauffeur: { select: { id: true, name: true, phone: true } },
          aide: { select: { id: true, name: true, phone: true } },
          truck: { select: { immatriculation: true } },
        },
      },
    } as const;

    const assignmentFilter = {
      some: { OR: [{ chauffeurId: employee.id }, { aideId: employee.id }] },
    };

    const [upcomingRaw, historyRaw] = await Promise.all([
      this.prisma.tour.findMany({
        where: { date: { gte: todayStart }, assignments: assignmentFilter },
        include,
        orderBy: { date: 'asc' },
      }),
      this.prisma.tour.findMany({
        where: { date: { gte: thirtyDaysAgo, lt: todayStart }, assignments: assignmentFilter },
        include,
        orderBy: { date: 'desc' },
      }),
    ]);

    type PartnerShape = { id: string; name: string; phone: string | null } | null | undefined;
    const shape = (tours: typeof upcomingRaw) =>
      tours.map((tour) => {
        const assignment = tour.assignments[0];
        const isChauffeur = assignment?.chauffeurId === employee.id;
        const partner = (isChauffeur ? assignment?.aide : assignment?.chauffeur) as PartnerShape;
        return {
          id: tour.id,
          tourCode: tour.tourCode,
          date: tour.date,
          status: tour.status,
          platform: tour.platform.name,
          quai: tour.quai,
          horaire: tour.horaire,
          myRole: isChauffeur ? 'chauffeur' : 'aide',
          partner: partner
            ? { id: partner.id, name: partner.name, phone: partner.phone ?? null }
            : null,
          truck: assignment?.truck ? { immatriculation: assignment.truck.immatriculation } : null,
        };
      });

    return { upcoming: shape(upcomingRaw), history: shape(historyRaw) };
  }

  // ── Pay rates ─────────────────────────────────────────────────────────────

  async getPayRates(employeeId: string) {
    await this.findOne(employeeId);
    const [custom, globalRates] = await Promise.all([
      this.prisma.employeePayRate.findMany({ where: { employeeId } }),
      this.prisma.globalPayRate.findMany(),
    ]);
    const customMap = new Map(custom.map((r) => [r.tourType, r]));
    const globalMap = new Map(globalRates.map((r) => [r.tourType, r]));

    return Object.entries(SYSTEM_PAY_DEFAULTS).map(([tourType, sysDefaults]) => {
      const c = customMap.get(tourType as TourType);
      const g = globalMap.get(tourType as TourType);
      const globalChauffeur = g?.chauffeurRate ?? sysDefaults.chauffeurRate;
      const globalAide = g !== undefined ? g.aideRate : sysDefaults.aideRate;
      const effectiveAide = c !== undefined ? c.aideRate : globalAide;
      return {
        tourType: tourType as TourType,
        chauffeurRate: c?.chauffeurRate ?? globalChauffeur,
        aideRate: effectiveAide,
        isCustomChauffeur: c !== undefined,
        isCustomAide: c !== undefined && c.aideRate !== null,
        systemChauffeurRate: globalChauffeur,
        systemAideRate: globalAide,
      };
    });
  }

  async upsertPayRates(
    employeeId: string,
    rates: { tourType: TourType; chauffeurRate: number; aideRate?: number | null }[],
    userId: string,
  ) {
    await this.findOne(employeeId);
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

  async getMyAssignments(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('No employee profile is linked to this account');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const assignmentFilter = {
      some: { OR: [{ chauffeurId: employee.id }, { aideId: employee.id }] },
    };

    const include = {
      platform: { select: { name: true } },
      assignments: {
        include: {
          chauffeur: { select: { id: true, name: true, phone: true } },
          aide: { select: { id: true, name: true, phone: true } },
          truck: { select: { immatriculation: true } },
        },
      },
      confirmation: {
        include: { confirmedBy: { select: { id: true, name: true } } },
      },
    } as const;

    const [upcomingRaw, historyRaw] = await Promise.all([
      this.prisma.tour.findMany({
        where: { date: { gte: today }, assignments: assignmentFilter },
        include,
        orderBy: { date: 'asc' },
      }),
      this.prisma.tour.findMany({
        where: { date: { gte: thirtyDaysAgo, lt: today }, assignments: assignmentFilter },
        include,
        orderBy: { date: 'desc' },
      }),
    ]);

    const shape = (tours: typeof upcomingRaw) =>
      tours.map((tour) => {
        const assignment = tour.assignments[0];
        const isChauffeur = assignment?.chauffeurId === employee.id;
        const partner = (isChauffeur ? assignment?.aide : assignment?.chauffeur) as
          | { id: string; name: string; phone: string | null }
          | null
          | undefined;
        return {
          id: tour.id,
          tourCode: tour.tourCode,
          date: tour.date,
          platform: tour.platform.name,
          quai: tour.quai,
          horaire: tour.horaire,
          myRole: isChauffeur ? 'chauffeur' : 'aide',
          partner: partner
            ? { id: partner.id, name: partner.name, phone: partner.phone ?? null }
            : null,
          truck: assignment?.truck ? { immatriculation: assignment.truck.immatriculation } : null,
          confirmationStatus: tour.confirmationStatus,
          confirmation: tour.confirmation ?? null,
        };
      });

    return { upcoming: shape(upcomingRaw), history: shape(historyRaw) };
  }

  async getMyExpress(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('No employee profile is linked to this account');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const assignments = await this.prisma.expressAssignment.findMany({
      where: {
        employeeId: employee.id,
        expressDelivery: {
          date: { gte: thirtyDaysAgo },
          status: { not: 'CANCELLED' as any },
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
}
