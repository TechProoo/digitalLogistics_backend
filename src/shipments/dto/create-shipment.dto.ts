import {
  IsEnum,
  IsInt,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ServiceType } from '@prisma/client';

export class CreateShipmentDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsEnum(ServiceType)
  @IsNotEmpty()
  serviceType: ServiceType;

  // Backward compatible: clients may send pickupLocation/destinationLocation strings.
  // New clients can instead send structured fields and the server will compose them.
  @ValidateIf(
    (o) =>
      !o.pickupStreet && !o.pickupCity && !o.pickupState && !o.pickupCountry,
  )
  @IsString()
  @IsNotEmpty()
  pickupLocation?: string;

  @ValidateIf((o) => !o.pickupLocation)
  @IsString()
  @IsNotEmpty()
  pickupStreet?: string;

  @ValidateIf((o) => !o.pickupLocation)
  @IsString()
  @IsNotEmpty()
  pickupCity?: string;

  @ValidateIf((o) => !o.pickupLocation)
  @IsString()
  @IsNotEmpty()
  pickupState?: string;

  @ValidateIf((o) => !o.pickupLocation)
  @IsString()
  @IsNotEmpty()
  pickupCountry?: string;

  @ValidateIf(
    (o) =>
      !o.destinationStreet &&
      !o.destinationCity &&
      !o.destinationState &&
      !o.destinationCountry,
  )
  @IsString()
  @IsNotEmpty()
  destinationLocation?: string;

  @ValidateIf((o) => !o.destinationLocation)
  @IsString()
  @IsNotEmpty()
  destinationStreet?: string;

  @ValidateIf((o) => !o.destinationLocation)
  @IsString()
  @IsNotEmpty()
  destinationCity?: string;

  @ValidateIf((o) => !o.destinationLocation)
  @IsString()
  @IsNotEmpty()
  destinationState?: string;

  @ValidateIf((o) => !o.destinationLocation)
  @IsString()
  @IsNotEmpty()
  destinationCountry?: string;

  @IsString()
  @IsNotEmpty()
  packageType: string;

  @IsString()
  @IsNotEmpty()
  weight: string;

  @IsString()
  @IsNotEmpty()
  dimensions: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  receiverPhone?: string;

  /** Declared item value in Nigerian Naira (whole number). */
  @IsInt()
  @Min(0)
  @IsOptional()
  declaredValueNgn?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  amount?: number;
}
