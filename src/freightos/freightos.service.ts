import { Injectable, Logger } from '@nestjs/common';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';
import { GeminiAiService } from '../gemini/gemini-ai.service';

@Injectable()
export class FreightosService {
  private readonly logger = new Logger(FreightosService.name);

  constructor(private readonly gemini: GeminiAiService) {}

  private async extractFromText(freeText: string) {
    // Ask Gemini to return strict JSON matching the fields we need
    const prompt = `Extract freight estimate fields from the user message.
Return EXACTLY a JSON object with these keys:
- serviceType (air/ocean/land)
- weightKg (number)
- quantity (integer)
- unitType (one of: container20, container40, container40HC, container45HC, pallets, boxes)
- unitVolumeCBM (number or null)
- originUnLocationCode (UN/LOCODE like CNSHA) or originAirportCode (IATA like PVG)
- destinationUnLocationCode or destinationAirportCode

If a value is missing, set it to null. Do not add extra keys or any prose.

Notes:
- For AIR: prefer airport codes (IATA).
- For OCEAN/LAND: prefer UN/LOCODE.

User message: "${freeText.replaceAll('\n', ' ')}"`;

    const raw = await this.gemini.generateJsonOnly(prompt);
    // Try to parse JSON from the response
    const jsonCandidate = this.findJson(raw);
    if (!jsonCandidate) return null;

    try {
      const parsed = JSON.parse(jsonCandidate);
      return parsed;
    } catch (e) {
      this.logger.warn('Failed to parse extractor JSON', e as any);
      return null;
    }
  }

  private findJson(text: string): string | null {
    // Naive approach: find the first { ... } block
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  }

  private validateAndNormalize(obj: any) {
    const missing: string[] = [];
    const out: any = {};

    // Normalize serviceType
    let serviceType = obj.serviceType;
    if (serviceType && typeof serviceType === 'string') {
      serviceType = serviceType.toLowerCase();
    }
    if (!['air', 'ocean', 'land'].includes(serviceType)) {
      missing.push('serviceType');
    } else {
      out.serviceType = serviceType;
    }

    // Normalize quantity (defaults to 1)
    const quantityRaw = obj.quantity ?? 1;
    const quantity = Number(quantityRaw);
    out.quantity =
      Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;

    // Normalize unitType (default boxes)
    const unitType = obj.unitType || 'boxes';
    const allowedUnitTypes = [
      'container20',
      'container40',
      'container40HC',
      'container45HC',
      'pallets',
      'boxes',
    ];
    out.unitType = allowedUnitTypes.includes(unitType) ? unitType : 'boxes';

    // Normalize weightKg (required)
    let weightKg: any = obj.weightKg;
    if (weightKg && typeof weightKg === 'string') {
      weightKg = Number(weightKg.replace(/[a-zA-Z]/g, '').trim());
    }
    if (!Number.isFinite(Number(weightKg)) || Number(weightKg) <= 0) {
      missing.push('weightKg');
    } else {
      out.weightKg = Number(weightKg);
    }

    // Normalize unitVolumeCBM (optional)
    let unitVolumeCBM: any = obj.unitVolumeCBM;
    if (unitVolumeCBM && typeof unitVolumeCBM === 'string') {
      unitVolumeCBM = Number(unitVolumeCBM.replace(/[a-zA-Z]/g, '').trim());
    }
    out.unitVolumeCBM =
      unitVolumeCBM === null ||
      unitVolumeCBM === undefined ||
      unitVolumeCBM === ''
        ? null
        : Number.isFinite(Number(unitVolumeCBM))
          ? Number(unitVolumeCBM)
          : null;

    // Location codes (required depending on mode)
    const originUnLocationCode = obj.originUnLocationCode || null;
    const destinationUnLocationCode = obj.destinationUnLocationCode || null;
    const originAirportCode = obj.originAirportCode || null;
    const destinationAirportCode = obj.destinationAirportCode || null;

    out.originUnLocationCode = originUnLocationCode;
    out.destinationUnLocationCode = destinationUnLocationCode;
    out.originAirportCode = originAirportCode;
    out.destinationAirportCode = destinationAirportCode;

    if (out.serviceType === 'air') {
      if (!originAirportCode) missing.push('originAirportCode');
      if (!destinationAirportCode) missing.push('destinationAirportCode');
    } else {
      if (!originUnLocationCode) missing.push('originUnLocationCode');
      if (!destinationUnLocationCode) missing.push('destinationUnLocationCode');
    }

    return { ok: missing.length === 0, missing, data: out };
  }

  private buildMockQuote(normalized: any, reason: string) {
    // Return a mocked quote summary (var/ies by inputs so it's useful in dev)
    const weightKg = Number(normalized.weightKg) || 1;
    const serviceType = String(normalized.serviceType || 'air');

    const serviceMultiplier: Record<string, number> = {
      air: 3.2,
      ocean: 1.4,
      land: 2.0,
    };

    const basePerKgUsd = 4.75;
    const multiplier = serviceMultiplier[serviceType] ?? 2.0;
    const amount = Math.round(weightKg * basePerKgUsd * multiplier * 100) / 100;

    const transitDaysByService: Record<string, number> = {
      air: 3,
      land: 7,
      ocean: 21,
    };

    return {
      provider: 'mock-freightos',
      isMock: true,
      reason,
      price: { amount, currency: 'USD' },
      transitDays: transitDaysByService[serviceType] ?? 10,
      details: {
        origin: normalized.originCity || normalized.originCountry,
        destination:
          normalized.destinationCity || normalized.destinationCountry,
        weightKg: normalized.weightKg,
        serviceType: normalized.serviceType,
      },
    };
  }

  private async callFreightosApi(normalized: any): Promise<any> {
    const key = process.env.FREIGHTOS_API_KEY;
    const secret = process.env.FREIGHTOS_API_SECRET;
    const base =
      process.env.FREIGHTOS_API_URL || 'https://sandbox.freightos.com/api/v1';
    const explicitEndpoint = process.env.FREIGHTOS_QUOTE_ENDPOINT;
    const endpointPath =
      process.env.FREIGHTOS_QUOTES_PATH || '/freightEstimates';

    if (!key) {
      this.logger.warn('FREIGHTOS_API_KEY not set — returning mock quote');
      return this.buildMockQuote(normalized, 'FREIGHTOS_API_KEY not set');
    }

    // Freightos Freight Rate Estimator API (sandbox)
    // Configure either:
    // - FREIGHTOS_QUOTE_ENDPOINT (full URL), OR
    // - FREIGHTOS_API_URL + FREIGHTOS_QUOTES_PATH
    const endpoint = explicitEndpoint
      ? explicitEndpoint
      : `${base.replace(/\/$/, '')}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;

    const modeUpper = String(normalized.serviceType || '').toUpperCase();
    const isAir = modeUpper === 'AIR';

    const body: any = {
      legs: [
        {
          origin: isAir
            ? { airportCode: normalized.originAirportCode }
            : { unLocationCode: normalized.originUnLocationCode },
          destination: isAir
            ? { airportCode: normalized.destinationAirportCode }
            : { unLocationCode: normalized.destinationUnLocationCode },
        },
      ],
      load: [
        {
          quantity: normalized.quantity || 1,
          unitType: normalized.unitType || 'boxes',
          unitWeightKg: normalized.weightKg,
          unitVolumeCBM: normalized.unitVolumeCBM ?? undefined,
        },
      ],
    };

    this.logger.debug('Calling Freightos estimator', {
      endpoint,
      mode: modeUpper,
    });

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Docs show x-apikey, but some gateways use x-api-key; send both.
        'x-apikey': String(key),
        'x-api-key': String(key),
        // Some Freightos apps provide a key+secret pair.
        ...(secret
          ? {
              'x-apisecret': String(secret),
              'x-api-secret': String(secret),
            }
          : {}),
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      this.logger.error('Freightos API error', {
        endpoint,
        status: resp.status,
        statusText: resp.statusText,
        text,
      });

      // Make 404s actionable (usually wrong URL/path) and keep message compact.
      const snippet = (text || '').slice(0, 800);
      if (resp.status === 404) {
        throw new Error(
          `Freightos API error: 404 (endpoint not found or not authorized). Endpoint: ${endpoint}. Check FREIGHTOS_API_URL/FREIGHTOS_QUOTES_PATH (should be https://sandbox.freightos.com/api/v1 + /freightEstimates). Response: ${snippet}`,
        );
      }

      if (resp.status === 403) {
        const allowFallback =
          String(process.env.FREIGHTOS_FALLBACK_TO_MOCK_ON_FORBIDDEN || '')
            .toLowerCase()
            .trim() === 'true';
        if (allowFallback) {
          this.logger.warn(
            'Freightos returned 403; falling back to mock quote (FREIGHTOS_FALLBACK_TO_MOCK_ON_FORBIDDEN=true)',
          );
          return this.buildMockQuote(
            normalized,
            'Freightos estimator returned 403 Forbidden',
          );
        }

        throw new Error(
          `Freightos API error: 403 Forbidden. Endpoint: ${endpoint}. This usually means your app/key is not approved/entitled for this API in this environment (sandbox vs prod), or the API is currently disabled/unsupported. If your Freightos portal shows a Secret, set FREIGHTOS_API_SECRET too. Response: ${snippet}`,
        );
      }

      throw new Error(
        `Freightos API error: ${resp.status} ${resp.statusText}. Endpoint: ${endpoint}. Response: ${snippet}`,
      );
    }

    const json = await resp.json();
    return {
      provider: 'freightos-estimator',
      isMock: false,
      endpoint,
      request: body,
      response: json,
      mode: modeUpper,
    };
  }

  async handleQuoteRequest(dto: QuoteRequestDto): Promise<QuoteResponseDto> {
    try {
      let extracted = null;
      if (dto.freeText) {
        extracted = await this.extractFromText(dto.freeText);
      }

      const merged = {
        ...(extracted || {}),
        originCountry: dto.originCountry ?? extracted?.originCountry,
        originCity: dto.originCity ?? extracted?.originCity,
        destinationCountry:
          dto.destinationCountry ?? extracted?.destinationCountry,
        destinationCity: dto.destinationCity ?? extracted?.destinationCity,
        weightKg: dto.weightKg ?? extracted?.weightKg,
        serviceType: dto.serviceType ?? extracted?.serviceType,
      };

      const { ok, missing, data } = this.validateAndNormalize(merged);
      if (!ok) {
        return {
          status: 'needs_clarification',
          missingFields: missing,
          message: 'Missing or invalid fields',
        };
      }

      const quote = await this.callFreightosApi(data);
      return { status: 'ok', quote };
    } catch (err: any) {
      this.logger.error('handleQuoteRequest error', err?.stack || err);
      return { status: 'error', message: err?.message || 'Unknown error' };
    }
  }
}
