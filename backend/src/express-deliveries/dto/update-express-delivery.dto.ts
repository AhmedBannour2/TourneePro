import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  pay?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '14:30' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
}
