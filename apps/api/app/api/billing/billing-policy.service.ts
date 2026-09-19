import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { financialIdentitySchema } from '@taucad/billing';
import { DatabaseService } from '#database/database.service.js';
import type { DatabaseType } from '#database/database.service.js';
import {
  assertPolicyFleetCompatibility,
  qualifiedMeterContracts,
  resolvePolicyRoute,
  validateCommercialPolicy,
  validatePolicyActivationNotice,
} from '#api/billing/billing-policy.js';
import type { CommercialPolicy, EffectivePolicyRate, FinancialEnvironment } from '#api/billing/billing-policy.js';

type PolicyDatabase = Pick<DatabaseType, 'execute'>;

export type PolicyReplica = {
  schemaVersion: number;
  meterContractIds: readonly string[];
};

export type EffectivePolicy = {
  policyId: string;
  activationId: string;
  policy: CommercialPolicy;
  contentHash: string;
  selectedAt: Date;
};

export type QualifiedPolicyRoute = Omit<
  CommercialPolicy['routes'][number],
  'enabled' | 'riskBudgetId' | 'spendBudgetId'
> & {
  enabled: true;
  riskBudgetId: string;
  spendBudgetId: string;
};

export type EffectivePolicyRoute = EffectivePolicy & {
  route: QualifiedPolicyRoute;
  rates: EffectivePolicyRate[];
  requiredDimensions: ReadonlySet<string>;
};

export type PublishPolicyInput = {
  policyJson: string;
  environment: FinancialEnvironment;
  activationId: string;
  jobKey: string;
  expectedHeadRevision: bigint;
  expectedPredecessorActivationId?: string;
  effectiveAt?: Date;
  replica: PolicyReplica;
};

export type CancelPolicyActivationInput = {
  environment: FinancialEnvironment;
  activationId: string;
  jobKey: string;
  expectedHeadRevision: bigint;
};

export type PolicyPublicationResult = { activationId: string; headRevision: bigint; replay: boolean };
export type SelectEffectivePolicyInput = {
  environment: FinancialEnvironment;
  replica: PolicyReplica;
};
export type SelectEffectivePolicyRouteInput = SelectEffectivePolicyInput & { sku: string };

const headRowSchema = z.object({
  revision: z.coerce.bigint(),
  currentActivationId: z.string().nullable(),
  pendingActivationId: z.string().nullable(),
  observedActivationId: z.string().nullable(),
});
const activationRowSchema = z.object({
  policyId: z.string(),
  activationId: z.string(),
  requestHash: z.string(),
  contentHash: z.string(),
  canonicalContent: z.string(),
  selectedAt: z.coerce.date(),
});
const publicationReplayRowSchema = z.object({ activationId: z.string(), requestHash: z.string() });

const publicationRequestHash = (input: PublishPolicyInput, contentHash: string): string => {
  const request = {
    activationId: input.activationId,
    contentHash,
    effectiveAt: input.effectiveAt?.toISOString() ?? 'now',
    environment: input.environment,
    expectedHeadRevision: input.expectedHeadRevision.toString(),
    expectedPredecessorActivationId: input.expectedPredecessorActivationId ?? null,
    jobKey: input.jobKey,
  };
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
};

const cancellationRequestHash = (input: CancelPolicyActivationInput): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        activationId: input.activationId,
        environment: input.environment,
        expectedHeadRevision: input.expectedHeadRevision.toString(),
        jobKey: input.jobKey,
      }),
    )
    .digest('hex');

@Injectable()
export class BillingPolicyService {
  public constructor(@Inject(DatabaseService) private readonly databaseService: Pick<DatabaseService, 'database'>) {}

  public async selectEffectivePolicy(
    input: SelectEffectivePolicyInput,
    database?: PolicyDatabase,
  ): Promise<EffectivePolicy> {
    if (database === undefined) {
      return this.databaseService.database.transaction(async (transaction) =>
        this.selectEffectivePolicy(input, transaction),
      );
    }
    const observationRows = await database
      .execute(sql`
      select billing.observe_policy(${input.environment}) as "activationId"
    `)
      .catch((error: unknown) => {
        if (error instanceof Error && error.cause instanceof Error) {
          throw error.cause;
        }
        throw error;
      });
    const observation = z.object({ activationId: z.string().nullable() }).parse(observationRows[0]);
    if (observation.activationId === null) {
      throw new Error('no effective billing policy');
    }
    const rows = await database.execute(sql`
      select
        policy.id as "policyId",
        activation.id as "activationId",
        activation.request_hash as "requestHash",
        policy.content_hash as "contentHash",
        policy.canonical_content as "canonicalContent",
        transaction_timestamp() as "selectedAt"
      from billing.billing_policy_activation activation
      join billing.billing_policy policy on policy.id = activation.policy_id
      left join billing.billing_policy_activation_cancellation cancellation
        on cancellation.activation_id = activation.id
      where activation.environment = ${input.environment}
        and activation.id = ${observation.activationId}
        and activation.effective_at <= transaction_timestamp()
        and cancellation.activation_id is null
    `);
    if (rows[0] === undefined) {
      throw new Error('no effective billing policy');
    }
    const row = activationRowSchema.parse(rows[0]);
    const validated = validateCommercialPolicy(row.canonicalContent);
    if (validated.contentHash !== row.contentHash) {
      throw new Error('stored policy content hash mismatch');
    }
    if (validated.policy.environment !== input.environment) {
      throw new Error('stored policy environment mismatch');
    }
    assertPolicyFleetCompatibility(validated.policy, input.replica.schemaVersion, input.replica.meterContractIds);
    return {
      policyId: row.policyId,
      activationId: row.activationId,
      policy: validated.policy,
      contentHash: row.contentHash,
      selectedAt: row.selectedAt,
    };
  }

  public async selectEffectivePolicyRoute(
    input: SelectEffectivePolicyRouteInput,
    database?: PolicyDatabase,
  ): Promise<EffectivePolicyRoute> {
    financialIdentitySchema.parse(input.sku);
    const effective = await this.selectEffectivePolicy(input, database);
    const resolved = resolvePolicyRoute(effective.policy, input.sku);
    if (resolved === undefined) {
      throw new Error(`billing policy route is unavailable for SKU ${input.sku}`);
    }
    const requiredDimensions = qualifiedMeterContracts.get(resolved.route.meterContractId);
    if (requiredDimensions === undefined) {
      throw new Error(`billing policy meter contract is unqualified for SKU ${input.sku}`);
    }
    return { ...effective, ...resolved, route: resolved.route as QualifiedPolicyRoute, requiredDimensions };
  }

  public async publishPolicy(input: PublishPolicyInput): Promise<PolicyPublicationResult> {
    financialIdentitySchema.parse(input.activationId);
    financialIdentitySchema.parse(input.jobKey);
    const validated = validateCommercialPolicy(input.policyJson);
    if (input.effectiveAt !== undefined && !Number.isFinite(input.effectiveAt.getTime())) {
      throw new TypeError('policy activation times must be valid instants');
    }
    if (validated.policy.environment !== input.environment) {
      throw new Error('policy environment does not match command');
    }
    assertPolicyFleetCompatibility(validated.policy, input.replica.schemaVersion, input.replica.meterContractIds);
    const requestHash = publicationRequestHash(input, validated.contentHash);

    return this.databaseService.database.transaction(async (transaction) => {
      const replayRows = await transaction.execute(sql`
        select
          activation.id as "activationId",
          activation.request_hash as "requestHash",
          policy.content_hash as "contentHash",
          policy.canonical_content as "canonicalContent"
        from billing.billing_policy_activation activation
        join billing.billing_policy policy on policy.id = activation.policy_id
        where activation.environment = ${input.environment} and activation.job_key = ${input.jobKey}
      `);
      if (replayRows[0] !== undefined) {
        const replay = publicationReplayRowSchema.parse(replayRows[0]);
        if (replay.requestHash !== requestHash) {
          throw new Error('policy publication job key conflicts with prior payload');
        }
        return {
          activationId: replay.activationId,
          headRevision: input.expectedHeadRevision + 1n,
          replay: true,
        };
      }

      const head = await this.lockHead(transaction, input.environment);
      const databaseNow = await this.readDatabaseNow(transaction);
      const effectiveAt = input.effectiveAt ?? databaseNow;
      const effectiveAtSql =
        input.effectiveAt === undefined
          ? sql`transaction_timestamp()`
          : sql`${input.effectiveAt.toISOString()}::timestamptz`;
      if (
        head.revision !== input.expectedHeadRevision ||
        head.currentActivationId !== (input.expectedPredecessorActivationId ?? null)
      ) {
        throw new Error('policy publication head compare-and-swap failed');
      }
      const pending = await transaction.execute(sql`
        select activation.id
        from billing.billing_policy_activation activation
        left join billing.billing_policy_activation_cancellation cancellation
          on cancellation.activation_id = activation.id
        where activation.environment = ${input.environment}
          and activation.effective_at > transaction_timestamp()
          and cancellation.activation_id is null
        limit 1
      `);
      if (pending[0] !== undefined) {
        throw new Error('a future policy activation is already pending');
      }

      let previous: CommercialPolicy | undefined;
      try {
        const effective = await this.selectEffectivePolicy(
          { environment: input.environment, replica: input.replica },
          transaction,
        );
        previous = effective.policy;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'no effective billing policy') {
          throw error;
        }
      }
      validatePolicyActivationNotice({ previous, next: validated.policy, announcedAt: databaseNow, effectiveAt });

      const policyRows = await transaction.execute(sql`
        insert into billing.billing_policy
          (id, environment, policy_version, schema_version, content_hash, canonical_content)
        values
          (${`policy:${input.environment}:${validated.contentHash}`}, ${input.environment}, ${validated.policy.policyVersion}, 1,
           ${validated.contentHash}, ${validated.canonicalContent})
        on conflict (environment, content_hash) do nothing
        returning id
      `);
      let policyRow = policyRows[0];
      if (policyRow === undefined) {
        const existingPolicyRows = await transaction.execute(sql`
          select id from billing.billing_policy
          where environment = ${input.environment} and content_hash = ${validated.contentHash}
        `);
        policyRow = existingPolicyRows[0];
      }
      const policyId = z.object({ id: z.string() }).parse(policyRow).id;
      await transaction.execute(sql`
        insert into billing.billing_policy_activation
          (environment, id, policy_id, job_key, request_hash, expected_predecessor_activation_id, announced_at, effective_at)
        values
          (${input.environment}, ${input.activationId}, ${policyId}, ${input.jobKey}, ${requestHash},
           ${input.expectedPredecessorActivationId ?? null}, transaction_timestamp(), ${effectiveAtSql})
      `);
      const nextRevision = head.revision + 1n;
      const pendingActivationId = effectiveAt > databaseNow ? input.activationId : null;
      const updated = await transaction.execute(sql`
        update billing.billing_policy_head
        set revision = ${nextRevision}, current_activation_id = ${input.activationId},
            pending_activation_id = ${pendingActivationId}, updated_at = now()
        where environment = ${input.environment} and revision = ${head.revision}
        returning revision
      `);
      if (updated[0] === undefined) {
        throw new Error('policy publication head compare-and-swap failed');
      }
      if (effectiveAt <= databaseNow) {
        const observed = await this.selectEffectivePolicy(
          { environment: input.environment, replica: input.replica },
          transaction,
        );
        if (observed.activationId !== input.activationId) {
          throw new Error('immediate billing policy must advance the activation barrier');
        }
      }
      return { activationId: input.activationId, headRevision: nextRevision, replay: false };
    });
  }

  public async cancelPendingActivation(input: CancelPolicyActivationInput): Promise<PolicyPublicationResult> {
    financialIdentitySchema.parse(input.activationId);
    financialIdentitySchema.parse(input.jobKey);
    const requestHash = cancellationRequestHash(input);
    return this.databaseService.database.transaction(async (transaction) => {
      const replayRows = await transaction.execute(sql`
        select activation_id as "activationId", request_hash as "requestHash"
        from billing.billing_policy_activation_cancellation
        where environment = ${input.environment} and job_key = ${input.jobKey}
      `);
      if (replayRows[0] !== undefined) {
        const replay = z.object({ activationId: z.string(), requestHash: z.string() }).parse(replayRows[0]);
        if (replay.requestHash !== requestHash) {
          throw new Error('policy cancellation job key conflicts with prior payload');
        }
        return {
          activationId: replay.activationId,
          headRevision: input.expectedHeadRevision + 1n,
          replay: true,
        };
      }

      const head = await this.lockHead(transaction, input.environment);
      if (head.revision !== input.expectedHeadRevision || head.currentActivationId !== input.activationId) {
        throw new Error('policy cancellation head compare-and-swap failed');
      }
      await transaction.execute(sql`
        select id
        from billing.billing_policy_activation
        where environment = ${input.environment} and id = ${input.activationId}
        for update
      `);
      // Cancellation eligibility is checked after lock waits, not at transaction start.
      const eligibilityRows = await transaction.execute(sql`
        select effective_at > clock_timestamp() as pending
        from billing.billing_policy_activation
        where environment = ${input.environment} and id = ${input.activationId}
      `);
      const eligibility = z.object({ pending: z.boolean() }).parse(eligibilityRows[0]);
      if (
        head.pendingActivationId !== input.activationId ||
        head.observedActivationId === input.activationId ||
        !eligibility.pending
      ) {
        throw new Error('only a pending future activation can be cancelled');
      }
      await transaction.execute(sql`
        insert into billing.billing_policy_activation_cancellation
          (environment, activation_id, job_key, request_hash, cancelled_at)
        values (${input.environment}, ${input.activationId}, ${input.jobKey}, ${requestHash}, clock_timestamp())
      `);
      const nextRevision = head.revision + 1n;
      const updated = await transaction.execute(sql`
        update billing.billing_policy_head
        set revision = ${nextRevision}, current_activation_id = expected.id,
            pending_activation_id = null, updated_at = now()
        from billing.billing_policy_activation cancelled
        left join billing.billing_policy_activation expected
          on expected.id = cancelled.expected_predecessor_activation_id
        where billing_policy_head.environment = ${input.environment}
          and billing_policy_head.revision = ${head.revision}
          and cancelled.id = ${input.activationId}
        returning billing_policy_head.revision
      `);
      if (updated[0] === undefined) {
        throw new Error('policy cancellation head compare-and-swap failed');
      }
      return { activationId: input.activationId, headRevision: nextRevision, replay: false };
    });
  }

  private async lockHead(
    database: PolicyDatabase,
    environment: FinancialEnvironment,
  ): Promise<z.infer<typeof headRowSchema>> {
    await database.execute(sql`
      insert into billing.billing_policy_head (environment, revision, current_activation_id)
      values (${environment}, 0, null)
      on conflict (environment) do nothing
    `);
    const rows = await database.execute(sql`
      select revision, current_activation_id as "currentActivationId", pending_activation_id as "pendingActivationId",
        observed_activation_id as "observedActivationId"
      from billing.billing_policy_head
      where environment = ${environment}
      for update
    `);
    return headRowSchema.parse(rows[0]);
  }

  private async readDatabaseNow(database: PolicyDatabase): Promise<Date> {
    const rows = await database.execute(sql`select transaction_timestamp() as "now"`);
    return z.object({ now: z.coerce.date() }).parse(rows[0]).now;
  }
}
