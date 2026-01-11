import { PartialType } from '@nestjs/mapped-types';
import { CreateShipmentDto } from './create-shipment.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ShipmentStatus } from '@prisma/client';

export class UpdateShipmentDto extends PartialType(CreateShipmentDto) {
  @IsEnum(ShipmentStatus)
  @IsOptional()
  status?: ShipmentStatus;
}
