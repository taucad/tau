import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { PutBlobArgs } from '#storage/object-storage.service.js';
import {
  maintenancePassBudgetMilliseconds,
  maintenanceStaleAfterMilliseconds,
  readMaintenanceLiveness,
  recordMaintenancePass,
} from '#api/git/maintenance/liveness.js';
import type { LivenessStore } from '#api/git/maintenance/liveness.js';

/**
 * The maintenance group's liveness (audit L6-F14, go-live OBS-11): each
 * scheduled pass leaves a durable record, and a reader tells a group that is
 * sleeping between nightly passes from one that stopped running them.
 */

const hour = 60 * 60 * 1000;
const midnight = new Date('2026-09-25T00:00:00.000Z');
const at = (milliseconds: number): Date => new Date(midnight.getTime() + milliseconds);

/** The two calls the record needs, over a map, answering a missing key the way S3 does. */
const memoryStore = (): LivenessStore & { objects: Map<string, string> } => {
  const objects = new Map<string, string>();
  return {
    objects,
    async putBlob(args: PutBlobArgs) {
      objects.set(`${args.tier ?? 'public'}:${args.namespace}/${args.key}`, new TextDecoder().decode(args.body));
      return { lost: false, etag: '', alreadyExisted: false };
    },
    async getBlob(args) {
      const body = objects.get(`${args.tier ?? 'public'}:${args.namespace}/${args.key}`);
      if (body === undefined) {
        throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
      }
      return { body: Readable.from([body]), contentType: 'application/json', etag: '' };
    },
  };
};

/** Every scheduled subcommand completes one pass starting at `start`. */
const completeNightlyPass = async (store: LivenessStore, start: Date): Promise<void> => {
  for (const command of ['purge', 'retire-lfs', 'collect-blobs'] as const) {
    // oxlint-disable-next-line no-await-in-loop -- the loop runs the subcommands one after another
    await recordMaintenancePass({ store, command, now: () => start, run: async () => 'done' });
  }
};

/**
 * A kill the process cannot catch (OOM, SIGKILL): the start is recorded and the
 * pass never settles, so neither a completion nor a failure is ever written.
 */
const killPurgeMidRun = async (store: LivenessStore, start: Date): Promise<void> => {
  const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
  void recordMaintenancePass({
    store,
    command: 'purge',
    now: () => start,
    run: async () => {
      enter();
      return Promise.withResolvers<never>().promise;
    },
  });
  await entered;
};

describe('maintenance liveness', () => {
  it('should record a completed pass in the private tier and report the group healthy', async () => {
    const store = memoryStore();

    const result = await recordMaintenancePass({
      store,
      command: 'purge',
      now: () => midnight,
      run: async () => ['outcome'],
    });
    await recordMaintenancePass({ store, command: 'retire-lfs', now: () => midnight, run: async () => [] });
    await recordMaintenancePass({ store, command: 'collect-blobs', now: () => midnight, run: async () => [] });

    expect(result).toStrictEqual(['outcome']);
    expect([...store.objects.keys()].every((key) => key.startsWith('private:blobs/revisions-maintenance/'))).toBe(true);
    const liveness = await readMaintenanceLiveness(store, at(hour));
    expect(liveness.ok).toBe(true);
    expect(liveness.commands.purge).toMatchObject({ state: 'healthy', completedAt: midnight.toISOString() });
  });

  it('should stay healthy through the 24-hour sleep between passes', async () => {
    const store = memoryStore();
    await completeNightlyPass(store, midnight);

    const liveness = await readMaintenanceLiveness(store, at(maintenanceStaleAfterMilliseconds));

    expect(liveness.ok).toBe(true);
  });

  it('should report a group whose last pass is older than the threshold as stale', async () => {
    const store = memoryStore();
    await completeNightlyPass(store, midnight);

    const liveness = await readMaintenanceLiveness(store, at(maintenanceStaleAfterMilliseconds + 1));

    expect(maintenanceStaleAfterMilliseconds).toBe(30 * hour);
    expect(liveness.ok).toBe(false);
    expect(liveness.commands.purge.state).toBe('stale');
  });

  it('should report a group that never ran as stale', async () => {
    const liveness = await readMaintenanceLiveness(memoryStore(), midnight);

    expect(liveness.ok).toBe(false);
    expect(liveness.commands['collect-blobs']).toStrictEqual({ state: 'stale' });
  });

  it('should report a pass that threw as failed, not healthy, and rethrow its error', async () => {
    const store = memoryStore();
    await completeNightlyPass(store, midnight);
    const nextNight = at(24 * hour);

    await expect(
      recordMaintenancePass({
        store,
        command: 'purge',
        now: () => nextNight,
        run: async () => {
          throw new Error('storage unreachable');
        },
      }),
    ).rejects.toThrow('storage unreachable');

    const liveness = await readMaintenanceLiveness(store, at(24 * hour + 1));
    expect(liveness.ok).toBe(false);
    expect(liveness.commands.purge).toMatchObject({ state: 'failed', failedAt: nextNight.toISOString() });
  });

  it('should report a pass killed mid-run as failed once it overruns the pass budget', async () => {
    const store = memoryStore();
    await completeNightlyPass(store, midnight);
    await killPurgeMidRun(store, at(24 * hour));

    const during = await readMaintenanceLiveness(store, at(24 * hour + hour));
    const after = await readMaintenanceLiveness(store, at(24 * hour + maintenancePassBudgetMilliseconds + 1));

    expect(during.commands.purge.state).toBe('running');
    expect(during.ok).toBe(true);
    expect(after.commands.purge.state).toBe('failed');
    expect(after.ok).toBe(false);
  });

  it('should report a pass that keeps restarting without completing as stale once the threshold passes', async () => {
    const store = memoryStore();
    await completeNightlyPass(store, midnight);
    await killPurgeMidRun(store, at(maintenanceStaleAfterMilliseconds));

    const liveness = await readMaintenanceLiveness(store, at(maintenanceStaleAfterMilliseconds + 1));

    expect(liveness.commands.purge.state).toBe('stale');
    expect(liveness.ok).toBe(false);
  });
});
