export type QuoteStatus = 'ok' | 'needs_clarification' | 'error';

export class QuoteResponseDto {
  status: QuoteStatus;
  message?: string;
  missingFields?: string[];
  quote?: any;
}
