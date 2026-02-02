import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { GeminiAiService } from '../gemini/gemini-ai.service';
import { RatesModule } from '../rates/rates.module';

/**
 * Chat module - self-contained
 *
 * Exports:
 * - ChatService for use in other modules
 */
@Module({
  imports: [RatesModule],
  providers: [ChatGateway, ChatService, GeminiAiService],
  exports: [ChatService],
})
export class ChatModule {}
