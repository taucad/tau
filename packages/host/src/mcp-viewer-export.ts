/**
 * The viewer page's Export pane, server half (agent plugin viewer parity blueprint V9).
 *
 * The page has no kernel: it exports through `export_model`, which writes under `.tau/artifacts`. This module answers
 * the three things `export_model` does not: which formats the entry's kernel offers and their option schemas (the same
 * capability routes the Tau app reads from its in-browser runtime), copying finished artifacts into the project's
 * `exports/` folder so they are real deliverables, and reading an artifact's bytes in ranges for a browser download
 * on the loopback page. Every path is checked against the project folder: artifacts are read only from
 * `.tau/artifacts`, and deliverables are written only under `exports/`.
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path';

import { z } from 'zod';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import type { JSONSchema7 } from '@taucad/runtime/types';
import { tauViewerReadLimit } from '@taucad/mcp/viewer-protocol';
import type { TauViewerReadResult } from '@taucad/mcp/viewer-protocol';

import { readModelRange } from '#mcp-viewer-read.js';

/** Tool names the page calls; every one is app-only (`visibility: ['app']`). */
export const viewerExportToolName = {
  /** The entry's export formats and their option schemas. */
  formats: 'app_export_formats',
  /** Copy finished artifacts into the project's `exports/`. */
  save: 'app_save_export',
  /** Read a byte range of a finished artifact, for a download. */
  readArtifact: 'app_read_artifact',
} as const;

/** The project folder deliverables go to. */
const exportsFolder = 'exports';

/** The folder `export_model` writes artifacts to. */
const artifactsFolder = '.tau/artifacts';

const modelIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe('The shown model the page names; the loopback server finds the project folder from it.');

/** Input of `app_export_formats`. */
export const viewerExportFormatsInputSchema = z
  .object({
    modelId: modelIdSchema,
    targetFile: z.string().min(1).describe('Project-relative CAD source file.'),
  })
  .strict();

/** Input of `app_save_export`. */
export const viewerSaveExportInputSchema = z
  .object({
    modelId: modelIdSchema,
    directory: z.string().min(1).describe('Project folder under exports/, such as exports or exports/stl.'),
    files: z
      .array(
        z
          .object({
            artifactPath: z.string().min(1).describe('A file export_model wrote under .tau/artifacts/.'),
            name: z.string().min(1).describe('The relative name export_model gave the file.'),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** Input of `app_read_artifact`. */
export const viewerReadArtifactInputSchema = z
  .object({
    modelId: modelIdSchema,
    artifactPath: z.string().min(1).describe('A file export_model wrote under .tau/artifacts/.'),
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive(),
  })
  .strict();

/** One option schema and its defaults, as a route publishes them. */
export type ViewerExportSchema = Readonly<{
  schema: Readonly<Record<string, unknown>>;
  defaults: Record<string, unknown>;
}>;

/** One format the entry's kernel offers, reduced to its best route. */
export type ViewerExportFormat = Readonly<{
  format: string;
  fidelity: 'brep' | 'mesh';
  /** Whether the kernel writes the format itself rather than through a transcoder. */
  direct: boolean;
  /** `kernel` or `kernel+transcoder`. */
  provider: string;
  /** The route's own options, when it declares any. `export_model` passes these as `options`. */
  exportOptions?: ViewerExportSchema;
}>;

/** Result of `app_export_formats`. */
export type ViewerExportFormatsResult = Readonly<{
  kernelId: string;
  formats: ViewerExportFormat[];
}>;

/** Result of `app_save_export`. */
export type ViewerSaveExportResult = Readonly<{
  files: Array<Readonly<{ path: string; byteLength: number }>>;
}>;

/** One export route of the runtime's capability manifest, as far as listing needs it. */
export type ViewerExportRoute = Readonly<{
  targetFormat: string;
  kernelId: string;
  transcoderId?: string | undefined;
  fidelity: 'brep' | 'mesh';
  exportOptions: Readonly<{ schema: JSONSchema7; defaults: unknown }>;
}>;

/** The part of the project runtime listing needs; the host's runtime client satisfies it. */
export type ViewerExportRuntime = Readonly<{
  capabilities: Readonly<{ routes: readonly ViewerExportRoute[] }> | undefined;
  connect(): Promise<void>;
  describe(input: {
    source: { path: string };
    signal?: AbortSignal;
  }): Promise<Readonly<{ kernelId?: string | undefined }>>;
}>;

/** What {@link createMcpViewerExport} needs from the server. */
export type McpViewerExportOptions = Readonly<{
  /** The runtime the registry's `export_model` uses for this project folder. */
  runtimeFor(root: string): Promise<ViewerExportRuntime>;
}>;

/** The page's export handlers, each given the project folder its call resolved to. */
export type McpViewerExport = Readonly<{
  formats(
    root: string,
    input: z.infer<typeof viewerExportFormatsInputSchema>,
    signal?: AbortSignal,
  ): Promise<ViewerExportFormatsResult | TauMcpViewerFailure>;
  save(
    root: string,
    input: z.infer<typeof viewerSaveExportInputSchema>,
  ): Promise<ViewerSaveExportResult | TauMcpViewerFailure>;
  readArtifact(
    root: string,
    input: z.infer<typeof viewerReadArtifactInputSchema>,
  ): Promise<TauViewerReadResult | TauMcpViewerFailure>;
}>;

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({
  errorCode,
  message,
});

/**
 * An absolute path under `base`, or `undefined` when it leaves it.
 *
 * @param base - The absolute folder the path must stay in.
 * @param path - Relative to `from`.
 * @param options - Where the path is relative to (default `base`), and whether `base` itself is admitted.
 * @returns The absolute path.
 */
const within = (
  base: string,
  path: string,
  { from = base, orSelf = false }: Readonly<{ from?: string; orSelf?: boolean }> = {},
): string | undefined => {
  if (isAbsolute(path)) {
    return undefined;
  }
  const absolute = resolvePath(from, path);
  const fromBase = relative(base, absolute);
  if (fromBase === '') {
    return orSelf ? absolute : undefined;
  }
  return fromBase.startsWith('..') || isAbsolute(fromBase) ? undefined : absolute;
};

const posix = (path: string): string => path.split(sep).join('/');

const routeRank = (route: ViewerExportRoute): number =>
  (route.fidelity === 'brep' ? 0 : 2) + (route.transcoderId === undefined ? 0 : 1);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The formats one kernel offers, each reduced to its best route (BREP before mesh, direct before transcoded), sorted
 * by format: the list the Tau app derives from the same manifest in the browser.
 *
 * @param routes - The runtime's export routes.
 * @param kernelId - The entry's kernel.
 * @returns One entry per format the kernel reaches, sorted by format name.
 */
export const listKernelExportFormats = (
  routes: readonly ViewerExportRoute[],
  kernelId: string,
): ViewerExportFormat[] => {
  const best = new Map<string, ViewerExportRoute>();
  for (const route of routes) {
    if (route.kernelId !== kernelId) {
      continue;
    }
    const current = best.get(route.targetFormat);
    if (current === undefined || routeRank(route) < routeRank(current)) {
      best.set(route.targetFormat, route);
    }
  }
  return [...best.values()]
    .map((route): ViewerExportFormat => {
      const { schema, defaults } = route.exportOptions;
      return {
        format: route.targetFormat,
        fidelity: route.fidelity,
        direct: route.transcoderId === undefined,
        provider: route.transcoderId === undefined ? route.kernelId : `${route.kernelId}+${route.transcoderId}`,
        ...(Object.keys(schema).length > 0
          ? {
              exportOptions: {
                schema: { ...schema },
                defaults: isRecord(defaults) ? { ...defaults } : {},
              },
            }
          : {}),
      };
    })
    .toSorted((left, right) => left.format.localeCompare(right.format));
};

/**
 * Create the page's export handlers.
 *
 * @param options - How to reach the project's runtime.
 * @returns The handlers.
 */
export const createMcpViewerExport = (options: McpViewerExportOptions): McpViewerExport => ({
  async formats(root, { targetFile }, signal) {
    if (within(root, targetFile) === undefined) {
      return failure('PATH_OUTSIDE_PROJECT', `${targetFile} is outside the project ${root}.`);
    }
    try {
      const runtime = await options.runtimeFor(root);
      await runtime.connect();
      const { kernelId } = await runtime.describe({
        source: { path: targetFile },
        ...(signal ? { signal } : {}),
      });
      if (kernelId === undefined) {
        return failure('NO_KERNEL', `No kernel exports ${targetFile}.`);
      }
      return {
        kernelId,
        formats: listKernelExportFormats(runtime.capabilities?.routes ?? [], kernelId),
      };
    } catch (error) {
      return failure('FORMATS_UNAVAILABLE', error instanceof Error ? error.message : String(error));
    }
  },

  async save(root, { directory, files }) {
    const folder = within(resolvePath(root, exportsFolder), directory, {
      from: root,
      orSelf: true,
    });
    if (folder === undefined) {
      return failure('PATH_OUTSIDE_EXPORTS', `${directory} is not under ${exportsFolder}/.`);
    }
    const copies: Array<{ from: string; to: string }> = [];
    for (const { artifactPath, name } of files) {
      const from = within(resolvePath(root, artifactsFolder), artifactPath, {
        from: root,
      });
      if (from === undefined) {
        return failure('NOT_AN_ARTIFACT', `${artifactPath} is not under ${artifactsFolder}/.`);
      }
      const to = within(folder, name);
      if (to === undefined) {
        return failure('PATH_OUTSIDE_EXPORTS', `${name} leaves ${directory}.`);
      }
      copies.push({ from, to });
    }
    const saved: Array<{ path: string; byteLength: number }> = [];
    try {
      for (const { from, to } of copies) {
        // oxlint-disable-next-line no-await-in-loop -- one file at a time, so a failure names the file it stopped at.
        await mkdir(dirname(to), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await copyFile(from, to);
        // oxlint-disable-next-line no-await-in-loop -- as above.
        const { size } = await stat(to);
        saved.push({ path: posix(relative(root, to)), byteLength: size });
      }
    } catch (error) {
      return failure('SAVE_FAILED', error instanceof Error ? error.message : String(error));
    }
    return { files: saved };
  },

  async readArtifact(root, { artifactPath, offset, length }) {
    const absolutePath = within(resolvePath(root, artifactsFolder), artifactPath, { from: root });
    if (absolutePath === undefined) {
      return failure('NOT_AN_ARTIFACT', `${artifactPath} is not under ${artifactsFolder}/.`);
    }
    const stats = await stat(absolutePath).catch(() => undefined);
    if (stats?.isFile() !== true) {
      return failure('NOT_FOUND', `${artifactPath} does not exist.`);
    }
    const result = await readModelRange({
      absolutePath,
      identity: { size: stats.size, mtimeMs: stats.mtimeMs, ino: stats.ino },
      offset,
      length: Math.min(length, tauViewerReadLimit),
    });
    return 'refused' in result ? failure('ARTIFACT_CHANGED', `${artifactPath} changed while it was read.`) : result;
  },
});
