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
import { afterAll, describe, expect, it } from 'vitest';
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
      maximumPrincipalMinor: '50000',
      creditAtomsPerPrincipalMinor: '10000',
    },
  ],
  promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
};

describe('billing database protections and real command', () => {
  it('should run the credential-free recovery worker and stop cleanly', async () => {
    const childEnvironment: Record<string, string | undefined> = {};
    childEnvironment['PATH'] = process.env['PATH'];
    childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
    childEnvironment['BILLING_ENVIRONMENT'] = 'prod-eu';
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
