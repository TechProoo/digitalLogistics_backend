import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private static readonly SALT_ROUNDS = 10;
  private static readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: CreateAuthDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.customer.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already registered.');

    const passwordHash = await bcrypt.hash(
      dto.password,
      AuthService.SALT_ROUNDS,
    );

    const customer = await this.prisma.customer.create({
      data: {
        name: (dto.name ?? '').trim() || 'Customer',
        email,
        phone: dto.phone ?? null,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: customer.id,
      email: customer.email,
    });

    return { accessToken, customer };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const customer = await this.prisma.customer.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
      },
    });

    if (!customer) throw new UnauthorizedException("User doesn't exist");

    if (!customer.passwordHash) {
      throw new UnauthorizedException(
        'This account does not have a password. Please sign in with Google.',
      );
    }

    const ok = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid password.');

    const { passwordHash, ...safeCustomer } = customer;

    const accessToken = await this.jwtService.signAsync({
      sub: safeCustomer.id,
      email: safeCustomer.email,
    });

    return { accessToken, customer: safeCustomer };
  }

  async me(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { customer };
  }

  async googleLogin(args: { email: string; name?: string | null }) {
    const email = args.email.trim().toLowerCase();
    const name = (args.name ?? '').trim() || 'Customer';

    const existing = await this.prisma.customer.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const customer =
      existing ??
      (await this.prisma.customer.create({
        data: {
          name,
          email,
          phone: null,
          passwordHash: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
        },
      }));

    const accessToken = await this.jwtService.signAsync({
      sub: customer.id,
      email: customer.email,
    });

    return { accessToken, customer };
  }

  private hashResetToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async forgotPassword(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();

    const customer = await this.prisma.customer.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    // Always return ok (avoid user enumeration)
    if (!customer) {
      return { ok: true };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + AuthService.RESET_TOKEN_TTL_MS);

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordTokenExpires: expiresAt,
      },
    });

    const frontendUrl = (process.env.FRONTEND_URL ?? '').trim();
    const resetLink = frontendUrl
      ? `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`
      : undefined;

    const isProd = process.env.NODE_ENV === 'production';

    if (resetLink) {
      const sent = await this.emailService.sendPasswordResetEmail(
        customer.email,
        resetLink,
      );

      if (!sent && !isProd) {
        // eslint-disable-next-line no-console
      }
    } else if (!isProd) {
      // eslint-disable-next-line no-console
    }

    return isProd ? { ok: true } : { ok: true, resetLink };
  }

  async resetPassword(tokenRaw: string, newPassword: string) {
    const token = tokenRaw.trim();
    if (!token) throw new BadRequestException('Token is required.');

    const tokenHash = this.hashResetToken(token);

    const customer = await this.prisma.customer.findFirst({
      where: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordTokenExpires: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!customer) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    const passwordHash = await bcrypt.hash(
      newPassword,
      AuthService.SALT_ROUNDS,
    );

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordHash,
        resetPasswordTokenHash: null,
        resetPasswordTokenExpires: null,
      },
    });

    return { ok: true };
  }
}
