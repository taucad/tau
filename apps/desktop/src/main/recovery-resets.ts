/**
 * Resets from the recovery window (desktop resilient startup blueprint, D0; R12).
 *
 * A reset is a quarantine, never a delete: main renames the store into `<userData>/recovery/<UTC time>/`. Project files
 * and the Home folder are never in scope. A running app holds these files open, so the recovery window only records
 * the request in `<userData>/recovery/pending-resets.json`; the next start applies it at module scope, before
 * `whenReady`, tries each store once, and removes the request file whatever the result. A rename that fails is
 * reported and skipped, and never blocks the start.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { errnoOf, storeResetSignal } from '#main/desktop-signals.js';
import type { DesktopSignal } from '#main/desktop-signals.js';

/** The stores the recovery window can reset, in the order a start applies them. */
export const resettableStores = ['folder-list', 'window-layout', 'local-database', 'caches'] as const;
export type ResettableStore = (typeof resettableStores)[number];

/** The request file's name under `<userData>/recovery/`. */
export const pendingResetsFileName = 'pending-resets.json';

/** Chromium's and Tau's cache directories under the session data, each moved only if present. */
export const cacheDirectories = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  'compile-cache',
] as const;

/**
 * Whether a value names a store the recovery window may reset.
 *
 * @param value - Anything.
 * @returns Whether it is one of {@link resettableStores}.
 */
export const isResettableStore = (value: unknown): value is ResettableStore =>
  resettableStores.includes(value as ResettableStore);

const recoveryDirectory = (userData: string): string => join(userData, 'recovery');
const pendingPath = (userData: string): string => join(recoveryDirectory(userData), pendingResetsFileName);

/**
 * The stores a pending request names. A damaged request reads as none.
 *
 * @param userData - The profile.
 * @returns The stores, in application order, without repeats.
 */
export const readPendingResets = (userData: string): ResettableStore[] => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(pendingPath(userData), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return [];
    }
    const { schemaVersion, stores } = parsed as { schemaVersion?: unknown; stores?: unknown };
    if (schemaVersion !== 1 || !Array.isArray(stores)) {
      return [];
    }
    if (!stores.every((store) => isResettableStore(store))) {
      return [];
    }
    return resettableStores.filter((store) => stores.includes(store));
  } catch {
    return [];
  }
};

/**
 * Record a reset for the next start. Nothing is moved now.
 *
 * @param userData - The profile.
 * @param store - The store to reset.
 * @returns The stores now pending.
 */
export const requestReset = (userData: string, store: ResettableStore): ResettableStore[] => {
  const stores = resettableStores.filter(
    (candidate) => candidate === store || readPendingResets(userData).includes(candidate),
  );
  mkdirSync(recoveryDirectory(userData), { recursive: true });
  const temporary = `${pendingPath(userData)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, stores })}\n`, { mode: 0o600 });
  renameSync(temporary, pendingPath(userData));
  return stores;
};

/** One store's result at startup. */
export type ResetResult =
  | { readonly store: ResettableStore; readonly outcome: 'moved' | 'absent' }
  | { readonly store: ResettableStore; readonly outcome: 'failed'; readonly errno: string };

/** What {@link applyPendingResets} needs. */
export type ApplyResetsOptions = {
  readonly userData: string;
  /** Chromium's session data, which holds IndexedDB and the caches; the same as `userData` unless moved. */
  readonly sessionData: string;
  /** The quarantine folder's name, a UTC time without colons. */
  readonly stamp: string;
  /** The app's IndexedDB origin prefixes (`app_tau_0`, and the development server's in an unpackaged run). */
  readonly appOrigins: readonly string[];
  readonly report: (signal: DesktopSignal) => void;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
};

/* The files each store moves, as [source, destination relative to the quarantine folder]. */
const itemsOf = (store: ResettableStore, options: ApplyResetsOptions): Array<readonly [string, string]> => {
  switch (store) {
    case 'folder-list': {
      return [[join(options.userData, 'granted-roots.json'), 'granted-roots.json']];
    }
    case 'window-layout': {
      return [[join(options.userData, 'window-state.json'), 'window-state.json']];
    }
    case 'local-database': {
      const directory = join(options.sessionData, 'IndexedDB');
      let entries: string[] = [];
      try {
        entries = readdirSync(directory);
      } catch {
        return [];
      }
      return entries
        .filter((entry) => options.appOrigins.some((origin) => entry.startsWith(`${origin}.`)))
        .map((entry) => [join(directory, entry), join('IndexedDB', entry)] as const);
    }
    case 'caches': {
      return cacheDirectories.map(
        (name) => [join(name === 'compile-cache' ? options.userData : options.sessionData, name), name] as const,
      );
    }
  }
};

/**
 * Apply the pending resets, once each, and remove the request file. Runs at module scope before `whenReady`.
 *
 * @param options - The profile, the quarantine folder's name, and the report and log sinks.
 * @returns One result per pending store. It never throws.
 */
export const applyPendingResets = (options: ApplyResetsOptions): ResetResult[] => {
  const stores = readPendingResets(options.userData);
  /* One attempt whatever the result: removed before anything moves, so a start that dies mid-way does not retry.
   * A request that cannot be removed would run again at every start, so it runs at none. */
  try {
    if (existsSync(pendingPath(options.userData))) {
      unlinkSync(pendingPath(options.userData));
    }
  } catch (error) {
    options.log('warn', 'main.pending-resets-unremovable', { errno: errnoOf(error) });
    return [];
  }
  const quarantine = join(recoveryDirectory(options.userData), options.stamp);
  const results: ResetResult[] = [];
  for (const store of stores) {
    let result: ResetResult;
    try {
      const items = itemsOf(store, options).filter(([source]) => existsSync(source));
      for (const [source, destination] of items) {
        const target = join(quarantine, destination);
        mkdirSync(join(target, '..'), { recursive: true });
        renameSync(source, target);
      }
      if (store === 'window-layout' && items.length > 0) {
        /* An empty layout restores no frame, and keeps the launch from being taken for a first run. */
        writeFileSync(join(options.userData, 'window-state.json'), '{}');
      }
      result = { store, outcome: items.length === 0 ? 'absent' : 'moved' };
    } catch (error) {
      result = { store, outcome: 'failed', errno: errnoOf(error) };
    }
    options.log(result.outcome === 'failed' ? 'warn' : 'info', 'main.store-reset', result);
    options.report(storeResetSignal(store, result.outcome));
    results.push(result);
  }
  return results;
};
