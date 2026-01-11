import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  SetMetadata,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { AddCheckpointDto } from './dto/add-checkpoint.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @UseGuards(JwtAuthGuard)
  @SetMetadata('response_message', 'Shipment created successfully.')
  @Post()
  create(@Body() createShipmentDto: CreateShipmentDto, @Request() req) {
    // If customerId is not provided, use the authenticated user's ID
    if (!createShipmentDto.customerId) {
      createShipmentDto.customerId = req.user.customerId;
    }
    return this.shipmentsService.create(createShipmentDto);
  }

  @SetMetadata('response_message', 'Shipments fetched successfully.')
  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.shipmentsService.findAll(customerId, status);
  }

  @UseGuards(JwtAuthGuard)
  @SetMetadata('response_message', 'Shipment fetched successfully.')
  @Get('tracking/:trackingId')
  findByTrackingId(@Param('trackingId') trackingId: string) {
    return this.shipmentsService.findByTrackingId(trackingId);
  }

  @SetMetadata('response_message', 'Shipment fetched successfully.')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shipmentsService.findOne(id);
  }

  @SetMetadata('response_message', 'Shipment updated successfully.')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateShipmentDto: UpdateShipmentDto,
  ) {
    return this.shipmentsService.update(id, updateShipmentDto);
  }

  @SetMetadata('response_message', 'Shipment status updated successfully.')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateShipmentStatusDto,
  ) {
    return this.shipmentsService.updateStatus(id, updateStatusDto);
  }

  @SetMetadata('response_message', 'Checkpoint added successfully.')
  @Post(':id/checkpoints')
  addCheckpoint(
    @Param('id') id: string,
    @Body() addCheckpointDto: AddCheckpointDto,
  ) {
    return this.shipmentsService.addCheckpoint(id, addCheckpointDto);
  }

  @SetMetadata('response_message', 'Note added successfully.')
  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() addNoteDto: AddNoteDto) {
    return this.shipmentsService.addNote(id, addNoteDto);
  }

  @SetMetadata('response_message', 'Shipment deleted successfully.')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shipmentsService.remove(id);
  }
}
