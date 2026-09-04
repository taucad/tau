import { describe, expect, it } from 'vitest';
import { entitlementsFromTier } from '#entitlements.js';

describe('entitlementsFromTier', () => {
  it('returns free-tier entitlements with pro features disabled', () => {
    const entitlements = entitlementsFromTier('free');

    expect(entitlements).toMatchObject({
      tier: 'free',
      status: 'none',
      aiEnabled: true,
      canUseProKernels: false,
      canCreatePrivateShares: false,
      canSyncFiles: false,
      canConnectGitHub: false,
      canConnectEnterpriseGit: false,
      apiCadGatewayMonthlyLimit: 1000,
      conversionApiMonthlyLimit: 0,
      hasPaymentMethod: false,
      cancelAtPeriodEnd: false,
    });
    expect(entitlements.currentPeriodEnd).toBeUndefined();
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
      aiEnabled: true,
      canUseProKernels: true,
      canCreatePrivateShares: true,
      canSyncFiles: true,
      canConnectGitHub: true,
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
