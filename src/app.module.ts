import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ChatModule } from './chat/chat.module';
@Module({
  imports: [PrismaModule, AuthModule, ShipmentsModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
