import { PartialType } from '@nestjs/mapped-types';
import { CreateShipmentDto } from './create-shipment.dto';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ShipmentStatus } from '@prisma/client';

export class UpdateShipmentDto extends PartialType(CreateShipmentDto) {
  @IsEnum(ShipmentStatus)
  @IsOptional()
  status?: ShipmentStatus;

  @IsInt()
  @Min(0)
  @IsOptional()
  amount?: number;
}
