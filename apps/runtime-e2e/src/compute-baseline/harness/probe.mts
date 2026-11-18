/**
 * Lane B probe: the `globalThis.__laneB` seam the loader hook patches call into.
 * Import this module BEFORE any runtime/kernel module.
 *
 * Replicad is measured at the live tier's own seams: the operation cache it installs through the library
 * facade (`liveTierLibrary`), the counters it reports on the `replicad.run-main` span, and the kernel's
 * `computeReuse` option for the off arm.
 */
export type Counter = { calls: number; ms: number; bytes: number };
export type ProbeState = {
  semanticDisabled: boolean;
  /**
   * Fault injection (W0 red-first): when set, the live tier's operation cache answers
   * every poisonable operation with a shape restored from these BRep bytes, so the
   * kernel builds a *wrong* shape and skips the native solve entirely. The honest
   * arms leave it undefined.
   */
  poisonBytes: Uint8Array<ArrayBuffer> | undefined;
  poisonedLookups: number;
  /** Keep the first shape an operation returns, as BRep, so a second process can replay it as a wrong cache. */
  captureRecordedBrep: boolean;
  capturedBrep: Uint8Array<ArrayBuffer> | undefined;
  counters: Record<string, Counter>;
  /**
   * The live tier's lookups in this step, from the `replicad.run-main` span: every hit is resident in this
   * process (`session`); nothing is restored from a store (`cache` stays 0, since snapshots are refused).
   */
  lookups: { hit: number; miss: number; session: number; cache: number };
  /** Operation results the live tier admitted (native clones: no bytes, nothing rejected). */
  records: { staged: number; rejected: number; bytes: number };
};

const state: ProbeState = {
  semanticDisabled: false,
  poisonBytes: undefined,
  poisonedLookups: 0,
  captureRecordedBrep: false,
  capturedBrep: undefined,
  counters: {},
  lookups: { hit: 0, miss: 0, session: 0, cache: 0 },
  records: { staged: 0, rejected: 0, bytes: 0 },
};

const note = (key: string, ms: number, bytes = 0): void => {
  const counter = (state.counters[key] ??= { calls: 0, ms: 0, bytes: 0 });
  counter.calls += 1;
  counter.ms += ms;
  counter.bytes += bytes;
};

const time = <T,>(key: string, operation: () => T, bytes?: number): T => {
  const start = performance.now();
  const finish = (value: unknown) => {
    const size =
      bytes ?? (value instanceof Uint8Array ? value.byteLength : typeof value === 'string' ? value.length : 0);
    note(key, performance.now() - start, size);
  };
  try {
    const result = operation();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).then(
        (value) => {
          finish(value);
          return value;
        },
        (error) => {
          finish(undefined);
          throw error;
        },
      ) as T;
    }
    finish(result);
    return result;
  } catch (error) {
    finish(undefined);
    throw error;
  }
};

const wrapFilesystem = <T extends object>(filesystem: T): T =>
  new Proxy(filesystem, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      return (...args: unknown[]) => {
        const start = performance.now();
        const bytes =
          property === 'writeFile'
            ? args[1] instanceof Uint8Array
              ? args[1].byteLength
              : typeof args[1] === 'string'
                ? args[1].length
                : 0
            : 0;
        const finish = () => note(`fs.${property}`, performance.now() - start, bytes);
        try {
          const result = value.apply(target, args);
          if (result && typeof result.then === 'function')
            return result.then(
              (v: unknown) => {
                finish();
                return v;
              },
              (e: unknown) => {
                finish();
                throw e;
              },
            );
          finish();
          return result;
        } catch (error) {
          finish();
          throw error;
        }
      };
    },
  });

type OperationCacheLike = {
  operation(request: any): unknown;
  step(request: any): unknown;
  elements(...arguments_: any[]): void;
};
type LiveTierLibrary = {
  setOperationCache(cache: OperationCacheLike | undefined): OperationCacheLike | undefined;
  bypassOperationCache<T>(operation: () => T): T;
  deserializeShape(text: string): unknown;
};

const utf8 = new TextEncoder();
const isShape = (value: unknown): value is { serialize(): string } =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as { serialize?: unknown }).serialize === 'function' &&
  typeof (value as { clone?: unknown }).clone === 'function';
/** The poison arm answers operations that keep their receiver or consume it and return a value, never a builder. */
const poisonable = (request: { effect?: string; returnsBuilder?: boolean }): boolean =>
  (request.effect === 'pure' || request.effect === 'consumes') && request.returnsBuilder !== true;
/** The request with its `compute` timed as `native.solve`: every native computation the cache lets through. */
const timedCompute = <R extends { compute(): unknown }>(request: R): R =>
  Object.create(request, {
    compute: { value: () => time('native.solve', () => request.compute()) },
  }) as R;

/**
 * Wrap the operation cache the live tier installs (`installOperationTier` calls `setOperationCache` on the
 * kernel's library facade). Every routed operation is counted (`tier.operation`) and every computation the
 * tier lets through is timed (`native.solve`). The tier's own hit, miss and store counts come from the
 * `replicad.run-main` span. The poison arm answers every poisonable operation with a deliberately wrong shape
 * restored from captured BRep bytes, before the tier sees it, so nothing is computed natively.
 */
const instrumentCache = (cache: OperationCacheLike, library: LiveTierLibrary): OperationCacheLike => {
  const poisonText = state.poisonBytes ? new TextDecoder().decode(state.poisonBytes) : undefined;
  return {
    operation(request) {
      return time('tier.operation', () => {
        if (poisonText !== undefined && poisonable(request)) {
          state.poisonedLookups += 1;
          request.consume?.();
          return library.bypassOperationCache(() => library.deserializeShape(poisonText));
        }
        const result = cache.operation(timedCompute(request));
        if (state.captureRecordedBrep && !state.capturedBrep && isShape(result)) {
          state.capturedBrep = utf8.encode(
            library.bypassOperationCache(() => result.serialize()),
          ) as Uint8Array<ArrayBuffer>;
        }
        return result;
      });
    },
    step(request) {
      return cache.step(timedCompute(request));
    },
    elements(...arguments_) {
      cache.elements(...arguments_);
    },
  };
};

/**
 * The kernel's library facade, with `setOperationCache` instrumented. The live tier installs its cache through
 * this facade for each build and restores the previous one (none) when the build ends; with compute reuse off
 * the kernel builds no tier and never calls it.
 */
const liveTierLibrary = <T extends object>(facade: T): T => {
  const library = facade as unknown as LiveTierLibrary;
  const install = library.setOperationCache;
  if (typeof install !== 'function') return facade;
  library.setOperationCache = (cache) => install(cache === undefined ? undefined : instrumentCache(cache, library));
  return facade;
};

const build123dCompute = (input: { compute: unknown }) => (state.semanticDisabled ? {} : input);

/** Optional identity tracer installed by run-arm (`--trace identity`); identity function otherwise. */
let libraryWrapper: <T extends object>(library: T) => T = (library) => library;
const wrapLibrary = <T extends object>(library: T): T => libraryWrapper(library);
let resultUnwrapper: (value: unknown) => unknown = (value) => value;
const setLibraryWrapper = (
  wrapper: <T extends object>(library: T) => T,
  unwrapper?: (value: unknown) => unknown,
): void => {
  libraryWrapper = wrapper;
  if (unwrapper) resultUnwrapper = unwrapper;
};
let resultObserver: (value: unknown) => void = () => {};
const setResultObserver = (observer: (value: unknown) => void): void => {
  resultObserver = observer;
};
const unwrapResult = (value: unknown): unknown => {
  const raw = resultUnwrapper(value);
  resultObserver(raw);
  return raw;
};

export const probe = {
  state,
  note,
  time,
  wrapFilesystem,
  liveTierLibrary,
  build123dCompute,
  wrapLibrary,
  setLibraryWrapper,
  setResultObserver,
  unwrapResult,
  get semanticDisabled() {
    return state.semanticDisabled;
  },
  set semanticDisabled(value: boolean) {
    state.semanticDisabled = value;
  },
  get poisonBytes() {
    return state.poisonBytes;
  },
  set poisonBytes(value: Uint8Array<ArrayBuffer> | undefined) {
    state.poisonBytes = value;
  },
  get captureRecordedBrep() {
    return state.captureRecordedBrep;
  },
  set captureRecordedBrep(value: boolean) {
    state.captureRecordedBrep = value;
  },
  get capturedBrep() {
    return state.capturedBrep;
  },
  /** Record the live tier's counters of one build, as the kernel reports them on `replicad.run-main`. */
  noteTier(detail: Record<string, unknown> | undefined): void {
    const count = (key: string): number => (typeof detail?.[key] === 'number' ? (detail[key] as number) : 0);
    state.lookups.hit += count('tierHits');
    state.lookups.session += count('tierHits');
    state.lookups.miss += count('tierMisses');
    state.records.staged += count('tierStored');
  },
  reset(): void {
    state.poisonedLookups = 0;
    state.counters = {};
    state.lookups = { hit: 0, miss: 0, session: 0, cache: 0 };
    state.records = { staged: 0, rejected: 0, bytes: 0 };
  },
  snapshot() {
    return {
      counters: structuredClone(state.counters),
      lookups: { ...state.lookups },
      records: { ...state.records },
      poisonedLookups: state.poisonedLookups,
    };
  },
};

(globalThis as any).__laneB = probe;
