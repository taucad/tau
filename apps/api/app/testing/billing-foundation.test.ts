import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '#database/schema.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { setTimeout as wait } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
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

/** A loopback Stripe whose every list is empty, so a worker's boot-time scan completes without provider I/O. */
async function emptyStripe(): Promise<string> {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe list wire field
    response.end(JSON.stringify({ object: 'list', data: [], has_more: false, url: request.url }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(() => {
    server.close();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

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
  it('should let the release migration run when Cloud is disabled', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../../dist/billing-command.js'), 'migrate', '--environment', 'staging'],
      {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- raw process environments contain strings before schema parsing
        env: {
          /* eslint-disable @typescript-eslint/naming-convention -- process environment keys */
          PATH: process.env['PATH'],
          TAU_CLOUD_ENABLED: 'false',
          BILLING_DATABASE_URL: databaseUrl,
          BILLING_ENVIRONMENT: 'staging',
          /* eslint-enable @typescript-eslint/naming-convention -- process environment keys */
        } as unknown as NodeJS.ProcessEnv,
        encoding: 'utf8',
      },
    );
    expect(result.stderr).not.toContain('requires TAU_CLOUD_ENABLED');
    expect(result.status).toBe(0);
  });

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
      // One pass logs a line per capacity pool, and both can arrive in the same chunk.
      const [firstBatch = ''] = String(chunk).split('\n');
      expect(JSON.parse(firstBatch)).toMatchObject({
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

  it('should run reload work and closure reconciliation on the staging operations worker', async () => {
    const childEnvironment: Record<string, string | undefined> = {};
    childEnvironment['PATH'] = process.env['PATH'];
    childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
    // Sandbox keys collect only outside prod-, so the collecting worker runs on staging.
    childEnvironment['BILLING_ENVIRONMENT'] = 'staging';
    childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
    // Today's window already reconciled: a restarted worker reports it complete from one row, with no provider I/O.
    await client`INSERT INTO billing.billing_cash_scan (id, environment, stripe_account_id, livemode, currency,
        window_start, window_end, lookback_start, balance_done, payment_intent_done, charge_done, refund_done,
        journal_done, fact_done, state, completed_at)
      SELECT ${randomUUID()}, 'staging', 'acct_operations_worker', false, 'usd', day - interval '1 day', day,
        day - interval '2 days', true, true, true, true, true, true, 'complete', clock_timestamp()
      FROM (SELECT date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day) w
      ON CONFLICT DO NOTHING`;
    const accountId = randomUUID();
    const bindingId = randomUUID();
    const closureId = randomUUID();
    await client`INSERT INTO billing.credit_account (id, environment, status) VALUES (${accountId}, 'staging', 'closing')`;
    await client`INSERT INTO billing.billing_owner_binding (id, account_id, environment, revoked_at)
      VALUES (${bindingId}, ${accountId}, 'staging', clock_timestamp() - interval '2 minutes')`;
    await client`INSERT INTO billing.billing_account_closure
        (id, account_id, binding_id, environment, request_id, request_hash, state,
         binding_revoked_at, obligations_frozen_at, auth_deleted_at, updated_at)
      VALUES (${closureId}, ${accountId}, ${bindingId}, 'staging', ${closureId}, 'fixture', 'ready_for_auth_deletion',
        clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '2 minutes',
        clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '2 minutes')`;
    childEnvironment['STRIPE_SECRET_KEY'] = 'rk_test_operations_worker';
    childEnvironment['STRIPE_READ_SECRET_KEY'] = 'rk_test_operations_worker_read';
    childEnvironment['STRIPE_ACCOUNT_ID'] = 'acct_operations_worker';
    childEnvironment['STRIPE_LIVEMODE'] = 'false';
    childEnvironment['STRIPE_PRICE_ID_PRO_MONTHLY'] = 'price_operations_worker';
    childEnvironment['STRIPE_PRODUCT_ID_CREDIT_PACK'] = 'prod_operations_worker';
    childEnvironment['OTEL_METRICS_PORT'] = '0';
    const child = spawn(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../dist/billing-command.js'),
        'billing-operations-worker',
        '--environment',
        'staging',
        '--limit',
        '100',
        '--poll-milliseconds',
        '1000',
      ],
      {
        // The owned due closure proves the scheduled job runs without any provider I/O.
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
      while (
        !stdout.includes('billing.reload_work') ||
        !stdout.includes('billing.account_closure') ||
        !stdout.includes('billing.source_reconciliation')
      ) {
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for billing operations worker: ${stdout}\n${stderr}`);
        }
        // oxlint-disable-next-line no-await-in-loop -- the probe waits for the first cycle
        await wait(25);
      }
      const events = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'billing.reload_work', environment: 'staging' }),
          expect.objectContaining({
            event: 'billing.account_closure',
            environment: 'staging',
          }),
          // Due at boot, not one cadence in: a frequently restarted worker still reconciles.
          expect.objectContaining({
            event: 'billing.source_reconciliation',
            report: expect.objectContaining({ cash: 'complete', purchases: 'complete' }) as unknown,
          }),
        ]),
      );
      const [closed] = await client`SELECT state, closed_at IS NOT NULL AS closed
        FROM billing.billing_account_closure WHERE id = ${closureId}`;
      expect(closed).toMatchObject({ state: 'closed', closed: true });
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
    childEnvironment['BILLING_STRIPE_FIXTURE_URL'] = await emptyStripe();
    // Sandbox keys in a prod- environment collect nothing, so no reload work may run.
    childEnvironment['STRIPE_SECRET_KEY'] = 'rk_test_operations_worker';
    childEnvironment['STRIPE_READ_SECRET_KEY'] = 'rk_test_operations_worker_read';
    childEnvironment['STRIPE_ACCOUNT_ID'] = 'acct_operations_worker';
    childEnvironment['STRIPE_LIVEMODE'] = 'false';
    childEnvironment['STRIPE_PRICE_ID_PRO_MONTHLY'] = 'price_operations_worker';
    childEnvironment['STRIPE_PRODUCT_ID_CREDIT_PACK'] = 'prod_operations_worker';
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
        // The empty environment has no payment sources; the loopback Stripe answers the boot scan.
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
      expect(events.some((event) => event['event'] === 'billing.reload_work')).toBe(false);
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
    // An operation needs no supplier holds: admission reserves the customer's credit only.
    await client`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,request_key_version,
      category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,
      purchased_held_atoms,due_at)
      VALUES (${operation},${account},'prod-us','fixture',${operation},'digest',1,'llm','fixture','fixture','[]','[]','test',${policy},${activation},
      'fixture',0,0,0,0,now())`;
    // A pending operation carries no supplier cost; only its terminal receipt does.
    await expect(
      client`UPDATE billing.credit_operation SET supplier_cost_pico_usd=0 WHERE id=${operation}`,
    ).rejects.toMatchObject({ code: '23514' });
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

  it('should install the expand-step protections on the fresh schema', async () => {
    const [state] = await client`SELECT
      NOT EXISTS (SELECT FROM pg_trigger WHERE tgname IN ('require_operation_holds', 'protect_budget_hold')) AS "holdTriggersGone",
      to_regprocedure('billing.require_operation_holds()') IS NULL AND to_regprocedure('billing.protect_budget_hold()') IS NULL
        AS "holdFunctionsGone",
      EXISTS (SELECT FROM pg_trigger WHERE tgname = 'protect_route_pause') AS "pauseProtected",
      has_table_privilege('tau_billing_runtime', 'billing.billing_route_pause', 'SELECT') AS "pauseReadable",
      has_table_privilege('tau_billing_runtime', 'billing.billing_route_pause', 'INSERT')
        OR has_table_privilege('tau_billing_runtime', 'billing.billing_route_pause', 'UPDATE')
        OR has_table_privilege('tau_billing_runtime', 'billing.billing_route_pause', 'DELETE') AS "pauseWritable",
      has_table_privilege('tau_billing_runtime', 'billing.credit_attempt_void', 'INSERT') AS "attemptVoidWritable",
      has_table_privilege('tau_billing_runtime', 'billing.billing_budget_hold', 'INSERT')
        AND has_table_privilege('tau_billing_runtime', 'billing.supplier_cost_evidence', 'INSERT') AS "supplierEvidenceWritable",
      has_column_privilege('tau_billing_runtime', 'billing.credit_operation', 'supplier_cost_pico_usd', 'UPDATE')
        AND has_column_privilege('tau_billing_runtime', 'billing.credit_operation', 'supplier_cost_unpriced_reason', 'UPDATE')
        AS "supplierCostWritable",
      has_column_privilege('tau_billing_runtime', 'billing.credit_operation', 'supplier_state', 'UPDATE')
        AS "supplierStateWritable",
      has_table_privilege('tau_billing_runtime', 'billing.billing_budget', 'SELECT')
        AND has_column_privilege('tau_billing_runtime', 'billing.billing_budget', 'consumed', 'UPDATE') AS "promotionBudgetUsable"`;
    expect(state).toEqual({
      holdTriggersGone: true,
      holdFunctionsGone: true,
      pauseProtected: true,
      pauseReadable: true,
      pauseWritable: false,
      attemptVoidWritable: true,
      // Old-image Machines still write holds, evidence and supplier_state during the expand step's rolling deploy.
      supplierEvidenceWritable: true,
      supplierCostWritable: true,
      supplierStateWritable: true,
      promotionBudgetUsable: true,
    });
    // A pause is resumed once, and nothing else about it ever changes.
    const pause = randomUUID();
    await client`INSERT INTO billing.billing_route_pause(id, environment, sku, actor, reason)
      VALUES (${pause}, 'prod-us', ${`model:protected-${pause}`}, 'operator', 'protection fixture')`;
    await expect(
      client`UPDATE billing.billing_route_pause SET reason = 'rewritten' WHERE id = ${pause}`,
    ).rejects.toMatchObject({ code: '23514' });
    await client`UPDATE billing.billing_route_pause SET resumed_at = now(), resumed_by = 'operator', resume_reason = 'done'
      WHERE id = ${pause}`;
    await expect(
      client`UPDATE billing.billing_route_pause SET resumed_by = 'someone else' WHERE id = ${pause}`,
    ).rejects.toMatchObject({ code: '23514' });
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

describe('billing upgrade from migration 0048 under the pre-charter protections', () => {
  const name = `billing_upgrade_${String(process.pid)}`;
  const target = new URL(databaseUrl);
  target.pathname = `/${name}`;
  const environment = 'prod-us';
  const account = randomUUID();
  const policy = randomUUID();
  const activation = randomUUID();
  const operations = [randomUUID(), randomUUID()] as const;
  const resolvedKinds = [
    'supplier_evidence_missing',
    'supplier_evidence_mismatched',
    'supplier_charge_unmatched',
    'supplier_state_unresolved',
    'llm_recovery_absorbed',
    'journal_budget_residual',
  ];
  const untouchedKinds = [
    'missing_local_payment',
    'dispute_unresolved',
    'journal_balance_drift',
    'supplier_invoice_total_mismatch',
  ];
  let scratch: postgres.Sql | undefined;
  let migrationsBefore0049: string | undefined;
  const database = (): postgres.Sql => {
    if (!scratch) {
      throw new Error('The upgraded database was not created');
    }
    return scratch;
  };

  beforeAll(async () => {
    await client.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await client.unsafe(`CREATE DATABASE ${name}`);
    scratch = postgres(target.toString(), {
      max: 1,
      onnotice() {
        /* Expected fixture DDL notices are not diagnostics. */
      },
    });
    const migrationsFolder = resolve(import.meta.dirname, '../database/migrations');
    migrationsBefore0049 = mkdtempSync(join(tmpdir(), 'tau-billing-0048-'));
    cpSync(migrationsFolder, migrationsBefore0049, { recursive: true });
    const journalPath = join(migrationsBefore0049, 'meta', '_journal.json');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drizzle-kit's journal file
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> };
    const expand = journal.entries.findIndex((entry) => entry.tag === '0049_supplier_simplification');
    expect(expand).toBeGreaterThan(0);
    journal.entries = journal.entries.slice(0, expand);
    writeFileSync(journalPath, JSON.stringify(journal));
    const upgraded = database();
    await migrate(drizzle(upgraded), { migrationsFolder: migrationsBefore0049 });

    // The pre-charter protections' supplier grants and hold triggers, as origin/main installed them.
    await upgraded.unsafe(`GRANT USAGE ON SCHEMA billing TO tau_billing_runtime`);
    await upgraded.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA billing TO tau_billing_runtime`);
    await upgraded.unsafe(`GRANT INSERT ON billing.credit_operation, billing.billing_budget_hold,
      billing.supplier_cost_evidence, billing.billing_route_pause TO tau_billing_runtime`);
    await upgraded.unsafe(
      `GRANT UPDATE (remaining_held, consumed, finality_state) ON billing.billing_budget_hold TO tau_billing_runtime`,
    );
    await upgraded.unsafe(`GRANT UPDATE (supplier_state) ON billing.credit_operation TO tau_billing_runtime`);
    await upgraded.unsafe(`CREATE OR REPLACE FUNCTION billing.require_operation_holds() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF NEW.spend_budget_hold_id = NEW.risk_budget_hold_id OR
          NOT EXISTS (SELECT FROM billing.billing_budget_hold h JOIN billing.billing_budget b ON b.id = h.budget_id
            WHERE h.id = NEW.spend_budget_hold_id AND h.operation_id = NEW.id AND b.environment = NEW.environment AND b.kind = 'spend') OR
          NOT EXISTS (SELECT FROM billing.billing_budget_hold h JOIN billing.billing_budget b ON b.id = h.budget_id
            WHERE h.id = NEW.risk_budget_hold_id AND h.operation_id = NEW.id AND b.environment = NEW.environment AND b.kind = 'risk')
        THEN RAISE EXCEPTION 'operation requires its own spend and risk holds' USING ERRCODE = '23503'; END IF;
        RETURN NEW;
      END $$`);
    await upgraded.unsafe(`CREATE CONSTRAINT TRIGGER require_operation_holds AFTER INSERT ON billing.credit_operation
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.require_operation_holds()`);
    await upgraded.unsafe(`CREATE OR REPLACE FUNCTION billing.protect_budget_hold() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF TG_OP = 'DELETE' OR ROW(OLD.id,OLD.budget_id,OLD.operation_id,OLD.initial_bound)
          IS DISTINCT FROM ROW(NEW.id,NEW.budget_id,NEW.operation_id,NEW.initial_bound)
        THEN RAISE EXCEPTION 'immutable budget hold cause' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$`);
    await upgraded.unsafe(`CREATE TRIGGER protect_budget_hold BEFORE UPDATE OR DELETE ON billing.billing_budget_hold
      FOR EACH ROW EXECUTE FUNCTION billing.protect_budget_hold()`);

    // Rows a 0048 database carries: pending operations with their holds, an automatic pause, budgets and cases.
    await upgraded`INSERT INTO billing.credit_account(id,environment) VALUES (${account},${environment})`;
    await upgraded`INSERT INTO billing.billing_policy(id,environment,policy_version,schema_version,content_hash,canonical_content)
      VALUES (${policy},${environment},${policy},1,${policy},'{}')`;
    await upgraded`INSERT INTO billing.billing_policy_activation(id,environment,policy_id,job_key,request_hash,announced_at,effective_at)
      VALUES (${activation},${environment},${policy},${activation},${activation},now(),now())`;
    for (const kind of ['spend', 'risk', 'promotion_issuance']) {
      const held = kind === 'promotion_issuance' ? 0 : 200;
      // oxlint-disable-next-line no-await-in-loop -- each budget references its own funding row
      await upgraded`INSERT INTO billing.billing_budget_funding(id,environment,kind,scope,funded_lifetime,held)
        VALUES (${`funding-${kind}`},${environment},${kind},'global',1000000000,${held})`;
      // oxlint-disable-next-line no-await-in-loop -- as above
      await upgraded`INSERT INTO billing.billing_budget(id,environment,funding_id,kind,scope,period_start,period_end,quantum,approved_cap,held)
        VALUES (${`budget-${kind}`},${environment},${`funding-${kind}`},${kind},'global',now() - interval '1 day',
          now() + interval '30 day',${kind === 'promotion_issuance' ? 'atoms' : 'pico_usd'},1000000000,${held})`;
    }
    await upgraded.begin(async (transaction) => {
      for (const operation of operations) {
        // oxlint-disable-next-line no-await-in-loop -- the deferred hold trigger checks each operation at commit
        await transaction`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,
          request_key_version,category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,
          meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,purchased_held_atoms,due_at,
          spend_budget_hold_id,risk_budget_hold_id)
          VALUES (${operation},${account},${environment},'fixture',${operation},'digest',1,'llm','fixture','model:fixture',
            '[]','[]','test',${policy},${activation},'fixture',0,0,0,0,now(),${`spend-${operation}`},${`risk-${operation}`})`;
        // oxlint-disable-next-line no-await-in-loop -- as above
        await transaction`INSERT INTO billing.billing_budget_hold(id,budget_id,operation_id,initial_bound,remaining_held)
          VALUES (${`spend-${operation}`},'budget-spend',${operation},100,100),
            (${`risk-${operation}`},'budget-risk',${operation},100,100)`;
      }
    });
    await upgraded`INSERT INTO billing.billing_route_pause(environment,sku,operation_id,reason)
      VALUES (${environment},'model:fixture',${operations[0]},'retail_overrun')`;
    for (const kind of [...resolvedKinds, ...untouchedKinds]) {
      for (const state of ['open', 'attention']) {
        // oxlint-disable-next-line no-await-in-loop -- one case per kind and state
        await upgraded`INSERT INTO billing.billing_financial_case(id,environment,stripe_account_id,livemode,kind,dedupe_key,
          account_id,evidence,owner,next_step,state,first_effective_at)
          VALUES (${randomUUID()},${environment},'',false,${kind},${`${kind}:${state}`},${account},'{}','ops','fixture',${state},now())`;
      }
      // oxlint-disable-next-line no-await-in-loop -- as above
      await upgraded`INSERT INTO billing.billing_financial_case(id,environment,stripe_account_id,livemode,kind,dedupe_key,
        account_id,evidence,owner,next_step,state,first_effective_at,resolved_at,resolution_evidence)
        VALUES (${randomUUID()},${environment},'',false,${kind},${`${kind}:resolved`},${account},'{}','ops','fixture',
          'resolved',now(),'2026-01-01T00:00:00Z','{"prior":true}')`;
    }

    // The release command: the whole expand migration, then this build's protections.
    await migrate(drizzle(upgraded), { migrationsFolder });
    await installBillingProtections(upgraded);
  }, 120_000);

  afterAll(async () => {
    await scratch?.end();
    await client.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    if (migrationsBefore0049) {
      rmSync(migrationsBefore0049, { recursive: true, force: true });
    }
  }, 120_000);

  it('should keep the old image writable, refuse runtime pause writes and drop the hold triggers', async () => {
    const upgraded = database();
    const [state] = await upgraded`SELECT
      NOT EXISTS (SELECT FROM pg_trigger WHERE tgname IN ('require_operation_holds', 'protect_budget_hold')) AS "holdTriggersGone",
      to_regprocedure('billing.require_operation_holds()') IS NULL AND to_regprocedure('billing.protect_budget_hold()') IS NULL
        AS "holdFunctionsGone",
      EXISTS (SELECT FROM pg_trigger WHERE tgname = 'protect_route_pause') AS "pauseProtected",
      has_table_privilege('tau_billing_runtime', 'billing.credit_attempt_void', 'INSERT') AS "attemptVoidWritable"`;
    expect(state).toEqual({
      holdTriggersGone: true,
      holdFunctionsGone: true,
      pauseProtected: true,
      attemptVoidWritable: true,
    });
    const pauses = await upgraded`SELECT actor, resumed_at IS NOT NULL AS resumed, resumed_by AS "resumedBy",
      resume_reason AS "resumeReason" FROM billing.billing_route_pause WHERE environment = ${environment}`;
    expect(pauses).toEqual([
      { actor: 'automatic', resumed: true, resumedBy: 'migration-0049', resumeReason: 'superseded_by_charter' },
    ]);

    const runtime = postgres(target.toString(), { max: 1, connection: { role: 'tau_billing_runtime' } });
    try {
      // An old-image Machine mid-rollout: admission inserts its holds, settlement writes evidence, holds and supplier_state.
      const [first] = operations;
      const oldOperation = randomUUID();
      await runtime.begin(async (transaction) => {
        await transaction`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,
          request_key_version,category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,
          meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,purchased_held_atoms,due_at,
          spend_budget_hold_id,risk_budget_hold_id,supplier_state)
          VALUES (${oldOperation},${account},${environment},'fixture',${oldOperation},'digest',1,'llm','fixture','model:fixture',
            '[]','[]','test',${policy},${activation},'fixture',0,0,0,0,now(),${`spend-${oldOperation}`},${`risk-${oldOperation}`},
            'reserved')`;
        await transaction`INSERT INTO billing.billing_budget_hold(id,budget_id,operation_id,initial_bound,remaining_held)
          VALUES (${`spend-${oldOperation}`},'budget-spend',${oldOperation},100,100),
            (${`risk-${oldOperation}`},'budget-risk',${oldOperation},100,100)`;
      });
      await runtime`INSERT INTO billing.supplier_cost_evidence(id,operation_id,environment,provider,credential_account,
        source_object_id,source_revision,payload_digest,numerator,denominator,currency,completeness,finality,received_at)
        VALUES (${randomUUID()},${first},${environment},'fixture','fixture',${first},'1','digest',40,1,'usd','complete','final',now())`;
      await expect(
        runtime`UPDATE billing.billing_budget_hold SET remaining_held = 60, consumed = 40, finality_state = 'final'
          WHERE id = ${`spend-${first}`}`,
      ).resolves.toHaveProperty('count', 1);
      await expect(
        runtime`UPDATE billing.credit_operation SET supplier_state = 'preliminary'
          WHERE id = ${first} AND supplier_state = 'reserved'`,
      ).resolves.toHaveProperty('count', 1);

      // This build: an operation needs no holds, and route pauses are owner-written only.
      const currentOperation = randomUUID();
      await runtime`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,
        request_key_version,category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,
        meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,purchased_held_atoms,due_at)
        VALUES (${currentOperation},${account},${environment},'fixture',${currentOperation},'digest',1,'llm','fixture',
          'model:fixture','[]','[]','test',${policy},${activation},'fixture',0,0,0,0,now())`;
      await expect(
        runtime`INSERT INTO billing.billing_route_pause(environment,sku,actor,reason)
          VALUES (${environment},'model:runtime','runtime','fixture')`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        runtime`UPDATE billing.billing_route_pause SET resumed_at = now(), resumed_by = 'runtime', resume_reason = 'fixture'`,
      ).rejects.toMatchObject({ code: '42501' });
      await expect(runtime`DELETE FROM billing.billing_route_pause`).rejects.toMatchObject({ code: '42501' });
    } finally {
      await runtime.end();
    }
    const written = await upgraded<Array<{ id: string; supplierState: unknown; holds: boolean }>>`SELECT id,
      supplier_state AS "supplierState", spend_budget_hold_id IS NOT NULL AS "holds"
      FROM billing.credit_operation WHERE account_id = ${account}`;
    expect(written).toHaveLength(4);
    expect(written.find(({ id }) => id === operations[0])).toMatchObject({ supplierState: 'preliminary', holds: true });
  });

  it('should resolve exactly the superseded supplier cases and keep every other case and earlier evidence', async () => {
    const cases = await database()<
      Array<{ dedupeKey: string; state: string; evidence: unknown; resolvedEarlier: boolean }>
    >`
      SELECT dedupe_key AS "dedupeKey", state, resolution_evidence AS evidence,
        resolved_at = '2026-01-01T00:00:00Z' AS "resolvedEarlier"
      FROM billing.billing_financial_case WHERE account_id = ${account}`;
    const superseded = { disposition: 'superseded_by_charter', migration: '0049' };
    const expected = [...resolvedKinds, ...untouchedKinds]
      .flatMap((kind) => [
        ...['open', 'attention'].map((state) => ({
          dedupeKey: `${kind}:${state}`,
          state: resolvedKinds.includes(kind) ? 'resolved' : state,
          evidence: resolvedKinds.includes(kind) ? superseded : null,
          resolvedEarlier: resolvedKinds.includes(kind) ? false : null,
        })),
        { dedupeKey: `${kind}:resolved`, state: 'resolved', evidence: { prior: true }, resolvedEarlier: true },
      ])
      .sort((left, right) => left.dedupeKey.localeCompare(right.dedupeKey));
    expect([...cases].sort((left, right) => left.dedupeKey.localeCompare(right.dedupeKey))).toEqual(expected);
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
      await client`INSERT INTO billing.credit_operation(id,account_id,environment,surface,attempt_key,request_digest,request_key_version,
        category,model_id,sku,pinned_tariff,maximum_quantities,activity,policy_id,activation_id,meter_contract_id,authorized_atoms,promo_held_atoms,plan_held_atoms,
        purchased_held_atoms,due_at)
        VALUES (${operation},${account},'prod-eu','fixture',${operation},'digest',1,'llm','fixture','fixture','[]','[]','test',${policy},${activation},
        'fixture',0,0,0,0,now())`;

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
      // An undispatched operation cost the supplier nothing: a known zero on its receipt, and no evidence row.
      const [supplierCost] =
        await client`SELECT supplier_cost_pico_usd AS "picoUsd", supplier_cost_unpriced_reason AS "unpricedReason",
          supplier_state AS "supplierState" FROM billing.credit_operation WHERE id = ${operation}`;
      expect(supplierCost).toEqual({ picoUsd: '0', unpricedReason: null, supplierState: null });
      expect(
        await client`SELECT id FROM billing.supplier_cost_evidence WHERE operation_id = ${operation}`,
      ).toHaveLength(0);
      // The worker prints a pass's batch lines after both pools finish, so the line can trail the committed row.
      await settle('the batch line that reports the resolution', () =>
        batches('stdout').some(({ batch }) => batch['resolved'] === 1),
      );
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
