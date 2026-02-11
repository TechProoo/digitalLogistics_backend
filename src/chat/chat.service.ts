import { Injectable, Logger } from '@nestjs/common';
import { ChatMessageDto } from './dto/message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { GeminiAiService } from '../gemini/gemini-ai.service';
import { ManualRateEngineService } from '../rates/manual-rate-engine.service';

type ChatIntent =
  | 'company_info'
  | 'pricing'
  | 'quote'
  | 'general'
  | 'greeting'
  | 'help'
  | 'farewell';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly geminiAiService: GeminiAiService,
    private readonly manualRates: ManualRateEngineService,
  ) {}

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
      } else if (intent === 'quote') {
        const buildClarification = (missingFields: string[]) => {
          responseMessage = this.buildClarificationQuestion(
            missingFields || [],
          );
          return {
            message: responseMessage,
            intent: 'quote' as const,
            timestamp: new Date(),
            data: {
              status: 'needs_clarification',
              missingFields: missingFields || [],
            },
          };
        };

        const buildError = (message?: string) => {
          responseMessage =
            message || "Sorry — I couldn't generate a quote right now.";
          return {
            message: responseMessage,
            intent: 'quote' as const,
            timestamp: new Date(),
            data: { status: 'error' },
          };
        };

        const manualRes = await this.manualRates.estimate({
          freeText: dto.message,
        });

        if (manualRes.status === 'needs_clarification') {
          return buildClarification(manualRes.missingFields || []);
        }
        if (manualRes.status === 'error') {
          return buildError(manualRes.message);
        }

        responseMessage = this.summarizeQuote(manualRes.quote);
        return {
          message: responseMessage,
          intent: 'quote',
          timestamp: new Date(),
          data: {
            status: 'ok',
            quote: manualRes.quote,
          },
        };
      } else {
        // Use Gemini AI for complex questions
        this.logger.debug('🤖 Using Gemini AI...');
        const threadId =
          String(dto.conversationId || dto.userId || 'default').trim() ||
          'default';
        responseMessage = await this.geminiAiService.generateResponseWithMemory(
          dto.message,
          threadId,
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

    // Quote / rate request
    if (
      /\b(quote|rate|rates|freight|shipping quote|shipping rate|book a shipment)\b/i.test(
        message,
      )
    ) {
      return 'quote';
    }

    // Heuristic: looks like a shipping-lane request even without keywords
    // Examples: "10 boxes, 12kg, from LOS to LHR by air" or "from CNSHA to NLRTM"
    const hasFromTo = /\bfrom\b.+\bto\b/.test(message);
    const hasWeight = /\b\d+(?:\.\d+)?\s*kg\b/.test(message);
    const hasIataPair = /\bfrom\s+[a-z]{3}\s+to\s+[a-z]{3}\b/i.test(message);
    const hasUnlocode = /\b[a-z]{5}\b/i.test(message);
    if (hasFromTo && (hasWeight || hasIataPair || hasUnlocode)) {
      return 'quote';
    }

    return 'general';
  }

  private buildClarificationQuestion(missing: string[]): string {
    const labels: Record<string, string> = {
      // Manual quote engine fields
      mode: 'mode (parcel/air/ocean/ground)',
      origin: 'origin (city/country)',
      destination: 'destination (city/country)',
      containerType: 'container type (20ft/40ft/40hc)',
      distanceKm: 'distance in km (or say: from Lagos to Abuja)',

      // Shared field
      weightKg: 'weight in kg',
    };

    const needed = missing.map((m) => labels[m] || m);
    const list = needed.length ? needed.join(', ') : 'a few details';
    return `To get an estimate, I need: ${list}. Example (air): "10kg from China to Lagos by air". Example (ocean): "40ft container from China to Lagos by ocean". Example (ground): "Truck from Lagos to Abuja".`;
  }

  private summarizeQuote(quote: any): string {
    if (!quote) return 'I got a quote, but the details were empty.';

    const quoteCta =
      "For a live and accurate quote, please visit the New Delivery page and submit a Quote Request. We'll confirm live pricing and availability.";

    // Manual rate engine shape
    if (quote?.provider === 'manual-rate-engine' && quote?.breakdown?.total) {
      const base = quote.breakdown.base;
      const sur = quote.breakdown.surcharges;
      const margin = quote.breakdown.margin;
      const mode = String(quote.mode || '').toUpperCase();
      const chargeable = quote.chargeableWeightKg;

      const formatNgn = (amount: unknown) => {
        const n = Number(amount);
        if (!Number.isFinite(n)) return '₦0.00';
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
      };

      const baseAmt = Number(base?.amount || 0);
      const surAmt = Number(sur?.amount || 0);
      const subtotal = Math.round((baseAmt + surAmt) * 100) / 100;

      const lines: string[] = [];

      lines.push(`${mode} estimate (excluding margin): ${formatNgn(subtotal)}`);
      lines.push(
        `(base ${formatNgn(baseAmt)} + surcharges ${formatNgn(surAmt)})`,
      );

      if (Number.isFinite(Number(chargeable))) {
        lines.push(`Chargeable weight: ~${chargeable}kg`);
      }

      if (
        Number.isFinite(Number(margin?.amount)) &&
        Number(margin.amount) > 0
      ) {
        lines.push('');
        lines.push(
          `Margin (not included above): ${formatNgn(margin.amount)} — service/handling markup`,
        );
        lines.push('(final live quote may include this)');
      }

      lines.push('');
      lines.push(
        'This is a market-average estimate, not a carrier booking rate.',
      );
      lines.push(quoteCta);

      return lines.join('\n');
    }

    return `Estimate received. I can share the full breakdown if you want. ${quoteCta}`;
  }

  private handleGreeting(): string {
    const greetings = [
      'Hello! 👋 Welcome to DigitalLogistics! How can I help you today?',
      'Hi there! 😊 What can I do for you?',
      'Hey! 🌟 How may I assist you?',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private handleHelp(): string {
    return `I'm your Digital Logistics AI assistant! 🤖

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
