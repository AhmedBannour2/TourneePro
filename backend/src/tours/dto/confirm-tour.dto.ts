import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ConfirmTourDto {
  @ApiProperty({ description: 'Total number of clients on this tour' })
  @IsInt()
  @Min(0)
  totalClients!: number;

  @ApiProperty({ description: 'Number of delivered clients' })
  @IsInt()
  @Min(0)
  delivered!: number;

  @ApiProperty({ description: 'Number of absent clients' })
  @IsInt()
  @Min(0)
  absent!: number;

  @ApiProperty({ description: 'Number of non-conforming deliveries' })
  @IsInt()
  @Min(0)
  nonConform!: number;

  @ApiPropertyOptional({ description: 'Number of appliances collected (D3E / WEEE)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  d3e?: number;

  @ApiPropertyOptional({ description: 'Optional notes about the tour' })
  @IsOptional()
  @IsString()
  notes?: string;
}
