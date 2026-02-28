import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import * as React from 'react';
import { WelcomeEmail, welcomeEmailText } from './templates/welcome-email';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly replyTo?: string;

  private getLogoUrl(): string {
    const explicit = (process.env.EMAIL_LOGO_URL ?? '').trim();
    if (explicit) return explicit;

    const base = (process.env.FRONTEND_URL ?? 'https://digitaldelivery.org')
      .trim()
      .replace(/\/+$/, '');

    return `${base}/logo.png`;
  }

  constructor() {
    const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
    this.resend = apiKey ? new Resend(apiKey) : null;

    const fromEmail = (process.env.RESEND_FROM_EMAIL ?? '').trim();
    const fromName = (process.env.RESEND_FROM_NAME ?? '').trim();
    this.from =
      fromName && fromEmail
        ? `${fromName} <${fromEmail}>`
        : fromEmail || 'Digital Delivery <noreply@digitaldelivery.org>';

    const replyTo = (process.env.RESEND_REPLY_TO ?? '').trim();
    this.replyTo = replyTo || undefined;
  }

  async sendPasswordResetEmail(
    to: string,
    resetLink: string,
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set; skipping email send.');
      return false;
    }

    const subject = 'Reset your Digital Delivery password';
    const text = `Reset your password using this link: ${resetLink}`;

    const logoUrl = this.getLogoUrl();

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <div style="text-align:center;margin-bottom:18px;">
          <img src="${logoUrl}" alt="Digital Delivery" style="height:34px;width:auto;" />
        </div>
        <h2>Password reset</h2>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <p>
          <a href="${resetLink}"
             style="display:inline-block;background:#111827;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">
            Reset password
          </a>
        </p>
        <p>If you did not request this, you can ignore this email.</p>
        <p style="color:#6b7280;font-size:12px;">Link: ${resetLink}</p>
      </div>
    `;

    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        text,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      });
      return true;
    } catch (err) {
      this.logger.error(
        'Failed to send password reset email via Resend.',
        err as any,
      );
      return false;
    }
  }

  async sendWelcomeEmail(
    to: string,
    args: { name?: string | null; appUrl?: string },
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set; skipping email send.');
      return false;
    }

    const supportEmail = 'support@digitaldelivery.org';
    const appUrl = (args.appUrl ?? process.env.FRONTEND_URL ?? '').trim();
    const logoUrl = this.getLogoUrl();

    const subject = 'Welcome to Digital Delivery';
    const text = welcomeEmailText({
      name: args.name,
      appUrl,
      supportEmail,
      logoUrl,
    });

    const react = React.createElement(WelcomeEmail, {
      name: args.name,
      appUrl,
      supportEmail,
      logoUrl,
    });

    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        react,
        text,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to send welcome email via Resend.', err as any);
      return false;
    }
  }
}
