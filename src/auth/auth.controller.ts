import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';

type AuthedRequest = Request & { user?: { customerId: string; email: string } };

function parseExpiresInToMs(input: string | undefined): number {
  const fallback = 7 * 24 * 60 * 60 * 1000;
  if (!input) return fallback;

  const raw = input.trim().toLowerCase();
  const match = raw.match(/^([0-9]+)\s*([smhd])$/);
  if (!match) return fallback;

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] ?? 0) || fallback;
}

function getCookieOptions() {
  const sameSiteEnv = process.env.COOKIE_SAMESITE?.toLowerCase();
  const sameSite: 'lax' | 'strict' | 'none' =
    sameSiteEnv === 'none'
      ? 'none'
      : sameSiteEnv === 'strict'
        ? 'strict'
        : 'lax';

  const secureEnv = process.env.COOKIE_SECURE?.toLowerCase();
  const secure =
    sameSite === 'none'
      ? true
      : secureEnv === 'true'
        ? true
        : process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: parseExpiresInToMs(process.env.JWT_EXPIRES_IN),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @SetMetadata('response_message', 'Registration successful.')
  @Post('register')
  async register(
    @Body() dto: CreateAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie('dd_access_token', result.accessToken, getCookieOptions());
    return { customer: result.customer };
  }

  @SetMetadata('response_message', 'Login successful.')
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('dd_access_token', result.accessToken, getCookieOptions());
    return { customer: result.customer };
  }

  @SetMetadata('response_message', 'Logged out successfully.')
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('dd_access_token', {
      path: '/',
    });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @SetMetadata('response_message', 'Profile fetched successfully.')
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.authService.me(req.user!.customerId);
  }
}
