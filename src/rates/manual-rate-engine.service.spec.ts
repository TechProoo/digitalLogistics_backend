import { ManualRateEngineService } from './manual-rate-engine.service';

describe('ManualRateEngineService', () => {
  let service: ManualRateEngineService;

  beforeEach(() => {
    service = new ManualRateEngineService();
  });

  it('produces an air quote with minimum chargeable weight', async () => {
    const res = await service.estimate({
      freeText: 'Need a quote: 10kg from China to Lagos by air',
    });

    expect(res.status).toBe('ok');
    expect(res.quote?.provider).toBe('manual-rate-engine');
    expect(res.quote?.mode).toBe('air');
    expect(res.quote?.chargeableWeightKg).toBeGreaterThanOrEqual(45);
    expect(res.quote?.breakdown?.total?.currency).toBe('NGN');
  });

  it('asks for containerType for ocean quotes', async () => {
    const res = await service.estimate({
      freeText: 'Ocean shipment from China to Lagos',
    });

    expect(res.status).toBe('needs_clarification');
    expect(res.missingFields).toContain('containerType');
  });

  it('produces a ground quote when distance is provided', async () => {
    const res = await service.estimate({
      freeText: 'Truck from Lagos to Kano 1000km',
    });

    expect(res.status).toBe('ok');
    expect(res.quote?.mode).toBe('ground');
    expect(res.quote?.breakdown?.total?.currency).toBe('NGN');
  });

  it('infers distance for Lagos to Ogun (region fallback)', async () => {
    const res = await service.estimate({
      freeText: 'Truck from Lagos to Ogun 42kg',
    });

    expect(res.status).toBe('ok');
    expect(res.quote?.mode).toBe('ground');
    expect(res.quote?.breakdown?.total?.currency).toBe('NGN');
  });
});
