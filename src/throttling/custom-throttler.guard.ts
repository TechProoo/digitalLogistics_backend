import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = String(req?.headers?.['x-forwarded-for'] ?? '')
      .split(',')[0]
      ?.trim();

    const ip =
      String(req?.ip ?? '').trim() ||
      forwarded ||
      String(req?.socket?.remoteAddress ?? '').trim() ||
      'unknown-ip';

    // Our JWT strategy returns { customerId, email } as req.user
    // but we support a few fallbacks for other auth strategies.
    const userId =
      req?.user?.customerId ??
      req?.user?.adminId ??
      req?.user?.id ??
      req?.user?.sub;

    return userId ? `u:${userId}|ip:${ip}` : `ip:${ip}`;
  }
}
