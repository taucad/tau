/**
 * The lease store on the runtime's clock (app state orchestration charter D6, I15; plan § 4 A1b; B3).
 *
 * `get` is idempotent per key and starts nothing; the first retain starts the actor; a release, or an entry never
 * retained, starts the key's grace; a retain inside the grace keeps the lease; when the grace ends the actor stops and
 * what was attached runs. Stopping the runtime drops every entry.
 */
import { StepClock } from '@taucad/xstate-testing/clock';
import { validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyEventObject, EventObject } from 'xstate';
import { createLeaseTable } from '#runtime/leases.js';
import {
  leaseGraceMilliseconds,
  leasesEventTypes,
  leasesIgnoredEvents,
  leasesMachine,
} from '#runtime/leases.machine.js';
import type { LeasesEvent } from '#runtime/leases.machine.js';

const idle = createCallbackLogic<EventObject>(() => undefined);

const stops: Array<() => void> = [];

/** The table under a running `leases` root on a step clock, as the runtime spawns it. */
const startLeases = () => {
  const clock = new StepClock();
  const table = createLeaseTable();
  const leases = createActor(validated(table.logic), { clock }).start();
  stops.push(() => {
    leases.stop();
  });
  const builds = { count: 0, starts: 0 };
  const build = () => {
    builds.count += 1;
    const actor = createActor(idle);
    const start = actor.start.bind(actor);
    actor.start = () => {
      builds.starts += 1;
      return start();
    };
    return { actor };
  };
  return { clock, leases, store: table.storeFor(leases), builds, build };
};

afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  vi.restoreAllMocks();
});

describe('lease store', () => {
  it('should build once per live key in render and start nothing', () => {
    const { store, builds, build } = startLeases();
    const first = store.get('a', build);
    const again = store.get('a', build);
    const other = store.get('b', build);

    expect(again).toBe(first);
    expect(other).not.toBe(first);
    expect(builds.count).toBe(2);
    expect(builds.starts).toBe(0);
  });

  it('should start the actor on the first retain only', () => {
    const { store, build, builds } = startLeases();
    const entry = store.get('a', build);
    const releaseOne = entry.retain();
    const releaseTwo = entry.retain();
    expect(builds.starts).toBe(1);
    releaseOne();
    releaseTwo();
  });

  it('should keep a lease across a StrictMode remount and drop it after the grace (B3)', () => {
    const { clock, store, build, builds } = startLeases();
    const entry = store.get('a', build);
    const disposed = vi.fn();
    entry.attach(disposed);

    /* Mount, StrictMode's unmount, and the remount: one lease throughout. */
    expect(entry.isDropped()).toBe(false);
    const firstRelease = entry.retain();
    firstRelease();
    const release = entry.retain();
    clock.advance(leaseGraceMilliseconds);
    expect(store.get('a', build)).toBe(entry);
    expect(entry.actor.getSnapshot().status).toBe('active');
    expect(disposed).not.toHaveBeenCalled();

    /* The unmount: the actor lives through the grace, not past it. */
    release();
    clock.advance(leaseGraceMilliseconds - 1);
    expect(entry.actor.getSnapshot().status).toBe('active');
    clock.advance(1);
    expect(entry.actor.getSnapshot().status).toBe('stopped');
    expect(disposed).toHaveBeenCalledOnce();

    /* The next render leases a fresh entry. */
    expect(store.get('a', build)).not.toBe(entry);
    expect(builds.count).toBe(2);
  });

  it('should release once however often a release is called', () => {
    const { clock, store, build } = startLeases();
    const entry = store.get('a', build);
    const releaseOne = entry.retain();
    const releaseTwo = entry.retain();
    releaseOne();
    releaseOne();
    clock.advance(leaseGraceMilliseconds);
    expect(entry.actor.getSnapshot().status).toBe('active');
    releaseTwo();
    clock.advance(leaseGraceMilliseconds);
    expect(entry.actor.getSnapshot().status).toBe('stopped');
  });

  it('should drop an entry no mount ever retained after the same grace', () => {
    const { clock, store, build, builds } = startLeases();
    const entry = store.get('a', build);
    const disposed = vi.fn();
    entry.attach(disposed);
    clock.advance(leaseGraceMilliseconds);

    expect(disposed).toHaveBeenCalledOnce();
    expect(builds.starts).toBe(0);
    expect(store.get('a', build)).not.toBe(entry);
  });

  it('should refuse a retain of a dropped entry and dispose what is attached to it at once', () => {
    const { clock, store, build, builds } = startLeases();
    const entry = store.get('a', build);
    clock.advance(leaseGraceMilliseconds);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(entry.isDropped()).toBe(true);
    const release = entry.retain();
    release();
    expect(builds.starts).toBe(0);
    expect(error).toHaveBeenCalledWith("[leases] 'a' was retained after it was dropped");

    const late = vi.fn();
    entry.attach(late);
    expect(late).toHaveBeenCalledOnce();
  });

  it('should run an attached disposer once however often it is attached', () => {
    const { clock, store, build } = startLeases();
    const entry = store.get('a', build);
    const disposed = vi.fn();
    entry.attach(disposed);
    entry.attach(disposed);
    clock.advance(leaseGraceMilliseconds);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('should abort the drop signal of an entry when it is dropped', () => {
    const { clock, store, build } = startLeases();
    const entry = store.get('a', build);
    expect(entry.dropped.aborted).toBe(false);
    clock.advance(leaseGraceMilliseconds);
    expect(entry.dropped.aborted).toBe(true);
  });

  it('should run every disposer when one of them throws', () => {
    const { clock, store, build } = startLeases();
    const entry = store.get('a', build);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const after = vi.fn();
    entry.attach(() => {
      throw new Error('dispose failed');
    });
    entry.attach(after);
    clock.advance(leaseGraceMilliseconds);

    expect(after).toHaveBeenCalledOnce();
    expect(entry.isDropped()).toBe(true);
    expect(error).toHaveBeenCalledWith("[leases] a disposer of 'a' failed", expect.any(Error));
  });

  it('should drop every entry when the runtime stops', () => {
    const { leases, store, build } = startLeases();
    const kept = store.get('a', build);
    const unretained = store.get('b', build);
    const keptDisposed = vi.fn();
    const unretainedDisposed = vi.fn();
    kept.attach(keptDisposed);
    unretained.attach(unretainedDisposed);
    kept.retain();

    leases.stop();

    expect(kept.actor.getSnapshot().status).toBe('stopped');
    expect(keptDisposed).toHaveBeenCalledOnce();
    expect(unretainedDisposed).toHaveBeenCalledOnce();
  });

  it('should start no grace before the runtime starts, so a server render drops nothing', () => {
    const clock = new StepClock();
    const table = createLeaseTable();
    const leases = createActor(table.logic, { clock });
    const store = table.storeFor(leases);
    const disposed = vi.fn();
    store.get('a', () => ({ actor: createActor(idle), dispose: disposed }));

    expect(clock.nextDue()).toBeUndefined();
    clock.advance(leaseGraceMilliseconds);
    expect(disposed).not.toHaveBeenCalled();
  });
});

describe('lease clock totality', () => {
  type Samples = { [T in LeasesEvent['type']]: ReadonlyArray<Extract<LeasesEvent, { type: T }>> };
  const samples: Samples = {
    created: [{ type: 'created', key: 'a' }],
    retained: [{ type: 'retained', key: 'a' }],
    released: [{ type: 'released', key: 'a' }],
  };

  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...leasesEventTypes].toSorted());
  });

  it('should answer every public event in every reachable state (MC-R17)', () => {
    expect(
      unansweredEvents(leasesMachine, {
        events: Object.values(samples).flat() as readonly AnyEventObject[],
        limit: 200,
        ignore: leasesIgnoredEvents,
        /* Retain counts are unbounded; none, one and many are the distinct cases. */
        serializeState: (snapshot) =>
          JSON.stringify(
            Object.entries((snapshot.context as { retains: Record<string, number> }).retains).map(([key, count]) => [
              key,
              Math.min(count, 2),
            ]),
          ),
      }),
    ).toEqual([]);
    expect(leasesIgnoredEvents).toEqual([]);
  });

  it('should answer a retain or release of an unknown key with no change', () => {
    const leases = createActor(validated(leasesMachine), { clock: new StepClock() }).start();
    leases.send({ type: 'retained', key: 'missing' });
    leases.send({ type: 'released', key: 'missing' });
    expect(leases.getSnapshot().context.retains).toEqual({});
    leases.stop();
  });
});
