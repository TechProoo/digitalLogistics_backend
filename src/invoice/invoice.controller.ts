import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response } from 'express';

@Controller('pdf')
export class InvoiceController {
  constructor(private readonly  invoiceService: InvoiceService) {}

  @SetMetadata('response_message', 'Invoice generated successfully.')
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async invoice(@Param('id') id: string, @Res() res: Response) {
    try {
      const pdfBuffer = await this.invoiceService.generatePDF(id);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=invoice-${id}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      res.status(HttpStatus.OK).end(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: error.message,
      });
    }
  }
}
