import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { InspectionItemName, InspectionItemStatus } from '@prisma/client';

export class InspectionItemDto {
  @IsEnum(InspectionItemName)
  item!: InspectionItemName;

  @IsEnum(InspectionItemStatus)
  status!: InspectionItemStatus;

  @IsString()
  @IsOptional()
  comment?: string;
}

export class SubmitInspectionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items!: InspectionItemDto[];

  @IsString()
  @IsOptional()
  generalComment?: string;
}
