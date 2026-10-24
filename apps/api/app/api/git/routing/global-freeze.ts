import type { DatabaseType } from '#database/database.service.js';
import { drainInFlight } from '#api/git/routing/in-flight.js';
import type { InFlightRegistry } from '#api/git/routing/in-flight.js';
import { freezeAll, unfreezeAll } from '#api/git/routing/route-table.js';

/**
 * The restore runbook's global freeze (W13 restore step 0, DW1), as the
 * `revisions-maintenance freeze-all` and `thaw-all` subcommands run it.
 */

/** A global freeze is a lease too: at most a day, so a forgotten one lapses rather than outlives the incident. */
export const maximumGlobalFreezeSeconds = 86_400;

/** How long `freeze-all` waits for requests already in flight before it reports them (the per-repository drain's 8 s, doubled). */
const globalDrainTimeoutMilliseconds = 16_000;

/**
 * The operator's `--for <seconds>`.
 *
 * @param raw - The flag's value.
 * @returns Whole seconds, 1 to {@link maximumGlobalFreezeSeconds}.
 * @throws Error When it is missing or out of range.
 */
export const parseFreezeSeconds = (raw: string | undefined): number => {
  const seconds = raw === undefined || !/^\d+$/u.test(raw) ? Number.NaN : Number(raw);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > maximumGlobalFreezeSeconds) {
    throw new Error(`--for takes whole seconds from 1 to ${String(maximumGlobalFreezeSeconds)}`);
  }
  return seconds;
};

/**
 * Freezes every repository, then waits for the requests that were in flight
 * when it began. A drain that times out is reported, never hidden: the
 * operator decides whether to wait again before restoring.
 *
 * @param args - The database, the shared registry, the incident or restore id, the lease and the drain bound.
 * @returns What was written, and whether every earlier request finished.
 */
export const freezeEverything = async (args: {
  database: DatabaseType;
  registry: InFlightRegistry;
  reason: string;
  forSeconds: number;
  drainTimeoutMilliseconds?: number;
}): Promise<{
  scope: 'global';
  reason: string;
  frozenAt: Date;
  frozenUntil: Date;
  drained: boolean;
}> => {
  const { frozenAt, frozenUntil } = await freezeAll(args.database, {
    migrationId: args.reason,
    forMilliseconds: args.forSeconds * 1000,
  });
  const drained = await drainInFlight(args.registry, {
    before: frozenAt,
    timeoutMilliseconds: args.drainTimeoutMilliseconds ?? globalDrainTimeoutMilliseconds,
  });
  return {
    scope: 'global',
    reason: args.reason,
    frozenAt,
    frozenUntil,
    drained,
  };
};

/**
 * Lifts the global freeze.
 *
 * @param database - The database.
 * @returns Whether one was held.
 */
export const thawEverything = async (database: DatabaseType): Promise<{ scope: 'global'; lifted: boolean }> => ({
  scope: 'global',
  lifted: await unfreezeAll(database),
});
