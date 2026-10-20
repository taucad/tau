/**
 * The contract between `tau mcp` and the Tau viewer page.
 *
 * The page imports this module, so it holds names, shapes and pure helpers
 * only: no SDK, no zod and no Node built-ins.
 */

/** Tools the viewer page and its host entrypoints call. @public */
export const tauViewerToolName = {
  /** Show a project model in the viewer (the thread entrypoint). */
  showModel: 'show_model',
  /** Open one model file the host hands over (the file entrypoint). */
  openModelFile: 'open_model_file',
  /** List the project's renderable files (the global entrypoint). */
  browseModels: 'browse_models',
  /** Read a byte range of a shown model; only the page calls it. */
  appRead: 'app_read',
  /** What the person sees in the viewer, and optionally a capture of it (the model calls it). */
  viewState: 'view_state',
  /** The page's long poll: it reports its view and hears of shown models, highlights and capture requests. */
  appSync: 'app_sync',
  /** The page's answer to a capture request. */
  appCaptureReply: 'app_capture_reply',
  /** The shown model's project packed for the page's direct share link. */
  appShareLink: 'app_share_link',
} as const;

/** Name of one viewer tool. @public */
export type TauViewerToolName = (typeof tauViewerToolName)[keyof typeof tauViewerToolName];

/** Largest byte range one `app_read` reply carries (blueprint D4). @public */
export const tauViewerReadLimit = 4 * 1024 * 1024;

/** The MCP Apps resource media type. @public */
export const tauViewerResourceMimeType = 'text/html;profile=mcp-app';

/** The client capability extension that marks an MCP Apps host. @public */
export const tauViewerUiExtension = 'io.modelcontextprotocol/ui';

/** Formats the page draws itself; every other format is converted by the server (blueprint D3). @public */
export const tauViewerMimeTypes = ['model/gltf-binary', 'image/svg+xml'] as const;

/** One format the page draws. @public */
export type TauViewerMimeType = (typeof tauViewerMimeTypes)[number];

/**
 * How `tau mcp` presents the viewer to one client (blueprint D5).
 *
 * - `inline`: an MCP Apps host; tools name the `ui://` page.
 * - `openai`: Codex desktop; the page plus OpenAI entrypoints (thread tab, sidebar, file handler).
 * - `text`: everything else; tools return a loopback link and screenshots.
 *
 * @public
 */
export type TauViewerPresentation = 'inline' | 'openai' | 'text';

/** One model the server prepared for the page. @public */
export type TauViewerModel = Readonly<{
  /** Opaque handle `app_read` takes; valid for the server process that issued it. */
  id: string;
  /** What the person sees as the model's name. */
  title: string;
  /** Project-relative path of the file the page draws (a source's rendered GLB lives under `.tau/artifacts`). */
  path: string;
  /** Project-relative CAD source the model was rendered from, when there is one. */
  sourceFile?: string | undefined;
  mimeType: TauViewerMimeType;
  byteLength: number;
  /** Hex SHA-256 of the bytes, so the page can tell a re-render from the model it already shows. */
  sha256: string;
}>;

/** What a shown GLB carries of its source's mechanism, for the page's Kinematics pane. @public */
export type TauViewerMechanism = Readonly<{
  /** The GLB carries a mechanism payload for the page's Kinematics pane. */
  preserved: boolean;
  /** Joints in that payload; 0 when there is none. */
  joints: number;
  /** Animation ids, in authored order. */
  animations: readonly string[];
}>;

/** Structured result of `show_model` and `open_model_file`. @public */
export type TauViewerShowResult = Readonly<{
  model: TauViewerModel;
  /** What the shown GLB carries of a mechanism; absent for an SVG. */
  mechanism?: TauViewerMechanism | undefined;
  /** What the agent should know about the shown file, such as the source an export was made from. */
  hint?: string | undefined;
  /** The loopback page showing this model, when the server runs one. */
  viewerUrl?: string | undefined;
  /** Component ids the agent asked the page to select, as the model tree names them. */
  select?: readonly string[] | undefined;
}>;

/** One renderable file `browse_models` lists. @public */
export type TauViewerFile = Readonly<{
  path: string;
  title: string;
}>;

/** Structured result of `browse_models`. @public */
export type TauViewerBrowseResult = Readonly<{
  files: readonly TauViewerFile[];
}>;

/** Content encodings a page can undo on an `app_read` slice. @public */
export const tauViewerReadEncodings = ['gzip'] as const;

/** One content encoding of an `app_read` slice. @public */
export type TauViewerReadEncoding = (typeof tauViewerReadEncodings)[number];

/** Arguments of `app_read`. @public */
export type TauViewerReadInput = Readonly<{
  modelId: string;
  offset: number;
  length: number;
  /** Encodings the page can undo; the server uses one only when it makes the reply smaller (blueprint W9). */
  encodings?: readonly TauViewerReadEncoding[] | undefined;
}>;

/** Structured result of `app_read`: one base64 slice of the model. @public */
export type TauViewerReadResult = Readonly<{
  offset: number;
  /** Bytes of the model this slice covers, before any encoding. */
  byteLength: number;
  totalBytes: number;
  /** How `data` is encoded beneath its base64; absent for the bytes as they are. */
  encoding?: TauViewerReadEncoding | undefined;
  /** The slice, base64-encoded. */
  data: string;
}>;

/** A point or direction in the model's frame, in metres. @public */
export type TauViewerVector = readonly [number, number, number];

/** The live camera: where it looks, from which direction, and how much of the model fits the frame's height. @public */
export type TauViewerCamera = Readonly<{
  target: TauViewerVector;
  direction: TauViewerVector;
  up: TauViewerVector;
  /** Metres of the model the frame's height spans. */
  verticalSpan: number;
  /** The frame the vectors are in; `tau:root` when absent. */
  frameId?: string | undefined;
  /** The perspective camera's zoom; 1 when absent. */
  perspectiveZoom?: number | undefined;
}>;

/** One component of the shown model, as the page's model tree names it. @public */
export type TauViewerComponent = Readonly<{
  /** The id `arrange_workbench` component lists and `@cad[...]` references take. */
  componentId: string;
  label: string;
  kind: string;
  /** The renderer's node selector, when the component has one. */
  selector?: string | undefined;
}>;

/** What the person sees in one viewer page. @public */
export type TauViewerViewState = Readonly<{
  model: Readonly<{ id: string; title: string; path: string; sourceFile?: string | undefined }>;
  selected: readonly TauViewerComponent[];
  hidden: readonly string[];
  isolated: readonly string[];
  camera?: TauViewerCamera | undefined;
  sectionActive: boolean;
  measurementCount: number;
  /** `inline` for a card in the conversation; `tab` for a thread tab, fullscreen or the browser page. */
  composition: 'inline' | 'tab';
  /** Milliseconds since the epoch of the person's last pointer or keyboard input on the page. */
  interactedAt: number;
  /**
   * The components the person added to chat from this model, in the order added. A page sends it only to a server
   * whose `app_sync` lists it under {@link TauViewerSyncResult.accepts}.
   */
  references?: readonly TauViewerComponent[] | undefined;
}>;

/**
 * The optional {@link TauViewerViewState} fields this server's `app_sync` takes. Its schema is strict, so a page sends
 * one of them only after a sync result listed it: an older server rejects the whole sync otherwise.
 *
 * @public
 */
export const tauViewerAcceptedViewFields = ['references'] as const;

/** Arguments of `app_sync`. @public */
export type TauViewerSyncInput = Readonly<{
  /** Random id the page picks once. */
  pageId: string;
  /** The last `version` the page saw; 0 at first. */
  version: number;
  /** Whether the page follows `show_model` (a page the person opened does; a card keeps the model it was made for). */
  follow: boolean;
  /** Hold the reply until something changes, at most a few seconds. */
  wait: boolean;
  view?: TauViewerViewState | undefined;
  /**
   * The id of the `tools/call` whose result opened the page (the host's `toolInfo.id`), so a server serving several
   * conversations knows which one the page belongs to; absent for a page the person opened.
   */
  toolCallId?: string | undefined;
}>;

/** Structured result of `app_sync`. @public */
export type TauViewerSyncResult = Readonly<{
  version: number;
  /** The model `show_model` handed over last, for a page that follows and has not seen it. */
  show?: TauViewerShowResult | undefined;
  /** A capture of this page's view the agent is waiting for. */
  capture?: Readonly<{ requestId: string }> | undefined;
  /**
   * The optional view fields the server takes ({@link tauViewerAcceptedViewFields}); absent from a server older than
   * them. A page may read names it does not know.
   */
  accepts?: readonly string[] | undefined;
}>;

/** One captured image of the live view. @public */
export type TauViewerImage = Readonly<{ mimeType: 'image/png' | 'image/jpeg'; data: string }>;

/** Arguments of `app_capture_reply`. @public */
export type TauViewerCaptureReplyInput = Readonly<{
  requestId: string;
  pageId: string;
  image?: TauViewerImage | undefined;
  /** Why the page could not capture, instead of an image. */
  error?: string | undefined;
}>;

/** Arguments of `view_state`. @public */
export type TauViewerViewStateInput = Readonly<{
  /** Also capture the live view, once its model is drawn. */
  capture?: boolean | undefined;
}>;

/** Structured result of `view_state` (the image travels as an image block). @public */
export type TauViewerViewStateResult = Readonly<{
  view: TauViewerViewState;
  /** Why the capture is missing when one was asked for. */
  captureError?: string | undefined;
}>;

/** What `initialize` told the server about its client, as far as presentation is concerned. @public */
export type TauViewerClient = Readonly<{
  capabilities?:
    | Readonly<Record<string, unknown> & { extensions?: Readonly<Record<string, unknown>> | undefined }>
    | undefined;
  clientInfo?: Readonly<{ name: string }> | undefined;
}>;

/** The client name Codex's MCP client sends, from the desktop app and the CLI alike. @public */
export const codexClientName = 'codex-mcp-client';

/**
 * Choose the presentation for one client (blueprint D5).
 *
 * The standard capability decides first: only a client declaring the MCP Apps
 * extension with the page's media type gets the page. Codex's desktop app
 * declares it and the Codex CLI does not, so the client name only chooses
 * OpenAI entrypoints over plain inline cards.
 *
 * @param client - The client's `initialize` capabilities and identity.
 * @returns The presentation to use for the session.
 * @public
 *
 * @example <caption>Codex desktop gets the entrypoints</caption>
 * ```typescript
 * import { resolveTauViewerPresentation } from '@taucad/mcp/viewer-protocol';
 *
 * resolveTauViewerPresentation({
 *   capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
 *   clientInfo: { name: 'codex-mcp-client' },
 * }); // 'openai'
 * ```
 */
export const resolveTauViewerPresentation = (client: TauViewerClient): TauViewerPresentation => {
  const extension = client.capabilities?.extensions?.[tauViewerUiExtension];
  const mimeTypes =
    typeof extension === 'object' && extension !== null && 'mimeTypes' in extension ? extension.mimeTypes : undefined;
  if (!Array.isArray(mimeTypes) || !mimeTypes.includes(tauViewerResourceMimeType)) {
    return 'text';
  }
  return client.clientInfo?.name === codexClientName ? 'openai' : 'inline';
};

/**
 * The `ui://` URI of one build of the page.
 *
 * Hosts cache a resource by its URI, so the URI carries the page's digest and
 * a new build is a new resource (blueprint D2).
 *
 * @param sha256 - Hex SHA-256 of the page's HTML.
 * @returns `ui://tau/<first 16 hex digits>/app.html`.
 * @public
 */
export const tauViewerResourceUri = (sha256: string): string => `ui://tau/${sha256.slice(0, 16)}/app.html`;

/**
 * What `app_share_link` answers: the shown model's project as the deterministic portable share ZIP
 * (`@taucad/project-core/share-artifact`), base64url. The page makes the direct link from it, and seals it under a
 * password itself, so a password never reaches the server.
 * @public
 */
export type TauViewerDirectShare = Readonly<{
  kind: 'direct';
  /** The Tau web origin the link opens on. */
  origin: string;
  /** The entry the link opens, project-relative; the packed `tau.json` names it as the main entry. */
  entryPath: string;
  /** The portable share ZIP, base64url. */
  encodedArchive: string;
  /** How the files were chosen: the runtime's source closure of the entry, or every project file git does not ignore. */
  closure: 'runtime' | 'project-files';
  fileCount: number;
  uncompressedBytes: number;
  archiveBytes: number;
  /** Non-blocking diagnostics safe to show the person sharing. */
  warnings: ReadonlyArray<Readonly<{ code: string; message: string }>>;
}>;
