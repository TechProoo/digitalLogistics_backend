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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';

type AuthedRequest = Request & { user?: { customerId: string; email: string } };
type GoogleRequest = Request & { user?: { email: string; name?: string } };

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

function getCookieOptions(req?: Request) {
  const isProd = process.env.NODE_ENV === 'production';

  const originRaw = (req?.headers?.origin as string | undefined) ?? '';
  const origin = originRaw.trim().toLowerCase();
  const isLocalOrigin =
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');

  const sameSiteEnv = process.env.COOKIE_SAMESITE?.toLowerCase();
  const hasExplicitSameSite =
    sameSiteEnv === 'none' || sameSiteEnv === 'strict' || sameSiteEnv === 'lax';

  // For cross-site frontends, browsers require SameSite=None + Secure=true for cookies
  // to be included on XHR/fetch requests.
  const originsHint = String(
    (process.env.FRONTEND_URL ?? process.env.CORS_ORIGINS ?? '').trim(),
  );

  const inferredCrossSite =
    Boolean(originsHint) &&
    // If the only origin is the backend itself, it's not cross-site.
    !originsHint.includes('http://localhost:3000') &&
    !originsHint.includes('https://localhost:3000');

  const sameSite: 'lax' | 'strict' | 'none' = hasExplicitSameSite
    ? (sameSiteEnv as 'lax' | 'strict' | 'none')
    : isLocalOrigin
      ? 'lax'
      : inferredCrossSite
        ? 'none'
        : 'lax';

  const secureEnv = process.env.COOKIE_SECURE?.toLowerCase();
  const secure =
    secureEnv === 'true'
      ? true
      : secureEnv === 'false'
        ? false
        : sameSite === 'none'
          ? true
          : isProd;

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie('dd_access_token', result.accessToken, getCookieOptions(req));
    return { customer: result.customer, accessToken: result.accessToken };
  }

  @SetMetadata('response_message', 'Login successful.')
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('dd_access_token', result.accessToken, getCookieOptions(req));
    return { customer: result.customer, accessToken: result.accessToken };
  }

  @SetMetadata('response_message', 'Logged out successfully.')
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const opts = getCookieOptions(req);
    res.clearCookie('dd_access_token', {
      path: opts.path,
      sameSite: opts.sameSite,
      secure: opts.secure,
    });
    return { ok: true };
  }

  @SetMetadata(
    'response_message',
    'If the email exists, a reset link was sent.',
  )
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @SetMetadata('response_message', 'Password reset successful.')
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @SetMetadata('response_message', 'Profile fetched successfully.')
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.authService.me(req.user!.customerId);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  google() {
    // Passport will redirect to Google.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: GoogleRequest, @Res() res: Response) {
    const user = req.user;
    if (!user?.email) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await this.authService.googleLogin({
      email: user.email,
      name: user.name,
    });

    res.cookie('dd_access_token', result.accessToken, getCookieOptions(req));

    const host = String(req.headers.host ?? '').toLowerCase();
    const isLocalBackend =
      host.startsWith('localhost') || host.startsWith('127.0.0.1');

    const frontendUrl = (process.env.FRONTEND_URL ?? '').trim();
    const redirectBase = isLocalBackend ? 'http://localhost:5173' : frontendUrl;

    return res.redirect(`${redirectBase.replace(/\/$/, '')}/dashboard`);
  }
}
