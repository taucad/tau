import { useSyncExternalStore } from 'react';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerListFilesInput, TauViewerListFilesResult } from '@taucad/mcp/viewer-protocol';
import type { FilesEntry, FilesSource } from '@taucad/workbench-panes/files/files-source';
import type { HostBridge } from '#app/host-bridge.js';

const isListing = (value: unknown): value is TauViewerListFilesResult =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { entries?: unknown }).entries) &&
  typeof (value as { filesVersion?: unknown }).filesVersion === 'number';

/** What the page tells the Files source. */
export type FilesSourceOptions = Readonly<{
  /** The model the page shows; its project is the one listed. */
  modelId: () => string | undefined;
  /** Show one file in this page (`app_open_file`); rejects with the reason it could not. */
  openFile: (path: string) => Promise<void>;
}>;

/** The page's Files source, and where the page tells it what it shows and what its sync heard. */
export type PageFilesSource = FilesSource &
  Readonly<{
    /** The page now shows this file; the pane marks it. */
    setShownFile: (path: string | undefined) => void;
    /** `app_sync` answered this `filesVersion`; a newer one lists the pane again. */
    setFilesVersion: (filesVersion: number) => void;
  }>;

/**
 * The Files pane's source on the viewer page. It lists one folder, or one search, per `app_list_files` call in the
 * project of the model the page shows. The page's `app_sync` carries the project's `filesVersion` once it was listed,
 * and a newer one tells the pane to list again, so a file the agent or an editor writes appears without a poll of its
 * own. Opening a file goes through the page, so it changes this page alone.
 *
 * @param bridge - The page's host bridge.
 * @param options - The shown model and how the page opens another file.
 * @returns The source, and its setters for the file the page shows and the version its sync heard.
 */
export function createFilesSource(bridge: HostBridge, options: FilesSourceOptions): PageFilesSource {
  /** The newest `filesVersion` a listing or a sync carried. */
  let filesVersion: number | undefined;
  const listeners = new Set<() => void>();
  let shownFile: string | undefined;
  const shownListeners = new Set<() => void>();

  /** A listing's version is what the pane shows; a newer one from a sync, after a listing, lists again. */
  const heard = (next: number, fromSync: boolean): void => {
    if (filesVersion !== undefined && next <= filesVersion) {
      return;
    }
    const isChange = fromSync && filesVersion !== undefined;
    filesVersion = next;
    if (isChange) {
      for (const listener of listeners) {
        listener();
      }
    }
  };

  const list = async (input: Pick<TauViewerListFilesInput, 'path' | 'query'>): Promise<readonly FilesEntry[]> => {
    const modelId = options.modelId();
    const answer = await bridge.callTool(tauViewerToolName.appListFiles, {
      ...(modelId === undefined ? {} : { modelId }),
      ...input,
    });
    if (!isListing(answer)) {
      throw new Error('This Tau server did not list the project files.');
    }
    heard(answer.filesVersion, false);
    return answer.entries;
  };

  return {
    loadDirectory: async (path) => list({ path }),
    searchFiles: async (query) => list({ query }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    useActivePath() {
      return useSyncExternalStore(
        (listener) => {
          shownListeners.add(listener);
          return () => {
            shownListeners.delete(listener);
          };
        },
        () => shownFile,
      );
    },
    openFile: options.openFile,
    setShownFile(path) {
      if (path !== shownFile) {
        shownFile = path;
        for (const listener of shownListeners) {
          listener();
        }
      }
    },
    setFilesVersion(next) {
      heard(next, true);
    },
  };
}
