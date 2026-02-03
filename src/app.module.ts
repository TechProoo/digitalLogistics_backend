import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ChatModule } from './chat/chat.module';
import { RatesModule } from './rates/rates.module';
import { InvoiceModule } from './invoice/invoice.module';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ShipmentsModule,
    ChatModule,
    RatesModule,
    InvoiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
