import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import type { ObservationSnapshot } from '@taucad/fs-client/observation-service';
import { useFileServices } from '#hooks/use-file-services.js';
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
 * @param options - `retainValue` (default `true`): keep showing the last good bytes while a later read fails. A pane
 *   that read afresh after waiting passes `false`, so it never falls back to a value another reader held from before
 *   it opened (I7).
 * @returns Safe content plus current health and an authoritative retry.
 */
export function useFileContent(
  path: string | undefined,
  options: Readonly<{ retainValue?: boolean }> = {},
): FileContentSelection {
  const { retainValue = true } = options;
  const { contentService } = useFileServices();
  const service = path ? contentService?.observeContent(path) : undefined;
  const observation = useObservation(service);
  const result = useSyncExternalStore(
    useCallback(
      (callback: () => void) => (path && contentService ? contentService.subscribe(path, callback) : noop),
      [contentService, path],
    ),
    useCallback(
      () => (path && contentService ? contentService.peekOutcome(path, { retainValue }) : loadingResult),
      [contentService, path, retainValue],
    ),
    () => loadingResult,
  );
  const retry = useCallback(() => {
    service?.refresh();
  }, [service]);
  return useMemo(() => ({ ...result, observation, retry }), [result, observation, retry]);
}

/** What a pane that may have waited shows of its file (STO-25, I7). */
export type FreshContent = Readonly<{
  /** `open` once a read begun after the pane opened is the answer; `failed` when that read failed or could not run. */
  state: 'open' | 'waiting' | 'failed';
  /** Why the fresh read failed. */
  cause?: unknown;
  /**
   * Whether the pane read afresh and has not yet seen its own observation ready: until then it never shows a value
   * retained from before it opened.
   */
  readAfresh: boolean;
  /** The pane's own observation reached ready after it opened: it may retain its last good bytes again. */
  settled: () => void;
  /** Read afresh again after a failure. */
  retry: () => void;
}>;

/**
 * Whether a pane that has just opened may show what the content service holds for its file (STO-25, I7).
 *
 * A pane that waited (on its file's landing, or on a Tau Cloud open) never shows bytes read before it opened: the
 * service may hold them from another reader, and the change that replaced them reaches the page late (the bridge
 * coalesces it). Each time the pane opens after waiting, and when it mounts while an open is owed, the file is read
 * afresh, and the pane stays waiting until a read begun then settles as the service's answer. A failed read, or one
 * that cannot run, is shown as failed with a way to try again, never as the content held before.
 *
 * @param path - The pane's workspace-relative path; `undefined` (a declaration held in memory) owes no read.
 * @param open - Whether the pane's own gate is open.
 * @param owedOnMount - Whether a read is owed even though the pane mounts open: a Tau Cloud open is still owed.
 * @returns What the pane shows.
 */
export function useFreshContent(path: string | undefined, open: boolean, owedOnMount: boolean): FreshContent {
  const { contentService } = useFileServices();
  const [owed, setOwed] = useState(() => !open || owedOnMount);
  const [readAfresh, setReadAfresh] = useState(() => !open || owedOnMount);
  const [failure, setFailure] = useState<Readonly<{ path: string; cause: unknown }>>();
  if (!open && (!owed || !readAfresh || failure !== undefined)) {
    setOwed(true);
    setReadAfresh(true);
    setFailure(undefined);
  }
  const failed = failure !== undefined && failure.path === path;
  useEffect(() => {
    if (!open || !owed || failed || path === undefined || contentService === undefined) {
      return undefined;
    }
    const run = { live: true };
    // async-iife: bootstrap -- the pane opens on a read begun now, or shows why it could not.
    void (async (): Promise<void> => {
      try {
        const outcome = await contentService.rereadOutcome(path);
        if (!run.live) {
          return;
        }
        if (outcome.kind === 'error') {
          setFailure({ path, cause: outcome.cause });
        } else {
          setOwed(false);
        }
      } catch (error) {
        if (run.live) {
          setFailure({ path, cause: error });
        }
      }
    })();
    return () => {
      run.live = false;
    };
  }, [contentService, failed, open, owed, path]);
  const settled = useCallback(() => {
    setReadAfresh(false);
  }, []);
  const retry = useCallback(() => {
    /* Clearing the failure is what reads again: the effect stands down only while the path has failed. */
    setFailure(undefined);
  }, []);
  const state = open
    ? path === undefined || contentService === undefined
      ? 'open'
      : failed
        ? 'failed'
        : owed
          ? 'waiting'
          : 'open'
    : 'waiting';
  return useMemo(
    () => ({ state, readAfresh, retry, settled, ...(failed ? { cause: failure.cause } : {}) }),
    [failed, failure, readAfresh, retry, settled, state],
  );
}
