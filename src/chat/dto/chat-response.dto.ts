export class ChatResponseDto {
  message: string;
  intent: 'company_info' | 'pricing' | 'general';
  timestamp: Date;
  data?: any; // Optional extra data (pricing info, etc.)
}
