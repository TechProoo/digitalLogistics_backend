import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ChatModule } from './chat/chat.module';
import { FreightosModule } from './freightos/freightos.module';
import { RatesModule } from './rates/rates.module';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ShipmentsModule,
    ChatModule,
    FreightosModule,
    RatesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
