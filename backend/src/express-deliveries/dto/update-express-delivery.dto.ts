import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsDateString, IsOptional, IsString } from 'class-validator';
import { ExpressDeliveryType } from '@prisma/client';

export class UpdateExpressDeliveryDto {
  @ApiPropertyOptional({ enum: ExpressDeliveryType })
  @IsOptional()
  @IsEnum(ExpressDeliveryType)
  type?: ExpressDeliveryType;

  @ApiPropertyOptional({ example: '2026-06-05T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
