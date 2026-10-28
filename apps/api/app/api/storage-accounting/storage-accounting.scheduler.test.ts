import { describe, expect, it, vi } from 'vitest';
import type { AccountingFigures, AccountingTask } from '#api/storage-accounting/accounting-figures.js';
import { accountingGauges } from '#api/storage-accounting/accounting-figures.js';
import { accountingTasks, r2SourceOf } from '#api/storage-accounting/accounting-tasks.js';
import {
  StorageAccountingScheduler,
  memorySnapshotStore,
} from '#api/storage-accounting/storage-accounting.scheduler.js';
import type { StorageAccountingMetrics } from '#api/storage-accounting/storage-accounting.scheduler.js';
import type { DatabaseType } from '#database/database.service.js';
import type { ResolvePlan } from '#api/storage-accounting/usage.js';
import { mock } from 'vitest-mock-extended';

type Observed = { value: number; attributes: Record<string, unknown> };
type Callback = (result: { observe: (value: number, attributes?: Record<string, unknown>) => void }) => void;

/** One Machine's instruments: gauges collected on demand, passes counted per task and outcome. */
const fakeMetrics = (): StorageAccountingMetrics & {
  collect: (name: string) => Observed[];
  passes: Array<{ task: unknown; outcome: unknown }>;
} => {
  const callbacks = new Map<string, Callback[]>();
  const gauge = (name: string) => ({
    addCallback: (callback: Callback) => {
      callbacks.set(name, [...(callbacks.get(name) ?? []), callback]);
    },
  });
  const passes: Array<{ task: unknown; outcome: unknown }> = [];
  const metrics = {
    ...Object.fromEntries([...accountingGauges, 'storageAccountingLastSuccess'].map((name) => [name, gauge(name)])),
    storageAccountingPasses: {
      add: (_value: number, attributes: Record<string, unknown>) => {
        passes.push({
          task: attributes['tau.storage.accounting.task'],
          outcome: attributes['outcome'],
        });
      },
    },
    passes,
    collect: (name: string): Observed[] => {
      const observed: Observed[] = [];
      for (const callback of callbacks.get(name) ?? []) {
        callback({
          observe: (value, attributes = {}) => observed.push({ value, attributes }),
        });
      }
      return observed;
    },
  };
  return metrics as unknown as StorageAccountingMetrics & {
    collect: (name: string) => Observed[];
    passes: Array<{ task: unknown; outcome: unknown }>;
  };
};

const usageFigures: AccountingFigures = {
  storageUsageRepositories: [{ value: 4, attributes: { 'tau.plan': 'pro' } }],
};

const hour = 60 * 60 * 1000;

describe('StorageAccountingScheduler (W14 OB3)', () => {
  it('should run each pass on one Machine and export its figures from every Machine', async () => {
    let now = 1_000_000;
    const store = memorySnapshotStore(() => now);
    const run = vi.fn(async () => usageFigures);
    const tasks: AccountingTask[] = [{ name: 'usage', intervalMilliseconds: hour, run }];
    const first = fakeMetrics();
    const second = fakeMetrics();
    const machines = [
      new StorageAccountingScheduler({
        tasks,
        store,
        metrics: first,
        now: () => now,
      }),
      new StorageAccountingScheduler({
        tasks,
        store,
        metrics: second,
        now: () => now,
      }),
    ];

    await Promise.all(machines.map(async (machine) => machine.tick()));
    now += 60_000;
    await Promise.all(machines.map(async (machine) => machine.tick()));

    expect(run).toHaveBeenCalledTimes(1);
    expect([...first.passes, ...second.passes]).toStrictEqual([{ task: 'usage', outcome: 'ok' }]);
    for (const machine of [first, second]) {
      expect(machine.collect('storageUsageRepositories')).toStrictEqual([
        { value: 4, attributes: { 'tau.plan': 'pro' } },
      ]);
      expect(machine.collect('storageAccountingLastSuccess')).toStrictEqual([
        { value: 1000, attributes: { 'tau.storage.accounting.task': 'usage' } },
      ]);
    }
  });

  it('should count a task its configuration leaves off as skipped, once per interval, and export nothing for it', async () => {
    let now = 0;
    const metrics = fakeMetrics();
    const usage = vi.fn(async () => usageFigures);
    const scheduler = new StorageAccountingScheduler({
      tasks: [
        { name: 'r2_analytics', intervalMilliseconds: hour, run: undefined },
        { name: 'usage', intervalMilliseconds: hour, run: usage },
      ],
      store: memorySnapshotStore(() => now),
      metrics,
      now: () => now,
    });

    await scheduler.tick();
    now += 60_000;
    await scheduler.tick();

    expect(metrics.passes).toStrictEqual([
      { task: 'r2_analytics', outcome: 'skipped' },
      { task: 'usage', outcome: 'ok' },
    ]);
    expect(metrics.collect('r2StoredBytes')).toStrictEqual([]);
    expect(metrics.collect('storageAccountingLastSuccess')).toStrictEqual([
      { value: 0, attributes: { 'tau.storage.accounting.task': 'usage' } },
    ]);
    expect(usage).toHaveBeenCalledTimes(1);
  });

  it('should advance last_success per task, each on its own interval', async () => {
    let now = 0;
    const metrics = fakeMetrics();
    const scheduler = new StorageAccountingScheduler({
      tasks: [
        { name: 'db', intervalMilliseconds: 60_000, run: async () => ({}) },
        {
          name: 'usage',
          intervalMilliseconds: hour,
          run: async () => usageFigures,
        },
      ],
      store: memorySnapshotStore(() => now),
      metrics,
      now: () => now,
    });
    const lastSuccess = (): Record<string, number> =>
      Object.fromEntries(
        metrics
          .collect('storageAccountingLastSuccess')
          .map((observed) => [String(observed.attributes['tau.storage.accounting.task']), observed.value]),
      );

    await scheduler.tick();
    expect(lastSuccess()).toStrictEqual({ db: 0, usage: 0 });

    now = 120_000;
    await scheduler.tick();
    expect(lastSuccess()).toStrictEqual({ db: 120, usage: 0 });

    now = hour;
    await scheduler.tick();
    expect(lastSuccess()).toStrictEqual({ db: 3600, usage: 3600 });
  });

  it('should count a failed pass, keep the last figures and their time, and run the other tasks', async () => {
    let now = 0;
    let failing = false;
    const metrics = fakeMetrics();
    const scheduler = new StorageAccountingScheduler({
      tasks: [
        {
          name: 'usage',
          intervalMilliseconds: 60_000,
          run: async () => {
            if (failing) {
              throw new Error('the database went away');
            }
            return usageFigures;
          },
        },
        { name: 'db', intervalMilliseconds: 60_000, run: async () => ({}) },
      ],
      store: memorySnapshotStore(() => now),
      metrics,
      now: () => now,
    });

    await scheduler.tick();
    failing = true;
    now = 120_000;
    await scheduler.tick();

    expect(metrics.passes).toContainEqual({ task: 'usage', outcome: 'error' });
    expect(metrics.passes.filter((pass) => pass.task === 'db')).toHaveLength(2);
    expect(metrics.collect('storageUsageRepositories')).toHaveLength(1);
    expect(metrics.collect('storageAccountingLastSuccess')).toContainEqual({
      value: 0,
      attributes: { 'tau.storage.accounting.task': 'usage' },
    });
  });
});

describe('accountingTasks', () => {
  const database = mock<DatabaseType>();
  const resolvePlan: ResolvePlan = async () => ({ plan: 'pro', limitBytes: 1 });

  it('should leave the R2 task inert without a Cloudflare token or account', () => {
    for (const settings of [
      { accountId: undefined, token: undefined },
      { accountId: 'acct', token: undefined },
      { accountId: undefined, token: 'token' },
    ]) {
      const source = r2SourceOf({
        ...settings,
        publicBucket: 'public',
        privateBucket: 'private',
      });
      expect(source).toBeUndefined();
      const tasks = accountingTasks({ database, resolvePlan, r2: source });
      expect(tasks.find((task) => task.name === 'r2_analytics')?.run).toBeUndefined();
      expect(tasks.find((task) => task.name === 'usage')?.run).toBeDefined();
      expect(tasks.find((task) => task.name === 'db')?.run).toBeDefined();
    }
  });

  it('should name the environment’s buckets by role when both are set', () => {
    expect(
      r2SourceOf({
        accountId: 'acct',
        token: 'token',
        publicBucket: 'tau-content-staging',
        privateBucket: 'tau-content-private-staging',
      }),
    ).toStrictEqual({
      accountId: 'acct',
      token: 'token',
      buckets: {
        public: 'tau-content-staging',
        private: 'tau-content-private-staging',
      },
    });
  });
});
