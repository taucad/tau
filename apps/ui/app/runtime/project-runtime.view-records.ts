/* oxlint-disable typescript/no-restricted-types -- a view's entry path is nullable by schema. */
/**
 * What a project's view record sessions report, held outside React (app state orchestration plan § 4 A6b).
 *
 * Every view's record session runs beside its graphics actor in the project machine (charter G6b) and reports through
 * the ports `createViewRecordPorts` builds: the view's record, the entry path it shows and the record revision the
 * workbench applied. `ProjectProvider` kept those three maps as React state, so the ports could only be built in a
 * render. They are built with the project runtime now, from its lease, and the provider reads this store. Each setter
 * keeps the map's identity when nothing changed, as the React setters did.
 *
 * @module
 */
import { Topic } from '@taucad/events';
import type { WorkbenchView } from '@taucad/workbench';
import { createViewRecordPorts } from '#workbench-records/view-record-session.js';
import type { ViewRecordHost, ViewRecordPortsHandle } from '#workbench-records/view-record-session.js';
import { deviceViewLevels } from '#workbench-records/view-levels.js';

/** The three maps the view record sessions report. Each keeps its identity until it changes. */
export type ProjectViewRecordsSnapshot = Readonly<{
  viewRecords: ReadonlyMap<string, WorkbenchView>;
  viewEntryPaths: ReadonlyMap<string, string | null>;
  appliedWorkbenchRevisions: ReadonlyMap<string, `sha256:${string}`>;
}>;

/** The store, and the ports its sessions report through. */
export type ProjectViewRecords = Readonly<{
  getSnapshot: () => ProjectViewRecordsSnapshot;
  subscribe: (listener: () => void) => () => void;
  setViewRecord: (viewId: string, record: WorkbenchView | undefined) => void;
  setViewEntryPath: (viewId: string, path: string | null | undefined) => void;
  setAppliedWorkbenchRevision: (path: string, digest: `sha256:${string}` | undefined) => void;
  /** The ports every view's record session shares (G6b); the host flushes them on close. */
  ports: ViewRecordPortsHandle;
}>;

/**
 * The next map with `key` set to `value`, or removed when `value` is `undefined`; the same map when nothing changed.
 *
 * @param current - The map now.
 * @param key - The key to set.
 * @param value - Its value, or `undefined` to remove it.
 * @returns The next map.
 */
const withEntry = <V>(current: ReadonlyMap<string, V>, key: string, value: V | undefined): ReadonlyMap<string, V> => {
  if (value === undefined ? !current.has(key) : current.get(key) === value) {
    return current;
  }
  const next = new Map(current);
  if (value === undefined) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  return next;
};

/**
 * Build a project's view record store and its ports.
 *
 * @param input - The project and the file host its sessions open their stores on; the host can be replaced later.
 * @returns The store.
 */
export function createProjectViewRecords(
  input: Readonly<{ projectId: string; host: ViewRecordHost }>,
): ProjectViewRecords {
  let snapshot: ProjectViewRecordsSnapshot = {
    viewRecords: new Map(),
    viewEntryPaths: new Map(),
    appliedWorkbenchRevisions: new Map(),
  };
  const changes = new Topic<void>({ name: 'project-view-records' });
  const update = (next: ProjectViewRecordsSnapshot): void => {
    if (
      next.viewRecords === snapshot.viewRecords &&
      next.viewEntryPaths === snapshot.viewEntryPaths &&
      next.appliedWorkbenchRevisions === snapshot.appliedWorkbenchRevisions
    ) {
      return;
    }
    snapshot = next;
    changes.emit();
  };
  const setViewRecord = (viewId: string, record: WorkbenchView | undefined): void => {
    update({ ...snapshot, viewRecords: withEntry(snapshot.viewRecords, viewId, record) });
  };
  /* `null` is a value here (the view shows no entry); only `undefined` removes the view's entry. */
  const setViewEntryPath = (viewId: string, path: string | null | undefined): void => {
    update({ ...snapshot, viewEntryPaths: withEntry(snapshot.viewEntryPaths, viewId, path) });
  };
  const setAppliedWorkbenchRevision = (path: string, digest: `sha256:${string}` | undefined): void => {
    update({ ...snapshot, appliedWorkbenchRevisions: withEntry(snapshot.appliedWorkbenchRevisions, path, digest) });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => changes.subscribe(listener),
    setViewRecord,
    setViewEntryPath,
    setAppliedWorkbenchRevision,
    ports: createViewRecordPorts({
      projectId: input.projectId,
      root: `/projects/${input.projectId}`,
      host: input.host,
      levels: deviceViewLevels(input.projectId),
      setViewRecord,
      setViewEntryPath,
      setAppliedWorkbenchRevision,
    }),
  };
}
