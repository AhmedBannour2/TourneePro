import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { TruckDocumentType } from '@prisma/client';

export class UpsertTruckDocumentDto {
  @IsEnum(TruckDocumentType)
  type!: TruckDocumentType;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
