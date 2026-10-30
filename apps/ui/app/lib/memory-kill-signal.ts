/**
 * A field signal for tabs the OS killed for memory (B-01, D-UI-25; browser observability SB3, G3).
 *
 * iOS Safari ends a tab that exceeds its memory limit without running any
 * JavaScript: no `pagehide`, no `beforeunload`, no error. The only trace is the
 * next load. So the page keeps a small marker in `sessionStorage` (it survives a
 * reload of the same tab, and only that), marks it finished on `pagehide`, and on
 * the next load reports a kill when that marker is unfinished and the load looks
 * like the same page coming back.
 *
 * The marker carries what the report needs and the dead page could not send: the
 * route and scrubbed path, the build, whether the page was visible, the live
 * counts, the last memory sample (SB2) and a ring of the last
 * {@link killTrailLimit} activity names with their timestamps. It is capped at
 * {@link markerByteLimit} and every write is one synchronous `setItem`.
 *
 * A kill detected on this load does not leave the marker until its report is
 * handed over: it waits in `pending` (at most {@link pendingKillLimit}), so a page
 * that dies again while reporting still reports the first kill on the load after
 * that (G17). Each report carries how many kills happened in a row.
 */

import { recordActivityBreadcrumb } from '#lib/activity-breadcrumbs.js';
import { readBuildId } from '#lib/build-identity.js';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';
import { readLastMemorySample, readHighWaterWasmBytes, takeMemorySample } from '#lib/memory-sampler.js';
import { readSessionStorage } from '#lib/session-storage.js';
import type { MemorySample } from '#lib/memory-sampler.js';

/** The marker shape this build writes and reads. An older shape is left alone rather than guessed at. */
export const killMarkerVersion = 2;

/** The marker's budget, kept well inside every browser's `sessionStorage` quota. */
export const markerByteLimit = 4096;

/** Activity names kept in the marker's trail (principle 3). */
export const killTrailLimit = 20;

/** Trail entries a kill keeps once it is only waiting to be reported, so a loop still fits the budget. */
export const pendingTrailLimit = 5;

/** How long after its last write a marker still counts as the same page coming back. */
export const killDetectionWindowMilliseconds = 90_000;

/** How often a visible page refreshes `updatedAt`, so the detection window measures the kill, not the idle. */
export const killHeartbeatMilliseconds = 30_000;

/** Kills that can wait for delivery at once; the oldest is dropped beyond this (G17). */
export const pendingKillLimit = 3;

/** How the page stood when its marker was last written. @public */
export type KillClassification = 'foreground' | 'background' | 'unknown';

/** One activity name with the time it was recorded. @public */
export type KillTrailEntry = Readonly<{ at: number; name: string }>;

/** A kill the next load detected: what the dead page was doing and holding. @public */
export type DetectedMemoryKill = Readonly<{
  /** Identifies this kill while it waits for delivery; never reported. */
  id: string;
  classification: KillClassification;
  route: string | undefined;
  path: string | undefined;
  buildId: string | undefined;
  deviceClass: string;
  liveProjectCount: number;
  chatCount: number;
  lastActivity: string | undefined;
  aliveForMilliseconds: number;
  /** How long the page had been hidden when it died, for a `background` kill. */
  hiddenForMilliseconds?: number;
  /** Kills in a row on this tab without a clean finish, this one included. */
  consecutiveKills: number;
  sample?: MemorySample;
  highWaterWasmBytes?: number;
  trail: readonly KillTrailEntry[];
}>;

type AliveMarker = {
  version: number;
  finished: boolean;
  startedAt: number;
  updatedAt: number;
  route: string | undefined;
  path: string | undefined;
  buildId: string | undefined;
  visible: boolean;
  hiddenAt: number | undefined;
  deviceClass: string;
  liveProjectCount: number;
  chatCount: number;
  sample: MemorySample | undefined;
  highWaterWasmBytes: number | undefined;
  trail: readonly KillTrailEntry[];
  /** Kills in a row on this tab, so far: 0 on a page that loaded after a clean finish. */
  consecutiveKills: number;
  /** Kills detected but not yet handed to the error tracker. */
  pending: readonly DetectedMemoryKill[];
};

const markerKey = 'tau:alive';

type MemoryKillSignalOptions = Readonly<{
  storage: Storage | undefined;
  /** `PerformanceNavigationTiming.type` of this load. */
  navigationType: string | undefined;
  deviceClass: string;
  now?: () => number;
  /** The deepest route id, read at each write; absent before hydration. */
  readRoute?: () => string | undefined;
  /** This page's scrubbed path, read at each write. */
  readPath?: () => string | undefined;
  /** This build's id, or `undefined` for a bundle without one. */
  readBuild?: () => string | undefined;
  /** Whether the page is visible now. */
  readVisible?: () => boolean;
}>;

/** The page's side of the signal. @public */
export type MemoryKillSignal = Readonly<{
  /**
   * The kills this load has to report — the previous page's, and any the page before it never
   * delivered — at most once per load. Also arms this page's marker with them still pending.
   */
  takeDetectedKills: () => readonly DetectedMemoryKill[];
  /** A kill's report reached the error tracker: it leaves the marker and is never reported again. */
  settleKill: (id: string) => void;
  /** Name the heavy work about to start. */
  breadcrumb: (name: string) => void;
  setCounts: (counts: Readonly<{ liveProjectCount: number; chatCount: number }>) => void;
  /** The counts last set, for the error tracker's `tau.session` context. */
  counts: () => Readonly<{ liveProjectCount: number; chatCount: number }>;
  /** The page became visible or hidden (`visibilitychange`). */
  observeVisibility: () => void;
  /** Keep `updatedAt` fresh while the page is visible; a no-op on a hidden page. */
  heartbeat: () => void;
  /** The page ended cleanly (`pagehide`). */
  finish: () => void;
  /** The page is alive again (`pageshow` from the back-forward cache). */
  arm: () => void;
}>;

/** A path with no query, no fragment and no invitation token (principle 6). */
const scrubPath = (path: string): string => redactInvitationTokens(path.split(/[?#]/u, 1)[0] ?? '');

const readDocumentPath = (): string | undefined => {
  try {
    return scrubPath(globalThis.location.pathname);
  } catch {
    return undefined;
  }
};

const readDocumentBuild = (): string | undefined => {
  const id = readBuildId();
  return id === 0 ? undefined : String(id);
};

const readDocumentVisible = (): boolean => {
  try {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in a worker and during SSR.
    return globalThis.document?.visibilityState !== 'hidden';
  } catch {
    return true;
  }
};

/**
 * A stored marker of this build's shape, or nothing. An older or unparseable marker is ignored
 * rather than read field by field: a wrong kill report is worse than a missed one.
 */
const parseMarker = (raw: string | undefined): AliveMarker | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('version' in value)) {
      return undefined;
    }
    const marker = value as AliveMarker;
    return marker.version === killMarkerVersion && typeof marker.finished === 'boolean' ? marker : undefined;
  } catch {
    return undefined;
  }
};

const byteLength = (value: string): number => {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
};

/** A pending kill keeps only the tail of its trail: it has already been classified. */
const trimPending = (kill: DetectedMemoryKill): DetectedMemoryKill => ({
  ...kill,
  trail: kill.trail.slice(-pendingTrailLimit),
});

/**
 * The marker as it will be stored, reduced until it fits {@link markerByteLimit}: the page's own
 * trail first (it is the part that grows), then the memory sample, then the oldest kills still
 * waiting — one report lost is better than every one lost to a failed write.
 *
 * @param marker - The marker to serialize.
 * @returns The JSON to store.
 */
const serializeMarker = (marker: AliveMarker): string => {
  let reduced = marker;
  let serialized = JSON.stringify(reduced);
  const reductions: ReadonlyArray<(from: AliveMarker) => AliveMarker | undefined> = [
    (from) => (from.trail.length > pendingTrailLimit ? { ...from, trail: from.trail.slice(1) } : undefined),
    (from) => (from.sample === undefined ? undefined : { ...from, sample: undefined }),
    (from) => (from.pending.length > 1 ? { ...from, pending: from.pending.slice(1) } : undefined),
    (from) => (from.trail.length > 0 ? { ...from, trail: from.trail.slice(1) } : undefined),
  ];
  for (const reduce of reductions) {
    while (byteLength(serialized) > markerByteLimit) {
      const next = reduce(reduced);
      if (next === undefined) {
        break;
      }
      reduced = next;
      serialized = JSON.stringify(reduced);
    }
  }
  return serialized;
};

/**
 * Create the signal for one document.
 *
 * Every storage access is guarded: private windows, blocked site data and
 * thumbnail captures can throw, and the page must work without the signal.
 *
 * @param options - Storage, this load's navigation type, the device class and the page's readers.
 * @returns The page's handle on the marker.
 * @public
 */
export const createMemoryKillSignal = ({
  storage,
  navigationType,
  deviceClass,
  now = Date.now,
  readRoute = () => undefined,
  readPath = readDocumentPath,
  readBuild = readDocumentBuild,
  readVisible = readDocumentVisible,
}: MemoryKillSignalOptions): MemoryKillSignal => {
  const visibleAtLoad = readVisible();
  let marker: AliveMarker = {
    version: killMarkerVersion,
    finished: false,
    startedAt: now(),
    updatedAt: now(),
    route: readRoute(),
    path: readPath(),
    buildId: readBuild(),
    visible: visibleAtLoad,
    hiddenAt: visibleAtLoad ? undefined : now(),
    deviceClass,
    liveProjectCount: 0,
    chatCount: 0,
    sample: undefined,
    highWaterWasmBytes: undefined,
    trail: [],
    consecutiveKills: 0,
    pending: [],
  };
  let taken = false;
  const write = (): void => {
    try {
      storage?.setItem(markerKey, serializeMarker(marker));
    } catch {
      // No storage, no signal; the page itself is unaffected.
    }
  };
  /** Refresh what the page can always answer, so every write carries the current route and memory. */
  const update = (patch: Partial<AliveMarker>): void => {
    marker = {
      ...marker,
      route: readRoute() ?? marker.route,
      path: readPath() ?? marker.path,
      sample: readLastMemorySample() ?? marker.sample,
      highWaterWasmBytes: readHighWaterWasmBytes() ?? marker.highWaterWasmBytes,
      ...patch,
      updatedAt: now(),
    };
    write();
  };
  /**
   * Whether this load is the previous page coming back: a reload, whichever way the browser
   * labelled it, or a fresh navigation to the same path soon after the marker was last written —
   * iOS has been seen to report both, and the A3 device check settles which.
   */
  const isSamePageReturning = (previous: AliveMarker): boolean => {
    if (navigationType === 'reload') {
      return true;
    }
    return (
      navigationType === 'navigate' &&
      previous.path !== undefined &&
      previous.path === marker.path &&
      now() - previous.updatedAt < killDetectionWindowMilliseconds
    );
  };
  const classify = (previous: AliveMarker): KillClassification => {
    if (previous.visible) {
      return 'foreground';
    }
    return previous.hiddenAt === undefined ? 'unknown' : 'background';
  };
  return {
    takeDetectedKills: () => {
      if (taken) {
        return [];
      }
      taken = true;
      let previous: AliveMarker | undefined;
      try {
        previous = parseMarker(storage?.getItem(markerKey) ?? undefined);
      } catch {
        previous = undefined;
      }
      if (previous === undefined) {
        write();
        return [];
      }
      const undelivered = previous.pending.map((kill) => trimPending(kill));
      const killed = !previous.finished && isSamePageReturning(previous);
      const consecutiveKills = killed ? previous.consecutiveKills + 1 : 0;
      const classification = killed ? classify(previous) : undefined;
      const kill: DetectedMemoryKill | undefined =
        classification === undefined
          ? undefined
          : {
              id: `${String(previous.startedAt)}-${String(previous.updatedAt)}`,
              classification,
              route: previous.route,
              path: previous.path,
              buildId: previous.buildId,
              deviceClass: previous.deviceClass,
              liveProjectCount: previous.liveProjectCount,
              chatCount: previous.chatCount,
              lastActivity: previous.trail.at(-1)?.name,
              aliveForMilliseconds: previous.updatedAt - previous.startedAt,
              ...(classification === 'background' && previous.hiddenAt !== undefined
                ? { hiddenForMilliseconds: previous.updatedAt - previous.hiddenAt }
                : {}),
              consecutiveKills,
              ...(previous.sample === undefined ? {} : { sample: previous.sample }),
              ...(previous.highWaterWasmBytes === undefined ? {} : { highWaterWasmBytes: previous.highWaterWasmBytes }),
              trail: previous.trail,
            };
      const detected = [...undelivered, ...(kill === undefined ? [] : [kill])];
      marker = {
        ...marker,
        consecutiveKills,
        pending: detected.slice(-pendingKillLimit).map((kill) => trimPending(kill)),
      };
      write();
      return detected;
    },
    settleKill: (id) => {
      if (!marker.pending.some((kill) => kill.id === id)) {
        return;
      }
      update({ pending: marker.pending.filter((kill) => kill.id !== id) });
    },
    breadcrumb: (name) => {
      update({ trail: [...marker.trail.slice(-(killTrailLimit - 1)), { at: now(), name }] });
    },
    setCounts: ({ liveProjectCount, chatCount }) => {
      if (liveProjectCount !== marker.liveProjectCount || chatCount !== marker.chatCount) {
        update({ liveProjectCount, chatCount });
      }
    },
    counts: () => ({ liveProjectCount: marker.liveProjectCount, chatCount: marker.chatCount }),
    observeVisibility: () => {
      const visible = readVisible();
      if (visible === marker.visible) {
        return;
      }
      update({ visible, hiddenAt: visible ? undefined : now() });
    },
    heartbeat: () => {
      if (!marker.visible) {
        return;
      }
      update({});
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

let documentSignal: MemoryKillSignal | undefined;

/**
 * The document's signal, created on first use in the browser.
 *
 * @param deviceClass - The device class to record, read once.
 * @param readRoute - The deepest route id, read at each write.
 * @returns The signal, or `undefined` during SSR.
 * @public
 */
export const getDocumentMemoryKillSignal = (
  deviceClass: () => string,
  readRoute: () => string | undefined,
): MemoryKillSignal | undefined => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent during SSR
  if (globalThis.window === undefined) {
    return undefined;
  }
  documentSignal ??= createMemoryKillSignal({
    storage: readSessionStorage(),
    navigationType: readNavigationType(),
    deviceClass: deviceClass(),
    readRoute,
  });
  return documentSignal;
};

/**
 * Name the heavy work about to start, so a kill during it says what it was, and add it to the error
 * tracker's `tau.activity` trail (`#lib/activity-breadcrumbs`, structure only).
 *
 * A memory sample is taken first (SB2): a kill happens during heavy work, so the sample taken as
 * that work begins is the one the kill report needs. The sampler only reads values their owners
 * have already observed, so this costs microseconds.
 *
 * The marker is a no-op until the reporter has created the document's signal, and during SSR.
 *
 * @param name - A short stable name: `open`, `render`, `export`, `capture`.
 * @public
 */
export const recordMemoryBreadcrumb = (name: string): void => {
  takeMemorySample();
  documentSignal?.breadcrumb(name);
  recordActivityBreadcrumb(name);
};

/**
 * The live project and chat counts the document's reporter last set.
 *
 * @returns The counts, or `undefined` before the reporter created the document's signal.
 * @public
 */
export const readDocumentSessionCounts = (): Readonly<{ liveProjectCount: number; chatCount: number }> | undefined =>
  documentSignal?.counts();
