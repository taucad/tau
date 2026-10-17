/**
 * A field signal for tabs the OS killed for memory (B-01, D-UI-25).
 *
 * iOS Safari ends a tab that exceeds its memory limit without running any
 * JavaScript: no `pagehide`, no `beforeunload`, no error. The only trace is the
 * next load. So the page keeps a small "alive" marker in `sessionStorage` (it
 * survives a reload of the same tab, and only that), marks it finished on
 * `pagehide`, and on the next load reports a suspected kill when the load is a
 * reload and the previous page never finished. A breadcrumb written before
 * heavy work (open, render, export) says what the page was doing.
 */

/** The analytics event a suspected memory kill is reported as. @public */
export const memoryKillEventName = 'memory.suspected_kill';

const markerKey = 'tau:alive';

/** What the previous page was doing when it ended without `pagehide`. @public */
export type SuspectedMemoryKill = Readonly<{
  deviceClass: string;
  liveProjectCount: number;
  chatCount: number;
  lastBreadcrumb: string | undefined;
  aliveForMilliseconds: number;
}>;

type AliveMarker = {
  finished: boolean;
  startedAt: number;
  updatedAt: number;
  deviceClass: string;
  liveProjectCount: number;
  chatCount: number;
  breadcrumb: string | undefined;
};

type MemoryKillSignalOptions = Readonly<{
  storage: Storage | undefined;
  /** `PerformanceNavigationTiming.type` of this load. */
  navigationType: string | undefined;
  deviceClass: string;
  now?: () => number;
}>;

/** The page's side of the signal. @public */
export type MemoryKillSignal = Readonly<{
  /** The previous page's suspected kill, at most once per load; also arms this page's marker. */
  takeSuspectedKill: () => SuspectedMemoryKill | undefined;
  /** Name the heavy work about to start. */
  breadcrumb: (name: string) => void;
  setCounts: (counts: Readonly<{ liveProjectCount: number; chatCount: number }>) => void;
  /** The page ended cleanly (`pagehide`). */
  finish: () => void;
  /** The page is alive again (`pageshow` from the back-forward cache). */
  arm: () => void;
}>;

const parseMarker = (raw: string | undefined): AliveMarker | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && 'finished' in value ? (value as AliveMarker) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Create the signal for one document.
 *
 * Every storage access is guarded: private windows, blocked site data and
 * thumbnail captures can throw, and the page must work without the signal.
 *
 * @param options - Storage, this load's navigation type and the device class.
 * @returns The page's handle on the marker.
 * @public
 */
export const createMemoryKillSignal = ({
  storage,
  navigationType,
  deviceClass,
  now = Date.now,
}: MemoryKillSignalOptions): MemoryKillSignal => {
  let marker: AliveMarker = {
    finished: false,
    startedAt: now(),
    updatedAt: now(),
    deviceClass,
    liveProjectCount: 0,
    chatCount: 0,
    breadcrumb: undefined,
  };
  let taken = false;
  const write = (): void => {
    try {
      storage?.setItem(markerKey, JSON.stringify(marker));
    } catch {
      // No storage, no signal; the page itself is unaffected.
    }
  };
  const update = (patch: Partial<AliveMarker>): void => {
    marker = { ...marker, ...patch, updatedAt: now() };
    write();
  };
  return {
    takeSuspectedKill: () => {
      if (taken) {
        return undefined;
      }
      taken = true;
      let previous: AliveMarker | undefined;
      try {
        previous = parseMarker(storage?.getItem(markerKey) ?? undefined);
      } catch {
        previous = undefined;
      }
      write();
      if (navigationType !== 'reload' || previous === undefined || previous.finished) {
        return undefined;
      }
      return {
        deviceClass: previous.deviceClass,
        liveProjectCount: previous.liveProjectCount,
        chatCount: previous.chatCount,
        lastBreadcrumb: previous.breadcrumb,
        aliveForMilliseconds: previous.updatedAt - previous.startedAt,
      };
    },
    breadcrumb: (name) => {
      update({ breadcrumb: name });
    },
    setCounts: ({ liveProjectCount, chatCount }) => {
      if (liveProjectCount !== marker.liveProjectCount || chatCount !== marker.chatCount) {
        update({ liveProjectCount, chatCount });
      }
    },
    finish: () => {
      update({ finished: true });
    },
    arm: () => {
      update({ finished: false });
    },
  };
};

const readNavigationType = (): string | undefined => {
  try {
    const [entry] = globalThis.performance.getEntriesByType('navigation');
    return entry !== undefined && 'type' in entry && typeof entry.type === 'string' ? entry.type : undefined;
  } catch {
    return undefined;
  }
};

const readSessionStorage = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

let documentSignal: MemoryKillSignal | undefined;

/**
 * The document's signal, created on first use in the browser.
 *
 * @param deviceClass - The device class to record, read once.
 * @returns The signal, or `undefined` during SSR.
 * @public
 */
export const getDocumentMemoryKillSignal = (deviceClass: () => string): MemoryKillSignal | undefined => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent during SSR
  if (globalThis.window === undefined) {
    return undefined;
  }
  documentSignal ??= createMemoryKillSignal({
    storage: readSessionStorage(),
    navigationType: readNavigationType(),
    deviceClass: deviceClass(),
  });
  return documentSignal;
};

/**
 * Name the heavy work about to start, so a kill during it says what it was.
 *
 * A no-op until the reporter has created the document's signal, and during SSR.
 *
 * @param name - A short stable name: `open`, `render`, `export`, `capture`.
 * @public
 */
export const recordMemoryBreadcrumb = (name: string): void => {
  documentSignal?.breadcrumb(name);
};
