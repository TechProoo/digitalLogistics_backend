import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private static readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

    if (!customer)
      throw new UnauthorizedException('Invalid email or password.');

    const ok = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password.');

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
}
