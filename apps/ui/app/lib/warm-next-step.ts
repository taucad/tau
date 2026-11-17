/**
 * Warm the next step (progressive loading PL8, LB9): once a page whose route class names a class it `warms` is idle,
 * prefetch that class's interactive tier, so the click that most likely follows downloads no module. From Home that
 * is the project route: a project row and the composer's first send both open it, and its modules are the same for
 * every project.
 *
 * It waits for the window's `load` and then for an idle period, and it does nothing under Save-Data. The fetching
 * code is loaded only then (`warm-route-class.ts`), so this file is all the warming adds to the interactive tier.
 * Nothing here can name a kernel, wasm or worker asset: it warms only what the build's warm manifest lists, which the
 * critical budget check holds to the class's interactive tier.
 */

/** Milliseconds. How long after `load` a browser without `requestIdleCallback` (Safari) waits before warming. */
export const idleFallbackDelay = 1500;

/** The part of a window the scheduler reads. */
export type IdleHost = Readonly<{
  document: Readonly<{ readyState: DocumentReadyState }>;
  /** Read for `connection.saveData`, which the DOM library does not declare. */
  navigator: unknown;
  addEventListener: (type: 'load', listener: () => void, options: AddEventListenerOptions) => void;
  removeEventListener: (type: 'load', listener: () => void) => void;
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}>;

/**
 * Whether the visitor asked for reduced data use (`Save-Data`).
 *
 * @param navigator - The window's navigator.
 * @returns `true` when `navigator.connection.saveData` is set.
 */
export const prefersReducedData = (navigator: unknown): boolean => {
  if (typeof navigator !== 'object' || navigator === null) {
    return false;
  }
  const connection: unknown = Reflect.get(navigator, 'connection');
  return typeof connection === 'object' && connection !== null && Reflect.get(connection, 'saveData') === true;
};

/**
 * Run a callback once the window has loaded and the main thread is next idle; with no `requestIdleCallback`,
 * {@link idleFallbackDelay} after `load`. There is no deadline: a page that is never idle never runs it.
 *
 * @param start - The callback.
 * @param host - The window.
 * @returns Cancels a callback that has not run yet.
 */
export const whenIdleAfterLoad = (start: () => void, host: IdleHost): (() => void) => {
  let cancelPending = (): void => undefined;
  const afterLoad = (): void => {
    if (host.requestIdleCallback !== undefined) {
      const handle = host.requestIdleCallback(start);
      cancelPending = () => host.cancelIdleCallback?.(handle);
      return;
    }
    const handle = host.setTimeout(start, idleFallbackDelay);
    cancelPending = () => {
      host.clearTimeout(handle);
    };
  };
  if (host.document.readyState === 'complete') {
    afterLoad();
  } else {
    host.addEventListener('load', afterLoad, { once: true });
    cancelPending = () => {
      host.removeEventListener('load', afterLoad);
    };
  }
  return () => {
    cancelPending();
  };
};

/** A route class as far as warming reads it. */
export type WarmingClass = Readonly<{ id: string; warms?: string }>;

/** Prefetch a class's interactive tier, given the class the page already holds. */
export type WarmClass = (target: string, loaded: string) => Promise<unknown>;

/** Warm, and swallow a failure: a chunk a deploy stopped serving warms nothing, and the click loads as before. */
const warmQuietly = async (warm: WarmClass, target: string, loaded: string): Promise<void> => {
  try {
    await warm(target, loaded);
  } catch {
    // Warming is optional.
  }
};

const warmFromManifest: WarmClass = async (target, loaded) => {
  const { warmRouteClass } = await import('#lib/warm-route-class.js');
  return warmRouteClass({ target, loaded });
};

/**
 * Schedule this document's warm-up: when it is idle, read the page's route class and, if that class `warms` another,
 * prefetch the other's interactive tier. Call it once per document, after hydration has started.
 *
 * @param options - The page's route class at the time of reading, the warming step (the warm manifest by default) and
 *   the window (the global one by default).
 * @returns Cancels a warm-up that has not started; `undefined` when Save-Data skips it outright.
 */
export function scheduleNextStepWarm({
  readRouteClass,
  warm = warmFromManifest,
  host = globalThis,
}: Readonly<{
  readRouteClass: () => WarmingClass | undefined;
  warm?: WarmClass;
  host?: IdleHost;
}>): (() => void) | undefined {
  if (prefersReducedData(host.navigator)) {
    return undefined;
  }
  return whenIdleAfterLoad(() => {
    const routeClass = readRouteClass();
    // Read again: Save-Data can be turned on while the page loads.
    if (routeClass?.warms === undefined || prefersReducedData(host.navigator)) {
      return;
    }
    // async-iife: bootstrap -- The idle callback owns this one optional warm-up.
    void warmQuietly(warm, routeClass.warms, routeClass.id);
  }, host);
}
