import { Controller, Get, Patch, Post, Query, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { NotificationsService } from './notifications.service';

class RegisterDeviceDto {
  @IsString() userId!: string;
  @IsString() token!: string;
  @IsString() platform!: string;
}

class MarkReadDto {
  @IsString() userId!: string;
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for a user' })
  findForUser(@Query('userId') userId: string, @Query('limit') limit?: string) {
    if (!userId) return { items: [], unreadCount: 0 };
    return this.service.findForUser(userId, limit ? Number(limit) : 20);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Param('id') id: string, @Body() dto: MarkReadDto) {
    return this.service.markRead(id, dto.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Body() dto: MarkReadDto) {
    return this.service.markAllRead(dto.userId);
  }

  @Post('register-device')
  @ApiOperation({ summary: 'Register a mobile push token' })
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.service.registerDevice(dto.userId, dto.token, dto.platform);
  }
}
