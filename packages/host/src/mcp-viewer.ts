/**
 * The host half of the viewer `tau mcp` serves (agent plugin UI blueprint W4).
 *
 * `@taucad/mcp` registers the page and its tools; this module shows the model a tool names: a GLB or SVG as it is,
 * and a CAD source through one watched runtime document (`mcp-entry-sessions.ts`), whose renders stay in memory and
 * reach every page showing the source whenever its files or parameters change. It hands out opaque handles the page
 * reads in ranges, and runs the loopback server a text host links to.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
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

import { createMcpEntrySessions } from '#mcp-entry-sessions.js';
import type { EntryRender, EntrySession, EntrySessionRuntime } from '#mcp-entry-sessions.js';
import { readBytesRange, readModelRange, snapshotModelFile } from '#mcp-viewer-read.js';
import type { ModelFileIdentity } from '#mcp-viewer-read.js';
import { createMcpViewerSessions } from '#mcp-viewer-sessions.js';
import { createDirectShare } from '#mcp-viewer-share.js';
import { createMcpViewerFiles, drawnFormats, isOpenablePath, isSourcePath } from '#mcp-viewer-files.js';
import type { McpViewerFilesOptions } from '#mcp-viewer-files.js';
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
import type { TauViewerMechanism, TauViewerModel, TauViewerShowResult } from '@taucad/mcp/viewer-protocol';
import { readGlbMechanism } from '@taucad/agent-tools/runtime';
import { slugifyTargetFile } from '@taucad/chat/rpc';

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
  /** How long the Files pane's change notice waits for the next change; tests shorten it. */
  files?: McpViewerFilesOptions;
  /** The runtime's source closure of an entry, for the Share pane's direct link; without it the page offers none. */
  snapshotSource?: SourceSnapshotter | undefined;
  /** The Export pane's handlers; without them the page offers no Export pane tools. */
  export?: McpViewerExport | undefined;
  /** The folder a call works in when it names none and its conversation has shown no model: the server's start folder. */
  workspaceRoot: string;
  /**
   * The project runtime a shown CAD source is watched in: one document per source, rendered with its CAD topology,
   * kept in memory. Without it, `show_model` draws GLB and SVG files only.
   */
  liveRuntime?: ((root: string) => Promise<EntrySessionRuntime>) | undefined;
  /**
   * The project folder one call names, if any: Codex's thread folder on the agent's own calls, or the launcher's pin.
   */
  namedRoot(meta: Readonly<Record<string, unknown>> | undefined): string | undefined;
  /**
   * Run one of the host tools the loopback page may call ({@link loopbackHostTools}) in a project, answering what
   * `tools/call` would put in `structuredContent`. Without it the loopback page has no workbench panes that need one.
   */
  hostCall?(
    input: Readonly<{
      root: string;
      call: TauMcpHostCall;
      signal: AbortSignal;
    }>,
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
  Required<Pick<TauMcpViewer, 'listFiles' | 'openFile'>> &
  Readonly<{
    /**
     * The project folder one call works in: the folder it names, else the project of the model its conversation
     * showed last, else the server's start folder. Codex names the folder only on the agent's own calls; a call the
     * viewer page makes through the host carries the conversation alone.
     */
    rootOf(meta: Readonly<Record<string, unknown>> | undefined): string;
    /** Stop the loopback server, if one runs. */
    close(): Promise<void>;
  }>;

/**
 * One model a tool showed, under the id its link and its reads name. The
 * entry is the single record of what was shown and for which project: the
 * loopback page asks for it by id and never resolves a folder of its own.
 * A drawn file is read from the project; a watched source's render from its session's memory.
 */
type Shown = Readonly<
  { model: TauViewerModel; root: string } & (
    | { kind: 'file'; absolutePath: string; identity: ModelFileIdentity }
    | { kind: 'render'; session: EntrySession }
  )
>;

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({
  errorCode,
  message,
});

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
        ? (
            manifest as Readonly<{
              assets?: Readonly<{ main?: Readonly<{ entryPath?: unknown }> }>;
            }>
          ).assets?.main?.entryPath
        : undefined;
    return typeof entryPath === 'string' && entryPath !== '' ? entryPath : undefined;
  } catch {
    return undefined;
  }
};

/** Where `export_model` writes each export: `.tau/artifacts/<toolCallId>__<slugged targetFile>-<format>/<file>`. */
const artifactsFolder = '.tau/artifacts/';

/**
 * Whether an export folder under `.tau/artifacts` was written for a source, by the name `writeArtifactSet` gave it.
 *
 * @param folder - The export's folder name.
 * @param source - A project-relative source path.
 * @returns `true` when the folder ends with that source's slug and a format.
 */
const isExportFolderOf = (folder: string, source: string): boolean => {
  const marker = `__${slugifyTargetFile(source)}-`;
  const at = folder.lastIndexOf(marker);
  return at > 0 && /^[^_]+$/u.test(folder.slice(at + marker.length));
};

/**
 * The source a shown file was exported from, when the project says so plainly: for an export under
 * `.tau/artifacts`, the one CAD source its folder was named for; otherwise, for a GLB, a source beside it with the
 * same name. A file that matches no source, or several, has none.
 *
 * @param listed - Every project-relative path the project's listing names.
 * @param path - The shown file's project-relative path.
 * @returns The source's project-relative path.
 */
const exportedSourceOf = (listed: readonly string[], path: string): string | undefined => {
  const isExport = path.startsWith(artifactsFolder);
  if (!isExport && extname(path).toLowerCase() !== '.glb') {
    return undefined;
  }
  const folder = isExport ? path.slice(artifactsFolder.length).split('/')[0]! : posix(join(path, '..'));
  const stem = basename(path, extname(path));
  const candidates = listed.filter(
    (source) =>
      isSourcePath(source) &&
      source !== path &&
      (isExport
        ? isExportFolderOf(folder, source)
        : basename(source, extname(source)) === stem && posix(join(source, '..')) === folder),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
};

/**
 * What `show_model` tells the agent about a shown export: the viewer draws that file only, and its source is what
 * carries the current parameters and mechanism (LRP-10, D6).
 *
 * @param path - The shown file's project-relative path.
 * @param source - The source it was exported from.
 * @returns One sentence.
 */
const exportHint = (path: string, source: string): string =>
  `${path} is an export of ${source}, drawn as exported. Call show_model with targetFile ${source} to show the source with its parameters and mechanism.`;

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
  /** The model shown last per project folder and conversation. */
  const lastShown = new Map<string, string>();
  const lastShownKey = (root: string, scope: string | undefined): string =>
    scope === undefined ? root : `${root}\0${scope}`;
  /** The conversation of each show call, for a page that names the call it was opened with. */
  const conversationByCall = new Map<string, string>();
  /** The project of the model each conversation showed last, for the calls its pages make. */
  const conversationRoot = new Map<string, string>();
  const rootOf = (meta: Readonly<Record<string, unknown>> | undefined): string => {
    const scope = conversationOf(meta);
    return (
      options.namedRoot(meta) ??
      (scope === undefined ? undefined : conversationRoot.get(scope)) ??
      options.workspaceRoot
    );
  };
  /** The shown model a page's call names by `modelId`; its project is where the call runs. */
  const linkedModel = (args: unknown): Shown | undefined => {
    const modelId = typeof args === 'object' && args !== null ? (args as { modelId?: unknown }).modelId : undefined;
    return typeof modelId === 'string' ? shown.get(modelId) : undefined;
  };
  const token = randomBytes(24).toString('base64url');
  const sessions = createMcpViewerSessions(options.sessions);
  const workbench = createMcpViewerWorkbench(options.workbench);
  const files = createMcpViewerFiles(options.files);
  /** The `filesVersion` each page heard last, so a change between two syncs answers the next at once. */
  const filesHeard = new Map<string, number>();
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
    shown.set(id, { kind: 'file', model, absolutePath, root, identity });
    return mimeType === 'model/gltf-binary' ? { model, mechanism: mechanismOf(bytes) } : { model };
  };

  /** A watched source's render as the page shows it: the source's path, the render's bytes, kept in memory. */
  const describeRender = (
    session: EntrySession,
    render: EntryRender,
  ): Pick<TauViewerShowResult, 'model' | 'mechanism'> => {
    const model: TauViewerModel = {
      id: render.id,
      title: titleOf(session.entryPath),
      path: session.entryPath,
      sourceFile: session.entryPath,
      mimeType: render.mimeType,
      byteLength: render.bytes.length,
      sha256: render.sha256,
      ...(render.sourceRevision === undefined ? {} : { sourceRevision: render.sourceRevision }),
      ...(render.issues.length === 0 ? {} : { issues: render.issues }),
    };
    shown.set(model.id, { kind: 'render', model, root: session.root, session });
    return render.mimeType === 'model/gltf-binary' ? { model, mechanism: mechanismOf(render.bytes) } : { model };
  };

  /* A watched source rendered again or changed status: the pages showing it hear of it through `app_sync`. */
  const entrySessions =
    options.liveRuntime === undefined
      ? undefined
      : createMcpEntrySessions({
          runtimeFor: options.liveRuntime,
          onEvent: (session, event) => {
            if (event.type === 'status') {
              sessions.status(session.key, session.entryPath, event.status);
              return;
            }
            sessions.rendered(session.key, describeRender(session, event.render));
          },
        });

  /**
   * Watch a source again. A source that cannot open leaves the page on its last render.
   *
   * @param root - The project folder.
   * @param entryPath - The source.
   */
  const reopen = async (root: string, entryPath: string): Promise<void> => {
    try {
      await entrySessions?.acquire({ root, entryPath });
    } catch {
      /* The next show reports why. */
    }
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

  /**
   * Render or locate one project file and describe it, touching nothing a page or the agent sees: what a show and a
   * page's own open share. A CAD source is rendered by its watched session, so every page showing it follows its edits.
   *
   * @param root - The project folder.
   * @param path - Project-relative or absolute path of the file.
   * @param callOptions - The call that asked; its signal stops the wait for the render.
   * @returns The described model, its mechanism, the source it was exported from and the watched session's key, or a
   *   failure.
   */
  const renderEntry = async (
    root: string,
    path: string,
    callOptions: Pick<TauMcpViewerCallOptions, 'signal'>,
  ): Promise<
    | (Pick<TauViewerShowResult, 'model' | 'mechanism'> &
        Readonly<{ relativePath: string; exportedFrom?: string; entry?: string }>)
    | TauMcpViewerFailure
  > => {
    const absolute = inside(root, path);
    if (absolute === undefined) {
      return failure('PATH_OUTSIDE_PROJECT', `${path} is outside the project ${root}.`);
    }
    const relativePath = posix(relative(root, absolute));
    const isDrawn = extname(absolute).toLowerCase() in drawnFormats;
    /* An export names its source, so the agent hears that the page draws the file as exported (LRP-10). */
    const exportedFrom = exportedSourceOf(await files.paths(root), relativePath);
    let described: Pick<TauViewerShowResult, 'model' | 'mechanism'> | TauMcpViewerFailure;
    let entry: string | undefined;
    if (isDrawn) {
      /* A GLB the agent exported still has its source's parameters, kinematics and exports (viewer parity V8). */
      const sourceFile = extname(absolute).toLowerCase() === '.glb' ? exportedFrom : undefined;
      described = await describe(root, absolute, sourceFile);
    } else {
      const exists = await stat(absolute).then(
        (stats) => stats.isFile(),
        () => false,
      );
      if (!exists) {
        return failure('NOT_FOUND', `${relativePath} does not exist in ${root}.`);
      }
      if (entrySessions === undefined) {
        return failure('RENDER_UNAVAILABLE', `This server has no runtime to render ${relativePath}.`);
      }
      /* One watched document per source: a second show of an unchanged source answers its newest render. */
      const session = await entrySessions.acquire({ root, entryPath: relativePath });
      const render = await session.settled(callOptions.signal);
      entry = session.key;
      described = isFailure(render) ? render : describeRender(session, render);
    }
    if (isFailure(described)) {
      return described;
    }
    return {
      ...described,
      relativePath,
      ...(exportedFrom === undefined ? {} : { exportedFrom }),
      ...(entry === undefined ? {} : { entry }),
    };
  };

  /** What a show result says about a rendered entry. */
  const resultOf = (
    rendered: Exclude<Awaited<ReturnType<typeof renderEntry>>, TauMcpViewerFailure>,
  ): TauViewerShowResult => ({
    model: rendered.model,
    ...(rendered.mechanism === undefined ? {} : { mechanism: rendered.mechanism }),
    ...(rendered.exportedFrom === undefined ? {} : { hint: exportHint(rendered.relativePath, rendered.exportedFrom) }),
  });

  /**
   * A page's `app_sync`, answered early when the files of the page's project change once its Files pane listed them,
   * and carrying their `filesVersion`.
   *
   * @param root - The project of the model the page reports, when this server showed it.
   * @param input - The page's sync.
   * @param context - The page's conversation and the call's cancellation.
   * @returns The sync's answer, with `filesVersion` once the project was listed.
   */
  const syncWithFiles = async (
    root: string | undefined,
    input: Parameters<typeof sessions.sync>[0],
    context: NonNullable<Parameters<typeof sessions.sync>[1]>,
  ): Promise<Awaited<ReturnType<typeof sessions.sync>>> => {
    const listed = root === undefined ? undefined : files.listed(root);
    if (root === undefined || listed === undefined) {
      return sessions.sync(input, context);
    }
    const missed = filesHeard.has(input.pageId) && filesHeard.get(input.pageId) !== listed.version;
    const held = new AbortController();
    const release = (): void => {
      held.abort();
    };
    context.signal?.addEventListener('abort', release, { once: true });
    const releaseOnChange = async (): Promise<void> => {
      await listed.changed;
      release();
    };
    // async-iife: bootstrap — the next change releases the held sync; the promise settles at that change or at close.
    void releaseOnChange();
    try {
      const result = await sessions.sync(missed ? { ...input, wait: false } : input, {
        ...context,
        signal: held.signal,
      });
      const filesVersion = files.listed(root)?.version ?? listed.version;
      filesHeard.delete(input.pageId);
      filesHeard.set(input.pageId, filesVersion);
      if (filesHeard.size > rememberedCalls) {
        filesHeard.delete(filesHeard.keys().next().value!);
      }
      return { ...result, filesVersion };
    } finally {
      context.signal?.removeEventListener('abort', release);
      held.abort();
    }
  };

  const showPath = async (
    root: string,
    { path, select }: Readonly<{ path: string; select?: readonly string[] | undefined }>,
    callOptions: TauMcpViewerCallOptions,
  ): Promise<TauViewerShowResult | TauMcpViewerFailure> => {
    const rendered = await renderEntry(root, path, callOptions);
    if (isFailure(rendered)) {
      return rendered;
    }
    const { model } = rendered;
    const scope = conversationOf(callOptions.meta);
    lastShown.set(lastShownKey(root, scope), model.sourceFile ?? model.path);
    if (scope !== undefined) {
      conversationRoot.set(scope, root);
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
      ...resultOf(rendered),
      ...(url === undefined ? {} : { viewerUrl: url }),
      ...(select === undefined || select.length === 0 ? {} : { select }),
    };
    sessions.shown(result, scope, rendered.entry);
    return result;
  };

  /**
   * A page's own open (`app_open_file`): the file is shown to that page alone, so neither the model the agent showed
   * last nor any other page moves. A CAD source opens its watched session, which the page then follows through
   * `app_sync` as it follows a model the agent showed.
   *
   * @param root - The project folder.
   * @param input - The page and the file.
   * @param callOptions - The page's call.
   * @returns What the page shows, or a failure.
   */
  const openForPage = async (
    root: string,
    input: Readonly<{ pageId: string; path: string }>,
    callOptions: Pick<TauMcpViewerCallOptions, 'signal'>,
  ): Promise<TauViewerShowResult | TauMcpViewerFailure> => {
    const absolute = inside(root, input.path);
    if (absolute !== undefined && !isOpenablePath(posix(relative(root, absolute)))) {
      return failure('NOT_RENDERABLE', `The Tau viewer cannot show ${input.path}.`);
    }
    const rendered = await renderEntry(root, input.path, callOptions);
    return isFailure(rendered) ? rendered : resultOf(rendered);
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
          (await inRoot(linkedModel(args)?.root ?? rootOf(callOptions.meta), args, callOptions.signal)) as
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
  const { snapshotSource } = options;

  const port: LocalMcpViewer = {
    page: options.page,
    pageTools: pageTools.map(({ tool }) => tool),
    rootOf,
    async show(input, callOptions) {
      const root = rootOf(callOptions.meta);
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
      return showPath(rootOf(callOptions.meta), { path: input.path }, callOptions);
    },
    /* A page names the model it shows; that model's project is the one it lists and opens files in. */
    async listFiles(input, callOptions) {
      return files.list(linkedModel(input)?.root ?? rootOf(callOptions.meta), input);
    },
    async openFile(input, callOptions) {
      return openForPage(linkedModel(input)?.root ?? rootOf(callOptions.meta), input, callOptions);
    },
    async read(input) {
      const entry = shown.get(input.modelId);
      if (entry === undefined) {
        return failure('UNKNOWN_MODEL', 'This model is no longer shown; show it again.');
      }
      const length = Math.min(input.length, tauViewerReadLimit);
      if (entry.kind === 'render') {
        /* The session keeps its newest renders; an older one gave way to a newer render the page is told of. */
        const render = entry.session.bytesOf(input.modelId);
        return render === undefined
          ? failure('MODEL_CHANGED', `${entry.model.path} changed since it was shown; the newer model is on its way.`)
          : readBytesRange({ bytes: render.bytes, offset: input.offset, length, encodings: input.encodings });
      }
      const result = await readModelRange({
        absolutePath: entry.absolutePath,
        identity: entry.identity,
        offset: input.offset,
        length,
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
            model: {
              id: model.id,
              title: model.title,
              path: model.path,
              sourceFile: model.sourceFile,
            },
          },
        });
      }
      /* A card names the show call it was opened with; that call's conversation is the page's. */
      const scope =
        conversationOf(callOptions.meta) ??
        (input.toolCallId === undefined ? undefined : conversationByCall.get(input.toolCallId));
      /* The runtime's idle release or the session limit ended the watch: a page still showing the source opens it
       * again under the same key, so its next render reaches the page. */
      if (entry?.kind === 'render' && entrySessions?.get(entry.session.key) === undefined) {
        void reopen(entry.root, entry.session.entryPath);
      }
      return syncWithFiles(entry?.root, input, {
        scope,
        signal: callOptions.signal,
        entry: entry?.kind === 'render' ? entry.session.key : undefined,
      });
    },
    async viewState(input, callOptions) {
      return sessions.viewState(input, {
        scope: conversationOf(callOptions.meta),
        signal: callOptions.signal,
      });
    },
    async captureReply(input) {
      return sessions.captureReply(input);
    },
    async workbenchState(input) {
      const entry = shown.get(input.modelId);
      return entry === undefined
        ? failure('UNKNOWN_MODEL', 'This model is no longer shown; show it again.')
        : workbench.state({ root: entry.root, entryPath: entry.model.sourceFile ?? entry.model.path });
    },
    /* Without the runtime's source closure the page has no direct link to offer. */
    ...(snapshotSource === undefined
      ? {}
      : {
          async shareLink(input: Readonly<{ modelId: string }>, callOptions: TauMcpViewerCallOptions) {
            const entry = shown.get(input.modelId);
            return entry === undefined
              ? failure('UNKNOWN_MODEL', 'This model is no longer shown; show it again.')
              : createDirectShare({
                  root: entry.root,
                  entryPath: entry.model.sourceFile ?? entry.model.path,
                  snapshotSource,
                  signal: callOptions.signal,
                });
          },
        }),
    async close() {
      entrySessions?.close();
      sessions.close();
      await Promise.all([workbench.close(), files.close()]);
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
   * `show_model` here answers the model the link names, as it was shown, or its
   * source's newest render: the page's call carries no host `_meta`, so it
   * cannot name a project folder (the server's start folder is not the
   * conversation's project), and the model was already rendered. */
  const loopbackCall = { toolCallId: 'loopback', presentation: 'text' } as const;
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
      return options.hostCall({
        root: link.root,
        call: { toolName, args: input },
        signal,
      });
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
    [tauViewerToolName.showModel]: async (args, signal) => {
      const entry = linkedModel(args);
      if (entry === undefined) {
        return unlinked();
      }
      if (entry.kind === 'file') {
        return { model: entry.model };
      }
      /* A watch the server released has no render left: the source is watched again in the linked project. */
      const render = entry.session.current();
      return render === undefined
        ? showPath(entry.root, { path: entry.session.entryPath }, { ...loopbackCall, signal })
        : describeRender(entry.session, render);
    },
    /* The linked model's project, as every pane tool on this page. */
    [tauViewerToolName.appListFiles]: async (args, _signal, link) => {
      const input = tauViewerPageInputSchemas.appListFiles.parse(args);
      return link === undefined ? unlinked() : files.list(link.root, input);
    },
    [tauViewerToolName.appOpenFile]: async (args, signal, link) =>
      link === undefined
        ? unlinked()
        : openForPage(link.root, tauViewerPageInputSchemas.appOpenFile.parse(args), { ...loopbackCall, signal }),
    [tauViewerToolName.appSync]: async (args, signal) =>
      port.sync(tauViewerPageInputSchemas.appSync.parse(args), {
        ...loopbackCall,
        signal,
      }),
    [tauViewerToolName.appCaptureReply]: async (args) =>
      port.captureReply(tauViewerPageInputSchemas.appCaptureReply.parse(args), loopbackCall),
    [tauViewerToolName.appShareLink]: async (args) =>
      port.shareLink?.(tauViewerPageInputSchemas.appShareLink.parse(args), loopbackCall),
    [tauViewerToolName.appWorkbenchState]: async (args) =>
      port.workbenchState?.(tauViewerPageInputSchemas.appWorkbenchState.parse(args), loopbackCall),
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
          .writeHead(isFailure(result) ? 422 : 200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
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
