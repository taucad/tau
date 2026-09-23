import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import {
  billableModelRouteMeters,
  registerBillableModelMeterContracts,
} from '#api/billing/billable-model-qualification.js';
import { composeTariff, parseCommercialOverlay, syncPolicy } from '#api/billing/billing-policy.sync.js';
import type { PolicySyncResult } from '#api/billing/billing-policy.sync.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
const testDatabaseUrl = databaseUrl ?? '';

/* `staging` is the policy suites' environment; this one runs after `billing-policy.foundation.test.ts`
 * and never assumes a pristine head, only that its own publications advance it. */
const environment = 'staging';
const overlay = parseCommercialOverlay(
  {
    ...(JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../../../infra/billing/development.commercial.json'), 'utf8'),
    ) as Record<string, unknown>),
    environment,
    series: 'sync-foundation',
  },
  environment,
);

const headSchema = z.object({
  revision: z.coerce.bigint(),
  currentActivationId: z.string().nullable(),
  pendingActivationId: z.string().nullable(),
});

const raiseFirstRate = (routes: typeof billableModelRouteMeters, multiplier: bigint) => [
  {
    ...routes[0]!,
    rates: routes[0]!.rates.map((rate, index) =>
      index === 0 ? { ...rate, numeratorPicoUsd: rate.numeratorPicoUsd * multiplier } : rate,
    ),
  },
  ...routes.slice(1),
];

describe.runIf(databaseUrl !== undefined)('billing policy sync PostgreSQL foundation', () => {
  const clients: postgres.Sql[] = [];
  let service: BillingPolicyService;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const replica = { schemaVersion: 1, meterContractIds: [] as string[] };
  const catalogue = [...billableModelRouteMeters];
  const retired = catalogue.slice(0, -1);

  const readHead = async (): Promise<z.infer<typeof headSchema>> => {
    const rows = await database.execute(sql`
      select revision, current_activation_id as "currentActivationId", pending_activation_id as "pendingActivationId"
      from billing.billing_policy_head where environment = ${environment}
    `);
    return rows[0] === undefined
      ? { revision: 0n, currentActivationId: null, pendingActivationId: null }
      : headSchema.parse(rows[0]);
  };
  const sync = async (routes: typeof billableModelRouteMeters): Promise<PolicySyncResult> =>
    syncPolicy(service, database, { environment, overlay, replica, routes });
  const peerDatabase = () => drizzle(clients[1]!, { schema });
  const peer = () => new BillingPolicyService({ database: peerDatabase() });

  beforeAll(() => {
    registerBillableModelMeterContracts();
    replica.meterContractIds = billableModelRouteMeters.map((route) => route.meterContractId);
    for (let index = 0; index < 2; index += 1) {
      clients.push(postgres(testDatabaseUrl, { max: 1, prepare: false }));
    }
    database = drizzle(clients[0]!, { schema });
    service = new BillingPolicyService({ database });
  });

  afterAll(async () => {
    await Promise.all(clients.map(async (client) => client.end()));
  });

  it('publishes the derived tariff, reports unchanged on a rerun, and retires a dropped route', async () => {
    const derived = composeTariff({ overlay });
    const before = await readHead();
    const published = await sync(catalogue);
    expect(published).toMatchObject({ status: 'published', headRevision: before.revision + 1n });
    expect(published.activationId).toBe(`sync-${derived.contentHash.slice(0, 12)}-r${before.revision + 1n}`);
    const effective = await service.selectEffectivePolicy({ environment, replica });
    expect(effective.policy.policyVersion).toBe(derived.policy.policyVersion);
    const publishedHead = await readHead();
    expect(publishedHead.pendingActivationId).toBeNull();

    await expect(sync(catalogue)).resolves.toEqual({
      status: 'unchanged',
      activationId: published.activationId,
      contentHash: derived.contentHash,
    });

    const dropped = catalogue.at(-1)!;
    const superseded = await sync(retired);
    expect(superseded).toMatchObject({ status: 'published', headRevision: before.revision + 2n });
    const afterRetirement = await service.selectEffectivePolicy({ environment, replica });
    expect(afterRetirement.policy.routes.map((route) => route.routeId)).not.toContain(dropped.routeId);
    expect(afterRetirement.policy.fleet.meterContractIds).not.toContain(dropped.meterContractId);
  });

  it('schedules a rate rise 30 days out, then replaces that pending activation with a newer one', async () => {
    const effectiveBefore = await service.selectEffectivePolicy({ environment, replica });
    const clockRows = await database.execute(sql`select transaction_timestamp() as "now"`);
    const { now: databaseNow } = z.object({ now: z.coerce.date() }).parse(clockRows[0]);

    const scheduled = await sync(raiseFirstRate(retired, 2n));
    expect(scheduled.status).toBe('published');
    if (scheduled.status !== 'published') {
      throw new Error('expected a publication');
    }
    expect(scheduled.effectiveAt.getTime()).toBeGreaterThanOrEqual(databaseNow.getTime() + 30 * 24 * 60 * 60 * 1000);
    const pendingHead = await readHead();
    expect(pendingHead.pendingActivationId).toBe(scheduled.activationId);
    // The rise is announced, not applied: reads still see the policy it will replace.
    const duringNotice = await service.selectEffectivePolicy({ environment, replica });
    expect(duringNotice.activationId).toBe(effectiveBefore.activationId);

    const replaced = await sync(raiseFirstRate(retired, 3n));
    expect(replaced.status).toBe('published');
    expect(replaced.activationId).not.toBe(scheduled.activationId);
    const replacedHead = await readHead();
    expect(replacedHead.pendingActivationId).toBe(replaced.activationId);
    const cancellations = await database.execute(sql`
      select activation_id as "activationId" from billing.billing_policy_activation_cancellation
      where environment = ${environment} and activation_id = ${scheduled.activationId}
    `);
    expect(cancellations).toHaveLength(1);
    const afterReplacement = await service.selectEffectivePolicy({ environment, replica });
    expect(afterReplacement.activationId).toBe(effectiveBefore.activationId);

    // Leave the head without a pending activation for the suites that follow.
    await service.cancelPendingActivation({
      environment,
      activationId: replaced.activationId,
      jobKey: `cleanup-${replaced.activationId}`,
      expectedHeadRevision: replacedHead.revision,
    });
    const cleanHead = await readHead();
    expect(cleanHead.pendingActivationId).toBeNull();
  });

  it('lets exactly one of two concurrent syncs publish', async () => {
    const routes = catalogue.slice(0, -2);
    const [left, right] = await Promise.all([
      sync(routes),
      syncPolicy(peer(), peerDatabase(), { environment, overlay, replica, routes }),
    ]);

    /* One of the two loses the locked compare-and-swap. Whether it then reports `unchanged` or
     * replays the winner's own idempotent publication, the invariant is one activation for the
     * content and one activation id between them. */
    const { contentHash } = composeTariff({ overlay, routes });
    expect([left.status, right.status]).toContain('published');
    expect(left.activationId).toBe(right.activationId);
    expect(left.contentHash).toBe(contentHash);
    expect(right.contentHash).toBe(contentHash);
    const effective = await service.selectEffectivePolicy({ environment, replica });
    expect(effective.contentHash).toBe(contentHash);
    const activations = await database.execute(sql`
      select count(*)::int as count from billing.billing_policy_activation activation
      join billing.billing_policy policy on policy.id = activation.policy_id
      where activation.environment = ${environment} and policy.content_hash = ${contentHash}
    `);
    expect(activations[0]?.['count']).toBe(1);
  });

  /* A concurrent *rise* collides on the job key rather than on the head: each racer reads the
   * database clock for itself, so their `effectiveAt` values and request hashes differ. */
  it('lets exactly one of two concurrent syncs schedule the same rate rise', async () => {
    const routes = raiseFirstRate(catalogue.slice(0, -2), 2n);
    const [left, right] = await Promise.all([
      sync(routes),
      syncPolicy(peer(), peerDatabase(), { environment, overlay, replica, routes }),
    ]);

    const { contentHash } = composeTariff({ overlay, routes });
    expect([left.status, right.status]).toContain('published');
    expect(left.activationId).toBe(right.activationId);
    expect(left.contentHash).toBe(contentHash);
    expect(right.contentHash).toBe(contentHash);
    const scheduledHead = await readHead();
    expect(scheduledHead.pendingActivationId).toBe(left.activationId);
    const activations = await database.execute(sql`
      select count(*)::int as count from billing.billing_policy_activation activation
      join billing.billing_policy policy on policy.id = activation.policy_id
      where activation.environment = ${environment} and policy.content_hash = ${contentHash}
    `);
    expect(activations[0]?.['count']).toBe(1);

    await service.cancelPendingActivation({
      environment,
      activationId: left.activationId,
      jobKey: `cleanup-race-${left.activationId}`,
      expectedHeadRevision: scheduledHead.revision,
    });
  });

  /* The head keeps naming a scheduled activation after it matures. Before this was filtered by time,
   * the next sync tried to cancel an effective activation, the database refused it, and every later
   * `migrate` failed. */
  it('supersedes a scheduled activation that has already matured instead of trying to cancel it', async () => {
    const scheduled = composeTariff({ overlay, routes: catalogue.slice(0, -3) });
    const head = await readHead();
    const clockRows = await database.execute(sql`select transaction_timestamp() as "now"`);
    const { now: databaseNow } = z.object({ now: z.coerce.date() }).parse(clockRows[0]);
    const activationId = `matures-${scheduled.contentHash.slice(0, 12)}`;
    await service.publishPolicy({
      policyJson: scheduled.canonicalContent,
      environment,
      activationId,
      jobKey: activationId,
      expectedHeadRevision: head.revision,
      ...(head.currentActivationId === null ? {} : { expectedPredecessorActivationId: head.currentActivationId }),
      effectiveAt: new Date(databaseNow.getTime() + 1000),
      replica,
    });
    const beforeMaturity = await readHead();
    expect(beforeMaturity.pendingActivationId).toBe(activationId);

    await wait(1500);
    const matured = await service.selectEffectivePolicy({ environment, replica });
    expect(matured.activationId).toBe(activationId);
    // The flag still names it; only a publication or a cancellation clears it.
    const staleFlag = await readHead();
    expect(staleFlag.pendingActivationId).toBe(activationId);

    const superseded = await sync(catalogue.slice(0, -4));
    expect(superseded).toMatchObject({ status: 'published' });
    const clearedHead = await readHead();
    expect(clearedHead.pendingActivationId).toBeNull();
    expect(clearedHead.currentActivationId).toBe(superseded.activationId);
  });

  it('cancels a scheduled rise that the code table reverts before it activates', async () => {
    const reverted = catalogue.slice(0, -4);
    const effectiveBefore = await service.selectEffectivePolicy({ environment, replica });
    const scheduled = await sync(raiseFirstRate(reverted, 4n));
    expect(scheduled.status).toBe('published');
    const scheduledHead = await readHead();
    expect(scheduledHead.pendingActivationId).toBe(scheduled.activationId);

    // The code table goes back to the tariff that is already effective.
    const result = await sync(reverted);
    expect(result).toEqual({
      status: 'unchanged',
      activationId: effectiveBefore.activationId,
      contentHash: effectiveBefore.contentHash,
    });
    const cancellations = await database.execute(sql`
      select activation_id as "activationId" from billing.billing_policy_activation_cancellation
      where environment = ${environment} and activation_id = ${scheduled.activationId}
    `);
    expect(cancellations).toHaveLength(1);
    const cleanHead = await readHead();
    expect(cleanHead.pendingActivationId).toBeNull();
  });
});
