import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { GeminiAiService } from '../gemini/gemini-ai.service';
import { ManualRateEngineService } from '../rates/manual-rate-engine.service';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: GeminiAiService,
          useValue: {
            generateResponse: jest.fn(async () => 'mock-ai-response'),
            generateResponseWithMemory: jest.fn(async () => 'mock-ai-response'),
          },
        },
        {
          provide: ManualRateEngineService,
          useValue: {
            estimate: jest.fn(async () => ({
              status: 'ok',
              quote: {
                provider: 'manual-rate-engine',
                mode: 'air',
                origin: 'los',
                destination: 'lhr',
                chargeableWeightKg: 45,
                breakdown: {
                  base: { amount: 100, currency: 'NGN' },
                  surcharges: { amount: 10, currency: 'NGN' },
                  margin: { amount: 5, currency: 'NGN' },
                  total: { amount: 115, currency: 'NGN' },
                  assumptions: [],
                },
              },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('routes quote-like messages to quote flow', async () => {
    const res = await service.processMessage({
      message: 'Can I get a quote for 10kg from CN to DE by air?',
    });

    expect(res.intent).toBe('quote');
    expect(res.data?.status).toBe('ok');
  });
});
