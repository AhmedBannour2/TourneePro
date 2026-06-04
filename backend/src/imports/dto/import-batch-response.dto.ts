import { ApiProperty } from '@nestjs/swagger';

export class ImportBatchResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id!: string;

  @ApiProperty({ example: 'boulanger_2026-05-27.xlsx' })
  fileName!: string;

  @ApiProperty()
  uploadedAt!: Date;

  @ApiProperty({
    description:
      'Status of the import batch: pending, processing, preview, committed, cancelled, failed',
    example: 'pending',
  })
  status!: string;

  @ApiProperty({ example: 0 })
  rowCount!: number;

  @ApiProperty({ example: 0 })
  errorCount!: number;
}

export class ImportRowResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  batchId!: string;

  @ApiProperty()
  rowIndex!: number;

  @ApiProperty()
  rawData!: Record<string, any>;

  @ApiProperty({ required: false })
  parsedData?: Record<string, any>;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiProperty({ required: false })
  errorMessage?: string;
}

export class PaginatedImportRowsDto {
  @ApiProperty({ type: [ImportRowResponseDto] })
  rows!: ImportRowResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
