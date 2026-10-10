import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { billingRoutePause } from '#database/schema.js';
import { BillingRoutePauseService } from '#api/billing/billing-route-pause.service.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
/* The fixture login owns the schema, as the deployment's owner identity does. */
const owner = postgres(databaseUrl, { max: 1, prepare: false });
const runtime = postgres(databaseUrl, { max: 1, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(owner, { schema });
const pauses = new BillingRoutePauseService({ database });
afterAll(async () => Promise.all([owner.end(), runtime.end()]));

const routeRows = async (sku: string) =>
  database
    .select()
    .from(billingRoutePause)
    .where(and(eq(billingRoutePause.environment, 'staging'), eq(billingRoutePause.sku, sku)))
    .orderBy(asc(billingRoutePause.createdAt));

/** The PostgreSQL error behind a refused query; the query builder wraps it as the cause. */
const databaseRefusal = async (action: () => Promise<unknown>): Promise<unknown> => {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error.cause : error;
  }
  throw new Error('The database accepted a write it should refuse');
};

describe('operator route pause', () => {
  it('should pause then resume one route under the owner identity, keeping both facts on the row', async () => {
    const sku = `model:pause-${randomUUID()}`;

    const paused = await pauses.pauseRoute({ environment: 'staging', sku, reason: 'Provider incident', actor: 'op-a' });

    expect(paused).toMatchObject({
      environment: 'staging',
      sku,
      operationId: null,
      actor: 'op-a',
      reason: 'Provider incident',
      resumedAt: null,
      resumedBy: null,
      resumeReason: null,
    });
    await expect(pauses.pauseRoute({ environment: 'staging', sku, reason: 'Again', actor: 'op-b' })).rejects.toThrow(
      `route_already_paused: staging ${sku}`,
    );

    const resumed = await pauses.resumeRoute({
      environment: 'staging',
      sku,
      reason: 'Provider recovered',
      actor: 'op-b',
    });

    expect(resumed).toMatchObject({
      id: paused.id,
      actor: 'op-a',
      reason: 'Provider incident',
      resumedBy: 'op-b',
      resumeReason: 'Provider recovered',
    });
    expect(resumed.resumedAt).toBeInstanceOf(Date);
    await expect(pauses.resumeRoute({ environment: 'staging', sku, reason: 'Twice', actor: 'op-b' })).rejects.toThrow(
      `route_not_paused: staging ${sku}`,
    );
    expect(await routeRows(sku)).toEqual([resumed]);
  });

  it('should append a new row for a second pause after a resume, leaving the history intact', async () => {
    const sku = `model:repause-${randomUUID()}`;
    const first = await pauses.pauseRoute({ environment: 'staging', sku, reason: 'First', actor: 'op' });
    const resumed = await pauses.resumeRoute({ environment: 'staging', sku, reason: 'Recovered', actor: 'op' });

    const second = await pauses.pauseRoute({ environment: 'staging', sku, reason: 'Second', actor: 'op' });

    expect(second.id).not.toBe(first.id);
    expect(await routeRows(sku)).toEqual([resumed, second]);
    // The pause is per environment: the same route elsewhere is untouched.
    expect(
      await database
        .select()
        .from(billingRoutePause)
        .where(and(eq(billingRoutePause.environment, 'prod-eu'), eq(billingRoutePause.sku, sku))),
    ).toEqual([]);
  });

  it('should pause a long-context route through its base route', async () => {
    const base = `model:family-${randomUUID()}`;

    const paused = await pauses.pauseRoute({
      environment: 'staging',
      sku: `${base}:long-context`,
      reason: 'Provider incident',
      actor: 'op',
    });

    expect(paused.sku).toBe(base);
    await expect(
      pauses.resumeRoute({ environment: 'staging', sku: base, reason: 'Recovered', actor: 'op' }),
    ).resolves.toMatchObject({ id: paused.id, resumedBy: 'op' });
  });

  it('should refuse both commands under the runtime role', async () => {
    const sku = `model:runtime-${randomUUID()}`;
    const asRuntime = new BillingRoutePauseService({ database: drizzle(runtime, { schema }) });

    const denied = { code: '42501', message: 'permission denied for table billing_route_pause' };

    expect(
      await databaseRefusal(async () =>
        asRuntime.pauseRoute({ environment: 'staging', sku, reason: 'Not allowed', actor: 'runtime' }),
      ),
    ).toMatchObject(denied);
    await pauses.pauseRoute({ environment: 'staging', sku, reason: 'Owner pause', actor: 'op' });
    expect(
      await databaseRefusal(async () =>
        asRuntime.resumeRoute({ environment: 'staging', sku, reason: 'Not allowed', actor: 'runtime' }),
      ),
    ).toMatchObject(denied);
    // The runtime still reads the pause it must enforce.
    expect(await runtime`SELECT actor FROM billing.billing_route_pause WHERE sku = ${sku}`).toEqual([{ actor: 'op' }]);
    expect(await routeRows(sku)).toMatchObject([{ actor: 'op', resumedAt: null }]);
  });

  it('should pause and resume through the built command and log one JSON line per action', async () => {
    const sku = `model:command-${randomUUID()}`;
    const run = (command: string, reason: string) => {
      const childEnvironment: Record<string, string | undefined> = {};
      childEnvironment['PATH'] = process.env['PATH'];
      childEnvironment['TAU_CLOUD_ENABLED'] = 'true';
      childEnvironment['BILLING_DATABASE_URL'] = databaseUrl;
      childEnvironment['BILLING_ENVIRONMENT'] = 'prod-eu';
      return spawnSync(
        process.execPath,
        [
          resolve(import.meta.dirname, '../../../dist/billing-command.js'),
          command,
          '--environment',
          'prod-eu',
          '--sku',
          sku,
          '--reason',
          reason,
          '--actor',
          'op@example.invalid',
        ],
        { env: childEnvironment as NodeJS.ProcessEnv, encoding: 'utf8', timeout: 30_000 },
      );
    };

    const paused = run('pause-route', 'Provider incident');
    const refused = run('pause-route', 'Provider incident');
    const resumed = run('resume-route', 'Provider recovered');

    expect({ status: paused.status, stderr: paused.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(paused.stdout)).toMatchObject({
      event: 'billing.route_paused',
      environment: 'prod-eu',
      sku,
      actor: 'op@example.invalid',
      reason: 'Provider incident',
      resumedAt: null,
    });
    expect({ status: refused.status, stderr: refused.stderr.trim() }).toEqual({
      status: 1,
      stderr: `route_already_paused: prod-eu ${sku}`,
    });
    expect({ status: resumed.status, stderr: resumed.stderr }).toEqual({ status: 0, stderr: '' });
    const resumedLine = JSON.parse(resumed.stdout) as Record<string, unknown>;
    expect(resumedLine).toMatchObject({
      event: 'billing.route_resumed',
      sku,
      resumedBy: 'op@example.invalid',
      resumeReason: 'Provider recovered',
    });
    expect(Number.isNaN(Date.parse(String(resumedLine['resumedAt'])))).toBe(false);
  });
});
