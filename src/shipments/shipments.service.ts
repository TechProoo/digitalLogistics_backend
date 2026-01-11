import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { AddCheckpointDto } from './dto/add-checkpoint.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShipmentsService {
  constructor(private prisma: PrismaService) {}

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

    const shipment = await this.prisma.shipment.create({
      data: {
        trackingId,
        customerId: createShipmentDto.customerId,
        serviceType: createShipmentDto.serviceType,
        pickupLocation: createShipmentDto.pickupLocation,
        destinationLocation: createShipmentDto.destinationLocation,
        packageType: createShipmentDto.packageType,
        weight: createShipmentDto.weight,
        dimensions: createShipmentDto.dimensions,
        phone: createShipmentDto.phone,
        status: 'PENDING',
      },
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
