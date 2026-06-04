import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateTourDto {
  @ApiProperty({ description: 'Tour code (number as string, e.g. "804")' })
  @IsString()
  @IsNotEmpty()
  tourCode!: string;

  @ApiProperty({ description: 'Tour date (YYYY-MM-DD)' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Platform ID' })
  @IsString()
  @IsNotEmpty()
  platformId!: string;

  @ApiPropertyOptional({ description: 'Dock / quai' })
  @IsOptional()
  @IsString()
  quai?: string;

  @ApiPropertyOptional({ description: 'Pickup time (e.g. "7:30")' })
  @IsOptional()
  @IsString()
  horaire?: string;

  @ApiPropertyOptional({ description: 'Tour type label (auto-detected from code if omitted)' })
  @IsOptional()
  @IsString()
  tourType?: string;
}
