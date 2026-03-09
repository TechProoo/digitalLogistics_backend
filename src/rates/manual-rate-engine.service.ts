import { Injectable, Logger } from '@nestjs/common';
import {
  ManualQuoteRequestDto,
  ManualMode,
  ManualContainerType,
} from './dto/manual-quote-request.dto';
import { ManualQuoteResponseDto, Money } from './dto/manual-quote-response.dto';
import { haversineKm, LatLng } from './geo.utils';

// FIX: Added 'africa' and 'middleeast' so they don't silently fall through to 'unknown'
type Region =
  | 'nigeria'
  | 'africa'
  | 'asia'
  | 'middleeast'
  | 'europe'
  | 'usa'
  | 'unknown';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function money(amount: number, currency: Money['currency']): Money {
  return { amount: round2(amount), currency };
}

// In-memory cache for distances (simple TTL)
const distanceCache = new Map<
  string,
  { distanceKm: number; durationHours: number; expires: number }
>();

// ---------------------------------------------------------------------------
// Nigeria domestic lane table — city-pair → base NGN for parcels ≤1 kg
// Keys are always alphabetically sorted: `${cityA}::${cityB}` where cityA < cityB
// ---------------------------------------------------------------------------
const NIGERIA_PARCEL_LANES: Record<string, number> = {
  // ── Intra-city ──────────────────────────────────────────────────────────
  'abuja::abuja': 2_500,
  'kano::kano': 2_500,
  'lagos::lagos': 3_500,
  'ph::ph': 2_800,
  'portharcourt::portharcourt': 2_800,

  // ── Lagos hub ───────────────────────────────────────────────────────────
  'abuja::lagos': 5_750,
  'lagos::ogun': 3_800,
  'abeokuta::lagos': 3_800,
  'ibadan::lagos': 4_000,
  'lagos::ph': 9_500,
  'lagos::portharcourt': 9_500,
  'lagos::kano': 12_000,
  'benin::lagos': 7_500, // Benin City
  'lagos::warri': 9_000,
  'enugu::lagos': 11_000,
  'lagos::owerri': 10_500,
  'lagos::calabar': 13_000,

  // ── Abuja hub ───────────────────────────────────────────────────────────
  'abuja::kano': 6_500,
  'abuja::ph': 10_500,
  'abuja::portharcourt': 10_500,
  'abuja::enugu': 8_500,
  'abuja::kaduna': 5_500,
  'abuja::jos': 6_000,
  'abuja::owerri': 9_500,

  // ── South-South / South-East ────────────────────────────────────────────
  'benin::ph': 7_000,
  'benin::portharcourt': 7_000,
  'enugu::ph': 7_500,
  'enugu::portharcourt': 7_500,
  'ph::warri': 6_500,
  'portharcourt::warri': 6_500,
  'calabar::ph': 8_000,
  'calabar::portharcourt': 8_000,

  // ── North ───────────────────────────────────────────────────────────────
  'kaduna::kano': 4_000,
  'jos::kano': 5_500,
  'kano::maiduguri': 9_000,
  'kano::sokoto': 7_500,

  // ── Lagos hub (additional state capitals) ─────────────────────────────
  'ilorin::lagos': 5_500,
  'akure::lagos': 5_000,
  'adoekiti::lagos': 5_500,
  'lagos::osogbo': 4_800,
  'lagos::lokoja': 7_500,
  'asaba::lagos': 8_500,
  'awka::lagos': 10_500,
  'lagos::umuahia': 11_000,
  'abakaliki::lagos': 12_000,
  'lagos::uyo': 13_500,
  'lagos::yenagoa': 11_500,
  'lagos::minna': 7_000,
  'lagos::lafia': 8_500,

  // ── Abuja hub (additional state capitals) ─────────────────────────────
  'abuja::ilorin': 5_500,
  'abuja::lokoja': 3_500,
  'abuja::minna': 3_000,
  'abuja::lafia': 3_500,
  'abuja::bauchi': 6_500,
  'abuja::gombe': 7_500,
  'abuja::yola': 10_000,
  'abuja::jalingo': 9_500,
  'abuja::akure': 6_500,
  'abuja::adoekiti': 7_000,
  'abuja::osogbo': 6_000,
  'abuja::awka': 8_000,
  'abuja::asaba': 7_500,
  'abuja::abakaliki': 9_000,
  'abuja::umuahia': 9_500,
  'abuja::uyo': 11_000,
  'abuja::yenagoa': 10_500,
  'abuja::benin': 6_500,
  'abuja::warri': 8_000,
  'abuja::calabar': 12_000,

  // ── Kano hub (additional northern state capitals) ─────────────────────
  'dutse::kano': 3_500,
  'kano::katsina': 4_500,
  'gusau::kano': 6_000,
  'bauchi::kano': 5_500,
  'birninkebbi::kano': 7_000,
  'damaturu::kano': 7_500,
  'gombe::kano': 6_500,
  'kano::yola': 9_500,
  'jalingo::kano': 10_000,

  // ── PH hub (additional southern state capitals) ───────────────────────
  'ph::uyo': 5_500,
  'ph::yenagoa': 5_000,
  'ph::umuahia': 5_500,
  'abakaliki::ph': 8_000,
  'awka::ph': 7_000,
  'asaba::ph': 6_500,

  // ── South-West / Middle Belt cross routes ─────────────────────────────
  'ibadan::ilorin': 3_500,
  'ibadan::osogbo': 2_500,
  'akure::ibadan': 3_000,
  'adoekiti::ibadan': 3_500,
  'akure::osogbo': 2_500,
  'adoekiti::akure': 2_000,
  'benin::ilorin': 5_500,
  'benin::akure': 3_500,
  'asaba::benin': 3_000,
  'awka::enugu': 3_000,
  'abakaliki::enugu': 3_500,
  'enugu::umuahia': 4_000,
  'calabar::uyo': 3_000,
  'umuahia::uyo': 4_500,
  'owerri::umuahia': 2_500,
  'awka::owerri': 3_500,
  'owerri::yenagoa': 5_000,

  // ── North cross routes ────────────────────────────────────────────────
  'bauchi::jos': 3_500,
  'gombe::bauchi': 3_000,
  'maiduguri::damaturu': 3_500,
  'kaduna::minna': 3_500,
  'kaduna::jos': 4_000,
  'katsina::sokoto': 5_500,
  'birninkebbi::sokoto': 3_500,
  'gusau::sokoto': 4_000,
  'gusau::kaduna': 5_500,
  'yola::jalingo': 2_500,
  'yola::gombe': 4_500,
  'lokoja::abuja': 3_500,
  'lafia::jos': 3_500,
  'lokoja::benin': 4_500,
  'minna::ilorin': 5_000,

  // ── Intra-city for new state capitals ─────────────────────────────────
  'ilorin::ilorin': 2_500,
  'akure::akure': 2_500,
  'adoekiti::adoekiti': 2_500,
  'osogbo::osogbo': 2_500,
  'awka::awka': 2_500,
  'umuahia::umuahia': 2_500,
  'uyo::uyo': 2_500,
  'yenagoa::yenagoa': 2_800,
  'asaba::asaba': 2_500,
  'abakaliki::abakaliki': 2_500,
  'lokoja::lokoja': 2_500,
  'lafia::lafia': 2_500,
  'minna::minna': 2_500,
  'bauchi::bauchi': 2_500,
  'gombe::gombe': 2_500,
  'yola::yola': 2_500,
  'jalingo::jalingo': 2_500,
  'dutse::dutse': 2_500,
  'katsina::katsina': 2_500,
  'gusau::gusau': 2_500,
  'birninkebbi::birninkebbi': 2_500,
  'damaturu::damaturu': 2_500,
  'makurdi::makurdi': 2_500,

  // ── Makurdi (Benue) routes ────────────────────────────────────────────
  'abuja::makurdi': 5_000,
  'lagos::makurdi': 9_000,
  'enugu::makurdi': 5_500,
  'jos::makurdi': 5_000,
  'lafia::makurdi': 3_500,
  'lokoja::makurdi': 4_500,
};

/**
 * Resolve a user-supplied city/state string to a canonical key used in
 * NIGERIA_PARCEL_LANES.  Recognises all 36 Nigerian states + FCT and
 * maps state names to their capital city keys.  Returns '' if not matched.
 */
function resolveNigeriaCity(raw: string): string {
  const v = raw.toLowerCase().trim();

  // ── Direct city matches (highest priority) ────────────────────────────
  if (/\blagos\b/.test(v)) return 'lagos';
  if (/\babuja\b/.test(v)) return 'abuja';
  if (/\bkano\b/.test(v)) return 'kano';
  if (/\bport\s*harcourt\b|\bportharcourt\b|\bph\b/.test(v)) return 'ph';
  if (/\babeokuta\b/.test(v)) return 'abeokuta';
  if (/\bibadan\b/.test(v)) return 'ibadan';
  if (/\bbenin\s*city\b/.test(v)) return 'benin';
  if (/\bwarri\b/.test(v)) return 'warri';
  if (/\benugu\b/.test(v)) return 'enugu';
  if (/\bowerri\b/.test(v)) return 'owerri';
  if (/\bcalabar\b/.test(v)) return 'calabar';
  if (/\bkaduna\b/.test(v)) return 'kaduna';
  if (/\bjos\b/.test(v)) return 'jos';
  if (/\bmaiduguri\b/.test(v)) return 'maiduguri';
  if (/\bsokoto\b/.test(v)) return 'sokoto';
  if (/\bilorin\b/.test(v)) return 'ilorin';
  if (/\bakure\b/.test(v)) return 'akure';
  if (/\bado[\s-]*ekiti\b/.test(v)) return 'adoekiti';
  if (/\bosogbo\b|\boshogbo\b/.test(v)) return 'osogbo';
  if (/\babakaliki\b/.test(v)) return 'abakaliki';
  if (/\bumuahia\b/.test(v)) return 'umuahia';
  if (/\buyo\b/.test(v)) return 'uyo';
  if (/\byenagoa\b/.test(v)) return 'yenagoa';
  if (/\basaba\b/.test(v)) return 'asaba';
  if (/\bawka\b/.test(v)) return 'awka';
  if (/\blafia\b/.test(v)) return 'lafia';
  if (/\blokoja\b/.test(v)) return 'lokoja';
  if (/\bminna\b/.test(v)) return 'minna';
  if (/\bbirnin[\s-]*kebbi\b|\bkebbi\b/.test(v)) return 'birninkebbi';
  if (/\bgusau\b/.test(v)) return 'gusau';
  if (/\bkatsina\b/.test(v)) return 'katsina';
  if (/\bdamaturu\b/.test(v)) return 'damaturu';
  if (/\bbauchi\b/.test(v)) return 'bauchi';
  if (/\bgombe\b/.test(v)) return 'gombe';
  if (/\bjalingo\b/.test(v)) return 'jalingo';
  if (/\byola\b/.test(v)) return 'yola';
  if (/\bdutse\b/.test(v)) return 'dutse';

  // ── State-name fallbacks → state capital ──────────────────────────────
  // (checked after city names so "Benin City" doesn't match "Benue State")
  if (/\bogun\b/.test(v)) return 'abeokuta';
  if (/\boyo\b/.test(v)) return 'ibadan';
  if (/\bedo\b/.test(v)) return 'benin';
  if (/\bdelta\b/.test(v)) return 'asaba';
  if (/\brivers\b/.test(v)) return 'ph';
  if (/\bimo\b/.test(v)) return 'owerri';
  if (/\bcross\s*river\b/.test(v)) return 'calabar';
  if (/\bplateau\b/.test(v)) return 'jos';
  if (/\bborno\b/.test(v)) return 'maiduguri';
  if (/\bkwara\b/.test(v)) return 'ilorin';
  if (/\bondo\b/.test(v)) return 'akure';
  if (/\bekiti\b/.test(v)) return 'adoekiti';
  if (/\bosun\b/.test(v)) return 'osogbo';
  if (/\banambra\b/.test(v)) return 'awka';
  if (/\babia\b/.test(v)) return 'umuahia';
  if (/\bebonyi\b/.test(v)) return 'abakaliki';
  if (/\bakwa\s*ibom\b/.test(v)) return 'uyo';
  if (/\bbayelsa\b/.test(v)) return 'yenagoa';
  if (/\bnasarawa\b|\bnassarawa\b/.test(v)) return 'lafia';
  if (/\bkogi\b/.test(v)) return 'lokoja';
  if (/\bniger\b/.test(v)) return 'minna';
  if (/\bbenin\b/.test(v)) return 'benin'; // catch-all for "Benin" without "City"
  if (/\bkebbi\b/.test(v)) return 'birninkebbi';
  if (/\bzamfara\b/.test(v)) return 'gusau';
  if (/\byobe\b/.test(v)) return 'damaturu';
  if (/\btaraba\b/.test(v)) return 'jalingo';
  if (/\badamawa\b/.test(v)) return 'yola';
  if (/\bjigawa\b/.test(v)) return 'dutse';
  if (/\bfct\b|\bfederal\s*capital\b/.test(v)) return 'abuja';
  if (/\bmakurdi\b/.test(v)) return 'makurdi';
  if (/\bbenue\b/.test(v)) return 'makurdi';

  return '';
}

/** Look up a bilateral lane rate (order-insensitive). */
function nigeriaLaneBaseNgn(
  originCity: string,
  destCity: string,
): number | null {
  const a = originCity;
  const b = destCity;

  // Try both orderings
  const key1 = `${a}::${b}`;
  const key2 = `${b}::${a}`;

  if (NIGERIA_PARCEL_LANES[key1] !== undefined)
    return NIGERIA_PARCEL_LANES[key1];
  if (NIGERIA_PARCEL_LANES[key2] !== undefined)
    return NIGERIA_PARCEL_LANES[key2];

  return null;
}

// ---------------------------------------------------------------------------
// Ocean freight base rates (USD) by origin region → Nigeria, 2026 estimates
// ---------------------------------------------------------------------------
const OCEAN_BASE_USD: Record<
  Region,
  { '20ft': number; '40ft': number; '40hc': number }
> = {
  europe: { '20ft': 1_500, '40ft': 2_300, '40hc': 2_500 },
  usa: { '20ft': 2_500, '40ft': 4_000, '40hc': 4_300 },
  asia: { '20ft': 2_000, '40ft': 3_200, '40hc': 3_500 },
  middleeast: { '20ft': 1_800, '40ft': 2_900, '40hc': 3_100 },
  africa: { '20ft': 1_200, '40ft': 1_900, '40hc': 2_100 },
  nigeria: { '20ft': 900, '40ft': 1_400, '40hc': 1_550 }, // coastal/cabotage
  unknown: { '20ft': 2_150, '40ft': 3_300, '40hc': 3_600 },
};

// ---------------------------------------------------------------------------
// Air freight rates (USD / chargeable kg) by origin region, 2026 estimates
// ---------------------------------------------------------------------------
const AIR_RATE_USD_PER_KG: Record<
  Region,
  { standard: number; express: number }
> = {
  europe: { standard: 4.75, express: 8.5 },
  usa: { standard: 6.5, express: 11.5 },
  asia: { standard: 5.25, express: 9.5 },
  middleeast: { standard: 4.5, express: 8.0 },
  africa: { standard: 3.75, express: 7.0 },
  nigeria: { standard: 3.5, express: 6.5 }, // domestic air
  unknown: { standard: 5.75, express: 10.0 },
};

@Injectable()
export class ManualRateEngineService {
  private readonly logger = new Logger(ManualRateEngineService.name);

  private readonly volumeDivisorParcel = 5000;
  private readonly volumeDivisorAir = 6000;

  async estimate(dto: ManualQuoteRequestDto): Promise<ManualQuoteResponseDto> {
    const fromFreeText = dto.freeText ? this.extractFromText(dto.freeText) : {};
    const req: ManualQuoteRequestDto = {
      ...fromFreeText,
      ...dto,
      dimensionsCm: dto.dimensionsCm ?? fromFreeText.dimensionsCm,
      origin:
        (dto.origin ?? fromFreeText.origin ?? '').toString().trim() ||
        undefined,
      destination:
        (dto.destination ?? fromFreeText.destination ?? '').toString().trim() ||
        undefined,
      freeText: (dto.freeText ?? '').toString().trim() || undefined,
    };

    const missing: string[] = [];

    const mode = req.mode ?? this.detectMode(req.freeText ?? '');
    req.mode = mode ?? undefined;
    if (!mode) missing.push('mode');

    if (!req.origin) missing.push('origin');
    if (!req.destination) missing.push('destination');

    // Reject same-location requests early
    if (
      req.origin &&
      req.destination &&
      req.origin.toLowerCase().trim() === req.destination.toLowerCase().trim()
    ) {
      return {
        status: 'error',
        message:
          'Origin and destination cannot be the same location. Please provide different addresses.',
      };
    }

    if (mode === 'parcel' || mode === 'air') {
      const w = Number(req.weightKg);
      if (!Number.isFinite(w) || w <= 0) missing.push('weightKg');
    }

    if (mode === 'ocean') {
      if (!req.containerType) missing.push('containerType');
    }

    const resolutionAssumptions: string[] = [];
    if (mode === 'ground') {
      const km = Number(req.distanceKm);
      if (!Number.isFinite(km) || km <= 0) {
        const key = this.distanceCacheKey(req.origin, req.destination);
        const now = Date.now();
        const cached = distanceCache.get(key);

        if (cached && cached.expires > now) {
          req.distanceKm = cached.distanceKm;
          resolutionAssumptions.push(
            `Distance source: cache (${round2(cached.distanceKm)} km)`,
          );
        } else {
          if (cached) distanceCache.delete(key);
          const resolved = await this.resolveDistanceKm(req);
          if (resolved?.distanceKm) {
            req.distanceKm = resolved.distanceKm;
            distanceCache.set(key, {
              distanceKm: resolved.distanceKm,
              durationHours: resolved.durationHours,
              expires: now + 24 * 60 * 60 * 1000,
            });
            resolutionAssumptions.push(
              `Distance source: ${resolved.source} (${round2(resolved.distanceKm)} km)`,
            );
            if (Number.isFinite(resolved.durationHours)) {
              resolutionAssumptions.push(
                `Drive time (estimate): ${round2(resolved.durationHours)} hours`,
              );
            }
          }
        }
      }

      const finalKm = Number(req.distanceKm);
      if (!Number.isFinite(finalKm) || finalKm <= 0) missing.push('distanceKm');
    }

    if (missing.length) {
      return {
        status: 'needs_clarification',
        missingFields: Array.from(new Set(missing)),
        message: 'Missing fields for manual quote',
      };
    }

    try {
      return {
        status: 'ok',
        message:
          'Estimate only. Please send in a Quote request to get a real quote estimation (live pricing and availability).',
        quote: this.calculate(mode!, req, resolutionAssumptions),
      };
    } catch (e: any) {
      this.logger.error('Manual estimate failed', e?.stack || e);
      return {
        status: 'error',
        message: e?.message || 'Manual estimate failed',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // calculate
  // ─────────────────────────────────────────────────────────────────────────

  private calculate(
    mode: ManualMode,
    req: ManualQuoteRequestDto,
    resolutionAssumptions: string[] = [],
  ) {
    const assumptions: string[] = [...resolutionAssumptions];
    assumptions.push(
      'Estimate only — send in a Quote request for real quote estimation (live pricing and availability).',
    );

    const fxUsdToNgn = this.envNumber('MANUAL_USD_TO_NGN', 1_550);
    assumptions.push(`FX used: 1 USD = ₦${fxUsdToNgn}`);

    const inflation2026 = this.envNumber('MANUAL_QUOTES_INFLATION_2026', 1.03);

    const marketMultiplierByMode: Record<ManualMode, number> = {
      parcel: this.envNumber('MANUAL_QUOTES_MARKET_MULT_PARCEL', 1.06),
      ocean: this.envNumber('MANUAL_QUOTES_MARKET_MULT_OCEAN', 0.88),
      air: this.envNumber('MANUAL_QUOTES_MARKET_MULT_AIR', 1.03),
      ground: this.envNumber('MANUAL_QUOTES_MARKET_MULT_GROUND', 1.02),
    };

    const multiplier = inflation2026 * marketMultiplierByMode[mode];

    let base = 0;
    let sur = 0;

    // ── PARCEL ──────────────────────────────────────────────────────────────
    if (mode === 'parcel') {
      const oNig = this.isNigeria(req.origin);
      const dNig = this.isNigeria(req.destination);
      const weightKg = Number(req.weightKg);

      if (oNig && dNig) {
        assumptions.push('Domestic Nigeria parcel averages (2026)');

        const oCity = resolveNigeriaCity(String(req.origin ?? ''));
        const dCity = resolveNigeriaCity(String(req.destination ?? ''));

        let baseNgn = 0;
        const laneRate = nigeriaLaneBaseNgn(oCity, dCity);

        if (laneRate !== null) {
          baseNgn = laneRate;
          assumptions.push(
            `Lane: ${oCity || req.origin} ↔ ${dCity || req.destination} (₦${laneRate.toLocaleString()} base)`,
          );
        } else {
          // Fallback: rough distance-based heuristic within Nigeria
          baseNgn = 15_000;
          assumptions.push(
            `Lane: unmapped Nigeria route — long-distance fallback used`,
          );
        }

        // Use chargeable weight (actual vs volumetric)
        const volKgParcel = this.calculateVolumetricKg(
          req,
          this.volumeDivisorParcel,
        );
        const chargeableKg = Math.max(
          weightKg,
          Number.isFinite(volKgParcel) ? volKgParcel : 0,
        );
        if (Number.isFinite(volKgParcel) && volKgParcel > weightKg) {
          assumptions.push(
            `Volumetric weight used: ${round2(volKgParcel)} kg (actual ${weightKg} kg, divisor ${this.volumeDivisorParcel})`,
          );
        }

        // Weight tiers (incremental, not stepped)
        let wtFactor = 1.0;
        if (chargeableKg > 30) wtFactor = 3.5;
        else if (chargeableKg > 20) wtFactor = 2.8;
        else if (chargeableKg > 10) wtFactor = 2.0;
        else if (chargeableKg > 5) wtFactor = 1.5;
        else if (chargeableKg > 1) wtFactor = 1.2;
        assumptions.push(
          `Weight factor applied: ×${wtFactor} for ${round2(chargeableKg)} kg (chargeable)`,
        );

        baseNgn *= wtFactor;

        const surPct = this.envNumber(
          'MANUAL_PARCEL_DOMESTIC_SURCHARGE_PCT',
          0.15,
        );
        const surchargeNgn = baseNgn * surPct;

        base = baseNgn * multiplier;
        sur = surchargeNgn * multiplier;
      } else {
        // International parcel
        assumptions.push('International express parcel averages (2026)');

        const originRegion = this.detectRegion(req.origin);
        const destRegion = this.detectRegion(req.destination);
        assumptions.push(
          `Origin region: ${originRegion} | Destination region: ${destRegion}`,
        );

        // Use chargeable weight (actual vs volumetric)
        const volKgIntl = this.calculateVolumetricKg(
          req,
          this.volumeDivisorParcel,
        );
        const chargeableKgIntl = Math.max(
          weightKg,
          Number.isFinite(volKgIntl) ? volKgIntl : 0,
        );
        if (Number.isFinite(volKgIntl) && volKgIntl > weightKg) {
          assumptions.push(
            `Volumetric weight used: ${round2(volKgIntl)} kg (actual ${weightKg} kg, divisor ${this.volumeDivisorParcel})`,
          );
        }

        // Base rate in USD by weight bracket (using chargeable weight)
        let baseUsd = 0;
        if (chargeableKgIntl <= 0.5) baseUsd = 35;
        else if (chargeableKgIntl <= 1) baseUsd = 50;
        else if (chargeableKgIntl <= 5) baseUsd = 65;
        else if (chargeableKgIntl <= 10) baseUsd = 115;
        else if (chargeableKgIntl <= 30) baseUsd = 215;
        else baseUsd = 350;

        // Regional adjustment multiplier on the base
        const regionalAdj: Partial<Record<Region, number>> = {
          usa: 1.3,
          europe: 1.0,
          asia: 1.1,
          middleeast: 1.05,
          africa: 0.9,
          nigeria: 0.8,
        };
        const adjFactor = regionalAdj[originRegion] ?? 1.0;
        baseUsd = round2(baseUsd * adjFactor);
        assumptions.push(
          `Rate bracket base: $${baseUsd} USD (regional adj ×${adjFactor})`,
        );

        const surchargeUsd =
          baseUsd * this.envNumber('MANUAL_PARCEL_SURCHARGE_PCT', 0.25);

        base = baseUsd * fxUsdToNgn * multiplier;
        sur = surchargeUsd * fxUsdToNgn * multiplier;
      }
    }

    // ── OCEAN ────────────────────────────────────────────────────────────────
    if (mode === 'ocean') {
      assumptions.push(
        'Ocean container averages (2026), includes basic surcharges',
      );

      const containerType = (req.containerType ||
        '40ft') as ManualContainerType;
      const originRegion = this.detectRegion(req.origin);
      const destRegion = this.detectRegion(req.destination);

      assumptions.push(
        `Origin region: ${originRegion} | Destination region: ${destRegion} | Container: ${containerType}`,
      );

      // FIX: look up base rate from the full region table instead of only checking isFromEurope
      const rates = OCEAN_BASE_USD[originRegion] ?? OCEAN_BASE_USD['unknown'];
      let baseUsd = rates[containerType];

      // If destination is NOT Nigeria, apply a modest premium (re-export / non-standard port)
      const isToNigeria = this.isNigeria(req.destination);
      if (!isToNigeria) {
        baseUsd = round2(baseUsd * 1.15);
        assumptions.push('Non-Nigeria destination: +15% applied');
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
      const bafCaf = round2(baseUsd * bafCafPct);

      const ddDays = Number(req.detentionDemurrageDays || 0);
      const ddPerDay = this.envNumber(
        'MANUAL_OCEAN_DEMURRAGE_USD_PER_DAY',
        200,
      );
      const dd = ddDays > 0 ? ddDays * ddPerDay : 0;
      if (ddDays > 0)
        assumptions.push(`Includes detention/demurrage for ${ddDays} days`);

      const surchargeUsd = portCongestion + documentation + bafCaf + dd;
      assumptions.push(
        `Container ${containerType}, baseUSD=${baseUsd}, BAF/CAF=${bafCaf}, congestion=${portCongestion}, docs=${documentation}`,
      );

      base = baseUsd * fxUsdToNgn * multiplier;
      sur = surchargeUsd * fxUsdToNgn * multiplier;
    }

    // ── AIR ──────────────────────────────────────────────────────────────────
    if (mode === 'air') {
      assumptions.push('Air freight averages (2026) using chargeable weight');

      const originRegion = this.detectRegion(req.origin);
      const destRegion = this.detectRegion(req.destination);
      const isExpress = Boolean(req.isExpress);

      assumptions.push(
        `Origin region: ${originRegion} | Destination region: ${destRegion}${isExpress ? ' | Express' : ''}`,
      );

      const weightKg = Number(req.weightKg);
      const volumetricKg = this.calculateVolumetricKg(
        req,
        this.volumeDivisorAir,
      );

      if (Number.isFinite(volumetricKg)) {
        assumptions.push(
          `Volumetric divisor: (L×W×H cm)/${this.volumeDivisorAir}`,
        );
      }

      let chargeable = Math.max(
        weightKg,
        Number.isFinite(volumetricKg) ? volumetricKg : 0,
      );

      const minChargeable = this.envNumber('MANUAL_AIR_MIN_CHARGEABLE_KG', 45);
      if (chargeable < minChargeable) {
        assumptions.push(
          `Minimum chargeable weight applied: ${minChargeable} kg`,
        );
        chargeable = minChargeable;
      }

      // FIX: look up rate from the full region table
      const airRates =
        AIR_RATE_USD_PER_KG[originRegion] ?? AIR_RATE_USD_PER_KG['unknown'];
      const ratePerKgUsd = isExpress ? airRates.express : airRates.standard;
      assumptions.push(
        `Rate used: $${ratePerKgUsd}/kg (USD, ${originRegion}, ${isExpress ? 'express' : 'standard'})`,
      );

      const baseUsd = chargeable * ratePerKgUsd;
      const surchargePct = this.envNumber('MANUAL_AIR_SURCHARGE_PCT', 0.15);
      const surchargeUsd = baseUsd * surchargePct;

      base = baseUsd * fxUsdToNgn * multiplier;
      sur = surchargeUsd * fxUsdToNgn * multiplier;

      return {
        provider: 'manual-rate-engine' as const,
        mode,
        origin: req.origin,
        destination: req.destination,
        chargeableWeightKg: round2(chargeable),
        breakdown: this.finalizeBreakdown(mode, base, sur, assumptions),
      };
    }

    // ── GROUND ───────────────────────────────────────────────────────────────
    if (mode === 'ground') {
      const oCity = resolveNigeriaCity(String(req.origin ?? ''));
      const dCity = resolveNigeriaCity(String(req.destination ?? ''));

      // Determine if this is an intra-city / short-haul vs inter-city run
      const km = Number(req.distanceKm);

      let perKm: number;
      if (oCity && oCity === dCity) {
        // Intra-city — flat rate city-specific rates
        const intraCityRateNgn: Partial<Record<string, number>> = {
          lagos: 350,
          abuja: 300,
          kano: 280,
          ph: 300,
        };
        perKm =
          intraCityRateNgn[oCity] ??
          this.envNumber('MANUAL_GROUND_NGN_PER_KM', 250);
        assumptions.push(
          `Nigeria intra-city trucking (${oCity}): ₦${perKm}/km`,
        );
      } else {
        // Inter-city — tiered by distance
        if (km <= 100) perKm = 350;
        else if (km <= 300) perKm = 300;
        else if (km <= 600) perKm = 260;
        else perKm = 230;
        assumptions.push(
          `Nigeria inter-city trucking (${round2(km)} km): ₦${perKm}/km (distance-tiered)`,
        );
      }

      assumptions.push('Nigeria domestic trucking averages (2026)');

      const baseNgn = km * perKm;
      const surchargePct = this.envNumber('MANUAL_GROUND_SURCHARGE_PCT', 0.1);
      const surchargeNgn = baseNgn * surchargePct;

      base = baseNgn * multiplier;
      sur = surchargeNgn * multiplier;

      assumptions.push(`Distance: ${round2(km)} km`);
    }

    return {
      provider: 'manual-rate-engine' as const,
      mode,
      origin: req.origin,
      destination: req.destination,
      breakdown: this.finalizeBreakdown(mode, base, sur, assumptions),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private finalizeBreakdown(
    mode: ManualMode,
    base: number,
    sur: number,
    assumptions: string[],
  ) {
    const marginPctByMode: Record<ManualMode, number> = {
      parcel: this.envNumber('MANUAL_QUOTES_MARGIN_PARCEL', 0.275),
      ocean: this.envNumber('MANUAL_QUOTES_MARGIN_OCEAN', 0.2),
      air: this.envNumber('MANUAL_QUOTES_MARGIN_AIR', 0.25),
      ground: this.envNumber('MANUAL_QUOTES_MARGIN_GROUND', 0.4),
    };

    const subtotal = base + sur;
    const margin = subtotal * marginPctByMode[mode];
    const total = subtotal + margin;

    return {
      base: money(base, 'NGN'),
      surcharges: money(sur, 'NGN'),
      margin: money(margin, 'NGN'),
      total: money(total, 'NGN'),
      assumptions,
    };
  }

  private calculateVolumetricKg(
    req: ManualQuoteRequestDto,
    divisor: number,
  ): number {
    if (req.volumeCbm && Number.isFinite(Number(req.volumeCbm))) {
      return (Number(req.volumeCbm) * 1_000_000) / divisor;
    }
    const d = req.dimensionsCm;
    if (!d) return NaN;
    const l = Number(d.length);
    const w = Number(d.width);
    const h = Number(d.height);
    if (![l, w, h].every((v) => Number.isFinite(v) && v > 0)) return NaN;
    return (l * w * h) / divisor;
  }

  private extractFromText(freeText: string): Partial<ManualQuoteRequestDto> {
    const lowered = String(freeText || '').toLowerCase();
    const out: Partial<ManualQuoteRequestDto> = { freeText };

    out.mode = this.detectMode(lowered) ?? undefined;

    const fromTo = lowered.match(
      /\bfrom\b\s+([^\n]+?)\s+\bto\b\s+([^\n,.]+?)(?:(?:\s+\d+(?:\.\d+)?\s*(?:kg|km)\b)|\bby\b|\bvia\b|\.|,|$)/i,
    );
    if (fromTo) {
      out.origin = this.cleanPlace(fromTo[1]);
      out.destination = this.cleanPlace(fromTo[2]);
    }

    const weightMatch = lowered.match(/\b(\d+(?:\.\d+)?)\s*kg\b/i);
    if (weightMatch) out.weightKg = Number(weightMatch[1]);

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

    const kmMatch = lowered.match(/\b(\d+(?:\.\d+)?)\s*km\b/i);
    if (kmMatch) out.distanceKm = Number(kmMatch[1]);

    if (/\b20\s*(ft|feet)\b|\b20ft\b/i.test(lowered))
      out.containerType = '20ft';
    if (/\b40\s*hc\b|\b40hc\b|\b40\s*high\s*cube\b/i.test(lowered))
      out.containerType = '40hc';
    else if (/\b40\s*(ft|feet)\b|\b40ft\b/i.test(lowered))
      out.containerType = '40ft';

    if (/\bexpress\b|\bdhl\b|\bfedex\b|\bups\b/i.test(lowered))
      out.isExpress = true;

    const ddMatch = lowered.match(
      /\b(\d+)\s*(day|days)\b.*\b(demurrage|detention)\b/i,
    );
    if (ddMatch) out.detentionDemurrageDays = Number(ddMatch[1]);

    return out;
  }

  private cleanPlace(value?: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
      .replace(/\s+\d+(?:\.\d+)?\s*(kg|km)\b.*$/i, '')
      .replace(/\s+by\s+.*$/i, '')
      .replace(/\s+via\s+.*$/i, '')
      .trim();
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
      /\b(lagos|abuja|kano|ogun|abeokuta|port\s*harcourt|portharcourt|\bph\b|apapa|tin\s*can|ibadan|benin\s*city|warri|enugu|owerri|calabar|kaduna|jos|maiduguri|sokoto|zaria|ilorin|ado[\s-]*ekiti|akure|osogbo|oshogbo|abakaliki|umuahia|uyo|yenagoa|asaba|awka|lafia|lokoja|minna|birnin[\s-]*kebbi|gusau|katsina|damaturu|bauchi|gombe|jalingo|yola|dutse|oyo|edo|delta|rivers|imo|cross\s*river|plateau|borno|kwara|ondo|ekiti|osun|anambra|abia|ebonyi|akwa\s*ibom|bayelsa|nasarawa|nassarawa|kogi|niger|kebbi|zamfara|yobe|taraba|adamawa|jigawa|fct|benue|makurdi)\b/i.test(
        v,
      )
    );
  }

  /**
   * FIX: Extended region detection — now includes Africa, Middle East,
   * and more cities/countries so fewer routes fall through to 'unknown'.
   */
  private detectRegion(value?: string): Region {
    const v = String(value || '').toLowerCase();
    if (!v) return 'unknown';

    if (this.isNigeria(v)) return 'nigeria';

    if (
      /\b(africa|ghana|kenya|ethiopia|south africa|johannesburg|cairo|egypt|morocco|tanzania|uganda|senegal|ivory coast|cameroon|accra|nairobi|addis ababa|dakar|abidjan|douala)\b/.test(
        v,
      )
    )
      return 'africa';

    if (
      /\b(china|shanghai|shenzhen|guangzhou|hong kong|singapore|vietnam|asia|japan|tokyo|osaka|seoul|korea|taiwan|taipei|bangkok|thailand|malaysia|kuala lumpur|indonesia|jakarta|philippines|manila|india|mumbai|delhi|chennai)\b/.test(
        v,
      )
    )
      return 'asia';

    if (
      /\b(middle east|uae|dubai|abu dhabi|saudi|riyadh|jeddah|kuwait|qatar|doha|bahrain|oman|muscat|jordan|amman|beirut|lebanon|israel|tel aviv)\b/.test(
        v,
      )
    )
      return 'middleeast';

    if (
      /\b(europe|uk|united kingdom|london|germany|berlin|france|paris|netherlands|amsterdam|belgium|brussels|spain|madrid|italy|rome|poland|warsaw|sweden|stockholm|norway|oslo|denmark|copenhagen|switzerland|zurich|austria|vienna|portugal|lisbon|ireland|dublin)\b/.test(
        v,
      )
    )
      return 'europe';

    if (
      /\b(usa|u\.s\.|united states|america|new york|los angeles|lax|jfk|chicago|houston|dallas|miami|atlanta|seattle|san francisco|boston|canada|toronto|vancouver|montreal|mexico|mexico city)\b/.test(
        v,
      )
    )
      return 'usa';

    return 'unknown';
  }

  private distanceCacheKey(origin?: string, destination?: string): string {
    return `${String(origin || '')
      .trim()
      .toLowerCase()}|${String(destination || '')
      .trim()
      .toLowerCase()}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LocationIQ + OpenRoute + Haversine distance resolution (unchanged)
  // ─────────────────────────────────────────────────────────────────────────

  private async resolveDistanceKm(req: ManualQuoteRequestDto): Promise<{
    distanceKm: number;
    durationHours: number;
    source: 'locationiq' | 'openroute' | 'haversine' | 'heuristic';
  } | null> {
    let start: LatLng | null =
      req.start ?? this.resolveNigeriaCoords(req.origin);
    let end: LatLng | null =
      req.end ?? this.resolveNigeriaCoords(req.destination);

    if (!start && req.origin)
      start = await this.getCoordsLocationIq(req.origin);
    if (!end && req.destination)
      end = await this.getCoordsLocationIq(req.destination);

    if (start && end) {
      const liq = await this.getDistanceLocationIq(start, end);
      if (liq) return { ...liq, source: 'locationiq' };

      const openRoute = await this.getDistanceOpenRoute(start, end);
      if (openRoute) return { ...openRoute, source: 'openroute' };

      const gcKm = haversineKm(start, end);
      if (Number.isFinite(gcKm) && gcKm > 0) {
        return { distanceKm: gcKm, durationHours: NaN, source: 'haversine' };
      }
    }

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

  private resolveNigeriaCoords(value?: string): LatLng | null {
    const v = String(value || '').toLowerCase();
    if (!v) return null;

    const known: Array<{ key: RegExp; lat: number; lng: number }> = [
      // ── Original cities ───────────────────────────────────────────────
      { key: /\blagos\b/i, lat: 6.5244, lng: 3.3792 },
      { key: /\babuja\b|\bfct\b|\bfederal\s*capital\b/i, lat: 9.0765, lng: 7.4951 },
      { key: /\bkano\b/i, lat: 12.0022, lng: 8.592 },
      { key: /\babeokuta\b|\bogun\b/i, lat: 7.1452, lng: 3.3619 },
      { key: /\bport\s*harcourt\b|\bportharcourt\b|\bph\b|\brivers\b/i, lat: 4.8156, lng: 7.0498 },
      { key: /\bibadan\b|\boyo\b/i, lat: 7.3775, lng: 3.947 },
      { key: /\benugu\b/i, lat: 6.4584, lng: 7.5464 },
      { key: /\bwarri\b/i, lat: 5.5167, lng: 5.75 },
      { key: /\bcalabar\b|\bcross\s*river\b/i, lat: 4.9517, lng: 8.322 },
      { key: /\bkaduna\b/i, lat: 10.5105, lng: 7.4165 },
      { key: /\bjos\b|\bplateau\b/i, lat: 9.8965, lng: 8.8583 },
      { key: /\bowerri\b|\bimo\b/i, lat: 5.4836, lng: 7.0333 },
      { key: /\bbenin\b|\bedo\b/i, lat: 6.335, lng: 5.627 },
      // ── Additional state capitals ─────────────────────────────────────
      { key: /\bilorin\b|\bkwara\b/i, lat: 8.4966, lng: 4.5426 },
      { key: /\bakure\b|\bondo\b/i, lat: 7.2526, lng: 5.2103 },
      { key: /\bado[\s-]*ekiti\b|\bekiti\b/i, lat: 7.6211, lng: 5.2215 },
      { key: /\bosogbo\b|\boshogbo\b|\bosun\b/i, lat: 7.7827, lng: 4.5418 },
      { key: /\bawka\b|\banambra\b/i, lat: 6.2109, lng: 7.0674 },
      { key: /\bumuahia\b|\babia\b/i, lat: 5.5244, lng: 7.4905 },
      { key: /\babakaliki\b|\bebonyi\b/i, lat: 6.3249, lng: 8.1137 },
      { key: /\buyo\b|\bakwa\s*ibom\b/i, lat: 5.0377, lng: 7.9128 },
      { key: /\byenagoa\b|\bbayelsa\b/i, lat: 4.9247, lng: 6.2642 },
      { key: /\basaba\b|\bdelta\b/i, lat: 6.1981, lng: 6.7339 },
      { key: /\blokoja\b|\bkogi\b/i, lat: 7.7969, lng: 6.7409 },
      { key: /\blafia\b|\bnasarawa\b|\bnassarawa\b/i, lat: 8.4966, lng: 8.5157 },
      { key: /\bminna\b|\bniger\b/i, lat: 9.6139, lng: 6.5569 },
      { key: /\bbauchi\b/i, lat: 10.3158, lng: 9.8442 },
      { key: /\bgombe\b/i, lat: 10.2897, lng: 11.1711 },
      { key: /\byola\b|\badamawa\b/i, lat: 9.2035, lng: 12.4954 },
      { key: /\bjalingo\b|\btaraba\b/i, lat: 8.8935, lng: 11.3596 },
      { key: /\bmaiduguri\b|\bborno\b/i, lat: 11.8311, lng: 13.151 },
      { key: /\bsokoto\b/i, lat: 13.0607, lng: 5.2476 },
      { key: /\bkatsina\b/i, lat: 13.0059, lng: 7.6006 },
      { key: /\bgusau\b|\bzamfara\b/i, lat: 12.1704, lng: 6.6611 },
      { key: /\bbirnin[\s-]*kebbi\b|\bkebbi\b/i, lat: 12.454, lng: 4.199 },
      { key: /\bdamaturu\b|\byobe\b/i, lat: 11.747, lng: 11.9608 },
      { key: /\bdutse\b|\bjigawa\b/i, lat: 11.7562, lng: 9.3389 },
      { key: /\bmakurdi\b|\bbenue\b/i, lat: 7.7338, lng: 8.5214 },
    ];

    const hit = known.find((k) => k.key.test(v));
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  }

  private inferDistanceKm(
    origin?: string,
    destination?: string,
  ): number | null {
    const o = resolveNigeriaCity(String(origin ?? ''));
    const d = resolveNigeriaCity(String(destination ?? ''));
    if (!o || !d) return null;

    const key = `${o}::${d}`;
    const rev = `${d}::${o}`;

    const known: Record<string, number> = {
      'lagos::abuja': 760,
      'lagos::kano': 1000,
      'lagos::ph': 600,
      'lagos::abeokuta': 90,
      'lagos::ibadan': 130,
      'lagos::benin': 320,
      'lagos::warri': 430,
      'lagos::enugu': 550,
      'lagos::owerri': 510,
      'lagos::calabar': 680,
      'abuja::kano': 320,
      'abuja::ph': 580,
      'abuja::enugu': 430,
      'abuja::kaduna': 190,
      'abuja::jos': 330,
      'abuja::owerri': 540,
      'ph::benin': 220,
      'ph::enugu': 290,
      'ph::warri': 200,
      'ph::calabar': 260,
      'kaduna::kano': 195,
      'jos::kano': 280,
      'kano::maiduguri': 650,
      'kano::sokoto': 530,

      // Additional state-capital distances (road km, approximate)
      'lagos::ilorin': 300,
      'lagos::akure': 310,
      'lagos::adoekiti': 340,
      'lagos::osogbo': 250,
      'lagos::lokoja': 500,
      'lagos::asaba': 490,
      'lagos::awka': 530,
      'lagos::umuahia': 570,
      'lagos::abakaliki': 620,
      'lagos::uyo': 680,
      'lagos::yenagoa': 560,
      'lagos::minna': 540,
      'lagos::lafia': 700,
      'lagos::makurdi': 750,

      'abuja::ilorin': 350,
      'abuja::lokoja': 200,
      'abuja::minna': 150,
      'abuja::lafia': 180,
      'abuja::bauchi': 350,
      'abuja::gombe': 500,
      'abuja::yola': 700,
      'abuja::jalingo': 650,
      'abuja::akure': 400,
      'abuja::adoekiti': 430,
      'abuja::osogbo': 380,
      'abuja::awka': 420,
      'abuja::asaba': 400,
      'abuja::abakaliki': 480,
      'abuja::umuahia': 500,
      'abuja::uyo': 620,
      'abuja::yenagoa': 560,
      'abuja::benin': 380,
      'abuja::warri': 450,
      'abuja::calabar': 700,
      'abuja::makurdi': 300,

      'kano::dutse': 90,
      'kano::katsina': 190,
      'kano::gusau': 300,
      'kano::bauchi': 240,
      'kano::birninkebbi': 400,
      'kano::damaturu': 350,
      'kano::gombe': 380,
      'kano::yola': 600,
      'kano::jalingo': 620,

      'ph::uyo': 180,
      'ph::yenagoa': 130,
      'ph::umuahia': 170,
      'ph::abakaliki': 290,
      'ph::awka': 230,
      'ph::asaba': 200,

      'ibadan::ilorin': 180,
      'ibadan::osogbo': 90,
      'ibadan::akure': 180,
      'ibadan::adoekiti': 200,
      'benin::akure': 190,
      'benin::asaba': 100,
      'enugu::awka': 90,
      'enugu::abakaliki': 110,
      'enugu::umuahia': 150,
      'enugu::makurdi': 280,
      'calabar::uyo': 80,
      'umuahia::uyo': 170,
      'owerri::umuahia': 75,
      'bauchi::jos': 130,
      'gombe::bauchi': 150,
      'kaduna::minna': 170,
      'kaduna::jos': 200,
      'yola::jalingo': 100,
      'yola::gombe': 250,
      'lokoja::benin': 260,
      'minna::ilorin': 290,
      'lafia::jos': 130,
      'lafia::makurdi': 150,
      'lokoja::makurdi': 220,
      'jos::makurdi': 250,
    };

    return known[key] ?? known[rev] ?? null;
  }

  private async getCoordsLocationIq(query: string): Promise<LatLng | null> {
    const apiKey = String(
      process.env.LOCATIONIQ_API_KEY || process.env.LOCATIONIQ_KEY || '',
    ).trim();
    if (!apiKey) return null;

    const url =
      process.env.LOCATIONIQ_GEOCODE_URL ||
      'https://us1.locationiq.com/v1/search';
    const timeoutMs = this.envNumber('LOCATIONIQ_TIMEOUT_MS', 8_000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const u = new URL(url);
      u.searchParams.set('key', apiKey);
      u.searchParams.set('q', query);
      u.searchParams.set('format', 'json');
      u.searchParams.set('limit', '1');

      const resp = await fetch(u.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!resp.ok) return null;
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
    const timeoutMs = this.envNumber('LOCATIONIQ_TIMEOUT_MS', 8_000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const u = new URL(url);
      u.searchParams.set('key', apiKey);
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

      if (!resp.ok) return null;
      const json: any = await resp.json();
      const route0 = json?.routes?.[0];
      const distMeters = Number(route0?.distance);
      const durSeconds = Number(route0?.duration);
      if (!Number.isFinite(distMeters) || distMeters <= 0) return null;

      return {
        distanceKm: distMeters / 1_000,
        durationHours:
          Number.isFinite(durSeconds) && durSeconds > 0
            ? durSeconds / 3_600
            : NaN,
      };
    } catch (e: any) {
      this.logger.warn('LocationIQ directions error', e?.message || e);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getDistanceOpenRoute(
    start: LatLng,
    end: LatLng,
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
    const timeoutMs = this.envNumber('OPENROUTE_TIMEOUT_MS', 8_000);

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

      if (!resp.ok) return null;
      const json: any = await resp.json();
      const summary = json?.routes?.[0]?.summary;
      const distMeters = Number(summary?.distance);
      const durSeconds = Number(summary?.duration);

      if (!Number.isFinite(distMeters) || distMeters <= 0) return null;

      return {
        distanceKm: distMeters / 1_000,
        durationHours:
          Number.isFinite(durSeconds) && durSeconds > 0
            ? durSeconds / 3_600
            : NaN,
      };
    } catch (e: any) {
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
    if (raw === undefined || raw === null || String(raw).trim() === '')
      return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
}
