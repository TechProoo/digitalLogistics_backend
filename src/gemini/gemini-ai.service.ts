import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';

@Injectable()
export class GeminiAiService {
  private readonly logger = new Logger(GeminiAiService.name);
  private chatModel: ChatGoogleGenerativeAI;
  private readonly checkpointer = new MemorySaver();
  private conversationApp: any;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      this.logger.error('❌ GOOGLE_API_KEY not found in .env file!');
      throw new Error(
        'Google API key is required. Add GOOGLE_API_KEY to your .env file',
      );
    }

    // Log minimal info about initialization (mask API key)
    this.logger.log(
      `Initializing GeminiAiService with model=gemini-2.5-flash, temperature=0.7`,
    );
    try {
      this.chatModel = new ChatGoogleGenerativeAI({
        apiKey,
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxOutputTokens: 2048,
      });
      this.logger.log('✅ Gemini AI Service initialized successfully');
    } catch (err: any) {
      this.logger.error(
        'Failed to initialize ChatGoogleGenerativeAI',
        err?.stack || err,
      );
      throw err;
    }

    // Build a tiny LangGraph that appends messages and checkpoints them in-memory.
    // This lets the agent remember previous turns for each thread_id.
    const systemPrompt = this.getSystemPrompt();

    // IMPORTANT: MemorySaver stores the full state per thread_id in-process.
    // If we keep appending forever, a long chat can eventually OOM the Node process.
    // We cap message history with a reducer that trims to the last N messages.
    const maxMemoryMessagesRaw = Number(process.env.GEMINI_MEMORY_MAX_MESSAGES);
    const maxMemoryMessages = Number.isFinite(maxMemoryMessagesRaw)
      ? Math.floor(maxMemoryMessagesRaw)
      : 30;
    const effectiveMaxMemoryMessages = Math.max(6, maxMemoryMessages);

    const CappedMessagesState = Annotation.Root({
      messages: Annotation<any[]>({
        default: () => [],
        reducer: (left, right) => {
          const merged = [...(left || []), ...(right || [])];
          if (merged.length <= effectiveMaxMemoryMessages) return merged;
          return merged.slice(-effectiveMaxMemoryMessages);
        },
      }),
    });

    // NOTE: LangGraph's advanced generics can overwhelm TS (TS2589).
    // We intentionally use `any` here to keep builds/tests stable.
    const graph: any = new StateGraph(CappedMessagesState as any)
      .addNode('model', async (state) => {
        const response: any = await this.chatModel.invoke([
          new SystemMessage(systemPrompt),
          ...state.messages,
        ]);

        return { messages: [response] };
      })
      .addEdge(START, 'model')
      .addEdge('model', END);

    this.conversationApp = graph.compile({ checkpointer: this.checkpointer });
  }

  async generateResponse(userMessage: string): Promise<string> {
    // Backwards-compatible entrypoint: uses a shared default thread.
    // Prefer generateResponseWithMemory(...) from ChatService.
    return this.generateResponseWithMemory(userMessage, 'default');
  }

  async generateResponseWithMemory(
    userMessage: string,
    threadId: string,
  ): Promise<string> {
    try {
      this.logger.debug('[GeminiAiService] Generating response', {
        preview: userMessage.slice(0, 240),
      });

      const safeThreadId = String(threadId || 'default').trim() || 'default';

      this.logger.debug('[GeminiAiService] invoking memory graph', {
        threadId: safeThreadId,
      });

      const result: any = await this.conversationApp.invoke(
        { messages: [new HumanMessage(userMessage)] },
        { configurable: { thread_id: safeThreadId } },
      );

      const response = result?.messages?.[result.messages.length - 1];

      // Debug raw response shape for easier troubleshooting
      const safeStringify = (v: any) => {
        try {
          return JSON.stringify(
            v,
            (_k, val) => (typeof val === 'bigint' ? String(val) : val),
            2,
          );
        } catch (e) {
          return String(v);
        }
      };
      this.logger.debug(
        '[GeminiAiService] raw model response:',
        safeStringify(response),
      );

      // Robust extraction of text from different response shapes
      let responseText = '';
      if (!response) {
        responseText = '';
      } else if (typeof response === 'string') {
        responseText = response;
      } else if (response.content && typeof response.content === 'string') {
        responseText = response.content;
      } else if (
        response.content &&
        typeof response.content?.toString === 'function'
      ) {
        try {
          responseText = response.content.toString();
        } catch (_) {
          responseText = safeStringify(response.content);
        }
      } else if (Array.isArray(response.output) && response.output.length > 0) {
        // Common GenAI response shape: output -> [{ content: [{ type: 'text', text: '...' }] }]
        try {
          const first = response.output[0];
          const text = first?.content?.[0]?.text || first?.text || null;
          responseText = text || safeStringify(response);
        } catch (_) {
          responseText = safeStringify(response);
        }
      } else {
        responseText = safeStringify(response);
      }

      this.logger.debug('[GeminiAiService] extracted responseText', {
        preview: responseText.slice(0, 1000),
      });
      return String(responseText);
    } catch (error) {
      const e: any = error;
      this.logger.error(
        '[GeminiAiService] Error generating response',
        e?.stack || e,
      );

      const msg =
        (e && (e.message || String(e))) ||
        'Failed to generate AI response. Please try again.';

      // Handle specific errors
      if (msg.toLowerCase().includes('quota')) {
        throw new Error('Daily API limit reached. Try again later.');
      }
      if (
        msg.toLowerCase().includes('rate limit') ||
        msg.toLowerCase().includes('rate_limit')
      ) {
        throw new Error('Too many requests. Please wait a moment.');
      }

      throw new Error(msg);
    }
  }

  private getSystemPrompt(): string {
    return `You are a helpful and friendly customer service assistant for Digital Delivery, a technology-driven logistics and delivery company focused on making shipping simple, transparent, and reliable.

Your responsibilities:
- Answer questions about delivery services, logistics, shipping, tracking, and pricing
- Be professional yet warm and approachable
- Keep responses concise (2–4 sentences for simple questions)
- For complex logistics questions, give clear step-by-step explanations
- If you don't know something, say so politely
- Guide users to helpful next steps or platform tools

About Digital Delivery:
Digital Delivery was built on a simple idea: shipping should be as fluid and seamless as digital communication. We combine real-world logistics infrastructure with modern software to remove friction, uncertainty, and complexity from shipping — whether for businesses or individuals.

We aim to make global delivery accessible, transparent, and predictable through technology, automation, and strong logistics partnerships.

Core Experience Pillars:
- Precision Pickups: Users can schedule pickups directly from home, office, or warehouse.
- Global Connectivity: We coordinate cross-border logistics across multiple regions and carriers.
- Total Visibility: Real-time shipment tracking and status updates throughout the delivery lifecycle.

Core Commitments:
- Scalability: We support everything from documents to large freight shipments.
- Innovation-First: We use data, routing intelligence, and automation to improve delivery speed and efficiency.
- Reliability: Our partners and processes are vetted to maintain high delivery standards and consistency.

Delivery Process Overview:
1. Book delivery request
2. Schedule and complete pickup
3. Shipment moves through logistics network
4. Final delivery with confirmation

Pricing & Quotes:
- The chatbot can provide estimated delivery pricing.
- During delivery creation, users may see an estimated quote.
- Final real quote and confirmed price are usually shared via WhatsApp or support confirmation.
- Final pricing may change if actual package size, weight, or handling requirements differ from submitted details.

Company services:
- Land delivery (domestic shipping)
- Air freight (fast international shipping)
- Sea freight (economical international shipping)
- Warehousing and shipment tracking

Company Address:
Street: 33 Adeola Street
Local Government Area (LGA): Amuwo-Odofin
State: Lagos State
Country: Nigeria

Tone Guidelines:
- Professional, friendly, and confident
- Clear and simple explanations (avoid technical jargon unless needed)
- Reassuring when users are worried about shipments
- Helpful and solution-oriented
`;
  }

  /**
   * Generate STRICT JSON (no prose). Used for information extraction.
   * Returns the raw text output (expected to be JSON) so callers can parse.
   */
  async generateJsonOnly(userPrompt: string): Promise<string> {
    try {
      const systemPrompt =
        'You are a JSON extraction engine. Output ONLY valid JSON. Do not include markdown, code fences, or explanations.';

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const response: any = await this.chatModel.invoke(messages);

      // Reuse the same robust extraction logic
      const safeStringify = (v: any) => {
        try {
          return JSON.stringify(
            v,
            (_k, val) => (typeof val === 'bigint' ? String(val) : val),
            2,
          );
        } catch (e) {
          return String(v);
        }
      };

      let responseText = '';
      if (!response) {
        responseText = '';
      } else if (typeof response === 'string') {
        responseText = response;
      } else if (response.content && typeof response.content === 'string') {
        responseText = response.content;
      } else if (
        response.content &&
        typeof response.content?.toString === 'function'
      ) {
        try {
          responseText = response.content.toString();
        } catch (_) {
          responseText = safeStringify(response.content);
        }
      } else if (Array.isArray(response.output) && response.output.length > 0) {
        try {
          const first = response.output[0];
          const text = first?.content?.[0]?.text || first?.text || null;
          responseText = text || safeStringify(response);
        } catch (_) {
          responseText = safeStringify(response);
        }
      } else {
        responseText = safeStringify(response);
      }

      return String(responseText);
    } catch (error) {
      const e: any = error;
      this.logger.error(
        '[GeminiAiService] Error generating JSON',
        e?.stack || e,
      );
      throw error;
    }
  }
}
