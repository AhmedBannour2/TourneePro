import { IsString, IsOptional } from 'class-validator';

export class SetResponsibleDto {
  @IsString()
  @IsOptional()
  employeeId?: string | null;
}
