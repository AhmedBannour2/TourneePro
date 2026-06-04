import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsString } from 'class-validator';

export class GetExpressDeliveriesQueryDto {
  @ApiProperty({ description: 'Filter by date (ISO format)', required: false, example: '2026-05-27' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ description: 'Filter by status', required: false, example: 'PENDING' })
  @IsOptional()
  @IsString()
  status?: string;
}
