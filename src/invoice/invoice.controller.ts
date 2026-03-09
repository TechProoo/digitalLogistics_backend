import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Req,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import type { Request } from 'express';

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @SetMetadata('response_message', 'Invoice generated successfully.')
  @UseGuards(JwtAuthGuard)
  @Get('shipments/:id/pdf')
  async invoice(
    @Param('id') id: string,
    @Req() req: Request & { user?: { customerId: string } },
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.invoiceService.generatePDF(id, {
        customerId: req.user?.customerId,
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=invoice-${id}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: error.message,
      });
    }
  }
}
