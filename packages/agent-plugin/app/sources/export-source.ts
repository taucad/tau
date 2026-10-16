import { useSyncExternalStore } from 'react';
import { toolName } from '@taucad/chat/constants';
import type { ExportModelOutput } from '@taucad/chat/schemas/tools/export-model';
import { tauViewerReadLimit } from '@taucad/mcp/viewer-protocol';
import type { TauViewerModel, TauViewerReadResult } from '@taucad/mcp/viewer-protocol';
import type { ExportFidelity, FileExtension } from '@taucad/types';
import { fileExtensions } from '@taucad/types/constants';
import { sanitizeFormDelta } from '@taucad/workbench-panes/export/export-source';
import type {
  ExportEntryState,
  ExportFormatEntry,
  ExportOutcome,
  ExportRequest,
  ExportSchema,
  ExportSource,
} from '@taucad/workbench-panes/export/export-source';
import type { HostBridge } from '#app/host-bridge.js';
import { decodeBase64 } from '#app/model-loader.js';

/**
 * The page's export tools, served by `@taucad/host`'s `mcp-viewer-export.ts` (app-only). `export_model` is the model
 * tool both hosts already expose; it writes under `.tau/artifacts`.
 */
export const viewerExportTool = {
  formats: 'app_export_formats',
  save: 'app_save_export',
  readArtifact: 'app_read_artifact',
} as const;

/** One format as `app_export_formats` lists it. */
type ListedFormat = Readonly<{
  format: string;
  fidelity: ExportFidelity;
  direct: boolean;
  provider: string;
  exportOptions?: ExportSchema;
}>;

const isCatalogFormat = (value: string): value is FileExtension => fileExtensions.some((format) => format === value);

const isListedFormats = (value: unknown): value is Readonly<{ formats: readonly ListedFormat[] }> =>
  typeof value === 'object' && value !== null && Array.isArray((value as { formats?: unknown }).formats);

const isExportResult = (value: unknown): value is Pick<ExportModelOutput, 'files'> =>
  typeof value === 'object' && value !== null && Array.isArray((value as { files?: unknown }).files);

const isReadResult = (value: unknown): value is TauViewerReadResult =>
  typeof value === 'object' && value !== null && typeof (value as { data?: unknown }).data === 'string';

/**
 * The formats `app_export_formats` lists, narrowed to the catalog the pane can label. `export_model` has no input for
 * framework content flags, so the page offers each route's own options only.
 *
 * @param listed - The tool's formats.
 * @returns The pane's entries.
 */
const formatEntries = (listed: readonly ListedFormat[]): ExportFormatEntry[] =>
  listed.flatMap(({ format, fidelity, direct, provider, exportOptions }) =>
    isCatalogFormat(format)
      ? [
          {
            format,
            fidelity,
            direct,
            provider,
            ...(exportOptions === undefined ? {} : { exportOptions }),
          },
        ]
      : [],
  );

/** The pane's view of each entry, fetched once per entry and shared by every render that asks for it. */
type EntryCache = Readonly<{
  subscribe(listener: () => void): () => void;
  get(entryPath: string): ExportEntryState;
  /** What is known so far, without asking the server. */
  peek(entryPath: string): ExportEntryState | undefined;
}>;

const loadingState: ExportEntryState = {
  hasGeometry: true,
  formats: undefined,
};
const unavailableState: ExportEntryState = {
  hasGeometry: false,
  formats: undefined,
};

const createEntryCache = (load: (entryPath: string) => Promise<ExportFormatEntry[]>): EntryCache => {
  const states = new Map<string, ExportEntryState>();
  const listeners = new Set<() => void>();
  const settle = (entryPath: string, state: ExportEntryState): void => {
    states.set(entryPath, state);
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    peek: (entryPath) => states.get(entryPath),
    get(entryPath) {
      const known = states.get(entryPath);
      if (known !== undefined) {
        return known;
      }
      states.set(entryPath, loadingState);
      const fetchFormats = async (): Promise<void> => {
        try {
          settle(entryPath, { hasGeometry: true, formats: await load(entryPath) });
        } catch {
          settle(entryPath, unavailableState);
        }
      };
      // async-iife: the cache owns the request; every reader of this entry hears its settlement.
      void fetchFormats();
      return loadingState;
    },
  };
};

/**
 * Read one finished artifact through `app_read_artifact`, a reply-sized range at a time.
 *
 * @param bridge - The page's bridge.
 * @param modelId - The shown model, which names the project on the loopback page.
 * @param file - The artifact's project path and size, as `export_model` listed it.
 * @returns The artifact's bytes, assembled from every range.
 */
const readArtifact = async (
  bridge: HostBridge,
  modelId: string,
  file: Readonly<{ artifactPath: string; byteLength: number }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = new Uint8Array(file.byteLength);
  let offset = 0;
  while (offset < file.byteLength) {
    // oxlint-disable-next-line no-await-in-loop -- each range starts where the last one ended.
    const result = await bridge.callTool(viewerExportTool.readArtifact, {
      modelId,
      artifactPath: file.artifactPath,
      offset,
      length: Math.min(tauViewerReadLimit, file.byteLength - offset),
    });
    if (!isReadResult(result) || result.offset !== offset || result.byteLength === 0) {
      throw new Error(`${file.artifactPath} changed while it was read.`);
    }
    bytes.set(decodeBase64(result.data), offset);
    offset += result.byteLength;
  }
  return bytes;
};

/**
 * Hand bytes to the browser as a download (the loopback page is an ordinary tab).
 *
 * @param bytes - The file.
 * @param name - Its download name.
 * @param mimeType - Its type.
 */
const download = (bytes: Uint8Array<ArrayBuffer>, name: string, mimeType: string): void => {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

/**
 * The Export pane's source on the viewer page. The page has no kernel: formats come from `app_export_formats` (the
 * same capability routes the Tau app reads), each format is exported by `export_model` on the server, finished files
 * are copied into the project's `exports/` by `app_save_export`, and on the loopback page, an ordinary browser tab,
 * they can also be downloaded through `app_read_artifact`. An MCP Apps frame cannot download, so there the project
 * folder is the only destination.
 *
 * @param bridge - The page's host bridge.
 * @param model - The model the page shows; its source file is the page's one entry.
 * @returns The pane's export source for this model.
 */
export function createExportSource(bridge: HostBridge, model: TauViewerModel): ExportSource {
  const entries = createEntryCache(async (targetFile) => {
    const listed = await bridge.callTool(viewerExportTool.formats, {
      modelId: model.id,
      targetFile,
    });
    if (!isListedFormats(listed)) {
      throw new Error(`No export formats for ${targetFile}.`);
    }
    return formatEntries(listed.formats);
  });
  const useEntry = (entryPath: string): ExportEntryState =>
    useSyncExternalStore(
      entries.subscribe,
      () => entries.get(entryPath),
      () => entries.get(entryPath),
    );

  /* The loopback server finds the project from the shown model; a host frame names it in the call's `_meta`, and
   * `export_model`'s strict input admits no model id there. */
  const isLoopback = bridge.view().kind === 'loopback';

  const exportEntry = async (request: ExportRequest): Promise<ExportOutcome> => {
    const offered = entries.peek(request.entryPath)?.formats ?? [];
    const succeeded: FileExtension[] = [];
    const failed: FileExtension[] = [];
    /* oxlint-disable no-await-in-loop -- one export at a time, as the Tau app runs them on its one kernel. */
    for (const format of request.formats) {
      try {
        const schema = offered.find((entry) => entry.format === format)?.exportOptions?.schema;
        const options = schema === undefined ? {} : sanitizeFormDelta(schema, request.formatOptions[format] ?? {});
        const result = await bridge.callTool(toolName.exportModel, {
          ...(isLoopback ? { modelId: model.id } : {}),
          targetFile: request.entryPath,
          to: format,
          ...(Object.keys(options).length > 0 ? { options } : {}),
        });
        if (!isExportResult(result) || result.files.length === 0) {
          failed.push(format);
          continue;
        }
        if (request.saveToProject) {
          await bridge.callTool(viewerExportTool.save, {
            modelId: model.id,
            directory: request.formats.length === 1 ? 'exports' : `exports/${format}`,
            files: result.files.map(({ artifactPath, name }) => ({
              artifactPath,
              name,
            })),
          });
        }
        if (request.download) {
          for (const file of result.files) {
            const bytes = await readArtifact(bridge, model.id, file);
            download(bytes, result.files.length === 1 ? `${model.title}.${format}` : file.name, file.mimeType);
          }
        }
        succeeded.push(format);
      } catch {
        failed.push(format);
      }
    }
    /* oxlint-enable no-await-in-loop */
    return { succeeded, failed };
  };

  return {
    useEntry,
    export: exportEntry,
    destinations: isLoopback ? ['download', 'project'] : ['project'],
  };
}
