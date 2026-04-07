import {
  IsString, IsOptional, IsIn, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSearchDto {
  @ApiPropertyOptional({ description: 'Survey number of the land parcel' })
  @IsString()
  @IsOptional()
  surveyNumber?: string;

  @ApiPropertyOptional({ description: 'Document number from registration' })
  @IsString()
  @IsOptional()
  documentNumber?: string;

  @ApiProperty({ description: 'District name (e.g., Chennai, Coimbatore)' })
  @IsString()
  @IsNotEmpty()
  district: string;

  @ApiPropertyOptional({ description: 'Sub-Registrar Office name' })
  @IsString()
  @IsOptional()
  sro?: string;

  @ApiPropertyOptional({ description: 'Village name' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ description: 'Taluk name' })
  @IsString()
  @IsOptional()
  taluk?: string;

  @ApiPropertyOptional({
    description: 'Data source to query',
    enum: ['tnreginet', 'patta', 'both'],
    default: 'both',
  })
  @IsIn(['tnreginet', 'patta', 'both'])
  @IsOptional()
  source?: 'tnreginet' | 'patta' | 'both';
}
