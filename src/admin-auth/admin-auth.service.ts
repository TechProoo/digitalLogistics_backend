import {
  Injectable,
  Logger,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1_000; // 15 minutes

interface LockoutEntry {
  count: number;
  lockedUntil: number | null; // epoch ms
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  /** In-memory brute-force tracker keyed by normalised IP. */
  private readonly lockouts = new Map<string, LockoutEntry>();

  constructor(private readonly jwtService: JwtService) {}

  // ─── helpers ──────────────────────────────────────────────────────────────

  private getEntry(ip: string): LockoutEntry {
    if (!this.lockouts.has(ip)) {
      this.lockouts.set(ip, { count: 0, lockedUntil: null });
    }
    return this.lockouts.get(ip)!;
  }

  private failAttempt(ip: string): void {
    const entry = this.getEntry(ip);
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS;
      this.logger.warn(
        `[AdminAuth] IP ${ip} locked out after ${entry.count} failed attempts.`,
      );
    }
    this.lockouts.set(ip, entry);
  }

  private resetAttempts(ip: string): void {
    this.lockouts.delete(ip);
  }

  private assertNotLocked(ip: string): void {
    const entry = this.lockouts.get(ip);
    if (!entry) return;
    if (entry.lockedUntil !== null) {
      const remaining = entry.lockedUntil - Date.now();
      if (remaining > 0) {
        const mins = Math.ceil(remaining / 60_000);
        throw new HttpException(
          `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // Lockout expired – reset automatically.
      this.resetAttempts(ip);
    }
  }

  // ─── public API ───────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<{ accessToken: string }> {
    // 1. Lockout check.
    this.assertNotLocked(ip);

    // 2. Load credentials from env (never from code).
    const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
    const adminHash = (process.env.ADMIN_PASSWORD_HASH ?? '').trim();
    const adminRole = (process.env.ADMIN_ROLE ?? 'admin').trim();

    if (!adminEmail || !adminHash) {
      this.logger.error(
        '[AdminAuth] ADMIN_EMAIL or ADMIN_PASSWORD_HASH env vars are not set.',
      );
      throw new UnauthorizedException('Admin login is not configured.');
    }

    const inputEmail = email.trim().toLowerCase();
    const emailMatches = inputEmail === adminEmail;

    // 3. Always run bcrypt.compare to prevent timing-based email enumeration.
    const hashForCompare = emailMatches
      ? adminHash
      : '$2b$10$invalidhashusedfortimingconsistencyonly0000000000000000'; // dummy

    const passwordMatches = await bcrypt.compare(password, hashForCompare);

    if (!emailMatches || !passwordMatches) {
      this.failAttempt(ip);
      this.logger.warn(
        `[AdminAuth] Failed login attempt from ${ip} for email "${inputEmail}".`,
      );
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 4. Success.
    this.resetAttempts(ip);
    this.logger.log(
      `[AdminAuth] Successful admin login from ${ip} for "${inputEmail}".`,
    );

    const secret = process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET;
    const accessToken = await this.jwtService.signAsync(
      { sub: 'admin', email: adminEmail, role: adminRole },
      {
        secret,
        expiresIn: (process.env.ADMIN_JWT_EXPIRES_IN ?? '8h') as any,
      },
    );

    return { accessToken };
  }
}
