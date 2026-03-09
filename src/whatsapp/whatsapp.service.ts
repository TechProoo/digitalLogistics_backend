import { Injectable, Logger } from '@nestjs/common';

/**
 * WhatsApp Business Cloud API service.
 *
 * Required env vars:
 *   WHATSAPP_API_TOKEN        – Permanent or temporary access token from Meta
 *   WHATSAPP_PHONE_NUMBER_ID  – The Phone-Number-ID linked to 0813 569 9955
 *
 * The service sends free-form text messages via the WhatsApp Business Cloud API.
 * If the env vars are missing it gracefully logs a warning and skips.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiToken: string;
  private readonly phoneNumberId: string;
  private readonly fromDisplay: string;
  private readonly apiVersion = 'v21.0';

  constructor() {
    this.apiToken = (process.env.WHATSAPP_API_TOKEN ?? '').trim();
    this.phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
    this.fromDisplay = (
      process.env.WHATSAPP_FROM_DISPLAY ?? '0813 569 9955'
    ).trim();
  }

  /**
   * Normalise a Nigerian phone number to international E.164 format.
   * Accepts: 08135699955, +2348135699955, 2348135699955, 0813 569 9955
   */
  private normalisePhone(phone: string): string {
    // Strip everything except digits and leading +
    let cleaned = phone.replace(/[^+\d]/g, '');

    // Nigerian local format: starts with 0
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = '234' + cleaned.slice(1);
    }

    // Ensure leading +
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Send a plain-text WhatsApp message.
   * Returns true if sent successfully, false otherwise.
   */
  async sendMessage(to: string, body: string): Promise<boolean> {
    if (!this.apiToken || !this.phoneNumberId) {
      this.logger.warn(
        'WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set; skipping WhatsApp message.',
      );
      return false;
    }

    const recipient = this.normalisePhone(to);
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `WhatsApp API error (${response.status}): ${errorBody}`,
        );
        return false;
      }

      this.logger.log(
        `WhatsApp message sent from ${this.fromDisplay} to ${recipient}`,
      );
      return true;
    } catch (err) {
      this.logger.error('Failed to send WhatsApp message', err);
      return false;
    }
  }
}
