/**
 * The Export pane's kept choices on the viewer page: the format picked, the destinations and each format's
 * options and content. They live under the keys the Tau app gives them (`export/<format>/options`,
 * `export/<format>/content`) and `export/preferences` for the rest.
 *
 * The page keeps them in the frame's `localStorage`. An MCP Apps host may refuse the frame storage, so every read and
 * write is guarded and the values then live in memory for the page's lifetime. {@link ExportOptionStorage} is the
 * lane store's option interface, so the page can hand its lane store in instead.
 */
import { useSyncExternalStore } from 'react';
import type { FileExtension } from '@taucad/types';
import { fileExtensions } from '@taucad/types/constants';
import { defaultExportPreferences, runtimeContentFromRecord } from '@taucad/workbench-panes/export/export-source';
import type { ExportPreferences, ExportPreferencesState } from '@taucad/workbench-panes/export/export-source';

/** Where pane options persist: one value per key, such as `export/stl/options`. */
export type ExportOptionStorage = Readonly<{
  /** The saved value, or `undefined` when none is saved. */
  readOption(key: string): unknown;
  /** Save a value; `undefined` removes it. */
  writeOption(key: string, value: unknown): void;
}>;

/** The storage the helper reads, as `localStorage` offers it. */
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const storageKeyPrefix = 'tau-viewer:export:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCatalogFormat = (value: unknown): value is FileExtension =>
  typeof value === 'string' && fileExtensions.some((format) => format === value);

/**
 * The frame's `localStorage`, or `undefined` when the host refuses it: reading the property can throw in a sandbox.
 *
 * @returns The storage, if any.
 */
const frameStorage = (): KeyValueStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * Pane options in the frame's `localStorage` under one key per project, with a memory copy that keeps them when the
 * host refuses the storage.
 *
 * @param projectKey - Names the project; every project shares one key without it.
 * @param storage - Where values persist; the frame's `localStorage` by default. Tests pass their own.
 * @returns The option storage.
 */
export function createExportOptionStorage(
  projectKey?: string,
  storage: KeyValueStorage | undefined = frameStorage(),
): ExportOptionStorage {
  const key = `${storageKeyPrefix}${projectKey ?? 'default'}`;
  /* The memory copy is the record; storage is its best-effort mirror. */
  let record: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? '{}');
    record = isRecord(parsed) ? parsed : {};
  } catch {
    record = {};
  }
  return {
    readOption: (optionKey) => record[optionKey],
    writeOption(optionKey, value) {
      const { [optionKey]: _removed, ...rest } = record;
      record = value === undefined ? rest : { ...rest, [optionKey]: value };
      try {
        storage?.setItem(key, JSON.stringify(record));
      } catch {
        /* Refused or full: the memory copy keeps the value for this page. */
      }
    },
  };
}

const preferencesKey = 'export/preferences';
const optionsKey = (format: FileExtension): string => `export/${format}/options`;
const contentKey = (format: FileExtension): string => `export/${format}/content`;

/**
 * Read the kept choices.
 *
 * @param storage - Where they persist.
 * @returns The preferences, with the first visit's defaults where nothing valid is saved.
 */
const readPreferences = (storage: ExportOptionStorage): ExportPreferences => {
  const saved = storage.readOption(preferencesKey);
  const base = isRecord(saved) ? saved : {};
  const flag = (name: 'shouldDownload' | 'shouldSaveToProject' | 'zipMultiple'): boolean => {
    const value = base[name];
    return typeof value === 'boolean' ? value : defaultExportPreferences[name];
  };
  const formatOptions: ExportPreferences['formatOptions'] = {};
  const formatContent: ExportPreferences['formatContent'] = {};
  for (const format of fileExtensions) {
    const options = storage.readOption(optionsKey(format));
    if (isRecord(options)) {
      formatOptions[format] = options;
    }
    const content = storage.readOption(contentKey(format));
    if (isRecord(content)) {
      formatContent[format] = runtimeContentFromRecord(content);
    }
  }
  return {
    formatContent,
    formatOptions,
    selectedFormats: Array.isArray(base['selectedFormats']) ? base['selectedFormats'].filter(isCatalogFormat) : [],
    shouldDownload: flag('shouldDownload'),
    shouldSaveToProject: flag('shouldSaveToProject'),
    zipMultiple: flag('zipMultiple'),
  };
};

/**
 * Write the kept choices: each format's options and content under its own key, and the rest together.
 *
 * @param storage - Where they persist.
 * @param next - The choices.
 */
const writePreferences = (storage: ExportOptionStorage, next: ExportPreferences): void => {
  const { formatContent, formatOptions, selectedFormats, shouldDownload, shouldSaveToProject, zipMultiple } = next;
  storage.writeOption(preferencesKey, {
    selectedFormats,
    shouldDownload,
    shouldSaveToProject,
    zipMultiple,
  });
  for (const format of fileExtensions) {
    const options = formatOptions[format];
    const content = formatContent[format];
    storage.writeOption(
      optionsKey(format),
      options === undefined || Object.keys(options).length === 0 ? undefined : options,
    );
    storage.writeOption(
      contentKey(format),
      content === undefined || Object.keys(content).length === 0 ? undefined : content,
    );
  }
};

const healthy: ExportPreferencesState[2] = {
  retry() {
    /* Storage never fails: a refused write falls back to memory. */
  },
};

/**
 * The Export pane's `usePreferences` over one option storage: the kept choices, and a writer that keeps the next
 * ones. Every pane reading the same storage hears a write.
 *
 * @param storage - Where the choices persist.
 * @returns The hook.
 */
export function createExportPreferences(storage: ExportOptionStorage): () => ExportPreferencesState {
  const listeners = new Set<() => void>();
  let snapshot = readPreferences(storage);
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const persist = (next: ExportPreferences): void => {
    writePreferences(storage, next);
    snapshot = readPreferences(storage);
    for (const listener of listeners) {
      listener();
    }
  };
  const getSnapshot = (): ExportPreferences => snapshot;
  return () => [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), persist, healthy];
}
