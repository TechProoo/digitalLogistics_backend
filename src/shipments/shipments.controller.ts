import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
@UseGuards(JwtAuthGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  create(@Body() createShipmentDto: CreateShipmentDto, @Request() req) {
    // If customerId is not provided, use the authenticated user's ID
    if (!createShipmentDto.customerId) {
      createShipmentDto.customerId = req.user.customerId;
    }
    return this.shipmentsService.create(createShipmentDto);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.shipmentsService.findAll(customerId, status);
  }

  @Get('tracking/:trackingId')
  findByTrackingId(@Param('trackingId') trackingId: string) {
    return this.shipmentsService.findByTrackingId(trackingId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shipmentsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateShipmentDto: UpdateShipmentDto,
  ) {
    return this.shipmentsService.update(id, updateShipmentDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateShipmentStatusDto,
  ) {
    return this.shipmentsService.updateStatus(id, updateStatusDto);
  }

  @Post(':id/checkpoints')
  addCheckpoint(
    @Param('id') id: string,
    @Body() addCheckpointDto: AddCheckpointDto,
  ) {
    return this.shipmentsService.addCheckpoint(id, addCheckpointDto);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() addNoteDto: AddNoteDto) {
    return this.shipmentsService.addNote(id, addNoteDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shipmentsService.remove(id);
  }
}
