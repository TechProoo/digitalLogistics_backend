import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ChatModule } from './chat/chat.module';
import { RatesModule } from './rates/rates.module';
import { InvoiceModule } from './invoice/invoice.module';
import { CustomThrottlerGuard } from './throttling/custom-throttler.guard';
import { DriversModule } from './drivers/drivers.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60_000,
        limit: 120,
      },
      {
        /** Tight limit for the admin login endpoint only. */
        name: 'adminLogin',
        ttl: 900_000, // 15 minutes
        limit: 10,
      },
    ]),
    PrismaModule,
    AuthModule,
    ShipmentsModule,
    ChatModule,
    RatesModule,
    InvoiceModule,
    DriversModule,
    AdminAuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
