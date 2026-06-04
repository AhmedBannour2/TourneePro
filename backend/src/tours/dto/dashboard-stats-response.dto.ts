import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsResponseDto {
  @ApiProperty({ description: 'Number of tours scheduled for today' })
  toursToday!: number;

  @ApiProperty({ description: 'Number of unassigned tours today' })
  unassigned!: number;

  @ApiProperty({ description: 'Number of active employees' })
  activeEmployees!: number;

  @ApiProperty({ description: 'Number of recent import errors' })
  importErrors!: number;
}
