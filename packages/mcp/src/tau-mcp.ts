import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  JSONRPCMessage,
  ServerNotification,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { rpcName, testModelStatusRule, toolName } from '@taucad/chat/constants';
import { exportModelInputSchema, exportModelOutputSchema } from '@taucad/chat/schemas/tools/export-model';
import { evaluateModelInputSchema, evaluateModelOutputSchema } from '@taucad/chat/schemas/tools/evaluate-model';
import {
  screenshotArtifactImageSchema,
  screenshotInputSchema,
  screenshotMcpOutputSchema,
} from '@taucad/chat/schemas/tools/screenshot';
import { tauLaunchSchema, testModelInputSchema, testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import { summarizeTestModelOutput } from '@taucad/chat/schemas/tools/test-model-summary';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load this package's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../package.json' with { type: 'json' };
import { registerTauMcpViewer } from '#tau-mcp-viewer.js';
import type { TauMcpViewer } from '#tau-mcp-viewer.js';
import { codexClientName } from '#viewer-protocol.js';

const exposedRpcNames = [
  rpcName.evaluateModel,
  rpcName.runGeoSpecTests,
  rpcName.captureImages,
  rpcName.exportModel,
] as const;

const exposedToolNames = [
  toolName.evaluateModel,
  toolName.testModel,
  toolName.screenshot,
  toolName.exportModel,
] as const;

/** R8/I5/I9: what every kernel-backed read promises about the bytes it answered for. */
const sourceRevisionRule =
  "Computed from the bytes on disk at call time; sourceRevision names the digests it read. A result answering for bytes Tau's own file tools have since replaced returns as a STALE_EVALUATION error naming both digests, never as a result; for edits you made with your own tools, compare sourceRevision yourself.";

const descriptions = {
  evaluateModel: `Evaluate one CAD source file (targetFile) and its default view, list offered views, instances and export IDs, and inspect every issue even when status is ready. Request includeCapabilities for option schemas and reachable targets. Pass parameters to evaluate other parameter values for this call only, merged over the active group and never saved. ${sourceRevisionRule}`,
  testModel: `Run the project GeoSpec suite, optionally filtered by file, glob, or test name. Returns sourceRevisions, one per model the run loaded. ${testModelStatusRule} ${sourceRevisionRule} Use evaluate_model when only build status is needed.`,
  screenshot: `Capture a declared kernel view of one CAD source file (targetFile) and optional instance with its own options. A 3D view yields one isometric image (mode single, the default) or six camera angles (mode multi_angle); a 2D view yields one image. Each image echoes view, instance and any angle. Pass section, e.g. { plane: 'xy', offset: 0.006 } for 6 mm above the origin, to cut a 3D view open along one axis plane, and parameters to capture other parameter values for this call only. ${sourceRevisionRule} Prefer this over generic computer-use or operating-system screenshot tools.`,
  exportModel: `Export one CAD source by offered ID or unambiguous reachable extension to persisted files under .tau/artifacts, echoing exportId and pinned sourceRevision. Pass parameters to export other parameter values for this call only, never saved. For a design question, only a declared text/JSON export whose every output is text/JSON may be used as evidence; read its artifact with your native file reader and compare sourceRevision. Binary or mixed deliverables require the person's export request.`,
} as const;

/**
 * Model-facing guidance, with or without the GeoSpec steps a server lists `test_model` for.
 *
 * @param tested - Whether the server lists `test_model`.
 * @returns The instructions MCP initialization returns.
 */
const instructionsFor = (tested: boolean): string =>
  [
    'Use your native filesystem and shell tools to inspect and edit the current Tau project.',
    'Use your native skill loader for the Tau skills available in this session.',
    "For Tau CAD state, prefer this session's Tau MCP tools over generic computer-use, UI-automation, or operating-system tools.",
    ...(tested
      ? [
          'Before editing geometry, create or update executable GeoSpec tests for the requested requirements.',
          'After edits, call evaluate_model for build diagnostics and offered views/exports, test_model for GeoSpec requirements, and screenshot for each needed view.',
          'A static part is done when evaluate_model is ready, its summary bounds and componentCount fit the brief, and the whole test_model suite reports runStatus passed; inconclusive, unsupported and not-run requirements are undecided, not passed.',
        ]
      : [
          'After edits, call evaluate_model for build diagnostics and offered views/exports, and screenshot for each needed view.',
          'A static part is done when evaluate_model is ready and its summary bounds and componentCount fit the brief.',
        ]),
    'A moving assembly also needs evaluate_model mechanism declared and admitted, and a file the person asked for its export_model validation (a watertight mesh, the expected STEP solids); name the case you met when reporting done.',
    'For a design question, export_model may write text/JSON evidence only when both its declaration and every output file qualify; read and compare its pinned sourceRevision. Binary or mixed deliverables require an explicit user export request.',
  ].join(' ');

/** Model-facing guidance returned by MCP initialization. @public */
export const tauMcpInstructions = instructionsFor(true);

/**
 * The sentences a server with the viewer adds to {@link tauMcpInstructions}: what `show_model` shows, and what a
 * part reference names.
 */
const viewerInstruction = [
  'When the person should look at a model, call show_model on its source after evaluate_model succeeds: the Tau viewer shows the source with its parameters and mechanism, or returns a link to share; showing an exported file shows that file only.',
  'A reference like @cad[main.ts#component:node-1] names a part: the model file before # and the component id after it; when no reference reaches you, view_state lists the parts the person selected and added to chat with those ids, which show_model select and arrange_workbench also take.',
].join(' ');

/** {@link serverVersion}, read once. */
let installedVersion: string | undefined;

/**
 * This package's version as installed. A preview release rewrites the manifest after the build inlined it, so the
 * manifest beside the module is read first; a bundle with no manifest there keeps the inlined one.
 *
 * @returns The version `serverInfo` and the identity sentence name.
 */
const serverVersion = (): string => {
  if (installedVersion === undefined) {
    installedVersion = packageJson.version;
    try {
      const manifest: unknown = JSON.parse(
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
      );
      if (
        typeof manifest === 'object' &&
        manifest !== null &&
        Reflect.get(manifest, 'name') === packageJson.name &&
        typeof Reflect.get(manifest, 'version') === 'string'
      ) {
        installedVersion = String(Reflect.get(manifest, 'version'));
      }
    } catch {
      /* No manifest beside this module: the inlined version stands. */
    }
  }
  return installedVersion;
};

/**
 * Which Tau CLI the agent plugin's launcher started, and why: the `TAU_LAUNCH` descriptor (agent plugin install
 * hardening, section 4.3). The same shape as `@taucad/chat`'s `tauLaunchSchema`, declared here because a published
 * declaration cannot name a private library; {@link parseTauMcpLaunch} and the `test_model` runtime check the two
 * agree.
 *
 * @public
 */
export type TauLaunch = {
  /** `TAU_CLI` (explicit), a checkout build (workspace), a tau on PATH (installed), or npx. */
  source: 'explicit' | 'workspace' | 'installed' | 'npx';
  /** The tau the launcher ran, for explicit and installed. */
  path?: string | undefined;
  /** That CLI version, when known. */
  cli?: string | undefined;
  /** The agent plugin version. */
  plugin: string;
  /** The Node.js version running the launcher. */
  node: string;
  /** Installed tau executables passed over, with what each printed for `--version`. */
  skipped: Array<{ path: string; version?: string | undefined }>;
};

/** Which CLI serves, and how it was started: the identity `initialize` names (INS-2). @public */
export type TauMcpRuntime = Readonly<{
  /** The serving Tau CLI's version. */
  version: string;
  /** The agent plugin launcher's descriptor; absent when the CLI was started directly. */
  launch?: TauLaunch | undefined;
}>;

/**
 * The launcher descriptor the agent plugin hands `tau mcp` as `TAU_LAUNCH`.
 *
 * @param value - The variable's text, if set.
 * @returns The descriptor, or `undefined` when it is unset or is not one.
 * @public
 */
export const parseTauMcpLaunch = (value: string | undefined): TauLaunch | undefined => {
  if (value === undefined || value === '') {
    return undefined;
  }
  try {
    const parsed = tauLaunchSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

/** The longest identity sentence; a longer one drops paths, then clauses, keeping the instructions budget. */
const identityLimit = 250;

/** A semantic version, as a matching `tau --version` prints it. */
const versionLike = /^\d+\.\d+\.\d+(?:[-+][\w.+-]{1,48})?$/u;

/**
 * The sentence naming which CLI, launcher rung and Node.js started this server.
 *
 * @param runtime - The serving CLI and its launch.
 * @returns One sentence for the `initialize` instructions.
 */
const identityInstruction = ({ version, launch }: TauMcpRuntime): string => {
  const server = `server ${packageJson.name} ${serverVersion()}.`;
  if (launch === undefined) {
    return `Tau CLI ${version} started directly; ${server}`;
  }
  /* Each path is named while the sentence stays within its limit: the serving tau's first, then the skipped one's;
   * then the skipped clause goes, and last the plugin and Node.js versions. */
  const sentence = (paths: number, skippedClause: boolean): string => {
    const at = (path: string | undefined, rank: number): string =>
      rank <= paths && path !== undefined ? ` at ${path}` : '';
    const chosen = {
      explicit: `TAU_CLI${at(launch.path, 1)}`,
      workspace: 'workspace build',
      installed: `installed tau${at(launch.path, 1)}`,
      npx: 'npx',
    }[launch.source];
    const [first, ...others] = launch.skipped;
    /* A skipped tau printed what it printed; only a version is repeated to the agent. */
    const printed =
      first?.version !== undefined && versionLike.test(first.version) ? first.version : 'of unknown version';
    const skipped =
      first === undefined || !skippedClause
        ? ''
        : `; installed tau ${printed}${at(first.path, 2)}${others.length === 0 ? '' : ` and ${String(others.length)} more`} skipped`;
    return `Tau CLI ${version} (${chosen}${skipped}) started by plugin ${launch.plugin} on Node.js ${launch.node}; ${server}`;
  };
  const fitting = [sentence(2, true), sentence(1, true), sentence(0, true), sentence(0, false)].find(
    (named) => named.length <= identityLimit,
  );
  return fitting ?? `Tau CLI ${version} started by the agent plugin; ${server}`.slice(0, identityLimit);
};

/** RPC names exposed to external agents through Tau MCP. @public */
export type TauMcpRpcName = (typeof exposedRpcNames)[number];

/** MCP tool names exposed to external agents. @public */
export type TauMcpToolName = (typeof exposedToolNames)[number];

/** Execution metadata forwarded from MCP to the selected Tau authority. @public */
export type TauMcpDispatchOptions = {
  /** Stable identifier used to deduplicate one tool request within a run. */
  toolCallId: string;
  /** Cancels the underlying browser or headless operation. */
  signal?: AbortSignal;
  /**
   * The client's request `_meta`, verbatim. Codex names the thread's project
   * folder here (`codex/sandbox-state-meta`, sent to a server that declares that
   * experimental capability), since it advertises no MCP roots.
   */
  meta?: Readonly<Record<string, unknown>> | undefined;
  /**
   * Ask the person to approve one effect, through the client's own form elicitation. Present only on a host tool's
   * call and only when the client declared form elicitation at `initialize`; absent, no person can answer here and
   * the host must leave the effect for Tau's own surface (blueprint E9).
   */
  confirm?: TauMcpConfirm | undefined;
  /**
   * Report progress on this call as `notifications/progress`. Present only on a call whose client sent a
   * `progressToken`; best-effort, since a client may drop a report that races the result, and it never rejects.
   * `progress` must increase with every report.
   */
  progress?: TauMcpProgress | undefined;
};

/** One progress report on a host tool's call, as {@link TauMcpDispatchOptions.progress} sends it. @public */
export type TauMcpProgress = (
  report: Readonly<{
    progress: number;
    total?: number | undefined;
    message?: string | undefined;
  }>,
) => Promise<void>;

/**
 * One approval question asked through the MCP client (blueprint E9, W11).
 *
 * The client draws its own form with one checkbox. `approved` needs the person to tick it and accept; leaving it
 * unticked or declining is `denied`; dismissing the form, or the call being cancelled, is `cancelled`. It rejects
 * when the client could not ask: it refused or failed the form request, or no answer came within ten minutes. That is
 * not the person's answer, so the effect is left for them in Tau, as for a client that draws no forms.
 *
 * @public
 */
export type TauMcpConfirm = (
  request: Readonly<{
    /** What would happen, in the person's words. */
    message: string;
    /** The checkbox label. */
    label: string;
  }>,
) => Promise<'approved' | 'denied' | 'cancelled'>;

/** How long a person has to answer an approval form before the client counts as unable to ask. */
const confirmLimit = 10 * 60 * 1000;

/** One validated call into Tau's canonical RPC dispatcher. @public */
export type TauMcpRpcCall = Readonly<{
  rpcName: TauMcpRpcName;
  args: Readonly<Record<string, unknown>>;
}>;

/**
 * One validated call to a host tool registered beside the CAD four.
 *
 * Host tools have no canonical chat RPC; the host resolves them by tool name
 * in its own registry (the print request tools, blueprint D5).
 *
 * @public
 */
export type TauMcpToolCall = Readonly<{
  toolName: string;
  args: Readonly<Record<string, unknown>>;
}>;

/** Any call the MCP adapter makes into the host. @public */
export type TauMcpHostCall = TauMcpRpcCall | TauMcpToolCall;

/**
 * One host tool exposed over MCP beside the CAD four.
 *
 * The input schema is the draft-07 JSON Schema the host registry already
 * publishes to models (`$schema` may be omitted; shared definitions live under
 * `definitions`). It is converted for the SDK once, when the server or handler
 * is created; the SDK validates arguments before the host sees them and
 * serializes the same schema back to `tools/list`.
 *
 * @public
 */
export type TauMcpHostTool = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  annotations?: ToolAnnotations | undefined;
}>;

/** A successful canonical RPC result. @public */
export type TauMcpRpcSuccess = Readonly<{ success: true } & Record<string, unknown>>;

/** A business or transport failure returned by the canonical RPC dispatcher. @public */
export type TauMcpRpcFailure = Readonly<{
  success?: false;
  errorCode: string;
  message: string;
  rpcName?: string;
  validationErrors?: ReadonlyArray<{ path: string; message: string }>;
  rawOutput?: unknown;
}>;

/** Transport-neutral port implemented by browser-backed and headless Tau authorities. @public */
export type TauMcpDispatch = (
  call: TauMcpHostCall,
  options: TauMcpDispatchOptions,
) => Promise<TauMcpRpcSuccess | TauMcpRpcFailure>;

/** Options shared by every server constructor in this package. @public */
export type TauMcpServerOptions = Readonly<{
  /** Canonical RPC dispatch function for one authorized run. */
  dispatch: TauMcpDispatch;
  /** Host tools registered beside the CAD four, dispatched by name. */
  hostTools?: readonly TauMcpHostTool[] | undefined;
  /**
   * The CAD tools this server lists, from {@link tauMcpToolNames}; all four
   * when omitted. A host withholds one it cannot run, such as `test_model`
   * without a GeoSpec engine, so a client is never offered a failing tool.
   */
  cadTools?: readonly TauMcpToolName[] | undefined;
  /**
   * How `screenshot` returns its images. `attachments` (the default) returns
   * file paths and links in `structuredContent`. `inline` returns each image as
   * an MCP image block the client shows its model, with the paths in text and
   * no output schema; the dispatcher must then fill each image's `dataUrl`.
   */
  screenshotImages?: 'attachments' | 'inline' | undefined;
  /**
   * The viewer page and the host port behind its tools. With it, the server
   * serves the page as a `ui://` resource and registers `show_model` and the
   * page's tools, presented per client (blueprint D5).
   */
  viewer?: TauMcpViewer | undefined;
  /**
   * The serving CLI and how it was started. With it, the `initialize` instructions end with one sentence naming the
   * CLI version, the launcher's rung, the plugin and Node.js versions, and this server's version.
   */
  runtime?: TauMcpRuntime | undefined;
}>;

/** The streams {@link serveTauMcpStdio} speaks over, when not this process's own stdin and stdout. @public */
export type TauMcpStdioStreams = Readonly<{
  stdin?: Readable | undefined;
  stdout?: Writable | undefined;
}>;

/** Options for one stateless Streamable HTTP MCP request. @public */
export type TauMcpHttpRequestOptions = Readonly<{
  request: IncomingMessage;
  response: ServerResponse;
  body?: unknown;
  dispatch: TauMcpDispatch;
  /** Stable, non-secret identity of the capability authorized for this request. */
  authorityKey: string;
}>;

/** Stateful SDK transport owner for one API process. @public */
export type TauMcpHttpHandler = Readonly<{
  handle(options: TauMcpHttpRequestOptions): Promise<void>;
  close(): Promise<void>;
}>;

/** Public metadata for one Tau MCP tool. @public */
export type TauMcpToolDefinition = Readonly<{
  description: string;
  inputSchema: ZodType;
  outputSchema: ZodType;
}>;

const canonicalToolDefinitions = {
  [toolName.evaluateModel]: {
    description: descriptions.evaluateModel,
    inputSchema: evaluateModelInputSchema,
    outputSchema: evaluateModelOutputSchema,
  },
  [toolName.testModel]: {
    description: descriptions.testModel,
    inputSchema: testModelInputSchema,
    outputSchema: testModelOutputSchema,
  },
  [toolName.screenshot]: {
    description: descriptions.screenshot,
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotMcpOutputSchema,
  },
  [toolName.exportModel]: {
    description: descriptions.exportModel,
    inputSchema: exportModelInputSchema,
    outputSchema: exportModelOutputSchema,
  },
} as const;

/** Public metadata for Tau's four CAD MCP tools. @public */
export const tauMcpToolDefinitions: Readonly<Record<TauMcpToolName, TauMcpToolDefinition>> = canonicalToolDefinitions;

/** Names of every tool exported by the Tau MCP surface. @public */
export const tauMcpToolNames = Object.freeze(Object.keys(canonicalToolDefinitions)) as readonly TauMcpToolName[];

/** One call from an MCP transport into Tau's canonical RPC dispatcher. @public */
export type TauMcpCall = {
  name: TauMcpToolName;
  arguments: unknown;
  toolCallId: string;
  signal?: AbortSignal;
  meta?: Readonly<Record<string, unknown>> | undefined;
  /** Reports the call's progress, when its client sent a `progressToken`. */
  progress?: TauMcpProgress | undefined;
};

/** MCP adapter backed by a browser or headless Tau RPC authority. @public */
export type TauMcpAdapter = {
  call(input: TauMcpCall): Promise<CallToolResult>;
};

/** Longest detail line a failure carries: validation errors are short, a raw tool output can be megabytes of image data. */
const failureDetailLimit = 2000;

/**
 * A failure as text alone: `CODE: message`, then one JSON line with any
 * validation errors and raw output.
 *
 * Never `structuredContent`: a client validates it against the tool's output
 * schema even on an error, which a failure never matches, so the client would
 * replace the kernel's diagnostic with its own schema error.
 *
 * @param failure - The dispatcher's failure.
 * @returns The error result the agent reads.
 */
const rpcFailure = ({ errorCode, message, validationErrors, rawOutput }: TauMcpRpcFailure): CallToolResult => {
  const details =
    validationErrors === undefined && rawOutput === undefined ? '' : JSON.stringify({ validationErrors, rawOutput });
  // ponytail: a clipped detail line is no longer valid JSON; the code and message above it stay whole.
  const clipped = details.length > failureDetailLimit ? `${details.slice(0, failureDetailLimit)}…` : details;
  return {
    isError: true,
    content: [
      { type: 'text', text: clipped === '' ? `${errorCode}: ${message}` : `${errorCode}: ${message}\n${clipped}` },
    ],
  };
};

const rpcSuccess = (result: Record<string, unknown>): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
});

const testModelSuccess = (result: z.infer<typeof testModelOutputSchema>): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: `${summarizeTestModelOutput(result).line}${
        result.fullResult ? ` Full report: ${result.fullResult.absolutePath ?? result.fullResult.path}.` : ''
      }`,
    },
  ],
  structuredContent: result,
});

/**
 * A screenshot result as a dispatcher returns it: the MCP result, plus each
 * image's bytes for an `inline` server. The bytes never reach `structuredContent`.
 */
const screenshotDispatchSchema = screenshotMcpOutputSchema.extend({
  images: z
    .array(
      screenshotArtifactImageSchema.extend({
        dataUrl: z
          .string()
          .regex(/^data:image\/(?:png|webp);base64,/u)
          .optional(),
      }),
    )
    .min(1),
});

type ScreenshotDispatch = z.infer<typeof screenshotDispatchSchema>;

const capturedViews = (result: ScreenshotDispatch): string =>
  // The message says what the images leave out of the viewer, so a client that reads only text still learns it.
  `Captured ${String(result.images.length)} CAD ${result.images.length === 1 ? 'view' : 'views'}.${result.message === undefined ? '' : ` ${result.message}`}`;

const screenshotSuccess = (result: ScreenshotDispatch): CallToolResult => {
  const images = result.images.map(({ dataUrl: _dataUrl, ...image }) => image);
  return {
    content: [
      {
        type: 'text',
        text: `${capturedViews(result)} Open each local image with your image-viewing tool:\n${images.map(({ view, absolutePath }) => `${view}: ${absolutePath}`).join('\n')}`,
      },
      ...images.map(({ view, absolutePath, mimeType }): CallToolResult['content'][number] => ({
        type: 'resource_link',
        uri: pathToFileURL(absolutePath).href,
        name: `${view} screenshot`,
        mimeType,
      })),
    ],
    structuredContent: { ...result, images },
  };
};

/**
 * A screenshot result as image blocks the client shows its model, in the
 * order the text lists them, with no `structuredContent` (the tool declares no
 * output schema in this mode). The provenance a structured result would carry
 * rides the text instead.
 *
 * @param result - The dispatcher's result, with each image's bytes.
 * @returns The text summary, then one image block per image that has bytes.
 */
const screenshotInline = (result: ScreenshotDispatch): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: [
        `${capturedViews(result)} The images follow in this order; each is also saved locally:`,
        ...result.images.map(
          ({ view, instance, angle, absolutePath, byteLength }) =>
            `${[view, instance, angle].filter((part) => part !== undefined).join(' ')}: ${absolutePath} (${String(byteLength)} bytes)`,
        ),
        ...(result.sourceRevision === undefined ? [] : [`sourceRevision: ${JSON.stringify(result.sourceRevision)}`]),
        ...(result.projectRoot === undefined ? [] : [`projectRoot: ${result.projectRoot}`]),
      ].join('\n'),
    },
    ...result.images.flatMap(({ dataUrl, mimeType }): CallToolResult['content'] =>
      dataUrl === undefined ? [] : [{ type: 'image', data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType }],
    ),
  ],
});

const withoutSuccess = <Value extends { success: true }>(result: Value): Omit<Value, 'success'> => {
  const { success: _success, ...value } = result;
  return value;
};

/**
 * Validate MCP tool calls and map them onto canonical Tau RPC dispatch.
 *
 * @param options - Canonical RPC dispatch function for one authorized run, and how screenshots return.
 * @returns An adapter that validates and maps MCP calls to Tau RPC calls.
 * @public
 */
export const createTauMcpAdapter = (
  options: Pick<TauMcpServerOptions, 'dispatch' | 'screenshotImages'>,
): TauMcpAdapter => ({
  async call(input) {
    input.signal?.throwIfAborted();
    const dispatchOptions = {
      toolCallId: input.toolCallId,
      signal: input.signal,
      meta: input.meta,
      progress: input.progress,
    };

    switch (input.name) {
      case toolName.evaluateModel: {
        const args = evaluateModelInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.evaluateModel, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(evaluateModelOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.testModel: {
        const args = testModelInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.runGeoSpecTests, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return testModelSuccess(testModelOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.screenshot: {
        const args = screenshotInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.captureImages, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        const capture = screenshotDispatchSchema.parse(withoutSuccess(result));
        return options.screenshotImages === 'inline' ? screenshotInline(capture) : screenshotSuccess(capture);
      }
      case toolName.exportModel: {
        const args = exportModelInputSchema.parse(input.arguments);
        const result = await options.dispatch(
          { rpcName: rpcName.exportModel, args: { ...args, toolCallId: input.toolCallId } },
          dispatchOptions,
        );
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(exportModelOutputSchema.parse(withoutSuccess(result)));
      }
    }
  },
});

const hostToolArgumentsSchema = z.record(z.string(), z.unknown());

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const artifactWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/**
 * Asks Claude Code to list the tool upfront instead of deferring it behind
 * tool search; other clients ignore unknown `_meta`.
 */
const alwaysLoad = { 'anthropic/alwaysLoad': true };

/** A host tool beside the SDK schema converted from its JSON Schema. */
type SdkHostTool = Readonly<{ tool: TauMcpHostTool; inputSchema: ZodType }>;

/**
 * Convert host tool schemas for the SDK.
 *
 * Host schemas are draft-07 without `$schema`; read without a dialect, a shared
 * definition's `#/definitions/...` reference cannot resolve. A schema that
 * still cannot convert is a host bug, reported here with the tool's name.
 *
 * @param tools - Host tools as the host registry publishes them.
 * @returns Each tool with its SDK input schema.
 * @throws Error naming the first tool whose schema cannot convert.
 */
const toSdkHostTools = (tools: readonly TauMcpHostTool[] = []): readonly SdkHostTool[] =>
  tools.map((tool) => {
    try {
      return { tool, inputSchema: z.fromJSONSchema(tool.inputSchema, { defaultTarget: 'draft-7' }) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Tau MCP host tool ${tool.name} has an input schema the MCP server cannot use: ${reason}`, {
        cause: error,
      });
    }
  });

/**
 * Register the CAD four and already converted host tools.
 *
 * @param server - MCP server that owns the transport lifecycle.
 * @param options - Canonical RPC dispatch function for one authorized run, and how screenshots return.
 * @param hostTools - Host tools with their SDK schemas.
 * @returns Nothing.
 */
/**
 * The approval question for one host tool call, when the client can draw a form.
 *
 * @param server - The server whose client is asked.
 * @param extra - The call's request id and cancellation, so the form belongs to that call.
 * @returns The question, or `undefined` when the client declared no form elicitation. The question rejects when
 *   the client fails to ask it.
 */
const confirmFor = (
  server: McpServer,
  extra: Readonly<{ requestId: string | number; signal: AbortSignal }>,
): TauMcpConfirm | undefined => {
  const elicitation = server.server.getClientCapabilities()?.elicitation;
  /* An empty declaration is form-only (the 2025-06-18 shape); a URL-only client cannot draw a checkbox. */
  if (elicitation === undefined || (elicitation.form === undefined && elicitation.url !== undefined)) {
    return undefined;
  }
  return async ({ message, label }) => {
    const answer = await server.server
      .elicitInput(
        {
          mode: 'form',
          message,
          requestedSchema: {
            type: 'object',
            properties: { approve: { type: 'boolean', title: label, default: false } },
            required: ['approve'],
          },
        },
        { relatedRequestId: extra.requestId, signal: extra.signal, timeout: confirmLimit },
      )
      .catch((error: unknown) => {
        /* A call cancelled while the form is open is cancelled; any other failure is the client's, not the person's. */
        if (extra.signal.aborted) {
          return undefined;
        }
        throw error;
      });
    if (answer?.action === 'accept') {
      return answer.content?.['approve'] === true ? 'approved' : 'denied';
    }
    return answer?.action === 'decline' ? 'denied' : 'cancelled';
  };
};

/**
 * The progress reporter for one call, when its client asked for progress.
 *
 * @param extra - The call's `_meta` and notification sender.
 * @returns The reporter, or `undefined` when the request carried no `progressToken`.
 */
const progressFor = (
  extra: Readonly<{
    _meta?: Readonly<{ progressToken?: string | number | undefined }> | undefined;
    sendNotification: (notification: ServerNotification) => Promise<void>;
  }>,
): TauMcpProgress | undefined => {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) {
    return undefined;
  }
  /* `progress` must rise with every notification; a report that does not is dropped. */
  let last: number | undefined;
  return async ({ progress, total, message }) => {
    if (last !== undefined && progress <= last) {
      return;
    }
    last = progress;
    try {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress,
          ...(total === undefined ? {} : { total }),
          ...(message === undefined ? {} : { message }),
        },
      });
    } catch {
      /* Best-effort: a closed transport ends the call anyway. */
    }
  };
};

const registerTools = (
  server: McpServer,
  options: Pick<TauMcpServerOptions, 'dispatch' | 'screenshotImages' | 'viewer' | 'cadTools'>,
  hostTools: readonly SdkHostTool[],
): void => {
  const { dispatch } = options;
  if (options.viewer !== undefined) {
    registerTauMcpViewer(server, options.viewer, alwaysLoad);
  }
  const adapter = createTauMcpAdapter(options);
  const offered: ReadonlySet<TauMcpToolName> = new Set(options.cadTools ?? tauMcpToolNames);

  /* An inline screenshot result carries image blocks and no structured content,
   * which a declared output schema would make the client reject. */
  const definitionOf = (
    name: TauMcpToolName,
  ): Omit<TauMcpToolDefinition, 'outputSchema'> & { outputSchema?: ZodType } =>
    name === toolName.screenshot && options.screenshotImages === 'inline'
      ? { description: descriptions.screenshot, inputSchema: screenshotInputSchema }
      : canonicalToolDefinitions[name];
  for (const name of tauMcpToolNames.filter((candidate) => offered.has(candidate))) {
    server.registerTool(
      name,
      {
        ...definitionOf(name),
        annotations: name === toolName.exportModel ? artifactWriteAnnotations : readOnlyAnnotations,
        _meta: alwaysLoad,
      },
      async (args, extra) =>
        adapter.call({
          name,
          arguments: args,
          toolCallId: randomUUID(),
          signal: extra.signal,
          meta: extra._meta,
          progress: progressFor(extra),
        }),
    );
  }
  for (const { tool, inputSchema } of hostTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema,
        ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
        _meta: alwaysLoad,
      },
      async (args, extra) => {
        extra.signal.throwIfAborted();
        const result = await dispatch(
          /* The SDK validated `args` against the tool's own schema; this only recovers the object type (CL11). */
          { toolName: tool.name, args: hostToolArgumentsSchema.parse(args) },
          {
            toolCallId: randomUUID(),
            signal: extra.signal,
            meta: extra._meta,
            confirm: confirmFor(server, extra),
            progress: progressFor(extra),
          },
        );
        return result.success === true ? rpcSuccess(withoutSuccess(result)) : rpcFailure(result);
      },
    );
  }
};

/**
 * Register Tau's CAD tools on an MCP server.
 *
 * @param server - MCP server that owns the transport lifecycle.
 * @param options - Canonical RPC dispatch function for one authorized run.
 * @returns Nothing.
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const registerTauMcpTools = (server: McpServer, options: TauMcpServerOptions): void => {
  registerTools(server, options, toSdkHostTools(options.hostTools));
};

/**
 * Create an unconnected server over already converted host tools.
 *
 * @param options - Canonical RPC dispatch function for one authorized run, and how screenshots return.
 * @param hostTools - Host tools with their SDK schemas.
 * @returns A tool-only MCP server that has not yet been connected to a transport.
 */
const createServer = (
  options: Pick<TauMcpServerOptions, 'dispatch' | 'screenshotImages' | 'viewer' | 'cadTools' | 'runtime'>,
  hostTools: readonly SdkHostTool[],
): McpServer => {
  const instructions = [
    instructionsFor((options.cadTools ?? tauMcpToolNames).includes(toolName.testModel)),
    ...(options.viewer === undefined ? [] : [viewerInstruction]),
    ...(options.runtime === undefined ? [] : [identityInstruction(options.runtime)]),
  ].join(' ');
  const server = new McpServer({ name: packageJson.name, version: serverVersion() }, { instructions });
  registerTools(server, options, hostTools);
  return server;
};

/**
 * Create one tool-only Tau MCP server.
 *
 * The supplied dispatcher must already be bound to one authorized Tau run.
 * This package deliberately owns no filesystem, project-selection, or
 * credential authority.
 *
 * @param options - Canonical RPC dispatch function for one authorized run.
 * @returns A tool-only MCP server that has not yet been connected to a transport.
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const createTauMcpServer = (options: TauMcpServerOptions): McpServer =>
  createServer(options, toSdkHostTools(options.hostTools));

/**
 * Stdio whose `initialize` answer declares `codex/sandbox-state-meta` to Codex only.
 *
 * Capabilities cannot be registered once the server is connected, and the client's name is known only once its
 * `initialize` arrives; the server records that name before it answers, so the answer is where the two meet.
 */
class CodexGatedStdioTransport extends StdioServerTransport {
  readonly #clientName: () => string | undefined;

  public constructor(stdin: Readable | undefined, stdout: Writable | undefined, clientName: () => string | undefined) {
    super(stdin, stdout);
    this.#clientName = clientName;
  }

  public override async send(message: JSONRPCMessage): Promise<void> {
    if (!('result' in message) || !('serverInfo' in message.result) || this.#clientName() !== codexClientName) {
      return super.send(message);
    }
    const { capabilities } = message.result;
    if (typeof capabilities !== 'object' || capabilities === null) {
      return super.send(message);
    }
    const experimental: unknown = Reflect.get(capabilities, 'experimental');
    return super.send({
      ...message,
      result: {
        ...message.result,
        capabilities: {
          ...capabilities,
          experimental: {
            ...(typeof experimental === 'object' && experimental !== null ? experimental : {}),
            'codex/sandbox-state-meta': {},
          },
        },
      },
    });
  }
}

/**
 * Serve one Tau MCP server over stdio.
 *
 * For a local agent that launches Tau as its own stdio server (a Codex or
 * Claude plugin). The protocol owns the output stream: nothing else may write
 * to it, so a process whose other code may print passes a stream bound to its
 * original stdout and points `process.stdout` elsewhere.
 *
 * To Codex, and only to Codex, it declares the `codex/sandbox-state-meta`
 * capability, without which Codex omits the thread's project folder from each
 * call's `_meta`; the dispatcher receives that `_meta` as `meta`.
 *
 * @param options - Dispatch and host tools, as for {@link createTauMcpServer}.
 * @param streams - Input and output streams; default this process's stdin and stdout.
 * @returns The connected server; its `onclose` fires when the transport closes.
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const serveTauMcpStdio = async (
  options: TauMcpServerOptions,
  streams: TauMcpStdioStreams = {},
): Promise<McpServer> => {
  const server = createTauMcpServer(options);
  await server.connect(
    new CodexGatedStdioTransport(streams.stdin, streams.stdout, () => server.server.getClientVersion()?.name),
  );
  return server;
};

/**
 * Create an MCP Streamable HTTP handler with standard session semantics.
 *
 * MCP cancellation notifications arrive on a request after the tool-call POST,
 * so the SDK server and transport live for the session rather than one HTTP
 * request. Every request must present the same server-verified authority key;
 * a session id alone never grants access. Host tool schemas are converted here,
 * once, so a schema the SDK cannot use fails the handler's creation rather than
 * every client's `initialize`.
 *
 * @param handlerOptions - Host tools every session of this handler exposes beside the CAD tools it lists.
 * @returns A stateful HTTP handler and its process-lifetime cleanup function.
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const createTauMcpHttpHandler = (
  handlerOptions: Readonly<Pick<TauMcpServerOptions, 'hostTools' | 'cadTools'>> = {},
): TauMcpHttpHandler => {
  const hostTools = toSdkHostTools(handlerOptions.hostTools);
  type Session = {
    readonly server: McpServer;
    readonly transport: StreamableHTTPServerTransport;
    readonly authorityKey: string;
  };
  const sessions = new Map<string, Session>();
  const requestDispatch = new AsyncLocalStorage<TauMcpDispatch>();

  const reject = (response: ServerResponse, status: number, message: string): void => {
    response
      .writeHead(status, { 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32_000, message }, id: null }));
  };

  const handle = async (options: TauMcpHttpRequestOptions): Promise<void> => {
    const sessionHeader = options.request.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        reject(options.response, 404, 'MCP session not found.');
        return;
      }
      if (session.authorityKey !== options.authorityKey) {
        reject(options.response, 403, 'MCP session authority mismatch.');
        return;
      }
      await requestDispatch.run(options.dispatch, async () =>
        session.transport.handleRequest(options.request, options.response, options.body),
      );
      return;
    }

    if (options.request.method !== 'POST' || !isInitializeRequest(options.body)) {
      reject(options.response, 400, 'MCP initialization or session id required.');
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (initializedSessionId) => {
        sessions.set(initializedSessionId, session);
      },
      onsessionclosed: (closedSessionId) => {
        sessions.delete(closedSessionId);
      },
    });
    const server = createServer(
      {
        dispatch: async (call, dispatchOptions) => {
          const dispatch = requestDispatch.getStore();
          if (!dispatch) {
            return { errorCode: 'MCP_RUN_INACTIVE', message: 'This MCP request has no active Tau authority.' };
          }
          return dispatch(call, dispatchOptions);
        },
        cadTools: handlerOptions.cadTools,
      },
      hostTools,
    );
    const session: Session = { server, transport, authorityKey: options.authorityKey };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- The SDK transport exposes an onclose callback, not EventTarget.
    transport.onclose = () => {
      const initializedSessionId = transport.sessionId;
      if (initializedSessionId) {
        sessions.delete(initializedSessionId);
      }
    };

    try {
      await server.connect(transport);
      await requestDispatch.run(options.dispatch, async () =>
        transport.handleRequest(options.request, options.response, options.body),
      );
    } catch (error) {
      await server.close();
      throw error;
    }
  };

  return {
    handle,
    close: async () => {
      const active = [...new Set(sessions.values())];
      sessions.clear();
      await Promise.all(active.map(async ({ server }) => server.close()));
    },
  };
};
