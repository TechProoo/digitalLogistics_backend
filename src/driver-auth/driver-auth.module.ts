import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverAuthService } from './driver-auth.service';
import { DriverAuthController } from './driver-auth.controller';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({}), // secrets are passed per-sign call in the service
  ],
  controllers: [DriverAuthController],
  providers: [DriverAuthService],
  exports: [DriverAuthService],
})
export class DriverAuthModule {}
