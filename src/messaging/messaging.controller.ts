import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /** Admin: list all driver conversations */
  @Get('conversations')
  getConversations() {
    return this.messagingService.getConversations();
  }

  /** Get messages for a driver */
  @Get(':driverId')
  getMessages(
    @Param('driverId') driverId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagingService.getMessages(
      driverId,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  /** Send message to/from driver */
  @Post(':driverId')
  sendMessage(
    @Param('driverId') driverId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(driverId, dto.sender, dto.text);
  }

  /** Mark messages as read */
  @Patch(':driverId/read')
  markAsRead(
    @Param('driverId') driverId: string,
    @Body() body: { readBy: 'admin' | 'driver' },
  ) {
    return this.messagingService.markAsRead(driverId, body.readBy);
  }

  /** Get unread count */
  @Get(':driverId/unread')
  getUnreadCount(
    @Param('driverId') driverId: string,
    @Query('for') for_: 'admin' | 'driver',
  ) {
    return this.messagingService.getUnreadCount(driverId, for_);
  }
}
