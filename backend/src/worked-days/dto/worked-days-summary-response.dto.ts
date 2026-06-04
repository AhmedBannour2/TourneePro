import { ApiProperty } from '@nestjs/swagger';

export class TourTypeSummaryDto {
  @ApiProperty()
  tourType!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  totalPay!: number;
}

export class EmployeePayrollSummaryDto {
  @ApiProperty()
  employeeId!: string;

  @ApiProperty()
  employeeName!: string;

  @ApiProperty({ nullable: true })
  firstName!: string | null;

  @ApiProperty({ nullable: true })
  lastName!: string | null;

  @ApiProperty()
  totalWorkedDays!: number;

  @ApiProperty()
  confirmedCount!: number;

  @ApiProperty()
  unconfirmedCount!: number;

  @ApiProperty()
  cancelledCount!: number;

  @ApiProperty()
  totalFinalPay!: number;

  @ApiProperty({ type: [TourTypeSummaryDto] })
  byTourType!: TourTypeSummaryDto[];
}

export class WorkedDaysSummaryResponseDto {
  @ApiProperty()
  month!: number;

  @ApiProperty()
  year!: number;

  @ApiProperty()
  totalWorkedDays!: number;

  @ApiProperty()
  totalPayroll!: number;

  @ApiProperty()
  unconfirmedDays!: number;

  @ApiProperty()
  cancelledDays!: number;

  @ApiProperty({ type: [EmployeePayrollSummaryDto] })
  employees!: EmployeePayrollSummaryDto[];
}
