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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request, Response } from 'express';

@Controller('pdf')
export class LegacyPdfController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @SetMetadata('response_message', 'Invoice generated successfully.')
  @UseGuards(JwtAuthGuard)
  @Get(':id')
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

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error: any) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: error?.message || 'Not found',
      });
    }
  }
}
