import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetToursQueryDto } from './dto/get-tours-query.dto';
import { AssignTourDto } from './dto/assign-tour.dto';
import { ConfirmTourDto } from './dto/confirm-tour.dto';
import { DashboardStatsResponseDto } from './dto/dashboard-stats-response.dto';
import { MailService } from '../notification/mail.service';
import { WorkedDaysService } from '../worked-days/worked-days.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfirmationStatus, WorkedDayStatus, TourSource } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { CreateTourDto } from './dto/create-tour.dto';

@Injectable()
export class ToursService {
  private readonly logger = new Logger(ToursService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly workedDaysService: WorkedDaysService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: GetToursQueryDto) {
    const {
      date,
      dateFrom,
      dateTo,
      platformId,
      status,
      chauffeurId,
      confirmationStatus,
      page = 1,
      limit = 50,
    } = query;

    const where: any = {};

    // Date filtering
    if (date) {
      const dateObj = new Date(date);
      where.date = {
        gte: new Date(dateObj.setHours(0, 0, 0, 0)),
        lte: new Date(dateObj.setHours(23, 59, 59, 999)),
      };
    } else if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    if (platformId) where.platformId = platformId;
    if (status) where.status = status;
    if (confirmationStatus) where.confirmationStatus = confirmationStatus;

    // Filter by chauffeur via assignment relation
    if (chauffeurId) {
      where.assignments = {
        some: {
          chauffeurId,
        },
      };
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const [tours, total] = await Promise.all([
      this.prisma.tour.findMany({
        where,
        skip,
        take,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          platform: true,
          assignments: {
            include: {
              chauffeur: true,
              aide: true,
              truck: true,
            },
          },
          confirmation: {
            include: { confirmedBy: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.tour.count({ where }),
    ]);

    return {
      data: tours,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const tour = await this.prisma.tour.findUnique({
      where: { id },
      include: {
        platform: true,
        assignments: {
          include: {
            chauffeur: true,
            aide: true,
            truck: true,
          },
        },
        importBatch: {
          select: {
            id: true,
            fileName: true,
            uploadedAt: true,
          },
        },
        confirmation: {
          include: { confirmedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!tour) {
      throw new NotFoundException(`Tour with ID ${id} not found`);
    }

    return tour;
  }

  async assignTour(id: string, assignDto: AssignTourDto, userId?: string) {
    const tour = await this.findOne(id);

    const { chauffeurId, aideId, truckId } = assignDto;

    // Validate employee and truck exist and are active
    if (chauffeurId) {
      const chauffeur = await this.prisma.employee.findUnique({
        where: { id: chauffeurId },
      });
      if (!chauffeur) {
        throw new NotFoundException(`Chauffeur with ID ${chauffeurId} not found`);
      }
      if (!chauffeur.isActive) {
        throw new BadRequestException(`Chauffeur ${chauffeur.name} is not active`);
      }
    }

    if (aideId) {
      const aide = await this.prisma.employee.findUnique({
        where: { id: aideId },
      });
      if (!aide) {
        throw new NotFoundException(`Aide with ID ${aideId} not found`);
      }
      if (!aide.isActive) {
        throw new BadRequestException(`Aide ${aide.name} is not active`);
      }
    }

    if (truckId) {
      const truck = await this.prisma.truck.findUnique({
        where: { id: truckId },
      });
      if (!truck) {
        throw new NotFoundException(`Truck with ID ${truckId} not found`);
      }
      if (!truck.isAvailable) {
        throw new BadRequestException(`Truck ${truck.immatriculation} is not available`);
      }
    }

    // Check for same-day conflicts (warning, not blocking)
    const conflicts = await this.checkSameDayConflicts(tour.date, chauffeurId, aideId, truckId, id);

    if (conflicts.length > 0) {
      this.logger.warn(
        `Assignment conflicts detected for tour ${id}: ${JSON.stringify(conflicts)}`,
      );
      // In production, this could be returned as warnings to the frontend
    }

    // Get existing assignment or null
    const existingAssignment = tour.assignments[0] || null;
    const oldAssignment = existingAssignment
      ? {
          chauffeurId: existingAssignment.chauffeurId,
          aideId: existingAssignment.aideId,
          truckId: existingAssignment.truckId,
        }
      : null;

    // Update or create assignment
    let assignment;
    if (existingAssignment) {
      assignment = await this.prisma.assignment.update({
        where: { id: existingAssignment.id },
        data: {
          chauffeurId: chauffeurId || null,
          aideId: aideId || null,
          truckId: truckId || null,
          assignedAt: new Date(),
        },
        include: {
          chauffeur: true,
          aide: true,
          truck: true,
        },
      });
    } else {
      assignment = await this.prisma.assignment.create({
        data: {
          tourId: id,
          chauffeurId: chauffeurId || null,
          aideId: aideId || null,
          truckId: truckId || null,
        },
        include: {
          chauffeur: true,
          aide: true,
          truck: true,
        },
      });
    }

    // Update tour status to 'assigned'
    await this.prisma.tour.update({
      where: { id },
      data: { status: 'assigned' },
    });

    // Write truck assignment history snapshot
    if (assignment.truckId) {
      await this.prisma.truckAssignmentHistory.create({
        data: {
          truckId: assignment.truckId,
          tourId: id,
          tourCode: tour.tourCode,
          date: tour.date,
          chauffeurName: assignment.chauffeur?.name ?? null,
          aideName: assignment.aide?.name ?? null,
          action: 'assigned',
        },
      });
    }

    // Create audit event
    await this.prisma.auditEvent.create({
      data: {
        action: 'ASSIGNMENT',
        entityType: 'Tour',
        entityId: id,
        userId: userId || null,
        metadata: {
          oldAssignment,
          newAssignment: {
            chauffeurId: assignment.chauffeurId,
            aideId: assignment.aideId,
            truckId: assignment.truckId,
          },
          conflicts,
        },
      },
    });

    // Auto-create WorkedDay records — awaited so failures are visible in logs
    try {
      await this.workedDaysService.createFromAssignment({
        tourId: id,
        tourCode: tour.tourCode,
        tourDate: tour.date,
        chauffeurId: assignment.chauffeurId,
        aideId: assignment.aideId,
      });
    } catch (err: any) {
      this.logger.error('WorkedDay auto-create failed', err?.message ?? err);
    }

    // Fire-and-forget — never delay the API response for email delivery
    this.sendAssignmentEmails(tour, assignment).catch((err: Error) =>
      this.logger.error('Assignment email failed', err.message),
    );

    // In-app notifications for assigned employees
    const dateStr = tour.date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const notifBase = {
      type: 'TOUR_ASSIGNED' as const,
      title: `Tournée ${tour.tourCode} assignée`,
      message: `Vous êtes assigné(e) à la tournée ${tour.tourCode} le ${dateStr}`,
      link: '/my-assignments',
      metadata: { tourId: id, tourCode: tour.tourCode },
    };
    const chauffeurUserId = assignment.chauffeur
      ? (
          await this.prisma.employee.findUnique({
            where: { id: assignment.chauffeurId! },
            select: { userId: true },
          })
        )?.userId
      : null;
    const aideUserId = assignment.aide
      ? (
          await this.prisma.employee.findUnique({
            where: { id: assignment.aideId! },
            select: { userId: true },
          })
        )?.userId
      : null;
    if (chauffeurUserId)
      this.notificationsService.create({ ...notifBase, userId: chauffeurUserId });
    if (aideUserId) this.notificationsService.create({ ...notifBase, userId: aideUserId });

    return this.findOne(id);
  }

  async unassignTour(id: string, userId?: string) {
    const tour = await this.findOne(id);

    const existingAssignment = tour.assignments[0];
    if (!existingAssignment) {
      throw new BadRequestException('Tour is not assigned');
    }

    const oldAssignment = {
      chauffeurId: existingAssignment.chauffeurId,
      aideId: existingAssignment.aideId,
      truckId: existingAssignment.truckId,
    };

    // Write truck assignment history snapshot before deleting
    if (existingAssignment.truckId) {
      await this.prisma.truckAssignmentHistory.create({
        data: {
          truckId: existingAssignment.truckId,
          tourId: id,
          tourCode: tour.tourCode,
          date: tour.date,
          chauffeurName: existingAssignment.chauffeur?.name ?? null,
          aideName: existingAssignment.aide?.name ?? null,
          action: 'unassigned',
        },
      });
    }

    // Cancel associated WorkedDay records
    await this.workedDaysService.cancelFromUnassignment(id);

    // Delete assignment
    await this.prisma.assignment.delete({
      where: { id: existingAssignment.id },
    });

    // Update tour status to 'imported'
    await this.prisma.tour.update({
      where: { id },
      data: { status: 'imported' },
    });

    // Create audit event
    await this.prisma.auditEvent.create({
      data: {
        action: 'UNASSIGNMENT',
        entityType: 'Tour',
        entityId: id,
        userId: userId || null,
        metadata: {
          oldAssignment,
        },
      },
    });

    return this.findOne(id);
  }

  private async checkSameDayConflicts(
    date: Date,
    chauffeurId?: string,
    aideId?: string,
    truckId?: string,
    excludeTourId?: string,
  ) {
    const conflicts: string[] = [];
    const tourDate = new Date(date);
    const startOfDay = new Date(tourDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(tourDate.setHours(23, 59, 59, 999));

    const sameDayTours = await this.prisma.tour.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        id: excludeTourId ? { not: excludeTourId } : undefined,
        assignments: {
          some: {
            OR: [
              chauffeurId ? { chauffeurId } : {},
              aideId ? { aideId } : {},
              truckId ? { truckId } : {},
            ].filter((obj) => Object.keys(obj).length > 0),
          },
        },
      },
      include: {
        assignments: {
          include: {
            chauffeur: true,
            aide: true,
            truck: true,
          },
        },
      },
    });

    if (sameDayTours.length > 0) {
      for (const tour of sameDayTours) {
        for (const assignment of tour.assignments) {
          if (chauffeurId && assignment.chauffeurId === chauffeurId) {
            conflicts.push(
              `Chauffeur ${assignment.chauffeur?.name} already assigned to tour ${tour.tourCode}`,
            );
          }
          if (aideId && assignment.aideId === aideId) {
            conflicts.push(
              `Aide ${assignment.aide?.name} already assigned to tour ${tour.tourCode}`,
            );
          }
          if (truckId && assignment.truckId === truckId) {
            conflicts.push(
              `Truck ${assignment.truck?.immatriculation} already assigned to tour ${tour.tourCode}`,
            );
          }
        }
      }
    }

    return conflicts;
  }

  // ── Manual tour creation ──────────────────────────────────────────────────

  async createTour(dto: CreateTourDto) {
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);

    // Verify platform exists
    const platform = await this.prisma.platform.findUnique({ where: { id: dto.platformId } });
    if (!platform) throw new NotFoundException(`Platform ${dto.platformId} not found`);

    // Check for existing tour with same key
    const existing = await this.prisma.tour.findFirst({
      where: { tourCode: dto.tourCode, date, platformId: dto.platformId },
    });
    if (existing) {
      throw new ConflictException(
        `Tour ${dto.tourCode} already exists on this date for this platform`,
      );
    }

    // Auto-detect type label from code range if not provided
    const tourType = dto.tourType ?? this.detectTourTypeLabel(dto.tourCode);

    return this.prisma.tour.create({
      data: {
        tourCode: dto.tourCode,
        date,
        platformId: dto.platformId,
        tourType,
        quai: dto.quai ?? null,
        horaire: dto.horaire ?? null,
        status: 'imported',
        source: TourSource.MANUAL,
      },
      include: {
        platform: true,
        assignments: { include: { chauffeur: true, aide: true, truck: true } },
        confirmation: { include: { confirmedBy: { select: { id: true, name: true } } } },
      },
    });
  }

  private detectTourTypeLabel(tourCode: string): string {
    const num = parseInt(tourCode, 10);
    if (isNaN(num)) return 'Standard';
    if (num >= 500 && num <= 599) return 'Install';
    if (num >= 600 && num <= 699) return 'Mono';
    if (num >= 700 && num <= 799) return 'GV';
    if (num >= 800 && num <= 889) return 'Standard';
    if (num >= 890 && num <= 999) return 'Spéciale';
    return 'Standard';
  }

  // ── Delete tour ──────────────────────────────────────────────────────────

  async deleteTour(id: string) {
    const tour = await this.findOne(id);

    const isAssigned = ['assigned', 'notified', 'completed'].includes(tour.status);
    if (isAssigned) {
      throw new BadRequestException('Unassign the tour before deleting it');
    }

    // Cancel any ASSIGNED worked days linked to this tour
    await this.prisma.workedDay.updateMany({
      where: { tourId: id, status: WorkedDayStatus.ASSIGNED },
      data: { status: WorkedDayStatus.CANCELLED },
    });

    // Delete the tour (cascade handles: assignments, confirmation)
    await this.prisma.tour.delete({ where: { id } });

    return { id, deleted: true };
  }

  // ── Tour confirmation ─────────────────────────────────────────────────────

  async confirmTour(tourId: string, dto: ConfirmTourDto, userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new ForbiddenException('No employee profile linked to this account');

    const tour = await this.findOne(tourId);
    const assignment = tour.assignments[0];
    if (!assignment) throw new BadRequestException('Tour is not assigned');

    if (assignment.chauffeurId !== employee.id && assignment.aideId !== employee.id) {
      throw new ForbiddenException('You are not assigned to this tour');
    }

    if (dto.delivered + dto.absent + dto.nonConform > dto.totalClients) {
      throw new BadRequestException('Delivered + absent + non-conform exceeds total clients');
    }

    const existing = await this.prisma.tourConfirmation.findUnique({ where: { tourId } });
    if (existing) throw new BadRequestException('Tour already confirmed — use PATCH to update');

    const [confirmation] = await this.prisma.$transaction([
      this.prisma.tourConfirmation.create({
        data: {
          tourId,
          confirmedById: employee.id,
          totalClients: dto.totalClients,
          delivered: dto.delivered,
          absent: dto.absent,
          nonConform: dto.nonConform,
          notes: dto.notes ?? null,
        },
        include: { confirmedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.tour.update({
        where: { id: tourId },
        data: { confirmationStatus: ConfirmationStatus.CONFIRMED },
      }),
    ]);

    // Ensure WorkedDay records exist, then confirm them all
    await this.ensureAndConfirmWorkedDays(tourId, tour);

    // Notify dispatchers/admins that the tour was confirmed
    this.notificationsService.createForRole(['ADMIN', 'DISPATCHER'], {
      type: 'TOUR_CONFIRMED',
      title: `Tournée ${tour.tourCode} confirmée`,
      message: `${employee.name} a confirmé la tournée ${tour.tourCode}`,
      link: '/tours',
      metadata: { tourId, tourCode: tour.tourCode },
    });

    return confirmation;
  }

  // ── Admin confirm (no employee check) ───────────────────────────────────

  async adminConfirmTour(tourId: string, dto: ConfirmTourDto) {
    const tour = await this.findOne(tourId);
    const assignment = tour.assignments[0];
    if (!assignment) throw new BadRequestException('Tour is not assigned yet');

    const employeeId = assignment.chauffeurId ?? assignment.aideId;
    if (!employeeId) throw new BadRequestException('No employee is linked to this assignment');

    if (dto.delivered + dto.absent + dto.nonConform > dto.totalClients) {
      throw new BadRequestException('Delivered + absent + non-conform exceeds total clients');
    }

    const existing = await this.prisma.tourConfirmation.findUnique({ where: { tourId } });
    if (existing) throw new BadRequestException('Tour already confirmed — use PATCH to update');

    const [confirmation] = await this.prisma.$transaction([
      this.prisma.tourConfirmation.create({
        data: {
          tourId,
          confirmedById: employeeId,
          totalClients: dto.totalClients,
          delivered: dto.delivered,
          absent: dto.absent,
          nonConform: dto.nonConform,
          notes: dto.notes ?? null,
        },
        include: { confirmedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.tour.update({
        where: { id: tourId },
        data: { confirmationStatus: ConfirmationStatus.CONFIRMED },
      }),
    ]);

    await this.ensureAndConfirmWorkedDays(tourId, tour);
    return confirmation;
  }

  async adminUpdateConfirmation(tourId: string, dto: ConfirmTourDto) {
    const confirmation = await this.prisma.tourConfirmation.findUnique({ where: { tourId } });
    if (!confirmation) throw new NotFoundException('No confirmation found for this tour');

    if (dto.delivered + dto.absent + dto.nonConform > dto.totalClients) {
      throw new BadRequestException('Delivered + absent + non-conform exceeds total clients');
    }

    const updated = await this.prisma.tourConfirmation.update({
      where: { tourId },
      data: {
        totalClients: dto.totalClients,
        delivered: dto.delivered,
        absent: dto.absent,
        nonConform: dto.nonConform,
        notes: dto.notes ?? null,
      },
      include: { confirmedBy: { select: { id: true, name: true } } },
    });

    const tour = await this.findOne(tourId);
    await this.ensureAndConfirmWorkedDays(tourId, tour);
    return updated;
  }

  async updateConfirmation(tourId: string, dto: ConfirmTourDto, userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new ForbiddenException('No employee profile linked to this account');

    const confirmation = await this.prisma.tourConfirmation.findUnique({ where: { tourId } });
    if (!confirmation) throw new NotFoundException('No confirmation found for this tour');
    if (confirmation.confirmedById !== employee.id) {
      throw new ForbiddenException('You did not submit this confirmation');
    }

    if (dto.delivered + dto.absent + dto.nonConform > dto.totalClients) {
      throw new BadRequestException('Delivered + absent + non-conform exceeds total clients');
    }

    const updated = await this.prisma.tourConfirmation.update({
      where: { tourId },
      data: {
        totalClients: dto.totalClients,
        delivered: dto.delivered,
        absent: dto.absent,
        nonConform: dto.nonConform,
        notes: dto.notes ?? null,
      },
      include: { confirmedBy: { select: { id: true, name: true } } },
    });

    // Repair: create WorkedDay records if they were never generated (pre-fix assignments)
    const tour = await this.findOne(tourId);
    await this.ensureAndConfirmWorkedDays(tourId, tour);

    return updated;
  }

  // Creates WorkedDay records for a tour if they don't exist yet, then confirms them all.
  private async ensureAndConfirmWorkedDays(
    tourId: string,
    tour: Awaited<ReturnType<typeof this.findOne>>,
  ) {
    const existing = await this.prisma.workedDay.count({ where: { tourId } });

    if (existing === 0) {
      const assignment = tour.assignments[0];
      if (assignment) {
        try {
          await this.workedDaysService.createFromAssignment({
            tourId,
            tourCode: tour.tourCode,
            tourDate: tour.date,
            chauffeurId: assignment.chauffeurId,
            aideId: assignment.aideId,
          });
        } catch (err: any) {
          this.logger.error('WorkedDay repair-create failed', err?.message ?? err);
        }
      }
    }

    // Confirm all ASSIGNED records for this tour
    await this.prisma.workedDay.updateMany({
      where: { tourId, status: WorkedDayStatus.ASSIGNED },
      data: { status: WorkedDayStatus.CONFIRMED, confirmedAt: new Date() },
    });
  }

  async getDashboardStats(): Promise<DashboardStatsResponseDto> {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const [toursToday, unassignedToday, activeEmployees, recentImportErrors] = await Promise.all([
      this.prisma.tour.count({
        where: {
          date: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
      }),
      this.prisma.tour.count({
        where: {
          date: {
            gte: startOfToday,
            lte: endOfToday,
          },
          status: {
            notIn: ['assigned', 'notified', 'completed', 'cancelled'],
          },
        },
      }),
      this.prisma.employee.count({
        where: {
          isActive: true,
        },
      }),
      this.prisma.importRow.count({
        where: {
          status: 'error',
          batch: {
            uploadedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
        },
      }),
    ]);

    return {
      toursToday,
      unassigned: unassignedToday,
      activeEmployees,
      importErrors: recentImportErrors,
    };
  }

  async markAssignmentSeen(tourId: string, userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) {
      throw new NotFoundException('No employee profile linked to this account');
    }

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        tourId,
        OR: [{ chauffeurId: employee.id }, { aideId: employee.id }],
      },
    });
    if (!assignment) {
      throw new NotFoundException('No assignment found for this employee on this tour');
    }

    const isChauffeur = assignment.chauffeurId === employee.id;

    // Idempotent — never overwrite an existing seen timestamp
    if (isChauffeur && assignment.chauffeurSeenAt) return assignment;
    if (!isChauffeur && assignment.aideSeenAt) return assignment;

    return this.prisma.assignment.update({
      where: { id: assignment.id },
      data: isChauffeur ? { chauffeurSeenAt: new Date() } : { aideSeenAt: new Date() },
    });
  }

  // ── Email helpers ──────────────────────────────────────────────────────────

  private async sendAssignmentEmails(
    tour: Awaited<ReturnType<typeof this.findOne>>,
    assignment: {
      chauffeurId: string | null;
      aideId: string | null;
      chauffeur: { name: string } | null;
      aide: { name: string } | null;
      truck: { immatriculation: string } | null;
    },
  ): Promise<void> {
    const common = {
      tourCode: tour.tourCode,
      tourDate: tour.date,
      platformName: (tour.platform as { name: string } | null)?.name ?? '',
      quai: tour.quai,
      horaire: tour.horaire,
      truckImmatriculation: assignment.truck?.immatriculation ?? null,
    };

    const sends: Promise<void>[] = [];

    if (assignment.chauffeurId) {
      const chauffeur = await this.prisma.employee.findUnique({
        where: { id: assignment.chauffeurId },
        include: { user: { select: { email: true } } },
      });
      if (chauffeur?.user?.email) {
        sends.push(
          this.mailService.sendAssignmentNotification({
            to: chauffeur.user.email,
            employeeName: chauffeur.name,
            role: 'chauffeur',
            partnerName: assignment.aide?.name ?? null,
            ...common,
          }),
        );
      }
    }

    if (assignment.aideId) {
      const aide = await this.prisma.employee.findUnique({
        where: { id: assignment.aideId },
        include: { user: { select: { email: true } } },
      });
      if (aide?.user?.email) {
        sends.push(
          this.mailService.sendAssignmentNotification({
            to: aide.user.email,
            employeeName: aide.name,
            role: 'aide',
            partnerName: assignment.chauffeur?.name ?? null,
            ...common,
          }),
        );
      }
    }

    await Promise.all(sends);
  }
}
