import { useMemo, useSyncExternalStore } from 'react';
import type { TauViewerEntryStatus, TauViewerIssue } from '@taucad/mcp/viewer-protocol';
import type { KinematicsSource, KinematicsUnitStatus } from '@taucad/workbench-panes/kinematics/kinematics-source';

/** The server's live status of the sources a page shows, by project-relative path. */
type LiveStatus = Readonly<Record<string, TauViewerEntryStatus>>;

/** The page's Kinematics source, fed the server's live status of the shown source. */
export type PageKinematicsSource = Required<Pick<KinematicsSource, 'useUnitStatus'>> &
  Readonly<{
    /** The newest status the page holds, by project-relative source path; `undefined` before any. */
    setStatus(status: LiveStatus | undefined): void;
  }>;

/**
 * Whether an issue is the kernel's rejection of the entry's mechanism: the replicad kernel reports it as a warning
 * whose `details.mechanism` holds the reason, as the Tau app reads it (`chat-kinematics.tsx`).
 *
 * @param issue - One runtime issue.
 * @returns `true` for a mechanism issue.
 */
const isMechanismIssue = (issue: TauViewerIssue): boolean =>
  typeof issue.details === 'object' && issue.details !== null && 'mechanism' in issue.details;

/**
 * The entry's build status from the live status.
 *
 * @param live - The server's status of the shown sources, by path.
 * @param entryPath - The entry the pane asks about.
 * @returns Building while the server builds a change, and the kernel's mechanism issue.
 */
export const kinematicsUnitStatusOf = (live: LiveStatus | undefined, entryPath: string): KinematicsUnitStatus => {
  const status = live?.[entryPath];
  if (status === undefined) {
    return { isUpdating: false, mechanismIssue: undefined };
  }
  const issue = status.issues.find((candidate) => isMechanismIssue(candidate));
  return { isUpdating: status.building, mechanismIssue: issue === undefined ? undefined : { message: issue.message } };
};

/**
 * The Kinematics pane's source on the viewer page. The mechanism arrives inside the shown GLB, whose topology payload
 * the graphics actor's kinematics actor loads, and pose, playback and drag all live in that actor. What the actor
 * cannot know comes from the server's live status of the shown source (PAR-1, LRP-2b): whether a change is being built,
 * and why the kernel rejected the mechanism. The page has no hidden panel, so the pane counts as shown while mounted.
 *
 * @returns The source; the page sets each status it hears.
 */
export function createKinematicsSource(): PageKinematicsSource {
  let current: LiveStatus | undefined;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    setStatus(status) {
      if (status === current) {
        return;
      }
      current = status;
      for (const listener of listeners) {
        listener();
      }
    },
    useUnitStatus(entryPath) {
      const status = useSyncExternalStore(
        subscribe,
        () => current,
        () => current,
      );
      return useMemo(() => kinematicsUnitStatusOf(status, entryPath), [entryPath, status]);
    },
  };
}
