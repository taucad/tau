import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import type { ObservationSnapshot } from '@taucad/fs-client/observation-service';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';

const noop = (): void => undefined;
const loadingResult: FileContentResult = { kind: 'loading' };

/** Safe presentation bytes with independently selected acquisition health and retry. */
export type FileContentSelection = FileContentResult & {
  readonly observation: ObservationSnapshot<FileContentResult>;
  retry(): void;
};

/**
 * Acquire the shared content owner after commit and retain safe display bytes during failure.
 * Explicit codec overrides still publish through the existing outcome facade.
 * @param path - Workspace-relative resource, or undefined before selection.
 * @returns Safe content plus current health and an authoritative retry.
 */
export function useFileContent(path: string | undefined): FileContentSelection {
  const { contentService } = useFileManager();
  const service = path ? contentService?.observeContent(path) : undefined;
  const observation = useObservation(service);
  const result = useSyncExternalStore(
    useCallback(
      (callback: () => void) => (path && contentService ? contentService.subscribe(path, callback) : noop),
      [contentService, path],
    ),
    useCallback(
      () => (path && contentService ? contentService.peekOutcome(path, { retainValue: true }) : loadingResult),
      [contentService, path],
    ),
    () => loadingResult,
  );
  const retry = useCallback(() => {
    service?.refresh();
  }, [service]);
  return useMemo(() => ({ ...result, observation, retry }), [result, observation, retry]);
}

/**
 * Whether a pane that has just opened may show what the content service holds for its file (STO-25, I7).
 *
 * A pane that waited (on its file's landing, or on a Tau Cloud open) never shows bytes read before it opened: the
 * service may hold them from another reader, and the change that replaced them reaches the page late (the bridge
 * coalesces it). Each time the pane opens after waiting, and when it mounts while an open is owed, the file is read
 * afresh, and the pane stays closed until a read begun after that settles as the service's answer.
 *
 * @param path - The pane's workspace-relative path; `undefined` (a declaration held in memory) owes no read.
 * @param open - Whether the pane's own gate is open.
 * @param owedOnMount - Whether a read is owed even though the pane mounts open: a Tau Cloud open is still owed.
 * @returns `true` once the pane may show its content.
 */
export function useFreshContent(path: string | undefined, open: boolean, owedOnMount: boolean): boolean {
  const { contentService } = useFileManager();
  const [owed, setOwed] = useState(() => !open || owedOnMount);
  if (!open && !owed) {
    setOwed(true);
  }
  useEffect(() => {
    if (!open || !owed || path === undefined || contentService === undefined) {
      return undefined;
    }
    let live = true;
    // async-iife: bootstrap -- the pane opens when a read begun now is the service's answer, or stays closed.
    void (async (): Promise<void> => {
      try {
        /* A later read begun meanwhile is also fresh: ask again until one settles as the answer. */
        // oxlint-disable-next-line no-await-in-loop -- each read waits for the one before to be superseded or held.
        while (live && !(await contentService.rereadOutcome(path))) {
          /* Superseded: the newer read's answer is the one to hold. */
        }
        if (live) {
          setOwed(false);
        }
      } catch (error) {
        /* Never shown on an earlier read (I7): the pane stays closed and says so. */
        console.warn('[file content] a fresh read could not settle', path, error);
      }
    })();
    return () => {
      live = false;
    };
  }, [contentService, open, owed, path]);
  return open && (path === undefined || contentService === undefined || !owed);
}
