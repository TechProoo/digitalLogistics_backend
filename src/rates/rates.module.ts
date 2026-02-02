import { Module } from '@nestjs/common';
import { ManualRateEngineService } from './manual-rate-engine.service';
import { RatesController } from './rates.controller';

@Module({
  providers: [ManualRateEngineService],
  controllers: [RatesController],
  exports: [ManualRateEngineService],
})
export class RatesModule {}
