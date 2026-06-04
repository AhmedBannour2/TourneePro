import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum DocumentType {
  ID = 'ID',
  PASSPORT = 'PASSPORT',
  CV = 'CV',
  OTHER = 'OTHER',
}

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  @IsNotEmpty()
  fileType!: DocumentType;
}
