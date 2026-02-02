import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LatLngDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class DimensionsCmDto {
  @IsNumber()
  @Min(0.1)
  length: number;

  @IsNumber()
  @Min(0.1)
  width: number;

  @IsNumber()
  @Min(0.1)
  height: number;
}

export type ManualMode = 'parcel' | 'air' | 'ocean' | 'ground';
export type ManualContainerType = '20ft' | '40ft' | '40hc';

export class ManualQuoteRequestDto {
  @IsOptional()
  @IsString()
  freeText?: string;

  @IsOptional()
  @IsIn(['parcel', 'air', 'ocean', 'ground'])
  mode?: ManualMode;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  weightKg?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DimensionsCmDto)
  dimensionsCm?: DimensionsCmDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCbm?: number;

  @IsOptional()
  @IsIn(['20ft', '40ft', '40hc'])
  containerType?: ManualContainerType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  /** Optional: if provided, used to compute driving distance (ground) */
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  start?: LatLngDto;

  /** Optional: if provided, used to compute driving distance (ground) */
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  end?: LatLngDto;

  @IsOptional()
  isExpress?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  detentionDemurrageDays?: number;
}
