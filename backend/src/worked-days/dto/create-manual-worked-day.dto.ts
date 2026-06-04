import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { TourType, EmployeeRole } from '@prisma/client';

export class CreateManualWorkedDayDto {
  @ApiProperty({ description: 'Employee ID' })
  @IsString()
  employeeId!: string;

  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: TourType, description: 'Tour type' })
  @IsEnum(TourType)
  tourType!: TourType;

  @ApiProperty({ enum: EmployeeRole, description: 'Employee role for this day' })
  @IsEnum(EmployeeRole)
  employeeRole!: EmployeeRole;

  @ApiPropertyOptional({ description: 'Linked tour ID' })
  @IsOptional()
  @IsString()
  tourId?: string;
}
