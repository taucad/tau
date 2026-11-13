/**
 * The file manager's ready wait, as an `after` state (app state orchestration charter D3, I15; inventory row S18).
 *
 * A caller that needs the file manager's services, its proxy or its composed view waits for them up to
 * {@link fileManagerReadyTimeout}. The wait was a `setTimeout` raced against `waitFor`; it is now a small machine
 * whose `waiting` state ends on the file manager's answer or on an `after` on the clock it is given, which is the app
 * runtime's. The file manager is a host object of the wait, so its subscription lives in the `watch` callback's
 * closure (D4), and it ends with the wait: a timed-out wait no longer stays subscribed.
 *
 * A file manager in `error` ends the wait too, as it always did, and the caller then throws `machine-error`.
 */
import { createActor, createCallbackLogic, setup, types } from 'xstate';
import type { ActorOptions, AnyActorLogic, EventObject, SnapshotFrom } from 'xstate';
import { z } from 'zod';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';

/** A file-manager snapshot. @public */
export type FileManagerSnapshot = SnapshotFrom<typeof fileManagerMachine>;

/**
 * How long a caller waits for the file manager (milliseconds). It closes Finding 8 of the explicit-workspace
 * blueprint: without a bound the chat composer and project creation hang when the machine sticks in
 * `connectingWorker` or `initializingServices`. 30 s matches the worker boot budget.
 *
 * @public
 */
export const fileManagerReadyTimeout = 30_000;

/**
 * What a caller waits for: the content and tree services, the `ready` state, `ready` with the composed view, or the
 * worker proxy alone (handle replacement also runs in `webAccessUnavailable`).
 *
 * @public
 */
export type FileManagerReadiness = 'services' | 'ready' | 'viewClient' | 'proxy';

const readinessReached: Record<FileManagerReadiness, (snapshot: FileManagerSnapshot) => boolean> = {
  services: (snapshot) => snapshot.context.contentService !== undefined && snapshot.context.treeService !== undefined,
  ready: (snapshot) => snapshot.matches('ready'),
  viewClient: (snapshot) => snapshot.matches('ready') && snapshot.context.viewClient !== undefined,
  proxy: (snapshot) => snapshot.context.proxy !== undefined,
};

/**
 * Whether a wait for `readiness` ends at this snapshot: reached, or the file manager is in `error`.
 *
 * @param readiness - What the caller waits for.
 * @param snapshot - The file manager's snapshot.
 * @returns Whether the wait ends.
 * @public
 */
export const selectReadinessSettled = (readiness: FileManagerReadiness, snapshot: FileManagerSnapshot): boolean =>
  snapshot.matches('error') || readinessReached[readiness](snapshot);

/** What the watch reports. @public */
export type FileManagerWaitEvent = { readonly type: 'settled' } | { readonly type: 'gone' };

/** The wait's public alphabet. @public */
export const fileManagerWaitEventTypes = ['settled', 'gone'] as const satisfies ReadonlyArray<
  FileManagerWaitEvent['type']
>;

/** The wait's input. @public */
export type FileManagerWaitInput = Readonly<{ timeoutMilliseconds: number }>;

type FileManagerWaitContext = Readonly<{ timeoutMilliseconds: number; fault: string | undefined }>;

/** The driver default: nothing to watch, so only the bound ends the wait (MC-R8). */
const noWatch = createCallbackLogic<EventObject>(() => undefined);

/**
 * The wait: `waiting` until the watch reports, or until the bound on the clock.
 *
 * @public
 */
export const fileManagerWaitMachine = setup({
  schemas: {
    context: types<FileManagerWaitContext>(),
    events: { settled: z.object({}), gone: z.object({}) } satisfies Record<FileManagerWaitEvent['type'], z.ZodType>,
    input: types<FileManagerWaitInput>(),
  },
  actors: { watch: noWatch },
  delays: { readyBound: ({ context }) => context.timeoutMilliseconds },
}).createMachine({
  id: 'fileManagerWait',
  version: '1',
  /* A watch that throws ends the wait as if the file manager were gone: the caller is answered either way (D23). */
  onError: ({ context, event }) =>
    context.fault === undefined
      ? {
          target: '.gone',
          context: { fault: event.error instanceof Error ? event.error.message : 'file manager wait fault' },
        }
      : { target: '.gone' },
  context: ({ input }) => ({ timeoutMilliseconds: input.timeoutMilliseconds, fault: undefined }),
  initial: 'waiting',
  states: {
    waiting: {
      invoke: { id: 'watch', src: 'watch', onError: { target: 'gone' } },
      after: { readyBound: { target: 'timedOut' } },
      on: { settled: { target: 'settled' }, gone: { target: 'gone' } },
    },
    settled: { type: 'final' },
    timedOut: { type: 'final' },
    gone: { type: 'final' },
  },
});

/** How a wait ended. */
type WaitEnd = 'settled' | 'timedOut' | 'gone';

/**
 * Wait for the file manager to reach `readiness`, up to the bound, on the runtime's clock.
 *
 * @param fileManager - The file manager to wait for.
 * @param readiness - What to wait for.
 * @param options - The clock (the app runtime's; the default clock outside one), the bound, and the reason a
 *   timed-out wait throws.
 * @returns The snapshot that ended the wait: reached, or in `error` (the caller checks).
 * @throws {FileManagerNotReadyError} When the bound passes first.
 * @public
 */
export async function awaitFileManager(
  fileManager: FileManagerRef,
  readiness: FileManagerReadiness,
  options: Readonly<{
    clock?: ActorOptions<AnyActorLogic>['clock'];
    timeoutMilliseconds?: number;
    reason: 'proxy-timeout' | 'services-timeout';
  }>,
): Promise<FileManagerSnapshot> {
  const current = fileManager.getSnapshot();
  if (selectReadinessSettled(readiness, current)) {
    return current;
  }
  let reached: FileManagerSnapshot | undefined;
  const watch = createCallbackLogic<EventObject>(({ sendBack }) => {
    const observe = (snapshot: FileManagerSnapshot): void => {
      if (reached === undefined && selectReadinessSettled(readiness, snapshot)) {
        reached = snapshot;
        sendBack({ type: 'settled' });
      }
    };
    const subscription = fileManager.subscribe({
      next: observe,
      error: () => {
        sendBack({ type: 'gone' });
      },
      complete: () => {
        sendBack({ type: 'gone' });
      },
    });
    observe(fileManager.getSnapshot());
    return () => {
      subscription.unsubscribe();
    };
  });
  const wait = createActor(fileManagerWaitMachine.provide({ actors: { watch } }), {
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    input: { timeoutMilliseconds: options.timeoutMilliseconds ?? fileManagerReadyTimeout },
  });
  const ended = new Promise<WaitEnd>((resolve) => {
    wait.subscribe({
      complete: () => {
        resolve(wait.getSnapshot().value as WaitEnd);
      },
    });
  });
  wait.start();
  const end = await ended;
  switch (end) {
    case 'settled': {
      return reached ?? fileManager.getSnapshot();
    }
    case 'timedOut': {
      throw new FileManagerNotReadyError(options.reason);
    }
    case 'gone': {
      throw new Error('Actor terminated without satisfying predicate');
    }
  }
}
