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
import { DeliveryService } from './delivery.service';
import { MessagingService } from '../messaging/messaging.service';

// ── CORS origins (mirrors chat gateway) ──────────────────────────────────────
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'https://digitaldelivery.org',
  'https://www.digitaldelivery.org',
  'https://digital-delivery.netlify.app',
  'https://digital-logistics-admin.netlify.app',
  'https://digitaldelivery-drivers.netlify.app',
  'https://admin.digitaldelivery.org',
  'https://drivers.digitaldelivery.org',
  'http://localhost:5175',
];

const envOriginsRaw = [process.env.CORS_ORIGINS, process.env.FRONTEND_URL]
  .filter(Boolean)
  .join(',');

const envOrigins = envOriginsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

// ── Types ────────────────────────────────────────────────────────────────────
interface DriverPosition {
  driverId: string;
  deliveryId: string;
  position: {
    lat: number;
    lng: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    timestamp: number;
  };
  updatedAt: number;
}

@WebSocketGateway({
  namespace: '/delivery',
  cors: {
    origin: function (origin: string | undefined, callback: Function) {
      // allow requests with no origin (mobile, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  },
})
export class DeliveryGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DeliveryGateway.name);

  /** socket.id -> driverId */
  private socketDriverMap = new Map<string, string>();

  /** driverId -> latest GPS position */
  private driverPositions = new Map<string, DriverPosition>();

  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly messagingService: MessagingService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const driverId = this.socketDriverMap.get(client.id);
    this.socketDriverMap.delete(client.id);

    if (driverId) {
      this.driverPositions.delete(driverId);
      this.logger.log(`Driver ${driverId} disconnected (socket ${client.id})`);

      this.server.to('admin:tracking').emit('driver:disconnected', {
        driverId,
        timestamp: Date.now(),
      });
    } else {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  // ── Driver events ─────────────────────────────────────────────────────────

  @SubscribeMessage('driver:connect')
  handleDriverConnect(
    @MessageBody() payload: { driverId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { driverId } = payload;
    this.socketDriverMap.set(client.id, driverId);
    client.join(`driver:${driverId}`);

    this.logger.log(`Driver ${driverId} authenticated (socket ${client.id})`);

    client.emit('driver:connected', {
      driverId,
      socketId: client.id,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('driver:location')
  handleDriverLocation(
    @MessageBody()
    payload: {
      driverId: string;
      deliveryId: string;
      position: {
        lat: number;
        lng: number;
        accuracy?: number;
        speed?: number;
        heading?: number;
        timestamp: number;
      };
    },
    @ConnectedSocket() client: Socket,
  ) {
    const entry: DriverPosition = {
      driverId: payload.driverId,
      deliveryId: payload.deliveryId,
      position: payload.position,
      updatedAt: Date.now(),
    };

    this.driverPositions.set(payload.driverId, entry);

    // Broadcast to admin tracking room
    this.server.to('admin:tracking').emit('location:update', entry);

    // Acknowledge to the driver
    client.emit('location:ack', { status: 'ok', timestamp: Date.now() });
  }

  @SubscribeMessage('delivery:status-change')
  async handleDeliveryStatusChange(
    @MessageBody()
    payload: {
      driverId: string;
      shipmentId: string;
      action:
        | 'accept'
        | 'reject'
        | 'pickup'
        | 'start'
        | 'handoff'
        | 'complete'
        | 'fail';
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { driverId, shipmentId, action } = payload;
    this.logger.log(
      `Status change: driver=${driverId} shipment=${shipmentId} action=${action}`,
    );

    try {
      const updatedShipment = await this.deliveryService.updateDeliveryStatus(
        shipmentId,
        driverId,
        action,
      );

      // Notify admin room
      this.server.to('admin:tracking').emit('delivery:status-updated', {
        shipmentId,
        driverId,
        action,
        newStatus: updatedShipment.status,
        timestamp: Date.now(),
      });

      // Notify admin when driver hands off to carrier
      if (action === 'handoff') {
        this.server.to('admin:tracking').emit('delivery:handed-off', {
          shipmentId,
          driverId,
          timestamp: new Date().toISOString(),
        });
        // Remove driver position since they're no longer tracking
        this.driverPositions.delete(driverId);
      }

      // Confirm back to driver
      client.emit('delivery:status-confirmed', {
        shipmentId,
        action,
        newStatus: updatedShipment.status,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(`Status change failed: ${error.message}`, error.stack);
      client.emit('delivery:status-error', {
        shipmentId,
        action,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('driver:tracking-stopped')
  handleTrackingStopped(
    @MessageBody() payload: { driverId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { driverId } = payload;
    this.driverPositions.delete(driverId);
    this.logger.log(`Driver ${driverId} stopped tracking`);

    this.server.to('admin:tracking').emit('driver:tracking-stopped', {
      driverId,
      timestamp: Date.now(),
    });

    client.emit('tracking:stopped-ack', {
      status: 'ok',
      timestamp: Date.now(),
    });
  }

  // ── Admin events ──────────────────────────────────────────────────────────

  @SubscribeMessage('admin:connect')
  handleAdminConnect(
    @MessageBody() _payload: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    client.join('admin:tracking');
    this.logger.log(`Admin joined tracking room (socket ${client.id})`);

    // Send all current driver positions
    const positions = Array.from(this.driverPositions.values());
    client.emit('admin:connected', {
      positions,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('admin:get-positions')
  handleGetPositions(@ConnectedSocket() client: Socket) {
    const positions = Array.from(this.driverPositions.values());
    client.emit('admin:positions', {
      positions,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('delivery:assign-lastmile')
  async handleAssignLastMile(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { shipmentId: string; driverId: string },
  ) {
    this.logger.log(
      `Admin assigning last-mile driver ${data.driverId} to shipment ${data.shipmentId}`,
    );

    // Notify the last-mile driver
    this.server.to(`driver:${data.driverId}`).emit('delivery:assigned', {
      shipmentId: data.shipmentId,
      type: 'last-mile',
      timestamp: new Date().toISOString(),
    });

    client.emit('delivery:lastmile-assigned', {
      success: true,
      shipmentId: data.shipmentId,
    });
  }

  // ── Messaging events ─────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async handleMessageSend(
    @MessageBody()
    payload: { driverId: string; sender: 'admin' | 'driver'; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { driverId, sender, text } = payload;

    try {
      const message = await this.messagingService.sendMessage(
        driverId,
        sender,
        text,
      );

      // Emit to the driver's room so the driver gets it
      this.server.to(`driver:${driverId}`).emit('message:new', message);

      // Emit to admin tracking room so admin gets it
      this.server.to('admin:tracking').emit('message:new', message);

      this.logger.log(`Message sent: ${sender} -> driver ${driverId}`);
    } catch (error) {
      this.logger.error(`Message send failed: ${error.message}`, error.stack);
      client.emit('message:error', {
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @MessageBody()
    payload: { driverId: string; readBy: 'admin' | 'driver' },
    @ConnectedSocket() client: Socket,
  ) {
    const { driverId, readBy } = payload;

    try {
      await this.messagingService.markAsRead(driverId, readBy);

      // Notify the other party
      const target =
        readBy === 'admin' ? `driver:${driverId}` : 'admin:tracking';
      this.server.to(target).emit('message:read', {
        driverId,
        readBy,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Messages marked as read by ${readBy} for driver ${driverId}`,
      );
    } catch (error) {
      this.logger.error(`Message read failed: ${error.message}`, error.stack);
      client.emit('message:error', {
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }
}
