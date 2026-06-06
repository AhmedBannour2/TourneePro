import { IsString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class MailConfigDto {
  @IsString()
  host!: string;

  @IsNumber()
  @Type(() => Number)
  port!: number;

  @IsString()
  user!: string;

  @IsString()
  @IsOptional()
  pass?: string;

  @IsString()
  from!: string;
}
