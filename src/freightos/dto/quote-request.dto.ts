import { IsOptional, IsString, IsNumber, IsIn, Min } from 'class-validator';

export class QuoteRequestDto {
  @IsOptional()
  @IsString()
  freeText?: string;

  @IsOptional()
  @IsString()
  originCountry?: string;

  @IsOptional()
  @IsString()
  originCity?: string;

  @IsOptional()
  @IsString()
  destinationCountry?: string;

  @IsOptional()
  @IsString()
  destinationCity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  unitType?:
    | 'container20'
    | 'container40'
    | 'container40HC'
    | 'container45HC'
    | 'pallets'
    | 'boxes';

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitVolumeCBM?: number;

  @IsOptional()
  @IsString()
  originUnLocationCode?: string;

  @IsOptional()
  @IsString()
  destinationUnLocationCode?: string;

  @IsOptional()
  @IsString()
  originAirportCode?: string;

  @IsOptional()
  @IsString()
  destinationAirportCode?: string;

  @IsOptional()
  @IsIn(['air', 'ocean', 'land'])
  serviceType?: 'air' | 'ocean' | 'land';
}
