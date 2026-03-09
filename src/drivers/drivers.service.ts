import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverApplicationStatus,
  DriverStatus,
  Prisma,
  VehicleType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async createApplication(createDriverDto: CreateDriverDto) {
    const driver = await this.prisma.driver.create({
      data: {
        vehicleType: createDriverDto.vehicleType,
        plateNumber: createDriverDto.plateNumber,
        driverName: createDriverDto.driverName,
        driverEmail: createDriverDto.driverEmail,
        driverPhone: createDriverDto.driverPhone,
        driverAddress: createDriverDto.driverAddress,
        guarantorName: createDriverDto.guarantorName,
        guarantorAddress: createDriverDto.guarantorAddress,
        guarantorPhone: createDriverDto.guarantorPhone,
        guarantorNin: createDriverDto.guarantorNin,
        // R2 object keys
        proofOfOwnershipPath: createDriverDto.proofOfOwnershipPath,
        vehicleLicensePath: createDriverDto.vehicleLicensePath,
        hackneyPermitPath: createDriverDto.hackneyPermitPath,
        vehicleInsurancePath: createDriverDto.vehicleInsurancePath,
        vehicleVideoPath: createDriverDto.vehicleVideoPath,
        driversLicensePath: createDriverDto.driversLicensePath,
        meansOfIdPath: createDriverDto.meansOfIdPath,
        driverFacePhotoPath: createDriverDto.driverFacePhotoPath,
        driverFullBodyPhotoPath: createDriverDto.driverFullBodyPhotoPath,
        guarantorMeansOfIdPath: createDriverDto.guarantorMeansOfIdPath,
      },
    });

    // Fire-and-forget: send "application under review" notifications
    this.sendApplicationReceivedNotifications(driver).catch((err) =>
      this.logger.error('Failed to send application notifications', err),
    );

    return driver;
  }

  private async sendApplicationReceivedNotifications(driver: {
    driverName: string;
    driverEmail: string;
    vehicleType: string;
    plateNumber: string;
  }) {
    const firstName = driver.driverName.split(' ')[0] || driver.driverName;

    await this.emailService.sendApplicationUnderReviewEmail(
      driver.driverEmail,
      {
        name: firstName,
        vehicleType: driver.vehicleType,
        plateNumber: driver.plateNumber,
      },
    );
  }

  findAll() {
    return this.prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  listApplications(filters: {
    status?: DriverApplicationStatus;
    vehicleType?: VehicleType;
  }) {
    const where: Prisma.DriverWhereInput = {
      ...(filters.status ? { applicationStatus: filters.status } : {}),
      ...(filters.vehicleType ? { vehicleType: filters.vehicleType } : {}),
    };

    return this.prisma.driver.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  listDirectory(filters: { status?: DriverStatus }) {
    const where: Prisma.DriverWhereInput = {
      applicationStatus: 'APPROVED',
      ...(filters.status ? { status: filters.status } : {}),
    };

    return this.prisma.driver.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  listAvailable(filters: { vehicleType?: VehicleType }) {
    const where: Prisma.DriverWhereInput = {
      applicationStatus: 'APPROVED',
      status: 'AVAILABLE',
      ...(filters.vehicleType ? { vehicleType: filters.vehicleType } : {}),
    };

    return this.prisma.driver.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOneById(id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('Driver application not found');
    return driver;
  }

  async updateApplicationStatus(id: string, status: DriverApplicationStatus) {
    await this.findOneById(id);

    const next: Prisma.DriverUpdateInput = {
      applicationStatus: status,
    };

    // On approval, default driver status to AVAILABLE if not suspended.
    if (status === 'APPROVED') {
      next.status = 'AVAILABLE';
    }

    // On rejection, make driver OFFLINE.
    if (status === 'REJECTED') {
      next.status = 'OFFLINE';
    }

    return this.prisma.driver.update({
      where: { id },
      data: next,
    });
  }

  async updateDriverStatus(id: string, status: DriverStatus) {
    const driver = await this.findOneById(id);

    if (driver.applicationStatus !== 'APPROVED') {
      throw new BadRequestException('Only approved drivers can change status');
    }

    return this.prisma.driver.update({
      where: { id },
      data: { status },
    });
  }

  update(id: string, _updateDriverDto: UpdateDriverDto) {
    // Not used yet (and file updates are non-trivial).
    throw new NotFoundException(`Driver application ${id} not found`);
  }

  remove(id: string) {
    throw new NotFoundException(`Driver application ${id} not found`);
  }
}
