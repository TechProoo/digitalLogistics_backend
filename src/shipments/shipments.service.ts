import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverApplicationStatus, DriverStatus, Prisma } from '@prisma/client';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { AddCheckpointDto } from './dto/add-checkpoint.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShipmentsService {
  constructor(private prisma: PrismaService) {}

  private formatLocation(parts: Array<string | undefined>): string {
    return parts
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean)
      .join(', ');
  }

  async create(createShipmentDto: CreateShipmentDto) {
    // Verify customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: createShipmentDto.customerId },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    // Generate unique tracking ID
    const trackingId = this.generateTrackingId();

    const pickupLocation =
      createShipmentDto.pickupLocation?.trim() ||
      this.formatLocation([
        createShipmentDto.pickupStreet,
        createShipmentDto.pickupCity,
        createShipmentDto.pickupState,
        createShipmentDto.pickupCountry,
      ]);

    const destinationLocation =
      createShipmentDto.destinationLocation?.trim() ||
      this.formatLocation([
        createShipmentDto.destinationStreet,
        createShipmentDto.destinationCity,
        createShipmentDto.destinationState,
        createShipmentDto.destinationCountry,
      ]);

    if (!pickupLocation) {
      throw new BadRequestException('Pickup location is required');
    }

    if (!destinationLocation) {
      throw new BadRequestException('Destination location is required');
    }

    const data: Prisma.ShipmentUncheckedCreateInput = {
      trackingId,
      customerId: createShipmentDto.customerId,
      serviceType: createShipmentDto.serviceType,
      pickupLocation,
      destinationLocation,
      packageType: createShipmentDto.packageType,
      weight: createShipmentDto.weight,
      dimensions: createShipmentDto.dimensions,
      phone: createShipmentDto.phone,
      receiverPhone: createShipmentDto.receiverPhone,
      declaredValueNgn: createShipmentDto.declaredValueNgn,
      amount: createShipmentDto.amount,
      status: 'PENDING',
    };

    const shipment = await this.prisma.shipment.create({
      data,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
        },
        notes: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    // Create initial status history entry
    await this.prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: shipment.id,
        status: 'PENDING',
        note: 'Shipment created',
      },
    });

    return shipment;
  }

  async findAll(customerId?: string, status?: string) {
    const where: any = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.shipment.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
        },
        notes: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    return shipment;
  }

  async findByTrackingId(trackingId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { trackingId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
        },
        notes: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    return shipment;
  }

  async update(id: string, updateShipmentDto: UpdateShipmentDto) {
    await this.findOne(id); // Verify exists

    return this.prisma.shipment.update({
      where: { id },
      data: updateShipmentDto,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
        },
        notes: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });
  }

  async updateStatus(id: string, updateStatusDto: UpdateShipmentStatusDto) {
    await this.findOne(id); // Verify exists

    // Update shipment status
    const shipment = await this.prisma.shipment.update({
      where: { id },
      data: { status: updateStatusDto.status },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
        },
        notes: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    // Create status history entry
    await this.prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: id,
        status: updateStatusDto.status,
        note: updateStatusDto.note,
        adminName: updateStatusDto.adminName,
      },
    });

    return shipment;
  }

  async assignDriver(shipmentId: string, driverId: string) {
    if (!driverId || typeof driverId !== 'string') {
      throw new BadRequestException('driverId is required');
    }

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, driverId: true },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    if (shipment.driverId) {
      throw new BadRequestException('Shipment already assigned');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, applicationStatus: true, status: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (driver.applicationStatus !== DriverApplicationStatus.APPROVED) {
      throw new BadRequestException('Driver is not approved');
    }

    if (driver.status !== DriverStatus.AVAILABLE) {
      throw new BadRequestException('Driver is not available');
    }

    const [updatedShipment] = await this.prisma.$transaction([
      this.prisma.shipment.update({
        where: { id: shipmentId },
        data: { driverId },
      }),
      this.prisma.driver.update({
        where: { id: driverId },
        data: { status: DriverStatus.BUSY },
      }),
    ]);

    return updatedShipment;
  }

  async addCheckpoint(id: string, addCheckpointDto: AddCheckpointDto) {
    await this.findOne(id); // Verify exists

    return this.prisma.shipmentCheckpoint.create({
      data: {
        shipmentId: id,
        location: addCheckpointDto.location,
        description: addCheckpointDto.description,
        adminName: addCheckpointDto.adminName,
      },
    });
  }

  async addNote(id: string, addNoteDto: AddNoteDto) {
    await this.findOne(id); // Verify exists

    return this.prisma.shipmentNote.create({
      data: {
        shipmentId: id,
        text: addNoteDto.text,
        adminName: addNoteDto.adminName,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Verify exists

    await this.prisma.shipment.delete({
      where: { id },
    });

    return { message: 'Shipment deleted successfully' };
  }

  private generateTrackingId(): string {
    const prefix = 'DD';
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${year}-${random}`;
  }
}
