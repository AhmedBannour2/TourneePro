import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { TourType } from '@prisma/client';

export class PayRateItemDto {
  @ApiProperty({ enum: TourType })
  @IsEnum(TourType)
  tourType!: TourType;

  @ApiProperty({ description: 'Chauffeur pay rate' })
  @IsNumber()
  @Min(0)
  chauffeurRate!: number;

  @ApiPropertyOptional({ description: 'Aide pay rate (null for MONO)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aideRate?: number | null;
}

export class UpsertPayRatesDto {
  @ApiProperty({ type: [PayRateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayRateItemDto)
  rates!: PayRateItemDto[];
}
