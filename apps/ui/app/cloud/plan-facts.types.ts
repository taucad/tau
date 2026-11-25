import type { DeploymentModeBasis } from '#cloud/deployment-mode.types.js';

/**
 * Plan facts as a discriminated union (adaptive app deployment mode charter D6, I3, I4, I15): an unresolved fact has
 * no capability field to read, so a consumer must narrow before it can act on one. Types only, for every ceiling.
 */

/** Which kind of wait an unresolved plan is: at most one deadline, a stated "can't check", or safe mode. @public */
export type PlanWait = 'checking' | 'unavailable' | 'safe-mode';

/** A plan that is not resolved: what it waits for and how the person asks again. @public */
export type UnresolvedPlan = Readonly<{ isResolved: false; wait: PlanWait; retry: () => void }>;

/** The commercial features a resolved plan grants. @public */
export type ResolvedCommercialFeatures = Readonly<{
  isResolved: true;
  /** Where the plan's mode comes from; data moves only on `pinned` or `confirmed` (D5, consumer C4). */
  basis: DeploymentModeBasis;
  canCreatePrivateShares: boolean;
  /** Whether this plan may back a project's files up to Tau Cloud (N4). */
  canSyncFiles: boolean;
  /** The Tau Cloud allowance this plan includes (D16), while it syncs. */
  storageLimitBytes: number | undefined;
  /** Whether a larger plan exists to offer (D17): never on the top tier. */
  canUpgradePlan: boolean;
  requestUpgrade: () => void;
}>;

/** The commercial features, resolved or not. @public */
export type CommercialFeatures = ResolvedCommercialFeatures | UnresolvedPlan;

/** The commercial facts the Cloud chunk's bridge publishes for one identity (data only, D6). @public */
export type CommercialFacts = Readonly<{
  canCreatePrivateShares: boolean;
  canSyncFiles: boolean;
  storageLimitBytes: number | undefined;
  canUpgradePlan: boolean;
}>;

/** The kernels the identity's plan allows, as the bridge publishes them. @public */
export type KernelPlanFacts = Readonly<{ allowed: readonly string[] }>;

/** What the credit preflight reads for one identity (data only; the check runs when called, I4). @public */
export type CreditFacts = Readonly<{
  /** Spendable credit atoms, or `undefined` while the balance is unavailable. */
  availableAtoms: string | undefined;
  /** The floor hold per route, by route id. */
  minimumHoldAtoms: Readonly<Record<string, string>>;
  autoReloadEnabled: boolean;
}>;

/** Every fact the bridge publishes; a missing one is unresolved. @public */
export type CloudPlanFacts = Readonly<{
  commercial?: CommercialFacts;
  kernels?: KernelPlanFacts;
  credit?: CreditFacts;
}>;
