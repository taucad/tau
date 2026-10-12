import { useCallback, useMemo, useSyncExternalStore } from 'react';
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
