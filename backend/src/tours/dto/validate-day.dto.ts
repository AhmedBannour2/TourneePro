import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateDayDto {
  @ApiProperty({ type: [String], description: 'Employee IDs to notify by email' })
  @IsArray()
  @IsString({ each: true })
  employeeIdsToNotify!: string[];
}
