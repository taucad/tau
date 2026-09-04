import { describe, expect, it } from 'vitest';
import { tauPlanCatalog } from '#tau-plan-catalog.js';

describe('tauPlanCatalog', () => {
  it('should carry exactly the three tiers in ascending order with Pro as the popular card', () => {
    expect(tauPlanCatalog.map((entry) => entry.id)).toStrictEqual(['free', 'pro', 'enterprise']);
    expect(tauPlanCatalog.filter((entry) => entry.popular).map((entry) => entry.id)).toStrictEqual(['pro']);
  });

  it('should frame credits in dollars and never resurrects the dropped priority-queue bullet', () => {
    const [free, pro] = tauPlanCatalog;
    expect(free?.features).toContain('$0.50 of usage credits per month');
    expect(pro?.features).toContain('$20 of usage credits per month');
    const allFeatures = tauPlanCatalog.flatMap((entry) => entry.features).join('\n');
    expect(allFeatures).not.toMatch(/priority/i);
    expect(allFeatures).not.toMatch(/basic cad generation|advanced cad generation/i);
  });

  it('should map each CTA to a routable kind with pricing labels present', () => {
    for (const entry of tauPlanCatalog) {
      expect(['signup', 'subscribe', 'contact-sales']).toContain(entry.cta.kind);
      expect(entry.priceLabel.length).toBeGreaterThan(0);
    }
    expect(tauPlanCatalog.at(-1)?.priceMonthly).toBeUndefined();
  });

  it('should keep the AD15 no-train boundary customer-facing on both paid tiers', () => {
    const [, pro, enterprise] = tauPlanCatalog;
    expect(pro?.features).toContain('No training on your designs');
    expect(enterprise?.features).toContain('Contractual no-train guarantee (DPA)');
  });

  it('should never brand verification as "GeoSpec" — the catalogue is marketing copy (OQ1)', () => {
    const everything = JSON.stringify(tauPlanCatalog);
    expect(everything).not.toMatch(/geospec/i);
  });
});
