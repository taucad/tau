/**
 * Lane B probe: the `globalThis.__laneB` seam the loader hook patches call into.
 * Import this module BEFORE any runtime/kernel module.
 */
export type Counter = { calls: number; ms: number; bytes: number };
export type ProbeState = {
  semanticDisabled: boolean;
  /**
   * Fault injection (W0 red-first): when set, every session lookup reports a hit
   * carrying these BRep bytes, so the kernel restores a *wrong* shape and skips
   * the native solve entirely. The honest arms leave it undefined.
   */
  poisonBytes: Uint8Array<ArrayBuffer> | undefined;
  poisonedLookups: number;
  /** Keep the first BRep the session records, so a second process can replay it as a wrong cache. */
  captureRecordedBrep: boolean;
  capturedBrep: Uint8Array<ArrayBuffer> | undefined;
  counters: Record<string, Counter>;
  lookups: { hit: number; miss: number; session: number; cache: number };
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

/** Stable fake digest for poisoned hits; never collides with a real action digest. */
const poisonDigest = `sha256:${'0'.repeat(64)}`;

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

const stubSession = {
  prepared: () => [],
  lookup: () => ({ status: 'miss' as const }),
  record: () => ({ status: 'rejected' as const, reason: 'session-byte-limit' as const }),
  flush: async () => {},
};

const openSession = async (open: () => Promise<any>) => {
  if (state.semanticDisabled) {
    note('session.open.stub', 0);
    return stubSession;
  }
  const session = await time('session.open', open);
  const preparedCount = session.prepared().length;
  note('session.prepared.entries', 0, preparedCount);
  return new Proxy(session, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property === 'lookup')
        return (input: any) => {
          const start = performance.now();
          if (state.poisonBytes) {
            state.poisonedLookups += 1;
            state.lookups.hit += 1;
            state.lookups.cache += 1;
            note('session.lookup', performance.now() - start);
            return { status: 'hit', source: 'cache', bytes: state.poisonBytes, actionDigest: poisonDigest };
          }
          const result = value.call(target, input);
          note('session.lookup', performance.now() - start);
          if (result.status === 'hit') {
            state.lookups.hit += 1;
            state.lookups[result.source as 'session' | 'cache'] += 1;
          } else state.lookups.miss += 1;
          return result;
        };
      if (property === 'record')
        return (input: any) => {
          const start = performance.now();
          const result = value.call(target, input);
          note('session.record', performance.now() - start, input.bytes?.byteLength ?? 0);
          if (state.captureRecordedBrep && !state.capturedBrep && input.bytes) state.capturedBrep = input.bytes;
          if (result.status === 'staged') {
            state.records.staged += 1;
            state.records.bytes += input.bytes?.byteLength ?? 0;
          } else state.records.rejected += 1;
          return result;
        };
      if (property === 'flush') return () => time('session.flush', () => value.call(target));
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
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
  openSession,
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
