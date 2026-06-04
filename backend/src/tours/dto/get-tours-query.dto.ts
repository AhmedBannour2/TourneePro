import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class GetToursQueryDto {
  @ApiProperty({ description: 'Filter by specific date (ISO format)', required: false, example: '2026-05-27' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ description: 'Filter by date from (ISO format)', required: false, example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ description: 'Filter by date to (ISO format)', required: false, example: '2026-05-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiProperty({ description: 'Filter by platform ID', required: false })
  @IsOptional()
  @IsUUID()
  platformId?: string;

  @ApiProperty({ description: 'Filter by status', required: false, example: 'assigned' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'Filter by chauffeur ID', required: false })
  @IsOptional()
  @IsString()
  chauffeurId?: string;

  @ApiProperty({ description: 'Filter by confirmation status (UNCONFIRMED | CONFIRMED)', required: false })
  @IsOptional()
  @IsString()
  confirmationStatus?: string;

  @ApiProperty({ description: 'Page number', required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ description: 'Items per page', required: false, default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
