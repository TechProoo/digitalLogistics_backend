import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { LegacyPdfController } from './legacy-pdf.controller';

@Module({
  controllers: [InvoiceController, LegacyPdfController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
