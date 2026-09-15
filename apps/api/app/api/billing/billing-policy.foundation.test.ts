import postgres from 'postgres';
import { performance } from 'node:perf_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import type { CommercialPolicy } from '#api/billing/billing-policy.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
const testDatabaseUrl = databaseUrl ?? '';
const policy = (policyVersion: string): CommercialPolicy => ({
  schemaVersion: 1,
  environment: 'staging',
  policyVersion,
  markupBps: 3000,
  fleet: { minimumSchemaVersion: 1, meterContractIds: [] },
  rates: [],
  routes: [],
  offers: [
    {
      offerId: 'pro-monthly-v1',
      kind: 'pro_monthly',
      currency: 'usd',
      principalMinor: '2000',
      grantCreditAtoms: '20000000',
      ceilingCreditAtoms: '40000000',
    },
    {
      offerId: 'top-up-v1',
      kind: 'top_up',
      currency: 'usd',
      minimumPrincipalMinor: '500',
      maximumPrincipalMinor: '500000',
      creditAtomsPerPrincipalMinor: '10000',
    },
  ],
  promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
});

describe.runIf(databaseUrl !== undefined)('billing policy PostgreSQL foundation', () => {
  const clients: postgres.Sql[] = [];
  const services: BillingPolicyService[] = [];

  beforeAll(() => {
    for (let index = 0; index < 4; index += 1) {
      const client = postgres(testDatabaseUrl, { max: 1, prepare: false });
      clients.push(client);
      const database = drizzle(client, { schema });
      services.push(new BillingPolicyService({ database }));
    }
  });

  afterAll(async () => {
    await Promise.all(clients.map(async (client) => client.end()));
  });

  it('should publish P1 to P2 to P1 and converge conflicting jobs through the locked head', async () => {
    const replica = { schemaVersion: 1, meterContractIds: [] };
    await expect(services[0]!.selectEffectivePolicy({ environment: 'staging', replica })).rejects.toThrow(
      'no effective billing policy',
    );
    const p1 = await drizzle(clients[1]!, { schema }).transaction(async (transaction) => {
      await transaction.execute(sql`select transaction_timestamp()`);
      const published = await services[0]!.publishPolicy({
        policyJson: JSON.stringify(policy('P1')),
        environment: 'staging',
        activationId: 'activation-p1',
        jobKey: 'job-p1',
        expectedHeadRevision: 0n,
        replica,
      });
      const [visible] = await transaction.execute(sql`select count(*)::int as count
        from billing.billing_policy_activation where environment = 'staging'`);
      expect(visible!['count']).toBe(1);
      await expect(
        transaction.transaction(async (probe) =>
          services[1]!.selectEffectivePolicy({ environment: 'staging', replica }, probe),
        ),
      ).rejects.toThrow('billing policy temporal regression');
      return published;
    });
    expect(p1).toEqual({ activationId: 'activation-p1', headRevision: 1n, replay: false });
    const pinnedP1 = await services[0]!.selectEffectivePolicy({ environment: 'staging', replica });
    await expect(
      services[1]!.cancelPendingActivation({
        environment: 'staging',
        activationId: 'activation-p1',
        jobKey: 'cancel-effective-p1',
        expectedHeadRevision: 1n,
      }),
    ).rejects.toThrow('only a pending future activation');
    await expect(
      services[1]!.publishPolicy({
        policyJson: JSON.stringify(policy('conflict')),
        environment: 'staging',
        activationId: 'activation-conflict',
        jobKey: 'job-conflict',
        expectedHeadRevision: 0n,
        replica,
      }),
    ).rejects.toThrow('compare-and-swap');

    const p2 = await drizzle(clients[1]!, { schema }).transaction(async (oldTransaction) => {
      await oldTransaction.execute(sql`select transaction_timestamp()`);
      const published = await services[0]!.publishPolicy({
        policyJson: JSON.stringify(policy('P2')),
        environment: 'staging',
        activationId: 'activation-p2',
        jobKey: 'job-p2',
        expectedHeadRevision: 1n,
        expectedPredecessorActivationId: 'activation-p1',
        replica,
      });
      const [visible] = await oldTransaction.execute(sql`select count(*)::int as count
        from billing.billing_policy_activation where environment = 'staging'`);
      expect(visible!['count']).toBe(2);
      await expect(
        oldTransaction.transaction(async (probe) =>
          services[1]!.selectEffectivePolicy({ environment: 'staging', replica }, probe),
        ),
      ).rejects.toThrow('billing policy temporal regression');
      return published;
    });
    expect(p2.headRevision).toBe(2n);
    expect(pinnedP1).toMatchObject({ activationId: 'activation-p1', policy: { policyVersion: 'P1' } });
    expect(
      await services[1]!.selectEffectivePolicy({
        environment: 'staging',
        replica,
      }),
    ).toMatchObject({ activationId: 'activation-p2', policy: { policyVersion: 'P2' } });
    expect(
      await services[1]!.publishPolicy({
        policyJson: JSON.stringify(policy('P1')),
        environment: 'staging',
        activationId: 'activation-p1',
        jobKey: 'job-p1',
        expectedHeadRevision: 0n,
        replica,
      }),
    ).toEqual({ activationId: 'activation-p1', headRevision: 1n, replay: true });

    const p1Return = await services[1]!.publishPolicy({
      policyJson: JSON.stringify(policy('P1')),
      environment: 'staging',
      activationId: 'activation-p1-return',
      jobKey: 'job-p1-return',
      expectedHeadRevision: 2n,
      expectedPredecessorActivationId: 'activation-p2',
      replica,
    });
    expect(p1Return).toEqual({ activationId: 'activation-p1-return', headRevision: 3n, replay: false });
    expect(
      await services[0]!.publishPolicy({
        policyJson: JSON.stringify(policy('P1')),
        environment: 'staging',
        activationId: 'activation-p1-return',
        jobKey: 'job-p1-return',
        expectedHeadRevision: 2n,
        expectedPredecessorActivationId: 'activation-p2',
        replica,
      }),
    ).toEqual({ activationId: 'activation-p1-return', headRevision: 3n, replay: true });
    await expect(
      services[0]!.publishPolicy({
        policyJson: JSON.stringify(policy('changed-replay')),
        environment: 'staging',
        activationId: 'activation-p1-return',
        jobKey: 'job-p1-return',
        expectedHeadRevision: 2n,
        expectedPredecessorActivationId: 'activation-p2',
        replica,
      }),
    ).rejects.toThrow('job key conflicts');
    await expect(
      clients[0]!`update billing.billing_policy set canonical_content = '{}' where environment = 'staging' and policy_version = 'P1'`,
    ).rejects.toThrow('immutable');

    await services[0]!.publishPolicy({
      policyJson: JSON.stringify({ ...policy('staging-p2'), environment: 'staging' }),
      environment: 'staging',
      activationId: 'staging-p2',
      jobKey: 'staging-job-p2',
      expectedHeadRevision: 3n,
      expectedPredecessorActivationId: 'activation-p1-return',
      effectiveAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
      replica,
    });
    const [futureHead] = await clients[2]!`select revision, observed_activation_id as "observedActivationId"
      from billing.billing_policy_head where environment = 'staging'`;
    expect(futureHead).toMatchObject({ revision: '4', observedActivationId: 'activation-p1-return' });
    await expect(
      services[1]!.publishPolicy({
        policyJson: JSON.stringify({ ...policy('staging-p3'), environment: 'staging' }),
        environment: 'staging',
        activationId: 'staging-p3',
        jobKey: 'staging-job-p3',
        expectedHeadRevision: 4n,
        expectedPredecessorActivationId: 'staging-p2',
        effectiveAt: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000),
        replica,
      }),
    ).rejects.toThrow('already pending');

    const cancellation = await services[1]!.cancelPendingActivation({
      environment: 'staging',
      activationId: 'staging-p2',
      jobKey: 'staging-cancel-p2',
      expectedHeadRevision: 4n,
    });
    expect(cancellation).toEqual({ activationId: 'staging-p2', headRevision: 5n, replay: false });
    const [cancelledHead] = await clients[2]!`select revision, observed_activation_id as "observedActivationId"
      from billing.billing_policy_head where environment = 'staging'`;
    expect(cancelledHead).toMatchObject({ revision: '5', observedActivationId: 'activation-p1-return' });
    const [afterCancellation] = await clients[2]!`select billing.observe_policy('staging') as id`;
    expect(afterCancellation!['id']).toBe('activation-p1-return');
    await services[0]!.publishPolicy({
      policyJson: JSON.stringify(policy('post-cancellation')),
      environment: 'staging',
      activationId: 'post-cancellation',
      jobKey: 'post-cancellation-job',
      expectedHeadRevision: 5n,
      expectedPredecessorActivationId: 'activation-p1-return',
      replica,
    });
    expect(
      await services[0]!.cancelPendingActivation({
        environment: 'staging',
        activationId: 'staging-p2',
        jobKey: 'staging-cancel-p2',
        expectedHeadRevision: 4n,
      }),
    ).toEqual({ activationId: 'staging-p2', headRevision: 5n, replay: true });
    expect(
      await services[0]!.selectEffectivePolicy({
        environment: 'staging',
        replica,
      }),
    ).toMatchObject({ activationId: 'post-cancellation' });
  });
  it('should reject cancellation queued before an activation that becomes effective while the head is locked', async () => {
    const replica = { schemaVersion: 1, meterContractIds: [] };
    const [deadline] = await clients[2]!`select (clock_timestamp() + interval '2 seconds') as at`;
    const effectiveAt = new Date(String(deadline!['at']));
    await services[0]!.publishPolicy({
      policyJson: JSON.stringify(policy('queued-activation')),
      environment: 'staging',
      activationId: 'queued-activation',
      jobKey: 'queued-activation',
      expectedHeadRevision: 6n,
      expectedPredecessorActivationId: 'post-cancellation',
      effectiveAt,
      replica,
    });
    const [backend] = await clients[1]!`select pg_backend_pid() as pid`;
    const pid = Number(backend!['pid']);
    let cancellation: Promise<string> | undefined;
    await drizzle(clients[0]!, { schema }).transaction(async (holder) => {
      await holder.execute(
        sql`select environment from billing.billing_policy_head where environment = 'staging' for update`,
      );
      cancellation = services[1]!
        .cancelPendingActivation({
          environment: 'staging',
          activationId: 'queued-activation',
          jobKey: 'queued-cancellation',
          expectedHeadRevision: 7n,
        })
        .then(
          () => 'accepted',
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        );
      const started = performance.now();
      let boundaryReached = false;
      while (performance.now() - started < 5000) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- observe the blocked transaction crossing its deadline before releasing its lock
        const [state] = await clients[2]!`select wait_event_type, xact_start::text,
          clock_timestamp()::text as wall,
          xact_start < ${effectiveAt.toISOString()}::timestamptz as started_before,
          clock_timestamp() >= ${effectiveAt.toISOString()}::timestamptz as now_effective
          from pg_stat_activity where pid = ${pid}`;
        if (
          state!['wait_event_type'] === 'Lock' &&
          state!['started_before'] === true &&
          state!['now_effective'] === true
        ) {
          boundaryReached = true;
          break;
        }
      }
      expect(boundaryReached).toBe(true);
    });
    expect(await cancellation).toBe('only a pending future activation can be cancelled');
    const transitions = await Promise.all([
      services[0]!.selectEffectivePolicy({ environment: 'staging', replica }),
      services[2]!.selectEffectivePolicy({ environment: 'staging', replica }),
    ]);
    expect(transitions.map(({ activationId }) => activationId)).toEqual(['queued-activation', 'queued-activation']);
    await expect(
      services[0]!.cancelPendingActivation({
        environment: 'staging',
        activationId: 'queued-activation',
        jobKey: 'cancel-observed-activation',
        expectedHeadRevision: 7n,
      }),
    ).rejects.toThrow('only a pending future activation can be cancelled');
  });

  it('should keep stable reads lock-free and leave publication state unchanged', async () => {
    const replica = { schemaVersion: 1, meterContractIds: [] };
    const [missing] = await clients[2]!`select billing.observe_policy('unknown-environment') as id`;
    expect(missing!['id']).toBeNull();
    const [before] = await clients[2]!`select revision, current_activation_id, pending_activation_id,
      observed_activation_id from billing.billing_policy_head where environment = 'staging'`;
    await drizzle(clients[1]!, { schema }).transaction(async (stableTransaction) => {
      await expect(
        services[1]!.selectEffectivePolicy({ environment: 'staging', replica }, stableTransaction),
      ).resolves.toMatchObject({
        activationId: 'queued-activation',
      });
      await expect(
        clients[2]!`select environment from billing.billing_policy_head
          where environment = 'staging' for update nowait`,
      ).resolves.toHaveLength(1);
    });
    const [after] = await clients[2]!`select revision, current_activation_id, pending_activation_id,
      observed_activation_id from billing.billing_policy_head where environment = 'staging'`;
    expect(after).toEqual(before);
  });

  it('should serialize cancellation and selection in both commit orders', async () => {
    const replica = { schemaVersion: 1, meterContractIds: [] };
    const [cancelDeadline] = await clients[3]!`select (clock_timestamp() + interval '2 seconds') as at`;
    const cancelEffectiveAt = new Date(String(cancelDeadline!['at']));
    await services[0]!.publishPolicy({
      policyJson: JSON.stringify(policy('cancel-wins')),
      environment: 'staging',
      activationId: 'cancel-wins',
      jobKey: 'cancel-wins-publication',
      expectedHeadRevision: 7n,
      expectedPredecessorActivationId: 'queued-activation',
      effectiveAt: cancelEffectiveAt,
      replica,
    });
    const [selectorBackend] = await clients[1]!`select pg_backend_pid() as pid`;
    const selectorPid = Number(selectorBackend!['pid']);
    let blockedSelection: Promise<Awaited<ReturnType<BillingPolicyService['selectEffectivePolicy']>>> | undefined;
    await drizzle(clients[0]!, { schema }).transaction(async (cancellation) => {
      await cancellation.execute(sql`insert into billing.billing_policy_activation_cancellation
        (environment, activation_id, job_key, request_hash, cancelled_at)
        values ('staging', 'cancel-wins', 'cancel-wins-job', 'cancel-wins-request', clock_timestamp())`);
      await cancellation.execute(sql`update billing.billing_policy_head set revision = 9,
        current_activation_id = 'queued-activation', pending_activation_id = null where environment = 'staging'`);
      let deadlineReached = false;
      const started = performance.now();
      while (performance.now() - started < 5000) {
        const [clock] =
          // oxlint-disable-next-line eslint/no-await-in-loop -- bounded DB-clock observation coordinates the temporal boundary
          await clients[3]!`select clock_timestamp() >= ${cancelEffectiveAt.toISOString()}::timestamptz as reached`;
        if (clock!['reached'] === true) {
          deadlineReached = true;
          break;
        }
      }
      expect(deadlineReached).toBe(true);
      blockedSelection = services[1]!.selectEffectivePolicy({ environment: 'staging', replica });
      let selectorBlocked = false;
      const waitStarted = performance.now();
      while (performance.now() - waitStarted < 5000) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- observe the selector queued on the shared transition lock
        const [state] = await clients[3]!`select wait_event_type from pg_stat_activity where pid = ${selectorPid}`;
        if (state!['wait_event_type'] === 'Lock') {
          selectorBlocked = true;
          break;
        }
      }
      expect(selectorBlocked).toBe(true);
    });
    await expect(blockedSelection).resolves.toMatchObject({ activationId: 'queued-activation' });

    const [selectionDeadline] = await clients[3]!`select (clock_timestamp() + interval '2 seconds') as at`;
    const selectionEffectiveAt = new Date(String(selectionDeadline!['at']));
    await services[0]!.publishPolicy({
      policyJson: JSON.stringify(policy('selection-wins')),
      environment: 'staging',
      activationId: 'selection-wins',
      jobKey: 'selection-wins-publication',
      expectedHeadRevision: 9n,
      expectedPredecessorActivationId: 'queued-activation',
      effectiveAt: selectionEffectiveAt,
      replica,
    });
    let selectionDeadlineReached = false;
    const selectionStarted = performance.now();
    while (performance.now() - selectionStarted < 5000) {
      const [clock] =
        // oxlint-disable-next-line eslint/no-await-in-loop -- bounded DB-clock observation coordinates the temporal boundary
        await clients[3]!`select clock_timestamp() >= ${selectionEffectiveAt.toISOString()}::timestamptz as reached`;
      if (clock!['reached'] === true) {
        selectionDeadlineReached = true;
        break;
      }
    }
    expect(selectionDeadlineReached).toBe(true);
    const [cancellationBackend] = await clients[2]!`select pg_backend_pid() as pid`;
    const cancellationPid = Number(cancellationBackend!['pid']);
    let blockedCancellation: Promise<string> | undefined;
    await drizzle(clients[0]!, { schema }).transaction(async (selection) => {
      await expect(
        services[0]!.selectEffectivePolicy({ environment: 'staging', replica }, selection),
      ).resolves.toMatchObject({ activationId: 'selection-wins' });
      blockedCancellation = services[2]!
        .cancelPendingActivation({
          environment: 'staging',
          activationId: 'selection-wins',
          jobKey: 'selection-loses-cancellation',
          expectedHeadRevision: 10n,
        })
        .then(
          () => 'accepted',
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        );
      let cancellationBlocked = false;
      const waitStarted = performance.now();
      while (performance.now() - waitStarted < 5000) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- observe cancellation queued behind the selected transition
        const [state] = await clients[3]!`select wait_event_type from pg_stat_activity where pid = ${cancellationPid}`;
        if (state!['wait_event_type'] === 'Lock') {
          cancellationBlocked = true;
          break;
        }
      }
      expect(cancellationBlocked).toBe(true);
    });
    expect(await blockedCancellation).toBe('only a pending future activation can be cancelled');
  });

  it('should converge two selectors already waiting on one transition', async () => {
    const replica = { schemaVersion: 1, meterContractIds: [] };
    const [deadline] = await clients[3]!`select (clock_timestamp() + interval '2 seconds') as at`;
    const effectiveAt = new Date(String(deadline!['at']));
    await services[0]!.publishPolicy({
      policyJson: JSON.stringify(policy('two-selectors')),
      environment: 'staging',
      activationId: 'two-selectors',
      jobKey: 'two-selectors-publication',
      expectedHeadRevision: 10n,
      expectedPredecessorActivationId: 'selection-wins',
      effectiveAt,
      replica,
    });
    let deadlineReached = false;
    const started = performance.now();
    let firstObservation: string | undefined;
    let lastObservation: string | undefined;
    let observations = 0;
    let queryMilliseconds = 0;
    let longestQueryMilliseconds = 0;
    while (performance.now() - started < 5000) {
      const queryStarted = performance.now();
      const [clock] =
        // oxlint-disable-next-line eslint/no-await-in-loop -- bounded DB-clock observation coordinates the temporal boundary
        await clients[3]!`select clock_timestamp() >= ${effectiveAt.toISOString()}::timestamptz as reached,
          clock_timestamp()::text as observed_at`;
      const duration = performance.now() - queryStarted;
      observations += 1;
      queryMilliseconds += duration;
      longestQueryMilliseconds = Math.max(longestQueryMilliseconds, duration);
      firstObservation ??= String(clock!['observed_at']);
      lastObservation = String(clock!['observed_at']);
      if (clock!['reached'] === true) {
        deadlineReached = true;
        break;
      }
    }
    if (!deadlineReached) {
      const observation = await clients[3]!`select h.current_activation_id, h.observed_activation_id,
        o.effective_at::text as observed_effective, o.created_at::text as observed_created,
        c.id as candidate_id, c.effective_at::text as candidate_effective, c.created_at::text as candidate_created
        from billing.billing_policy_head h
        left join billing.billing_policy_activation o on o.id = h.observed_activation_id
        left join lateral (select a.* from billing.billing_policy_activation a
          where a.environment = h.environment and a.effective_at <= transaction_timestamp()
            and not exists (select from billing.billing_policy_activation_cancellation x where x.activation_id = a.id)
          order by a.effective_at desc, a.created_at desc limit 1) c on true where h.environment = 'staging'`;
      console.error(
        'Billing selector synchronization failed',
        JSON.stringify({
          deadline: effectiveAt.toISOString(),
          firstObservation,
          lastObservation,
          observations,
          elapsedMilliseconds: performance.now() - started,
          queryMilliseconds,
          longestQueryMilliseconds,
          observation,
        }),
      );
    }
    expect(deadlineReached).toBe(true);
    const [leftBackend] = await clients[1]!`select pg_backend_pid() as pid`;
    const [rightBackend] = await clients[2]!`select pg_backend_pid() as pid`;
    let selectors: Promise<Array<Awaited<ReturnType<BillingPolicyService['selectEffectivePolicy']>>>> | undefined;
    await drizzle(clients[0]!, { schema }).transaction(async (holder) => {
      await holder.execute(
        sql`select environment from billing.billing_policy_head where environment = 'staging' for update`,
      );
      selectors = Promise.all([
        services[1]!.selectEffectivePolicy({ environment: 'staging', replica }),
        services[2]!.selectEffectivePolicy({ environment: 'staging', replica }),
      ]);
      let blockedCount = 0;
      const waitStarted = performance.now();
      while (performance.now() - waitStarted < 5000) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- require both selectors queued before releasing the transition lock
        const [state] = await clients[3]!`select count(*)::int as count from pg_stat_activity
          where pid in (${Number(leftBackend!['pid'])}, ${Number(rightBackend!['pid'])}) and wait_event_type = 'Lock'`;
        blockedCount = Number(state!['count']);
        if (blockedCount === 2) {
          break;
        }
      }
      expect(blockedCount).toBe(2);
    });
    const selected = await selectors;
    expect(selected?.map(({ activationId }) => activationId)).toEqual(['two-selectors', 'two-selectors']);
  });

  it('should roll back a transition marker with its owning transaction and reject ambiguous activations', async () => {
    const [baseline] = await clients[2]!`select observed_activation_id
      from billing.billing_policy_head where environment = 'staging'`;
    await expect(
      drizzle(clients[0]!, { schema }).transaction(async (transaction) => {
        await transaction.execute(sql`insert into billing.billing_policy_activation
          (id, environment, policy_id, job_key, request_hash, expected_predecessor_activation_id,
            announced_at, effective_at, created_at)
          select 'rollback-activation', 'staging', policy_id, 'rollback-job', 'rollback-request',
            'queued-activation', transaction_timestamp(), transaction_timestamp(), clock_timestamp()
          from billing.billing_policy_activation where environment = 'staging' and id = 'queued-activation'`);
        await transaction.execute(sql`update billing.billing_policy_head
          set current_activation_id = 'rollback-activation' where environment = 'staging'`);
        const [observed] = await transaction.execute(sql`select billing.observe_policy('staging') as id`);
        expect(observed!['id']).toBe('rollback-activation');
        throw new Error('roll back observed transition');
      }),
    ).rejects.toThrow('roll back observed transition');
    const [afterRollback] = await clients[2]!`select observed_activation_id
      from billing.billing_policy_head where environment = 'staging'`;
    expect(afterRollback).toEqual(baseline);

    await expect(
      drizzle(clients[0]!, { schema }).transaction(async (transaction) => {
        await transaction.execute(sql`with instant as (select transaction_timestamp() as at)
          insert into billing.billing_policy_activation
            (id, environment, policy_id, job_key, request_hash, expected_predecessor_activation_id,
              announced_at, effective_at, created_at)
          select identity.id, 'staging', activation.policy_id, identity.job_key, identity.request_hash,
            'queued-activation', instant.at, instant.at, instant.at
          from billing.billing_policy_activation activation cross join instant
          cross join (values ('ambiguous-a','ambiguous-job-a','ambiguous-request-a'),
            ('ambiguous-b','ambiguous-job-b','ambiguous-request-b')) identity(id,job_key,request_hash)
          where activation.environment = 'staging' and activation.id = 'queued-activation'`);
        await services[0]!.selectEffectivePolicy(
          { environment: 'staging', replica: { schemaVersion: 1, meterContractIds: [] } },
          transaction,
        );
      }),
    ).rejects.toThrow('ambiguous billing policy activation');
    const [afterAmbiguity] = await clients[2]!`select observed_activation_id
      from billing.billing_policy_head where environment = 'staging'`;
    expect(afterAmbiguity).toEqual(baseline);
  });
});
