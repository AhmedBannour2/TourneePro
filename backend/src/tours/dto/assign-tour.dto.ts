import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignTourDto {
  @ApiProperty({ description: 'Chauffeur-livreur ID', required: true })
  @IsString()
  @IsUUID()
  chauffeurId!: string;

  @ApiProperty({ description: 'Aide-livreur ID', required: false })
  @IsOptional()
  @IsString()
  @IsUUID()
  aideId?: string;

  @ApiProperty({ description: 'Truck ID', required: true })
  @IsString()
  @IsUUID()
  truckId!: string;
}
