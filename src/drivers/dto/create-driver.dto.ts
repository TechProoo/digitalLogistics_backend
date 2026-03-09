import { VehicleType } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateDriverDto {
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsString()
  @IsNotEmpty()
  driverName: string;

  @IsEmail()
  driverEmail: string;

  @IsString()
  @IsNotEmpty()
  driverPhone: string;

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

  // ── R2 object keys (uploaded directly by the frontend) ──

  @IsString()
  @IsNotEmpty()
  proofOfOwnershipPath: string;

  @IsString()
  @IsNotEmpty()
  vehicleLicensePath: string;

  @IsString()
  @IsNotEmpty()
  hackneyPermitPath: string;

  @IsString()
  @IsNotEmpty()
  vehicleInsurancePath: string;

  @IsString()
  @IsNotEmpty()
  vehicleVideoPath: string;

  @IsString()
  @IsNotEmpty()
  driversLicensePath: string;

  @IsString()
  @IsNotEmpty()
  meansOfIdPath: string;

  @IsString()
  @IsNotEmpty()
  driverFacePhotoPath: string;

  @IsString()
  @IsNotEmpty()
  driverFullBodyPhotoPath: string;

  @IsString()
  @IsNotEmpty()
  guarantorMeansOfIdPath: string;
}
