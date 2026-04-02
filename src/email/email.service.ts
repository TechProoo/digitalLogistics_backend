import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import * as React from 'react';
import { WelcomeEmail, welcomeEmailText } from './templates/welcome-email';
import {
  ApplicationUnderReviewEmail,
  applicationUnderReviewEmailText,
} from './templates/application-under-review-email';

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

  async sendDriverApprovalEmail(
    to: string,
    args: {
      name: string;
      email: string;
      tempPassword: string;
      loginUrl: string;
    },
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set; skipping email send.');
      this.logger.log(
        `[DEV] Driver approval email for ${args.email}: password=${args.tempPassword}, login=${args.loginUrl}`,
      );
      return false;
    }

    const logoUrl = this.getLogoUrl();
    const subject =
      'Your driver application has been approved — Digital Delivery';

    const text = [
      `Hi ${args.name},`,
      '',
      'Great news! Your driver application with Digital Delivery has been approved.',
      '',
      'You can now log in to the Driver Platform using the credentials below:',
      '',
      `Email: ${args.email}`,
      `Temporary Password: ${args.tempPassword}`,
      `Login URL: ${args.loginUrl}`,
      '',
      'Please change your password after your first login.',
      '',
      'If you have any questions, contact support@digitaldelivery.org.',
      '',
      '— The Digital Delivery Team',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 520px; margin: 0 auto;">
        <div style="text-align:center;margin-bottom:20px;">
          <img src="${logoUrl}" alt="Digital Delivery" style="height:34px;width:auto;" />
        </div>
        <h2 style="color:#1E40AF;">Application Approved!</h2>
        <p>Hi <strong>${args.name}</strong>,</p>
        <p>Great news! Your driver application with Digital Delivery has been <span style="color:#22c55e;font-weight:700;">approved</span>.</p>
        <p>You can now log in to the <strong>Driver Platform</strong> using the credentials below:</p>
        <div style="background:#f0f4ff;border:1px solid #dbeafe;border-radius:12px;padding:18px 20px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0;color:#64748b;font-size:13px;">Email</td>
              <td style="padding:6px 0;font-weight:600;font-size:14px;text-align:right;">${args.email}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;font-size:13px;">Temporary Password</td>
              <td style="padding:6px 0;font-weight:700;font-size:16px;font-family:monospace;letter-spacing:2px;text-align:right;color:#1E40AF;">${args.tempPassword}</td>
            </tr>
          </table>
        </div>
        <p style="text-align:center;margin:20px 0;">
          <a href="${args.loginUrl}"
             style="display:inline-block;background:#1E40AF;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
            Log in to Driver Platform
          </a>
        </p>
        <p style="color:#ef4444;font-size:13px;font-weight:500;">Please change your password after your first login.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">If you have any questions, contact <a href="mailto:support@digitaldelivery.org" style="color:#3b82f6;">support@digitaldelivery.org</a>.</p>
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
        'Failed to send driver approval email via Resend.',
        err as any,
      );
      return false;
    }
  }

  async sendApplicationUnderReviewEmail(
    to: string,
    args: { name?: string | null; vehicleType: string; plateNumber: string },
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY not set; skipping email send.');
      return false;
    }

    const supportEmail = 'support@digitaldelivery.org';
    const logoUrl = this.getLogoUrl();

    const subject = 'We received your driver application — Digital Delivery';
    const text = applicationUnderReviewEmailText({
      name: args.name,
      vehicleType: args.vehicleType,
      plateNumber: args.plateNumber,
      supportEmail,
      logoUrl,
    });

    const react = React.createElement(ApplicationUnderReviewEmail, {
      name: args.name,
      vehicleType: args.vehicleType,
      plateNumber: args.plateNumber,
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
      this.logger.error(
        'Failed to send application-under-review email via Resend.',
        err as any,
      );
      return false;
    }
  }
}
