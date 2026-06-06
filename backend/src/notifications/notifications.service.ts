import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationType =
  | 'TOUR_ASSIGNED'
  | 'TOUR_CONFIRMED'
  | 'TOUR_UNASSIGNED'
  | 'INSPECTION_SUBMITTED'
  | 'INSPECTION_PROBLEM'
  | 'DOCUMENT_EXPIRING'
  | 'EXPRESS_ASSIGNED';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          message: dto.message,
          link: dto.link,
          metadata: dto.metadata ? (dto.metadata as any) : undefined,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to create notification: ${err.message}`);
    }
  }

  async createForRole(roles: string[], dto: Omit<CreateNotificationDto, 'userId'>) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles } },
      select: { id: true },
    });
    await Promise.all(users.map((u) => this.create({ ...dto, userId: u.id })));
  }

  async findForUser(userId: string, limit = 20) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async registerDevice(userId: string, token: string, platform: string) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  }
}
