export type ManualQuoteStatus = 'ok' | 'needs_clarification' | 'error';

export type Money = {
  amount: number;
  currency: 'NGN';
};

export type ManualQuoteBreakdown = {
  base: Money;
  surcharges: Money;
  margin: Money;
  total: Money;
  assumptions: string[];
};

export class ManualQuoteResponseDto {
  status: ManualQuoteStatus;
  message?: string;
  missingFields?: string[];
  quote?: {
    provider: 'manual-rate-engine';
    mode: 'parcel' | 'air' | 'ocean' | 'ground';
    origin?: string;
    destination?: string;
    chargeableWeightKg?: number;
    breakdown: ManualQuoteBreakdown;
  };
}
