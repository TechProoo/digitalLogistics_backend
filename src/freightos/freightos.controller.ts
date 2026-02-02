import { Body, Controller, Post } from '@nestjs/common';
import { FreightosService } from './freightos.service';
import { QuoteRequestDto } from './dto/quote-request.dto';

@Controller('freightos')
export class FreightosController {
  constructor(private readonly freightos: FreightosService) {}

  @Post('quote')
  async quote(@Body() dto: QuoteRequestDto) {
    return this.freightos.handleQuoteRequest(dto);
  }
}
