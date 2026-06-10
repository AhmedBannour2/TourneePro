import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateTourDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platformId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quai?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  horaire?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourType?: string;
}
