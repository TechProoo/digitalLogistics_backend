import { Module } from '@nestjs/common';
import { FreightosService } from './freightos.service';
import { FreightosController } from './freightos.controller';
import { GeminiAiService } from '../gemini/gemini-ai.service';

@Module({
  providers: [FreightosService, GeminiAiService],
  controllers: [FreightosController],
  exports: [FreightosService],
})
export class FreightosModule {}
