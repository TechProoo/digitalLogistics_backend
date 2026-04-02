import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Driver, DriverMessage } from '@prisma/client';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all messages between admin and a specific driver.
   * Supports cursor-based pagination (pass the last message id as cursor).
   */
  async getMessages(
    driverId: string,
    cursor?: string,
    limit = 50,
  ): Promise<DriverMessage[]> {
    return this.prisma.driverMessage.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });
  }

  /**
   * Send a message (from admin or driver).
   */
  async sendMessage(
    driverId: string,
    sender: 'admin' | 'driver',
    text: string,
  ): Promise<DriverMessage> {
    return this.prisma.driverMessage.create({
      data: {
        driverId,
        sender,
        text,
      },
    });
  }

  /**
   * Mark messages as read (when driver reads admin messages or vice versa).
   */
  async markAsRead(
    driverId: string,
    readBy: 'admin' | 'driver',
  ): Promise<void> {
    // If the admin is reading, mark all driver-sent messages as read.
    // If the driver is reading, mark all admin-sent messages as read.
    const senderToMark = readBy === 'admin' ? 'driver' : 'admin';

    await this.prisma.driverMessage.updateMany({
      where: {
        driverId,
        sender: senderToMark,
        read: false,
      },
      data: { read: true },
    });
  }

  /**
   * Get unread count for a driver conversation.
   */
  async getUnreadCount(
    driverId: string,
    for_: 'admin' | 'driver',
  ): Promise<number> {
    // Unread messages FOR the admin = messages sent by the driver that are unread.
    // Unread messages FOR the driver = messages sent by the admin that are unread.
    const senderToCount = for_ === 'admin' ? 'driver' : 'admin';

    return this.prisma.driverMessage.count({
      where: {
        driverId,
        sender: senderToCount,
        read: false,
      },
    });
  }

  /**
   * Get all conversations (for admin view) - returns drivers with their latest message.
   */
  async getConversations(): Promise<
    Array<{
      driver: Driver;
      lastMessage: DriverMessage | null;
      unreadCount: number;
    }>
  > {
    // Get all drivers that have at least one message
    const drivers = await this.prisma.driver.findMany({
      where: {
        messages: { some: {} },
      },
    });

    const conversations = await Promise.all(
      drivers.map(async (driver) => {
        const lastMessage = await this.prisma.driverMessage.findFirst({
          where: { driverId: driver.id },
          orderBy: { createdAt: 'desc' },
        });

        const unreadCount = await this.prisma.driverMessage.count({
          where: {
            driverId: driver.id,
            sender: 'driver',
            read: false,
          },
        });

        return { driver, lastMessage, unreadCount };
      }),
    );

    // Sort by latest message timestamp (most recent first)
    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() ?? 0;
      const bTime = b.lastMessage?.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    return conversations;
  }
}
