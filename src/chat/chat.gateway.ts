import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/message.dto';

// Build allowed origins from env + sensible defaults so deployed frontends (Netlify, Render, etc.) work.
const gatewayDefaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://digital-delivery.netlify.app',
  'https://digital-logistics-admin.netlify.app',
];

const gatewayEnvOriginsRaw = [
  process.env.CORS_ORIGINS,
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .join(',');

const gatewayEnvOrigins = gatewayEnvOriginsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const gatewayAllowedOrigins = Array.from(
  new Set([...gatewayDefaultOrigins, ...gatewayEnvOrigins]),
);

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: gatewayAllowedOrigins,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Track recent identical messages per client to help detect duplicates
  private recentMessageCounts = new Map<string, number>();

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`✅ Client connected: ${client.id}`);
    client.emit('connection:success', {
      clientId: client.id,
      message: 'Connected to chatbot',
      timestamp: new Date(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('chat:message')
  async handleChatMessage(
    @MessageBody() dto: ChatMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const now = new Date().toISOString();

      // Count near-duplicate arrivals for the same client+message
      const key = `${client.id}:${dto.message}`;
      const cur = (this.recentMessageCounts.get(key) || 0) + 1;
      this.recentMessageCounts.set(key, cur);
      // decrement after 2s to keep map compact
      setTimeout(() => {
        const v = (this.recentMessageCounts.get(key) || 0) - 1;
        if (v <= 0) this.recentMessageCounts.delete(key);
        else this.recentMessageCounts.set(key, v);
      }, 2000);

      this.logger.debug(
        `[${now}] Message from ${client.id} (count=${cur}): ${dto.message}`,
      );

      // Show typing indicator
      client.emit('chat:typing', { isTyping: true });

      // Process message through service
      const response = await this.chatService.processMessage(dto);

      // Hide typing indicator
      client.emit('chat:typing', { isTyping: false });

      // Send response to client
      client.emit('chat:response', response);
      this.logger.debug(
        `Emitted chat:response to ${client.id} (recentCount=${this.recentMessageCounts.get(key) || 0})`,
      );
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`);

      // Hide typing indicator
      client.emit('chat:typing', { isTyping: false });

      // Send error to client
      client.emit('chat:error', {
        message: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle user typing indicator (optional feature)
   * Event name: 'chat:user-typing'
   */
  @SubscribeMessage('chat:user-typing')
  handleUserTyping(
    @MessageBody() data: { isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    // For multi-user chat, broadcast to other users
    // For single-user, just log
    this.logger.debug(`User ${client.id} typing: ${data.isTyping}`);
  }
}
