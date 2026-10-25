import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';
import { lfsKey, ownerMarkerKey } from '#api/git/mirror/keys.js';
import { harness, last, total } from '#api/git/mirror/mirror.fixture.js';
import { backoffMilliseconds, pollOnce, probeTtlMilliseconds, runMirrorWorker } from '#api/git/mirror/worker.js';
import type { ProbeState } from '#api/git/mirror/worker.js';

const alice = repositoryLocator({
  ownerId: 'user_alice',
  projectId: 'proj_one',
});
const options = { concurrency: 2, backfillShare: 0.5 };

describe('backoffMilliseconds', () => {
  it('should double from the base with jitter, and never pass five minutes', () => {
    expect(backoffMilliseconds(1, 10_000, () => 0)).toBe(5000);
    expect(backoffMilliseconds(1, 10_000, () => 1)).toBe(10_000);
    expect(backoffMilliseconds(3, 10_000, () => 1)).toBe(40_000);
    expect(backoffMilliseconds(30, 10_000, () => 1)).toBe(300_000);
  });
});

describe('pollOnce', () => {
  it('should count an idle poll as a noop round, so a live idle copier is told from a dead one', async () => {
    const h = harness();

    expect(await pollOnce({ context: h.context, ...options })).toBe(true);

    expect(
      total(h.recorded, 'tau.mirror.rounds', {
        outcome: 'noop',
        destination: 'b2',
      }),
    ).toBe(1);
    expect(last(h.recorded, 'tau.mirror.destination_up')).toBe(1);
    expect(last(h.recorded, 'tau.mirror.copy_lag_seconds')).toBe(0);
  });

  it('should copy what is behind and mark a deleted owner within the same poll', async () => {
    const h = harness();
    h.ledger.recordGeneration(alice, h.source.push(alice, h.time.now()).generation);
    h.ledger.tombstones.set('user_gone', {
      ownerId: 'user_gone',
      deletedAt: h.time.now(),
      purgeAfter: h.time.now(),
      erasure: true,
      copyMarkedAt: undefined,
    });

    await pollOnce({ context: h.context, ...options });

    expect(h.ledger.row('proj_one').copiedGeneration).toBe(1);
    expect(h.destination.keys()).toContain(ownerMarkerKey('user_gone', h.time.now()));
    expect(total(h.recorded, 'tau.mirror.rounds', { outcome: 'copied' })).toBe(1);
  });

  it('should do nothing but report down when the copy does not answer', async () => {
    const h = harness();
    h.ledger.recordGeneration(alice, h.source.push(alice, h.time.now()).generation);
    h.destination.reachable = false;

    expect(await pollOnce({ context: h.context, ...options })).toBe(false);

    expect(last(h.recorded, 'tau.mirror.destination_up')).toBe(0);
    expect(h.destination.calls).toStrictEqual(['probe']);
    expect(last(h.recorded, 'tau.mirror.copy_lag_generations')).toBe(1);
  });

  /*
   * The staging finding (2026-10-24): the probe, a B2 version listing (a Class C
   * transaction), ran on every 10-second poll, about 8,600 a day while idle. At
   * 19:43Z it began failing; the worker backed off and logged only
   * `tau_mirror.lagging`, never why.
   */
  it('should not probe the copy on every idle poll while a successful probe stands', async () => {
    const h = harness();
    const probe: ProbeState = { up: false, checkedAt: undefined };
    const probes = (): number => h.destination.calls.filter((call) => call === 'probe').length;

    await pollOnce({ context: h.context, ...options }, undefined, undefined, probe);
    h.time.advance(10_000);
    await pollOnce({ context: h.context, ...options }, undefined, undefined, probe);

    expect(probes()).toBe(1);
    expect(last(h.recorded, 'tau.mirror.destination_up')).toBe(1);
    expect(total(h.recorded, 'tau.mirror.rounds', { outcome: 'noop', destination: 'b2' })).toBe(2);

    h.time.advance(probeTtlMilliseconds);
    await pollOnce({ context: h.context, ...options }, undefined, undefined, probe);

    expect(probes()).toBe(2);
  });

  it('should probe again on the next poll after the copy refuses a write', async () => {
    const h = harness();
    const probe: ProbeState = { up: false, checkedAt: undefined };
    const probes = (): number => h.destination.calls.filter((call) => call === 'probe').length;
    h.ledger.recordGeneration(alice, h.source.push(alice, h.time.now()).generation);
    h.destination.failPutAt = 1;

    await pollOnce({ context: h.context, ...options }, undefined, undefined, probe);
    h.time.advance(10_000);
    await pollOnce({ context: h.context, ...options }, undefined, undefined, probe);

    expect(total(h.recorded, 'tau.mirror.copy_failures', { stage: 'dest_write' })).toBe(1);
    expect(probes()).toBe(2);
  });

  it('should say why the copy did not answer', async () => {
    const h = harness();
    h.destination.reachable = false;

    expect(await pollOnce({ context: h.context, ...options })).toBe(false);

    expect(h.events).toContainEqual({
      event: 'tau_mirror.destination_down',
      status: 403,
      code: 'AccessDenied',
      message: 'Transaction cap exceeded',
    });
  });

  it('should back a failing repository off without holding up the rest', async () => {
    const h = harness();
    const bob = repositoryLocator({
      ownerId: 'user_bob',
      projectId: 'proj_two',
    });
    h.ledger.recordGeneration(alice, 3);
    const retry = new Map<string, { failures: number; at: number }>();

    await pollOnce({ context: h.context, ...options }, retry);
    expect(retry.get('proj_one')?.failures).toBe(1);

    h.ledger.recordGeneration(bob, h.source.push(bob, h.time.now()).generation);
    await pollOnce({ context: h.context, ...options }, retry);

    expect(h.ledger.row('proj_two').copiedGeneration).toBe(1);
    // The failing project was excluded while its backoff ran, so it failed only once.
    expect(
      total(h.recorded, 'tau.mirror.copy_failures', {
        reason: 'source_missing',
      }),
    ).toBe(1);
  });
});

describe('pollOnce and LFS finalized after the newest copied generation', () => {
  /*
   * The staging finding (2026-10-24): a 100 MiB object, finalized and reachable,
   * kept `copied_at` NULL while every repository was caught up and nothing
   * failed. A round copies only LFS finalized at or before its generation's
   * commit, and a caught-up repository is never claimed, so an object finalized
   * after the last push waited for a push that never came.
   */
  it('should copy an LFS object finalized after the last push once the repository is caught up', async () => {
    const h = harness();
    h.ledger.recordGeneration(alice, h.source.push(alice, h.time.now()).generation);
    await pollOnce({ context: h.context, ...options });
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(1);

    h.time.advance(60_000);
    const late = h.source.addLfs(alice, 'a 100 MiB object, verified after its push');
    h.ledger.addLfsRow(alice, late, h.time.now());
    h.time.advance(5 * 60_000);

    await pollOnce({ context: h.context, ...options });

    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toStrictEqual([lfsKey(alice, late.oid)]);
    expect([...(await h.ledger.copiedLfs('proj_one'))]).toStrictEqual([late.oid]);
    expect(last(h.recorded, 'tau.mirror.lfs_backlog_objects')).toBe(0);
    // No new generation, so no new snapshot and no watermark move.
    expect(h.ledger.row('proj_one').copiedGeneration).toBe(1);
    expect(h.destination.keys(`tenants/${alice.ownerId}/repos/${alice.projectId}/manifests/`)).toHaveLength(1);
  });

  it("should leave an erased owner's late LFS object uncopied", async () => {
    const h = harness();
    h.ledger.recordGeneration(alice, h.source.push(alice, h.time.now()).generation);
    await pollOnce({ context: h.context, ...options });
    h.time.advance(60_000);
    const late = h.source.addLfs(alice, 'late object of an owner deleted since');
    h.ledger.addLfsRow(alice, late, h.time.now());
    h.ledger.tombstones.set(alice.ownerId, {
      ownerId: alice.ownerId,
      deletedAt: h.time.now(),
      purgeAfter: h.time.now(),
      erasure: true,
      copyMarkedAt: undefined,
    });
    h.time.advance(5 * 60_000);

    await pollOnce({ context: h.context, ...options });

    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toStrictEqual([]);
  });

  /** A caught-up repository with `count` late objects, its first copy done. */
  const caughtUpWithLate = async (h: ReturnType<typeof harness>, count: number) => {
    h.ledger.recordGeneration(alice, h.source.push(alice, h.time.now()).generation);
    await pollOnce({ context: h.context, ...options });
    h.time.advance(60_000);
    const late = Array.from({ length: count }, (_, index) => {
      const object = h.source.addLfs(alice, `late object ${String(index)}`);
      h.ledger.addLfsRow(alice, object, h.time.now());
      return object;
    });
    h.time.advance(5 * 60_000);
    return late;
  };

  it("should copy at most one batch of a caught-up repository's late LFS per poll, so new pushes are not held up", async () => {
    const h = harness();
    await caughtUpWithLate(h, 5);
    const context = { ...h.context, lfsBatch: 2 };

    await pollOnce({ context, ...options });
    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toHaveLength(2);

    await pollOnce({ context, ...options });
    await pollOnce({ context, ...options });
    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toHaveLength(5);
  });

  it("should stop a caught-up round's late LFS at its byte budget, copying at least one object", async () => {
    const h = harness();
    await caughtUpWithLate(h, 3);
    const context = { ...h.context, lateLfsBytes: 1 };

    await pollOnce({ context, ...options });
    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toHaveLength(1);

    await pollOnce({ context, ...options });
    await pollOnce({ context, ...options });
    expect(h.destination.keys(`tenants/${alice.ownerId}/lfs/`)).toHaveLength(3);
  });

  it('should extend a late LFS version a crashed round left to at least the recorded lock before marking it copied', async () => {
    const h = harness();
    const [late] = await caughtUpWithLate(h, 1);
    const bytes = h.source.lfs.get(`${alice.ownerId}/${alice.projectId}/${late!.oid}`)!;
    // A crashed round uploaded it with a lock short of the one the row records.
    await h.destination.put(lfsKey(alice, late!.oid), bytes, {
      contentLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('base64'),
      retainUntil: new Date(h.time.now().getTime() + 60_000),
    });

    await pollOnce({ context: h.context, ...options });

    expect([...(await h.ledger.copiedLfs('proj_one'))]).toStrictEqual([late!.oid]);
    const recorded = h.ledger.row('proj_one').copyLockedUntil!;
    expect(h.destination.objects.get(lfsKey(alice, late!.oid))).toHaveLength(1);
    expect(h.destination.latest(lfsKey(alice, late!.oid))!.retainUntil.getTime()).toBeGreaterThanOrEqual(
      recorded.getTime(),
    );
  });
});

describe('runMirrorWorker', () => {
  it('should stop on abort between polls', async () => {
    const h = harness();
    const stop = new AbortController();
    const running = runMirrorWorker({
      context: h.context,
      signal: stop.signal,
      pollMilliseconds: 60_000,
      ...options,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    stop.abort();

    await expect(running).resolves.toBeUndefined();
    expect(total(h.recorded, 'tau.mirror.rounds', { outcome: 'noop' })).toBe(1);
  });

  it('should start the verify drill once shortly after start, beside the polls, and wait for it on stop', async () => {
    const h = harness();
    const stop = new AbortController();
    let drills = 0;
    let finished = false;
    const running = runMirrorWorker({
      context: h.context,
      signal: stop.signal,
      pollMilliseconds: 60_000,
      ...options,
      drill: {
        startDelayMilliseconds: 0,
        run: async () => {
          drills += 1;
          await new Promise((resolve) => {
            setTimeout(resolve, 30);
          });
          finished = true;
        },
      },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    // The drill runs detached: the worker is already waiting for its next poll.
    expect(drills).toBe(1);
    expect(finished).toBe(false);
    stop.abort();

    await expect(running).resolves.toBeUndefined();
    expect(finished).toBe(true);
    expect(drills).toBe(1);
  });

  it('should report a drill that throws and keep the worker running', async () => {
    const h = harness();
    const stop = new AbortController();
    const running = runMirrorWorker({
      context: h.context,
      signal: stop.signal,
      pollMilliseconds: 60_000,
      ...options,
      drill: {
        startDelayMilliseconds: 0,
        run: async () => {
          throw new Error('the drill could not record its run');
        },
      },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    stop.abort();

    await expect(running).resolves.toBeUndefined();
    expect(h.events).toContainEqual(
      expect.objectContaining({
        event: 'tau_mirror.pass_failed',
        pass: 'drill',
        message: 'the drill could not record its run',
      }),
    );
  });
});
