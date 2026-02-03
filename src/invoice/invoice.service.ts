import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePDF(
    shipmentId: string,
    opts?: { customerId?: string },
  ): Promise<Buffer> {
    const invoiceData = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        checkpoints: {
          orderBy: { timestamp: 'desc' },
        },
        notes: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!invoiceData) {
      throw new NotFoundException("User's shipment not found");
    }

    // If a customerId is provided, only allow invoices for that customer's shipments.
    // (This keeps invoices private while still allowing admin usage if opts is omitted.)
    if (opts?.customerId && invoiceData.customerId !== opts.customerId) {
      throw new NotFoundException("User's shipment not found");
    }

    const formatNgn = (amount: unknown) => {
      const n = Number(amount);
      const safe = Number.isFinite(n) ? n : 0;
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(safe);
    };

    const companyName = process.env.INVOICE_COMPANY_NAME || 'Digital Delivery';
    const companyAddress =
      process.env.INVOICE_COMPANY_ADDRESS ||
      '33 Adeola Street, Amuwo-Odofin, Lagos State, Nigeria';
    const companyPhone = process.env.INVOICE_COMPANY_PHONE || '';
    const companyEmail = process.env.INVOICE_COMPANY_EMAIL || '';

    const invoiceNumber = this.buildInvoiceNumber(invoiceData.trackingId);
    const invoiceDate = new Date().toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
    const shipmentDate = new Date(invoiceData.createdAt).toLocaleDateString(
      'en-NG',
      {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      },
    );

    const signatureImage = this.tryLoadSignature();

    const pdfBuffer: Buffer = await new Promise((resolve) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (b) => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const pageWidth = doc.page.width;
      const left = doc.page.margins.left;
      const right = pageWidth - doc.page.margins.right;

      // Header
      doc.fontSize(18).fillColor('#111').text(companyName, left, 50);
      doc
        .fontSize(10)
        .fillColor('#333')
        .text(companyAddress, { width: 280 });
      if (companyPhone) doc.text(companyPhone);
      if (companyEmail) doc.text(companyEmail);

      doc
        .fontSize(22)
        .fillColor('#111')
        .text('INVOICE', left, 50, { align: 'right' });

      doc
        .fontSize(10)
        .fillColor('#333')
        .text(`Invoice #: ${invoiceNumber}`, { align: 'right' })
        .text(`Invoice Date: ${invoiceDate}`, { align: 'right' })
        .text(`Tracking ID: ${invoiceData.trackingId}`, { align: 'right' });

      doc.moveTo(left, 130).lineTo(right, 130).strokeColor('#ddd').stroke();
      doc.moveDown(2);

      // Bill to
      const customer = invoiceData.customer;
      doc.fontSize(12).fillColor('#111').text('Bill To');
      doc.fontSize(10).fillColor('#333');
      doc.text(customer?.name || 'Customer');
      if (customer?.email) doc.text(customer.email);
      if (customer?.phone) doc.text(customer.phone);

      doc.moveDown(1.5);

      // Shipment summary
      doc.fontSize(12).fillColor('#111').text('Shipment Details');
      doc.moveDown(0.5);

      const kv = (label: string, value: string) => {
        doc
          .fontSize(10)
          .fillColor('#666')
          .text(label, { continued: true, width: 140 });
        doc.fontSize(10).fillColor('#111').text(value || '-');
      };

      kv('Shipment ID:', invoiceData.id);
      kv('Shipment Date:', shipmentDate);
      kv('Service Type:', String(invoiceData.serviceType || '-'));
      kv('Current Status:', String(invoiceData.status || '-'));
      kv('Pickup Location:', invoiceData.pickupLocation);
      kv('Destination Location:', invoiceData.destinationLocation);
      kv('Package Type:', invoiceData.packageType);
      kv('Weight:', invoiceData.weight);
      kv('Dimensions:', invoiceData.dimensions);
      kv('Sender Phone:', invoiceData.phone);
      kv('Receiver Phone:', invoiceData.receiverPhone || '-');

      doc.moveDown(1.25);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#eee').stroke();
      doc.moveDown(1);

      // Totals
      doc.fontSize(12).fillColor('#111').text('Amount Due', { align: 'right' });
      doc
        .fontSize(16)
        .fillColor('#111')
        .text(formatNgn(invoiceData.amount ?? 0), { align: 'right' });

      doc
        .moveDown(0.5)
        .fontSize(9)
        .fillColor('#666')
        .text('Payment terms: Payable upon receipt.', { align: 'right' });

      // Optional timeline summary (keeps invoice aligned with platform “history” flow)
      const statusHistory = invoiceData.statusHistory || [];
      const checkpoints = invoiceData.checkpoints || [];
      if (statusHistory.length > 0 || checkpoints.length > 0) {
        doc.moveDown(1.5);
        doc.fontSize(12).fillColor('#111').text('Timeline');
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#333');

        const maxRows = 6;
        const rows: Array<{ label: string; date: string; note?: string }> = [];

        for (const h of statusHistory.slice(0, maxRows)) {
          rows.push({
            label: `Status: ${h.status}`,
            date: new Date(h.timestamp).toLocaleString('en-NG'),
            note: h.note || '',
          });
        }
        for (const c of checkpoints.slice(0, Math.max(0, maxRows - rows.length))) {
          rows.push({
            label: `Checkpoint: ${c.location}`,
            date: new Date(c.timestamp).toLocaleString('en-NG'),
            note: c.description || '',
          });
        }

        for (const r of rows) {
          doc.fillColor('#111').text(r.label, { continued: true, width: 220 });
          doc.fillColor('#666').text(r.date);
          if (r.note) {
            doc.fillColor('#333').text(`• ${r.note}`, { indent: 12 });
          }
          doc.moveDown(0.2);
        }
      }

      // Footer + signature
      const footerY = doc.page.height - doc.page.margins.bottom - 110;
      doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor('#eee').stroke();
      doc.fontSize(9).fillColor('#666').text('Thank you for choosing Digital Delivery.', left, footerY + 12);

      const sigWidth = 170;
      const sigX = right - sigWidth;
      const sigY = footerY + 20;

      if (signatureImage) {
        try {
          doc.image(signatureImage, sigX, sigY, { width: sigWidth });
        } catch (_e) {
          // If the image fails to embed, just skip it.
        }
      }

      doc
        .fontSize(9)
        .fillColor('#333')
        .text('Authorized Signature', sigX, sigY + 55, {
          width: sigWidth,
          align: 'center',
        });

      doc.end();
    });

    return pdfBuffer;
  }

  private buildInvoiceNumber(trackingId: string): string {
    const clean = String(trackingId || '').trim().toUpperCase();
    return clean ? `INV-${clean}` : `INV-${Date.now()}`;
  }

  private tryLoadSignature(): Buffer | null {
    // Preferred: env-based (good for Render/production)
    const dataUrlOrBase64 = process.env.INVOICE_SIGNATURE_BASE64;
    if (dataUrlOrBase64) {
      try {
        const raw = dataUrlOrBase64.trim();
        const base64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
        return Buffer.from(base64, 'base64');
      } catch (_e) {
        // ignore
      }
    }

    const envPath = process.env.INVOICE_SIGNATURE_PATH;
    const candidates = [
      envPath ? path.resolve(envPath) : null,
      path.join(__dirname, 'assets', 'signature.png'),
      path.join(process.cwd(), 'src', 'invoice', 'assets', 'signature.png'),
      path.join(process.cwd(), 'dist', 'invoice', 'assets', 'signature.png'),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return fs.readFileSync(p);
      } catch (_e) {
        // ignore
      }
    }

    return null;
  }
}
