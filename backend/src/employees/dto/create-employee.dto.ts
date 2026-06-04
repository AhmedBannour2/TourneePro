import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export enum EmployeeRole {
  CHAUFFEUR = 'CHAUFFEUR',
  AIDE = 'AIDE',
  BOTH = 'BOTH',
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  lastName!: string;

  @ApiProperty({ enum: EmployeeRole })
  @IsEnum(EmployeeRole)
  @IsNotEmpty()
  role!: EmployeeRole;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '12 rue de la Paix, 75001 Paris' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
