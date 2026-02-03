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
    const shipment = await this.prisma.shipment.findUnique({
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

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    if (
      opts?.customerId &&
      shipment.customerId &&
      shipment.customerId !== opts.customerId
    ) {
      // Hide existence for unauthorized customers
      throw new NotFoundException('Shipment not found');
    }

    const companyName = process.env.INVOICE_COMPANY_NAME || 'Digital Delivery';
    const companyAddress =
      process.env.INVOICE_COMPANY_ADDRESS ||
      'Fast, secure and reliable logistics across Nigeria.';
    const companyPhone = process.env.INVOICE_COMPANY_PHONE || '';
    const companyEmail = process.env.INVOICE_COMPANY_EMAIL || '';

    const invoiceNumber = this.buildInvoiceNumber(shipment.trackingId);
    const invoiceDate = new Date().toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });

    const shipmentDate = shipment.createdAt
      ? new Date(shipment.createdAt).toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        })
      : '-';

    const signatureImage = this.tryLoadSignature();

    const formatNgn = (amount: number) => {
      const value = Number.isFinite(amount) ? amount : 0;
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        maximumFractionDigits: 0,
      }).format(value);
    };

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (b) => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const left = doc.page.margins.left;
      const right = pageWidth - doc.page.margins.right;
      const contentWidth = right - left;

      const colors = {
        text: '#0f172a',
        muted: '#64748b',
        border: '#e2e8f0',
        surface: '#ffffff',
        card: '#f8fafc',
        primary: '#17c7bd',
      };

      const ensureText = (v: unknown) => {
        const s = String(v ?? '').trim();
        return s.length ? s : '-';
      };

      const addPageIfNeeded = (neededHeight: number, currentY: number) => {
        const bottomSafe = doc.page.margins.bottom + 120;
        if (currentY + neededHeight <= pageHeight - bottomSafe) return currentY;
        doc.addPage();
        return doc.page.margins.top;
      };

      const drawCard = (x: number, y: number, w: number, h: number) => {
        doc
          .save()
          .roundedRect(x, y, w, h, 14)
          .fill(colors.card)
          .strokeColor(colors.border)
          .lineWidth(1)
          .stroke()
          .restore();
      };

      const drawSectionTitle = (
        title: string,
        x: number,
        y: number,
        w: number,
      ) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(colors.text)
          .text(title, x, y, { width: w });
      };

      const drawKeyValueList = (
        entries: Array<{ label: string; value: string }>,
        x: number,
        startY: number,
        w: number,
      ) => {
        const labelW = Math.min(160, Math.max(120, Math.floor(w * 0.28)));
        const gap = 10;
        const valueW = w - labelW - gap;
        let y = startY;

        for (const e of entries) {
          const label = ensureText(e.label);
          const value = ensureText(e.value);
          const valueHeight = doc.heightOfString(value, {
            width: valueW,
            lineGap: 2,
          });
          const rowH = Math.max(14, valueHeight);

          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(label, x, y, { width: labelW });

          doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor(colors.text)
            .text(value, x + labelW + gap, y, { width: valueW, lineGap: 2 });

          y += rowH + 6;
        }

        return y;
      };

      doc.info.Title = `Invoice ${invoiceNumber}`;
      doc.rect(0, 0, pageWidth, pageHeight).fill(colors.surface);

      let y = 40;

      // Header
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(colors.text)
        .text(companyName, left, y);

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(colors.muted)
        .text(companyAddress, left, y + 22, { width: 320 });

      const contactParts = [companyPhone, companyEmail].filter(Boolean);
      if (contactParts.length) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(colors.muted)
          .text(contactParts.join(' • '), left, y + 40, { width: 320 });
      }

      const metaX = left + Math.floor(contentWidth * 0.55);
      const metaW = right - metaX;
      doc
        .font('Helvetica-Bold')
        .fontSize(26)
        .fillColor(colors.text)
        .text('INVOICE', metaX, y, { width: metaW, align: 'right' });

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(colors.muted)
        .text(`Invoice #: ${invoiceNumber}`, metaX, y + 32, {
          width: metaW,
          align: 'right',
        })
        .text(`Invoice Date: ${invoiceDate}`, {
          width: metaW,
          align: 'right',
        })
        .text(`Tracking ID: ${shipment.trackingId}`, {
          width: metaW,
          align: 'right',
        });

      doc
        .moveTo(left, y + 70)
        .lineTo(right, y + 70)
        .strokeColor(colors.border)
        .lineWidth(1)
        .stroke();

      y = y + 92;

      // Bill To + Amount Due cards
      const cardGap = 14;
      const billW = Math.floor(contentWidth * 0.62);
      const dueW = contentWidth - billW - cardGap;
      const cardH = 110;
      const pad = 16;

      y = addPageIfNeeded(cardH + 10, y);
      drawCard(left, y, billW, cardH);
      drawCard(left + billW + cardGap, y, dueW, cardH);

      drawSectionTitle('Bill To', left + pad, y + 14, billW - pad * 2);
      const customer = shipment.customer;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(colors.text)
        .text(customer?.name || 'Customer', left + pad, y + 34, {
          width: billW - pad * 2,
        });
      doc.font('Helvetica').fontSize(10).fillColor(colors.muted);
      if (customer?.email) {
        doc.text(customer.email, left + pad, y + 52, {
          width: billW - pad * 2,
        });
      }
      if (customer?.phone) {
        doc.text(customer.phone, left + pad, y + 68, {
          width: billW - pad * 2,
        });
      }

      drawSectionTitle(
        'Amount Due',
        left + billW + cardGap + pad,
        y + 14,
        dueW - pad * 2,
      );
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(colors.primary)
        .text(
          formatNgn(Number(shipment.amount ?? 0)),
          left + billW + cardGap + pad,
          y + 42,
          {
            width: dueW - pad * 2,
            align: 'left',
          },
        );
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('Payable upon receipt', left + billW + cardGap + pad, y + 70, {
          width: dueW - pad * 2,
        });

      y = y + cardH + 16;

      // Shipment Details card
      const shipmentEntries: Array<{ label: string; value: string }> = [
        { label: 'Shipment ID', value: shipment.id },
        { label: 'Shipment Date', value: shipmentDate },
        { label: 'Service Type', value: String(shipment.serviceType || '-') },
        { label: 'Current Status', value: String(shipment.status || '-') },
        { label: 'Pickup Location', value: shipment.pickupLocation },
        { label: 'Destination Location', value: shipment.destinationLocation },
        { label: 'Package Type', value: shipment.packageType },
        { label: 'Weight', value: shipment.weight },
        { label: 'Dimensions', value: shipment.dimensions },
        { label: 'Sender Phone', value: shipment.phone },
        { label: 'Receiver Phone', value: shipment.receiverPhone || '-' },
      ];

      doc.font('Helvetica').fontSize(9.5);
      const detailsInnerW = contentWidth - pad * 2;
      let detailsH = 18 + 14;
      for (const e of shipmentEntries) {
        const value = ensureText(e.value);
        const labelW = Math.min(
          160,
          Math.max(120, Math.floor(detailsInnerW * 0.28)),
        );
        const valueW = detailsInnerW - labelW - 10;
        const valueHeight = doc.heightOfString(value, {
          width: valueW,
          lineGap: 2,
        });
        detailsH += Math.max(14, valueHeight) + 6;
      }
      detailsH += 18;

      y = addPageIfNeeded(detailsH, y);
      drawCard(left, y, contentWidth, detailsH);
      drawSectionTitle('Shipment Details', left + pad, y + 14, detailsInnerW);
      y =
        drawKeyValueList(shipmentEntries, left + pad, y + 34, detailsInnerW) +
        6;

      y += 10;

      // Timeline card
      const statusHistory = shipment.statusHistory || [];
      const checkpoints = shipment.checkpoints || [];
      const rows: Array<{ label: string; date: string; note?: string }> = [];
      const maxRows = 6;
      for (const h of statusHistory.slice(0, maxRows)) {
        rows.push({
          label: `Status: ${h.status}`,
          date: new Date(h.timestamp).toLocaleString('en-NG'),
          note: h.note || '',
        });
      }
      for (const c of checkpoints.slice(
        0,
        Math.max(0, maxRows - rows.length),
      )) {
        rows.push({
          label: `Checkpoint: ${c.location}`,
          date: new Date(c.timestamp).toLocaleString('en-NG'),
          note: c.description || '',
        });
      }

      if (rows.length) {
        doc.font('Helvetica').fontSize(9.5);
        let timelineH = 18 + 16;
        for (const r of rows) {
          const note = r.note ? `• ${r.note}` : '';
          const noteH = note
            ? doc.heightOfString(note, {
                width: contentWidth - pad * 2 - 24,
                lineGap: 2,
              }) + 4
            : 0;
          timelineH += 20 + noteH;
        }
        timelineH += 10;

        y = addPageIfNeeded(timelineH, y);
        drawCard(left, y, contentWidth, timelineH);
        drawSectionTitle(
          'Timeline',
          left + pad,
          y + 14,
          contentWidth - pad * 2,
        );

        let ty = y + 34;
        for (const r of rows) {
          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor(colors.text)
            .text(r.label, left + pad, ty, { width: contentWidth - pad * 2 });
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(r.date, left + pad, ty + 12, {
              width: contentWidth - pad * 2,
            });
          ty += 26;
          if (r.note) {
            const note = `• ${r.note}`;
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor(colors.text)
              .text(note, left + pad + 12, ty - 6, {
                width: contentWidth - pad * 2 - 12,
                lineGap: 2,
              });
            ty += doc.heightOfString(note, {
              width: contentWidth - pad * 2 - 12,
              lineGap: 2,
            });
            ty += 6;
          }
        }

        y = y + timelineH + 14;
      }

      // Authorization + signature
      const sigBlockH = 120;
      y = addPageIfNeeded(sigBlockH, y);
      drawCard(left, y, contentWidth, sigBlockH);
      drawSectionTitle(
        'Authorization',
        left + pad,
        y + 14,
        contentWidth - pad * 2,
      );

      const sigX = right - pad - 180;
      const sigY = y + 40;
      const sigW = 180;
      if (signatureImage) {
        try {
          doc.image(signatureImage, sigX, sigY, { width: sigW });
        } catch {
          // ignore
        }
      }
      doc
        .strokeColor(colors.border)
        .moveTo(sigX, sigY + 58)
        .lineTo(sigX + sigW, sigY + 58)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('Authorized Signature', sigX, sigY + 64, {
          width: sigW,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('Thank you for choosing Digital Delivery.', left + pad, y + 70, {
          width: contentWidth - pad * 2 - 200,
        });

      doc.end();
    });
  }

  private buildInvoiceNumber(trackingId: string): string {
    const clean = String(trackingId || '')
      .trim()
      .toUpperCase();
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
      } catch {
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
      } catch {
        // ignore
      }
    }

    return null;
  }
}
