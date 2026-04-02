import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  /** Get all deliveries for a driver. */
  @Get('driver/:driverId')
  getDriverDeliveries(@Param('driverId') driverId: string) {
    return this.deliveryService.getDriverDeliveries(driverId);
  }

  /** Get active (non-DELIVERED, non-CANCELLED) deliveries for a driver. */
  @Get('driver/:driverId/active')
  getActiveDeliveries(@Param('driverId') driverId: string) {
    return this.deliveryService.getActiveDeliveries(driverId);
  }

  /** Update delivery status via REST. */
  @Patch(':shipmentId/status')
  updateStatus(
    @Param('shipmentId') shipmentId: string,
    @Body() body: { driverId: string; action: string },
  ) {
    return this.deliveryService.updateDeliveryStatus(
      shipmentId,
      body.driverId,
      body.action,
    );
  }
}
