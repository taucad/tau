import { Topic } from '@taucad/events';
import { reportUiError } from '#lib/error-reporting.js';
import { recoverFromCaughtError } from '#lib/stale-build-recovery.js';
import { onceBootStage } from '#lib/boot-signals.js';

/**
 * The one owner of a Cloud chunk's `import()` (adaptive app deployment mode charter D6, I8, I15, BA10, BA25).
 *
 * One memoised import per entry, with a deadline. A rejection, or the deadline passing, clears the memo and is
 * reported once; the first failure is retried once automatically, later ones only when the person asks
 * (`retry`). A failure goes to the existing stale-build recovery, which alone may reload the page. Nothing renders
 * from an unsettled `lazy()`: a surface reads {@link CloudLoader.state} and renders its non-Cloud rendering until the
 * entry is `loaded`. Part of Core.
 */

/** How long a Cloud chunk may take to load before it counts as failed (I15). Milliseconds. @public */
export const cloudImportDeadlineMilliseconds = 15_000;

/** An entry's load, as a surface renders it. @public */
export type CloudLoadState<Module> =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'loaded'; module: Module }>
  /** `retryable`: no automatic retry is left; the surface offers Retry (I8). */
  | Readonly<{ status: 'failed'; retryable: boolean }>;

/** One entry's loader. @public */
export type CloudLoader<Module> = Readonly<{
  state: () => CloudLoadState<Module>;
  /** Start the load if it is idle; a no-op while loading, loaded or failed. */
  load: () => void;
  /** The person's Retry: load again after a failure. */
  retry: () => void;
  subscribe: (listener: () => void) => () => void;
}>;

/** What a loader is built with. @public */
export type CloudLoaderOptions<Module> = Readonly<{
  /** The entry's one dynamic import. */
  importer: () => Promise<Module>;
  deadlineMilliseconds?: number;
  /** Report a failure; once per loader. */
  report?: (error: unknown) => void;
  /** Hand a failure to the stale-build recovery. */
  recover?: (error: unknown) => void;
  setTimer?: (callback: () => void, milliseconds: number) => () => void;
  /**
   * When the first load may start: after `home-ready` and the next task, by default, so no Cloud chunk competes with
   * the shell (I1). Returns a cancel.
   */
  whenReady?: (start: () => void) => () => void;
}>;

const afterHomeReady = (start: () => void): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = onceBootStage('home-ready', () => {
    timer = setTimeout(start, 0);
  });
  return () => {
    cancel();
    clearTimeout(timer);
  };
};

const browserTimer = (callback: () => void, milliseconds: number): (() => void) => {
  const id = globalThis.setTimeout(callback, milliseconds);
  return () => {
    globalThis.clearTimeout(id);
  };
};

/** The error a load that outran its deadline reports. @public */
export class CloudImportTimeoutError extends Error {
  public constructor(milliseconds: number) {
    super(`A Tau Cloud chunk did not load within ${milliseconds} ms`);
    this.name = 'CloudImportTimeoutError';
  }
}

/**
 * Build one entry's loader.
 *
 * @param options - The import, the deadline and the failure hooks.
 * @returns The loader.
 * @public
 */
export const createCloudLoader = <Module>({
  importer,
  deadlineMilliseconds = cloudImportDeadlineMilliseconds,
  report = (error) => {
    void reportUiError(error);
  },
  recover = recoverFromCaughtError,
  setTimer = browserTimer,
  whenReady = afterHomeReady,
}: CloudLoaderOptions<Module>): CloudLoader<Module> => {
  let waiting = false;
  let state: CloudLoadState<Module> = { status: 'idle' };
  let attempt = 0;
  let failures = 0;
  let reported = false;
  const changed = new Topic<void>({ name: 'cloud-loader' });
  const set = (next: CloudLoadState<Module>): void => {
    state = next;
    changed.emit(undefined);
  };
  const start = (): void => {
    attempt += 1;
    const mine = attempt;
    set({ status: 'loading' });
    const fail = (error: unknown): void => {
      if (mine !== attempt) {
        return; // A later attempt owns the state.
      }
      attempt += 1; // Fence the import that may still settle.
      failures += 1;
      if (!reported) {
        reported = true;
        report(error);
      }
      recover(error);
      if (failures === 1) {
        start(); // I8: one automatic retry.
        return;
      }
      set({ status: 'failed', retryable: true });
    };
    const cancel = setTimer(() => {
      fail(new CloudImportTimeoutError(deadlineMilliseconds));
    }, deadlineMilliseconds);
    // async-iife: bootstrap -- the load reports into the loader's own state; nothing awaits it (I1).
    void (async (): Promise<void> => {
      try {
        const module = await importer();
        cancel();
        if (mine === attempt) {
          set({ status: 'loaded', module });
        }
      } catch (error) {
        cancel();
        fail(error);
      }
    })();
  };
  return {
    state: () => state,
    load: () => {
      if (state.status === 'idle' && !waiting) {
        waiting = true;
        whenReady(() => {
          waiting = false;
          if (state.status === 'idle') {
            start();
          }
        });
      }
    },
    retry: () => {
      if (state.status === 'failed') {
        start();
      }
    },
    subscribe: (listener) => changed.subscribe(listener),
  };
};
