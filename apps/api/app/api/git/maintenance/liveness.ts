import { json } from 'node:stream/consumers';
import { z } from 'zod';
import { isS3ObjectMissing } from '#storage/object-storage.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';

/**
 * The maintenance group's liveness (audit L6-F14, go-live OBS-11). The loop is
 * three subcommands and then a 24-hour sleep, so a silent group is normal most
 * of the day and silence alone cannot tell sleeping from dead. Each scheduled
 * subcommand therefore records when it started, completed or failed in one
 * small object, and {@link readMaintenanceLiveness} judges that record against
 * the clock. The record is written by the process it describes, into storage
 * the API already reads, so a dead group is visible from any other Machine.
 */

/** The subcommands the nightly loop runs, in order. */
export const scheduledMaintenanceCommands = ['purge', 'retire-lfs', 'collect-blobs'] as const;

/** One of {@link scheduledMaintenanceCommands}. */
export type ScheduledMaintenanceCommand = (typeof scheduledMaintenanceCommands)[number];

/** How long one subcommand may run before an unfinished start counts as a failure. */
export const maintenancePassBudgetMilliseconds = 6 * 60 * 60 * 1000;

/**
 * How old the last completion may be before the group is stale: the loop's
 * 24-hour sleep plus one pass budget.
 */
export const maintenanceStaleAfterMilliseconds = 24 * 60 * 60 * 1000 + maintenancePassBudgetMilliseconds;

/** The two storage calls the record needs. */
export type LivenessStore = Pick<ObjectStorageService, 'putBlob' | 'getBlob'>;

const runRecordSchema = z.object({
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  failedAt: z.iso.datetime().optional(),
});

/** What one subcommand last did, as ISO timestamps. */
export type MaintenanceRunRecord = z.infer<typeof runRecordSchema>;

/**
 * - `healthy`: the last pass completed within {@link maintenanceStaleAfterMilliseconds};
 * - `running`: a pass started within {@link maintenancePassBudgetMilliseconds} and the one before it is not stale;
 * - `failed`: the last pass threw, or started and neither finished nor failed within the budget (a kill);
 * - `stale`: no completion within the threshold, including a subcommand that never ran.
 */
export type MaintenanceCommandState = 'healthy' | 'running' | 'failed' | 'stale';

/** One subcommand's verdict and the record it was judged from. */
export type MaintenanceCommandLiveness = MaintenanceRunRecord & { state: MaintenanceCommandState };

/** The group's verdict: `ok` only when every scheduled subcommand is healthy or running. */
export type MaintenanceLiveness = {
  ok: boolean;
  commands: Record<ScheduledMaintenanceCommand, MaintenanceCommandLiveness>;
};

/*
 * Private tier, beside `blobs/jobs/`: no CDN serves it and no listing sweeps
 * `blobs/`, so the record is neither public nor collected.
 */
const recordLocation = (command: ScheduledMaintenanceCommand) =>
  ({ namespace: 'blobs', key: `revisions-maintenance/liveness/${command}.json`, tier: 'private' }) as const;

const readRecord = async (
  store: LivenessStore,
  command: ScheduledMaintenanceCommand,
): Promise<MaintenanceRunRecord | undefined> => {
  try {
    const { body } = await store.getBlob(recordLocation(command));
    return runRecordSchema.parse(await json(body));
  } catch (error) {
    if (isS3ObjectMissing(error)) {
      return undefined;
    }
    throw error;
  }
};

const writeRecord = async (
  store: LivenessStore,
  command: ScheduledMaintenanceCommand,
  record: MaintenanceRunRecord,
): Promise<void> => {
  await store.putBlob({
    ...recordLocation(command),
    body: new TextEncoder().encode(JSON.stringify(record)),
    contentType: 'application/json',
  });
};

const time = (value: string | undefined): number | undefined => (value === undefined ? undefined : Date.parse(value));

const commandState = (record: MaintenanceRunRecord | undefined, now: Date): MaintenanceCommandState => {
  const started = time(record?.startedAt);
  const completed = time(record?.completedAt);
  const failed = time(record?.failedAt);
  const completedInTime = completed !== undefined && now.getTime() - completed <= maintenanceStaleAfterMilliseconds;

  if (started !== undefined && (completed === undefined || started > completed)) {
    if ((failed !== undefined && failed >= started) || now.getTime() - started > maintenancePassBudgetMilliseconds) {
      return 'failed';
    }
    // A first pass has nothing to be stale against; a restart loop after one has.
    return completed === undefined || completedInTime ? 'running' : 'stale';
  }

  return completedInTime ? 'healthy' : 'stale';
};

/**
 * Runs one scheduled subcommand and records its start, then its completion or
 * failure. A failure is rethrown so the command still exits 1 into Fly's
 * restart policy; a kill that nothing can catch leaves only the start, which
 * {@link readMaintenanceLiveness} reports as `failed` once the budget passes.
 */
export const recordMaintenancePass = async <T>(args: {
  store: LivenessStore;
  command: ScheduledMaintenanceCommand;
  run: () => Promise<T>;
  now?: () => Date;
  report?: (line: string) => void;
}): Promise<T> => {
  const now = args.now ?? (() => new Date());
  const previous = await readRecord(args.store, args.command);
  const started = { ...previous, startedAt: now().toISOString() };
  await writeRecord(args.store, args.command, started);

  let result: T;
  try {
    result = await args.run();
  } catch (error) {
    const failed = { ...started, failedAt: now().toISOString() };
    args.report?.(
      JSON.stringify({ event: 'revisions_maintenance.pass', command: args.command, outcome: 'failed', ...failed }),
    );
    try {
      await writeRecord(args.store, args.command, failed);
    } catch {
      // The pass's own error is the one worth exiting with; an unwritten
      // failure still reads as `failed` once the pass budget runs out.
    }
    throw error;
  }

  const completed = { ...started, completedAt: now().toISOString() };
  await writeRecord(args.store, args.command, completed);
  args.report?.(
    JSON.stringify({ event: 'revisions_maintenance.pass', command: args.command, outcome: 'completed', ...completed }),
  );
  return result;
};

/** Reads every scheduled subcommand's record and judges it at `now`. */
export const readMaintenanceLiveness = async (store: LivenessStore, now: Date): Promise<MaintenanceLiveness> => {
  const entries = await Promise.all(
    scheduledMaintenanceCommands.map(async (command) => {
      const record = await readRecord(store, command);
      return [command, { ...record, state: commandState(record, now) }] as const;
    }),
  );
  const commands = Object.fromEntries(entries) as MaintenanceLiveness['commands'];
  const ok = Object.values(commands).every(({ state }) => state === 'healthy' || state === 'running');
  return { ok, commands };
};
