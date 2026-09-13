import { describe, expect, it } from 'vitest';
import { entitlementsFromTier } from '#entitlements.js';

describe('entitlementsFromTier', () => {
  it('returns free-tier entitlements with pro features disabled', () => {
    const entitlements = entitlementsFromTier('free');

    expect(entitlements).toMatchObject({
      tier: 'free',
      status: 'none',
      canUseProKernels: false,
      canCreatePrivateShares: false,
      canSyncFiles: false,
      canConnectGitHub: false,
      canConnectEnterpriseGit: false,
      apiCadGatewayMonthlyLimit: 1000,
      conversionApiMonthlyLimit: 0,
      cancelAtPeriodEnd: false,
    });
    expect(entitlements.currentPeriodEnd).toBeUndefined();
  });

  it('returns pro-tier entitlements with pro features enabled', () => {
    const entitlements = entitlementsFromTier('pro');

    expect(entitlements).toMatchObject({
      tier: 'pro',
      status: 'active',
      canUseProKernels: true,
      canCreatePrivateShares: true,
      canSyncFiles: true,
      canConnectGitHub: true,
      canConnectEnterpriseGit: false,
      apiCadGatewayMonthlyLimit: 30_000,
      conversionApiMonthlyLimit: 50_000,
    });
  });

  it('returns enterprise-tier entitlements with enterprise git and unlimited API quotas', () => {
    const entitlements = entitlementsFromTier('enterprise');

    expect(entitlements).toMatchObject({
      tier: 'enterprise',
      canUseProKernels: true,
      canConnectEnterpriseGit: true,
    });
    expect(entitlements.apiCadGatewayMonthlyLimit).toBe(Number.POSITIVE_INFINITY);
    expect(entitlements.conversionApiMonthlyLimit).toBe(Number.POSITIVE_INFINITY);
  });
});
