import { IsDateString, IsOptional } from 'class-validator';

export class CreateInspectionDto {
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;
}
