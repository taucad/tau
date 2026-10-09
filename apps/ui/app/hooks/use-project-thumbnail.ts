import { useCallback, useMemo } from 'react';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import { isNotFound } from '#db/attachment-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';

type Thumbnail = { readonly bytes: Uint8Array<ArrayBuffer>; readonly url: string } | undefined;
type Files = ReturnType<typeof useFileManager>['recordFiles'];
type Watch = ReturnType<typeof useFileManager>['watchRecordFile'];
const sources = new WeakMap<Files, WeakMap<Watch, Map<string, ObservationService<Thumbnail>>>>();

function thumbnailFor(files: Files, watch: Watch, path: string): ObservationService<Thumbnail> {
  let watchers = sources.get(files);
  if (!watchers) {
    watchers = new WeakMap();
    sources.set(files, watchers);
  }
  let paths = watchers.get(watch);
  if (!paths) {
    paths = new Map();
    watchers.set(watch, paths);
  }
  let service = paths.get(path);
  if (!service) {
    service = new ObservationService<Thumbnail>({
      resource: path,
      watch: (invalidate, reset) =>
        watch(path, (event) => {
          if (event.type === 'reset') {
            reset();
          } else {
            invalidate();
          }
        }),
      read: async ({ isCurrent, signal }) => {
        try {
          const bytes = await files.readFile(path);
          signal.throwIfAborted();
          if (!isCurrent()) {
            return undefined;
          }
          return { bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })) };
        } catch (error) {
          if (isNotFound(error)) {
            return undefined;
          }
          throw error;
        }
      },
      equal: (previous, next) =>
        previous === next ||
        (previous?.bytes.length !== undefined &&
          previous.bytes.length === next?.bytes.length &&
          previous.bytes.every((byte, index) => byte === next.bytes[index])),
      disposeValue: (value) => {
        if (value) {
          URL.revokeObjectURL(value.url);
        }
      },
    });
    paths.set(path, service);
  }
  return service;
}

/** Resolve one shared URL lease for the canonical project thumbnail and its actual source. */
export function useProjectThumbnail(projectId: string | undefined): {
  readonly url: string | undefined;
  readonly status: 'registering' | 'pending' | 'ready' | 'error' | 'closed';
  readonly error: string | undefined;
  refresh(): void;
} {
  const { recordFiles, watchRecordFile } = useFileManager();
  const service = useMemo(
    () => (projectId ? thumbnailFor(recordFiles, watchRecordFile, `/projects/${projectId}/thumbnail.webp`) : undefined),
    [projectId, recordFiles, watchRecordFile],
  );
  const snapshot = useObservation(service);
  const refresh = useCallback(() => service?.refresh(), [service]);
  return { url: snapshot.value?.url, status: snapshot.status, error: snapshot.error, refresh };
}
