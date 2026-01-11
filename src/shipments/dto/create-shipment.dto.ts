import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ServiceType } from '@prisma/client';

export class CreateShipmentDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsEnum(ServiceType)
  @IsNotEmpty()
  serviceType: ServiceType;

  @IsString()
  @IsNotEmpty()
  pickupLocation: string;

  @IsString()
  @IsNotEmpty()
  destinationLocation: string;

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
}
