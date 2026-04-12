import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Shipment, ShipmentStatus } from '@prisma/client';

const ACTION_STATUS_MAP: Record<string, ShipmentStatus> = {
  accept: ShipmentStatus.ACCEPTED,
  pickup: ShipmentStatus.PICKED_UP,
  start: ShipmentStatus.IN_TRANSIT,
  handoff: ShipmentStatus.HANDED_OFF,
  complete: ShipmentStatus.DELIVERED,
  fail: ShipmentStatus.CANCELLED,
};

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all shipments assigned to a specific driver.
   */
  async getDriverDeliveries(driverId: string) {
    const shipments = await this.prisma.shipment.findMany({
      where: {
        OR: [{ driverId }, { lastMileDriverId: driverId }],
      },
      orderBy: { createdAt: 'desc' },
      include: { customer: true, notes: true, statusHistory: true },
    });
    return shipments.map((s) => this.toDriverDelivery(s));
  }

  /**
   * Get active deliveries for a driver (not DELIVERED or CANCELLED).
   */
  async getActiveDeliveries(driverId: string) {
    const shipments = await this.prisma.shipment.findMany({
      where: {
        OR: [{ driverId }, { lastMileDriverId: driverId }],
        status: {
          notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { customer: true, notes: true, statusHistory: true },
    });
    return shipments.map((s) => this.toDriverDelivery(s));
  }

  /**
   * Transform a Shipment (with relations) into the shape the driver frontend expects.
   */
  private toDriverDelivery(s: any) {
    const statusMap: Record<string, string> = {
      PENDING: 'pending',
      QUOTED: 'pending',
      ACCEPTED: 'assigned',
      PICKED_UP: 'picked_up',
      IN_TRANSIT: 'in_transit',
      HANDED_OFF: 'handed_off',
      IN_AIR: 'handed_off',
      AT_SEA: 'handed_off',
      ARRIVED_HUB: 'pending',
      DELIVERED: 'delivered',
      CANCELLED: 'failed',
    };

    const notesText = (s.notes || [])
      .map((n: any) => n.text)
      .filter(Boolean)
      .join(' | ');

    return {
      id: s.id,
      trackingNumber: s.trackingId,
      customerName: s.customer?.name || 'Customer',
      customerPhone: s.phone || '',
      receiverPhone: s.receiverPhone || '',
      pickupAddress: s.pickupLocation,
      dropoffAddress: s.destinationLocation,
      status: statusMap[s.status] || 'pending',
      serviceType: s.serviceType,
      scheduledAt: s.createdAt.toISOString(),
      estimatedArrival: null,
      distance: 0,
      earnings: s.amount || 0,
      notes: notesText,
      weight: parseFloat(s.weight) || 0,
      items: 1,
      packageType: s.packageType || '',
      dimensions: s.dimensions || '',
      declaredValue: s.declaredValueNgn || 0,
    };
  }

  /**
   * Update delivery status with proper state-machine mapping and history record.
   *
   * action 'accept'   -> ACCEPTED
   * action 'pickup'   -> PICKED_UP
   * action 'start'    -> IN_TRANSIT
   * action 'complete' -> DELIVERED
   * action 'fail'     -> CANCELLED
   */
  async updateDeliveryStatus(
    shipmentId: string,
    driverId: string,
    action: string,
  ): Promise<Shipment> {
    const newStatus = ACTION_STATUS_MAP[action];
    if (!newStatus) {
      throw new BadRequestException(
        `Invalid action "${action}". Allowed: ${Object.keys(ACTION_STATUS_MAP).join(', ')}`,
      );
    }

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new BadRequestException(`Shipment ${shipmentId} not found`);
    }

    if (shipment.driverId && shipment.driverId !== driverId && shipment.lastMileDriverId !== driverId) {
      throw new BadRequestException(
        'This shipment is assigned to a different driver',
      );
    }

    // On handoff: free the driver so they can take new deliveries
    if (action === 'handoff') {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { status: 'AVAILABLE' },
      });
    }

    // Prevent accepting a new delivery if driver already has an active one
    if (action === 'accept') {
      const activeCount = await this.prisma.shipment.count({
        where: {
          driverId,
          id: { not: shipmentId }, // exclude the shipment being accepted
          status: {
            notIn: [
              ShipmentStatus.DELIVERED,
              ShipmentStatus.CANCELLED,
              ShipmentStatus.PENDING,
              ShipmentStatus.QUOTED,
              ShipmentStatus.ARRIVED_HUB,
            ],
          },
        },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          'You must complete your current delivery before accepting a new one',
        );
      }
    }

    this.logger.log(
      `Shipment ${shipmentId}: ${shipment.status} -> ${newStatus} (action: ${action}, driver: ${driverId})`,
    );

    // Update shipment status and create history record in a transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedShipment = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: newStatus,
          driverId,
        },
        include: { statusHistory: true },
      });

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId,
          status: newStatus,
          note: `Driver ${driverId} performed action: ${action}`,
        },
      });

      return updatedShipment;
    });

    return updated;
  }
}
