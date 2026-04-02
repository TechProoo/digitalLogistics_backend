import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Driver } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DriverAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Driver login with email + password.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ access_token: string; driver: Driver }> {
    const driver = await this.prisma.driver.findFirst({
      where: { driverEmail: email },
    });

    if (!driver || !driver.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, driver.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: driver.id, email: driver.driverEmail };
    const secret =
      process.env.DRIVER_JWT_SECRET || process.env.JWT_SECRET || 'driver-secret';

    const access_token = this.jwtService.sign(payload, {
      secret,
      expiresIn: '7d',
    });

    return { access_token, driver };
  }

  /**
   * Set password for a driver (called after approval, or first time).
   */
  async setPassword(driverId: string, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10);

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { passwordHash: hash },
    });
  }

  /**
   * Change password (driver must know current password).
   */
  async changePassword(
    driverId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver || !driver.passwordHash) {
      throw new UnauthorizedException('Driver not found');
    }

    const isValid = await bcrypt.compare(currentPassword, driver.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { passwordHash: hash },
    });

    return { message: 'Password changed successfully' };
  }

  /**
   * Validate driver JWT payload.
   */
  async validateDriver(payload: { sub: string }): Promise<Driver> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: payload.sub },
    });

    if (!driver) {
      throw new UnauthorizedException('Driver not found');
    }

    return driver;
  }
}
