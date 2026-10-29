import { describe, expect, it } from 'vitest';
import { quotaBandOf, usageFigures } from '#api/storage-accounting/usage.js';
import type { OwnerUsage, RepositorySizeCounts } from '#api/storage-accounting/usage.js';

const gib = 1024 ** 3;
const mib = 1024 ** 2;

const owners: OwnerUsage[] = [
  {
    ownerId: 'owner-free-over',
    plan: 'free',
    limitBytes: 0,
    repositoryBytes: 10,
    lfsBytes: 0,
    retainedBytes: 5,
    repositories: 1,
  },
  {
    ownerId: 'owner-pro-light',
    plan: 'pro',
    limitBytes: 10 * gib,
    repositoryBytes: gib,
    lfsBytes: gib,
    retainedBytes: 0,
    repositories: 3,
  },
  {
    ownerId: 'owner-pro-near',
    plan: 'pro',
    limitBytes: 10 * gib,
    repositoryBytes: 9 * gib,
    lfsBytes: 600 * mib,
    retainedBytes: 2,
    repositories: 2,
  },
  {
    ownerId: 'owner-enterprise-full',
    plan: 'enterprise',
    limitBytes: 100,
    repositoryBytes: 60,
    lfsBytes: 40,
    retainedBytes: 0,
    repositories: 1,
  },
];

const sizes: RepositorySizeCounts = {
  atOrBelow: [1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 5, 6, 7],
  atOrAboveCeilingFraction: [3, 2, 1, 0],
};

describe('quotaBandOf (W14 OB3, N47)', () => {
  it('should band an owner by the share of its allowance it uses', () => {
    expect(quotaBandOf(0, 100)).toBe('lt50');
    expect(quotaBandOf(49, 100)).toBe('lt50');
    expect(quotaBandOf(50, 100)).toBe('50_80');
    expect(quotaBandOf(80, 100)).toBe('80_95');
    expect(quotaBandOf(95, 100)).toBe('95_100');
    expect(quotaBandOf(99, 100)).toBe('95_100');
  });

  it('should count an owner at its allowance as over, since its next push is refused', () => {
    expect(quotaBandOf(100, 100)).toBe('over');
    expect(quotaBandOf(101, 100)).toBe('over');
  });

  it('should count stored bytes under no allowance as over, and nothing under none as lt50', () => {
    expect(quotaBandOf(1, 0)).toBe('over');
    expect(quotaBandOf(0, 0)).toBe('lt50');
  });
});

describe('usageFigures (W14 OB3, N43–N47)', () => {
  const figures = usageFigures(owners, sizes);

  it('should carry no project, owner or bucket in any label', () => {
    const serialized = JSON.stringify(figures);
    for (const owner of owners) {
      expect(serialized).not.toContain(owner.ownerId);
    }
    const keys = new Set(
      Object.values(figures).flatMap((observations) =>
        observations.flatMap((observation) => Object.keys(observation.attributes)),
      ),
    );
    expect([...keys].toSorted()).toStrictEqual(['band', 'tau.plan', 'tau.size_le', 'tau.storage.class', 'threshold']);
  });

  it('should sum stored bytes by class and plan, with a zero for every plan that stores nothing', () => {
    expect(figures.storageUsageBytes).toContainEqual({
      value: 10 * gib,
      attributes: { 'tau.storage.class': 'repository', 'tau.plan': 'pro' },
    });
    expect(figures.storageUsageBytes).toContainEqual({
      value: gib + 600 * mib,
      attributes: { 'tau.storage.class': 'lfs', 'tau.plan': 'pro' },
    });
    expect(figures.storageUsageBytes).toContainEqual({
      value: 5,
      attributes: { 'tau.storage.class': 'retained', 'tau.plan': 'free' },
    });
    expect(figures.storageUsageBytes).toContainEqual({
      value: 0,
      attributes: { 'tau.storage.class': 'lfs', 'tau.plan': 'free' },
    });
    expect(figures.storageUsageBytes).toHaveLength(9);
  });

  it('should count repositories by plan', () => {
    expect(figures.storageUsageRepositories).toStrictEqual([
      { value: 1, attributes: { 'tau.plan': 'free' } },
      { value: 5, attributes: { 'tau.plan': 'pro' } },
      { value: 1, attributes: { 'tau.plan': 'enterprise' } },
    ]);
  });

  it('should count owners by plan and quota band, every band present', () => {
    const band = (plan: string, name: string): number | undefined =>
      figures.storageQuotaOwners?.find(
        (observation) => observation.attributes['tau.plan'] === plan && observation.attributes.band === name,
      )?.value;

    expect(figures.storageQuotaOwners).toHaveLength(15);
    expect(band('free', 'over')).toBe(1);
    expect(band('pro', 'lt50')).toBe(1);
    expect(band('pro', '95_100')).toBe(1);
    expect(band('enterprise', 'over')).toBe(1);
    expect(band('enterprise', 'lt50')).toBe(0);
  });

  it('should export the cumulative size distribution and the ceiling proximity in bound order', () => {
    expect(figures.gitRepositorySizeDistribution?.[0]).toStrictEqual({
      value: 1,
      attributes: { 'tau.size_le': '65536' },
    });
    expect(figures.gitRepositorySizeDistribution?.at(-2)).toStrictEqual({
      value: 6,
      attributes: { 'tau.size_le': String(gib) },
    });
    expect(figures.gitRepositorySizeDistribution?.at(-1)).toStrictEqual({
      value: 7,
      attributes: { 'tau.size_le': '+Inf' },
    });
    expect(figures.gitRepositoryCeilingProximity).toStrictEqual([
      { value: 3, attributes: { threshold: '0.5' } },
      { value: 2, attributes: { threshold: '0.8' } },
      { value: 1, attributes: { threshold: '0.95' } },
      { value: 0, attributes: { threshold: '1.0' } },
    ]);
  });
});
