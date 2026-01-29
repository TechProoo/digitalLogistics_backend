import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

/**
 * Chat module - self-contained
 *
 * Exports:
 * - ChatService for use in other modules
 */
@Module({
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
