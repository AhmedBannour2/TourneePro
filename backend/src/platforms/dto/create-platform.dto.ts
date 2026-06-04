import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreatePlatformDto {
  @ApiProperty({ description: 'Platform name', example: 'Alfortville' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Platform code', example: 'F166' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
