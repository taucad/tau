import { setTimeout as delay } from 'node:timers/promises';
import { copyRepository, markTombstonedOwners, retentionClock } from '#api/git/mirror/copier.js';
import type { CopierContext } from '#api/git/mirror/copier.js';
import { reconcile } from '#api/git/mirror/reconcile.js';
import { runRetentionSweep } from '#api/git/mirror/retention.js';
import type { CopyCandidate } from '#api/git/mirror/watermark.js';

/**
 * The long-running `tau-mirror` loop (W13 B4): every poll it probes the copy,
 * marks newly deleted owners, copies what is behind, and exports the lag and
 * backlog gauges; once a day it runs the retention sweep and the active
 * reconcile, and on Sundays (UTC) the full reconcile.
 *
 * An idle poll counts one `noop` round, so `tau_mirror_rounds_total` exists
 * whenever the copier does and `storage-mirror-absent` can tell a dead copier
 * from an idle one (W14).
 */

const minute = 60 * 1000;
const day = 24 * 60 * minute;

/**
 * How long an LFS object finalized after a repository's last push waits before a
 * caught-up repository is claimed for it: long enough that the push it belongs to
 * usually lands first and copies it in its own round.
 */
export const lateLfsGraceMilliseconds = minute;

/** Jittered exponential backoff to W13's 5-minute ceiling. */
export const backoffMilliseconds = (failures: number, base: number, random: () => number = Math.random): number => {
  const ceiling = 5 * minute;
  const exponential = Math.min(ceiling, base * 2 ** Math.max(0, failures - 1));
  return Math.round(exponential / 2 + (random() * exponential) / 2);
};

export type WorkerOptions = {
  readonly context: CopierContext;
  readonly signal: AbortSignal;
  readonly pollMilliseconds: number;
  readonly concurrency: number;
  readonly backfillShare: number;
  /** Delay before the first daily pass after a start, so a crash loop does not sweep on every boot. */
  readonly dailyStartDelayMilliseconds?: number;
  /**
   * The verify drill (DR2-lite), once `startDelayMilliseconds` after start (default
   * 5 minutes) and then daily. It runs beside the polls, never blocking a copy, at
   * most one at a time, and the worker waits for it on stop.
   */
  readonly drill?: {
    readonly run: () => Promise<unknown>;
    readonly startDelayMilliseconds?: number;
  };
};

type Schedule = {
  sweepAt: number;
  activeAt: number;
  fullDay: string | undefined;
  drillAt: number;
};

const runPool = async (items: readonly CopyCandidate[], limit: number, run: (item: CopyCandidate) => Promise<void>) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next]!;
        next += 1;
        // oxlint-disable-next-line no-await-in-loop -- a worker of a bounded pool
        await run(item);
      }
    }),
  );
};

/** One poll: probe, owner markers, copy rounds, gauges. Returns whether the destination answered. */
export const pollOnce = async (
  options: Pick<WorkerOptions, 'context' | 'concurrency' | 'backfillShare'>,
  retry = new Map<string, { failures: number; at: number }>(),
  pollMilliseconds = 10_000,
): Promise<boolean> => {
  const { context } = options;
  const reachable = await context.destination.probe(context.signal);
  context.metrics.up(reachable);
  if (reachable) {
    await markTombstonedOwners(context);
    const now = retentionClock(context).at.getTime();
    const waiting = new Set([...retry].filter(([, entry]) => entry.at > now).map(([projectId]) => projectId));
    const limit = options.concurrency * 4;
    const claimed = await context.ledger.claim({
      limit,
      backfillLimit: Math.max(1, Math.floor(limit * options.backfillShare)),
      exclude: waiting,
    });
    // Caught-up repositories holding LFS finalized after their last push take what room is left.
    const late =
      claimed.length >= limit
        ? []
        : await context.ledger.lfsStragglers({
            limit: limit - claimed.length,
            finalizedBefore: new Date(now - lateLfsGraceMilliseconds),
            exclude: new Set([...waiting, ...claimed.map((candidate) => candidate.projectId)]),
          });
    const candidates = [...claimed, ...late];
    if (candidates.length === 0) {
      context.metrics.round('noop');
    }
    await runPool(candidates, options.concurrency, async (candidate) => {
      const result = await copyRepository(context, candidate);
      if (result.outcome === 'failed') {
        const failures = (retry.get(candidate.projectId)?.failures ?? 0) + 1;
        retry.set(candidate.projectId, {
          failures,
          at: now + backoffMilliseconds(failures, pollMilliseconds),
        });
      } else {
        retry.delete(candidate.projectId);
      }
    });
  }
  await exportBacklog(context);
  return reachable;
};

/** The lag, backlog and lock-headroom gauges, exact from Postgres while the copier runs (W13 B5). */
export const exportBacklog = async (context: CopierContext): Promise<void> => {
  const reading = await context.ledger.backlog();
  const now = retentionClock(context).at.getTime();
  const lagSeconds =
    reading.oldestPendingSince === undefined ? 0 : Math.max(0, (now - reading.oldestPendingSince.getTime()) / 1000);
  context.metrics.backlog({
    lagSeconds,
    lagGenerations: reading.lagGenerations,
    steady: reading.steady,
    backfill: reading.backfill,
    lfsBacklog: reading.lfsBacklog,
    lockHeadroomSeconds:
      reading.earliestLockedUntil === undefined ? undefined : (reading.earliestLockedUntil.getTime() - now) / 1000,
  });
  if (lagSeconds > 900) {
    context.report?.({
      event: 'tau_mirror.lagging',
      lagSeconds,
      steady: reading.steady,
    });
  }
};

const daily = async (context: CopierContext, schedule: Schedule): Promise<void> => {
  const now = retentionClock(context).at;
  const run = async (name: string, pass: () => Promise<unknown>): Promise<void> => {
    try {
      await pass();
    } catch (error) {
      context.report?.({
        event: 'tau_mirror.pass_failed',
        pass: name,
        error: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  if (now.getTime() >= schedule.sweepAt) {
    schedule.sweepAt = now.getTime() + day;
    await run('sweep', async () => runRetentionSweep(context));
  }
  if (now.getTime() >= schedule.activeAt) {
    schedule.activeAt = now.getTime() + day;
    await run('reconcile-active', async () => reconcile(context, 'active'));
  }
  const today = now.toISOString().slice(0, 10);
  if (now.getUTCDay() === 0 && schedule.fullDay !== today) {
    schedule.fullDay = today;
    await run('reconcile-full', async () => reconcile(context, 'full'));
  }
};

/** Runs until `signal` aborts. Never throws for a failed poll: it logs and backs off. */
export const runMirrorWorker = async (options: WorkerOptions): Promise<void> => {
  const { context, signal } = options;
  const start = retentionClock(context).at.getTime() + (options.dailyStartDelayMilliseconds ?? 5 * minute);
  const schedule: Schedule = {
    sweepAt: start,
    activeAt: start,
    fullDay: undefined,
    drillAt: retentionClock(context).at.getTime() + (options.drill?.startDelayMilliseconds ?? 5 * minute),
  };
  let drilling: Promise<void> | undefined;
  const startDrill = (): void => {
    const { drill } = options;
    const now = retentionClock(context).at.getTime();
    if (drill === undefined || drilling !== undefined || now < schedule.drillAt || signal.aborted) {
      return;
    }
    schedule.drillAt = now + day;
    const running = async (): Promise<void> => {
      try {
        await drill.run();
      } catch (error) {
        context.report?.({
          event: 'tau_mirror.pass_failed',
          pass: 'drill',
          error: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        drilling = undefined;
      }
    };
    // Detached on purpose: the drill streams for minutes and must not hold up a copy poll.
    drilling = running();
  };
  const retry = new Map<string, { failures: number; at: number }>();
  let downPolls = 0;
  while (!signal.aborted) {
    let wait = options.pollMilliseconds;
    try {
      // oxlint-disable-next-line no-await-in-loop -- polls are sequential by design
      const reachable = await pollOnce(options, retry, options.pollMilliseconds);
      downPolls = reachable ? 0 : downPolls + 1;
      if (reachable) {
        startDrill();
        // oxlint-disable-next-line no-await-in-loop -- the daily passes run between polls
        await daily(context, schedule);
      } else {
        wait = backoffMilliseconds(downPolls, options.pollMilliseconds);
      }
    } catch (error) {
      context.report?.({
        event: 'tau_mirror.poll_failed',
        error: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- the poll interval
      await delay(wait, undefined, { signal });
    } catch {
      break;
    }
  }
  await drilling;
};
