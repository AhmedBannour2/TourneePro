import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum } from 'class-validator';

export enum WorkedDayType {
  WORKED = 'WORKED',
  REST = 'REST',
  ABSENT = 'ABSENT',
  HOLIDAY = 'HOLIDAY',
}

export class CreateWorkedDayDto {
  @ApiProperty({ description: 'Employee ID' })
  @IsUUID()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({ description: 'Date (YYYY-MM-DD)', example: '2026-05-27' })
  @IsString()
  @IsNotEmpty()
  date!: string;

  @ApiProperty({ description: 'Type of day', enum: WorkedDayType })
  @IsEnum(WorkedDayType)
  @IsNotEmpty()
  type!: WorkedDayType;

  @ApiProperty({ description: 'Notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
