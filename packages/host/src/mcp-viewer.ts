/**
 * The host half of the viewer `tau mcp` serves (agent plugin UI blueprint W4).
 *
 * `@taucad/mcp` registers the page and its tools; this module renders the
 * model a tool names into a GLB under `.tau/artifacts` (the runtime already
 * owns that path through `export_model`), hands out opaque handles the page
 * reads in ranges, and runs the loopback server a text host links to.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, extname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';

import { tauViewerPageInputSchemas } from '@taucad/mcp';
import type {
  TauMcpHostCall,
  TauMcpViewer,
  TauMcpViewerCallOptions,
  TauMcpViewerFailure,
  TauMcpViewerPageTool,
} from '@taucad/mcp';
import { tauViewerReadLimit, tauViewerToolName } from '@taucad/mcp/viewer-protocol';

import { readModelRange, snapshotModelFile } from '#mcp-viewer-read.js';
import type { ModelFileIdentity } from '#mcp-viewer-read.js';
import { createMcpViewerSessions } from '#mcp-viewer-sessions.js';
import { createDirectShare, createOpenInTauLink } from '#mcp-viewer-share.js';
import type { SourceSnapshotter } from '#mcp-viewer-share.js';
import {
  viewerExportFormatsInputSchema,
  viewerExportToolName,
  viewerReadArtifactInputSchema,
  viewerSaveExportInputSchema,
} from '#mcp-viewer-export.js';
import type { McpViewerExport } from '#mcp-viewer-export.js';
import type { McpViewerSessionsOptions } from '#mcp-viewer-sessions.js';
import { createMcpViewerWorkbench } from '#mcp-viewer-workbench.js';
import type { McpViewerWorkbenchOptions } from '#mcp-viewer-workbench.js';
import type {
  TauViewerFile,
  TauViewerMechanism,
  TauViewerMimeType,
  TauViewerModel,
  TauViewerShowResult,
} from '@taucad/mcp/viewer-protocol';
import { readGlbMechanism } from '@taucad/agent-tools/runtime';

/** The page's own formats by extension; every other file is a CAD source the runtime renders (blueprint D3). */
const drawnFormats: Readonly<Record<string, TauViewerMimeType>> = {
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
};

/**
 * Extensions `browse_models` lists as CAD sources, and the exchange formats the runtime converts to GLB like a
 * source (W7: the BRep kernel imports STEP, the mesh importer STL, 3MF and OBJ).
 */
const sourceExtensions = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.jsx',
  '.tsx',
  '.scad',
  '.py',
  '.kcl',
  '.step',
  '.stp',
  '.stl',
  '.3mf',
  '.obj',
]);

/** Folders `browse_models` never enters. */
const skippedFolders = new Set(['node_modules', '.git', '.tau', 'dist', 'build', 'out', '.venv', '__pycache__']);

/** Files `browse_models` lists at most, so a large checkout answers quickly. */
const browseLimit = 200;

/** Folders deep `browse_models` looks. */
const browseDepth = 6;

/** Tool calls whose conversation the server remembers for the pages they open. */
const rememberedCalls = 1024;

/**
 * The conversation a call belongs to, when the host names one: Codex puts the thread in every call's `_meta.threadId`.
 *
 * @param meta - The request's `_meta`.
 * @returns The conversation, or `undefined` (the process scope).
 */
const conversationOf = (meta: Readonly<Record<string, unknown>> | undefined): string | undefined => {
  const threadId = meta?.['threadId'];
  return typeof threadId === 'string' && threadId !== '' ? threadId : undefined;
};

/** What {@link createLocalMcpViewer} needs from the server that hosts it. */
export type LocalMcpViewerOptions = Readonly<{
  /** The single-file page and its digest. */
  page: Readonly<{ html: string; sha256: string }>;
  /** Timing of the live link to the pages; tests shorten it. */
  sessions?: McpViewerSessionsOptions;
  /** How the pages' camera and component display are kept in `.tau/workbench`; tests shorten it. */
  workbench?: McpViewerWorkbenchOptions;
  /**
   * The runtime's source closure of an entry, for the Share pane's direct link; without it the link packs every
   * project file git does not ignore.
   */
  snapshotSource?: SourceSnapshotter | undefined;
  /** The Export pane's handlers; without them the page offers no Export pane tools. */
  export?: McpViewerExport | undefined;
  /** The project folder one call works in. */
  rootOf(meta: Readonly<Record<string, unknown>> | undefined): string;
  /**
   * Render one CAD source to GLB under `.tau/artifacts` through the registry's `export_model`, with its CAD topology
   * wherever the route carries it, so the page can show the components and the mechanism.
   *
   * @returns The project-relative artifact path, or a failure.
   */
  renderGlb(
    input: Readonly<{ root: string; targetFile: string; toolCallId: string; signal?: AbortSignal | undefined }>,
  ): Promise<string | TauMcpViewerFailure>;
  /**
   * Run one of the host tools the loopback page may call ({@link loopbackHostTools}) in a project, answering what
   * `tools/call` would put in `structuredContent`. Without it the loopback page has no workbench panes that need one.
   */
  hostCall?(
    input: Readonly<{ root: string; call: TauMcpHostCall; signal: AbortSignal }>,
  ): Promise<Readonly<Record<string, unknown>> | TauMcpViewerFailure>;
}>;

/**
 * The host tools the loopback page's workbench panes call, as an MCP App page reaches them through `tools/call`
 * (viewer parity V8). Each runs in the project of the model the page's link names.
 */
export const loopbackHostTools: ReadonlySet<string> = new Set([
  'get_parameters',
  'apply_parameter_operation',
  'export_model',
]);

/** A viewer port plus the loopback server it may have started. */
export type LocalMcpViewer = TauMcpViewer &
  Readonly<{
    /** Stop the loopback server, if one runs. */
    close(): Promise<void>;
  }>;

/**
 * One model a tool showed, under the id its link and its reads name. The
 * entry is the single record of what was shown and for which project: the
 * loopback page asks for it by id and never resolves a folder of its own.
 */
type Shown = Readonly<{ model: TauViewerModel; absolutePath: string; root: string; identity: ModelFileIdentity }>;

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({ errorCode, message });

const isFailure = (value: unknown): value is TauMcpViewerFailure =>
  typeof value === 'object' && value !== null && 'errorCode' in value;

/**
 * A path inside `root`, or `undefined` when it leaves it.
 *
 * @param root - The project folder.
 * @param path - Project-relative or absolute.
 * @returns The absolute path.
 */
const inside = (root: string, path: string): string | undefined => {
  const absolute = isAbsolute(path) ? resolvePath(path) : resolvePath(root, path);
  const fromRoot = relative(root, absolute);
  return fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot) ? undefined : absolute;
};

/** POSIX separators, as every project path on the wire uses. */
const posix = (path: string): string => path.split(sep).join('/');

/**
 * The entry file the project's `tau.json` names, if any.
 *
 * @param root - The project folder.
 * @returns Its project-relative path.
 */
const mainEntry = async (root: string): Promise<string | undefined> => {
  try {
    const manifest: unknown = JSON.parse(await readFile(join(root, 'tau.json'), 'utf8'));
    const entryPath =
      typeof manifest === 'object' && manifest !== null && 'assets' in manifest
        ? (manifest as Readonly<{ assets?: Readonly<{ main?: Readonly<{ entryPath?: unknown }> }> }>).assets?.main
            ?.entryPath
        : undefined;
    return typeof entryPath === 'string' && entryPath !== '' ? entryPath : undefined;
  } catch {
    return undefined;
  }
};

/**
 * List renderable files under `root`, shallowest first.
 *
 * @param root - The project folder.
 * @returns Up to {@link browseLimit} project-relative paths.
 */
const renderableFiles = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  let level = [root];
  for (let depth = 0; depth < browseDepth && level.length > 0 && found.length < browseLimit; depth += 1) {
    const next: string[] = [];
    for (const folder of level) {
      // ponytail: an unreadable folder lists nothing rather than failing the whole list.
      // oxlint-disable-next-line no-await-in-loop -- breadth-first and bounded: a level is read before the next.
      const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
      for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          if (!skippedFolders.has(entry.name) && !entry.name.startsWith('.')) {
            next.push(path);
          }
          continue;
        }
        const extension = extname(entry.name).toLowerCase();
        const isSource =
          sourceExtensions.has(extension) && !/\.(?:test|spec|d|config|geospec)\.[a-z]+$/u.test(entry.name);
        if (entry.isFile() && (isSource || extension in drawnFormats)) {
          found.push(posix(relative(root, path)));
          if (found.length >= browseLimit) {
            return found;
          }
        }
      }
    }
    level = next;
  }
  return found;
};

/** Where `export_model` writes a source's GLB: `.tau/artifacts/<toolCallId>__<stem>.glb`. */
const artifactsFolder = '.tau/artifacts/';

/**
 * The source a GLB was exported from, when the project says so plainly: a source beside it with the same name, or,
 * for an export under `.tau/artifacts`, the one renderable source in the project with that name. A GLB that matches
 * no source, or several, has none: it is shown as itself, without parameters.
 *
 * @param root - The project folder.
 * @param glbPath - The GLB's project-relative path.
 * @returns The source's project-relative path.
 */
const exportedSourceOf = async (root: string, glbPath: string): Promise<string | undefined> => {
  const stem = basename(glbPath, extname(glbPath));
  const isExport = glbPath.startsWith(artifactsFolder);
  const wanted = isExport ? stem.replace(/^.*__/u, '') : stem;
  const folder = isExport ? undefined : posix(join(glbPath, '..'));
  const files = await renderableFiles(root);
  const candidates = files.filter(
    (path) =>
      sourceExtensions.has(extname(path).toLowerCase()) &&
      basename(path, extname(path)) === wanted &&
      (folder === undefined || posix(join(path, '..')) === folder),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
};

/** The title a file shows under: its name without the extension. */
const titleOf = (path: string): string => basename(path, extname(path));

/**
 * Compare two secrets without leaking their common prefix through timing.
 *
 * @param expected - The secret.
 * @param actual - What the caller sent.
 * @returns Whether they match.
 */
const sameSecret = (expected: string, actual: string): boolean => {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Request bodies the loopback API accepts at most. */
/** Bytes; a capture of the live view is the largest body the page sends (base64, under 8 MiB). */
const loopbackBodyLimit = 12 * 1024 * 1024;

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > loopbackBodyLimit) {
      throw new Error('Request body too large.');
    }
    chunks.push(new Uint8Array(buffer));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

/**
 * The loopback page's response headers: the same no-origin policy a host
 * sandbox applies (blueprint I2), plus `connect-src 'self'` for the API the
 * page reaches its tools through.
 */
const pageHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'self' data: blob:",
    'worker-src blob:',
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

/**
 * What a GLB carries of its source's mechanism: the page's Kinematics pane plays only what the GLB holds.
 *
 * @param bytes - The GLB.
 * @returns Whether a mechanism survived, its joint count and its animation ids.
 */
const mechanismOf = (bytes: Uint8Array<ArrayBuffer>): TauViewerMechanism => {
  const carried = readGlbMechanism(bytes)?.mechanism;
  return {
    preserved: carried !== undefined,
    joints: carried?.joints ?? 0,
    animations: [...(carried?.animations ?? [])],
  };
};

/**
 * Create the viewer port `serveLocalHostMcp` hands to `@taucad/mcp`.
 *
 * @param options - The page, how to find the project folder, and how to render a source.
 * @returns The port and its cleanup.
 */
export const createLocalMcpViewer = (options: LocalMcpViewerOptions): LocalMcpViewer => {
  const shown = new Map<string, Shown>();
  /** The source of each GLB this server rendered, by the GLB's absolute path. */
  const renderedFrom = new Map<string, string>();
  /** The model shown last per project folder and conversation. */
  const lastShown = new Map<string, string>();
  const lastShownKey = (root: string, scope: string | undefined): string =>
    scope === undefined ? root : `${root}\0${scope}`;
  /** The conversation of each show call, for a page that names the call it was opened with. */
  const conversationByCall = new Map<string, string>();
  const token = randomBytes(24).toString('base64url');
  const sessions = createMcpViewerSessions(options.sessions);
  const workbench = createMcpViewerWorkbench(options.workbench);
  let loopback: Promise<{ server: Server; origin: string }> | undefined;

  const describe = async (
    root: string,
    absolutePath: string,
    sourceFile: string | undefined,
  ): Promise<Pick<TauViewerShowResult, 'model' | 'mechanism'> | TauMcpViewerFailure> => {
    const mimeType = drawnFormats[extname(absolutePath).toLowerCase()];
    if (mimeType === undefined) {
      return failure(
        'UNSUPPORTED_FORMAT',
        `The Tau viewer draws GLB and SVG; ${posix(relative(root, absolutePath))} is neither.`,
      );
    }
    const snapshot = await snapshotModelFile(absolutePath);
    if (snapshot === undefined) {
      return failure('NOT_FOUND', `${posix(relative(root, absolutePath))} could not be read.`);
    }
    const { bytes, identity } = snapshot;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const id = createHash('sha256').update(`${absolutePath}\0${sha256}`).digest('base64url').slice(0, 22);
    const path = posix(relative(root, absolutePath));
    const model: TauViewerModel = {
      id,
      title: titleOf(sourceFile ?? path),
      path,
      ...(sourceFile === undefined ? {} : { sourceFile }),
      mimeType,
      byteLength: bytes.length,
      sha256,
    };
    shown.set(id, { model, absolutePath, root, identity });
    return mimeType === 'model/gltf-binary' ? { model, mechanism: mechanismOf(bytes) } : { model };
  };

  const startLoopback = async (): Promise<{ server: Server; origin: string }> => {
    const server = createServer((request, response) => {
      void handleLoopback(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    server.unref();
    const { port } = server.address() as AddressInfo;
    return { server, origin: `http://127.0.0.1:${String(port)}` };
  };

  /* A text host gets a link; when the loopback server cannot start, the model
   * is still shown without one, and the next text show tries again. */
  const viewerUrl = async (model: TauViewerModel, presentation: TauMcpViewerCallOptions['presentation']) => {
    if (presentation !== 'text') {
      return undefined;
    }
    loopback ??= startLoopback();
    const starting = loopback;
    try {
      const { origin } = await starting;
      return `${origin}/?model=${encodeURIComponent(model.id)}#${token}`;
    } catch {
      if (loopback === starting) {
        loopback = undefined;
      }
      return undefined;
    }
  };

  const showPath = async (
    root: string,
    { path, select }: Readonly<{ path: string; select?: readonly string[] | undefined }>,
    callOptions: TauMcpViewerCallOptions,
  ): Promise<TauViewerShowResult | TauMcpViewerFailure> => {
    const absolute = inside(root, path);
    if (absolute === undefined) {
      return failure('PATH_OUTSIDE_PROJECT', `${path} is outside the project ${root}.`);
    }
    const relativePath = posix(relative(root, absolute));
    const isDrawn = extname(absolute).toLowerCase() in drawnFormats;
    let described: Pick<TauViewerShowResult, 'model' | 'mechanism'> | TauMcpViewerFailure;
    if (isDrawn) {
      /* A GLB the agent exported still has its source's parameters, kinematics and exports (viewer parity V8). */
      const sourceFile =
        extname(absolute).toLowerCase() === '.glb'
          ? (renderedFrom.get(absolute) ?? (await exportedSourceOf(root, relativePath)))
          : undefined;
      described = await describe(root, absolute, sourceFile);
    } else {
      const exists = await stat(absolute).then(
        (stats) => stats.isFile(),
        () => false,
      );
      if (!exists) {
        return failure('NOT_FOUND', `${relativePath} does not exist in ${root}.`);
      }
      const artifact = await options.renderGlb({
        root,
        targetFile: relativePath,
        toolCallId: callOptions.toolCallId,
        signal: callOptions.signal,
      });
      if (isFailure(artifact)) {
        return artifact;
      }
      const artifactPath = inside(root, artifact);
      if (artifactPath !== undefined) {
        renderedFrom.set(artifactPath, relativePath);
      }
      described =
        artifactPath === undefined
          ? failure('RENDER_FAILED', `The rendered model for ${relativePath} landed outside the project.`)
          : await describe(root, artifactPath, relativePath);
    }
    if (isFailure(described)) {
      return described;
    }
    const { model } = described;
    const scope = conversationOf(callOptions.meta);
    lastShown.set(lastShownKey(root, scope), model.sourceFile ?? model.path);
    if (scope !== undefined) {
      conversationByCall.set(callOptions.toolCallId, scope);
      for (const call of conversationByCall.keys()) {
        if (conversationByCall.size <= rememberedCalls) {
          break;
        }
        conversationByCall.delete(call);
      }
    }
    const url = await viewerUrl(model, callOptions.presentation);
    const result: TauViewerShowResult = {
      model,
      ...(described.mechanism === undefined ? {} : { mechanism: described.mechanism }),
      ...(url === undefined ? {} : { viewerUrl: url }),
      ...(select === undefined || select.length === 0 ? {} : { select }),
    };
    sessions.shown(result, scope);
    return result;
  };

  const browseIn = async (root: string): Promise<{ files: TauViewerFile[] }> => {
    const main = await mainEntry(root);
    const paths = await renderableFiles(root);
    const ordered =
      main !== undefined && paths.includes(main) ? [main, ...paths.filter((path) => path !== main)] : paths;
    return { files: ordered.map((path) => ({ path, title: titleOf(path) })) };
  };

  /** The Export pane's tools, each run in the project folder its call resolves to. */
  const exportTools = (
    handlers: McpViewerExport,
  ): Array<
    Readonly<{
      tool: TauMcpViewerPageTool;
      inRoot: (root: string, args: unknown, signal?: AbortSignal) => Promise<unknown>;
    }>
  > => {
    const formats = async (root: string, args: unknown, signal?: AbortSignal) =>
      handlers.formats(root, viewerExportFormatsInputSchema.parse(args), signal);
    const save = async (root: string, args: unknown) => handlers.save(root, viewerSaveExportInputSchema.parse(args));
    const readArtifact = async (root: string, args: unknown) =>
      handlers.readArtifact(root, viewerReadArtifactInputSchema.parse(args));
    const tool = ({
      name,
      description,
      inputSchema,
      inRoot,
    }: Readonly<{
      name: string;
      description: string;
      inputSchema: TauMcpViewerPageTool['inputSchema'];
      inRoot: (root: string, args: unknown, signal?: AbortSignal) => Promise<unknown>;
    }>) => ({
      inRoot,
      tool: {
        name,
        description,
        inputSchema,
        call: async (args: Readonly<Record<string, unknown>>, callOptions: TauMcpViewerCallOptions) =>
          (await inRoot(options.rootOf(callOptions.meta), args, callOptions.signal)) as
            | Readonly<Record<string, unknown>>
            | TauMcpViewerFailure,
      },
    });
    return [
      tool({
        name: viewerExportToolName.formats,
        description:
          "The formats the Tau viewer page's Export pane offers for an entry, with their options. Only the viewer page calls this.",
        inputSchema: viewerExportFormatsInputSchema,
        inRoot: formats,
      }),
      tool({
        name: viewerExportToolName.save,
        description:
          "Copy files export_model wrote into the project's exports folder, for the Tau viewer page's Export pane. Only the viewer page calls this.",
        inputSchema: viewerSaveExportInputSchema,
        inRoot: save,
      }),
      tool({
        name: viewerExportToolName.readArtifact,
        description:
          "Read a byte range of a file export_model wrote, for the Tau viewer page's download. Only the viewer page calls this.",
        inputSchema: viewerReadArtifactInputSchema,
        inRoot: readArtifact,
      }),
    ];
  };
  const pageTools = options.export === undefined ? [] : exportTools(options.export);

  const port: LocalMcpViewer = {
    page: options.page,
    pageTools: pageTools.map(({ tool }) => tool),
    async show(input, callOptions) {
      const root = options.rootOf(callOptions.meta);
      const target =
        input.targetFile ??
        lastShown.get(lastShownKey(root, conversationOf(callOptions.meta))) ??
        (await mainEntry(root));
      if (target === undefined) {
        return failure(
          'NO_TARGET',
          `Name the file to show: ${root} has no model shown yet and its tau.json names no main entry.`,
        );
      }
      return showPath(root, { path: target, select: input.select }, callOptions);
    },
    async open(input, callOptions) {
      return showPath(options.rootOf(callOptions.meta), { path: input.path }, callOptions);
    },
    async browse(callOptions) {
      return browseIn(options.rootOf(callOptions.meta));
    },
    async read(input) {
      const entry = shown.get(input.modelId);
      if (entry === undefined) {
        return failure('UNKNOWN_MODEL', 'This model is no longer shown; show it again.');
      }
      const result = await readModelRange({
        absolutePath: entry.absolutePath,
        identity: entry.identity,
        offset: input.offset,
        length: Math.min(input.length, tauViewerReadLimit),
        encodings: input.encodings,
      });
      return 'refused' in result
        ? failure('MODEL_CHANGED', `${entry.model.path} changed since it was shown; show it again.`)
        : result;
    },
    async sync(input, callOptions) {
      /* Only a model this server showed names the project and entry a view is kept for; the page's own names do not. */
      const entry = input.view === undefined ? undefined : shown.get(input.view.model.id);
      if (input.view !== undefined && entry !== undefined) {
        const { model } = entry;
        workbench.report({
          root: entry.root,
          pageId: input.pageId,
          view: {
            ...input.view,
            model: { id: model.id, title: model.title, path: model.path, sourceFile: model.sourceFile },
          },
        });
      }
      /* A card names the show call it was opened with; that call's conversation is the page's. */
      const scope =
        conversationOf(callOptions.meta) ??
        (input.toolCallId === undefined ? undefined : conversationByCall.get(input.toolCallId));
      return sessions.sync(input, { scope, signal: callOptions.signal });
    },
    async viewState(input, callOptions) {
      return sessions.viewState(input, { scope: conversationOf(callOptions.meta), signal: callOptions.signal });
    },
    async captureReply(input) {
      return sessions.captureReply(input);
    },
    async shareLink(input, callOptions) {
      const entry = shown.get(input.modelId);
      return entry === undefined
        ? failure('UNKNOWN_MODEL', 'This model is no longer shown; show it again.')
        : input.kind === 'github'
          ? createOpenInTauLink({ root: entry.root, entryPath: entry.model.sourceFile ?? entry.model.path })
          : createDirectShare({
              root: entry.root,
              entryPath: entry.model.sourceFile ?? entry.model.path,
              snapshotSource: options.snapshotSource,
              signal: callOptions.signal,
            });
    },
    async close() {
      sessions.close();
      await workbench.close();
      const running = loopback;
      loopback = undefined;
      /* A start that failed left nothing to stop. */
      const server = await running?.then(
        (started) => started.server,
        () => undefined,
      );
      if (server !== undefined) {
        await new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
          server.closeAllConnections();
        });
      }
    },
  };

  /* The loopback API runs the same port functions a host would reach through
   * `tools/call`, for the page served at `/`. The token rides the URL fragment,
   * which the browser never sends, and the page returns it in a header.
   * `show_model` here answers the model the link names, as it was shown: the
   * page's call carries no host `_meta`, so it cannot name a project folder
   * (the server's start folder is not the conversation's project), and the
   * model was already rendered. */
  const loopbackCall = { toolCallId: 'loopback', presentation: 'text' } as const;
  const linkedModel = (args: unknown): Shown | undefined => {
    const modelId = typeof args === 'object' && args !== null ? (args as { modelId?: unknown }).modelId : undefined;
    return typeof modelId === 'string' ? shown.get(modelId) : undefined;
  };
  const unlinked = (): TauMcpViewerFailure =>
    failure('UNKNOWN_MODEL', 'This link names no model this session showed; show it again.');

  type LoopbackTool = (args: unknown, signal: AbortSignal, link: Shown | undefined) => Promise<unknown>;
  const hostTool =
    (toolName: string): LoopbackTool =>
    async (args, signal, link) => {
      if (link === undefined) {
        return unlinked();
      }
      if (options.hostCall === undefined) {
        return failure('TOOL_NOT_ALLOWED', `${toolName} is not served to this page.`);
      }
      /* The page names its link's model on the loopback page; the tools themselves take no such argument. */
      const { modelId: _modelId, ...input } =
        typeof args === 'object' && args !== null ? (args as Readonly<Record<string, unknown>>) : {};
      return options.hostCall({ root: link.root, call: { toolName, args: input }, signal });
    };

  const loopbackTools: Readonly<Record<string, LoopbackTool>> = {
    ...Object.fromEntries([...loopbackHostTools].map((name) => [name, hostTool(name)])),
    ...Object.fromEntries(
      pageTools.map(({ tool, inRoot }): [string, LoopbackTool] => [
        tool.name,
        async (args, signal, link) => (link === undefined ? unlinked() : inRoot(link.root, args, signal)),
      ]),
    ),
    [tauViewerToolName.appRead]: async (args) => port.read(tauViewerPageInputSchemas.appRead.parse(args), loopbackCall),
    [tauViewerToolName.showModel]: async (args, signal, link) => {
      /* A pane that wrote a parameter asks for the linked model's source again: render it in the linked project. */
      const targetFile =
        typeof args === 'object' && args !== null ? (args as { targetFile?: unknown }).targetFile : undefined;
      if (typeof targetFile === 'string' && link !== undefined) {
        return showPath(link.root, { path: targetFile }, { ...loopbackCall, signal });
      }
      const entry = linkedModel(args);
      return entry === undefined ? unlinked() : { model: entry.model };
    },
    /* Files of the project the linked model came from. */
    [tauViewerToolName.browseModels]: async (args) => {
      const entry = linkedModel(args);
      return entry === undefined ? unlinked() : browseIn(entry.root);
    },
    [tauViewerToolName.appSync]: async (args, signal) =>
      port.sync(tauViewerPageInputSchemas.appSync.parse(args), { ...loopbackCall, signal }),
    [tauViewerToolName.appCaptureReply]: async (args) =>
      port.captureReply(tauViewerPageInputSchemas.appCaptureReply.parse(args), loopbackCall),
    [tauViewerToolName.appShareLink]: async (args) =>
      port.shareLink?.(tauViewerPageInputSchemas.appShareLink.parse(args), loopbackCall),
  };

  const handleLoopback = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    /* Only a page this server served may call it: a rebound DNS name reaches
     * the same socket under another Host. */
    if (!/^127\.0\.0\.1:\d+$/u.test(request.headers.host ?? '')) {
      response.writeHead(421, { 'content-type': 'text/plain' }).end('Misdirected request');
      return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, pageHeaders).end(options.page.html);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/tools/call') {
      const sent = request.headers['x-tau-viewer-token'];
      if (typeof sent !== 'string' || !sameSecret(token, sent)) {
        response.writeHead(403, { 'content-type': 'application/json' }).end('{"errorCode":"FORBIDDEN"}');
        return;
      }
      try {
        const body = await readBody(request);
        const call = typeof body === 'object' && body !== null ? (body as { name?: unknown; arguments?: unknown }) : {};
        const tool = typeof call.name === 'string' ? loopbackTools[call.name] : undefined;
        if (tool === undefined) {
          response.writeHead(404, { 'content-type': 'application/json' }).end('{"errorCode":"UNKNOWN_TOOL"}');
          return;
        }
        // A page that goes away mid-poll closes its request; the held sync answers at once.
        const closedByPage = new AbortController();
        response.once('close', () => {
          closedByPage.abort();
        });
        /* The page names the model its link opened on; that model's project is where its panes' tools run. */
        const linkedId = request.headers['x-tau-viewer-model'];
        const link = typeof linkedId === 'string' ? shown.get(linkedId) : undefined;
        const result = await tool(call.arguments ?? {}, closedByPage.signal, link);
        response
          .writeHead(isFailure(result) ? 422 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          .end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            errorCode: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  };

  return port;
};
