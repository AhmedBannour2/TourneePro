import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OverrideWorkedDayDto {
  @ApiProperty({ description: 'Override pay amount in euros' })
  @IsNumber()
  @Min(0)
  overridePay!: number;

  @ApiPropertyOptional({ description: 'Note explaining the override' })
  @IsOptional()
  @IsString()
  overrideNote?: string;
}
