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

    this.chatModel = new ChatGoogleGenerativeAI({
      apiKey,
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
    this.logger.log('✅ Gemini AI Service initialized successfully');
  }

  async generateResponse(userMessage: string): Promise<string> {
    try {
      this.logger.debug(`Generating response for "${userMessage}"`);

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

      const response = await this.chatModel.invoke(messages);
      const responseText = response.content.toString();
      this.logger.debug(`Response generated successfully`);
      return responseText;
    } catch (error) {
      this.logger.error(`Error generating response: ${error.message}`);

      // Handle specific errors
      if (error.message.includes('quota')) {
        throw new Error(
          'Daily API limit reached (1,500 requests). Try again tomorrow!',
        );
      }
      if (error.message.includes('rate limit')) {
        throw new Error('Too many requests. Please wait a moment.');
      }

      throw new Error('Failed to generate AI response. Please try again.');
    }
  }
}
