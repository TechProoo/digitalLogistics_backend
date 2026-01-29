import { Injectable, Logger } from '@nestjs/common';
import { ChatMessageDto } from './dto/message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

type ChatIntent = 'company_info' | 'pricing' | 'general';

/**
 * Chat service - handles message processing
 *
 * Current: Simple keyword-based responses
 * Future: Will integrate RAG and pricing logic
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  /**
   * Process incoming message and generate response
   */
  async processMessage(dto: ChatMessageDto): Promise<ChatResponseDto> {
    const message = dto.message.toLowerCase();

    // Detect user intent
    const intent = this.detectIntent(message);

    this.logger.debug(`Detected intent: ${intent}`);

    // Generate response based on intent
    let responseMessage: string;

    switch (intent) {
      case 'company_info':
        responseMessage = this.handleCompanyInfo();
        break;

      case 'pricing':
        responseMessage = this.handlePricing();
        break;

      default:
        responseMessage = this.handleDefault(message);
    }

    return {
      message: responseMessage,
      intent,
      timestamp: new Date(),
    };
  }

  /**
   * Simple intent detection using keywords
   */
  private detectIntent(message: string): ChatIntent {
    // Company info patterns
    if (
      /\b(company|about|who are you|your company|business)\b/i.test(message)
    ) {
      return 'company_info';
    }
    // Pricing patterns
    if (/\b(price|pricing|cost|how much|fee|charge)\b/i.test(message)) {
      return 'pricing';
    }
    return 'general';
  }

  /**
   * Handle company info intent
   */
  private handleCompanyInfo(): string {
    return `We are Digital Delivery, your trusted partner for seamless digital logistics and delivery solutions! 🚚✨`;
  }

  /**
   * Handle pricing intent
   */
  private handlePricing(): string {
    return `Our pricing is flexible and tailored to your needs. Please contact us for a detailed quote! 💸`;
  }

  /**
   * Handle greeting messages
   */
  private handleGreeting(): string {
    const greetings = [
      'Hello! 👋 Welcome! How can I help you today?',
      'Hi there! 😊 What can I do for you?',
      'Hey! Great to see you! How may I assist you?',
      'Good day! 🌟 What brings you here today?',
    ];

    // Return random greeting
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  /**
   * Handle help requests
   */
  private handleHelp(): string {
    return `I'm a friendly chatbot! Here's what I can do:

💬 **General Chat** - Have a conversation with me
❓ **Answer Questions** - Ask me anything
🎯 **Coming Soon** - Logistics and delivery features!

Try saying:
- "Hello" to start a conversation
- "Help" to see this message again
- "Thanks" when you're done

What would you like to talk about?`;
  }

  /**
   * Handle farewell messages
   */
  private handleFarewell(): string {
    const farewells = [
      'Goodbye! 👋 Have a great day!',
      'See you later! Feel free to come back anytime! 😊',
      'Thanks for chatting! Take care! 🌟',
      'Bye! Looking forward to our next conversation! ✨',
    ];

    return farewells[Math.floor(Math.random() * farewells.length)];
  }

  /**
   * Default response for general messages
   */
  private handleDefault(message: string): string {
    // Echo understanding
    return `I heard you say: "${message}"

I'm a simple chatbot right now, but I'm learning! 🤖

Try asking me for "help" to see what I can do, or just chat with me!`;
  }
}
