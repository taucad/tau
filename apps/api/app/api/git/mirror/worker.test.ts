import { describe, expect, it } from 'vitest';
import { repositoryLocator } from '#api/git/store/locator.js';
import { ownerMarkerKey } from '#api/git/mirror/keys.js';
import { harness, last, total } from '#api/git/mirror/mirror.fixture.js';
import { backoffMilliseconds, pollOnce, runMirrorWorker } from '#api/git/mirror/worker.js';

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
});
