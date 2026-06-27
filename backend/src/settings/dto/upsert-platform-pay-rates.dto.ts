import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PlatformRateItemDto {
  @ApiProperty()
  @IsString()
  platformId!: string;

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

export class UpsertPlatformPayRatesDto {
  @ApiProperty({ type: [PlatformRateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformRateItemDto)
  rates!: PlatformRateItemDto[];
}
