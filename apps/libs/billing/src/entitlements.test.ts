import { describe, expect, it } from 'vitest';
import { entitlementsFromTier, formatStorageLimit, storageLimitBytesByTier } from '#entitlements.js';

describe('entitlementsFromTier', () => {
  /* D16: a free account backs up and publishes within its 1 GB allowance. GitHub is on every plan, so it has no flag. */
  it('should let a free account sync within its allowance', () => {
    expect(entitlementsFromTier('free')).toMatchObject({
      tier: 'free',
      canSyncFiles: true,
      canUseProKernels: false,
      canCreatePrivateShares: false,
    });
    expect(storageLimitBytesByTier.free).toBe(1024 ** 3);
  });

  it('returns free-tier entitlements with pro features disabled', () => {
    const entitlements = entitlementsFromTier('free');

    expect(entitlements).toMatchObject({
      tier: 'free',
      status: 'none',
      canUseProKernels: false,
      canCreatePrivateShares: false,
      canSyncFiles: true,
      canConnectEnterpriseGit: false,
      apiCadGatewayMonthlyLimit: 1000,
      conversionApiMonthlyLimit: 0,
      hasPaymentMethod: false,
      cancelAtPeriodEnd: false,
    });
    expect(entitlements.paidThrough).toBeUndefined();
  });

  it('grants free tier a bounded hosted-GeoSpec allowance with no CI or evidence access', () => {
    const entitlements = entitlementsFromTier('free');

    expect(entitlements).toMatchObject({
      canUseHostedGeoSpecValidation: true,
      geospecValidationMonthlyLimit: 25,
      geospecConcurrentRuns: 1,
      canUseGeoSpecCiApi: false,
      canCreateGeoSpecEvidenceReports: false,
      geospecEvidenceRetentionDays: 0,
    });
  });

  it('defaults training consent to false at every tier', () => {
    expect(entitlementsFromTier('free').trainingConsent).toBe(false);
    expect(entitlementsFromTier('pro').trainingConsent).toBe(false);
    expect(entitlementsFromTier('enterprise').trainingConsent).toBe(false);
  });

  it('returns pro-tier entitlements with pro features enabled', () => {
    const entitlements = entitlementsFromTier('pro');

    expect(entitlements).toMatchObject({
      tier: 'pro',
      status: 'active',
      canUseProKernels: true,
      canCreatePrivateShares: true,
      canSyncFiles: true,
      canConnectEnterpriseGit: false,
      apiCadGatewayMonthlyLimit: 30_000,
      conversionApiMonthlyLimit: 50_000,
      canUseHostedGeoSpecValidation: true,
      geospecValidationMonthlyLimit: 1000,
      geospecConcurrentRuns: 2,
      canUseGeoSpecCiApi: true,
      canCreateGeoSpecEvidenceReports: false,
      geospecEvidenceRetentionDays: 30,
    });
  });

  it('returns enterprise-tier entitlements with enterprise git and unlimited API quotas', () => {
    const entitlements = entitlementsFromTier('enterprise');

    expect(entitlements).toMatchObject({
      tier: 'enterprise',
      canUseProKernels: true,
      canConnectEnterpriseGit: true,
      canCreateGeoSpecEvidenceReports: true,
      geospecConcurrentRuns: 4,
      geospecEvidenceRetentionDays: 365,
    });
    expect(entitlements.apiCadGatewayMonthlyLimit).toBe(Number.POSITIVE_INFINITY);
    expect(entitlements.conversionApiMonthlyLimit).toBe(Number.POSITIVE_INFINITY);
    expect(entitlements.geospecValidationMonthlyLimit).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('storageLimitBytesByTier', () => {
  it('should give each plan its advertised account allowance (D16)', () => {
    expect(storageLimitBytesByTier).toStrictEqual({
      free: 1024 ** 3,
      pro: 10 * 1024 ** 3,
      enterprise: 100 * 1024 ** 3,
    });
  });

  it('should quote an allowance without a trailing zero', () => {
    expect(formatStorageLimit(storageLimitBytesByTier.free)).toBe('1 GB');
    expect(formatStorageLimit(storageLimitBytesByTier.enterprise)).toBe('100 GB');
    expect(formatStorageLimit(2.5 * 1024 ** 3)).toBe('2.5 GB');
    expect(formatStorageLimit(512 * 1024 ** 2)).toBe('512 MB');
    expect(formatStorageLimit(0)).toBe('0 B');
    /* F12: a figure that rounds to a whole unit reads without `.0`. */
    expect(formatStorageLimit(1024 ** 3 + 1)).toBe('1 GB');
    expect(formatStorageLimit(340 * 1024 ** 2)).toBe('340 MB');
  });
});
