import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ExpressMissionType } from '@prisma/client';

export class AddExpressDto {
  @ApiProperty({ enum: ExpressMissionType, description: 'Express mission type' })
  @IsEnum(ExpressMissionType)
  type!: ExpressMissionType;

  @ApiPropertyOptional({ description: 'Optional notes about the express mission' })
  @IsOptional()
  @IsString()
  notes?: string;
}
