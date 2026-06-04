import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsUUID, IsEnum } from 'class-validator';

export enum ExpressDeliveryStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreateExpressDeliveryDto {
  @ApiProperty({ description: 'Delivery address', example: '123 Rue de la Paix, 75001 Paris' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ description: 'Delivery date (ISO format)', example: '2026-05-27T10:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @ApiProperty({ description: 'Assigned employee ID', required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiProperty({ description: 'Assigned truck ID', required: false })
  @IsOptional()
  @IsUUID()
  truckId?: string;

  @ApiProperty({ description: 'Delivery notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
