import type { BillingTier, Entitlements } from '@taucad/billing';

export const commercialEntitlementsKey = Symbol('commercialEntitlements');

export type CommercialEntitlements = Pick<
  Entitlements,
  'canCreatePrivateShares' | 'canSyncFiles' | 'canUseProKernels'
> & {
  readonly tier?: BillingTier;
  readonly storageLimitBytes?: number;
};

export type CommercialEntitlementsService = {
  getEntitlements(userId: string): Promise<CommercialEntitlements>;
};
