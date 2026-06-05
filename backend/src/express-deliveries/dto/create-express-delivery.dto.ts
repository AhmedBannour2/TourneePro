import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsDateString,
  IsOptional,
  IsArray,
  IsUUID,
  IsString,
  ArrayMaxSize,
} from 'class-validator';
import { ExpressDeliveryType } from '@prisma/client';

export class CreateExpressDeliveryDto {
  @ApiProperty({ enum: ExpressDeliveryType, description: 'STANDARD (30€) or GV (50€)' })
  @IsEnum(ExpressDeliveryType)
  type!: ExpressDeliveryType;

  @ApiProperty({ example: '2026-06-05T08:00:00Z', description: 'Delivery date/time (ISO)' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 2,
    description: 'Employee IDs to assign (max 2)',
  })
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
