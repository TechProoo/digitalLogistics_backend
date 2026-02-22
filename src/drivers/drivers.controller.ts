import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  SetMetadata,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import {
  DriverApplicationStatus,
  DriverStatus,
  VehicleType,
} from '@prisma/client';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_SUBDIR = 'uploads/drivers';
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'drivers');
mkdirSync(UPLOAD_DIR, { recursive: true });

function toStoredPath(file: Express.Multer.File): string {
  // Store with forward slashes for portability.
  return `${UPLOAD_SUBDIR}/${file.filename}`;
}

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @SetMetadata('response_message', 'Driver application submitted successfully.')
  @Post('applications')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'proofOfOwnership', maxCount: 1 },
        { name: 'vehicleLicense', maxCount: 1 },
        { name: 'hackneyPermit', maxCount: 1 },
        { name: 'vehicleInsurance', maxCount: 1 },
        { name: 'vehicleVideo', maxCount: 1 },
        { name: 'driversLicense', maxCount: 1 },
        { name: 'meansOfId', maxCount: 1 },
        { name: 'driverFacePhoto', maxCount: 1 },
        { name: 'driverFullBodyPhoto', maxCount: 1 },
        { name: 'guarantorMeansOfId', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
          filename: (_req, file, cb) => {
            const id = randomUUID();
            const ext = extname(file.originalname || '').toLowerCase();
            cb(null, `${id}${ext || ''}`);
          },
        }),
        limits: {
          // Keep this conservative; adjust if you expect larger video files.
          fileSize: 50 * 1024 * 1024,
        },
      },
    ),
  )
  createApplication(
    @Body() createDriverDto: CreateDriverDto,
    @UploadedFiles()
    files: {
      proofOfOwnership?: Express.Multer.File[];
      vehicleLicense?: Express.Multer.File[];
      hackneyPermit?: Express.Multer.File[];
      vehicleInsurance?: Express.Multer.File[];
      vehicleVideo?: Express.Multer.File[];
      driversLicense?: Express.Multer.File[];
      meansOfId?: Express.Multer.File[];
      driverFacePhoto?: Express.Multer.File[];
      driverFullBodyPhoto?: Express.Multer.File[];
      guarantorMeansOfId?: Express.Multer.File[];
    },
  ) {
    const required = [
      'proofOfOwnership',
      'vehicleLicense',
      'hackneyPermit',
      'vehicleInsurance',
      'vehicleVideo',
      'driversLicense',
      'meansOfId',
      'driverFacePhoto',
      'driverFullBodyPhoto',
      'guarantorMeansOfId',
    ] as const;

    for (const k of required) {
      if (!files?.[k]?.[0]) {
        throw new BadRequestException(`Missing required upload: ${k}`);
      }
    }

    return this.driversService.createApplication(createDriverDto, {
      proofOfOwnershipPath: toStoredPath(files.proofOfOwnership![0]),
      vehicleLicensePath: toStoredPath(files.vehicleLicense![0]),
      hackneyPermitPath: toStoredPath(files.hackneyPermit![0]),
      vehicleInsurancePath: toStoredPath(files.vehicleInsurance![0]),
      vehicleVideoPath: toStoredPath(files.vehicleVideo![0]),
      driversLicensePath: toStoredPath(files.driversLicense![0]),
      meansOfIdPath: toStoredPath(files.meansOfId![0]),
      driverFacePhotoPath: toStoredPath(files.driverFacePhoto![0]),
      driverFullBodyPhotoPath: toStoredPath(files.driverFullBodyPhoto![0]),
      guarantorMeansOfIdPath: toStoredPath(files.guarantorMeansOfId![0]),
    });
  }

  // Admin: Applications inbox
  @SetMetadata('response_message', 'Driver applications fetched successfully.')
  @Get('applications/inbox')
  listApplications(
    @Query('status') status?: DriverApplicationStatus,
    @Query('vehicleType') vehicleType?: VehicleType,
  ) {
    return this.driversService.listApplications({ status, vehicleType });
  }

  // Admin: Approved driver directory
  @SetMetadata('response_message', 'Driver directory fetched successfully.')
  @Get('directory')
  listDirectory(@Query('status') status?: DriverStatus) {
    return this.driversService.listDirectory({ status });
  }

  // Admin: Available drivers for dispatch
  @SetMetadata('response_message', 'Available drivers fetched successfully.')
  @Get('available')
  listAvailable(@Query('vehicleType') vehicleType?: VehicleType) {
    return this.driversService.listAvailable({ vehicleType });
  }

  @SetMetadata(
    'response_message',
    'Driver application status updated successfully.',
  )
  @Patch(':id/application-status')
  updateApplicationStatus(
    @Param('id') id: string,
    @Body() body: { status: DriverApplicationStatus },
  ) {
    return this.driversService.updateApplicationStatus(id, body.status);
  }

  @SetMetadata('response_message', 'Driver status updated successfully.')
  @Patch(':id/status')
  updateDriverStatus(
    @Param('id') id: string,
    @Body() body: { status: DriverStatus },
  ) {
    return this.driversService.updateDriverStatus(id, body.status);
  }

  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @SetMetadata('response_message', 'Driver application fetched successfully.')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driversService.findOneById(id);
  }

  @SetMetadata('response_message', 'Driver application updated successfully.')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDriverDto: UpdateDriverDto) {
    return this.driversService.update(id, updateDriverDto);
  }

  @SetMetadata('response_message', 'Driver application deleted successfully.')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
  }
}
