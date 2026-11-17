import { createContext, RouterContextProvider } from 'react-router';
import type { ModelCatalogCacheState, ModelCatalogStateReporter } from '#lib/model-catalog.server.js';

/**
 * `Server-Timing` on the document (LB0a). It attributes the server's part of a document's first byte: how old the
 * instance was, how the model catalog was found and how long it was waited on, and how long React took to the point
 * where the headers go out. Every entry is a fixed name with a duration or a fixed state name, so nothing that
 * identifies a visitor, a request or a deploy is ever written.
 *
 * Headers leave with the shell of a streamed document, so the time to React's all-ready and the document's byte
 * count, which are known only when the stream ends, cannot be sent in them. They are sent only where the headers wait
 * for all-ready (a bot or the SPA build), and the bytes never: a web `Response` has no trailers.
 */

/** The names this module writes, and nothing else. */
export type ServerTimingName = 'instance' | 'catalog' | 'shell' | 'all-ready';

/** The state names this module writes, and nothing else. */
export type ServerTimingState = 'cold' | 'warm' | ModelCatalogCacheState;

/** One `Server-Timing` entry. */
export type ServerTimingEntry = {
  readonly name: ServerTimingName;
  readonly state?: ServerTimingState;
  /** Milliseconds. */
  readonly duration?: number;
};

/** The React render option whose callback sends the headers. */
export type DocumentReadyOption = 'onShellReady' | 'onAllReady';

/** A clock in milliseconds; `performance.now()` counts from the process's start on Node. */
type Clock = () => number;

const defaultClock: Clock = () => performance.now();

/**
 * Format entries as one `Server-Timing` header value, e.g. `instance;desc=warm, shell;dur=12.3`.
 *
 * @param entries - The entries, in order.
 * @returns The header value.
 */
export const formatServerTiming = (entries: readonly ServerTimingEntry[]): string =>
  entries
    .map(({ name, state, duration }) =>
      [
        name,
        ...(state === undefined ? [] : [`desc=${state}`]),
        ...(duration === undefined ? [] : [`dur=${duration.toFixed(1)}`]),
      ].join(';'),
    )
    .join(', ');

/**
 * The cold-instance mark: the first document of the process is `cold`, with the process's age in milliseconds when its
 * render began, and every later one is `warm`. A data request before the first document does not count.
 *
 * @param now - The clock; tests inject one.
 * @returns A function that takes the mark for one document.
 */
export const createInstanceMark = (now: Clock = defaultClock): (() => ServerTimingEntry) => {
  let isCold = true;
  return () => {
    if (!isCold) {
      return { name: 'instance', state: 'warm' };
    }
    isCold = false;
    return { name: 'instance', state: 'cold', duration: now() };
  };
};

const takeInstanceMark = createInstanceMark();

/**
 * Entries the loaders recorded for one request, on its router context: the one object React Router hands the
 * middleware, the loaders and the entry's `handleRequest`. The root middleware starts it ({@link beginServerTiming}).
 */
// `false`, not `undefined`: React Router reads an undefined default as none and throws on an unset context.
const serverTimingContext = createContext<ServerTimingEntry[] | false>(false);

/**
 * The request's record. A context React Router did not build for middleware (the SPA builds' prerender, a test's plain
 * object) carries none, and its entries are dropped.
 */
const entriesOf = (context: unknown): ServerTimingEntry[] | undefined =>
  (context instanceof RouterContextProvider && context.get(serverTimingContext)) || undefined;

/**
 * Start the request's Server-Timing record; the root middleware calls it before the loaders run.
 *
 * @param context - The request's router context.
 */
export const beginServerTiming = (context: Readonly<RouterContextProvider>): void => {
  context.set(serverTimingContext, []);
};

const record = (loadContext: unknown, entry: ServerTimingEntry): void => {
  entriesOf(loadContext)?.push(entry);
};

/**
 * Read the model catalog and record how the cache was found and how long the read waited, for this request's document.
 *
 * @param loadContext - The loader's `context`.
 * @param read - The catalog read, which reports its cache state.
 * @param now - The clock; tests inject one.
 * @returns What the read resolves to.
 */
export const timeModelCatalogRead = async <T>(
  loadContext: unknown,
  read: (reportState: ModelCatalogStateReporter) => Promise<T>,
  now: Clock = defaultClock,
): Promise<T> => {
  const start = now();
  let state: ModelCatalogCacheState | undefined;
  try {
    return await read((reported) => {
      state = reported;
    });
  } finally {
    record(loadContext, { name: 'catalog', ...(state === undefined ? {} : { state }), duration: now() - start });
  }
};

/** The `Server-Timing` of one document render. */
export type DocumentTiming = {
  /** The value for a response with no render (`HEAD`): the instance mark and the loader's entries. */
  readonly withoutRender: () => string;
  /**
   * The value to send when React calls the option that sends the headers. `onShellReady` adds `shell` (what a browser
   * gets); `onAllReady` adds `all-ready` (a bot or the SPA build).
   */
  readonly atReady: (option: DocumentReadyOption) => string;
};

/**
 * Start timing a document at the top of the entry's `handleRequest`.
 *
 * @param loadContext - The entry's router context, where the loaders recorded their entries.
 * @param now - The clock; tests inject one.
 * @param instanceMark - The process's cold-instance mark; tests inject one.
 * @returns The document's timing.
 */
export const startDocumentTiming = (
  loadContext: unknown,
  now: Clock = defaultClock,
  instanceMark: () => ServerTimingEntry = takeInstanceMark,
): DocumentTiming => {
  const start = now();
  const before = [instanceMark(), ...(entriesOf(loadContext) ?? [])];
  return {
    withoutRender: () => formatServerTiming(before),
    atReady: (option) =>
      formatServerTiming([
        ...before,
        { name: option === 'onShellReady' ? 'shell' : 'all-ready', duration: now() - start },
      ]),
  };
};
