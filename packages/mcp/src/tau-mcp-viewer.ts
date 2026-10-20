import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  resolveTauViewerPresentation,
  tauViewerReadEncodings,
  tauViewerReadLimit,
  tauViewerResourceMimeType,
  tauViewerResourceUri,
  tauViewerToolName,
} from '#viewer-protocol.js';
import type {
  TauViewerBrowseResult,
  TauViewerCaptureReplyInput,
  TauViewerComponent,
  TauViewerImage,
  TauViewerPresentation,
  TauViewerReadInput,
  TauViewerReadResult,
  TauViewerDirectShare,
  TauViewerShowResult,
  TauViewerSyncInput,
  TauViewerSyncResult,
  TauViewerViewState,
  TauViewerViewStateInput,
} from '#viewer-protocol.js';

/** A failure a viewer port returns instead of throwing. @public */
export type TauMcpViewerFailure = Readonly<{ errorCode: string; message: string }>;

/** Per-call context a viewer port receives. @public */
export type TauMcpViewerCallOptions = Readonly<{
  /** Stable identifier of this tool call. */
  toolCallId: string;
  /** Cancels the call. */
  signal?: AbortSignal | undefined;
  /** The client's request `_meta`, verbatim (Codex names the thread's folder and an opened file here). */
  meta?: Readonly<Record<string, unknown>> | undefined;
  /** How this session presents the viewer; a `text` session needs a loopback `viewerUrl`. */
  presentation: TauViewerPresentation;
}>;

/**
 * What the host supplies for `tau mcp` to serve the viewer page.
 *
 * `@taucad/mcp` owns no filesystem: the host renders and reads models, and
 * runs the loopback server a `text` session links to.
 *
 * @public
 */
/**
 * One extra app-only tool the viewer page's panes call, supplied by the host (the Export pane's format list, for
 * example). It is registered beside the page's own tools with `visibility: ['app']`, and only while the host shows a
 * page.
 *
 * @public
 */
export type TauMcpViewerPageTool = Readonly<{
  name: string;
  description: string;
  /** Checked by the SDK before `call` runs, and by a loopback server before it answers. */
  inputSchema: z.ZodObject;
  call(
    args: Readonly<Record<string, unknown>>,
    options: TauMcpViewerCallOptions,
  ): Promise<Readonly<Record<string, unknown>> | TauMcpViewerFailure>;
}>;

/**
 * The viewer the MCP server registers: its page and its tools.
 *
 * @public
 */
export type TauMcpViewer = Readonly<{
  /** The single-file page and the digest that names its `ui://` URI. */
  page: Readonly<{ html: string; sha256: string }>;
  /** App-only tools the host adds for the page's panes. */
  pageTools?: readonly TauMcpViewerPageTool[];
  /**
   * Render or locate a model to show; without a target, the model shown last or the project's main file. `select`
   * names components for the page to select once the model is drawn.
   */
  show(
    input: Readonly<{ targetFile?: string | undefined; select?: readonly string[] | undefined }>,
    options: TauMcpViewerCallOptions,
  ): Promise<TauViewerShowResult | TauMcpViewerFailure>;
  /** Show one project file a host entrypoint opened. */
  open(
    input: Readonly<{ path: string }>,
    options: TauMcpViewerCallOptions,
  ): Promise<TauViewerShowResult | TauMcpViewerFailure>;
  /** List the project's renderable files. */
  browse(options: TauMcpViewerCallOptions): Promise<TauViewerBrowseResult | TauMcpViewerFailure>;
  /** Read one byte range of a model `show` or `open` returned. */
  read(input: TauViewerReadInput, options: TauMcpViewerCallOptions): Promise<TauViewerReadResult | TauMcpViewerFailure>;
  /** A page's long poll: record its view, then answer with what it has not seen. */
  sync(input: TauViewerSyncInput, options: TauMcpViewerCallOptions): Promise<TauViewerSyncResult | TauMcpViewerFailure>;
  /** The view of the page the person used last, with a capture of it when asked. */
  viewState(
    input: TauViewerViewStateInput,
    options: TauMcpViewerCallOptions,
  ): Promise<
    Readonly<{ view: TauViewerViewState; image?: TauViewerImage; captureError?: string }> | TauMcpViewerFailure
  >;
  /** A page's answer to a capture request. */
  captureReply(
    input: TauViewerCaptureReplyInput,
    options: TauMcpViewerCallOptions,
  ): Promise<Readonly<{ accepted: boolean }> | TauMcpViewerFailure>;
  /** A shown model's project packed for the page's direct link; a host without one leaves the tool out. */
  shareLink?(
    input: Readonly<{ modelId: string }>,
    options: TauMcpViewerCallOptions,
  ): Promise<TauViewerDirectShare | TauMcpViewerFailure>;
}>;

const descriptions = {
  showModel:
    'Show a CAD source file (targetFile), a STEP, STL, 3MF or OBJ file (converted to GLB), or a GLB or SVG file, in the Tau viewer the person sees; omit targetFile to show the model shown last or the project main file. Call it after evaluate_model succeeds when the person should look at the result. Pass the CAD source, not a GLB exported from it: the viewer shows a source with its parameters, kinematics and exports.',
  openModelFile:
    'Open one project model file in the Tau viewer. The host calls this when the person opens a file with Tau.',
  browseModels: "List the project's renderable model files for the Tau viewer's file list.",
  appRead: 'Read a byte range of a model the Tau viewer shows. Only the viewer page calls this.',
  viewState:
    'Report what the person sees in the Tau viewer: the model, the selected components and those the person added to chat (each with the component id that follows # in a @cad[<path>#<componentId>] reference, as show_model select and arrange_workbench take it), hidden and isolated components, and the camera. Call it when the person names a part they picked or added in the viewer. Set capture to also get an image of the live view.',
  appSync: "The Tau viewer page's sync with the server. Only the viewer page calls this.",
  appCaptureReply: "The Tau viewer page's answer to a capture request. Only the viewer page calls this.",
  appShareLink:
    "The shown model's project packed for the Tau viewer page's direct share link. Only the viewer page calls this.",
} as const;

const showModelInputSchema = z
  .object({
    targetFile: z
      .string()
      .min(1)
      .optional()
      .describe('Project-relative CAD source, STEP, STL, 3MF, OBJ, GLB or SVG file to show.'),
    select: z
      .array(z.string().min(1).max(256))
      .max(64)
      .optional()
      .describe(
        'Component ids to select in the viewer: the part after # in a @cad[<path>#<componentId>] reference, as view_state names them.',
      ),
  })
  .strict();

const vectorSchema = z.tuple([z.number(), z.number(), z.number()]);

const componentSchema = z
  .object({
    componentId: z.string().min(1).max(256),
    label: z.string().max(256),
    kind: z.string().max(32),
    selector: z.string().max(256).optional(),
  })
  .strict();

const viewSchema = z
  .object({
    model: z
      .object({
        id: z.string().min(1).max(64),
        title: z.string().max(256),
        path: z.string().max(1024),
        sourceFile: z.string().max(1024).optional(),
      })
      .strict(),
    selected: z.array(componentSchema).max(64),
    hidden: z.array(z.string().min(1).max(256)).max(1024),
    isolated: z.array(z.string().min(1).max(256)).max(1024),
    camera: z
      .object({
        target: vectorSchema,
        direction: vectorSchema,
        up: vectorSchema,
        verticalSpan: z.number().positive(),
        frameId: z.string().min(1).max(128).optional(),
        perspectiveZoom: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    sectionActive: z.boolean(),
    measurementCount: z.number().int().nonnegative(),
    composition: z.enum(['inline', 'tab']),
    interactedAt: z.number().nonnegative(),
    references: z.array(componentSchema).max(64).optional(),
  })
  .strict();

const appSyncInputSchema = z
  .object({
    pageId: z.string().min(8).max(64),
    version: z.number().int().nonnegative(),
    follow: z.boolean(),
    wait: z.boolean(),
    view: viewSchema.optional(),
    toolCallId: z.string().min(1).max(128).optional(),
  })
  .strict();

const appShareLinkInputSchema = z.object({ modelId: z.string().min(1) }).strict();

/** A capture travels base64 in one reply; 8 MiB of base64 is a 6 MiB image, far above a 1280 px frame. */
const captureDataLimit = 8 * 1024 * 1024;

const appCaptureReplyInputSchema = z
  .object({
    requestId: z.string().min(1).max(64),
    pageId: z.string().min(8).max(64),
    image: z
      .object({ mimeType: z.enum(['image/png', 'image/jpeg']), data: z.string().min(1).max(captureDataLimit) })
      .strict()
      .optional(),
    error: z.string().max(1000).optional(),
  })
  .strict();

const viewStateInputSchema = z
  .object({
    capture: z.boolean().optional().describe('Also capture the live view once its model is drawn.'),
  })
  .strict();

const openModelFileInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .optional()
      .describe('Project-relative or absolute path of the file to open; a file entrypoint supplies it in _meta.'),
  })
  .strict();

const appReadInputSchema = z
  .object({
    modelId: z.string().min(1),
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive().max(tauViewerReadLimit),
    encodings: z.array(z.enum(tauViewerReadEncodings)).max(4).optional(),
  })
  .strict();

/**
 * The page-facing tools' input schemas, for a host's loopback server to check what the browser page sends exactly as
 * `tools/call` checks it.
 * @public
 */
export const tauViewerPageInputSchemas = {
  showModel: showModelInputSchema,
  appRead: appReadInputSchema,
  appSync: appSyncInputSchema,
  appCaptureReply: appCaptureReplyInputSchema,
  appShareLink: appShareLinkInputSchema,
} as const;

/** The file extensions the file entrypoint claims: the page's own formats and those the server converts to GLB (W7). */
const fileEntrypointExtensions = ['glb', 'svg', 'step', 'stp', 'stl', '3mf', 'obj'];

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * The page's live-link tools change nothing outside the server's memory and reach no other system; hosts that prompt
 * for or time out unannotated calls can classify them.
 */
const liveLinkAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const isFailure = (value: Readonly<Record<string, unknown>>): value is TauMcpViewerFailure => 'errorCode' in value;

const failure = ({ errorCode, message }: TauMcpViewerFailure): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: `${errorCode}: ${message}` }],
});

const listed = (ids: readonly string[]): string =>
  ids.length === 0
    ? 'none'
    : ids.length <= 8
      ? ids.join(', ')
      : `${ids.slice(0, 8).join(', ')} and ${String(ids.length - 8)} more`;

const components = (list: readonly TauViewerComponent[], empty: string): string =>
  list.length === 0 ? empty : list.map((component) => `${component.label} (${component.componentId})`).join(', ');

const vector = (value: readonly number[]): string => `(${value.map((axis) => axis.toPrecision(3)).join(', ')})`;

/**
 * The view as the model reads it; the structured result carries the same facts.
 *
 * @param view - The page's reported view.
 * @returns A few sentences.
 */
const describeView = (view: TauViewerViewState): string =>
  [
    `The Tau viewer (${view.composition === 'inline' ? 'a card in the conversation' : 'a tab'}) shows ${view.model.sourceFile ?? view.model.path}.`,
    `Selected: ${components(view.selected, 'nothing')}.`,
    /* A page older than the field reports no added set, which is not an empty one. */
    ...(view.references === undefined ? [] : [`Added to chat: ${components(view.references, 'none')}.`]),
    `Hidden: ${listed(view.hidden)}. Isolated: ${listed(view.isolated)}.`,
    view.camera === undefined
      ? 'The camera has not framed the model yet.'
      : `Camera looks at ${vector(view.camera.target)} from direction ${vector(view.camera.direction)}, spanning ${view.camera.verticalSpan.toPrecision(3)} m.`,
    `Section view ${view.sectionActive ? 'on' : 'off'}; ${String(view.measurementCount)} measurements.`,
  ].join('\n');

/**
 * What the shown GLB carries of a mechanism, as the model reads it; the structured result carries the same facts.
 *
 * @param mechanism - The show result's mechanism facts.
 * @returns One sentence.
 */
const describeMechanism = (mechanism: NonNullable<TauViewerShowResult['mechanism']>): string =>
  mechanism.preserved
    ? `Mechanism: ${String(mechanism.joints)} joints${mechanism.animations.length > 0 ? `, animations ${mechanism.animations.join(', ')}` : ''}.`
    : 'This GLB carries no mechanism.';

const shown = (result: TauViewerShowResult, presentation: TauViewerPresentation): CallToolResult => {
  const { model, viewerUrl, mechanism, hint } = result;
  const name = model.sourceFile ?? model.path;
  const text =
    presentation === 'text'
      ? viewerUrl === undefined
        ? `Rendered ${name} for the Tau viewer, but this session runs no viewer page. Use screenshot to look at it.`
        : `Open ${name} in the Tau viewer: ${viewerUrl}`
      : `Showing ${name} in the Tau viewer.`;
  return {
    content: [
      {
        type: 'text',
        text: [
          text,
          ...(mechanism === undefined ? [] : [describeMechanism(mechanism)]),
          ...(hint === undefined ? [] : [hint]),
        ].join('\n'),
      },
    ],
    structuredContent: result,
  };
};

/**
 * The path a Codex file entrypoint names in `_meta["openai/resource"]`.
 *
 * @param meta - The request's `_meta`.
 * @returns The path, or `undefined`.
 */
const openedPath = (meta: Readonly<Record<string, unknown>> | undefined): string | undefined => {
  const resource = meta?.['openai/resource'];
  const path = typeof resource === 'object' && resource !== null && 'path' in resource ? resource.path : undefined;
  return typeof path === 'string' && path !== '' ? path : undefined;
};

/**
 * Register the viewer page and its tools on one server.
 *
 * Everything is registered before `initialize`; once the client has said who it
 * is, the presentation (blueprint D5) decides which tools are listed and what
 * `_meta` names the page. The client sends no request between `initialize` and
 * its `initialized` notification, so the change needs no list-changed notice.
 *
 * @param server - The MCP server.
 * @param viewer - The host's viewer port.
 * @param alwaysLoad - `_meta` every Tau tool carries.
 * @returns Nothing.
 * @public
 */
export const registerTauMcpViewer = (
  server: McpServer,
  viewer: TauMcpViewer,
  alwaysLoad: Readonly<Record<string, unknown>>,
): void => {
  const resourceUri = tauViewerResourceUri(viewer.page.sha256);
  let presentation: TauViewerPresentation = 'text';
  const callOptions = (extra: {
    signal: AbortSignal;
    _meta?: Record<string, unknown> | undefined;
    requestId: string | number;
  }): TauMcpViewerCallOptions => ({
    toolCallId: String(extra.requestId),
    signal: extra.signal,
    meta: extra._meta,
    presentation,
  });

  /* The page needs no origin at all: its bytes travel through `app_read`
   * (blueprint D4, I2), so the CSP lists only `data:` (inlined wasm) and
   * `blob:` (inlined workers, decoded models). Add to chat's clipboard route writes the clipboard. */
  const resourceMeta = {
    ui: {
      csp: { connectDomains: ['data:', 'blob:'], resourceDomains: ['data:', 'blob:'] },
      permissions: { clipboardWrite: {} },
      prefersBorder: true,
    },
  };
  server.registerResource(
    'tau-viewer',
    resourceUri,
    {
      title: 'Tau viewer',
      description: 'The Tau CAD viewer page.',
      mimeType: tauViewerResourceMimeType,
      _meta: resourceMeta,
    },
    async () => ({
      contents: [
        { uri: resourceUri, mimeType: tauViewerResourceMimeType, text: viewer.page.html, _meta: resourceMeta },
      ],
    }),
  );

  const showModel = server.registerTool(
    tauViewerToolName.showModel,
    {
      description: descriptions.showModel,
      inputSchema: showModelInputSchema,
      annotations: readOnlyAnnotations,
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const result = await viewer.show({ targetFile: args.targetFile, select: args.select }, callOptions(extra));
      return isFailure(result) ? failure(result) : shown(result, presentation);
    },
  );
  const openModelFile = server.registerTool(
    tauViewerToolName.openModelFile,
    {
      description: descriptions.openModelFile,
      inputSchema: openModelFileInputSchema,
      annotations: readOnlyAnnotations,
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const path = openedPath(extra._meta) ?? args.path;
      if (path === undefined) {
        return failure({ errorCode: 'INVALID_INPUT', message: 'open_model_file needs a path.' });
      }
      const result = await viewer.open({ path }, callOptions(extra));
      return isFailure(result) ? failure(result) : shown(result, presentation);
    },
  );
  const browseModels = server.registerTool(
    tauViewerToolName.browseModels,
    { description: descriptions.browseModels, annotations: readOnlyAnnotations, _meta: alwaysLoad },
    async (extra) => {
      const result = await viewer.browse(callOptions(extra));
      if (isFailure(result)) {
        return failure(result);
      }
      return {
        content: [{ type: 'text', text: result.files.map((file) => file.path).join('\n') || 'No renderable files.' }],
        structuredContent: result,
      };
    },
  );
  const appRead = server.registerTool(
    tauViewerToolName.appRead,
    {
      description: descriptions.appRead,
      inputSchema: appReadInputSchema,
      annotations: readOnlyAnnotations,
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const result = await viewer.read(args, callOptions(extra));
      if (isFailure(result)) {
        return failure(result);
      }
      return {
        content: [
          {
            type: 'text',
            text: `Bytes ${String(result.offset)}+${String(result.byteLength)} of ${String(result.totalBytes)}.`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  const viewState = server.registerTool(
    tauViewerToolName.viewState,
    {
      description: descriptions.viewState,
      inputSchema: viewStateInputSchema,
      annotations: readOnlyAnnotations,
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const result = await viewer.viewState(args, callOptions(extra));
      if (isFailure(result)) {
        return failure(result);
      }
      const { view, image, captureError } = result;
      return {
        content: [
          {
            type: 'text',
            text:
              captureError === undefined ? describeView(view) : `${describeView(view)}\nNo capture: ${captureError}`,
          },
          ...(image === undefined ? [] : [{ type: 'image', data: image.data, mimeType: image.mimeType } as const]),
        ],
        structuredContent: { view, ...(captureError === undefined ? {} : { captureError }) },
      };
    },
  );
  const appSync = server.registerTool(
    tauViewerToolName.appSync,
    {
      description: descriptions.appSync,
      inputSchema: appSyncInputSchema,
      annotations: liveLinkAnnotations,
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const result = await viewer.sync(args, callOptions(extra));
      return isFailure(result)
        ? failure(result)
        : { content: [{ type: 'text', text: `Version ${String(result.version)}.` }], structuredContent: result };
    },
  );
  const appCaptureReply = server.registerTool(
    tauViewerToolName.appCaptureReply,
    {
      description: descriptions.appCaptureReply,
      inputSchema: appCaptureReplyInputSchema,
      annotations: liveLinkAnnotations,
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const result = await viewer.captureReply(args, callOptions(extra));
      return isFailure(result)
        ? failure(result)
        : {
            content: [{ type: 'text', text: result.accepted ? 'Capture received.' : 'No capture was waiting.' }],
            structuredContent: result,
          };
    },
  );
  const appShareLink = server.registerTool(
    tauViewerToolName.appShareLink,
    {
      description: descriptions.appShareLink,
      inputSchema: appShareLinkInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: alwaysLoad,
    },
    async (args, extra) => {
      const result =
        viewer.shareLink === undefined
          ? { errorCode: 'NOT_SUPPORTED', message: 'This Tau server cannot make share links.' }
          : await viewer.shareLink(args, callOptions(extra));
      return isFailure(result)
        ? failure(result)
        : {
            /* The answer carries the packed project; its text stays short. */
            content: [{ type: 'text', text: 'The project is packed for a direct link.' }],
            structuredContent: result,
          };
    },
  );
  const pageTools = (viewer.pageTools ?? []).map((tool) =>
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: alwaysLoad,
      },
      async (args: Readonly<Record<string, unknown>>, extra) => {
        const result = await tool.call(args, callOptions(extra));
        return isFailure(result)
          ? failure(result)
          : { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: { ...result } };
      },
    ),
  );

  const pageMeta = (entrypoint?: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
    ...alwaysLoad,
    ui: { resourceUri },
    'ui/resourceUri': resourceUri,
    ...(presentation === 'openai'
      ? { 'openai/outputTemplate': resourceUri, ...(entrypoint ? { 'openai/ui': { entrypoints: [entrypoint] } } : {}) }
      : {}),
  });
  const present = (tool: RegisteredTool, enabled: boolean, meta: Record<string, unknown>): void => {
    /* Assigned, not `update()`d: `update` sends a list-changed notice, and the
     * client has not finished initializing. */
    tool.enabled = enabled;
    tool._meta = meta;
  };
  const applyPresentation = (): void => {
    const hasPage = presentation !== 'text';
    present(showModel, true, hasPage ? pageMeta({ type: 'thread' }) : { ...alwaysLoad });
    present(openModelFile, presentation === 'openai', pageMeta({ type: 'file', extensions: fileEntrypointExtensions }));
    present(browseModels, presentation === 'openai', pageMeta({ type: 'global' }));
    present(appRead, hasPage, { ...alwaysLoad, ui: { resourceUri, visibility: ['app'] } });
    /* A text host's loopback page syncs over HTTP, so view_state serves every presentation. */
    present(viewState, true, { ...alwaysLoad });
    present(appSync, hasPage, { ...alwaysLoad, ui: { resourceUri, visibility: ['app'] } });
    present(appCaptureReply, hasPage, { ...alwaysLoad, ui: { resourceUri, visibility: ['app'] } });
    for (const tool of pageTools) {
      present(tool, hasPage, { ...alwaysLoad, ui: { resourceUri, visibility: ['app'] } });
    }
    present(appShareLink, hasPage && viewer.shareLink !== undefined, {
      ...alwaysLoad,
      ui: { resourceUri, visibility: ['app'] },
    });
  };
  applyPresentation();

  const previous = server.server.oninitialized;
  server.server.oninitialized = () => {
    presentation = resolveTauViewerPresentation({
      capabilities: server.server.getClientCapabilities(),
      clientInfo: server.server.getClientVersion(),
    });
    applyPresentation();
    previous?.();
  };
};
