/**
 * Kill memory: which models stopped the page while they were opening or rendering on this device (crash capture
 * blueprint, "We paused this model"). A small list in `localStorage` (`tau:kill-memory`, at most
 * {@link killMemoryLimit} entries, each kept {@link killMemoryLifetime}), because a retry from a link usually opens a
 * new tab, where the tab's `sessionStorage` marker is gone.
 *
 * It is functional state: an opaque model key (a short hash of the share slug, never the slug), a kill count, a time
 * and a build id. It is never sent, and the paused screen it drives says nothing about reporting.
 *
 * @module
 */

/** The storage key. */
export const killMemoryKey = 'tau:kill-memory';
/** Entries kept at most; the oldest goes first. */
export const killMemoryLimit = 10;
/** How long an entry counts. Milliseconds. */
export const killMemoryLifetime = 7 * 24 * 60 * 60 * 1000;
/** How long the page must live after the first frame before a paused model is cleared. Milliseconds. */
export const killMemoryClearAfter = 10_000;

/** One remembered model. */
export type KillMemoryEntry = Readonly<{
  /** The opaque model key ({@link modelKeyOf}). */
  model: string;
  /** Kills in a row while it was opening or rendering, on this build. */
  kills: number;
  /** Epoch milliseconds of the last kill recorded. */
  at: number;
  /** The build the last kill happened on, or `undefined` for a build without an id. */
  build: string | undefined;
}>;

/** Which copy the paused screen shows, or nothing. */
export type PausedState = 'paused' | 'repeat';

/** The key shape: 8 base-36 characters. */
const modelKeyPattern = /^[\da-z]{8}$/u;

/**
 * An opaque key for a model, so the memory never holds a share's reference. FNV-1a over the slug, in base 36.
 *
 * @param slug - The share slug or another stable model locator.
 * @returns The 8-character key.
 * @public
 */
export const modelKeyOf = (slug: string): string => {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < slug.length; index += 1) {
    // oxlint-disable-next-line no-bitwise -- FNV-1a.
    hash ^= slug.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  // oxlint-disable-next-line no-bitwise -- unsigned 32-bit.
  return (hash >>> 0).toString(36).padStart(8, '0').slice(-8);
};

/**
 * Whether a value is a model key.
 *
 * @param value - The value.
 * @returns Whether it has the key's shape.
 * @public
 */
export const isModelKey = (value: unknown): value is string => typeof value === 'string' && modelKeyPattern.test(value);

const isEntry = (value: unknown): value is KillMemoryEntry =>
  typeof value === 'object' &&
  value !== null &&
  'model' in value &&
  isModelKey(value.model) &&
  'kills' in value &&
  typeof value.kills === 'number' &&
  'at' in value &&
  typeof value.at === 'number';

const defaultStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** The memory over one storage, guarded at every access: blocked storage means no memory and no paused screen. */
export type KillMemory = Readonly<{
  /** A foreground kill while the model was opening or rendering. */
  record: (model: string, build: string | undefined, at: number) => void;
  /** Which copy to show before running this model on this build, or `undefined` to run it. */
  pausedState: (model: string, build: string | undefined) => PausedState | undefined;
  /** The model rendered and the page lived on: forget it. */
  clear: (model: string) => void;
  entries: () => readonly KillMemoryEntry[];
}>;

/**
 * Create the memory.
 *
 * @param options - The storage and the clock; both default to the page's.
 * @returns The memory.
 * @public
 */
export const createKillMemory = ({
  storage = defaultStorage,
  now = Date.now,
}: Readonly<{ storage?: () => Storage | undefined; now?: () => number }> = {}): KillMemory => {
  const read = (): KillMemoryEntry[] => {
    try {
      const raw = storage()?.getItem(killMemoryKey);
      const value: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
      const cutoff = now() - killMemoryLifetime;
      return Array.isArray(value)
        ? (value as unknown[]).filter((entry): entry is KillMemoryEntry => isEntry(entry) && entry.at >= cutoff)
        : [];
    } catch {
      return [];
    }
  };
  const write = (entries: readonly KillMemoryEntry[]): void => {
    try {
      const store = storage();
      if (entries.length === 0) {
        store?.removeItem(killMemoryKey);
        return;
      }
      store?.setItem(killMemoryKey, JSON.stringify(entries.slice(-killMemoryLimit)));
    } catch {
      // No storage, no memory; the model simply runs.
    }
  };
  return {
    record: (model, build, at) => {
      if (!isModelKey(model)) {
        return;
      }
      const entries = read();
      const previous = entries.find((entry) => entry.model === model);
      if (previous !== undefined && at <= previous.at) {
        return; // This kill is already remembered (a kill still pending from an earlier load).
      }
      const kills = previous !== undefined && previous.build === build ? previous.kills + 1 : 1;
      write([...entries.filter((entry) => entry.model !== model), { model, kills, at, build }]);
    },
    pausedState: (model, build) => {
      const entry = read().find((candidate) => candidate.model === model);
      // A new build gets one automatic try, since a fix may have shipped.
      if (entry === undefined || entry.build !== build) {
        return undefined;
      }
      return entry.kills >= 2 ? 'repeat' : 'paused';
    },
    clear: (model) => {
      const entries = read();
      if (entries.some((entry) => entry.model === model)) {
        write(entries.filter((entry) => entry.model !== model));
      }
    },
    entries: read,
  };
};

/** The page's memory. */
export const killMemory: KillMemory = createKillMemory();
