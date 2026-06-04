import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum TruckStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  IN_REPAIR = 'in_repair',
}

export class UpdateTruckStatusDto {
  @ApiProperty({ enum: TruckStatus })
  @IsEnum(TruckStatus)
  @IsNotEmpty()
  status!: TruckStatus;

  @ApiPropertyOptional({ example: 'Engine failure, waiting for parts' })
  @IsString()
  @IsOptional()
  reason?: string;
}
