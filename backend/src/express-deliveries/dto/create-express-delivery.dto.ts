import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsArray,
  IsUUID,
  IsString,
  ArrayMaxSize,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';
import { ExpressDeliveryType } from '@prisma/client';

export class CreateExpressDeliveryDto {
  @ApiProperty({ enum: ExpressDeliveryType })
  @IsEnum(ExpressDeliveryType)
  type!: ExpressDeliveryType;

  @ApiProperty({ example: '2026-06-05T08:00:00Z' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    example: 45,
    description: 'Custom pay in € — required when type is AUTRE',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pay?: number;

  @ApiPropertyOptional({ example: '08:00', description: 'Start time HH:MM (informational)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '14:30', description: 'End time HH:MM (informational)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 2 })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(2)
  employeeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
