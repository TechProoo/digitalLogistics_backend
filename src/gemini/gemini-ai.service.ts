import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from 'langchain';

@Injectable()
export class GeminiAiService {
  private readonly logger = new Logger(GeminiAiService.name);
  private chatModel: ChatGoogleGenerativeAI;

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
  }

  async generateResponse(userMessage: string): Promise<string> {
    try {
      this.logger.debug('[GeminiAiService] Generating response', {
        preview: userMessage.slice(0, 240),
      });

      const systemPrompt = `You are a helpful and friendly customer service assistant for Digital Delivery, a logistics and delivery company.

                    Your responsibilities:
                    - Answer questions about delivery services, logistics, and shipping
                    - Be professional yet warm and approachable
                    - Keep responses concise (2-4 sentences for simple questions)
                    - If you don't know something, say so politely
                    - Guide users to helpful information

                    Company services:
                    - Land delivery (domestic shipping)
                    - Air freight (fast international shipping)
                    - Sea freight (economical international shipping)
                    - Warehousing and tracking

                    Tone: Professional, friendly, and helpful`;

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage),
      ];

      this.logger.debug('[GeminiAiService] invoking chat model', {
        messagesPreview: messages.map((m) =>
          m.text ? m.text.slice(0, 200) : '<sys>',
        ),
      });

      const response: any = await this.chatModel.invoke(messages);

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
