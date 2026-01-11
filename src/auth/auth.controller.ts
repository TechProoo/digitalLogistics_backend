import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';

type AuthedRequest = Request & { user?: { customerId: string; email: string } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @SetMetadata('response_message', 'Registration successful.')
  @Post('register')
  register(@Body() dto: CreateAuthDto) {
    return this.authService.register(dto);
  }

  @SetMetadata('response_message', 'Login successful.')
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @SetMetadata('response_message', 'Profile fetched successfully.')
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.authService.me(req.user!.customerId);
  }
}
