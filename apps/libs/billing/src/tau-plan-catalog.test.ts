import { describe, expect, it } from 'vitest';
import { tauPlanCatalog } from '#tau-plan-catalog.js';

describe('tauPlanCatalog', () => {
  it('should carry exactly the three tiers in ascending order with Pro as the popular card', () => {
    expect(tauPlanCatalog.map((entry) => entry.id)).toStrictEqual(['free', 'pro', 'enterprise']);
    expect(tauPlanCatalog.filter((entry) => entry.popular).map((entry) => entry.id)).toStrictEqual(['pro']);
  });

  const labels = (entry: (typeof tauPlanCatalog)[number] | undefined): string[] =>
    (entry?.features ?? []).map((feature) => feature.label);

  it('should state paid credit terms in credits and never resurrects the dropped priority-queue bullet', () => {
    const [free, pro] = tauPlanCatalog;
    expect(labels(free)).toContain('Buy credits any time at 100 credits per $1');
    expect(labels(pro)).toContain('2,000 credits every month');
    expect(labels(pro)).toContain('Unused monthly credits roll over, up to 4,000');
    const allFeatures = tauPlanCatalog.flatMap((entry) => labels(entry)).join('\n');
    expect(allFeatures).not.toMatch(/priority/i);
    expect(allFeatures).not.toMatch(/basic cad generation|advanced cad generation/i);
  });

  it('should promise no complimentary credits or refill countdown at launch (D1/D2)', () => {
    /* "Monthly credits" is the product name for a paid plan's credits, so only the free card is barred from it. */
    const free = JSON.stringify(tauPlanCatalog[0]);
    expect(free).not.toMatch(/credits? per month|monthly credits?|credits every month/i);
    const everything = JSON.stringify(tauPlanCatalog);
    expect(everything).not.toMatch(/free credits?|welcome credits?|complimentary/i);
    expect(everything).not.toMatch(/\$[\d.]+ of usage credits/i);
    expect(everything).not.toMatch(/refill|resets? (each|every) month/i);
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
    expect(labels(pro)).toContain('No training on your designs');
    expect(labels(enterprise)).toContain('Contractual no-training guarantee (DPA)');
  });

  it('should never brand verification as "GeoSpec" — the catalogue is marketing copy (OQ1)', () => {
    const everything = JSON.stringify(tauPlanCatalog);
    expect(everything).not.toMatch(/geospec/i);
  });

  it('should advertise the storage each plan includes as a live feature, from the table the quota enforces (D16)', () => {
    const [free, pro, enterprise] = tauPlanCatalog;
    expect(free?.features).toContainEqual({ label: '1 GB cloud backup and sync', isComingSoon: false });
    expect(pro?.features).toContainEqual({ label: '10 GB cloud backup and sync', isComingSoon: false });
    expect(enterprise?.features).toContainEqual({ label: '100 GB cloud backup and sync', isComingSoon: false });
    /* EQ2: a free account may connect GitHub, so Pro inherits it through "Everything in Free". */
    expect(labels(free)).toContain('GitHub connection');
    expect(labels(pro)).not.toContain('GitHub connection');
  });

  it('should offer team billing on Enterprise only', () => {
    const [free, pro, enterprise] = tauPlanCatalog;
    expect(enterprise?.features).toContainEqual({ label: 'Team billing', isComingSoon: false });
    expect(labels(free)).not.toContain('Team billing');
    expect(labels(pro)).not.toContain('Team billing');
  });

  it('should mark features in development with a flag and never in the label text', () => {
    for (const entry of tauPlanCatalog) {
      expect(labels(entry).join('\n')).not.toMatch(/coming soon/i);
      const firstComingSoon = entry.features.findIndex((feature) => feature.isComingSoon);
      const lastIncluded = entry.features.findLastIndex((feature) => !feature.isComingSoon);
      /* Included features open every list; the ones in development close it. */
      expect(firstComingSoon === -1 || firstComingSoon > lastIncluded).toBe(true);
    }
    expect(tauPlanCatalog[0]?.features.some((feature) => feature.isComingSoon)).toBe(false);
  });

  it('should write copy in sentence case with one currency format and no dash asides', () => {
    const everything = JSON.stringify(tauPlanCatalog);
    expect(everything).not.toMatch(/US\$| — |Subscribe Now|Contact Us|Free Forever|Pro Plan/);
  });
});
