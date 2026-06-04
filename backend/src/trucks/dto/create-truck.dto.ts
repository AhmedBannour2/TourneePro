import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateTruckDto {
  @ApiProperty({ description: 'Vehicle registration number', example: 'AB-123-CD' })
  @IsString()
  @IsNotEmpty()
  immatriculation!: string;

  @ApiProperty({ description: 'Is truck available', default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiProperty({ description: 'Additional notes about the truck', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
