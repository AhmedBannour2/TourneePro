import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { TourType } from '@prisma/client';

export class GlobalRateItemDto {
  @ApiProperty({ enum: TourType })
  @IsEnum(TourType)
  tourType!: TourType;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  chauffeurRate!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aideRate?: number | null;
}

export class UpsertGlobalPayRatesDto {
  @ApiProperty({ type: [GlobalRateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GlobalRateItemDto)
  rates!: GlobalRateItemDto[];
}
