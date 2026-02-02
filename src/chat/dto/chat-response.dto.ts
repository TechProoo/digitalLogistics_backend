export class ChatResponseDto {
  message: string;
  // Expanded to include all possible intents
  intent:
    | 'company_info'
    | 'pricing'
    | 'quote'
    | 'general'
    | 'greeting'
    | 'help'
    | 'farewell';
  timestamp: Date;
  data?: any; // Optional extra data (pricing info, etc.)
}
