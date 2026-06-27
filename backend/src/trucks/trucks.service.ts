import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notification/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateRepairLogDto } from './dto/create-repair-log.dto';
import { UpdateTruckStatusDto, TruckStatus } from './dto/update-truck-status.dto';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { SubmitInspectionDto } from './dto/submit-inspection.dto';
import { InspectionItemName, InspectionStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

const INCLUDE_RESPONSIBLE = {
  responsibleEmployee: { select: { id: true, firstName: true, lastName: true, name: true } },
} as const;

const INSPECTION_INCLUDE = {
  assignedTo: { select: { id: true, name: true, firstName: true, lastName: true } },
  requestedBy: { select: { id: true, email: true } },
  acknowledgedBy: { select: { id: true, email: true } },
  items: true,
} as const;

const ALL_ITEMS: InspectionItemName[] = [
  InspectionItemName.HUILE,
  InspectionItemName.RADIATEUR,
  InspectionItemName.CAISSE_OUTILS,
  InspectionItemName.CHARIOT,
  InspectionItemName.ROULETTES,
  InspectionItemName.COUVERCLE,
];

@Injectable()
export class TrucksService {
  private readonly logger = new Logger(TrucksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(createTruckDto: CreateTruckDto) {
    try {
      return await this.prisma.truck.create({
        data: { ...createTruckDto, isAvailable: createTruckDto.isAvailable ?? true },
        include: INCLUDE_RESPONSIBLE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Truck with immatriculation ${createTruckDto.immatriculation} already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(isAvailable?: boolean) {
    return this.prisma.truck.findMany({
      where: isAvailable !== undefined ? { isAvailable } : undefined,
      include: INCLUDE_RESPONSIBLE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const truck = await this.prisma.truck.findUnique({
      where: { id },
      include: INCLUDE_RESPONSIBLE,
    });
    if (!truck) throw new NotFoundException(`Truck with ID ${id} not found`);
    return truck;
  }

  async update(id: string, updateTruckDto: UpdateTruckDto) {
    await this.findOne(id);
    try {
      return await this.prisma.truck.update({
        where: { id },
        data: updateTruckDto,
        include: INCLUDE_RESPONSIBLE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Truck with immatriculation ${updateTruckDto.immatriculation} already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.truck.delete({ where: { id } });
  }

  // ── Responsible driver ─────────────────────────────────────────────────────

  async setResponsible(truckId: string, employeeId: string | null) {
    const truck = await this.prisma.truck.findUnique({
      where: { id: truckId },
      include: INCLUDE_RESPONSIBLE,
    });
    if (!truck) throw new NotFoundException(`Truck with ID ${truckId} not found`);

    // Clear previous responsible employee's responsibleTruckId
    if (truck.responsibleEmployeeId && truck.responsibleEmployeeId !== employeeId) {
      await this.prisma.employee.update({
        where: { id: truck.responsibleEmployeeId },
        data: { responsibleTruckId: null },
      });
    }

    if (employeeId) {
      // Check employee exists
      const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) throw new NotFoundException(`Employee with ID ${employeeId} not found`);

      // If employee already has another responsible truck, clear it
      if (employee.responsibleTruckId && employee.responsibleTruckId !== truckId) {
        await this.prisma.truck.update({
          where: { id: employee.responsibleTruckId },
          data: { responsibleEmployeeId: null },
        });
      }

      // Set both sides
      await this.prisma.$transaction([
        this.prisma.truck.update({
          where: { id: truckId },
          data: { responsibleEmployeeId: employeeId },
        }),
        this.prisma.employee.update({
          where: { id: employeeId },
          data: { responsibleTruckId: truckId },
        }),
      ]);
    } else {
      // Unassign
      await this.prisma.truck.update({
        where: { id: truckId },
        data: { responsibleEmployeeId: null },
      });
    }

    return this.prisma.truck.findUnique({
      where: { id: truckId },
      include: INCLUDE_RESPONSIBLE,
    });
  }

  // ── History ────────────────────────────────────────────────────────────────

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
      data: { status: dto.status, isAvailable: dto.status === TruckStatus.AVAILABLE },
      include: INCLUDE_RESPONSIBLE,
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

  // ── Inspections ────────────────────────────────────────────────────────────

  async listInspections(truckId: string) {
    await this.findOne(truckId);
    const results = await this.prisma.truckInspection.findMany({
      where: { truckId },
      include: INSPECTION_INCLUDE,
      orderBy: { scheduledDate: 'desc' },
    });
    this.logger.debug(
      `listInspections truck=${truckId}: ${results.length} rows — photos=[${results.map((r) => r.photos.length).join(',')}]`,
    );
    return results;
  }

  async createInspection(truckId: string, dto: CreateInspectionDto, requestedById?: string) {
    const truck = await this.prisma.truck.findUnique({
      where: { id: truckId },
      include: {
        responsibleEmployee: {
          include: { user: { select: { email: true } } },
        },
      },
    });
    if (!truck) throw new NotFoundException(`Truck with ID ${truckId} not found`);
    if (!truck.responsibleEmployee) {
      throw new BadRequestException('No responsible employee assigned to this truck');
    }

    const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : new Date();

    const inspection = await this.prisma.truckInspection.create({
      data: {
        truckId,
        assignedToId: truck.responsibleEmployee.id,
        scheduledDate,
        status: InspectionStatus.PENDING,
        requestedById: requestedById ?? null,
      },
      include: INSPECTION_INCLUDE,
    });

    // Send email notification
    const email = truck.responsibleEmployee.user?.email;
    if (email) {
      const adminEmail = this.config.get<string>('MAIL_FROM') ?? 'noreply@tourneepro.fr';
      this.mail
        .sendInspectionRequestEmail({
          to: email,
          employeeName: truck.responsibleEmployee.name,
          truckImmatriculation: truck.immatriculation,
          scheduledDate,
        })
        .catch(() => {
          /* silent */
        });
    }

    return inspection;
  }

  private async resolveEmployeeId(userId: string): Promise<string> {
    const emp = await this.prisma.employee.findUnique({ where: { userId } });
    if (!emp) throw new ForbiddenException('No employee profile linked to this account');
    return emp.id;
  }

  async submitInspection(inspectionId: string, dto: SubmitInspectionDto, userId: string) {
    const employeeId = await this.resolveEmployeeId(userId);

    const inspection = await this.prisma.truckInspection.findUnique({
      where: { id: inspectionId },
      include: { truck: true },
    });

    if (!inspection) throw new NotFoundException('Inspection not found');

    if (inspection.assignedToId !== employeeId) {
      this.logger.warn(
        `Employee ${employeeId} tried to submit inspection ${inspectionId} assigned to ${inspection.assignedToId}`,
      );
      throw new ForbiddenException("Vous n'êtes pas assigné à ce contrôle");
    }

    if (
      inspection.status === InspectionStatus.SUBMITTED ||
      inspection.status === InspectionStatus.ACKNOWLEDGED
    ) {
      throw new ConflictException('Ce contrôle a déjà été soumis');
    }

    if (inspection.status !== InspectionStatus.PENDING) {
      throw new BadRequestException(`Statut inattendu : ${inspection.status}`);
    }

    // Validate all 6 items present
    const provided = new Set(dto.items.map((i) => i.item));
    for (const item of ALL_ITEMS) {
      if (!provided.has(item)) {
        throw new BadRequestException(`Missing checklist item: ${item}`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.truckInspectionItem.createMany({
        data: dto.items.map((i) => ({
          inspectionId,
          item: i.item,
          status: i.status,
          comment: i.comment ?? null,
        })),
      });
      return tx.truckInspection.update({
        where: { id: inspectionId },
        data: {
          status: InspectionStatus.SUBMITTED,
          submittedAt: new Date(),
          generalComment: dto.generalComment ?? null,
        },
        include: { ...INSPECTION_INCLUDE, truck: true },
      });
    });

    const problemItems = dto.items.filter((i) => i.status === 'PROBLEME');
    const immat = updated.truck.immatriculation;
    const employeeName = updated.assignedTo.name;

    // ── In-app notifications ─────────────────────────────────────────────────
    if (problemItems.length > 0) {
      this.notifications
        .createForRole(['ADMIN', 'DISPATCHER'], {
          type: 'INSPECTION_PROBLEM',
          title: `⚠️ Anomalie contrôle — ${immat}`,
          message: `${employeeName} a signalé ${problemItems.length} anomalie(s) lors du contrôle de ${immat}.`,
          link: `/trucks?truck=${updated.truck.id}&tab=inspections`,
          metadata: { inspectionId, truckId: updated.truck.id },
        })
        .catch(() => {});
    } else {
      this.notifications
        .createForRole(['ADMIN', 'DISPATCHER'], {
          type: 'INSPECTION_SUBMITTED',
          title: `✅ Contrôle OK — ${immat}`,
          message: `${employeeName} a soumis le contrôle de ${immat} sans anomalie.`,
          link: `/trucks?truck=${updated.truck.id}&tab=inspections`,
          metadata: { inspectionId, truckId: updated.truck.id },
        })
        .catch(() => {});
    }

    // ── Email on problem only ────────────────────────────────────────────────
    if (problemItems.length > 0) {
      const adminEmail =
        this.config.get<string>('MAIL_ADMIN') ??
        this.config.get<string>('MAIL_FROM') ??
        'admin@tourneepro.fr';
      this.mail
        .sendInspectionProblemEmail({
          to: adminEmail,
          truckImmatriculation: immat,
          employeeName,
          problemItems: problemItems.map((i) => ({ item: i.item, comment: i.comment ?? null })),
          generalComment: dto.generalComment ?? null,
          scheduledDate: updated.scheduledDate,
        })
        .catch(() => {});
    }

    return updated;
  }

  async uploadInspectionPhotos(inspectionId: string, files: Express.Multer.File[], userId: string) {
    const employeeId = await this.resolveEmployeeId(userId);

    const inspection = await this.prisma.truckInspection.findUnique({
      where: { id: inspectionId },
      select: { assignedToId: true, photos: true },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');
    if (inspection.assignedToId !== employeeId) {
      throw new ForbiddenException('You are not assigned to this inspection');
    }

    if (files.length === 0) {
      throw new BadRequestException(
        'Aucun fichier reçu. Vérifiez que les photos sont bien sélectionnées (JPEG ou PNG uniquement).',
      );
    }

    const uploadedUrls = await Promise.all(
      files.map((f) =>
        this.cloudinary.uploadBuffer(
          f.buffer,
          f.mimetype,
          `tournee-pro/inspections/${inspectionId}`,
          f.originalname,
        ),
      ),
    );

    this.logger.log(
      `uploadInspectionPhotos id=${inspectionId} uploaded ${uploadedUrls.length} files to Cloudinary`,
    );

    const allPhotos = [...inspection.photos, ...uploadedUrls];

    return this.prisma.truckInspection.update({
      where: { id: inspectionId },
      data: { photos: allPhotos },
      include: INSPECTION_INCLUDE,
    });
  }

  async acknowledgeInspection(inspectionId: string, userId: string) {
    const inspection = await this.prisma.truckInspection.findUnique({
      where: { id: inspectionId },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');
    if (inspection.status !== InspectionStatus.SUBMITTED) {
      throw new BadRequestException('Inspection is not in SUBMITTED status');
    }
    return this.prisma.truckInspection.update({
      where: { id: inspectionId },
      data: {
        status: InspectionStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
      },
      include: INSPECTION_INCLUDE,
    });
  }

  async listPendingInspections() {
    return this.prisma.truckInspection.findMany({
      where: { status: InspectionStatus.PENDING },
      include: {
        ...INSPECTION_INCLUDE,
        truck: { select: { id: true, immatriculation: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  async listMyInspections(userId: string) {
    const employeeId = await this.resolveEmployeeId(userId);
    return this.prisma.truckInspection.findMany({
      where: { assignedToId: employeeId, status: InspectionStatus.PENDING },
      include: {
        ...INSPECTION_INCLUDE,
        truck: { select: { id: true, immatriculation: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }
}
