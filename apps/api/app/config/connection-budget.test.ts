import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { environmentSchemaBase } from '@taucad/api-core';
import { maintenanceDatabasePoolMax } from '#config/maintenance-environment.config.js';

/**
 * Database connection audit R1/R3 (Tau Brain `research/database-connection-audit.md`): every `app`
 * Machine's request and background pools, plus the `revisions-maintenance` worker, log in to the same
 * Supavisor session pool, and postgres.js opens a new connection rather than queueing while it is below
 * its cap. A client the pool cannot admit fails its query, so the caps must fit the pool:
 *
 *   min_machines_running × (DATABASE_POOL_MAX + DATABASE_BACKGROUND_POOL_MAX) + maintenance ≤ DATABASE_POOLER_POOL_SIZE
 *
 * tau-cloud's precondition (R6) will check the same sum from the Supabase side.
 */

type FlyBudget = {
  readonly machines: number;
  readonly requestMax: number;
  readonly backgroundMax: number;
  readonly maintenanceMax: number;
  readonly poolerPoolSize: number;
};

/** The `[env]` table of a Fly config, as strings. */
const flyEnvironment = (text: string): Record<string, string> => {
  const table = /^\[env\]\n([\s\S]*?)(?=^\[)/mu.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    [...table.matchAll(/^([A-Z][A-Z0-9_]*) = '([^']*)'$/gmu)].map((match) => [match[1] ?? '', match[2] ?? '']),
  );
};

/**
 * Reads a Fly config's connection budget: the `app` floor, the API's pool caps (through the env
 * schema, so a default counts as it boots) and whether the API app still runs the maintenance group.
 *
 * @param text - The config file's text.
 * @returns Its budget terms.
 */
const budgetOf = (text: string): FlyBudget => {
  const machines = Number(/^min_machines_running = (\d+)$/mu.exec(text)?.[1]);
  const environment = environmentSchemaBase
    /* eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
    .pick({ DATABASE_POOL_MAX: true, DATABASE_BACKGROUND_POOL_MAX: true, DATABASE_POOLER_POOL_SIZE: true })
    .parse(flyEnvironment(text));
  const runsMaintenance = /^revisions-maintenance = /mu.test(text);
  return {
    machines,
    requestMax: environment.DATABASE_POOL_MAX,
    backgroundMax: environment.DATABASE_BACKGROUND_POOL_MAX,
    maintenanceMax: runsMaintenance ? maintenanceDatabasePoolMax : 0,
    poolerPoolSize: environment.DATABASE_POOLER_POOL_SIZE ?? 0,
  };
};

const asked = ({ machines, requestMax, backgroundMax, maintenanceMax }: FlyBudget): number =>
  machines * (requestMax + backgroundMax) + maintenanceMax;

const read = (file: string): string => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('PostgreSQL connection budget (database connection audit R1)', () => {
  it.each(['fly.prod.toml', 'fly.staging.toml'])('should fit the session pool in %s', (file) => {
    const budget = budgetOf(read(file));

    expect(budget.machines).toBeGreaterThanOrEqual(2);
    expect(budget.poolerPoolSize).toBeGreaterThan(0);
    expect(asked(budget)).toBeLessThanOrEqual(budget.poolerPoolSize);
  });

  it('should hold prod-us at 2 × (4 + 1) + 2 = 12 of 15', () => {
    const budget = budgetOf(read('fly.prod.toml'));

    expect(budget).toEqual({ machines: 2, requestMax: 4, backgroundMax: 1, maintenanceMax: 2, poolerPoolSize: 15 });
    expect(asked(budget)).toBe(12);
  });

  it.each([
    ['DATABASE_POOL_MAX', "'7'"],
    ['DATABASE_BACKGROUND_POOL_MAX', "'4'"],
    ['DATABASE_POOLER_POOL_SIZE', "'11'"],
  ])('should refuse prod-us with %s = %s', (key, value) => {
    const changed = read('fly.prod.toml').replace(new RegExp(`^${key} = '[^']*'$`, 'mu'), `${key} = ${value}`);
    const budget = budgetOf(changed);

    expect(asked(budget)).toBeGreaterThan(budget.poolerPoolSize);
  });

  it('should refuse a third app Machine on a 15-client pool', () => {
    const budget = budgetOf(read('fly.prod.toml').replace(/^min_machines_running = 2$/mu, 'min_machines_running = 3'));

    expect(asked(budget)).toBeGreaterThan(budget.poolerPoolSize);
  });
});
