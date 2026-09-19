import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { billingPolicy, billingPolicyActivation, billingPolicyHead } from '#database/schema.js';
import { validateCommercialPolicy } from '#api/billing/billing-policy.js';
import type { DatabaseType } from '#database/database.service.js';

/** Seeds synthetic test tariffs atomically; it does not exercise publication notice eligibility. */
export async function seedBillingFixturePolicy(input: {
  database: DatabaseType;
  policy: unknown;
  activationId: string;
}): Promise<{ headRevision: bigint }> {
  const validated = validateCommercialPolicy(input.policy);
  const { environment } = validated.policy;
  return input.database
    .transaction(
      async (transaction) => {
        await transaction.insert(billingPolicyHead).values({ environment }).onConflictDoNothing();
        const [head] = await transaction
          .select()
          .from(billingPolicyHead)
          .where(eq(billingPolicyHead.environment, environment))
          .for('update');
        if (!head) {
          throw new Error('Fixture policy head is unavailable');
        }
        if (head.pendingActivationId) {
          const [pending] = await transaction.execute(sql`select effective_at <= transaction_timestamp() as eligible
          from billing.billing_policy_activation where id = ${head.pendingActivationId}`);
          if (pending?.['eligible'] !== true) {
            throw new Error('Fixture policy head has an unresolved future transition');
          }
        }
        const policyId = randomUUID();
        await transaction.insert(billingPolicy).values({
          id: policyId,
          environment,
          policyVersion: validated.policy.policyVersion,
          schemaVersion: validated.policy.schemaVersion,
          contentHash: validated.contentHash,
          canonicalContent: validated.canonicalContent,
        });
        await transaction.insert(billingPolicyActivation).values({
          id: input.activationId,
          environment,
          policyId,
          jobKey: `fixture-${input.activationId}`,
          requestHash: `fixture:${validated.contentHash}`,
          expectedPredecessorActivationId: head.currentActivationId,
          announcedAt: sql`transaction_timestamp()`,
          effectiveAt: sql`transaction_timestamp()`,
        });
        const headRevision = head.revision + 1n;
        await transaction
          .update(billingPolicyHead)
          .set({ currentActivationId: input.activationId, pendingActivationId: null, revision: headRevision })
          .where(eq(billingPolicyHead.environment, environment));
        const [observed] = await transaction.execute(sql`select billing.observe_policy(${environment}) as activation`);
        if (observed?.['activation'] !== input.activationId) {
          throw new Error('Fixture policy observation did not select its activation');
        }
        return { headRevision };
      },
      { isolationLevel: 'read committed' },
    )
    .catch(async (error: unknown) => {
      const observation = await input.database
        .execute(sql`select clock_timestamp()::text as clock,
      h.current_activation_id, h.observed_activation_id, h.pending_activation_id,
      o.effective_at::text as observed_effective, o.created_at::text as observed_created,
      c.id as candidate_id, c.effective_at::text as candidate_effective, c.created_at::text as candidate_created
      from billing.billing_policy_head h
      left join billing.billing_policy_activation o on o.id = h.observed_activation_id
      left join lateral (select a.* from billing.billing_policy_activation a
        where a.environment = h.environment and a.effective_at <= transaction_timestamp()
          and not exists (select from billing.billing_policy_activation_cancellation x where x.activation_id = a.id)
        order by a.effective_at desc, a.created_at desc limit 1) c on true where h.environment = ${environment}`)
        .catch(() => undefined);
      console.error(
        'Fixture policy import rolled back',
        JSON.stringify({ environment, activationId: input.activationId, observation }),
      );
      throw error;
    });
}
