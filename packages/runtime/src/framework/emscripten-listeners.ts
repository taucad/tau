/**
 * Emscripten process-listener guard.
 *
 * Emscripten module factories install `uncaughtException`/`unhandledRejection`
 * listeners on the Node process and never remove them. The guard snapshots the
 * listener list, runs the factory, and removes what the factory added.
 *
 * It guards a global resource, so it must have exactly one owner: a per-package
 * copy is a per-package queue, and two packages initializing at once — routine
 * once a host loads several WASM plugins — strip each other's handlers.
 * `@taucad/runtime` is a required peer of every plugin package, so this module
 * is the single instance the queue needs. Kernel authors reach it through
 * `@taucad/runtime/kernel`.
 *
 * Browser-safe: every `process` access sits behind a `typeof` guard.
 *
 * @module
 */

type EmscriptenProcessEvent = 'uncaughtException' | 'unhandledRejection';

const emscriptenProcessEvents = ['uncaughtException', 'unhandledRejection'] as const;

let emscriptenFactoryQueue = Promise.resolve();

const canManageProcessListeners = (): boolean =>
  typeof process === 'object' &&
  typeof process.listeners === 'function' &&
  typeof process.off === 'function' &&
  typeof process.getMaxListeners === 'function' &&
  typeof process.setMaxListeners === 'function';

const getProcessListeners = (event: EmscriptenProcessEvent): readonly unknown[] =>
  event === 'uncaughtException' ? process.listeners('uncaughtException') : process.listeners('unhandledRejection');

const getProcessListenerCount = (event: EmscriptenProcessEvent): number =>
  event === 'uncaughtException'
    ? process.listenerCount('uncaughtException')
    : process.listenerCount('unhandledRejection');

const removeProcessListener = (event: EmscriptenProcessEvent, listener: unknown): void => {
  if (event === 'uncaughtException') {
    process.off('uncaughtException', listener as (error: Error) => void);
    return;
  }

  process.off('unhandledRejection', listener as (reason: unknown, promise: Promise<unknown>) => void);
};

/**
 * Runs an Emscripten module factory without keeping its Node process listeners.
 *
 * @param load - Emscripten factory call.
 * @returns The factory result after temporary listener cleanup.
 * @public
 */
export async function withoutEmscriptenProcessListeners<T>(load: () => Promise<T>): Promise<T> {
  if (!canManageProcessListeners()) {
    return load();
  }

  // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
  // ponytail: global init lock; replace with per-library scopes if parallel WASM init becomes measurable.
  const previousFactory = emscriptenFactoryQueue;
  let releaseFactory!: () => void;
  emscriptenFactoryQueue = new Promise<void>((resolve) => {
    releaseFactory = resolve;
  });

  await previousFactory;

  const snapshots = new Map<EmscriptenProcessEvent, Set<unknown>>();
  for (const event of emscriptenProcessEvents) {
    snapshots.set(event, new Set(getProcessListeners(event)));
  }
  const previousMaxListeners = process.getMaxListeners();
  const requiredMaxListeners = Math.max(
    previousMaxListeners,
    ...emscriptenProcessEvents.map((event) => getProcessListenerCount(event) + 1),
  );
  if (previousMaxListeners !== 0 && requiredMaxListeners > previousMaxListeners) {
    process.setMaxListeners(requiredMaxListeners);
  }

  try {
    return await load();
  } finally {
    for (const event of emscriptenProcessEvents) {
      const before = snapshots.get(event)!;
      for (const listener of getProcessListeners(event)) {
        if (!before.has(listener)) {
          removeProcessListener(event, listener);
        }
      }
    }
    if (process.getMaxListeners() === requiredMaxListeners) {
      process.setMaxListeners(previousMaxListeners);
    }
    releaseFactory();
  }
}
