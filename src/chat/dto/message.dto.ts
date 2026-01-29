import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

/**
 * DTO for incoming chat messages
 */

export class ChatMessageDto {
  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
