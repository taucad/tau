/**
 * A deterministic ACP agent, spoken by hand over newline-delimited JSON-RPC.
 *
 * Not built on `@agentclientprotocol/sdk` on purpose: it stands in for a vendor
 * adapter this repo does not control, so an independent implementation proves
 * the daemon's client half rather than proving the SDK talks to itself.
 *
 * Run as an adapter override (`TAU_ACP_ADAPTER_OVERRIDE=<this file>:codex`,
 * honoured only under `NODE_ENV=test`). It is spawned with the same allowlisted
 * environment a real adapter gets, so the *only* way to steer a turn is the
 * prompt text — which is exactly how a real agent behaves:
 *
 * | Prompt contains | Behaviour |
 * | --- | --- |
 * | (always) | one text chunk echoing `{ cwd, env, model, turn }`, a `usage_update`, then a permission-gated `write_file` tool call; the reply carries `PromptResponse.usage` |
 * | (turn 2 onward) | a second chunk naming the whole transcript, so a later turn provably recalls the earlier ones |
 * | `mcp` | calls `test_model` through the `tau` MCP server and reports the evidence |
 * | `escape` | tries `fs/write_text_file` above `cwd` and reports the refusal |
 * | `wrong-session` | tries `fs/write_text_file` under another ACP session id and reports the refusal |
 * | `slow` | stops after the first chunk and waits to be cancelled |
 * | `noask` | writes without the permission round trip (the auto-approving mode a real CLI config produces — SP-4 Result 3) |
 * | `stop:<reason>` | ends the turn immediately with that ACP stop reason (`max_tokens`, `refusal`, …) |
 * | `switch` | pushes `config_option_update` mid-turn, moving the session to the other model |
 * | `updates` | emits the presentation-only updates: thought, plan, plan_update, plan_removed, available_commands_update, current_mode_update, session_info_update |
 * | `login` | drives the URL (device-code) elicitation when the client advertised `elicitation.url`, then completes it |
 * | `unsafe` | with `login`, offers a `javascript:` url instead of a web page |
 * | `late-auth` | drives the same elicitation *after* the prompt response, i.e. between turns |
 * | `abandon` | asks for permission and exits without answering it, leaving the request outstanding on the host |
 * | `tools` | emits a Codex-style `read`/`execute`/`think`/`fetch`/`edit` tool sequence with locations, diff and terminal content, each `pending → in_progress → completed` |
 * | `clear-title` | clears the write call title on its terminal update, exercising ACP presence semantics |
 * | `skills` / `skill-names` | reports complete native skill files, or only their names for packaged-host checks |
 * | `fail:quota` / `fail:rate` / `fail:context` / `fail:model` | stops on that provider failure the way both pinned adapters do: a typed AIR `sessionFailure` on an `end_turn` response when the client advertised it, else the provider sentence as text and a `-32603` rejection; `model` is a service failure whose title is a raw provider JSON body, as Codex sends one |
 * | `crash` | writes a stack to stderr and rejects `-32603 Internal error`, whatever the client advertised |
 *
 * Anything that has to be decided *before* a prompt exists is steered by
 * `TAU_FAKE_AGENT_MODE`, which a test's own `AcpAdapter` literal supplies
 * through `spawnEnv` (the environment allowlist drops every `TAU_*` name, so
 * this is reachable from the host tier only, never from an e2e override):
 *
 * | Mode | Behaviour |
 * | --- | --- |
 * | `grouped` | `configOptions` offers the models as `SessionConfigSelectGroup[]` rather than a flat list |
 * | `auth-required` | `initialize` advertises a `terminal-auth` method and `session/new` errors `-32000` |
 * | `restore-auth` | restoring an existing session errors `-32000` instead of silently starting fresh |
 * | `images` | `promptCapabilities.image` is advertised; withheld otherwise |
 * | `protocol-2` | `initialize` answers a protocol version this client does not speak |
 * | `silent` | `initialize` is never answered at all |
 * | `no-http` | HTTP MCP support is absent |
 * | `no-additional-directories` | additional-directory support is absent |
 *
 * Sessions are persisted under `cwd`, so a respawned fixture can resume or load
 * one it created in an earlier process. `session/fork` and the compaction
 * updates are deliberately absent: no gate reads them, and compaction may only
 * be sent to a client that advertised the capability, which Tau does not.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connectMcpOverFetch } from '#acp/fixtures/mcp-fetch-client.js';

type JsonRpcMessage = {
  readonly jsonrpc: '2.0';
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
};

type McpServerEntry = { readonly name?: string; readonly url?: string; readonly headers?: readonly unknown[] };

type SessionState = {
  readonly cwd: string;
  readonly mcpServers: readonly McpServerEntry[];
  readonly additionalDirectories: readonly string[];
  /** Every prompt this session has answered, oldest first. */
  readonly prompts: string[];
  /** Model id the client last selected through `session/set_config_option`. */
  model: string;
  config: Record<string, string | boolean>;
  /**
   * Ended by `session/close`. The record survives so `session/resume` and
   * `session/load` restore it — what both real adapters do (V2: eviction is
   * close, then resume) — while a prompt on it is an error, not a turn.
   */
  closed?: boolean;
};

/** Model ids this fixture offers; the first is the `codex` pin's own default. */
const models = ['gpt-5.3-codex-spark', 'gpt-5.3-codex'];

const mode = process.env['TAU_FAKE_AGENT_MODE'] ?? '';

/**
 * Every ACP field this fixture reads is a string; anything else is a caller bug.
 *
 * @param value - Raw JSON-RPC parameter.
 * @param fallback - Value used when the parameter is absent or not a string.
 * @returns `value` when it is a string, else `fallback`.
 */
const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

/**
 * One nested JSON-RPC object, or nothing.
 *
 * @param value - Raw JSON-RPC parameter.
 * @returns The object, or `undefined` when the parameter is not one.
 */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an ACP payload is JSON by construction of its transport.
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** Whether the client advertised `elicitation.url`, read at `initialize`. */
let urlElicitation = false;

/** Whether the client advertised the AIR `sessionFailure` extension, read at `initialize`. */
let airSessionFailures = false;

/**
 * Whether one `initialize` request opted into AIR typed session failures.
 *
 * @param params - The `initialize` parameters as received.
 * @returns `true` for `_meta.jetbrains.air` version 1 or later listing `sessionFailure`.
 */
const advertisesAirSessionFailures = (params: Record<string, unknown>): boolean => {
  const air = asRecord(asRecord(asRecord(asRecord(params['clientCapabilities'])?.['_meta'])?.['jetbrains'])?.['air']);
  const capabilities = air?.['capabilities'];
  return (
    typeof air?.['version'] === 'number' &&
    air['version'] >= 1 &&
    Array.isArray(capabilities) &&
    capabilities.includes('sessionFailure')
  );
};

/** The provider failures `fail:<kind>` stops on, as both adapters' policy tables classify them. */
const providerFailures: Record<
  string,
  { readonly category: string; readonly title: string; readonly actions: readonly string[] }
> = {
  quota: {
    category: 'limit',
    title:
      "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 20th, 2026 4:07 PM.",
    actions: [],
  },
  rate: { category: 'limit', title: 'Codex is temporarily rate limited.', actions: ['retry'] },
  context: { category: 'limit', title: 'Codex ran out of room in its context window.', actions: ['new_session'] },
  model: {
    category: 'service',
    title: JSON.stringify({
      type: 'error',
      status: 400,
      error: { type: 'invalid_request_error', message: 'The requested model is not supported for this account.' },
    }),
    actions: ['retry'],
  },
};

/**
 * Whether one `initialize` request advertised URL elicitation.
 *
 * The real gate a real adapter applies: Codex offers its device-code login only
 * to a client that said it can present one.
 *
 * @param params - The `initialize` parameters as received.
 * @returns `true` when `clientCapabilities.elicitation.url` is present.
 */
const advertisesUrlElicitation = (params: Record<string, unknown>): boolean =>
  asRecord(asRecord(params['clientCapabilities'])?.['elicitation'])?.['url'] !== undefined;

const pause = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * Where sessions outlive this process.
 *
 * The daemon spawns one adapter per turn today and a resumed turn may land on a
 * *new* fixture process, so a session that lived only in memory could never be
 * resumed — the one thing `session/resume` exists to prove.
 */
/*
 * Keyed by cwd so a respawned fixture in the same workspace resumes, but kept
 * under the temp dir: the cwd is the user's project root now (V2), and a store
 * written there would be captured into a revision (review 1-review S2).
 */
const storePath = join(
  tmpdir(),
  `tau-fake-agent-${createHash('sha1').update(process.cwd()).digest('hex').slice(0, 16)}.json`,
);

type SessionStore = { readonly nextOrdinal: number; readonly sessions: Record<string, SessionState> };

const readStore = (): { nextOrdinal: number; sessions: Map<string, SessionState> } => {
  try {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- this process wrote the file it is reading.
    const store = JSON.parse(readFileSync(storePath, 'utf8')) as SessionStore;
    return { nextOrdinal: store.nextOrdinal, sessions: new Map(Object.entries(store.sessions)) };
  } catch {
    return { nextOrdinal: 0, sessions: new Map() };
  }
};

const store = readStore();
const { sessions } = store;

const saveSessions = (): void => {
  try {
    const persisted: SessionStore = { nextOrdinal: store.nextOrdinal, sessions: Object.fromEntries(sessions) };
    writeFileSync(storePath, JSON.stringify(persisted), 'utf8');
  } catch {
    /* A fixture whose branch is gone keeps serving from memory. */
  }
};

/*
 * A persisted ordinal, never `sessions.size + 1`: closing a low session while a
 * higher one lives would otherwise hand a fresh `session/new` a live id and
 * merge two chats' transcripts (review 1-review S1).
 */
const nextSessionId = (): string => {
  /* The ordinal is for the reader; the uuid is what makes the id unique. Two
   * fixture processes sharing this file still read-modify-write the ordinal
   * without a lock, so it can repeat — and a repeated id merges two chats'
   * transcripts (review 1-review S1, 3-review S7). */
  store.nextOrdinal = Math.max(store.nextOrdinal, readStore().nextOrdinal) + 1;
  saveSessions();
  return `fake-session-${String(store.nextOrdinal)}-${randomUUID().slice(0, 8)}`;
};

const pending = new Map<number, (message: JsonRpcMessage) => void>();
const cancelled = new Set<string>();
let nextId = 0;

const send = (message: JsonRpcMessage): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const request = async (method: string, params: Record<string, unknown>): Promise<JsonRpcMessage> => {
  nextId += 1;
  const id = nextId;
  const answered = new Promise<JsonRpcMessage>((resolve) => {
    pending.set(id, resolve);
  });
  send({ jsonrpc: '2.0', id, method, params });
  return answered;
};

const update = async (sessionId: string, sessionUpdate: Record<string, unknown>): Promise<void> => {
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: sessionUpdate } });
  /* Yield so an update the client acts on lands before the next one is written;
   * a real adapter's updates are separated by real work. */
  await pause(1);
};

const textChunk = async (sessionId: string, text: string): Promise<void> =>
  update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });

const toolCall = async (
  sessionId: string,
  call: {
    readonly toolCallId: string;
    readonly title: string;
    readonly kind?: string;
    /** The emitter's programmatic tool name (ACP `ToolCall.name`, experimental). */
    readonly name?: string;
    readonly rawInput?: unknown;
    readonly locations?: readonly unknown[];
    readonly _meta?: Readonly<Record<string, unknown>>;
  },
): Promise<void> => update(sessionId, { sessionUpdate: 'tool_call', status: 'pending', kind: 'edit', ...call });

const toolCallUpdate = async (
  sessionId: string,
  result: {
    readonly toolCallId: string;
    readonly status: 'in_progress' | 'completed' | 'failed';
    readonly rawOutput?: unknown;
    readonly content?: readonly unknown[];
  },
): Promise<void> => update(sessionId, { sessionUpdate: 'tool_call_update', ...result });

const promptText = (blocks: readonly unknown[]): string =>
  blocks
    .map((block) =>
      typeof block === 'object' && block !== null && 'text' in block ? String((block as { text: unknown }).text) : '',
    )
    .filter((text) => text !== '')
    .join(' ');

/**
 * The session's configuration options, in the shape this fixture's mode names.
 *
 * `modelChoice` on the client side flattens both a flat option list and a
 * grouped one; only one of those shapes can be exercised per process, so the
 * grouped variant is a mode rather than a prompt keyword.
 *
 * @param session - Session whose current values these are.
 * @returns The full option set, as `session/new` and friends must return it.
 */
const configOptionsOf = (session: SessionState): readonly unknown[] => {
  const options = models.map((value) => ({ value, name: value }));
  return [
    {
      id: 'model',
      name: 'Model',
      category: 'model',
      type: 'select',
      currentValue: session.model,
      options: mode === 'grouped' ? [{ group: 'codex', name: 'Codex', options }] : options,
    },
    {
      id: 'mode',
      name: 'Mode',
      category: 'mode',
      type: 'select',
      currentValue: String(session.config['mode']),
      options: [
        { value: 'default', name: 'Default' },
        { value: 'plan', name: 'Plan' },
      ],
    },
    {
      id: 'thought_level',
      name: 'Thinking',
      category: 'thought_level',
      type: 'select',
      currentValue: String(session.config['thought_level']),
      options: [
        { value: 'low', name: 'Low' },
        { value: 'medium', name: 'Medium' },
        { value: 'high', name: 'High' },
      ],
    },
    {
      id: 'web_search',
      name: 'Web search',
      category: 'model_config',
      type: 'boolean',
      currentValue: Boolean(session.config['web_search']),
    },
  ];
};

const callTauMcp = async (sessionId: string, servers: readonly McpServerEntry[]): Promise<void> => {
  const tau = servers.find((server) => server.name === 'tau');
  if (!tau?.url) {
    await textChunk(sessionId, 'mcp: no tau server was configured for this session');
    return;
  }
  await toolCall(sessionId, {
    toolCallId: 'mcp-1',
    title: 'mcp.tau.test_model',
    rawInput: { server: 'tau', tool: 'test_model', arguments: {} },
    _meta: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- MCP metadata retains its wire name.
      is_mcp_tool_call: true,
    },
  });
  try {
    const headers = Object.fromEntries(
      (tau.headers ?? []).flatMap((header) =>
        typeof header === 'object' && header !== null && 'name' in header && 'value' in header
          ? [[String((header as { name: unknown }).name), String((header as { value: unknown }).value)]]
          : [],
      ),
    );
    const client = await connectMcpOverFetch({ url: tau.url, headers });
    const result = await client.callTool('test_model', {});
    await toolCallUpdate(sessionId, {
      toolCallId: 'mcp-1',
      status: result.isError === true ? 'failed' : 'completed',
      rawOutput: { result, error: null },
    });
  } catch (error) {
    await toolCallUpdate(sessionId, {
      toolCallId: 'mcp-1',
      status: 'failed',
      rawOutput: { message: error instanceof Error ? error.message : String(error) },
    });
  }
};

const attemptEscape = async (sessionId: string, cwd: string): Promise<void> => {
  const outside = join(cwd, '..', 'escaped.txt');
  const answer = await request('fs/write_text_file', { sessionId, path: outside, content: 'escaped' });
  await textChunk(sessionId, `escape: ${answer.error ? answer.error.message : 'accepted'}`);
};

const attemptWrongSession = async (sessionId: string): Promise<void> => {
  const answer = await request('fs/write_text_file', {
    sessionId: `${sessionId}-foreign`,
    path: 'wrong-session.txt',
    content: 'foreign',
  });
  await textChunk(sessionId, `wrong-session: ${answer.error ? answer.error.message : 'accepted'}`);
};

/**
 * The `session/update` variants Tau projects as presentation, not history.
 *
 * Emitted together so one prompt proves the client stays indifferent to all of
 * them at once. Compaction is excluded on purpose: an agent may only send it to
 * a client that advertised the capability, and Tau's `initialize` does not.
 *
 * @param sessionId - Session receiving the updates.
 */
const emitPresentationUpdates = async (sessionId: string): Promise<void> => {
  await update(sessionId, {
    sessionUpdate: 'agent_thought_chunk',
    content: { type: 'text', text: '**Confirming test completion and readiness**' },
  });
  await update(sessionId, {
    sessionUpdate: 'agent_thought_chunk',
    content: { type: 'text', text: '\n\nThe current tool results are ready to verify.' },
  });
  const entry = { content: 'write hello.txt', priority: 'high', status: 'in_progress' };
  await update(sessionId, { sessionUpdate: 'plan', entries: [entry] });
  await update(sessionId, {
    sessionUpdate: 'plan_update',
    plan: { type: 'items', planId: 'plan-1', entries: [{ ...entry, status: 'completed' }] },
  });
  await update(sessionId, { sessionUpdate: 'plan_removed', planId: 'plan-1' });
  await update(sessionId, {
    sessionUpdate: 'available_commands_update',
    availableCommands: [{ name: 'compact', description: 'Compact the conversation' }],
  });
  await update(sessionId, { sessionUpdate: 'current_mode_update', currentModeId: 'default' });
  await update(sessionId, { sessionUpdate: 'session_info_update', title: 'Fixture session' });
};

const reportNativeSkills = async (sessionId: string, session: SessionState, namesOnly: boolean): Promise<void> => {
  if (namesOnly) {
    const namesByRoot = await Promise.all(
      session.additionalDirectories.map(async (root) => {
        const paths = await readdir(join(root, '.agents', 'skills'), { recursive: true });
        return paths.filter((path) => path.endsWith('/SKILL.md')).map((path) => path.slice(0, -'/SKILL.md'.length));
      }),
    );
    const names = namesByRoot.flat();
    await update(sessionId, {
      sessionUpdate: 'available_commands_update',
      availableCommands: names.map((name) => ({ name: `$${name}`, description: 'Native skill' })),
    });
    await textChunk(sessionId, `native-skill-names: ${JSON.stringify(names)}`);
    return;
  }
  const skills = await Promise.all(
    session.additionalDirectories.map(async (root) => {
      const skillRoot = join(root, '.agents', 'skills');
      const paths = await readdir(skillRoot, { recursive: true });
      const files = await Promise.all(
        paths.toSorted().map(async (path) => {
          try {
            return [path, await readFile(join(skillRoot, path), 'utf8')] as const;
          } catch {
            return undefined;
          }
        }),
      );
      return { root, files: Object.fromEntries(files.filter((file) => file !== undefined)) };
    }),
  );
  await update(sessionId, {
    sessionUpdate: 'available_commands_update',
    availableCommands: skills.flatMap(({ files }) =>
      Object.keys(files)
        .filter((path) => path.endsWith('/SKILL.md'))
        .map((path) => ({ name: `$${path.slice(0, -'/SKILL.md'.length)}`, description: 'Native skill' })),
    ),
  });
  await textChunk(sessionId, `native-skills: ${JSON.stringify(skills)}`);
};

/**
 * A Codex-shaped tool sequence: every `ToolKind` Tau renders, every content
 * shape, and the `pending → in_progress → completed` order a long call takes.
 *
 * @param sessionId - Session receiving the calls.
 * @param cwd - Session working directory, so the locations are absolute.
 */
const emitToolCalls = async (sessionId: string, cwd: string): Promise<void> => {
  const calls = [
    {
      toolCallId: 'list-1',
      name: 'listFiles',
      kind: 'read',
      title: 'List files',
      rawInput: { path: '.' },
      locations: [{ path: join(cwd, 'main.scad'), line: 1 }],
      content: [{ type: 'content', content: { type: 'text', text: 'main.scad\nhello.txt' } }],
    },
    {
      toolCallId: 'shell-1',
      name: 'shell',
      kind: 'execute',
      title: 'Run the kernel',
      rawInput: { command: 'openscad main.scad' },
      content: [{ type: 'terminal', terminalId: 'terminal-1' }],
    },
    {
      toolCallId: 'think-1',
      name: 'think',
      kind: 'think',
      title: 'Consider the fillet radius',
      content: [{ type: 'content', content: { type: 'text', text: '2mm clears the boss' } }],
    },
    {
      toolCallId: 'fetch-1',
      name: 'webFetch',
      kind: 'fetch',
      title: 'Read the datasheet',
      rawInput: { url: 'https://example.invalid/datasheet' },
      content: [{ type: 'content', content: { type: 'text', text: 'M3 clearance 3.4mm' } }],
    },
    {
      toolCallId: 'edit-1',
      name: 'applyPatch',
      kind: 'edit',
      title: 'Edit main.scad',
      locations: [{ path: join(cwd, 'main.scad') }],
      content: [{ type: 'diff', path: join(cwd, 'main.scad'), oldText: 'cube(10);\n', newText: 'cube(12);\n' }],
    },
  ];
  for (const { content, ...call } of calls) {
    // oxlint-disable-next-line no-await-in-loop -- the call order is what this sequence exists to prove.
    await toolCall(sessionId, call);
    // oxlint-disable-next-line no-await-in-loop -- same.
    await toolCallUpdate(sessionId, { toolCallId: call.toolCallId, status: 'in_progress', content });
    // oxlint-disable-next-line no-await-in-loop -- same.
    await toolCallUpdate(sessionId, {
      toolCallId: call.toolCallId,
      status: 'completed',
      content,
      rawOutput: { kind: call.kind },
    });
  }
};

/**
 * The URL (device-code) login Codex only offers to a client that can present it.
 *
 * The whole point of the flow, in three frames: a request carrying the
 * verification URL and the code, the client's answer, and the notification that
 * says the user finished. The code rides `_meta`, where a real agent puts it.
 *
 * @param sessionId - Session the login belongs to.
 * @param url - Where the fixture says the user should sign in.
 */
const driveUrlLogin = async (sessionId: string, url = 'https://example.invalid/device'): Promise<void> => {
  if (!urlElicitation) {
    await textChunk(sessionId, 'login: this client cannot present a url elicitation');
    return;
  }
  const elicitationId = 'login-1';
  const answer = await request('elicitation/create', {
    sessionId,
    mode: 'url',
    elicitationId,
    url,
    message: 'Open the verification page and enter FAKE-CODE.',
    _meta: { code: 'FAKE-CODE' },
  });
  send({ jsonrpc: '2.0', method: 'elicitation/complete', params: { elicitationId } });
  await pause(1);
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the elicitation response shape is fixed by ACP.
  const action = (answer.result as { action?: string } | undefined)?.action ?? 'none';
  await textChunk(sessionId, `login: ${action}`);
};

/**
 * The permission-gated write every turn ends with.
 *
 * @param sessionId - Session performing the write.
 * @param session - That session's state.
 * @param text - Prompt text, which is also the file's content.
 * @returns `true` when the write happened, `false` when it was refused.
 */
const writeGatedFile = async (sessionId: string, session: SessionState, text: string): Promise<boolean> => {
  await toolCall(sessionId, { toolCallId: 'write-1', title: 'write hello.txt', rawInput: { path: 'hello.txt' } });
  /* SP-4 Result 3: a real adapter under the user's own `approval_policy =
   * "never"` writes without asking at all, so the fixture models that too. */
  const permission = text.includes('noask')
    ? { result: { outcome: { outcome: 'selected', optionId: 'allow' } } }
    : await request('session/request_permission', {
        sessionId,
        toolCall: { toolCallId: 'write-1', title: 'write hello.txt' },
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'allow-session', name: 'Allow for this session', kind: 'allow_always' },
          { optionId: 'allow-always', name: 'Always allow', kind: 'allow_always' },
          { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
        ],
      });
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the permission response shape is fixed by ACP.
  const outcome = (permission.result as { outcome?: { outcome?: string; optionId?: string } } | undefined)?.outcome;
  if (outcome?.outcome !== 'selected' || !outcome.optionId?.startsWith('allow')) {
    await toolCallUpdate(sessionId, {
      toolCallId: 'write-1',
      status: 'failed',
      /* The id is echoed, not just the outcome: a client that names one option
       * out of several has to be able to prove which one reached the agent. */
      rawOutput: { outcome: outcome?.outcome ?? 'unknown', optionId: outcome?.optionId ?? 'none' },
    });
    return false;
  }
  await writeFile(join(session.cwd, 'hello.txt'), text, 'utf8');
  await toolCallUpdate(sessionId, {
    toolCallId: 'write-1',
    ...(text.includes('clear-title') ? { title: '' } : {}),
    status: 'completed',
    /* Echoed on success too, so a named option is provable either way. */
    rawOutput: { path: 'hello.txt', bytes: Buffer.byteLength(text), optionId: outcome.optionId },
  });
  return true;
};

// oxlint-disable-next-line eslint/max-lines-per-function -- one prompt is one keyword table; splitting it would hide the order the updates arrive in.
const runPrompt = async (sessionId: string, blocks: readonly unknown[]): Promise<string> => {
  const session = sessions.get(sessionId);
  if (!session) {
    return 'refusal';
  }
  const text = promptText(blocks);
  session.prompts.push(text);
  saveSessions();
  await textChunk(
    sessionId,
    JSON.stringify({
      cwd: session.cwd,
      env: Object.keys(process.env).toSorted((a, b) => a.localeCompare(b)),
      model: session.model,
      turn: session.prompts.length,
    }),
  );
  await update(sessionId, {
    sessionUpdate: 'usage_update',
    used: 1200 * session.prompts.length,
    size: 200_000,
    cost: { amount: 0.01 * session.prompts.length, currency: 'USD' },
  });
  if (session.prompts.length > 1) {
    await textChunk(sessionId, `transcript: ${session.prompts.join(' | ')}`);
  }
  /* An agent that hits its own token ceiling, refuses, or is told to stop still
   * answers the prompt request — with a stop reason, not an error. */
  const forced = /stop:([a-z_]+)/u.exec(text)?.[1];
  if (forced !== undefined) {
    return forced;
  }
  if (text.includes('updates')) {
    await emitPresentationUpdates(sessionId);
  }
  if (text.includes('skills') || text.includes('skill-names')) {
    await reportNativeSkills(sessionId, session, text.includes('skill-names'));
  }
  if (text.includes('switch')) {
    session.model = models.find((candidate) => candidate !== session.model) ?? session.model;
    saveSessions();
    await update(sessionId, { sessionUpdate: 'config_option_update', configOptions: configOptionsOf(session) });
    await textChunk(sessionId, `model: ${session.model}`);
  }
  if (text.includes('slow')) {
    for (let waited = 0; waited < 300 && !cancelled.has(sessionId); waited += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling for a cancel notification is ordered by construction.
      await pause(100);
    }
    return cancelled.has(sessionId) ? 'cancelled' : 'end_turn';
  }
  if (text.includes('fs-inflight')) {
    void request('fs/write_text_file', { sessionId, path: 'admitted.txt', content: 'admitted write' });
    await pause(250);
    return 'end_turn';
  }
  if (text.includes('login')) {
    /* `unsafe` makes the agent name a scheme no browser should follow, which is
     * the one thing the client has to drop before any surface renders it. */
    // oxlint-disable-next-line eslint/no-script-url -- naming the scheme the client must drop is this branch's whole purpose.
    await driveUrlLogin(sessionId, text.includes('unsafe') ? 'javascript:fetch("/steal")' : undefined);
  }
  if (text.includes('escape')) {
    await attemptEscape(sessionId, session.cwd);
  }
  if (text.includes('wrong-session')) {
    await attemptWrongSession(sessionId);
  }
  if (text.includes('abandon')) {
    /* Asked and then gone: the request is sent, never answered, and this process
     * dies with it outstanding — what an OOM, a crash or a dropped connection
     * looks like to a host holding a permission the user was going to answer. */
    void request('session/request_permission', {
      sessionId,
      toolCall: { toolCallId: 'write-1', title: 'write hello.txt' },
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    });
    /* Long enough for the request to leave this process's stdout pipe and for
     * the host to record it durably; `process.exit` discards what is still
     * queued. */
    await pause(250);
    // oxlint-disable-next-line unicorn/no-process-exit -- dying mid-permission is this branch's whole purpose.
    process.exit(1);
  }
  if (text.includes('tools')) {
    await emitToolCalls(sessionId, session.cwd);
  }
  if (!(await writeGatedFile(sessionId, session, text))) {
    return 'refusal';
  }
  if (text.includes('mcp')) {
    await callTauMcp(sessionId, session.mcpServers);
  }
  return cancelled.has(sessionId) ? 'cancelled' : 'end_turn';
};

/**
 * Register (or recover) one session for `session/new`, `resume` and `load`.
 *
 * @param sessionId - Session to open.
 * @param params - Request parameters carrying `cwd` and the MCP servers.
 * @returns The session's state.
 */
const openSession = (sessionId: string, params: Record<string, unknown>): SessionState => {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.closed = false;
  }
  const session: SessionState = existing ?? {
    cwd: asString(params['cwd'], process.cwd()),
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the session MCP server list is fixed by ACP.
    mcpServers: (params['mcpServers'] ?? []) as readonly McpServerEntry[],
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the additional-directory list is fixed by ACP.
    additionalDirectories: (params['additionalDirectories'] ?? []) as readonly string[],
    prompts: [],
    model: models[0] ?? '',
    config: {
      mode: 'default',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP configuration retains its wire id.
      thought_level: 'medium',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP configuration retains its wire id.
      web_search: false,
    },
  };
  sessions.set(sessionId, session);
  cancelled.delete(sessionId);
  saveSessions();
  return session;
};

/**
 * What `initialize` advertises, which the auth mode changes.
 *
 * @returns The `InitializeResponse` body.
 */
const initializeResult = (): Record<string, unknown> => ({
  protocolVersion: mode === 'protocol-2' ? 2 : 1,
  agentCapabilities: {
    loadSession: true,
    sessionCapabilities: {
      resume: {},
      close: {},
      ...(mode === 'no-additional-directories' ? {} : { additionalDirectories: {} }),
    },
    ...(mode === 'no-http' ? {} : { mcpCapabilities: { http: true } }),
    /* Both real pins advertise `image` too; the fixture withholds it unless the
     * `images` mode names it, so the refusal path has something to refuse. */
    promptCapabilities: { image: mode === 'images', embeddedContext: mode !== 'text-only' },
  },
  authMethods:
    mode === 'auth-required'
      ? [
          {
            id: 'codex-login',
            name: 'Log in with Codex',
            description: 'Sign in to the Codex CLI on the machine running this agent.',
            /* What Claude sends back to a client that advertised
             * `_meta['terminal-auth']`: a whole invocation the user can run. */
            _meta: { 'terminal-auth': { command: 'codex', args: ['login'], label: 'Log in with Codex' } },
          },
        ]
      : [],
});

/**
 * Answer one `session/prompt`: run the turn, then report its usage.
 *
 * @param sessionId - Session being prompted.
 * @param blocks - The prompt's content blocks.
 * @returns The `PromptResponse` body.
 */
const promptResult = async (sessionId: string, blocks: readonly unknown[]): Promise<Record<string, unknown>> => {
  const stopReason = await runPrompt(sessionId, blocks);
  if (promptText(blocks).includes('late-auth')) {
    /* An agent that asks *after* its turn ended — the window the host's own
     * "only while a turn is in flight" invariant covers.
     * async-iife: bootstrap -- the point of the keyword is work this response
     * must not wait for; the fixture exits when its stream closes. */
    void (async () => {
      /* Long enough for the client to have finished flushing the turn it just
       * answered; the point of the keyword is the window *after* that. */
      await pause(250);
      await driveUrlLogin(sessionId);
    })();
  }
  if (promptText(blocks).includes('late-state')) {
    // async-iife: bootstrap -- fixture notification deliberately arrives after the prompt response.
    void (async () => {
      await pause(250);
      await update(sessionId, {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'late-command', description: 'Reported between turns' }],
      });
    })();
  }
  const turns = sessions.get(sessionId)?.prompts.length ?? 1;
  return {
    stopReason,
    usage: { totalTokens: 1500 * turns, inputTokens: 1200 * turns, outputTokens: 300 * turns, thoughtTokens: 0 },
  };
};

// oxlint-disable-next-line eslint/max-lines-per-function -- the method table is the fixture's whole contract.
const handle = async (message: JsonRpcMessage): Promise<void> => {
  if (message.id !== undefined && message.method === undefined) {
    pending.get(Number(message.id))?.(message);
    pending.delete(Number(message.id));
    return;
  }
  const params = message.params ?? {};
  const reply = (result: unknown): void => {
    if (message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, result });
    }
  };
  const fail = (code: number, text: string): void => {
    if (message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, error: { code, message: text } });
    }
  };
  switch (message.method) {
    case 'initialize': {
      urlElicitation = advertisesUrlElicitation(params);
      airSessionFailures = advertisesAirSessionFailures(params);
      if (mode === 'silent') {
        /* The adapter that never answers: the client's own timeout is the only
         * thing that can end this turn. */
        return;
      }
      reply(initializeResult());
      return;
    }
    case 'session/new': {
      if (mode === 'auth-required') {
        fail(-32_000, 'Authentication required');
        return;
      }
      const sessionId = nextSessionId();
      reply({ sessionId, configOptions: configOptionsOf(openSession(sessionId, params)) });
      return;
    }
    case 'session/resume': {
      if (mode === 'restore-auth') {
        fail(-32_000, 'Authentication required');
        return;
      }
      /* Resume restores nothing to the client by contract — the caller keeps
       * the transcript it already has. */
      reply({ configOptions: configOptionsOf(openSession(asString(params['sessionId']), params)) });
      return;
    }
    case 'session/load': {
      if (mode === 'restore-auth') {
        fail(-32_000, 'Authentication required');
        return;
      }
      const sessionId = asString(params['sessionId']);
      const session = openSession(sessionId, params);
      /* Load replays: one chunk per stored prompt, before the reply, which is
       * the only wire-visible difference from `resume`. */
      for (const prompt of session.prompts) {
        // oxlint-disable-next-line no-await-in-loop -- replay is ordered by construction.
        await textChunk(sessionId, `replay: ${prompt}`);
      }
      reply({ configOptions: configOptionsOf(session) });
      return;
    }
    case 'session/set_config_option': {
      const session = sessions.get(asString(params['sessionId']));
      if (!session) {
        fail(-32_602, 'Unknown session');
        return;
      }
      const configId = asString(params['configId']);
      if (configId === 'model') {
        session.model = asString(params['value'], session.model);
        saveSessions();
      } else if (
        configId in session.config &&
        (typeof params['value'] === 'string' || typeof params['value'] === 'boolean')
      ) {
        session.config[configId] = params['value'];
        saveSessions();
      }
      reply({ configOptions: configOptionsOf(session) });
      return;
    }
    case 'session/close': {
      const session = sessions.get(asString(params['sessionId']));
      if (session) {
        session.closed = true;
      }
      saveSessions();
      reply({});
      return;
    }
    case 'session/cancel': {
      cancelled.add(asString(params['sessionId']));
      return;
    }
    case 'session/prompt': {
      const promptSession = sessions.get(asString(params['sessionId']));
      /* A real agent errors here; a stop reason would make "the session is
       * gone" indistinguishable from "the model refused" (review 1-review S5). */
      if (!promptSession || promptSession.closed) {
        fail(-32_602, 'Unknown session');
        return;
      }
      const promptSessionId = asString(params['sessionId']);
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the prompt block list is fixed by ACP.
      const text = promptText((params['prompt'] ?? []) as readonly unknown[]);
      const limit = providerFailures[/fail:([a-z]+)/u.exec(text)?.[1] ?? ''];
      if (limit && airSessionFailures) {
        reply({
          stopReason: 'end_turn',
          _meta: {
            jetbrains: {
              air: {
                version: 1,
                sessionFailure: {
                  id: `${promptSessionId}:error`,
                  revision: 1,
                  category: limit.category,
                  severity: 'error',
                  title: limit.title,
                  actions: limit.actions,
                },
              },
            },
          },
        });
        return;
      }
      if (limit !== undefined || text.includes('crash')) {
        if (limit !== undefined) {
          await textChunk(promptSessionId, `${limit.title}\n\n`);
        }
        process.stderr.write(
          `[SYSTEM_ERROR] Prompt for session ${promptSessionId} failed: RequestError: Internal error\n    at fake-agent\n`,
        );
        fail(-32_603, 'Internal error');
        return;
      }
      reply(
        await promptResult(
          asString(params['sessionId']),
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the prompt block list is fixed by ACP.
          (params['prompt'] ?? []) as readonly unknown[],
        ),
      );
      return;
    }
    default: {
      fail(-32_601, `Unknown method ${asString(message.method, '(none)')}`);
    }
  }
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- inbound frames are JSON-RPC by construction of the stream.
    const message = JSON.parse(line) as JsonRpcMessage;
    /* async-iife: bootstrap. Concurrently, never chained: a chain would queue
     * the permission *response* behind the `session/prompt` request that is
     * waiting for it, and a `session/cancel` behind the turn it should stop. */
    const dispatch = async (): Promise<void> => {
      try {
        await handle(message);
      } catch {
        /* A fixture that cannot answer one frame keeps serving the rest. */
      }
    };
    void dispatch();
  }
});
