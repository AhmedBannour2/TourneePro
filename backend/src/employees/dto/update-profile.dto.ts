import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jean' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Dupont' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '12 rue de la Paix, 75001 Paris' })
  @IsString()
  @IsOptional()
  address?: string;
}
