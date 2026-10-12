/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null). */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { RecordHealth } from '#workbench-records/record-health.js';

/**
 * Where a settings record stands, most urgent first. Every state is a problem a
 * person can act on: routine re-reads and bounded read retries publish nothing,
 * so the header trigger never flashes while a record is fine.
 */
export type RecordIssueState = 'unconfirmed' | 'invalid' | 'newer' | 'unavailable';
export type RecordIssueKind = 'entries' | 'view' | 'layout';

/** One settings record that needs a person, published by the host that owns its store. */
export type RecordIssue = Readonly<{
  kind: RecordIssueKind;
  /** Record path under the project root. */
  path: string;
  /** The view's entry, for view records. */
  entry?: string | undefined;
  state: RecordIssueState;
  /** The underlying message, shown only with the debug setting. */
  message: string | undefined;
  /** The refused bytes the person reviews, for invalid records. */
  bytes: Uint8Array<ArrayBuffer> | null;
  /** A checked write is outstanding: *Retry save* must not start a replacement. */
  writing: boolean;
  retryRead: () => Promise<unknown>;
  retrySave: () => Promise<boolean>;
  /** Replace refused bytes, checked against the exact bytes the person reviewed. */
  reset?: (reviewed: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
  /** Entries only: write the reviewed known-key correction. */
  repair?: (record: WorkbenchEntries, reviewed: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
}>;

export const recordIssueUrgency: readonly RecordIssueState[] = ['unconfirmed', 'invalid', 'newer', 'unavailable'];

/**
 * One record's issue state from its refusal and health, or none while it is fine.
 *
 * @param refusal - The codec's refusal of the current bytes.
 * @param health - The store's read and write health.
 * @returns The most urgent state, or `undefined`.
 */
export function recordIssueState(
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD' } | undefined,
  health: RecordHealth | undefined,
): RecordIssueState | undefined {
  if (health?.unconfirmed) {
    return 'unconfirmed';
  }
  if (refusal) {
    return refusal.code === 'INVALID_RECORD' ? 'invalid' : 'newer';
  }
  return health?.read === 'unavailable' ? 'unavailable' : undefined;
}

/** The trigger's and the sidebar's words for a project's records: the most urgent label and the count. */
export function summarizeRecordIssues(
  issues: readonly RecordIssue[],
): Readonly<{ state: RecordIssueState; label: string; count: number }> | undefined {
  const state = recordIssueUrgency.find((candidate) => issues.some((issue) => issue.state === candidate));
  if (!state) {
    return undefined;
  }
  const label =
    state === 'unconfirmed'
      ? 'Save not confirmed'
      : state === 'invalid' || state === 'newer'
        ? 'Settings not applied'
        : 'Settings unavailable';
  return { state, label, count: issues.length };
}

const projects = new Map<string, Map<string, RecordIssue>>();
const snapshots = new Map<string, readonly RecordIssue[]>();
/** Emits the id of the project whose issues changed. */
const changes = new Topic<string>({ name: 'recordIssues.changes' });
const empty: readonly RecordIssue[] = [];

/**
 * Publish or clear one record's issue for a project. Hosts call this; the header
 * trigger, the sidebar row and the close guard read it.
 *
 * @param projectId - The owning project.
 * @param id - The record's stable id within the project (its path).
 * @param issue - The issue, or `undefined` once the record is fine or its host unmounts.
 */
export function publishRecordIssue(projectId: string, id: string, issue: RecordIssue | undefined): void {
  const records = projects.get(projectId) ?? new Map<string, RecordIssue>();
  if (issue === undefined ? !records.has(id) : records.get(id) === issue) {
    return;
  }
  if (issue === undefined) {
    records.delete(id);
  } else {
    records.set(id, issue);
  }
  if (records.size === 0) {
    projects.delete(projectId);
    snapshots.delete(projectId);
  } else {
    projects.set(projectId, records);
    snapshots.set(
      projectId,
      [...records.values()].sort(
        (a, b) =>
          recordIssueUrgency.indexOf(a.state) - recordIssueUrgency.indexOf(b.state) || a.path.localeCompare(b.path),
      ),
    );
  }
  changes.emit(projectId);
}

/**
 * A project's open record issues, most urgent first; the same array until one changes.
 *
 * @param projectId - The project.
 * @returns Its issues.
 */
export const readRecordIssues = (projectId: string): readonly RecordIssue[] => snapshots.get(projectId) ?? empty;

/**
 * Wake on a project's record issues.
 *
 * @param projectId - The project.
 * @param listener - Called after each change.
 * @returns Unsubscribe.
 */
export function subscribeRecordIssues(projectId: string, listener: () => void): () => void {
  // ponytail: one topic for every project; listeners filter by id, keyed topics if many projects stay open.
  return changes.subscribe((changed) => {
    if (changed === projectId) {
      listener();
    }
  });
}

/**
 * A project's open record issues, for React.
 *
 * @param projectId - The project.
 * @returns Its issues, most urgent first.
 */
export function useRecordIssues(projectId: string): readonly RecordIssue[] {
  const subscribe = useCallback((listener: () => void) => subscribeRecordIssues(projectId, listener), [projectId]);
  const read = useCallback(() => readRecordIssues(projectId), [projectId]);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Keep one record's issue published while its host is mounted.
 *
 * @param projectId - The owning project.
 * @param id - The record's id (its path).
 * @param issue - The current issue, or `undefined` while the record is fine.
 */
export function usePublishRecordIssue(projectId: string, id: string, issue: RecordIssue | undefined): void {
  useEffect(() => {
    publishRecordIssue(projectId, id, issue);
  }, [id, issue, projectId]);
  useEffect(
    () => () => {
      publishRecordIssue(projectId, id, undefined);
    },
    [id, projectId],
  );
}
