import { Injectable, Logger } from '@nestjs/common';
import { ChatMessageDto } from './dto/message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { GeminiAiService } from '../gemini/gemini-ai.service';

type ChatIntent =
  | 'company_info'
  | 'pricing'
  | 'general'
  | 'greeting'
  | 'help'
  | 'farewell';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly geminiAiService: GeminiAiService) {}

  async processMessage(dto: ChatMessageDto): Promise<ChatResponseDto> {
    const message = dto.message.toLowerCase();
    const intent = this.detectIntent(message);

    this.logger.debug(`Intent: ${intent} | Message: "${dto.message}"`);

    let responseMessage: string;

    try {
      // Quick responses (no AI needed)
      if (intent === 'greeting') {
        responseMessage = this.handleGreeting();
      } else if (intent === 'help') {
        responseMessage = this.handleHelp();
      } else if (intent === 'farewell') {
        responseMessage = this.handleFarewell();
      } else {
        // Use Gemini AI for complex questions
        this.logger.debug('🤖 Using Gemini AI...');
        responseMessage = await this.geminiAiService.generateResponse(
          dto.message,
        );
      }

      return {
        message: responseMessage,
        intent,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error: ${error.message}`);

      // User-friendly error messages
      let errorMessage =
        "Sorry, I'm having trouble right now. Please try again.";

      if (error.message.includes('quota')) {
        errorMessage =
          "I've reached my daily limit. Please try again tomorrow! 🙏";
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Please wait a moment and try again! ⏳';
      }

      return {
        message: errorMessage,
        intent: 'general',
        timestamp: new Date(),
      };
    }
  }

  private detectIntent(message: string): ChatIntent {
    // Simple greeting
    if (
      /^\s*(hi|hello|hey|good morning|good afternoon)\s*[!.?]*\s*$/i.test(
        message,
      )
    ) {
      return 'greeting';
    }

    // Help request
    if (/\b(help|what can you do)\b/i.test(message)) {
      return 'help';
    }

    // Goodbye
    if (
      /^\s*(bye|goodbye|see you|thanks|thank you)\s*[!.?]*\s*$/i.test(message)
    ) {
      return 'farewell';
    }

    // Company info
    if (/\b(company|about|services|what do you do)\b/i.test(message)) {
      return 'company_info';
    }

    // Pricing
    if (/\b(price|pricing|cost|how much|fee)\b/i.test(message)) {
      return 'pricing';
    }

    return 'general';
  }

  private handleGreeting(): string {
    const greetings = [
      'Hello! 👋 Welcome to Digital Delivery! How can I help you today?',
      'Hi there! 😊 What can I do for you?',
      'Hey! 🌟 How may I assist you?',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private handleHelp(): string {
    return `I'm your Digital Delivery AI assistant! 🤖

I can help with:
💬 General questions about our services
📦 Delivery information
💰 Pricing inquiries
🌍 Coverage areas
⏰ Operating hours

Just ask me any question!`;
  }

  private handleFarewell(): string {
    const farewells = [
      'Goodbye! 👋 Have a great day!',
      'See you later! 😊 Thanks for chatting!',
      'Bye! 🌟 Come back anytime!',
    ];
    return farewells[Math.floor(Math.random() * farewells.length)];
  }
}
