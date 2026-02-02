import { Injectable, Logger } from '@nestjs/common';
import {
  ManualQuoteRequestDto,
  ManualMode,
  ManualContainerType,
} from './dto/manual-quote-request.dto';
import { ManualQuoteResponseDto, Money } from './dto/manual-quote-response.dto';

type Region = 'nigeria' | 'asia' | 'europe' | 'usa' | 'unknown';

type LatLng = { lat: number; lng: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(amount: number, currency: Money['currency']): Money {
  return { amount: round2(amount), currency };
}

@Injectable()
export class ManualRateEngineService {
  private readonly logger = new Logger(ManualRateEngineService.name);

  async estimate(dto: ManualQuoteRequestDto): Promise<ManualQuoteResponseDto> {
    const fromFreeText = dto.freeText ? this.extractFromText(dto.freeText) : {};

    const merged: ManualQuoteRequestDto = {
      ...fromFreeText,
      ...dto,
      // nested objects: prefer explicit dto if present
      dimensionsCm: dto.dimensionsCm ?? fromFreeText.dimensionsCm,
    };

    const missing: string[] = [];

    const mode = merged.mode ?? this.detectMode(merged.freeText ?? '');
    if (!mode) missing.push('mode');

    const origin = merged.origin;
    const destination = merged.destination;

    if (mode === 'parcel' || mode === 'air' || mode === 'ocean') {
      if (!origin) missing.push('origin');
      if (!destination) missing.push('destination');
    }

    const assumptionsForResolution: string[] = [];
    if (mode === 'ground') {
      // For trucking, origin/destination are helpful but distance is the key.
      if (!merged.distanceKm) {
        const resolved = await this.resolveDistanceKm(merged);
        if (resolved?.distanceKm) {
          merged.distanceKm = resolved.distanceKm;
          assumptionsForResolution.push(
            `Distance source: ${resolved.source} (${round2(resolved.distanceKm)} km)`,
          );
          if (Number.isFinite(resolved.durationHours)) {
            assumptionsForResolution.push(
              `Drive time (estimate): ${round2(resolved.durationHours)} hours`,
            );
          }
        }
      }

      if (!merged.distanceKm) missing.push('distanceKm');
    }

    if (mode === 'parcel' || mode === 'air') {
      if (!merged.weightKg || !Number.isFinite(Number(merged.weightKg))) {
        missing.push('weightKg');
      }
    }

    if (mode === 'ocean') {
      if (!merged.containerType) missing.push('containerType');
    }

    if (missing.length) {
      return {
        status: 'needs_clarification',
        missingFields: Array.from(new Set(missing)),
        message: 'Missing fields for manual quote',
      };
    }

    try {
      const out = this.calculate(mode!, merged, assumptionsForResolution);
      return {
        status: 'ok',
        message:
          'Estimate only. Please send in a Quote request to get a real quote estimation (live pricing and availability).',
        quote: out,
      };
    } catch (e: any) {
      this.logger.error('Manual estimate failed', e?.stack || e);
      return {
        status: 'error',
        message: e?.message || 'Manual estimate failed',
      };
    }
  }

  private calculate(
    mode: ManualMode,
    req: ManualQuoteRequestDto,
    resolutionAssumptions: string[] = [],
  ) {
    const assumptions: string[] = [];
    assumptions.push(...resolutionAssumptions);

    assumptions.push(
      'Estimate only — send in a Quote request for real quote estimation (live pricing and availability).',
    );

    const fxUsdToNgn = this.envNumber('MANUAL_USD_TO_NGN', 1500);
    assumptions.push(`FX used: 1 USD = ₦${fxUsdToNgn}`);

    const inflation2026 = this.envNumber('MANUAL_QUOTES_INFLATION_2026', 1.03);

    const marketMultiplierByMode: Record<ManualMode, number> = {
      parcel: this.envNumber('MANUAL_QUOTES_MARKET_MULT_PARCEL', 1.06),
      ocean: this.envNumber('MANUAL_QUOTES_MARKET_MULT_OCEAN', 0.88),
      air: this.envNumber('MANUAL_QUOTES_MARKET_MULT_AIR', 1.03),
      ground: this.envNumber('MANUAL_QUOTES_MARKET_MULT_GROUND', 1.02),
    };

    const marginPctByMode: Record<ManualMode, number> = {
      parcel: this.envNumber('MANUAL_QUOTES_MARGIN_PARCEL', 0.275),
      ocean: this.envNumber('MANUAL_QUOTES_MARGIN_OCEAN', 0.2),
      air: this.envNumber('MANUAL_QUOTES_MARGIN_AIR', 0.25),
      ground: this.envNumber('MANUAL_QUOTES_MARGIN_GROUND', 0.4),
    };

    const multiplier = inflation2026 * marketMultiplierByMode[mode];

    if (mode === 'parcel') {
      const oNig = this.isNigeria(req.origin);
      const dNig = this.isNigeria(req.destination);
      const weightKg = Number(req.weightKg);

      // Domestic Nigeria parcel rates are already in NGN.
      if (oNig && dNig) {
        assumptions.push('Domestic Nigeria parcel averages (2026)');

        const o = String(req.origin || '').toLowerCase();
        const d = String(req.destination || '').toLowerCase();

        let baseNgn = 0;
        if (o.includes('lagos') && d.includes('lagos')) {
          baseNgn = 3500; // avg of ₦2,000-₦5,000
          assumptions.push('Lane: intrastate (within Lagos)');
        } else if (
          (o.includes('lagos') && d.includes('abuja')) ||
          (o.includes('abuja') && d.includes('lagos'))
        ) {
          baseNgn = 5750; // avg of ₦3,500-₦8,000
          assumptions.push('Lane: Lagos ↔ Abuja');
        } else {
          baseNgn = 10000; // avg of ₦5,000-₦15,000
          assumptions.push('Lane: long distance (Nigeria)');
        }

        const surPct = this.envNumber(
          'MANUAL_PARCEL_DOMESTIC_SURCHARGE_PCT',
          0.15,
        );
        const surchargeNgn = baseNgn * surPct;

        const base = baseNgn * multiplier;
        const sur = surchargeNgn * multiplier;
        const subtotal = base + sur;
        const margin = subtotal * marginPctByMode[mode];
        const total = subtotal + margin;

        return {
          provider: 'manual-rate-engine' as const,
          mode,
          origin: req.origin,
          destination: req.destination,
          breakdown: {
            base: money(base, 'NGN'),
            surcharges: money(sur, 'NGN'),
            margin: money(margin, 'NGN'),
            total: money(total, 'NGN'),
            assumptions,
          },
        };
      }

      // International express parcel rates are USD-based in the market data; convert to NGN.
      assumptions.push('International express parcel averages (2026)');

      let baseUsd = 0;
      if (weightKg <= 5) baseUsd = 65;
      else if (weightKg <= 10) baseUsd = 115;
      else baseUsd = 215;

      const surchargeUsd =
        baseUsd * this.envNumber('MANUAL_PARCEL_SURCHARGE_PCT', 0.25);

      const baseNgn = baseUsd * fxUsdToNgn;
      const surNgn = surchargeUsd * fxUsdToNgn;

      const base = baseNgn * multiplier;
      const sur = surNgn * multiplier;
      const subtotal = base + sur;
      const margin = subtotal * marginPctByMode[mode];
      const total = subtotal + margin;

      return {
        provider: 'manual-rate-engine' as const,
        mode,
        origin: req.origin,
        destination: req.destination,
        breakdown: {
          base: money(base, 'NGN'),
          surcharges: money(sur, 'NGN'),
          margin: money(margin, 'NGN'),
          total: money(total, 'NGN'),
          assumptions,
        },
      };
    }

    if (mode === 'ocean') {
      assumptions.push(
        'Ocean container averages (2026), includes basic surcharges',
      );

      const containerType = (req.containerType ||
        '40ft') as ManualContainerType;
      const originRegion = this.detectRegion(req.origin);

      let baseUsd = 0;

      // Nigeria-focused baselines
      const isToNigeria = this.isNigeria(req.destination);
      const isFromEurope = originRegion === 'europe';

      if (containerType === '20ft') {
        baseUsd = isToNigeria && isFromEurope ? 1500 : 2150;
      } else {
        // 40ft or 40hc
        baseUsd = isToNigeria && isFromEurope ? 2300 : 3300;
      }

      const portCongestion = this.envNumber(
        'MANUAL_OCEAN_PORT_CONGESTION_USD',
        400,
      );
      const documentation = this.envNumber(
        'MANUAL_OCEAN_DOCUMENTATION_USD',
        100,
      );
      const bafCafPct = this.envNumber('MANUAL_OCEAN_BAF_CAF_PCT', 0.075);
      const bafCaf = baseUsd * bafCafPct;

      const ddDays = Number(req.detentionDemurrageDays || 0);
      const ddPerDay = this.envNumber(
        'MANUAL_OCEAN_DEMURRAGE_USD_PER_DAY',
        200,
      );
      const dd = ddDays > 0 ? ddDays * ddPerDay : 0;
      if (ddDays > 0)
        assumptions.push(`Includes detention/demurrage for ${ddDays} days`);

      const surchargeUsd = portCongestion + documentation + bafCaf + dd;

      const baseNgn = baseUsd * fxUsdToNgn;
      const surNgn = surchargeUsd * fxUsdToNgn;

      const base = baseNgn * multiplier;
      const sur = surNgn * multiplier;
      const subtotal = base + sur;
      const margin = subtotal * marginPctByMode[mode];
      const total = subtotal + margin;

      return {
        provider: 'manual-rate-engine' as const,
        mode,
        origin: req.origin,
        destination: req.destination,
        breakdown: {
          base: money(base, 'NGN'),
          surcharges: money(sur, 'NGN'),
          margin: money(margin, 'NGN'),
          total: money(total, 'NGN'),
          assumptions,
        },
      };
    }

    if (mode === 'air') {
      assumptions.push('Air freight averages (2026) using chargeable weight');

      const originRegion = this.detectRegion(req.origin);
      const isExpress = Boolean(req.isExpress);
      if (isExpress) assumptions.push('Express selected');

      const weightKg = Number(req.weightKg);
      const volumetricKg = this.calculateVolumetricKg(req);
      if (Number.isFinite(volumetricKg))
        assumptions.push('Volumetric divisor: (L×W×H cm)/6000');

      let chargeable = Math.max(
        weightKg,
        Number.isFinite(volumetricKg) ? volumetricKg : 0,
      );
      const minChargeable = this.envNumber('MANUAL_AIR_MIN_CHARGEABLE_KG', 45);
      if (chargeable < minChargeable) {
        assumptions.push(
          `Minimum chargeable weight applied: ${minChargeable}kg`,
        );
        chargeable = minChargeable;
      }

      const ratePerKgUsd = this.getAirRatePerKgUsd(originRegion, isExpress);
      assumptions.push(`Rate used: ${ratePerKgUsd}/kg (USD)`);

      const baseUsd = chargeable * ratePerKgUsd;

      // Handling/fuel buffer (15% default)
      const surchargePct = this.envNumber('MANUAL_AIR_SURCHARGE_PCT', 0.15);
      const surchargeUsd = baseUsd * surchargePct;

      const baseNgn = baseUsd * fxUsdToNgn;
      const surNgn = surchargeUsd * fxUsdToNgn;

      const base = baseNgn * multiplier;
      const sur = surNgn * multiplier;
      const subtotal = base + sur;
      const margin = subtotal * marginPctByMode[mode];
      const total = subtotal + margin;

      return {
        provider: 'manual-rate-engine' as const,
        mode,
        origin: req.origin,
        destination: req.destination,
        chargeableWeightKg: round2(chargeable),
        breakdown: {
          base: money(base, 'NGN'),
          surcharges: money(sur, 'NGN'),
          margin: money(margin, 'NGN'),
          total: money(total, 'NGN'),
          assumptions,
        },
      };
    }

    // ground
    assumptions.push(
      'Nigeria domestic trucking averages (2026) per-km pricing',
    );

    const km = Number(req.distanceKm);
    const perKm = this.envNumber('MANUAL_GROUND_NGN_PER_KM', 250);
    assumptions.push(`Rate used: ₦${perKm}/km`);

    const baseNgn = km * perKm;

    const surchargePct = this.envNumber('MANUAL_GROUND_SURCHARGE_PCT', 0.1);
    const surchargeNgn = baseNgn * surchargePct;

    const base = baseNgn * multiplier;
    const sur = surchargeNgn * multiplier;
    const subtotal = base + sur;
    const margin = subtotal * marginPctByMode[mode];
    const total = subtotal + margin;

    return {
      provider: 'manual-rate-engine' as const,
      mode,
      origin: req.origin,
      destination: req.destination,
      breakdown: {
        base: money(base, 'NGN'),
        surcharges: money(sur, 'NGN'),
        margin: money(margin, 'NGN'),
        total: money(total, 'NGN'),
        assumptions,
      },
    };
  }

  private calculateVolumetricKg(req: ManualQuoteRequestDto): number {
    if (req.volumeCbm && Number.isFinite(Number(req.volumeCbm))) {
      // 1 cbm ≈ 167kg chargeable (6000 divisor)
      return Number(req.volumeCbm) * 167;
    }

    const d = req.dimensionsCm;
    if (!d) return NaN;
    const l = Number(d.length);
    const w = Number(d.width);
    const h = Number(d.height);
    if (![l, w, h].every((v) => Number.isFinite(v) && v > 0)) return NaN;
    return (l * w * h) / 6000;
  }

  private getAirRatePerKgUsd(region: Region, isExpress: boolean): number {
    // Averages derived from provided ranges
    if (isExpress) {
      if (region === 'europe') return 8.5;
      if (region === 'usa') return 11.5;
      return 10.0; // asia/unknown
    }

    if (region === 'europe') return 4.75;
    if (region === 'usa') return 6.5;
    return 5.75; // asia/unknown
  }

  private extractFromText(freeText: string): Partial<ManualQuoteRequestDto> {
    const text = String(freeText || '');
    const lowered = text.toLowerCase();

    const out: Partial<ManualQuoteRequestDto> = { freeText };

    // mode
    out.mode = this.detectMode(lowered) ?? undefined;

    // from/to
    // Important: avoid swallowing trailing weights/distances like "to Ogun 42kg".
    const fromTo = lowered.match(
      /\bfrom\b\s+([^\n]+?)\s+\bto\b\s+([^\n,.]+?)(?:(?:\s+\d+(?:\.\d+)?\s*(?:kg|km)\b)|\bby\b|\bvia\b|\.|,|$)/i,
    );
    if (fromTo) {
      out.origin = this.cleanPlace(fromTo[1]);
      out.destination = this.cleanPlace(fromTo[2]);
    }

    // weight
    const weightMatch = lowered.match(/\b(\d+(?:\.\d+)?)\s*kg\b/i);
    if (weightMatch) out.weightKg = Number(weightMatch[1]);

    // dimensions like 40x30x20 cm
    const dimMatch = lowered.match(
      /\b(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm\b/i,
    );
    if (dimMatch) {
      out.dimensionsCm = {
        length: Number(dimMatch[1]),
        width: Number(dimMatch[2]),
        height: Number(dimMatch[3]),
      };
    }

    // distance
    const kmMatch = lowered.match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
    if (kmMatch) out.distanceKm = Number(kmMatch[1]);

    // container type
    if (/\b20\s*(ft|feet)\b|\b20ft\b/i.test(lowered))
      out.containerType = '20ft';
    if (/\b40\s*(ft|feet)\b|\b40ft\b/i.test(lowered))
      out.containerType = '40ft';
    if (/\b40\s*hc\b|\b40hc\b|\b40\s*high\s*cube\b/i.test(lowered))
      out.containerType = '40hc';

    // express
    if (/\bexpress\b|\bdhl\b|\bfedex\b|\bups\b/i.test(lowered))
      out.isExpress = true;

    // demurrage days
    const ddMatch = lowered.match(
      /\b(\d+)\s*(day|days)\b.*\b(demurrage|detention)\b/i,
    );
    if (ddMatch) out.detentionDemurrageDays = Number(ddMatch[1]);

    return out;
  }

  private cleanPlace(value?: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    // Strip common trailing tokens after a location.
    // Examples: "ogun 42kg" -> "ogun", "abuja 760km" -> "abuja".
    return raw
      .replace(/\s+\d+(?:\.\d+)?\s*(kg|km)\b.*$/i, '')
      .replace(/\s+by\s+.*$/i, '')
      .replace(/\s+via\s+.*$/i, '')
      .trim();
  }

  private canonicalNigeriaPlace(value?: string): string | null {
    const v = String(value || '').toLowerCase();
    if (!v) return null;
    if (/\blagos\b/i.test(v)) return 'lagos';
    if (/\babuja\b/i.test(v)) return 'abuja';
    if (/\bkano\b/i.test(v)) return 'kano';
    if (/\bogun\b/i.test(v)) return 'ogun';
    if (/\babeokuta\b/i.test(v)) return 'abeokuta';
    if (/\bport\s+harcourt\b|\bportharcourt\b|\bph\b/i.test(v))
      return 'port harcourt';
    return null;
  }

  private detectMode(text: string): ManualMode | null {
    const t = String(text || '').toLowerCase();

    if (/\b(dhl|fedex|ups|parcel|small package|express)\b/i.test(t))
      return 'parcel';
    if (/\b(air|iata|airport|air freight|air cargo)\b/i.test(t)) return 'air';
    if (/\b(ocean|sea|container|fcl|lcl|ship|vessel|port)\b/i.test(t))
      return 'ocean';
    if (/\b(truck|trucking|ground|ltl|road|interstate|intrastate)\b/i.test(t))
      return 'ground';

    return null;
  }

  private isNigeria(value?: string): boolean {
    const v = String(value || '').toLowerCase();
    if (!v) return false;
    return (
      v.includes('nigeria') ||
      /\b(lagos|abuja|kano|port harcourt|ph|apapa|tin can)\b/i.test(v) ||
      /\b(los)\b/i.test(v)
    );
  }

  private detectRegion(value?: string): Region {
    const v = String(value || '').toLowerCase();
    if (!v) return 'unknown';

    if (this.isNigeria(v)) return 'nigeria';

    if (
      /\b(china|shanghai|shenzhen|guangzhou|hong kong|singapore|vietnam|asia)\b/i.test(
        v,
      )
    ) {
      return 'asia';
    }

    if (
      /\b(europe|uk|united kingdom|london|germany|france|netherlands|belgium|spain|italy)\b/i.test(
        v,
      )
    ) {
      return 'europe';
    }

    if (
      /\b(usa|u\.s\.|united states|america|new york|los angeles|lax|jfk)\b/i.test(
        v,
      )
    ) {
      return 'usa';
    }

    return 'unknown';
  }

  private inferDistanceKm(
    origin?: string,
    destination?: string,
  ): number | null {
    // Canonicalize common Nigerian places so free-text like "Ogun 42kg" still matches.
    const o =
      this.canonicalNigeriaPlace(origin) ||
      String(origin || '')
        .toLowerCase()
        .trim();
    const d =
      this.canonicalNigeriaPlace(destination) ||
      String(destination || '')
        .toLowerCase()
        .trim();

    const key = `${o}::${d}`;
    const reverse = `${d}::${o}`;

    const known: Record<string, number> = {
      'lagos::abuja': 760,
      'lagos::kano': 1000,
      'lagos::port harcourt': 600,
      'lagos::ph': 600,
      // Region/state fallback examples
      'lagos::ogun': 90, // assume Lagos ↔ Abeokuta corridor
      'lagos::abeokuta': 90,
    };

    if (known[key]) return known[key];
    if (known[reverse]) return known[reverse];
    return null;
  }

  private resolveNigeriaCoords(value?: string): LatLng | null {
    const v = String(value || '').toLowerCase();
    if (!v) return null;

    // Minimal built-in mapping for common lanes; extend as needed.
    const known: Array<{ key: RegExp; lat: number; lng: number }> = [
      { key: /\blagos\b/i, lat: 6.5244, lng: 3.3792 },
      { key: /\babuja\b/i, lat: 9.0765, lng: 7.4951 },
      { key: /\bkano\b/i, lat: 12.0022, lng: 8.592 },
      // Ogun state fallback (uses Abeokuta as representative)
      { key: /\bogun\b|\babeokuta\b/i, lat: 7.1452, lng: 3.3619 },
      {
        key: /\bport\s+harcourt\b|\bportharcourt\b|\bph\b/i,
        lat: 4.8156,
        lng: 7.0498,
      },
    ];

    const hit = known.find((k) => k.key.test(v));
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  }

  private async getCoordsLocationIq(query: string): Promise<LatLng | null> {
    const apiKey = String(
      process.env.LOCATIONIQ_API_KEY || process.env.LOCATIONIQ_KEY || '',
    ).trim();
    if (!apiKey) return null;

    const q = String(query || '').trim();
    if (!q) return null;

    const url =
      process.env.LOCATIONIQ_GEOCODE_URL ||
      'https://us1.locationiq.com/v1/search';
    const timeoutMs = this.envNumber('LOCATIONIQ_TIMEOUT_MS', 8000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const u = new URL(url);
      u.searchParams.set('key', apiKey);
      u.searchParams.set('q', q);
      u.searchParams.set('format', 'json');
      u.searchParams.set('limit', '1');

      const resp = await fetch(u.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.warn('LocationIQ geocode failed', {
          status: resp.status,
          statusText: resp.statusText,
          preview: text.slice(0, 240),
        });
        return null;
      }

      const json: any = await resp.json();
      const first = Array.isArray(json) ? json[0] : json;
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch (e: any) {
      this.logger.warn('LocationIQ geocode error', e?.message || e);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getDistanceLocationIq(
    start: LatLng,
    end: LatLng,
  ): Promise<{ distanceKm: number; durationHours: number } | null> {
    const apiKey = String(
      process.env.LOCATIONIQ_API_KEY || process.env.LOCATIONIQ_KEY || '',
    ).trim();
    if (!apiKey) return null;

    const url =
      process.env.LOCATIONIQ_DIRECTIONS_URL ||
      'https://us1.locationiq.com/v1/directions/driving';
    const timeoutMs = this.envNumber('LOCATIONIQ_TIMEOUT_MS', 8000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const u = new URL(url);
      u.searchParams.set('key', apiKey);
      // LocationIQ directions expects: coordinates=lon,lat;lon,lat
      u.searchParams.set(
        'coordinates',
        `${start.lng},${start.lat};${end.lng},${end.lat}`,
      );
      u.searchParams.set('overview', 'false');

      const resp = await fetch(u.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.warn('LocationIQ directions failed', {
          status: resp.status,
          statusText: resp.statusText,
          preview: text.slice(0, 240),
        });
        return null;
      }

      const json: any = await resp.json();
      const route0 = json?.routes?.[0];
      const distanceMeters = Number(route0?.distance);
      const durationSeconds = Number(route0?.duration);
      if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;

      const distanceKm = distanceMeters / 1000;
      const durationHours =
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds / 3600
          : NaN;
      return { distanceKm, durationHours };
    } catch (e: any) {
      this.logger.warn('LocationIQ directions error', e?.message || e);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveDistanceKm(req: ManualQuoteRequestDto): Promise<{
    distanceKm: number;
    durationHours: number;
    source: 'locationiq' | 'openroute' | 'heuristic';
  } | null> {
    // 1) If start/end coords explicitly provided, prefer them.
    let start: LatLng | null =
      req.start ?? this.resolveNigeriaCoords(req.origin);
    let end: LatLng | null =
      req.end ?? this.resolveNigeriaCoords(req.destination);

    // 2) If missing coords, try LocationIQ forward geocoding.
    if (!start && req.origin) {
      start = await this.getCoordsLocationIq(req.origin);
    }
    if (!end && req.destination) {
      end = await this.getCoordsLocationIq(req.destination);
    }

    if (start && end) {
      // Prefer LocationIQ routing if available; fallback to OpenRoute.
      const liq = await this.getDistanceLocationIq(start, end);
      if (liq) return { ...liq, source: 'locationiq' };

      const openRoute = await this.getDistanceOpenRoute(start, end);
      if (openRoute) return { ...openRoute, source: 'openroute' };
    }

    // 2) Fallback to a small set of known lane distances.
    const inferredKm = this.inferDistanceKm(req.origin, req.destination);
    if (inferredKm) {
      return {
        distanceKm: inferredKm,
        durationHours: NaN,
        source: 'heuristic',
      };
    }

    return null;
  }

  private async getDistanceOpenRoute(
    start: { lat: number; lng: number },
    end: { lat: number; lng: number },
  ): Promise<{ distanceKm: number; durationHours: number } | null> {
    const apiKey = String(
      process.env.OPENROUTE_API_KEY ||
        process.env.OPENROUTESERVICE_API_KEY ||
        '',
    ).trim();
    if (!apiKey) return null;

    const url =
      process.env.OPENROUTE_DIRECTIONS_URL ||
      'https://api.openrouteservice.org/v2/directions/driving-car';

    const timeoutMs = this.envNumber('OPENROUTE_TIMEOUT_MS', 8000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat],
          ],
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.warn('OpenRouteService distance lookup failed', {
          status: resp.status,
          statusText: resp.statusText,
          preview: text.slice(0, 240),
        });
        return null;
      }

      const json: any = await resp.json();
      const summary = json?.routes?.[0]?.summary;
      const distanceMeters = Number(summary?.distance);
      const durationSeconds = Number(summary?.duration);

      if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
      const distanceKm = distanceMeters / 1000;
      const durationHours =
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds / 3600
          : NaN;

      return { distanceKm, durationHours };
    } catch (e: any) {
      // Don't throw; fallback to heuristics/region-based handling.
      this.logger.warn(
        'OpenRouteService distance lookup error',
        e?.message || e,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
}
