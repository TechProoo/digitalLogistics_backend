import { Body, Controller, Post } from '@nestjs/common';
import { ManualRateEngineService } from './manual-rate-engine.service';
import { ManualQuoteRequestDto } from './dto/manual-quote-request.dto';

@Controller('rates')
export class RatesController {
  constructor(private readonly manualRates: ManualRateEngineService) {}

  @Post('manual-quote')
  async manualQuote(@Body() dto: ManualQuoteRequestDto) {
    return await this.manualRates.estimate(dto);
  }
}
