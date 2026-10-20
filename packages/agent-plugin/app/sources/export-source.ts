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
  ExportUnavailable,
} from '@taucad/workbench-panes/export/export-source';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load this package's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../../package.json' with { type: 'json' };
import { ToolCallError } from '#app/host-bridge.js';
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
const noGeometryState: ExportEntryState = {
  hasGeometry: false,
  formats: undefined,
};

/**
 * Why the formats could not be listed, for the person. The plugin, the CLI and the MCP server release as one version,
 * so a server without the formats tool is an older `tau` that only the matching CLI replaces; any other failure may
 * pass and is offered again.
 *
 * @param error - What the listing threw.
 * @param retry - Asks for the formats again.
 * @returns The pane's account of the failure.
 */
const unavailableOf = (error: unknown, retry: () => void): ExportUnavailable => {
  if (error instanceof ToolCallError && error.code === 'UNKNOWN_TOOL') {
    const { version } = packageJson;
    return {
      code: error.code,
      message: `This Tau server has no export formats; plugin ${version} needs the same version: npm install -g @taucad/cli@${version}, then restart the Tau server or your agent`,
      retry: undefined,
    };
  }
  return {
    code: error instanceof ToolCallError && error.code !== undefined ? error.code : 'FORMATS_UNAVAILABLE',
    message: error instanceof Error ? error.message : String(error),
    retry,
  };
};

const createEntryCache = (load: (entryPath: string) => Promise<ExportFormatEntry[]>): EntryCache => {
  const states = new Map<string, ExportEntryState>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const settle = (entryPath: string, state: ExportEntryState): void => {
    states.set(entryPath, state);
    notify();
  };
  /* Forgetting the failure makes the next read ask again; every reader hears it and reads. */
  const retry = (entryPath: string): void => {
    if (states.get(entryPath)?.unavailable !== undefined) {
      states.delete(entryPath);
      notify();
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
        } catch (error) {
          settle(entryPath, {
            hasGeometry: true,
            formats: undefined,
            unavailable: unavailableOf(error, () => {
              retry(entryPath);
            }),
          });
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
  /* Until the page learns what the render drew, an empty model file is the one sign that it drew nothing. */
  const hasGeometry = model.byteLength > 0;
  const read = (entryPath: string): ExportEntryState => (hasGeometry ? entries.get(entryPath) : noGeometryState);
  const useEntry = (entryPath: string): ExportEntryState =>
    useSyncExternalStore(
      entries.subscribe,
      () => read(entryPath),
      () => read(entryPath),
    );

  /* The loopback server finds the project from the shown model; in a host frame the server finds it from the call's
   * conversation, and `export_model`'s strict input admits no model id there. */
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
