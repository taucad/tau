/**
 * One ACP session per Tau chat, and each turn projected into the durable log.
 *
 * V2: `session/new` happens once per chat, `session/prompt` once per turn,
 * `session/cancel` stops the prompt and nothing else, and `session/close` ends
 * the session on relinquish, host close or idle eviction. Correctness comes
 * from `session/resume`, never from the process staying alive: a cold start
 * resumes (or, for an adapter that only advertises `loadSession`, loads) and
 * only a session neither can restore starts fresh.
 *
 * OQ-X2 answered thin: `session/update` becomes the *same* provider messages a
 * Tau run records, so one client projection renders both and no second
 * transcript store exists. The mapping is deliberately lossy where ACP carries
 * presentation rather than history:
 *
 * | ACP `session/update` | Durable event |
 * | --- | --- |
 * | `agent_message_chunk` | accumulated, then one `message.appended` assistant message per ACP message id |
 * | `agent_thought_chunk` | accumulated, then one `message.appended` assistant message carrying a `thinking` block — the same shape a Tau turn's reasoning takes |
 * | `tool_call` | `message.appended` `tool-input`, `toolName` = the agent's own programmatic tool name, content = its raw input, `call` = the agent's own id, kind, title, status, native name, locations, rendered content and `_meta`; a call that arrives already terminal also writes its `tool-output` row |
 * | `tool_call_update` (`completed`/`failed`) | `message.appended` `tool-output`, content = raw output, `isError` on `failed`, `call` = the fullest facts seen, at their final status |
 * | `tool_call_update` (`pending`/`in_progress`) | merged into the open call's facts; no row of its own, so a refinement the terminal update omits still reaches the result |
 * | `usage_update`, `PromptResponse.usage` | **durable**: the turn's last assistant message carries `metadata.usage`, `metadata.responseModel` and the vendor's own cost report under `tauInternal` |
 * | `config_option_update` | **durable**: the session record's model, so the selector cannot drift from what the agent is actually running (VSC3) |
 * | `session_info_update.title` | **durable**: reported as this chat's title candidate; `updatedAt` is dropped (the log's own `recordedAt` is the honest clock) |
 * | `current_mode_update`, plans, commands | **durable latest value**: one `acp-session` assistant envelope is replaced in-place during the turn and replayed through the shared data-part path |
 * | `compaction_*` | never sent: an agent may only send these to a client that advertised the capability, and `initialize` does not |
 *
 * Every ruling above is explicit on purpose (V13): a variant that is dropped is
 * dropped for a stated reason, so the next reader can tell "decided against"
 * from "never looked at".
 *
 * The `call` field is the *shared* tool vocabulary, not an external one (N11):
 * a Tau-dispatched call records the same shape, so one client projection
 * renders both and no `tau_external_tool` namespace exists.
 *
 * Every message carries `tauInternal.origin = 'external'` so a reader can tell
 * an agent-executed tool call from one Tau dispatched itself — an additive
 * marker on existing metadata, never a new event type.
 *
 * `session/request_permission` becomes the host's durable approval inbox
 * (OQ-X4), and the client filesystem methods are confined to the session `cwd`
 * and read-only over Tau's own control metadata inside it (I-MASK): SP-4
 * observed a real adapter writing outside its directory, so both boundaries are
 * enforced here rather than trusted.
 *
 * **A notification only reaches the log while a turn is in flight.** That is
 * the replay guard the `session/load` fallback needs: an adapter streams the
 * whole conversation back inside the load request, and re-appending it would
 * duplicate the chat on every cold start. There is no turn open then, so there
 * is nowhere for a replayed update to go.
 */

import { dirname, resolve, sep } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { CreateElicitationRequest as CreateElicitationRequestGuards, client } from '@agentclientprotocol/sdk';
import type {
  AgentCapabilities,
  AuthMethod,
  ClientCapabilities,
  ClientConnection,
  ContentBlock,
  CreateElicitationRequest,
  Implementation,
  McpServer,
  PermissionOption,
  SessionConfigOption,
  SessionUpdate,
  StopReason,
  Usage as AcpUsage,
} from '@agentclientprotocol/sdk';

import type { ExternalAgentTurn } from '@taucad/agent-host/node-launcher';
import type {
  ExternalAgentLogin,
  JsonObject,
  JsonValue,
  ProviderMessage,
  ProviderMessageMetadata,
  ToolInputProviderMessage,
} from '@taucad/agent-host';

import { spawnAcpAdapter } from '#acp/spawn.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import type { AcpAdapter } from '#acp/registry.js';
import { maskedPathCode } from '@taucad/agent-tools/registry';
import { classify } from '@taucad/filesystem/path-registry';
import {
  exportGeometryInputSchema,
  exportGeometryOutputSchema,
  getKernelResultInputSchema,
  getKernelResultOutputSchema,
  screenshotInputSchema,
  screenshotOutputSchema,
  testModelInputSchema,
  testModelOutputSchema,
} from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';

/** ACP protocol version this client speaks. */
const protocolVersion = 1;

/** JSON-RPC code both pinned adapters answer with when the user is logged out. */
const authRequiredCode = -32_000;

/**
 * What Tau tells the agent it can do, which is what the agent offers back.
 *
 * Two of these are the whole of V11's login story. `elicitation.url` is what
 * makes Codex offer its device-code flow — a verification URL and a code Tau
 * can render *wherever the human is*, including a browser paired to a remote
 * daemon. `_meta['terminal-auth']` is what makes Claude list its methods at
 * all, and it is the `_meta` form deliberately: plain `auth.terminal` promises
 * the agent that Tau will reproduce its invocation in a real interactive
 * terminal, which no Tau surface can honour. The `_meta` form asks instead for
 * a command line Tau can *show* the user (r4 §2).
 *
 * `terminal` stays `false`: neither pin ever calls a `terminal/*` method, and
 * advertising a capability Tau does not implement is a lie the protocol has no
 * way to catch (r4 §3).
 */
const clientCapabilities: ClientCapabilities = {
  fs: { readTextFile: true, writeTextFile: true },
  terminal: false,
  elicitation: { url: {} },
  _meta: { 'terminal-auth': true },
};

/**
 * Milliseconds of quiet before a streamed assistant block is committed.
 *
 * Text arrives as chunks and the durable log stores whole messages, so *some*
 * boundary has to exist. Idle is the honest one: a tool call, a permission
 * request or the end of the turn also flush, but an agent that narrates and
 * then works for two minutes must not leave the transcript empty until it is
 * done.
 */
const textIdleFlushDelay = 250;

/**
 * Milliseconds `session/close` is waited on before the child is killed anyway.
 *
 * Closing is a courtesy to the vendor's own bookkeeping; an adapter that has
 * stopped answering must not be able to hang host shutdown behind it.
 */
const sessionCloseTimeout = 2000;

/** What one ACP turn reported beyond the durable log. @public */
export type AcpTurnOutcome = {
  readonly stopReason: StopReason;
  /** ACP session id, so a later turn can prompt the same conversation. */
  readonly acpSessionId: string;
  /**
   * The model the session was actually on when the turn ended.
   *
   * Read back from `configOptions` rather than echoed from the request: an
   * agent may move its own session with `config_option_update` mid-turn, and a
   * selector that keeps showing what Tau *asked for* would be lying about which
   * model the user's account is being billed for (V6).
   */
  readonly model?: string | undefined;
  /** Title the agent proposed for this conversation, when it sent one. */
  readonly title?: string | undefined;
  /** Session-cumulative vendor usage retained only to derive the next turn's delta. */
  readonly usage?: AcpUsage | undefined;
};

/** The durable seams one turn needs; the session itself owns no chat state. @public */
export type AcpPromptTurn = Pick<ExternalAgentTurn, 'append' | 'approve' | 'publishLive' | 'signal'>;

/**
 * Whether the agent advertised one capability.
 *
 * ACP spells "supported" as an empty object and "not supported" as `null` or an
 * omitted field, so presence — not truthiness — is the test.
 *
 * @param capability - The capability field as `initialize` reported it.
 * @returns `true` when the agent advertised it.
 */
const advertised = (capability: unknown): boolean => capability !== null && capability !== undefined;

const isPresent = <Value>(value: Value): value is NonNullable<Value> => value !== null && value !== undefined;

/**
 * A path is inside the session's own directory, and reachable there at the
 * intended access, or it is refused.
 *
 * The path registry answers both intents: the revision control plane is
 * `hidden`, so a read of it is refused exactly as a write is, and the host's
 * records are `read-only`, so the agent may read back the account of its own
 * turn and never author it.
 *
 * @param cwd - Absolute session working directory.
 * @param path - Path the agent asked for.
 * @param intent - Whether the agent is reading or writing.
 * @returns The resolved absolute path.
 * @throws When the path escapes the working directory, or the registry refuses that access.
 */
const confine = (cwd: string, path: string, intent: 'read' | 'write'): string => {
  const resolved = resolve(cwd, path);
  if (resolved !== cwd && !resolved.startsWith(cwd + sep)) {
    throw Object.assign(new Error(`This agent may only read and write inside ${cwd}.`), { code: maskedPathCode });
  }
  const relative = resolved
    .slice(cwd.length + 1)
    .split(sep)
    .join('/');
  const { agentAccess } = classify(relative);
  if (agentAccess === 'hidden') {
    throw Object.assign(new Error(`No path under ${relative} exists for this agent.`), { code: maskedPathCode });
  }
  if (intent === 'write' && agentAccess !== 'read-write') {
    throw Object.assign(new Error(`This agent may read but not write ${relative}; Tau records that itself.`), {
      code: maskedPathCode,
    });
  }
  return resolved;
};

/**
 * Serve one `fs/read_text_file`, honouring the window ACP allows (r4 §1.6).
 *
 * `line` is 1-based and `limit` counts lines, both optional and both `null` on
 * the wire when an agent sends the field without a value.
 *
 * @param cwd - Absolute session working directory.
 * @param params - The path, and the optional line window.
 * @returns The file's text, or the requested slice of its lines.
 */
export const readSessionTextFile = async (
  cwd: string,
  params: { readonly path: string; readonly line?: unknown; readonly limit?: unknown },
): Promise<string> => {
  const content = await readFile(confine(cwd, params.path, 'read'), 'utf8');
  /* `unknown`, because ACP spells "no window" as an omitted field *and* as an
   * explicit JSON `null`, and a reader that trusted the declared type would
   * turn the second one into line zero and drop the file's first line. */
  const line = typeof params.line === 'number' ? params.line : undefined;
  const limit = typeof params.limit === 'number' ? params.limit : undefined;
  if (line === undefined && limit === undefined) {
    return content;
  }
  const from = Math.max((line ?? 1) - 1, 0);
  const lines = content.split('\n');
  return lines.slice(from, limit === undefined ? undefined : from + limit).join('\n');
};

/**
 * Serve one `fs/write_text_file`, creating the parent the agent implied.
 *
 * An agent that writes `src/new/thing.ts` has decided the directory exists;
 * refusing with `ENOENT` makes it retry with a shell it may not have (r4 §1.6).
 *
 * @param cwd - Absolute session working directory.
 * @param params - The path and the content to write.
 */
export const writeSessionTextFile = async (
  cwd: string,
  params: { readonly path: string; readonly content: string },
): Promise<void> => {
  const resolved = confine(cwd, params.path, 'write');
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, params.content, 'utf8');
};

// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an ACP payload is JSON by construction of its transport.
const asJson = (value: unknown): JsonValue => (value === undefined ? null : (value as JsonValue));

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a JSON object is a string-keyed record.
      (value as Record<string, unknown>)
    : undefined;

/**
 * The command line a `terminal-auth` method wants the *user* to run.
 *
 * Claude hands back `_meta['terminal-auth'] = {command, args, label}` when the
 * client advertised the `_meta` capability, which is a whole invocation Tau can
 * present as copyable text. X6 stands: Tau never runs it, and the credential it
 * produces stays in the vendor's own store on the user's machine.
 *
 * @param method - One method from `InitializeResponse.authMethods`.
 * @returns The command line, or `undefined` when the method has none.
 */
const terminalCommandOf = (method: AuthMethod): string | undefined => {
  const terminal = asRecord(asRecord(method._meta)?.['terminal-auth']);
  const command = terminal?.['command'];
  if (!terminal || typeof command !== 'string' || command === '') {
    return undefined;
  }
  const { args } = terminal;
  return [command, ...(Array.isArray(args) ? args.filter((entry) => typeof entry === 'string') : [])].join(' ');
};

/**
 * The login facts a surface renders, from what the agent advertised (VSC4).
 *
 * @param agentId - Agent the user has to log in to.
 * @param authMethods - Methods `initialize` listed.
 * @returns The payload of both the refusal and the durable login interrupt.
 */
const loginOf = (agentId: string, authMethods: readonly AuthMethod[]): ExternalAgentLogin => ({
  kind: 'external-agent-login',
  agentId,
  authMethods: authMethods.map((method) => {
    const terminalCommand = terminalCommandOf(method);
    return {
      id: method.id,
      name: method.name,
      ...(method.description ? { description: method.description } : {}),
      ...(terminalCommand ? { terminalCommand } : {}),
    };
  }),
});

/**
 * The login a URL elicitation is asking the user to complete.
 *
 * Codex offers its device-code flow *only* to a client that advertised
 * `elicitation.url`, and drives it entirely through this request: the URL is
 * where the user signs in, and the code — which the agent puts in `_meta`, and
 * repeats in its own message — is what that page asks for.
 *
 * @param agentId - Agent waiting on the login.
 * @param request - The `elicitation/create` parameters as received.
 * @returns The login facts, or `undefined` for a mode Tau cannot present; the
 * `url` is dropped unless it is one a browser will actually open.
 */
const urlLoginOf = (agentId: string, request: CreateElicitationRequest): ExternalAgentLogin | undefined => {
  if (!CreateElicitationRequestGuards.isUrl(request)) {
    return undefined;
  }
  const code = asRecord(request._meta)?.['code'];
  /* One guard at the writer beats one per surface: the banner, the CLI and the
   * TUI all render this record as a link, and only a page the user can open is
   * a login. A `javascript:` or `data:` url is dropped rather than refused —
   * the code and the agent's own message are still the affordance (4-review S7). */
  const protocol = URL.parse(request.url)?.protocol;
  const url = protocol === 'http:' || protocol === 'https:' ? request.url : undefined;
  return {
    kind: 'external-agent-login',
    agentId,
    authMethods: [],
    elicitationId: request.elicitationId,
    ...(url === undefined ? {} : { url }),
    ...(typeof code === 'string' ? { code } : {}),
  };
};

/** One `tool_call` or `tool_call_update`, whichever carried the facts. */
type AcpToolUpdate = Extract<SessionUpdate, { sessionUpdate: 'tool_call' | 'tool_call_update' }>;

type JsonSchema = {
  safeParse(value: unknown): { readonly success: true; readonly data: unknown } | { readonly success: false };
};

const tauMcpSchemas = {
  [toolName.getKernelResult]: { input: getKernelResultInputSchema, output: getKernelResultOutputSchema },
  [toolName.testModel]: { input: testModelInputSchema, output: testModelOutputSchema },
  [toolName.screenshot]: { input: screenshotInputSchema, output: screenshotOutputSchema },
  [toolName.exportGeometry]: { input: exportGeometryInputSchema, output: exportGeometryOutputSchema },
} as const;

type NormalizedTauMcpCall = {
  readonly toolName: keyof typeof tauMcpSchemas;
  readonly arguments: JsonValue;
  readonly outputSchema: JsonSchema;
};

const normalizedTauMcpCall = (
  update: AcpToolUpdate,
  serverName: string | undefined,
): NormalizedTauMcpCall | undefined => {
  const input = asRecord(update.rawInput);
  const name = input?.['tool'];
  if (
    serverName === undefined ||
    input?.['server'] !== serverName ||
    asRecord(update._meta)?.['is_mcp_tool_call'] !== true ||
    typeof name !== 'string' ||
    !Object.hasOwn(tauMcpSchemas, name)
  ) {
    return undefined;
  }
  const schema = tauMcpSchemas[name as keyof typeof tauMcpSchemas];
  const parsed = schema.input.safeParse(input['arguments']);
  return parsed.success
    ? { toolName: name as keyof typeof tauMcpSchemas, arguments: asJson(parsed.data), outputSchema: schema.output }
    : undefined;
};

const shortError = (value: unknown, fallback: string): string => {
  const message = asRecord(value)?.['message'];
  const text = typeof value === 'string' ? value : typeof message === 'string' ? message : JSON.stringify(value);
  return (text || fallback).slice(0, 2000);
};

const mcpResult = (
  rawOutput: unknown,
  tool: NormalizedTauMcpCall,
  failed: boolean,
): { readonly content: JsonValue; readonly isError: boolean } => {
  const envelope = asRecord(rawOutput);
  if (!envelope) {
    return {
      content: { errorCode: 'MCP_TRANSPORT_ERROR', message: 'Tau MCP returned no result envelope.' },
      isError: true,
    };
  }
  if (envelope['error'] !== null && envelope['error'] !== undefined) {
    return {
      content: { errorCode: 'MCP_TRANSPORT_ERROR', message: shortError(envelope['error'], 'Tau MCP failed.') },
      isError: true,
    };
  }
  const result = asRecord(envelope['result']);
  if (!result) {
    return {
      content: { errorCode: 'MCP_TRANSPORT_ERROR', message: 'Tau MCP returned no tool result.' },
      isError: true,
    };
  }
  if (result['isError'] === true || failed) {
    const content = Array.isArray(result['content'])
      ? result['content']
          .map((block) => asRecord(block))
          .flatMap((block) => (typeof block?.['text'] === 'string' ? [block['text']] : []))
          .join('\n')
      : '';
    return {
      content: { errorCode: 'MCP_TOOL_ERROR', message: content.slice(0, 2000) || `${tool.toolName} failed.` },
      isError: true,
    };
  }
  const parsed = tool.outputSchema.safeParse(result['structuredContent']);
  return parsed.success
    ? { content: asJson(parsed.data), isError: false }
    : {
        content: {
          errorCode: 'MCP_RESULT_INVALID',
          message: `Tau MCP returned an invalid ${tool.toolName} result.`,
        },
        isError: true,
      };
};

/**
 * Where the emitter's *programmatic* tool name is read from, in order.
 *
 * ACP's own `ToolCall.name` is experimental and neither shipping adapter sets
 * it, so the chain continues into the two places they do use: Claude puts the
 * native name in `_meta.claudeCode.toolName`, and Codex routes an MCP call's
 * tool through `rawInput.tool`. It is one ordered chain rather than a per-agent
 * switch because the three never collide (V-W3), so a future adapter that
 * adopts the standard field is served by the first entry with no change
 * anywhere. `AcpAgentProfile.nativeToolName` overrides it per agent.
 *
 * @public
 */
export const acpNativeToolNamePaths: readonly string[] = ['name', '_meta.claudeCode.toolName', 'rawInput.tool'];

/**
 * The emitter's *programmatic* tool name, from wherever it actually put it.
 *
 * @param update - The tool-call notification as received.
 * @param paths - Dotted paths to try, in order.
 * @returns The programmatic name, or `undefined` when only a title exists.
 */
const nativeToolName = (update: AcpToolUpdate, paths: readonly string[]): string | undefined => {
  for (const path of paths) {
    let value: unknown = update;
    for (const key of path.split('.')) {
      value = asRecord(value)?.[key];
    }
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return undefined;
};

/**
 * The model choice one session offers, in the order the agent listed it.
 *
 * Both pinned adapters spell the choice the same way — one `select` config
 * option whose category is `model` — so this reads the protocol, not a vendor.
 * Groups are flattened, because Tau's picker is one list.
 *
 * The turn's own model refusal and the discovery probe share this one reader
 * (V5): a second parser is how the offered set and the advertised set drift.
 *
 * @param configOptions - Config options the session reported.
 * @returns The option's id, its current value, and its models, or `undefined`.
 * @public
 */
export const modelChoice = (
  configOptions: readonly SessionConfigOption[] | undefined,
):
  | {
      readonly configId: string;
      readonly currentValue: string | undefined;
      readonly models: ReadonlyArray<{ readonly id: string; readonly name: string }>;
      readonly values: readonly string[];
    }
  | undefined => {
  const option = configOptions?.find((candidate) => candidate.category === 'model');
  if (option?.type !== 'select') {
    return undefined;
  }
  const models = option.options.flatMap((entry) =>
    ('options' in entry ? entry.options : [entry]).map((value) => ({ id: value.value, name: value.name })),
  );
  return {
    configId: option.id,
    currentValue: option.currentValue,
    models,
    values: models.map((model) => model.id),
  };
};

/** Options for {@link openAcpSession}. @public */
export type OpenAcpSessionOptions = {
  readonly adapter: AcpAdapter;
  /** Absolute working directory; the agent's `cwd` and its filesystem fence. */
  readonly cwd: string;
  /** MCP servers offered to the session — normally just Tau's own. */
  readonly mcpServers?: readonly McpServer[] | undefined;
  /** Standard ACP roots used by the adapter's native skill discovery. */
  readonly additionalDirectories?: readonly string[] | undefined;
  /** Existing ACP session to restore rather than create. */
  readonly acpSessionId?: string | undefined;
  /** Cumulative usage remembered with that session. */
  readonly priorUsage?: AcpUsage | undefined;
  readonly onFrame?: ((frame: AcpWireFrame) => void) | undefined;
  readonly createId: () => string;
};

/**
 * What `initialize` said about the agent on the other end (V11).
 *
 * Kept rather than discarded because every one of these is a fact a surface
 * has to be able to render: what the agent can do, how a logged-out user logs
 * in, and who it says it is. The descriptor's `externalAgents` profile reads
 * them from here through the session handle.
 *
 * @public
 */
export type AcpAgentFacts = {
  /** The version the agent answered with; a mismatch never reaches a session. */
  readonly protocolVersion: number;
  readonly agentCapabilities: AgentCapabilities | undefined;
  /** Login methods the agent offered, in its own order; empty when it needs none. */
  readonly authMethods: readonly AuthMethod[];
  readonly agentInfo: Implementation | undefined;
};

/** One live ACP session: an adapter child, its connection, and the vendor session. @public */
export type AcpSession = {
  /** The vendor session this connection is prompting. */
  readonly acpSessionId: string;
  /** What the agent advertised at `initialize`. */
  readonly agent: AcpAgentFacts;
  /** Config options as the session last reported them, `config_option_update` included. */
  readonly configOptions: readonly SessionConfigOption[] | undefined;
  /** The mode the agent last reported, when it pushed one. */
  readonly modeId: string | undefined;
  /** `true` when a requested session could be neither resumed nor loaded. */
  readonly contextLost: boolean;
  /** Resolves when the connection is gone, however it went. */
  readonly closed: Promise<void>;
  /**
   * Run one turn against this session.
   *
   * @param prompt - Prompt text, or the content blocks to send verbatim.
   * @param turn - The run's durable seams; its signal cancels the prompt only.
   * @param model - Model this turn wants, applied only when it is not current.
   * @param configuration - Other exact ACP configuration ids and values selected by the client.
   */
  prompt(
    prompt: string | readonly ContentBlock[],
    turn: AcpPromptTurn,
    model?: string,
    configuration?: Readonly<Record<string, string | boolean>>,
  ): Promise<AcpTurnOutcome>;
  /** End the vendor session where the agent advertises it, then kill the child. */
  close(): Promise<void>;
};

/** One turn's projection of `session/update` into the durable log. */
type TurnProjection = {
  /** The chat title the agent proposed, if any. */
  readonly title: string | undefined;
  update(update: SessionUpdate): void;
  sessionState(state: AcpSessionPresentation): void;
  approve(request: Parameters<ExternalAgentTurn['approve']>[0]): ReturnType<ExternalAgentTurn['approve']>;
  /**
   * The vendor's own end-of-turn report, before the last block is committed.
   *
   * `PromptResponse` arrives after every notification, so this is the last
   * thing the turn learns and the first thing its final message must carry.
   */
  report(input: { readonly usage?: AcpUsage | undefined; readonly model?: string | undefined }): void;
  flush(): Promise<void>;
};

/** Latest replaceable presentation facts for one ACP session. */
type AcpSessionPresentation = {
  readonly sessionId?: string | undefined;
  readonly plan?: JsonValue | undefined;
  readonly commands: readonly JsonValue[];
  readonly configOptions: readonly JsonValue[];
  readonly modeId?: string | undefined;
  readonly modes?: readonly JsonValue[] | undefined;
};

const emptySessionPresentation: AcpSessionPresentation = { commands: [], configOptions: [] };

/**
 * Apply one ACP session-presentation update using the protocol's replacement semantics.
 *
 * @param state - Current presentation state.
 * @param update - ACP update to apply.
 * @returns The replacement presentation state.
 */
const presentationAfter = (state: AcpSessionPresentation, update: SessionUpdate): AcpSessionPresentation => {
  switch (update.sessionUpdate) {
    case 'plan': {
      return { ...state, plan: asJson({ type: 'items', entries: update.entries }) };
    }
    case 'plan_update': {
      return { ...state, plan: asJson(update.plan) };
    }
    case 'plan_removed': {
      const planId = asRecord(state.plan)?.['planId'];
      return planId === undefined || planId === update.planId ? { ...state, plan: undefined } : state;
    }
    case 'available_commands_update': {
      return { ...state, commands: update.availableCommands.map((command) => asJson(command)) };
    }
    case 'config_option_update': {
      return { ...state, configOptions: update.configOptions.map((option) => asJson(option)) };
    }
    case 'current_mode_update': {
      return { ...state, modeId: update.currentModeId };
    }
    default: {
      return state;
    }
  }
};

/**
 * This turn's share of a counter ACP reports as a running session total.
 *
 * @param current - What the agent has counted for the session so far.
 * @param prior - What it had counted at the end of the previous turn.
 * @returns The difference, never negative — a counter that went backwards is a
 * vendor bug Tau reports as zero rather than as a credit.
 */
const sinceLastTurn = (current: number, prior: number): number => Math.max(current - prior, 0);

/**
 * The vendor's token report, in the shape Tau's own turns record.
 *
 * Every ACP counter is a **session** total — "Total input tokens across all
 * turns" — while `metadata.usage` is a per-turn figure that Tau's own readers
 * sum (`chat-details-usage.tsx`, `chat.utils.ts`). Stamping the cumulative
 * figure makes turn N report the whole session and the chat total run
 * `N(N+1)/2 ×` the truth, so the difference is what is stamped and the vendor's
 * own running totals are kept verbatim under `tauInternal.vendorUsage`.
 *
 * Costs are **zero on purpose**, not unknown: ACP reports no per-category
 * price, Tau did not sell this turn, and filling these with anything else would
 * present a vendor's own billing as a Tau charge (V6). What the vendor *did*
 * report about money is kept verbatim under `tauInternal.vendorCost`, labelled
 * as its own.
 *
 * @param usage - The agent's report, from `PromptResponse`.
 * @param prior - What the same session reported at the end of the previous turn.
 * @returns The `metadata.usage` value for the turn's last assistant message.
 */
const usageMetadata = (usage: AcpUsage, prior: AcpUsage | undefined): ProviderMessageMetadata['usage'] => ({
  input: sinceLastTurn(usage.inputTokens, prior?.inputTokens ?? 0),
  output: sinceLastTurn(usage.outputTokens, prior?.outputTokens ?? 0),
  cacheRead: sinceLastTurn(usage.cachedReadTokens ?? 0, prior?.cachedReadTokens ?? 0),
  cacheWrite: sinceLastTurn(usage.cachedWriteTokens ?? 0, prior?.cachedWriteTokens ?? 0),
  ...(typeof usage.thoughtTokens === 'number'
    ? { reasoning: sinceLastTurn(usage.thoughtTokens, prior?.thoughtTokens ?? 0) }
    : {}),
  totalTokens: sinceLastTurn(usage.totalTokens, prior?.totalTokens ?? 0),
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

/**
 * The agent's own running totals, as it reported them, for the record.
 *
 * @param usage - The agent's report, from `PromptResponse`.
 * @returns Its numeric counters, verbatim; `_meta` and nulls are dropped.
 */
const vendorUsageOf = (usage: AcpUsage): JsonObject => {
  const totals: Record<string, number> = {};
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === 'number') {
      totals[key] = value;
    }
  }
  return totals;
};

/**
 * Project one turn's updates into the chat's durable log.
 *
 * @internal
 * @param options - The turn's seams, the id source, and the agent's own id.
 * @returns The projection this turn routes notifications through.
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one turn is one ordered projection; splitting the update switch from the handlers that feed it would hide the ordering this function exists to keep.
export const createTurnProjection = (options: {
  readonly turn: AcpPromptTurn;
  readonly createId: () => string;
  readonly agentId: string;
  /** Where this agent puts a call's native name; defaults to {@link acpNativeToolNamePaths}. */
  readonly nativeToolName?: readonly string[] | undefined;
  /** The session's cumulative usage as of the end of the previous turn; see {@link usageMetadata}. */
  readonly priorUsage?: AcpUsage | undefined;
  /** Host-attested Tau MCP server name configured for this session. */
  readonly tauMcpServerName?: string | undefined;
}): TurnProjection => {
  const { turn } = options;
  /**
   * The assistant block being accumulated, flushed at a real boundary.
   *
   * `kind` is what the agent was doing when it wrote the chunk: an
   * `agent_message_chunk` is text, an `agent_thought_chunk` is reasoning, and
   * the two never merge into one block.
   */
  type AssistantBlock = {
    readonly sourceId: string;
    readonly kind: 'text' | 'thinking';
    readonly durableId: string;
    readonly startedAtMs: number;
    text: string;
    committed: boolean;
    endedAt?: number | undefined;
  };
  const assistantBlocks = new Map<string, AssistantBlock>();
  let pending: AssistantBlock | undefined;
  /**
   * Tool calls awaiting their result, with the fullest facts seen so far, so a
   * `tool_call_update` names its input and an `in_progress` refinement is not
   * lost when the terminal update repeats none of it.
   */
  const openToolCalls = new Map<
    string,
    {
      readonly toolName: string;
      readonly callId: string;
      readonly tauMcp?: NormalizedTauMcpCall | undefined;
      facts: NonNullable<ToolInputProviderMessage['call']>;
      input: JsonValue;
      inputMessage: ToolInputProviderMessage;
      rawOutput?: unknown;
    }
  >();
  const externalMetadata = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: options.agentId } };
  const tauMcpMetadata = {
    tauInternal: { ...externalMetadata.tauInternal, presentation: 'tau-mcp' },
  };
  /**
   * What the agent reported about itself, rather than about the work.
   *
   * Accumulated across the turn and stamped onto its *last* assistant message
   * once, at the final flush: usage is cumulative in both places ACP reports it,
   * so stamping every block would make one turn's tokens count as many.
   */
  const reported: {
    usage?: AcpUsage | undefined;
    model?: string | undefined;
    title?: string | undefined;
    /** The vendor's own money report — its number, its currency, its label. */
    cost?: JsonValue | undefined;
    /** Context window occupancy as the agent last measured it. */
    context?: JsonValue | undefined;
  } = {};
  let sessionPresentation = emptySessionPresentation;
  let sessionMessageId: string | undefined;
  let sessionCommitted = false;

  /* Serialized: the durable log is ordered, and ACP delivers notifications as
   * fast as the agent produces them. */
  let projection = Promise.resolve();
  const enqueue = (work: () => Promise<void>): void => {
    const prior = projection;
    projection = (async () => {
      await prior;
      await work();
    })();
  };

  /**
   * The metadata one assistant message carries, attribution included.
   *
   * `final` is the turn's last flush, and only it carries the vendor's report:
   * every ACP usage number is cumulative, so a second stamped message would be
   * summed with the first and double the turn (V6).
   *
   * @param final - Whether this is the turn's last committed block.
   * @returns Attribution for every block, plus the vendor's report on the last.
   */
  const messageMetadata = (
    final: boolean,
    streamState?: 'checkpoint' | 'final',
    block?: AssistantBlock,
  ): ProviderMessageMetadata => {
    const { usage, model, cost, context } = reported;
    return {
      /* `model` *and* `responseModel`: the first is what ran, the second is what
       * every existing usage reader already looks for, and for an external turn
       * they are the same fact — Tau never substitutes a model here. */
      ...(!final || model === undefined ? {} : { model, responseModel: model }),
      ...(!final || usage === undefined ? {} : { usage: usageMetadata(usage, options.priorUsage) }),
      ...(block?.kind === 'thinking'
        ? {
            reasoningTimings: [
              {
                contentIndex: 0,
                startedAtMs: block.startedAtMs,
                ...(block.endedAt === undefined ? {} : { endedAtMs: block.endedAt }),
              },
            ],
          }
        : {}),
      tauInternal: {
        ...externalMetadata.tauInternal,
        ...(streamState === undefined ? {} : { streamState }),
        ...(!final || usage === undefined ? {} : { vendorUsage: vendorUsageOf(usage) }),
        ...(!final || cost === undefined ? {} : { vendorCost: cost }),
        ...(!final || context === undefined ? {} : { vendorContext: context }),
      },
    };
  };

  let idleFlush: NodeJS.Timeout | undefined;
  const flushBlock = async (final = false, checkpoint = false): Promise<void> => {
    if (idleFlush) {
      clearTimeout(idleFlush);
      idleFlush = undefined;
    }
    const block = pending;
    if (!checkpoint) {
      pending = undefined;
    }
    if (!block || block.text === '') {
      return;
    }
    if (!checkpoint) {
      block.endedAt = Date.now();
      await turn.publishLive?.({
        type: block.kind === 'text' ? 'text-end' : 'thinking-end',
        messageId: block.durableId,
        contentIndex: 0,
        content: block.text,
        ...(block.kind === 'thinking' ? { timestamp: block.endedAt } : {}),
      });
    }
    const message: ProviderMessage = {
      id: block.durableId,
      role: 'assistant',
      content: asJson([
        block.kind === 'text' ? { type: 'text', text: block.text } : { type: 'thinking', thinking: block.text },
      ]),
      metadata: messageMetadata(final, checkpoint ? 'checkpoint' : 'final', block),
    };
    await turn.append([
      block.committed
        ? { type: 'message.envelope-replaced', messageId: block.durableId, replacement: message }
        : { type: 'message.appended', message },
    ]);
    block.committed = true;
  };

  /** Replace the turn's one ACP session-state row instead of appending every update. */
  const publishSessionState = async (): Promise<void> => {
    await flushBlock();
    sessionMessageId ??= options.createId();
    const content = asJson({
      type: 'acp-session',
      agentId: options.agentId,
      commands: sessionPresentation.commands,
      configOptions: sessionPresentation.configOptions,
      ...(sessionPresentation.sessionId === undefined ? {} : { sessionId: sessionPresentation.sessionId }),
      ...(sessionPresentation.plan === undefined ? {} : { plan: sessionPresentation.plan }),
      ...(sessionPresentation.modeId === undefined ? {} : { modeId: sessionPresentation.modeId }),
      ...(sessionPresentation.modes === undefined ? {} : { modes: sessionPresentation.modes }),
    });
    const message: ProviderMessage = {
      id: sessionMessageId,
      role: 'assistant',
      content: [content],
      metadata: externalMetadata,
    };
    await turn.append([
      sessionCommitted
        ? { type: 'message.envelope-replaced', messageId: sessionMessageId, replacement: message }
        : { type: 'message.appended', message },
    ]);
    sessionCommitted = true;
  };

  /**
   * Rich ACP blocks are already MCP-compatible JSON; keep them intact.
   *
   * @param content - Rich block to append.
   * @returns When the durable append has completed.
   */
  const publishRichBlock = async (content: ContentBlock): Promise<void> => {
    await flushBlock();
    await turn.append([
      {
        type: 'message.appended',
        message: {
          id: options.createId(),
          role: 'assistant',
          content: [asJson(content)],
          metadata: externalMetadata,
        },
      },
    ]);
  };

  /**
   * The agent's own facts about one call, in the durable vocabulary.
   *
   * ACP spells "absent" as `null` in most of these fields and the durable log
   * spells it by omission, so a null is dropped rather than recorded as a
   * value. Anything else the agent sent — `_meta` included — is carried
   * through, because the log preserves facts it has no field for (D14).
   *
   * @param update - The `tool_call` or `tool_call_update` as received.
   * @returns The `call` projection for the message this update records.
   */
  const callFacts = (update: AcpToolUpdate): NonNullable<ToolInputProviderMessage['call']> => {
    const nativeName = nativeToolName(update, options.nativeToolName ?? acpNativeToolNamePaths);
    return {
      toolCallId: update.toolCallId,
      ...(isPresent(update.kind) ? { kind: update.kind } : {}),
      ...(isPresent(update.title) ? { title: update.title } : {}),
      ...(isPresent(update.status) ? { status: update.status } : {}),
      ...(nativeName ? { nativeName } : {}),
      ...(isPresent(update.locations)
        ? {
            locations: update.locations.map(({ line, ...location }) =>
              typeof line === 'number' ? { ...location, line } : location,
            ),
          }
        : {}),
      ...(isPresent(update.content) ? { content: asJson(update.content) } : {}),
      ...(isPresent(update._meta) ? { meta: asJson(update._meta) } : {}),
    };
  };

  /**
   * Record the result row for a call whose facts have reached a terminal status.
   *
   * A non-terminal update carries no result: it refines the call in place, and
   * the refinement is merged into the open record so the eventual result row
   * carries it even when the terminal update repeats none of it (Codex's
   * `applyPatch` sends its diff once, at `in_progress`).
   *
   * @param update - The tool-call notification as received.
   */
  const projectToolResult = async (update: AcpToolUpdate): Promise<void> => {
    const open = openToolCalls.get(update.toolCallId);
    if (!open) {
      return;
    }
    const facts = { ...open.facts, ...callFacts(update) };
    const rawOutput = update.rawOutput === undefined ? open.rawOutput : update.rawOutput;
    const updatedTauMcp = normalizedTauMcpCall(update, options.tauMcpServerName);
    const input =
      update.rawInput === undefined
        ? open.input
        : open.tauMcp === undefined
          ? asJson(update.rawInput)
          : (updatedTauMcp?.arguments ?? open.input);
    const inputMessage = { ...open.inputMessage, call: facts, content: input };
    if (update.status !== 'completed' && update.status !== 'failed') {
      openToolCalls.set(update.toolCallId, {
        ...open,
        facts,
        input,
        inputMessage,
        ...(rawOutput === undefined ? {} : { rawOutput }),
      });
      await turn.append([
        {
          type: 'message.envelope-replaced',
          messageId: inputMessage.id,
          replacement: inputMessage,
        },
      ]);
      const progress = update.rawOutput === undefined ? update.content : update.rawOutput;
      if (progress !== undefined) {
        await turn.publishLive?.({
          type: 'tool-output-update',
          messageId: inputMessage.id,
          contentIndex: 0,
          toolCallId: open.callId,
          toolName: open.toolName,
          output: asJson(progress),
          isError: false,
        });
      }
      return;
    }
    openToolCalls.delete(update.toolCallId);
    const normalized =
      open.tauMcp === undefined ? undefined : mcpResult(rawOutput, open.tauMcp, update.status === 'failed');
    const { content: _content, ...durableFacts } = facts;
    await turn.append([
      {
        type: 'message.envelope-replaced',
        messageId: inputMessage.id,
        replacement: inputMessage,
      },
      {
        type: 'message.appended',
        message: {
          id: options.createId(),
          role: 'tool-output',
          toolCallId: open.callId,
          toolName: open.toolName,
          call: open.tauMcp === undefined ? facts : durableFacts,
          content: normalized?.content ?? asJson(rawOutput ?? facts.content ?? { status: update.status }),
          isError: normalized?.isError ?? update.status === 'failed',
          metadata: open.tauMcp === undefined ? externalMetadata : tauMcpMetadata,
        },
      },
    ]);
  };

  const projectToolCall = async (update: Extract<SessionUpdate, { sessionUpdate: 'tool_call' }>): Promise<void> => {
    await flushBlock();
    const callId = options.createId();
    const inputMessageId = options.createId();
    const facts = callFacts(update);
    const tauMcp = normalizedTauMcpCall(update, options.tauMcpServerName);
    const callToolName = tauMcp?.toolName ?? facts.nativeName ?? update.title;
    const input = tauMcp?.arguments ?? asJson(update.rawInput ?? { title: update.title });
    const inputMessage: ToolInputProviderMessage = {
      id: inputMessageId,
      role: 'tool-input',
      toolCallId: callId,
      toolName: callToolName,
      call: facts,
      content: input,
      metadata: tauMcp === undefined ? externalMetadata : tauMcpMetadata,
    };
    openToolCalls.set(update.toolCallId, { toolName: callToolName, callId, facts, tauMcp, input, inputMessage });
    await turn.append([
      {
        type: 'message.appended',
        message: inputMessage,
      },
    ]);
    await turn.publishLive?.({
      type: 'tool-input-start',
      messageId: inputMessageId,
      contentIndex: 0,
      toolCallId: callId,
      toolName: callToolName,
    });
    await turn.publishLive?.({
      type: 'tool-input-end',
      messageId: inputMessageId,
      contentIndex: 0,
      toolCallId: callId,
      toolName: callToolName,
      input,
    });
    /* A call that arrives already finished gets no `tool_call_update`, and a
     * `tool-input` row with no `tool-output` is a part that hangs until the next
     * user message demotes it to an interruption the user never caused. */
    await projectToolResult(update);
  };

  // oxlint-disable-next-line eslint/complexity -- one branch per `session/update` variant is the point (V13): every variant carries an explicit ruling here, and a `default` would turn the next protocol addition into a silent drop.
  const project = async (update: SessionUpdate): Promise<void> => {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
      case 'agent_thought_chunk': {
        if (update.content.type !== 'text') {
          await publishRichBlock(update.content);
          return;
        }
        const kind = update.sessionUpdate === 'agent_message_chunk' ? 'text' : 'thinking';
        const sourceId = update.messageId ?? 'anonymous';
        const key = `${kind}:${sourceId}`;
        if (pending && (pending.sourceId !== sourceId || pending.kind !== kind)) {
          await flushBlock();
        }
        const block = (update.messageId === undefined ? pending : assistantBlocks.get(key)) ?? {
          sourceId,
          kind,
          durableId: options.createId(),
          startedAtMs: Date.now(),
          text: '',
          committed: false,
        };
        if (update.messageId !== undefined) {
          assistantBlocks.set(key, block);
        }
        const delta = update.content.text;
        if (block.text === '') {
          await turn.publishLive?.({
            type: kind === 'text' ? 'text-start' : 'thinking-start',
            messageId: block.durableId,
            contentIndex: 0,
            ...(kind === 'thinking' ? { timestamp: block.startedAtMs } : {}),
          });
        }
        block.text += delta;
        pending = block;
        await turn.publishLive?.({
          type: kind === 'text' ? 'text-delta' : 'thinking-delta',
          messageId: block.durableId,
          contentIndex: 0,
          delta,
        });
        if (idleFlush) {
          clearTimeout(idleFlush);
        }
        idleFlush = setTimeout(() => {
          idleFlush = undefined;
          enqueue(async () => flushBlock(false, true));
        }, textIdleFlushDelay);
        idleFlush.unref();
        return;
      }

      case 'tool_call': {
        await projectToolCall(update);
        return;
      }
      case 'tool_call_update': {
        await projectToolResult(update);
        return;
      }

      /* The agent's own report about itself. Held, not appended: it is
       * cumulative, so it belongs to the turn rather than to whichever block
       * happened to be open when it arrived. */
      case 'usage_update': {
        reported.context = { used: update.used, size: update.size };
        if (update.cost) {
          /* The vendor's number, its currency and its own label — never
           * converted into a Tau price, and never summed with one (V6). */
          reported.cost = { amount: update.cost.amount, currency: update.cost.currency, reportedBy: options.agentId };
        }
        break;
      }
      case 'plan':
      case 'plan_update':
      case 'plan_removed':
      case 'available_commands_update':
      case 'config_option_update':
      case 'current_mode_update': {
        sessionPresentation = presentationAfter(sessionPresentation, update);
        await publishSessionState();
        return;
      }
      case 'session_info_update': {
        if (typeof update.title === 'string' && update.title !== '') {
          reported.title = update.title;
        }
      }
      // No default: the remaining variants are the session's own, handled at the connection.
    }
  };

  return {
    update: (update) => {
      enqueue(async () => project(update));
    },
    sessionState: (state) => {
      enqueue(async () => {
        sessionPresentation = state;
        await publishSessionState();
      });
    },
    approve: async (request) => {
      await projection;
      await flushBlock();
      const payload = asRecord(request.payload);
      const requestedCall = asRecord(payload?.['toolCall']);
      const toolCallId = requestedCall?.['toolCallId'];
      const open = typeof toolCallId === 'string' ? openToolCalls.get(toolCallId) : undefined;
      if (!open) {
        return turn.approve(request);
      }
      const title =
        (typeof requestedCall?.['title'] === 'string' && requestedCall['title'] !== ''
          ? requestedCall['title']
          : open.facts.title) ?? open.toolName;
      const summary = JSON.stringify(open.input).slice(0, 500);
      return turn.approve({
        prompt: `Allow ${title}${summary === 'null' ? '' : ` with ${summary}`}?`,
        payload: asJson({
          ...payload,
          toolCall: { ...open.facts, ...requestedCall, title },
          input: open.input,
        }),
      });
    },
    report: (input) => {
      reported.usage = input.usage ?? reported.usage;
      reported.model = input.model ?? reported.model;
    },
    get title(): string | undefined {
      return reported.title;
    },
    flush: async () => {
      await projection;
      const carried = pending !== undefined && pending.text !== '';
      await flushBlock(true);
      if (carried || reported.usage === undefined) {
        return;
      }
      /* A turn whose last act was a tool call has no open block to stamp, and
       * the vendor's report is the one fact that has nowhere else to live: an
       * empty assistant message carries it rather than losing it (V6). It
       * renders as the usage footer alone — there is no text to show. */
      await turn.append([
        {
          type: 'message.appended',
          message: { id: options.createId(), role: 'assistant', content: [], metadata: messageMetadata(true) },
        },
      ]);
    },
  };
};

/**
 * The option id an approval resolution names, or the closest kind that stands in.
 *
 * The decider's own option wins whenever the agent still offers it; the kind
 * fallback is only for a client that answered with an outcome alone. A stale
 * explicit id is cancelled rather than widened.
 *
 * @internal
 * @param options - Options the agent offered.
 * @param resolution - What the decider answered.
 * @returns The option id to send back, or `undefined` to cancel.
 */
export const chooseOption = (
  options: readonly PermissionOption[],
  resolution: { readonly outcome: string; readonly optionId?: string | undefined },
): string | undefined => {
  const pick = (...kinds: ReadonlyArray<PermissionOption['kind']>): string | undefined =>
    kinds.flatMap((kind) => options.filter((option) => option.kind === kind)).at(0)?.optionId;
  const family = resolution.outcome === 'approved' ? 'allow' : 'reject';
  const chosen = options.find((option) => option.optionId === resolution.optionId && option.kind.startsWith(family));
  if (resolution.optionId !== undefined) {
    return chosen?.optionId;
  }
  if (resolution.outcome === 'approved') {
    /* A bare Approve is one turn's consent, never a standing grant: the banner
     * offers Approve/Reject, so `allow_once` is the only option it can mean
     * (review 1-review S4). */
    return pick('allow_once');
  }
  return resolution.outcome === 'denied' ? pick('reject_once') : undefined;
};

/**
 * Open — or restore — one ACP session, and keep it alive for the whole chat.
 *
 * @param options - Adapter, working directory, MCP servers and the session to restore.
 * @returns The live session: its id, its options, and the seams to prompt and close it.
 * @public
 *
 * @example <caption>One session, two turns</caption>
 * ```typescript
 * import { openAcpSession } from '@taucad/host';
 * import type { AcpAdapter } from '@taucad/host';
 *
 * declare const adapter: AcpAdapter;
 * declare const turn: Parameters<Awaited<ReturnType<typeof openAcpSession>>['prompt']>[1];
 * const session = await openAcpSession({ adapter, cwd: process.cwd(), createId: () => '1' });
 * await session.prompt('Model a bracket.', turn);
 * await session.prompt('Now fillet it.', turn);
 * await session.close();
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- the session *is* one protocol conversation: its handlers, its restore ladder and its prompt all close over the same connection, and splitting them would only move that state into an object nobody else reads.
export const openAcpSession = async (options: OpenAcpSessionOptions): Promise<AcpSession> => {
  const { cwd } = options;
  const adapter = spawnAcpAdapter({
    adapter: options.adapter,
    cwd,
    ...(options.onFrame ? { onFrame: options.onFrame } : {}),
  });
  /** The turn in flight, if any. Absent, an update has nowhere to go — the load replay guard. */
  let active: TurnProjection | undefined;
  /** The same turn's durable seams, for the records that are not `session/update`. */
  let activeTurn: AcpPromptTurn | undefined;
  let configOptions: readonly SessionConfigOption[] | undefined;
  let presentation: AcpSessionPresentation = emptySessionPresentation;
  /**
   * The session's cumulative usage as of the last turn that reported one.
   *
   * Lives exactly as long as the vendor's own counter — a new session restarts
   * both — so a turn's own share is `current - this` (see {@link usageMetadata}).
   */
  let { priorUsage } = options;
  let modeId: string | undefined;
  /* Empty until `initialize` answers, so a handshake that fails with `-32000`
   * still refuses with the right code — just with no methods to offer. */
  let facts: AcpAgentFacts = {
    protocolVersion,
    agentCapabilities: undefined,
    authMethods: [],
    agentInfo: undefined,
  };

  /**
   * A refusal the user can act on, or the vendor failure that is left over.
   *
   * Three rungs, in order. An error that already carries a Tau code *is* the
   * answer — wrapping it would bury the one thing a surface renders. A JSON-RPC
   * `-32000` is the logged-out case, and it becomes `EXTERNAL_AGENT_AUTH_REQUIRED`
   * carrying the methods the agent listed, never `codex failed: Authentication
   * required` plus eight kilobytes of stderr (r4 §2). Everything else is a
   * genuine failure and keeps the tail, because there is nothing better to say.
   *
   * @param error - Whatever the connection or a guard threw.
   * @returns The error the run records.
   */
  const failure = (error: unknown): Error => {
    const code = asRecord(error)?.['code'];
    if (error instanceof Error && typeof code === 'string') {
      return error;
    }
    if (code === authRequiredCode) {
      return Object.assign(
        new Error(
          `${options.adapter.id} is not logged in. Sign in to it on the machine running this agent, then try again.`,
        ),
        { code: 'EXTERNAL_AGENT_AUTH_REQUIRED', login: loginOf(options.adapter.id, facts.authMethods) },
      );
    }
    const stderr = adapter.stderr();
    return Object.assign(
      new Error(
        `${options.adapter.id} failed: ${error instanceof Error ? error.message : String(error)}${stderr === '' ? '' : `\n${stderr}`}`,
      ),
      { code: 'EXTERNAL_AGENT_FAILED' },
    );
  };

  /**
   * Record one login the user has to complete, where every surface can see it.
   *
   * A URL elicitation is the portable login flow (V11): the agent hands Tau a
   * verification URL and a code and waits, so the durable interrupt *is* the
   * affordance — the banner, the CLI and the TUI all render the same record.
   *
   * @param login - The facts to render.
   * @param reason - The agent's own message, kept verbatim as the prompt.
   */
  const recordLogin = async (login: ExternalAgentLogin, reason: string): Promise<void> => {
    await activeTurn?.append([
      {
        type: 'interrupt.recorded',
        interruptId: login.elicitationId ?? options.createId(),
        phase: 'requested',
        reason,
        payload: asJson(login),
      },
    ]);
  };

  let acpSessionId = options.acpSessionId ?? '';
  const connection: ClientConnection = client({ name: 'tau-host' })
    .onNotification('session/update', ({ params }) => {
      if (acpSessionId !== '' && params.sessionId !== acpSessionId) {
        return;
      }
      presentation = presentationAfter(presentation, params.update);
      if (params.update.sessionUpdate === 'config_option_update') {
        configOptions = params.update.configOptions;
      }
      if (params.update.sessionUpdate === 'current_mode_update') {
        modeId = params.update.currentModeId;
      }
      active?.update(params.update);
    })
    .onRequest('session/request_permission', async ({ params }) => {
      if (params.sessionId !== acpSessionId) {
        return { outcome: { outcome: 'cancelled' } };
      }
      const turn = active;
      const promptTurn = activeTurn;
      if (!turn || !promptTurn || promptTurn.signal.aborted) {
        /* Replay, or an agent acting between turns: nobody is waiting to decide. */
        return { outcome: { outcome: 'cancelled' } };
      }
      let abortApproval: (() => void) | undefined;
      const aborted = new Promise<undefined>((resolve) => {
        abortApproval = (): void => {
          resolve(undefined);
        };
        if (promptTurn.signal.aborted) {
          resolve(undefined);
        } else {
          promptTurn.signal.addEventListener('abort', abortApproval, { once: true });
        }
      });
      const resolution = await Promise.race([
        turn.approve({
          prompt: params.toolCall.title ?? `Allow ${params.toolCall.toolCallId}?`,
          payload: asJson({ toolCall: params.toolCall, options: params.options }),
        }),
        aborted,
      ]);
      if (abortApproval) {
        promptTurn.signal.removeEventListener('abort', abortApproval);
      }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- AbortSignal.aborted is mutable after the initial guard.
      if (resolution === undefined || promptTurn.signal.aborted) {
        return { outcome: { outcome: 'cancelled' } };
      }
      const optionId = chooseOption(params.options, resolution);
      return optionId === undefined
        ? { outcome: { outcome: 'cancelled' } }
        : { outcome: { outcome: 'selected', optionId } };
    })
    .onRequest('elicitation/create', async ({ params }) => {
      const login = urlLoginOf(options.adapter.id, params);
      if (!login || !activeTurn) {
        /* A form Tau has no surface for, a mode a later protocol invents, or an
         * agent asking between turns with nobody watching: declining is the
         * honest answer, and the agent falls back to whatever it does for a
         * client that cannot present one. Accepting one Tau cannot record would
         * leave the user waiting on a login they were never shown. */
        return { action: 'decline' };
      }
      await recordLogin(login, params.message);
      /* Answered at once, and deliberately: the agent polls its own
       * verification endpoint and says so with `elicitation/complete`, so
       * holding this response open would stall the very flow it is waiting on. */
      return { action: 'accept' };
    })
    .onNotification('elicitation/complete', ({ params }) => {
      /* async-iife: the agent is telling us, not asking; the turn continues
       * whether or not the resolution has landed yet. */
      void activeTurn?.append([
        {
          type: 'interrupt.recorded',
          interruptId: params.elicitationId,
          phase: 'resolved',
          reason: 'approved',
          payload: { outcome: 'approved' },
        },
      ]);
    })
    .onRequest('fs/read_text_file', async ({ params }) => ({ content: await readSessionTextFile(cwd, params) }))
    .onRequest('fs/write_text_file', async ({ params }) => {
      await writeSessionTextFile(cwd, params);
      return {};
    })
    .connect(adapter.stream);

  let contextLost = false;
  try {
    const initialized = await connection.agent.request('initialize', {
      protocolVersion,
      clientCapabilities,
      clientInfo: { name: 'tau-host', version: '1' },
    });
    facts = {
      protocolVersion: initialized.protocolVersion,
      agentCapabilities: initialized.agentCapabilities,
      authMethods: initialized.authMethods ?? [],
      agentInfo: initialized.agentInfo ?? undefined,
    };
    if (initialized.protocolVersion !== protocolVersion) {
      /* ACP's own instruction to a client that does not speak the version the
       * agent answered with: disconnect. Prompting anyway would send a v1 turn
       * to an agent that has told us it speaks something else. */
      throw Object.assign(
        new Error(
          `${options.adapter.id} speaks ACP version ${String(initialized.protocolVersion)}; this Tau Host speaks ${String(protocolVersion)}. Update one of them.`,
        ),
        { code: 'EXTERNAL_AGENT_UNAVAILABLE' },
      );
    }
    const capabilities = initialized.agentCapabilities;
    const canClose = advertised(capabilities?.sessionCapabilities?.close);
    const additionalDirectories = [...(options.additionalDirectories ?? [])];
    if (additionalDirectories.length > 0 && !advertised(capabilities?.sessionCapabilities?.additionalDirectories)) {
      throw Object.assign(
        new Error(`${options.adapter.id} does not support ACP additional directories required for Tau skills.`),
        { code: 'EXTERNAL_AGENT_UNAVAILABLE' },
      );
    }

    /**
     * The prompt blocks this agent can actually receive (V12).
     *
     * Two different answers, on purpose. An `image` or `audio` block an agent
     * cannot read is *refused*: silently sending the text half would answer a
     * question about a picture the model never saw, and the user would never
     * know why the answer is wrong. Text resources degrade to baseline ACP text;
     * binary resources are refused for the same reason as image and audio.
     *
     * @param blocks - The blocks this turn wants to send.
     * @returns The blocks that go on the wire.
     * @throws When a block carries content the agent did not advertise.
     */
    const sendable = (blocks: readonly ContentBlock[]): ContentBlock[] => {
      const promptCapabilities = capabilities?.promptCapabilities;
      const media = blocks.find(
        (block) => (block.type === 'image' || block.type === 'audio') && promptCapabilities?.[block.type] !== true,
      );
      if (media) {
        throw Object.assign(
          new Error(
            `${options.adapter.id} cannot read ${media.type} content, so this turn was not sent. Describe it in text, or run it on an agent that can.`,
          ),
          { code: 'EXTERNAL_AGENT_CONTENT_UNSUPPORTED' },
        );
      }
      if (promptCapabilities?.embeddedContext === true) {
        return [...blocks];
      }
      const binaryResource = blocks.find((block) => block.type === 'resource' && 'blob' in block.resource);
      if (binaryResource) {
        throw Object.assign(
          new Error(
            `${options.adapter.id} cannot read embedded binary content, so this turn was not sent. Describe it in text, or run it on an agent that can.`,
          ),
          { code: 'EXTERNAL_AGENT_CONTENT_UNSUPPORTED' },
        );
      }
      return blocks.map((block) =>
        block.type === 'resource' && 'text' in block.resource
          ? { type: 'text', text: `[${block.resource.uri}]\n${block.resource.text}` }
          : block,
      );
    };
    const mcpServers = [...(options.mcpServers ?? [])];

    /* `resume` first: it restores the agent's own context without streaming the
     * transcript Tau already owns. `load` is the fallback for an adapter that
     * only advertises that one, and its replay lands with no turn open. */
    const restore = async (sessionId: string): Promise<boolean> => {
      if (advertised(capabilities?.sessionCapabilities?.resume)) {
        try {
          const resumed = await connection.agent.request('session/resume', {
            sessionId,
            cwd,
            mcpServers,
            additionalDirectories,
          });
          configOptions = resumed.configOptions ?? undefined;
          modeId = resumed.modes?.currentModeId ?? modeId;
          presentation = {
            ...presentation,
            sessionId,
            configOptions: (configOptions ?? []).map((option) => asJson(option)),
            ...(modeId === undefined ? {} : { modeId }),
            ...(isPresent(resumed.modes) ? { modes: resumed.modes.availableModes.map((mode) => asJson(mode)) } : {}),
          };
          return true;
        } catch {
          /* The vendor lost it; try the other rung. */
        }
      }
      if (capabilities?.loadSession === true) {
        try {
          const loaded = await connection.agent.request('session/load', {
            sessionId,
            cwd,
            mcpServers,
            additionalDirectories,
          });
          configOptions = loaded.configOptions ?? undefined;
          modeId = loaded.modes?.currentModeId ?? modeId;
          presentation = {
            ...presentation,
            sessionId,
            configOptions: (configOptions ?? []).map((option) => asJson(option)),
            ...(modeId === undefined ? {} : { modeId }),
            ...(isPresent(loaded.modes) ? { modes: loaded.modes.availableModes.map((mode) => asJson(mode)) } : {}),
          };
          return true;
        } catch {
          /* Both rungs failed: the conversation is gone, and the caller says so. */
        }
      }
      return false;
    };

    if (acpSessionId === '' || !(await restore(acpSessionId))) {
      contextLost = acpSessionId !== '';
      priorUsage = undefined;
      const created = await connection.agent.request('session/new', { cwd, mcpServers, additionalDirectories });
      acpSessionId = created.sessionId;
      configOptions = created.configOptions ?? undefined;
      modeId = created.modes?.currentModeId ?? modeId;
      presentation = {
        ...presentation,
        sessionId: acpSessionId,
        configOptions: (configOptions ?? []).map((option) => asJson(option)),
        ...(modeId === undefined ? {} : { modeId }),
        ...(isPresent(created.modes) ? { modes: created.modes.availableModes.map((mode) => asJson(mode)) } : {}),
      };
    }

    let closing: Promise<void> | undefined;
    return {
      acpSessionId,
      contextLost,
      agent: facts,
      get configOptions(): readonly SessionConfigOption[] | undefined {
        return configOptions;
      },
      get modeId(): string | undefined {
        return modeId;
      },
      closed: connection.closed,
      close: async () => {
        closing ??= (async () => {
          try {
            if (canClose) {
              await Promise.race([
                connection.agent.request('session/close', { sessionId: acpSessionId }),
                new Promise((resolve) => {
                  setTimeout(resolve, sessionCloseTimeout).unref();
                }),
              ]);
            }
          } catch {
            /* A session the agent cannot end is still a child this host kills. */
          }
          connection.close();
          adapter.close();
        })();
        await closing;
      },
      // oxlint-disable-next-line eslint/max-params -- Mirrors the public ACP session port without a second options wrapper.
      prompt: async (prompt, turn, model, configuration) => {
        const projection = createTurnProjection({
          turn,
          createId: options.createId,
          agentId: options.adapter.id,
          ...(options.adapter.nativeToolName ? { nativeToolName: options.adapter.nativeToolName } : {}),
          ...(priorUsage === undefined ? {} : { priorUsage }),
          ...(mcpServers.some((server) => server.name === 'tau') ? { tauMcpServerName: 'tau' } : {}),
        });
        active = projection;
        activeTurn = turn;
        projection.sessionState(presentation);
        /* Cancellation stops the *prompt* (D12): the connection, the child and
         * the vendor session all stay up for the next turn. */
        const onAbort = (): void => {
          void connection.agent.notify('session/cancel', { sessionId: acpSessionId });
        };
        try {
          /* Attached before any request, so a cancel during `set_config_option`
           * stops the turn instead of waiting for the agent (review 1-review S3). */
          turn.signal.addEventListener('abort', onAbort, { once: true });
          if (turn.signal.aborted) {
            onAbort();
            throw Object.assign(new Error('The external agent turn was cancelled.'), {
              code: 'EXTERNAL_AGENT_CANCELLED',
            });
          }
          if (model !== undefined) {
            const choice = modelChoice(configOptions);
            /* Refused, never silently ignored: the alternative is billing the
             * user's own account for a model they did not choose. */
            if (!choice?.values.includes(model)) {
              throw Object.assign(
                new Error(
                  `${options.adapter.id} does not offer the model "${model}". It offers: ${(choice?.values ?? []).join(', ') || 'none'}.`,
                ),
                { code: 'EXTERNAL_AGENT_MODEL_UNAVAILABLE' },
              );
            }
            /* The session holds the selection, so it is set once and not per turn. */
            if (choice.currentValue !== model) {
              const set = await connection.agent.request('session/set_config_option', {
                sessionId: acpSessionId,
                configId: choice.configId,
                value: model,
              });
              configOptions = set.configOptions;
              presentation = { ...presentation, configOptions: configOptions.map((option) => asJson(option)) };
              projection.sessionState(presentation);
            }
          }
          for (const [configId, value] of Object.entries(configuration ?? {})) {
            const option = configOptions?.find((candidate) => candidate.id === configId);
            const accepted =
              option?.type === 'boolean'
                ? typeof value === 'boolean'
                : option?.type === 'select' &&
                  typeof value === 'string' &&
                  option.options.some((entry) =>
                    ('options' in entry ? entry.options : [entry]).some((candidate) => candidate.value === value),
                  );
            if (!accepted || !option) {
              throw Object.assign(
                new Error(`${options.adapter.id} does not offer configuration ${configId}=${String(value)}.`),
                {
                  code: 'EXTERNAL_AGENT_CONFIG_UNAVAILABLE',
                },
              );
            }
            if (option.currentValue === value) {
              continue;
            }
            // oxlint-disable-next-line no-await-in-loop -- each response replaces the complete option set used by the next selection.
            const set = await connection.agent.request(
              'session/set_config_option',
              typeof value === 'boolean'
                ? { sessionId: acpSessionId, configId: option.id, type: 'boolean', value }
                : { sessionId: acpSessionId, configId: option.id, value },
            );
            configOptions = set.configOptions;
            presentation = { ...presentation, configOptions: configOptions.map((entry) => asJson(entry)) };
            projection.sessionState(presentation);
          }
          const answered = await connection.agent.request('session/prompt', {
            sessionId: acpSessionId,
            prompt: sendable(typeof prompt === 'string' ? [{ type: 'text', text: prompt }] : prompt),
          });
          /* Read back, not echoed: `configOptions` has absorbed every
           * `config_option_update` the turn pushed, so this is the model the
           * agent actually finished on (V6). */
          const ran = modelChoice(configOptions)?.currentValue ?? model;
          projection.report({ usage: answered.usage ?? undefined, model: ran });
          /* The vendor's counters run for the life of the session, so the next
           * turn's share is measured from here (see `usageMetadata`). */
          priorUsage = answered.usage ?? priorUsage;
          await projection.flush();
          return {
            stopReason: answered.stopReason,
            acpSessionId,
            model: ran,
            title: projection.title,
            ...(priorUsage === undefined ? {} : { usage: priorUsage }),
          };
        } catch (error) {
          try {
            await projection.flush();
          } catch {
            /* The turn is already failing; a projection error adds nothing. */
          }
          throw failure(error);
        } finally {
          turn.signal.removeEventListener('abort', onAbort);
          active = undefined;
          /* The same lifetime as `active`, and for the same reason: a record
           * that arrives between turns has no run to belong to, and appending it
           * to the previous one reopens a message that is already finished
           * (4-review S6). */
          activeTurn = undefined;
        }
      },
    };
  } catch (error) {
    connection.close();
    adapter.close();
    throw failure(error);
  }
};
