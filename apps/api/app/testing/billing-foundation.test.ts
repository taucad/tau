import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '#database/schema.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { setTimeout as wait } from 'node:timers/promises';
import { afterAll, describe, expect, it, onTestFinished } from 'vitest';
import { installBillingProtections } from '#database/billing-protections.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl || !process.env['BILLING_TEST_OWNED']) {
  throw new Error('Use the isolated billing launcher');
}
const client = postgres(databaseUrl, {
  max: 1,
  onnotice() {
    /* Expected fixture DDL notices are not diagnostics. */
  },
});
afterAll(async () => client.end());

const launchPolicy = {
  schemaVersion: 1,
  environment: 'prod-eu',
  policyVersion: 'command-launch',
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
};

describe('billing database protections and real command', () => {
  it('should refuse every billing command before opening a database when Cloud is disabled', () => {
    const childEnvironment: Record<string, string | undefined> = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment key
      PATH: process.env['PATH'],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment key
      TAU_CLOUD_ENABLED: 'false',
    };
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../../dist/billing-command.js'), 'protect'],
      {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- raw process environments contain strings before schema parsing
        env: childEnvironment as NodeJS.ProcessEnv,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('billing-command requires TAU_CLOUD_ENABLED=true');
  });

  it('should run the credential-free recovery worker and stop cleanly', async () => {
    const childEnvironment: Record<string, string | undefined> = {};
    childEnvironment['PATH'] = process.env['PATH'];
    childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
    childEnvironment['BILLING_ENVIRONMENT'] = 'prod-eu';
    childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
    childEnvironment['OTEL_METRICS_PORT'] = '0';
    const child = spawn(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../dist/billing-command.js'),
        'recover-llm-worker',
        '--environment',
        'prod-eu',
        '--limit',
        '100',
        '--poll-milliseconds',
        '10',
      ],
      {
        // No Redis, application or model-provider credentials are available to this process.
        env: childEnvironment as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    try {
      const [chunk] = (await once(child.stdout, 'data')) as unknown[];
      expect(JSON.parse(String(chunk))).toMatchObject({
        event: 'billing.llm_recovery_batch',
        environment: 'prod-eu',
        failed: 0,
      });
      child.kill('SIGTERM');
      const [code, signal] = (await once(child, 'close')) as unknown[];
      expect({ code, signal, stderr }).toEqual({ code: 0, signal: null, stderr: '' });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('should run payment recovery and journal reconciliation on the operations worker', async () => {
    const childEnvironment: Record<string, string | undefined> = {};
    childEnvironment['PATH'] = process.env['PATH'];
    childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
    childEnvironment['BILLING_ENVIRONMENT'] = 'prod-us';
    childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
    childEnvironment['STRIPE_READ_SECRET_KEY'] = 'rk_test_operations_worker';
    childEnvironment['STRIPE_ACCOUNT_ID'] = 'acct_operations_worker';
    childEnvironment['STRIPE_LIVEMODE'] = 'false';
    childEnvironment['OTEL_METRICS_PORT'] = '0';
    const child = spawn(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../dist/billing-command.js'),
        'billing-operations-worker',
        '--environment',
        'prod-us',
        '--limit',
        '100',
        '--poll-milliseconds',
        '1000',
      ],
      {
        // The empty environment has no payment sources, so this verifies scheduling without provider I/O.
        env: childEnvironment as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    try {
      const deadline = Date.now() + 10_000;
      while (!stdout.includes('billing.payment_recovery_batch') || !stdout.includes('billing.journal_reconciliation')) {
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for billing operations worker: ${stdout}\n${stderr}`);
        }
        // oxlint-disable-next-line no-await-in-loop -- the probe waits for both first-cycle events
        await wait(25);
      }
      const events = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'billing.payment_recovery_batch',
            environment: 'prod-us',
            failed: 0,
          }),
          expect.objectContaining({
            event: 'billing.journal_reconciliation',
            environment: 'prod-us',
          }),
        ]),
      );
      child.kill('SIGTERM');
      const [code, signal] = (await once(child, 'close')) as unknown[];
      expect({ code, signal, stderr }).toEqual({ code: 0, signal: null, stderr: '' });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('should publish a Cloud-only proposal through the built DB-only command and reject environment mismatch', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-billing-command-'));
    const file = join(directory, 'policy.json');
    writeFileSync(file, JSON.stringify(launchPolicy));
    const args = [
      resolve(import.meta.dirname, '../../dist/billing-command.js'),
      'publish',
      '--file',
      file,
      '--environment',
      'prod-eu',
      '--activation-id',
      'command-activation',
      '--job-key',
      'command-job',
      '--expected-head-revision',
      '0',
      '--expected-predecessor-activation-id',
      'none',
      '--announced-at',
      'now',
      '--effective-at',
      'now',
    ];
    const commandEnvironment = { ...process.env };
    for (const key of Object.keys(commandEnvironment)) {
      if (key !== 'PATH') {
        Reflect.deleteProperty(commandEnvironment, key);
      }
    }
    try {
      const run = (environment: string) => {
        const childEnvironment = {
          ...commandEnvironment,
          ...Object.fromEntries([
            ['BILLING_DATABASE_URL', databaseUrl],
            ['BILLING_ENVIRONMENT', environment],
            ['TAU_CLOUD_ENABLED', 'true'],
          ]),
        };
        return spawnSync(process.execPath, args, {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- sanitized child intentionally excludes ambient API configuration
          env: childEnvironment as NodeJS.ProcessEnv,
          encoding: 'utf8',
        });
      };
      const first = run('prod-eu');
      expect(first.stderr).toBe('');
      expect(first.status).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({
        activationId: 'command-activation',
        headRevision: '1',
        replay: false,
      });
      expect(JSON.parse(run('prod-eu').stdout)).toMatchObject({ replay: true });
      expect(run('staging').status).toBe(1);
      const duplicateEnvironment = {
        ...commandEnvironment,
        ...Object.fromEntries([
          ['BILLING_DATABASE_URL', databaseUrl],
          ['BILLING_ENVIRONMENT', 'prod-eu'],
          ['TAU_CLOUD_ENABLED', 'true'],
        ]),
      };
      const duplicate = spawnSync(process.execPath, [...args, '--environment', 'prod-us'], {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- sanitized child intentionally excludes ambient API configuration
        env: duplicateEnvironment as NodeJS.ProcessEnv,
        encoding: 'utf8',
      });
      expect(duplicate.status).toBe(1);
      expect(duplicate.stderr).toContain('Duplicate command options');
      const foreign =
        await client`SELECT id FROM billing.billing_policy_activation WHERE id = 'command-activation' AND environment <> 'prod-eu'`;
      expect(foreign).toHaveLength(0);
      const rows =
        await client`SELECT content_hash, canonical_content FROM billing.billing_policy WHERE environment = 'prod-eu'`;
      expect(rows).toHaveLength(1);
      expect(JSON.parse(String(rows[0]?.['canonical_content']))).toEqual(launchPolicy);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should provision an exact supplier budget proposal idempotently and reject drift', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-billing-budgets-'));
    const file = join(directory, 'budgets.json');
    const proposal = {
      schemaVersion: 1,
      environment: 'prod-eu',
      funding: [
        { id: 'command-spend-funding', kind: 'spend', scope: 'command', fundedLifetime: '500000000000000' },
        { id: 'command-risk-funding', kind: 'risk', scope: 'command', fundedLifetime: '500000000000000' },
      ],
      budgets: [
        {
          id: 'command-spend',
          fundingId: 'command-spend-funding',
          kind: 'spend',
          scope: 'command',
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2030-01-01T00:00:00.000Z',
          quantum: 'pico_usd',
          approvedCap: '500000000000000',
        },
        {
          id: 'command-risk',
          fundingId: 'command-risk-funding',
          kind: 'risk',
          scope: 'command',
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2030-01-01T00:00:00.000Z',
          quantum: 'pico_usd',
          approvedCap: '500000000000000',
        },
      ],
    };
    const environment = Object.fromEntries([
      ['PATH', process.env['PATH']],
      ['BILLING_DATABASE_URL', databaseUrl],
      ['BILLING_ENVIRONMENT', 'prod-eu'],
      ['TAU_CLOUD_ENABLED', 'true'],
    ]);
    const run = () =>
      spawnSync(
        process.execPath,
        [
          resolve(import.meta.dirname, '../../dist/billing-command.js'),
          'provision-budgets',
          '--environment',
          'prod-eu',
          '--file',
          file,
        ],
        {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the child receives only string variables
          env: environment as NodeJS.ProcessEnv,
          encoding: 'utf8',
        },
      );
    try {
      writeFileSync(file, JSON.stringify(proposal));
      expect(run()).toMatchObject({ status: 0, stderr: '' });
      expect(JSON.parse(run().stdout)).toEqual({
        environment: 'prod-eu',
        budgets: ['command-spend', 'command-risk'],
      });
      writeFileSync(
        file,
        JSON.stringify({
          ...proposal,
          budgets: proposal.budgets.map((budget) =>
            budget.kind === 'spend' ? { ...budget, approvedCap: '499999999999999' } : budget,
          ),
        }),
      );
      const drift = run();
      expect(drift.status).toBe(1);
      expect(drift.stderr).toContain('Existing billing budget differs from proposal: command-spend');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should enforce financial constraints and deny runtime mutation of immutable facts', async () => {
    const account = randomUUID();
    const otherAccount = randomUUID();
    const policy = randomUUID();
    const activation = randomUUID();
    const operation = randomUUID();
    await client`INSERT INTO billing.credit_account(id,environment) VALUES (${account},'prod-us'),(${otherAccount},'prod-us')`;
    await client`INSERT INTO billing.billing_policy(id,environment,policy_version,schema_version,content_hash,canonical_content)
      VALUES (${policy},'prod-us',${policy},1,${policy},'{}')`;
    await client`INSERT INTO billing.billing_policy_activation(id,environment,policy_id,job_key,request_hash,announced_at,effective_at)
      VALUES (${activation},'prod-us',${policy},${activation},${activation},now(),now())`;
    const spendHold = randomUUID();
    const riskHold = randomUUID();
    await client.begin(async (transaction) => {
      await Promise.all(
        ['spend', 'risk'].map(async (kind) => {
          const funding = `${operation}-${kind}-funding`;
          const budget = `${operation}-${kind}-budget`;
          await transaction`INSERT INTO billing.billing_budget_funding(id,environment,kind,scope,funded_lifetime)
          VALUES (${funding},'prod-us',${kind},${operation},0)`;
          await transaction`INSERT INTO billing.billing_budget(id,environment,funding_id,kind,scope,period_start,period_end,quantum,approved_cap)
          VALUES (${budget},'prod-us',${funding},${kind},${operation},now(),now()+interval '1 day','pico_usd',0)`;
        }),
      );
      await transaction`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,request_key_version,
      category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,
      purchased_held_atoms,spend_budget_hold_id,risk_budget_hold_id,due_at)
      VALUES (${operation},${account},'prod-us','fixture',${operation},'digest',1,'llm','fixture','fixture','[]','[]','test',${policy},${activation},
      'fixture',0,0,0,0,${spendHold},${riskHold},now())`;

      await transaction`INSERT INTO billing.billing_budget_hold(id,budget_id,operation_id,initial_bound,remaining_held)
        VALUES (${spendHold},${`${operation}-spend-budget`},${operation},0,0),(${riskHold},${`${operation}-risk-budget`},${operation},0,0)`;
    });
    await expect(client`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,request_key_version,
      category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,
      purchased_held_atoms,spend_budget_hold_id,risk_budget_hold_id,due_at)
      VALUES (${randomUUID()},${account},'prod-us','fixture','wrong-holds','digest',1,'llm','fixture','fixture','[]','[]','test',${policy},${activation},
      'fixture',0,0,0,0,${spendHold},${riskHold},now())`).rejects.toMatchObject({ code: '23503' });
    await expect(client`UPDATE billing.credit_account SET promo_atoms=-1 WHERE id=${account}`).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      client`UPDATE billing.credit_account SET promo_held_atoms=1 WHERE id=${account}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(client`UPDATE billing.credit_operation SET customer_state='released', resolved_at=now(),base_transaction_id='missing'
      WHERE id=${operation}`).rejects.toMatchObject({ code: '23514' });
    await expect(client`INSERT INTO billing.credit_transaction(id,account_id,revision,kind,operation_id,promo_delta_atoms,
      plan_delta_atoms,purchased_delta_atoms,debt_delta_atoms,account_delta_atoms,balance_after_atoms,occurred_at)
      VALUES (${randomUUID()},${otherAccount},1,'operation_resolution',${operation},0,0,0,0,0,0,now())`).rejects.toMatchObject(
      { code: '23503' },
    );
    await expect(
      client`UPDATE billing.billing_policy SET canonical_content='changed' WHERE id=${policy}`,
    ).rejects.toMatchObject({ code: '23514' });
    const authUser = randomUUID();
    const newAuthUser = randomUUID();
    const binding = randomUUID();
    const email = `${authUser}@test.invalid`;
    await client`INSERT INTO public."user"(id,name,email) VALUES (${authUser},'Financial identity fixture',${email})`;
    await client`INSERT INTO billing.billing_owner_binding(id,environment,account_id,auth_user_id)
      VALUES (${binding},'prod-us',${account},${authUser})`;
    await expect(client`DELETE FROM public."user" WHERE id=${authUser}`).rejects.toMatchObject({ code: '23514' });
    const closure = new BillingAccountClosureService(
      { database: drizzle(client, { schema }) },
      {
        recoverAndCancel: async () => {
          throw new Error('Fixture has no subscription to cancel');
        },
      },
      'prod-us',
    );
    await closure.prepareForAuthDeletion({ authUserId: authUser });
    await client`DELETE FROM public."user" WHERE id=${authUser}`;
    await client`INSERT INTO public."user"(id,name,email) VALUES (${newAuthUser},'Same email new identity',${email})`;
    const tombstone =
      await client`SELECT auth_user_id, revoked_at IS NOT NULL AS revoked FROM billing.billing_owner_binding WHERE id=${binding}`;
    expect(tombstone[0]?.['auth_user_id']).toBeNull();
    expect(tombstone[0]?.['revoked']).toBe(true);
    expect(await client`SELECT id FROM billing.credit_operation WHERE id=${operation}`).toHaveLength(1);
    await expect(
      client`UPDATE billing.billing_owner_binding SET auth_user_id=${newAuthUser} WHERE id=${binding}`,
    ).rejects.toMatchObject({ code: '23514' });
    const runtime = postgres(databaseUrl, { max: 1, connection: { role: 'tau_billing_runtime' } });
    try {
      await expect(
        runtime`UPDATE billing.billing_policy SET canonical_content='changed' WHERE id=${policy}`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(runtime`DELETE FROM billing.credit_account WHERE id=${account}`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(runtime`TRUNCATE billing.credit_transaction`).rejects.toMatchObject({ code: '42501' });
      await expect(runtime`CREATE TABLE billing.runtime_escape(id text)`).rejects.toMatchObject({ code: '42501' });
      await expect(
        runtime`UPDATE billing.credit_operation SET request_digest='changed' WHERE id=${operation}`,
      ).rejects.toMatchObject({ code: '42501' });
      const rows = await runtime`SELECT revision FROM billing.credit_account WHERE id=${account}`;
      expect(rows[0]?.['revision']).toBe('0');
    } finally {
      await runtime.end();
    }
  });

  it('should constrain policy observation and cancellation to protected role capabilities', async () => {
    const policy = randomUUID();
    const activation = randomUUID();
    await client`INSERT INTO billing.billing_policy(id,environment,policy_version,schema_version,content_hash,canonical_content)
      VALUES (${policy},'prod-us',${policy},1,${policy},'{}')`;
    await client`INSERT INTO billing.billing_policy_activation(id,environment,policy_id,job_key,request_hash,announced_at,effective_at)
      VALUES (${activation},'prod-us',${policy},${activation},${activation},transaction_timestamp(),transaction_timestamp())`;
    await client`INSERT INTO billing.billing_policy_head(environment,revision,current_activation_id)
      VALUES ('prod-us',1,${activation})`;

    const runtime = postgres(databaseUrl, { max: 1, connection: { role: 'tau_billing_runtime' } });
    const publisher = postgres(databaseUrl, { max: 1, connection: { role: 'tau_billing_policy_publisher' } });
    try {
      const [privileges] = await client`SELECT
        has_function_privilege('tau_billing_runtime','billing.observe_policy(text)','EXECUTE') AS runtime,
        has_function_privilege('tau_billing_policy_publisher','billing.observe_policy(text)','EXECUTE') AS publisher,
        NOT EXISTS (
          SELECT FROM pg_catalog.pg_proc p,
            LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          WHERE p.oid='billing.observe_policy(text)'::regprocedure
            AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
        ) AS "publicRevoked"`;
      expect(privileges).toEqual({ runtime: true, publisher: true, publicRevoked: true });

      expect(await runtime`SELECT billing.observe_policy('prod-us') AS id`).toEqual([{ id: activation }]);
      expect(await publisher`SELECT billing.observe_policy('prod-us') AS id`).toEqual([{ id: activation }]);
      expect(await runtime`SELECT billing.observe_policy('not-an-environment') AS id`).toEqual([{ id: null }]);
      await expect(runtime`SELECT billing.observe_policy('prod-us',${activation})`).rejects.toMatchObject({
        code: '42883',
      });
      await expect(
        runtime`UPDATE billing.billing_policy_head SET observed_activation_id=NULL WHERE environment='prod-us'`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        publisher`UPDATE billing.billing_policy_head SET observed_activation_id=NULL WHERE environment='prod-us'`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        publisher`INSERT INTO billing.billing_policy_head(environment,revision,current_activation_id,observed_activation_id)
          VALUES ('prod-us',2,${activation},${activation})`,
      ).rejects.toMatchObject({ code: '42501' });

      await client`UPDATE billing.billing_policy_head
        SET current_activation_id=${activation},pending_activation_id=${activation} WHERE environment='prod-us'`;
      await expect(
        publisher`INSERT INTO billing.billing_policy_activation_cancellation(environment,activation_id,job_key,request_hash,cancelled_at)
          VALUES ('prod-us',${activation},${randomUUID()},${randomUUID()},clock_timestamp())`,
      ).rejects.toThrow('only a pending future activation can be cancelled');

      const futurePolicy = randomUUID();
      const futureActivation = randomUUID();
      await client`INSERT INTO billing.billing_policy(id,environment,policy_version,schema_version,content_hash,canonical_content)
        VALUES (${futurePolicy},'prod-us',${futurePolicy},1,${futurePolicy},'{}')`;
      await client`INSERT INTO billing.billing_policy_activation(id,environment,policy_id,job_key,request_hash,announced_at,effective_at)
        VALUES (${futureActivation},'prod-us',${futurePolicy},${futureActivation},${futureActivation},clock_timestamp(),clock_timestamp()+interval '1 day')`;
      await client`UPDATE billing.billing_policy_head
        SET current_activation_id=${futureActivation},pending_activation_id=${futureActivation} WHERE environment='prod-us'`;
      expect(await runtime`SELECT billing.observe_policy('prod-us') AS id`).toEqual([{ id: activation }]);
      await publisher`INSERT INTO billing.billing_policy_activation_cancellation(environment,activation_id,job_key,request_hash,cancelled_at)
        VALUES ('prod-us',${futureActivation},${randomUUID()},${randomUUID()},clock_timestamp())`;
      expect(await runtime`SELECT billing.observe_policy('prod-us') AS id`).toEqual([{ id: activation }]);

      const [barrier] = await client`SELECT observed_activation_id AS id
        FROM billing.billing_policy_head WHERE environment='prod-us'`;
      expect(barrier?.['id']).toBe(activation);
      await client`ALTER FUNCTION billing.observe_policy(text) RENAME TO observe_policy_saved_test`;
      try {
        await client`UPDATE billing.billing_policy_head SET observed_activation_id=NULL WHERE environment='prod-us'`;
        await expect(installBillingProtections(client)).rejects.toThrow(
          'existing billing policy requires verified barrier initialization',
        );
        expect(await client`SELECT to_regprocedure('billing.observe_policy(text)') AS function`).toEqual([
          { function: null },
        ]);
      } finally {
        try {
          await client`UPDATE billing.billing_policy_head SET observed_activation_id=${activation} WHERE environment='prod-us'`;
        } finally {
          await client`DROP FUNCTION IF EXISTS billing.observe_policy(text)`;
          await client`ALTER FUNCTION billing.observe_policy_saved_test(text) RENAME TO observe_policy`;
        }
      }
    } finally {
      await Promise.all([runtime.end(), publisher.end()]);
    }
  });
});

describe('funded LLM recovery worker under a mid-run database outage', () => {
  it('should keep retrying and terminalize the due operation exactly once without changing money', async () => {
    const applicationName = `tau-billing-i5-${randomUUID()}`;
    const [databaseIdentity] = await client`SELECT quote_ident(current_database()) AS name`;
    const databaseIdentifier = String(databaseIdentity?.['name']);
    // PostgreSQL refuses to disallow connections for the session's own database, so drive the outage from another one.
    const controlUrl = new URL(databaseUrl);
    controlUrl.pathname = '/postgres';
    const control = postgres(controlUrl.toString(), { max: 1 });
    const allowConnections = async (allowed: boolean): Promise<void> => {
      await control.unsafe(`ALTER DATABASE ${databaseIdentifier} WITH ALLOW_CONNECTIONS ${String(allowed)}`);
    };
    const observed: Array<{ stream: 'stdout' | 'stderr'; at: number; line: string }> = [];
    const collect = (stream: 'stdout' | 'stderr', readable: NodeJS.ReadableStream): void => {
      let buffered = '';
      readable.setEncoding('utf8');
      readable.on('data', (chunk: string) => {
        buffered += chunk;
        let index = buffered.indexOf('\n');
        while (index >= 0) {
          const line = buffered.slice(0, index).trim();
          buffered = buffered.slice(index + 1);
          if (line !== '') {
            observed.push({ stream, at: Date.now(), line });
          }
          index = buffered.indexOf('\n');
        }
      });
    };
    const batches = (stream: 'stdout' | 'stderr'): Array<{ at: number; batch: Record<string, unknown> }> =>
      observed
        .filter((entry) => entry.stream === stream)
        .flatMap((entry) => {
          try {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the worker emits one JSON object per line
            return [{ at: entry.at, batch: JSON.parse(entry.line) as Record<string, unknown> }];
          } catch {
            return [];
          }
        });
    const failures = (): Array<{ at: number; batch: Record<string, unknown> }> =>
      batches('stderr').filter(({ batch }) => batch['outcome'] === 'failed');
    const settle = async (
      label: string,
      predicate: () => Promise<boolean> | boolean,
      timeoutMilliseconds = 60_000,
    ): Promise<void> => {
      const deadline = Date.now() + timeoutMilliseconds;
      // oxlint-disable-next-line no-await-in-loop -- the probe intentionally polls a live worker and database
      while (!(await predicate())) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(observed)}`);
        }
        // oxlint-disable-next-line no-await-in-loop -- the probe intentionally polls a live worker and database
        await wait(25);
      }
    };

    const account = randomUUID();
    const policy = randomUUID();
    const activation = randomUUID();
    const operation = randomUUID();
    const spendHold = `${operation}-spend-hold`;
    const riskHold = `${operation}-risk-hold`;
    const childEnvironment: Record<string, string | undefined> = {};
    childEnvironment['PATH'] = process.env['PATH'];
    childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
    childEnvironment['BILLING_ENVIRONMENT'] = 'prod-eu';
    childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
    childEnvironment['OTEL_METRICS_PORT'] = '0';
    // Names the worker's backend so the outage terminates exactly that session.
    childEnvironment['PGAPPNAME'] = applicationName;
    const child = spawn(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../dist/billing-command.js'),
        'recover-llm-worker',
        '--environment',
        'prod-eu',
        '--limit',
        '100',
        '--poll-milliseconds',
        '50',
      ],
      {
        // No Redis, application or model-provider credentials are available to this process.
        env: childEnvironment as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    collect('stdout', child.stdout);
    collect('stderr', child.stderr);
    // A timed-out test never reaches its own finally, so restore the cluster from a hook the runner always calls.
    onTestFinished(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      await allowConnections(true);
      await control.end();
    });
    try {
      await settle('the first healthy recovery batch', () => batches('stdout').length > 0);

      // Interrupt the database for the worker only; this session keeps its established connection.
      await allowConnections(false);
      const terminated =
        await client`SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE application_name = ${applicationName}`;
      expect(terminated.length).toBeGreaterThan(0);

      // The due operation arrives while the worker cannot reach the database at all.
      await client`INSERT INTO billing.credit_account(id,environment) VALUES (${account},'prod-eu')`;
      await client`INSERT INTO billing.billing_policy(id,environment,policy_version,schema_version,content_hash,canonical_content)
        VALUES (${policy},'prod-eu',${policy},1,${policy},'{}')`;
      await client`INSERT INTO billing.billing_policy_activation(id,environment,policy_id,job_key,request_hash,announced_at,effective_at)
        VALUES (${activation},'prod-eu',${policy},${activation},${activation},now(),now())`;
      await client.begin(async (transaction) => {
        await Promise.all(
          ['spend', 'risk'].map(async (kind) => {
            const funding = `${operation}-${kind}-funding`;
            const budget = `${operation}-${kind}-budget`;
            await transaction`INSERT INTO billing.billing_budget_funding(id,environment,kind,scope,funded_lifetime)
              VALUES (${funding},'prod-eu',${kind},${operation},0)`;
            await transaction`INSERT INTO billing.billing_budget(id,environment,funding_id,kind,scope,period_start,period_end,quantum,approved_cap)
              VALUES (${budget},'prod-eu',${funding},${kind},${operation},now(),now()+interval '1 day','pico_usd',0)`;
          }),
        );
        await transaction`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,request_key_version,
          category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,
          purchased_held_atoms,spend_budget_hold_id,risk_budget_hold_id,due_at)
          VALUES (${operation},${account},'prod-eu','fixture',${operation},'digest',1,'llm','fixture','fixture','[]','[]','test',${policy},${activation},
          'fixture',0,0,0,0,${spendHold},${riskHold},now())`;
        await transaction`INSERT INTO billing.billing_budget_hold(id,budget_id,operation_id,initial_bound,remaining_held)
          VALUES (${spendHold},${`${operation}-spend-budget`},${operation},0,0),(${riskHold},${`${operation}-risk-budget`},${operation},0,0)`;
      });

      // The worker survives the outage, reports every failed batch and never hot-loops.
      await settle('four failed recovery batches', () => {
        // A worker that died instead of backing off must fail this case immediately.
        expect(child.exitCode ?? child.signalCode).toBeNull();
        return failures().length >= 4;
      });
      const failed = failures();
      expect(failed[0]?.batch).toMatchObject({ event: 'billing.llm_recovery_batch', environment: 'prod-eu' });
      expect(failed.map(({ batch }) => batch['pool'])).toContain('primary');
      expect(Number(failed.at(3)?.at) - Number(failed[0]?.at)).toBeGreaterThanOrEqual(100);
      expect(child.exitCode ?? child.signalCode).toBeNull();
      const duringOutage = await client`SELECT customer_state FROM billing.credit_operation WHERE id = ${operation}`;
      expect(duringOutage[0]?.['customer_state']).toBe('pending');

      const restoredAt = Date.now();
      await allowConnections(true);
      await settle('the recovered operation to reach a terminal state', async () => {
        expect(child.exitCode ?? child.signalCode).toBeNull();
        const [row] = await client`SELECT resolved_at FROM billing.credit_operation WHERE id = ${operation}`;
        return row?.['resolved_at'] !== null && row?.['resolved_at'] !== undefined;
      });
      const recoveredWallMilliseconds = Date.now() - restoredAt;

      const [resolvedOperation] =
        await client`SELECT customer_state, resolved_at IS NOT NULL AS resolved, dispatch_state,
          extract(epoch FROM (resolved_at - due_at)) * 1000 AS due_to_terminal_milliseconds
          FROM billing.credit_operation WHERE id = ${operation}`;
      expect(resolvedOperation?.['resolved']).toBe(true);
      expect(resolvedOperation?.['customer_state']).not.toBe('pending');
      console.log(
        JSON.stringify({
          observation: 'billing.i5.due_to_terminal_latency',
          note: 'local disposable cluster with an injected outage; not an SLO measurement',
          dueToTerminalMilliseconds: Number(resolvedOperation?.['due_to_terminal_milliseconds']),
          databaseRestoredToTerminalMilliseconds: recoveredWallMilliseconds,
          observedFailedBatches: failures().length,
        }),
      );

      // Exactly one terminal resolution, no duplicate money effect and no provider execution.
      const resolutions =
        await client`SELECT id FROM billing.credit_transaction WHERE operation_id = ${operation} AND kind = 'operation_resolution'`;
      expect(resolutions).toHaveLength(1);
      const [balances] = await client`SELECT promo_atoms AS "promoAtoms", plan_atoms AS "planAtoms",
        purchased_atoms AS "purchasedAtoms", debt_atoms AS "debtAtoms", promo_held_atoms AS "promoHeldAtoms",
        plan_held_atoms AS "planHeldAtoms", purchased_held_atoms AS "purchasedHeldAtoms"
        FROM billing.credit_account WHERE id = ${account}`;
      expect(balances).toEqual({
        promoAtoms: '0',
        planAtoms: '0',
        purchasedAtoms: '0',
        debtAtoms: '0',
        promoHeldAtoms: '0',
        planHeldAtoms: '0',
        purchasedHeldAtoms: '0',
      });
      const supplier =
        await client`SELECT source_revision FROM billing.supplier_cost_evidence WHERE operation_id = ${operation}`;
      expect(supplier.map((row) => String(row['source_revision']))).toEqual(['proved_no_dispatch_v1']);
      const healthy = batches('stdout');
      expect(healthy.every(({ batch }) => batch['providerExecutions'] === 0)).toBe(true);
      expect(healthy.reduce((total, { batch }) => total + Number(batch['resolved'] ?? 0), 0)).toBe(1);
      expect(healthy.some(({ batch }) => batch['resolved'] === 1 && batch['failed'] === 0)).toBe(true);

      child.kill('SIGTERM');
      const [code, signal] = (await once(child, 'close')) as unknown[];
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    } finally {
      await allowConnections(true);
    }
  });
});
