import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum RepairType {
  OIL_CHANGE = 'OIL_CHANGE',
  REPAIR = 'REPAIR',
  BREAKDOWN = 'BREAKDOWN',
  INSPECTION = 'INSPECTION',
  OTHER = 'OTHER',
}

export class CreateRepairLogDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @ApiProperty({ enum: RepairType })
  @IsEnum(RepairType)
  @IsNotEmpty()
  type!: RepairType;

  @ApiProperty({ example: 'Changed front brake pads' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ example: 150.0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cost?: number;
}
