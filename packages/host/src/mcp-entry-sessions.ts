/**
 * One watched runtime document per source the viewer shows (live-render blueprint LRP-4, parity PAR-1).
 *
 * `show_model` on a CAD source opens the source the way the Tau app's workbench does: `runtime.open` with `watch: true`,
 * following the default view offer with the render content (the CAD topology, so the page has components and the
 * mechanism). Every file or parameter change the runtime sees re-evaluates the document and renders again; each
 * render is kept here, in memory, behind an opaque version id, and never written to the project. A session is keyed by
 * the project folder and the entry, so pages of one source share one document, and the Parameters pane's drag previews
 * reach that document as transient updates (PAR-2) that never replace its committed parameters. Sessions end with the
 * project's runtime thread: the server releases an idle thread, which ends its documents.
 */

import { createHash } from 'node:crypto';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import type {
  TauViewerEntryStatus,
  TauViewerIssue,
  TauViewerMimeType,
  TauViewerPreviewResult,
} from '@taucad/mcp/viewer-protocol';
import type {
  Description,
  DocumentStatus,
  Evaluation,
  Rendering,
  RuntimeDocument,
  RuntimeLifecycleState,
  ViewStatus,
  ViewSubscription,
  WideViewRequest,
} from '@taucad/runtime/client';
import type { JSONSchema7, KernelIssue, SourceRevision } from '@taucad/runtime/types';

/** The part of a project's runtime client a session needs; the host's runtime client satisfies it. */
export type EntrySessionRuntime = Readonly<{
  /** `terminated` once the server released the project's thread: its documents are gone. */
  lifecycleState: RuntimeLifecycleState;
  /** Which kernels' renders carry which framework content, by kernel id. */
  capabilities:
    | Readonly<{
        renderCapabilities: Readonly<
          Record<string, Readonly<{ content?: Readonly<{ schema: JSONSchema7 }> | undefined }> | undefined>
        >;
      }>
    | undefined;
  open(input: Readonly<{ source: { path: string }; watch: true }>): EntryDocument;
}>;

/** The part of a runtime document a session uses. */
export type EntryDocument = Pick<RuntimeDocument, 'on' | 'evaluation' | 'update' | 'close'> &
  Readonly<{ view(id: string, request?: WideViewRequest): EntryView }>;

/** The part of a view subscription a session uses. */
export type EntryView = Pick<ViewSubscription, 'on' | 'rendering' | 'close'>;

/** One render of a watched source, held in memory. */
export type EntryRender = Readonly<{
  /** Opaque, stable for these bytes of this session: the page's `app_read` handle. */
  id: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** Hex SHA-256 of {@link bytes}. */
  sha256: string;
  mimeType: TauViewerMimeType;
  sourceRevision?: SourceRevision | undefined;
  issues: readonly TauViewerIssue[];
}>;

/** What a session tells its listener. */
export type EntrySessionEvent =
  | Readonly<{ type: 'rendered'; render: EntryRender }>
  | Readonly<{ type: 'status'; status: TauViewerEntryStatus }>;

/** One watched source. */
export type EntrySession = Readonly<{
  /** The registry key: project folder and entry. */
  key: string;
  root: string;
  /** Project-relative entry path. */
  entryPath: string;
  /** The newest successful render, if any. */
  current(): EntryRender | undefined;
  /** The bytes of a recent render by its id: the newest and the one before it, so a page mid-read finishes. */
  bytesOf(id: string): EntryRender | undefined;
  status(): TauViewerEntryStatus;
  /**
   * Wait for the evaluation and render in flight, then answer the newest render, or why the source has none.
   *
   * @param signal - The calling tool's cancellation.
   */
  settled(signal?: AbortSignal): Promise<EntryRender | TauMcpViewerFailure>;
  /**
   * Render transient parameter values over the committed ones, as the Tau app renders a drag; they never reach the
   * sidecar. Without values, the preview ends and the committed values render again.
   *
   * @param parameters - Partial values over the committed ones, or `undefined` to end the preview.
   * @returns Whether the evaluation ran, or `false` when a newer preview or a change superseded it.
   */
  preview(parameters: Readonly<Record<string, unknown>> | undefined): Promise<TauViewerPreviewResult>;
}>;

/** What {@link createMcpEntrySessions} needs. */
export type McpEntrySessionsOptions = Readonly<{
  /** Sessions kept at most; the one acquired longest ago closes first. */
  limit?: number | undefined;
  /**
   * The project's runtime client. A session asks for it again on every render, which tells the server the project is
   * in use, so a source the person keeps editing keeps its thread.
   */
  runtimeFor(root: string): Promise<EntrySessionRuntime>;
  /** A session rendered or changed status. */
  onEvent(session: EntrySession, event: EntrySessionEvent): void;
}>;

/** The watched sources of one server process. */
export type McpEntrySessions = Readonly<{
  /** The session of one source, opened on first use. */
  acquire(input: Readonly<{ root: string; entryPath: string }>): Promise<EntrySession>;
  /** An open session by its key. */
  get(key: string): EntrySession | undefined;
  /** Close every session. */
  close(): void;
}>;

/** Stack frames one issue carries to the page at most. */
const stackFrameLimit = 64;

/** Renders a session keeps: the newest, and the one a page may still be reading. */
const retainedRenders = 2;

/** Sessions one process keeps by default. */
const defaultLimit = 8;

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({ errorCode, message });

/** The formats the page draws, by the render's media type. */
const drawnMimeTypes = new Set<string>(['model/gltf-binary', 'image/svg+xml']);

const isDrawn = (mimeType: string): mimeType is TauViewerMimeType => drawnMimeTypes.has(mimeType);

/**
 * The registry key of one watched source.
 *
 * @param input - The project folder and the entry.
 * @returns The key.
 */
export const entrySessionKey = (input: Readonly<{ root: string; entryPath: string }>): string =>
  `${input.root}\0${input.entryPath}`;

const severityRank: Readonly<Record<KernelIssue['severity'], number>> = { error: 0, warning: 1, info: 2 };

/** Errors first, then warnings, then notes; a stable sort keeps the runtime's order within each. */
const bySeverity = (left: TauViewerIssue, right: TauViewerIssue): number =>
  severityRank[left.severity] - severityRank[right.severity];

/**
 * The runtime's issues as the page receives them, errors first: the raw `stack` text stays on the server, and each
 * issue keeps at most 64 stack frames.
 *
 * @param issues - The runtime's issues.
 * @returns The same issues, as the page reads them.
 */
export const tauViewerIssuesOf = (issues: readonly KernelIssue[]): TauViewerIssue[] =>
  issues
    .map(({ stack: _stack, stackFrames, ...issue }) => ({
      ...issue,
      ...(stackFrames === undefined ? {} : { stackFrames: stackFrames.slice(0, stackFrameLimit) }),
    }))
    .toSorted(bySeverity);

/** One issue list without repeats: an evaluation's issues often return with its render. */
const distinct = (issues: readonly TauViewerIssue[]): TauViewerIssue[] => {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}\0${issue.message}\0${JSON.stringify(issue.location ?? null)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

/**
 * Why a source has no render, from the runtime's issues.
 *
 * @param errorCode - The failure's code.
 * @param entryPath - The source.
 * @param issues - What the runtime reported.
 * @returns The failure, naming the first error.
 */
const failureOf = (errorCode: string, entryPath: string, issues: readonly KernelIssue[]): TauMcpViewerFailure => {
  const first = issues.find((issue) => issue.severity === 'error') ?? issues[0];
  return failure(
    errorCode,
    first === undefined
      ? `${entryPath} could not be rendered.`
      : `${entryPath} could not be rendered: ${first.message}`,
  );
};

/**
 * Whether the kernel's render advertises the CAD topology content, as the Tau app asks it for edges.
 *
 * @param runtime - The project's runtime.
 * @param kernelId - The entry's kernel.
 * @returns `true` when the render takes `includeTopology`.
 */
const carriesTopology = (runtime: EntrySessionRuntime, kernelId: string | undefined): boolean =>
  kernelId !== undefined &&
  runtime.capabilities?.renderCapabilities[kernelId]?.content?.schema.properties?.['includeTopology'] !== undefined;

const toBytes = (content: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof content === 'string' ? new Uint8Array(Buffer.from(content, 'utf8')) : content;

type OpenedSession = EntrySession & Readonly<{ isClosed(): boolean; close(): void }>;

/**
 * Open one watched source.
 *
 * @param input - Its key, project, entry, runtime and listener.
 * @returns The session.
 */
const openSession = (
  input: Readonly<{
    key: string;
    root: string;
    entryPath: string;
    runtime: EntrySessionRuntime;
    touch: () => void;
    emit: (session: EntrySession, event: EntrySessionEvent) => void;
    onClosed: (session: OpenedSession) => void;
  }>,
): OpenedSession => {
  const { key, root, entryPath, runtime } = input;
  const document = runtime.open({ source: { path: entryPath }, watch: true });
  let kernelId: string | undefined;
  let view: EntryView | undefined;
  let viewKey = '';
  let viewCleanups: Array<() => void> = [];
  let documentStatus: DocumentStatus = 'evaluating';
  let viewStatus: ViewStatus | undefined;
  let evaluationIssues: readonly TauViewerIssue[] = [];
  let renderIssues: readonly TauViewerIssue[] = [];
  /** Oldest first. */
  let renders: EntryRender[] = [];
  let closed = false;
  let lastStatus = '';
  /* A drag preview evaluates and renders like any change, but the source is not being built: the pane already shows
   * the dragged value, so the page's "Building" stays for committed changes. Set from a preview until its render. */
  let isPreviewing = false;

  const status = (): TauViewerEntryStatus => {
    const shownRevision = renders.at(-1)?.sourceRevision;
    return {
      building: !closed && !isPreviewing && (documentStatus === 'evaluating' || viewStatus === 'rendering'),
      ...(shownRevision === undefined ? {} : { sourceRevision: shownRevision }),
      issues: distinct([...evaluationIssues, ...renderIssues]).toSorted(bySeverity),
    };
  };
  const reportStatus = (): void => {
    const next = status();
    const text = JSON.stringify(next);
    if (text !== lastStatus) {
      lastStatus = text;
      input.emit(session, { type: 'status', status: next });
    }
  };

  /* Each render is answered once, whether its event or a waiting show sees it first. */
  const record = (rendering: Rendering): EntryRender | undefined => {
    const { sourceRevision } = rendering;
    renderIssues = tauViewerIssuesOf(rendering.issues);
    if (!rendering.success || !isDrawn(rendering.artifact.mimeType)) {
      return undefined;
    }
    const bytes = toBytes(rendering.artifact.content);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const newest = renders.at(-1);
    if (newest?.sha256 === sha256) {
      return newest;
    }
    const render: EntryRender = {
      id: createHash('sha256').update(`${key}\0${sha256}`).digest('base64url').slice(0, 22),
      bytes,
      sha256,
      mimeType: rendering.artifact.mimeType,
      ...(sourceRevision === undefined ? {} : { sourceRevision }),
      issues: renderIssues,
    };
    renders = [...renders, render].slice(-retainedRenders);
    input.emit(session, { type: 'rendered', render });
    input.touch();
    return render;
  };

  /* The default view offer, as the Tau app follows it (`cad.machine.ts`): one subscription per offer and content. */
  const follow = (evaluation: Evaluation): void => {
    if (!evaluation.success || closed) {
      return;
    }
    const [offer] = evaluation.views;
    const topology = offer?.mimeType === 'model/gltf-binary' && carriesTopology(runtime, kernelId);
    const nextKey = `${offer?.id ?? ''}:${String(topology)}`;
    if (nextKey === viewKey) {
      return;
    }
    viewKey = nextKey;
    for (const cleanup of viewCleanups) {
      cleanup();
    }
    view?.close();
    view =
      offer === undefined
        ? undefined
        : document.view(offer.id, topology ? { content: { includeTopology: true } } : undefined);
    viewStatus = undefined;
    viewCleanups =
      view === undefined
        ? []
        : [
            view.on('rendered', (rendering) => {
              /* The render is done; the runtime reports the view ready just after, and a status between the two
               * would say the preview is building. */
              viewStatus = rendering.success ? 'ready' : 'error';
              if (rendering.transient) {
                isPreviewing = false;
              }
              record(rendering);
              reportStatus();
            }),
            view.on('status', (next) => {
              viewStatus = next;
              reportStatus();
            }),
          ];
  };

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    for (const cleanup of [...viewCleanups, ...documentCleanups]) {
      cleanup();
    }
    viewCleanups = [];
    /* The bytes go with the session; a page still showing one keeps what it drew. */
    renders = [];
    view?.close();
    document.close();
    input.onClosed(session);
  };

  const documentCleanups = [
    document.on('described', (description: Description) => {
      ({ kernelId } = description);
    }),
    document.on('evaluated', (evaluation) => {
      if (evaluation.transient && !evaluation.success) {
        /* A preview that fails to evaluate renders nothing; the failure shows in the issues. */
        isPreviewing = false;
      }
      evaluationIssues = tauViewerIssuesOf(evaluation.issues);
      if (!evaluation.success) {
        /* No render follows a failed evaluation: what the last render said no longer holds. */
        renderIssues = [];
      }
      follow(evaluation);
      reportStatus();
    }),
    document.on('status', (next) => {
      documentStatus = next;
      /* The server released the project's thread (or the document closed): the session ends with it. */
      if (next === 'closed' || runtime.lifecycleState === 'terminated') {
        close();
        return;
      }
      reportStatus();
    }),
  ];

  const session: OpenedSession = {
    key,
    root,
    entryPath,
    current: () => renders.at(-1),
    bytesOf: (id) => renders.find((render) => render.id === id),
    status,
    isClosed: () => closed,
    close,
    async preview(parameters) {
      if (closed) {
        return { accepted: false };
      }
      isPreviewing = parameters !== undefined;
      reportStatus();
      try {
        /* An empty update ends a preview: the document renders its committed values again, as the Tau app restores. */
        const outcome = await document.update(parameters === undefined ? {} : { parameters, transient: true });
        return { accepted: !outcome.superseded };
      } catch {
        /* Cancelled with the document, or timed out: the next preview or change renders again. */
        isPreviewing = false;
        reportStatus();
        return { accepted: false };
      }
    },
    async settled(signal) {
      for (;;) {
        if (closed) {
          return failure('SESSION_CLOSED', `The watch on ${entryPath} ended; show it again.`);
        }
        // oxlint-disable-next-line no-await-in-loop -- a superseded evaluation waits for the one that replaced it.
        const evaluated = await document.evaluation({ signal });
        if (evaluated.superseded) {
          continue;
        }
        const { evaluation } = evaluated;
        if (!evaluation.success) {
          return failureOf('RENDER_FAILED', entryPath, evaluation.issues);
        }
        follow(evaluation);
        if (view === undefined) {
          return failure('NO_VIEW', `${entryPath} offers no view the Tau viewer draws.`);
        }
        // oxlint-disable-next-line no-await-in-loop -- the render of the evaluation just settled.
        const rendered = await view.rendering({ signal });
        if (rendered.superseded) {
          continue;
        }
        const { rendering } = rendered;
        if (!rendering.success) {
          return failureOf('RENDER_FAILED', entryPath, rendering.issues);
        }
        if (!isDrawn(rendering.artifact.mimeType)) {
          return failure(
            'UNSUPPORTED_FORMAT',
            `${entryPath} renders ${rendering.artifact.mimeType}; the Tau viewer draws GLB and SVG.`,
          );
        }
        const render = record(rendering);
        reportStatus();
        return render ?? failure('RENDER_FAILED', `${entryPath} could not be rendered.`);
      }
    },
  };
  return session;
};

/**
 * Create the watched sources of one server process.
 *
 * @param options - The project runtimes, the listener and the session limit.
 * @returns The registry.
 */
export const createMcpEntrySessions = (options: McpEntrySessionsOptions): McpEntrySessions => {
  const limit = options.limit ?? defaultLimit;
  /** Least recently acquired first. */
  const sessions = new Map<string, OpenedSession>();
  const opening = new Map<string, Promise<OpenedSession>>();
  let isClosed = false;

  /**
   * Mark a project's runtime as used.
   *
   * @param root - The project folder.
   */
  const touchRuntime = async (root: string): Promise<void> => {
    try {
      await options.runtimeFor(root);
    } catch {
      /* The next open reports a client that cannot start. */
    }
  };

  const open = async (input: Readonly<{ root: string; entryPath: string }>, key: string): Promise<OpenedSession> => {
    const runtime = await options.runtimeFor(input.root);
    if (isClosed) {
      throw new Error('The viewer is closing.');
    }
    const session = openSession({
      key,
      root: input.root,
      entryPath: input.entryPath,
      runtime,
      touch: () => {
        /* Asking for the client again counts as use; a released thread is not started again for it. */
        if (runtime.lifecycleState !== 'terminated') {
          // async-iife: bootstrap; a use mark only, and a client that fails to start fails the next open instead.
          void touchRuntime(input.root);
        }
      },
      emit: options.onEvent,
      onClosed: (closed) => {
        if (sessions.get(key) === closed) {
          sessions.delete(key);
        }
      },
    });
    sessions.set(key, session);
    for (const [oldest, kept] of sessions) {
      if (sessions.size <= limit) {
        break;
      }
      sessions.delete(oldest);
      kept.close();
    }
    return session;
  };

  /**
   * Open a session once for concurrent acquires of one key.
   *
   * @param input - The source to watch.
   * @param key - Its session key.
   * @returns The opened session.
   */
  const openOnce = async (input: Parameters<typeof open>[0], key: string): Promise<OpenedSession> => {
    try {
      return await open(input, key);
    } finally {
      opening.delete(key);
    }
  };

  return {
    async acquire(input) {
      const key = entrySessionKey(input);
      const existing = sessions.get(key);
      if (existing !== undefined && !existing.isClosed()) {
        sessions.delete(key);
        sessions.set(key, existing);
        return existing;
      }
      let pending = opening.get(key);
      if (pending === undefined) {
        pending = openOnce(input, key);
        opening.set(key, pending);
      }
      return pending;
    },
    get: (key) => sessions.get(key),
    close() {
      isClosed = true;
      for (const session of sessions.values()) {
        session.close();
      }
      sessions.clear();
    },
  };
};
