/**
 * The file manager's ready wait as an `after` state on the runtime's clock (charter D3, I15; inventory row S18).
 *
 * The wait ends on the file manager's answer, on its `error` state, or on the bound; a timed-out wait throws
 * `FileManagerNotReadyError` with its reason and is no longer subscribed.
 */
import { StepClock } from '@taucad/xstate-testing/clock';
import { validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import type { AnyEventObject, Observer } from 'xstate';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import {
  awaitFileManager,
  fileManagerReadyTimeout,
  fileManagerWaitEventTypes,
  fileManagerWaitMachine,
  selectReadinessSettled,
} from '#runtime/file-manager-host.wait.js';
import type { FileManagerSnapshot } from '#runtime/file-manager-host.wait.js';

type FakeState = Readonly<{ value: 'connectingWorker' | 'ready' | 'error'; proxy?: unknown }>;

/** A file manager that only answers snapshots and subscriptions, which is all the wait reads. */
const fakeFileManager = (initial: FakeState) => {
  let state = initial;
  const observers = new Set<Partial<Observer<FileManagerSnapshot>>>();
  const snapshotOf = (current: FakeState): FileManagerSnapshot =>
    ({
      matches: (value: string) => value === current.value,
      context: { proxy: current.proxy, contentService: undefined, treeService: undefined, viewClient: undefined },
    }) as unknown as FileManagerSnapshot;
  const ref = {
    getSnapshot: () => snapshotOf(state),
    subscribe: (observer: Partial<Observer<FileManagerSnapshot>>) => {
      observers.add(observer);
      return {
        unsubscribe: () => {
          observers.delete(observer);
        },
      };
    },
  } as unknown as FileManagerRef;
  return {
    ref,
    observers,
    move: (next: FakeState) => {
      state = next;
      for (const observer of observers) {
        observer.next?.(snapshotOf(next));
      }
    },
    complete: () => {
      for (const observer of observers) {
        observer.complete?.();
      }
    },
  };
};

describe('file manager ready wait', () => {
  it('should answer at once when the file manager is already there', async () => {
    const files = fakeFileManager({ value: 'ready', proxy: {} });
    const snapshot = await awaitFileManager(files.ref, 'proxy', { reason: 'proxy-timeout' });
    expect(snapshot.context.proxy).toEqual({});
    expect(files.observers.size).toBe(0);
  });

  it('should end when the file manager reaches the readiness, and unsubscribe', async () => {
    const clock = new StepClock();
    const files = fakeFileManager({ value: 'connectingWorker' });
    const waiting = awaitFileManager(files.ref, 'ready', { clock, reason: 'services-timeout' });
    expect(files.observers.size).toBe(1);
    expect(clock.nextDue()).toBe(fileManagerReadyTimeout);

    files.move({ value: 'ready' });
    const snapshot = await waiting;
    expect(snapshot.matches('ready')).toBe(true);
    expect(files.observers.size).toBe(0);
    expect(clock.nextDue()).toBeUndefined();
  });

  it('should end on the file manager in error, for the caller to throw', async () => {
    const files = fakeFileManager({ value: 'connectingWorker' });
    const waiting = awaitFileManager(files.ref, 'proxy', { clock: new StepClock(), reason: 'proxy-timeout' });
    files.move({ value: 'error' });
    const ended = await waiting;
    expect(ended.matches('error')).toBe(true);
  });

  it('should time out on the clock with its reason, and stay subscribed no longer', async () => {
    const clock = new StepClock();
    const files = fakeFileManager({ value: 'connectingWorker' });
    const waiting = awaitFileManager(files.ref, 'proxy', { clock, reason: 'proxy-timeout' });

    clock.advance(fileManagerReadyTimeout - 1);
    expect(files.observers.size).toBe(1);
    clock.advance(1);

    const error = await waiting.catch((error_: unknown) => error_);
    expect(error).toBeInstanceOf(FileManagerNotReadyError);
    expect((error as FileManagerNotReadyError).code).toBe('proxy-timeout');
    expect(files.observers.size).toBe(0);
  });

  it('should take its bound from the caller', async () => {
    const clock = new StepClock();
    const files = fakeFileManager({ value: 'connectingWorker' });
    const waiting = awaitFileManager(files.ref, 'services', {
      clock,
      timeoutMilliseconds: 10,
      reason: 'services-timeout',
    });
    clock.advance(10);
    await expect(waiting).rejects.toMatchObject({ code: 'services-timeout' });
  });

  it('should end when the file manager stops before it is ready', async () => {
    const files = fakeFileManager({ value: 'connectingWorker' });
    const waiting = awaitFileManager(files.ref, 'ready', { clock: new StepClock(), reason: 'services-timeout' });
    files.complete();
    await expect(waiting).rejects.toThrow('Actor terminated without satisfying predicate');
    expect(files.observers.size).toBe(0);
  });

  it('should settle each readiness on its own condition, and on error', () => {
    const at = (state: FakeState) => fakeFileManager(state).ref.getSnapshot();
    expect(selectReadinessSettled('proxy', at({ value: 'connectingWorker', proxy: {} }))).toBe(true);
    expect(selectReadinessSettled('ready', at({ value: 'connectingWorker', proxy: {} }))).toBe(false);
    expect(selectReadinessSettled('viewClient', at({ value: 'ready' }))).toBe(false);
    expect(selectReadinessSettled('services', at({ value: 'error' }))).toBe(true);
  });
});

describe('file manager ready wait totality', () => {
  it('should answer every public event in every reachable state (MC-R17)', () => {
    const events: readonly AnyEventObject[] = fileManagerWaitEventTypes.map((type) => ({ type }));
    expect(
      unansweredEvents(validated(fileManagerWaitMachine), {
        input: { timeoutMilliseconds: 1 },
        events,
        limit: 50,
        serializeState: (snapshot) => JSON.stringify(snapshot.value),
      }),
    ).toEqual([]);
  });
});
