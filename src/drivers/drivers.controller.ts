import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateBankDetailsDto } from './dto/update-bank-details.dto';
import {
  DriverApplicationStatus,
  DriverStatus,
  VehicleType,
} from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /**
   * POST /drivers/applications
   * Frontend uploads files directly to R2, then sends a JSON body
   * containing text fields + R2 object keys for each file.
   */
  @SetMetadata('response_message', 'Driver application submitted successfully.')
  @Post('applications')
  createApplication(@Body() createDriverDto: CreateDriverDto) {
    return this.driversService.createApplication(createDriverDto);
  }

  /**
   * PATCH /drivers/:id/bank-details
   * Driver updates their own bank details for payouts.
   */
  @SetMetadata('response_message', 'Bank details updated successfully.')
  @Patch(':id/bank-details')
  updateBankDetails(
    @Param('id') id: string,
    @Body() dto: UpdateBankDetailsDto,
  ) {
    return this.driversService.updateBankDetails(id, dto);
  }

  /**
   * GET /drivers/:id/bank-details
   * Driver retrieves their bank details.
   */
  @SetMetadata('response_message', 'Bank details fetched successfully.')
  @Get(':id/bank-details')
  getBankDetails(@Param('id') id: string) {
    return this.driversService.getBankDetails(id);
  }

  // Admin: Applications inbox
  @UseGuards(AdminJwtGuard)
  @SetMetadata('response_message', 'Driver applications fetched successfully.')
  @Get('applications/inbox')
  listApplications(
    @Query('status') status?: DriverApplicationStatus,
    @Query('vehicleType') vehicleType?: VehicleType,
  ) {
    return this.driversService.listApplications({ status, vehicleType });
  }

  // Admin: Approved driver directory
  @UseGuards(AdminJwtGuard)
  @SetMetadata('response_message', 'Driver directory fetched successfully.')
  @Get('directory')
  listDirectory(@Query('status') status?: DriverStatus) {
    return this.driversService.listDirectory({ status });
  }

  // Admin: Available drivers for dispatch
  @UseGuards(AdminJwtGuard)
  @SetMetadata('response_message', 'Available drivers fetched successfully.')
  @Get('available')
  listAvailable(@Query('vehicleType') vehicleType?: VehicleType) {
    return this.driversService.listAvailable({ vehicleType });
  }

  @SetMetadata(
    'response_message',
    'Driver application status updated successfully.',
  )
  @UseGuards(AdminJwtGuard)
  @Patch(':id/application-status')
  updateApplicationStatus(
    @Param('id') id: string,
    @Body() body: { status: DriverApplicationStatus },
  ) {
    return this.driversService.updateApplicationStatus(id, body.status);
  }

  @SetMetadata('response_message', 'Driver status updated successfully.')
  @UseGuards(AdminJwtGuard)
  @Patch(':id/status')
  updateDriverStatus(
    @Param('id') id: string,
    @Body() body: { status: DriverStatus },
  ) {
    return this.driversService.updateDriverStatus(id, body.status);
  }

  @UseGuards(AdminJwtGuard)
  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @SetMetadata('response_message', 'Driver application fetched successfully.')
  @UseGuards(AdminJwtGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driversService.findOneById(id);
  }

  @SetMetadata('response_message', 'Driver application updated successfully.')
  @UseGuards(AdminJwtGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDriverDto: UpdateDriverDto) {
    return this.driversService.update(id, updateDriverDto);
  }

  @SetMetadata('response_message', 'Driver application deleted successfully.')
  @UseGuards(AdminJwtGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
  }
}
