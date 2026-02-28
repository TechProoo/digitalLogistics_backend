import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

function resolveIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim();
  return (
    forwarded ||
    String(req.ip ?? '').trim() ||
    String((req as any).socket?.remoteAddress ?? '').trim() ||
    'unknown'
  );
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  /**
   * POST /admin/auth/login
   * Strict throttle: max 10 req per 15 min per IP (on top of in-memory lockout).
   */
  @Throttle({ adminLogin: { ttl: 900_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.adminAuthService.login(dto.email, dto.password, resolveIp(req));
  }

  /** POST /admin/auth/logout — client just discards the token; acknowledged here. */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout() {
    return { ok: true };
  }

  /** GET /admin/auth/me — verify token and return identity. */
  @UseGuards(AdminJwtGuard)
  @Get('me')
  me(@Req() req: Request & { user?: any }) {
    return { admin: req.user };
  }
}
