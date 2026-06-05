import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

export class AssignExpressDeliveryDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 2, description: 'Employee IDs (1 or 2)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  employeeIds!: string[];
}
