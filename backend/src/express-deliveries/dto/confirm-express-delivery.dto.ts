import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmExpressDeliveryDto {
  @ApiPropertyOptional({ description: 'Optional notes from the confirming employee' })
  @IsOptional()
  @IsString()
  notes?: string;
}
