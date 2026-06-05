import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsEnum, IsUUID } from 'class-validator';
import { ExpressDeliveryType, ExpressDeliveryStatus } from '@prisma/client';

export class GetExpressDeliveriesQueryDto {
  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ExpressDeliveryType })
  @IsOptional()
  @IsEnum(ExpressDeliveryType)
  type?: ExpressDeliveryType;

  @ApiPropertyOptional({ enum: ExpressDeliveryStatus })
  @IsOptional()
  @IsEnum(ExpressDeliveryStatus)
  status?: ExpressDeliveryStatus;

  @ApiPropertyOptional({ description: 'Filter by assigned employee ID' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
