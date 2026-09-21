import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { qualifiedMeterContracts } from '#api/billing/billing-policy.js';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';
import { registerBillableModelMeterContracts } from '#api/billing/billable-model-qualification.js';
import { composeTariff, parseCommercialOverlay } from '#api/billing/billing-policy.sync.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';

/** The one repair for every state this check reports; `migrate` composes `sync` when cloud is on. */
export const billingPolicyMigrateHint = 'Run pnpm db:migrate (development) or the release migration job.';

/** Development's overlay is a repository file; staging and prod-us carry theirs as a Fly secret. */
const developmentOverlayPath = 'infra/billing/development.commercial.json';

/**
 * The overlay half of the tariff, if this process happens to hold it.
 *
 * The order is the command's own: `api:db-migrate` passes `--commercial-file <the repository file>`,
 * and `runBillingPolicySyncCommand` only falls back to `BILLING_COMMERCIAL_POLICY` without it. A
 * developer with that secret exported for a staging errand would otherwise be told, every boot, that
 * the local tariff is stale against an overlay nothing local ever publishes.
 */
const readOverlayDocument = (environment: FinancialEnvironment): string | undefined => {
  if (environment === 'development') {
    try {
      return readFileSync(developmentOverlayPath, 'utf8');
    } catch {
      // A run from another working directory falls through to the secret, and without one simply has
      // nothing to compare against; the effective tariff was already accepted above.
    }
  }
  const secret = process.env['BILLING_COMMERCIAL_POLICY'];
  return secret === undefined || secret === '' ? undefined : secret;
};

export type BillingPolicyReadinessConfig = {
  readonly environment: FinancialEnvironment;
  /** `TAU_CLOUD_ENABLED`: a self-hosted build has no tariff and must not fail readiness over one. */
  readonly cloudEnabled: boolean;
};

/**
 * Fails readiness in cloud mode when this environment has no effective tariff, and warns when the
 * effective one is not what this build would derive (D5).
 *
 * The missing-policy half mirrors `checkSchemaCompatibility` in `database.service.ts`: a replica
 * cannot publish, so it says which job does and stops. Staleness only warns, because reads now
 * degrade per route.
 *
 * ponytail: the unknown-route half of D5 is already `selectEffectivePolicy`'s own per-activation
 * warning (D9), which this read triggers; the only difference left to name here is the content hash,
 * and only where this process also holds the overlay the tariff is composed from.
 */
// oxlint-disable-next-line new-cap -- the Nest decorator exemption lists *.service.ts, not this check
@Injectable()
export class BillingPolicyReadiness implements OnModuleInit {
  readonly #logger = new Logger(BillingPolicyReadiness.name);

  public constructor(
    private readonly policy: Pick<BillingPolicyService, 'selectEffectivePolicy'>,
    private readonly config: BillingPolicyReadinessConfig,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.config.cloudEnabled) {
      return;
    }
    registerBillableModelMeterContracts();
    const { environment } = this.config;
    const effective = await this.policy
      .selectEffectivePolicy({
        environment,
        replica: { schemaVersion: 1, meterContractIds: [...qualifiedMeterContracts.keys()] },
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === 'no effective billing policy') {
          throw new Error(`No effective billing policy for ${environment}. ${billingPolicyMigrateHint}`, {
            cause: error,
          });
        }
        throw error;
      });
    this.#logger.log(
      JSON.stringify({
        event: 'billing.tariff_observed',
        environment,
        activationId: effective.activationId,
        policyVersion: effective.policy.policyVersion,
        contentHash: effective.contentHash,
      }),
    );
    this.warnWhenDerived(effective);
  }

  /** Compares the effective tariff against the one this build and the overlay would compose. */
  private warnWhenDerived(effective: Awaited<ReturnType<BillingPolicyService['selectEffectivePolicy']>>): void {
    const overlay = readOverlayDocument(this.config.environment);
    if (overlay === undefined) {
      return;
    }
    let derived: ReturnType<typeof composeTariff>;
    try {
      derived = composeTariff({ overlay: parseCommercialOverlay(overlay, this.config.environment) });
    } catch (error) {
      // Staleness never fails readiness (D5), and neither does an overlay this replica cannot read:
      // publication is the release job's act and it validates the same document before it publishes.
      this.#logger.warn(
        JSON.stringify({
          event: 'billing.tariff_overlay_unreadable',
          environment: this.config.environment,
          reason: error instanceof Error ? error.message : String(error),
          hint: billingPolicyMigrateHint,
        }),
      );
      return;
    }
    if (derived.contentHash === effective.contentHash) {
      return;
    }
    const enabled = (policy: typeof derived.policy): Set<string> =>
      new Set(policy.routes.filter((route) => route.enabled).map((route) => route.routeId));
    const effectiveRoutes = enabled(effective.policy);
    const derivedRoutes = enabled(derived.policy);
    this.#logger.warn(
      JSON.stringify({
        event: 'billing.tariff_stale',
        environment: this.config.environment,
        activationId: effective.activationId,
        effectiveContentHash: effective.contentHash,
        derivedContentHash: derived.contentHash,
        retiredRoutes: [...effectiveRoutes].filter((routeId) => !derivedRoutes.has(routeId)),
        unpublishedRoutes: [...derivedRoutes].filter((routeId) => !effectiveRoutes.has(routeId)),
        hint: billingPolicyMigrateHint,
      }),
    );
  }
}
