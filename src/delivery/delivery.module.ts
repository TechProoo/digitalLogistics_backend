import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryService } from './delivery.service';
import { DeliveryGateway } from './delivery.gateway';
import { DeliveryController } from './delivery.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [DeliveryController],
  providers: [DeliveryGateway, DeliveryService],
  exports: [DeliveryGateway],
})
export class DeliveryModule {}
