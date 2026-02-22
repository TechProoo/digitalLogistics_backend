import { VehicleType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateDriverDto {
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsString()
  @IsNotEmpty()
  driverName: string;

  @IsString()
  @IsNotEmpty()
  driverAddress: string;

  @IsString()
  @IsNotEmpty()
  guarantorName: string;

  @IsString()
  @IsNotEmpty()
  guarantorAddress: string;

  @IsString()
  @IsNotEmpty()
  guarantorPhone: string;

  @IsString()
  @IsNotEmpty()
  guarantorNin: string;
}
