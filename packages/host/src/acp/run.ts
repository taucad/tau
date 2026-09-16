/**
 * The external-agent run kind: `ExternalAgentPort`, backed by ACP adapters.
 *
 * **One session per chat, in the project's own tree.** V2 retires the per-run
 * workspace copy: an external agent works where a Tau turn works — the
 * workspace authority root in direct mode — and every turn of a chat prompts
 * the *same* vendor session, so turn two can see turn one's files and remembers
 * turn one's conversation.
 *
 * The adapter child and its connection are a cache keyed by agent and chat,
 * bounded by an idle timer and a small LRU cap. Correctness never depends on
 * that cache: an evicted session is restored with `session/resume` (r1 §3a), so
 * dropping one is a cost, not a semantic change.
 *
 * SP-4 Result 3 still stands — a user's own CLI config (`approval_policy =
 * "never"`, trusted project) beats the ACP mode, so product copy must not
 * promise per-action approval for external agents. What confines the agent is
 * the session `cwd` and the client filesystem fence in `session.ts`, and, when
 * a chat asks for it, a revision checkout rather than the authority root.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ContentBlock, McpServer, Usage as AcpUsage } from '@agentclientprotocol/sdk';

import { materializeAttachments, reduceEventLog } from '@taucad/agent-host';
import type {
  DocumentBlockBuilder,
  ExternalAgentPort,
  ExternalAgentTurn,
  JsonObject,
  JsonValue,
} from '@taucad/agent-host';
import { createNodeAttachmentReader } from '@taucad/agent-host/node';
import { createSkillBundleRegistry } from '@taucad/agent-tools/registry';
import { tauMcpInstructions } from '@taucad/mcp';
import { isRecord } from '@taucad/utils/schema';

import { openAcpSession } from '#acp/session.js';
import type { AcpSession } from '#acp/session.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import type { AcpAdapter } from '#acp/registry.js';
import type { HostSystemSkillBundle } from '#agent-tools.js';
import { defaultConfigDirectory } from '#credential-store.js';

/**
 * Open with the turn's own cancellation in force.
 *
 * `initialize` and `session/new` have no timeout of their own, and the prompt
 * only listens for abort once the session exists — so an adapter that never
 * answers its handshake would otherwise hold `cancel` open forever (D12:
 * observe settlement, never wait on a peer that will not settle; review
 * 1-review S3). A session that opens after the abort is closed, not leaked.
 *
 * @param pending - The session being opened.
 * @param signal - The turn's signal.
 * @returns The open session, or a rejection carrying the abort reason.
 */
const abortableOpen = async (pending: Promise<AcpSession>, signal: AbortSignal): Promise<AcpSession> => {
  const abortReason = (): Error =>
    signal.reason instanceof Error ? signal.reason : new DOMException('The turn was cancelled.', 'AbortError');
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(abortReason());
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([pending, aborted]);
  } catch (error) {
    // async-iife: bootstrap -- a session that opens after the abort is closed, not leaked; no caller waits for it.
    void (async () => {
      try {
        const session = await pending;
        await session.close();
      } catch {
        /* It never opened; there is nothing to close. */
      }
    })();
    throw error;
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
};

/** Name the daemon's own MCP server carries inside an agent session. @public */
export const tauMcpServerName = 'tau';

/**
 * Milliseconds a live session may sit idle before it is closed.
 *
 * Fifteen minutes is short enough that an abandoned chat does not hold an
 * adapter process all day. It bounds idleness only: a chat prompted every
 * fourteen minutes keeps its session for as long as it likes, which is why the
 * MCP capability's expiry is handled as an eviction of its own
 * ({@link acpCapabilityRenewalMargin}), not by this timer (r1 risk 3, review
 * 2-review S1).
 *
 * @public
 */
export const acpSessionIdleTimeout = 15 * 60 * 1000;

/**
 * Milliseconds before a capability's expiry at which its session is closed
 * instead of reused, so the next turn reopens with a fresh capability.
 *
 * @public
 */
export const acpCapabilityRenewalMargin = 60 * 60 * 1000;

/**
 * Live sessions one host keeps warm before evicting the least recently used.
 *
 * One idle Node process per open chat is the cost; four bounds it. Eviction is
 * `session/close` plus a `session/resume` on the chat's next turn, which is the
 * cold path this design already has to be correct on.
 *
 * @public
 */
export const acpLiveSessionLimit = 4;

/** Options for {@link createAcpExternalAgentPort}. @public */
export type AcpExternalAgentPortOptions = {
  /** Adapters this daemon resolved and probed. */
  readonly agents: readonly AcpAdapter[];
  /** Absolute workspace root; the agent's `cwd` in direct mode. */
  readonly workspaceRoot: string;
  /** Package-owned skills published to the adapter's native skill loader. */
  readonly systemSkillBundles?: readonly HostSystemSkillBundle[] | undefined;
  /**
   * Host-local MCP endpoint (X4). Present, every session is offered the `tau`
   * server with a capability minted for *that chat session*; absent, the agent
   * runs with its own tools only.
   */
  readonly mcp?:
    | {
        readonly url: string;
        mint(input: { readonly runId: string; readonly chatId: string }): {
          readonly token: string;
          /** ISO instant after which the endpoint rejects the token. */
          readonly expiresAt: string;
        };
        activate(input: {
          readonly token: string;
          readonly runId: string;
          readonly chatId: string;
          readonly signal: AbortSignal;
        }): () => void | Promise<void>;
      }
    | undefined;
  readonly onFrame?: ((frame: AcpWireFrame) => void) | undefined;
  readonly createId?: (() => string) | undefined;
  /** Idle milliseconds before a live session is closed; defaults to {@link acpSessionIdleTimeout}. */
  readonly idleTimeout?: number | undefined;
  /**
   * Where the host prepared each admitted turn to run (V19).
   *
   * The same map the project's revision tree writes: a live-checkout turn publishes the
   * workspace root, candidate mode the revision checkout the authority
   * materialized for this run. Absent — or missing this run — falls back to
   * {@link AcpExternalAgentPortOptions.workspaceRoot}, which is the direct-mode
   * answer, so a host with no revision port still runs.
   */
  readonly checkouts?: ReadonlyMap<string, { readonly cwd: string; readonly mode: string }> | undefined;
};

/** One cached adapter child, connection and vendor session. */
type LiveSession = {
  readonly chatId: string;
  readonly session: AcpSession;
  /** The directory this session was opened against; a turn in another one reopens. */
  readonly cwd: string;
  /** A session answering a prompt is never evicted under it. */
  busy: boolean;
  /** Epoch milliseconds when the session's MCP capability expires; absent without MCP. */
  readonly capabilityExpiresAt?: number | undefined;
  readonly capabilityToken?: string | undefined;
  timer?: NodeJS.Timeout | undefined;
};

const publishSystemSkills = async (
  bundles: readonly HostSystemSkillBundle[] | undefined,
  signal: AbortSignal,
): Promise<{ readonly root: string } | undefined> => {
  if (!bundles || bundles.length === 0) {
    return undefined;
  }
  const registry = createSkillBundleRegistry(bundles);
  const parent = join(defaultConfigDirectory(), 'acp-skills');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  /* Codex registers this directory only with its native skill catalog. It is
   * deliberately outside cwd and the operating-system temporary roots that a
   * workspace-write sandbox grants by default. Project skill discovery still
   * runs first and owns native precedence; an invalid project entry cannot
   * erase a valid package skill before that loader sees either candidate. */
  const digest = createHash('sha256')
    .update(
      JSON.stringify(
        registry.bundles.map((bundle) => ({
          slug: bundle.slug,
          files: bundle.files.map(({ path, sha256 }) => ({ path, sha256 })),
        })),
      ),
    )
    .digest('hex');
  const root = join(parent, digest);
  const stagingRoot = await mkdtemp(join(parent, '.staging-'));
  const staging = join(stagingRoot, '.agents', 'skills');
  const verified = new Map<string, string>();
  try {
    for (const bundle of registry.bundles) {
      for (const resource of bundle.files) {
        signal.throwIfAborted();
        // oxlint-disable-next-line no-await-in-loop -- resources must be verified and published in their manifest order.
        const bytes = await readFile(new URL(resource.url), { signal });
        const fingerprint = createHash('sha256').update(bytes).digest('hex');
        if (bytes.byteLength !== resource.byteLength || fingerprint !== resource.sha256) {
          throw new Error(`System skill resource changed after generation: ${bundle.slug}/${resource.path}`);
        }
        if (resource.path === 'SKILL.md' && bytes.toString('utf8') !== bundle.body) {
          throw new Error(`System skill body does not match SKILL.md: ${bundle.slug}`);
        }
        const target = join(staging, bundle.slug, resource.path);
        verified.set(join(bundle.slug, resource.path), fingerprint);
        // oxlint-disable-next-line no-await-in-loop -- each verified resource needs its parent before its atomic publication.
        await mkdir(dirname(target), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- resources must be complete before the directory becomes visible.
        await writeFile(target, bytes, { signal });
      }
    }
    try {
      await rename(stagingRoot, root);
    } catch (error) {
      if (!isRecord(error) || (error['code'] !== 'EEXIST' && error['code'] !== 'ENOTEMPTY')) {
        throw error;
      }
      for (const [path, fingerprint] of verified) {
        // oxlint-disable-next-line no-await-in-loop -- verify the existing immutable publication before native discovery.
        const published = await readFile(join(root, '.agents', 'skills', path), { signal });
        if (createHash('sha256').update(published).digest('hex') !== fingerprint) {
          throw new Error(`Published system skill resource changed: ${path}`);
        }
      }
    }
    // Ponytail: retain one tree per content version; GC needs vendor-session reference ownership, not a connection TTL.
    return { root };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
};

const record = (value: unknown): Record<string, JsonValue> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a durable message body is JSON by construction of the log.
      (value as Record<string, JsonValue>)
    : undefined;

/**
 * One durable message block as the protocol carries it.
 *
 * An image is a *block*, not a dropped attachment: `session.prompt` refuses it
 * loudly when the agent cannot read one, which is the whole point of carrying
 * it this far (V12). A `resource_link` passes through for the same reason — the
 * agent can fetch it back through `fs/read_text_file`, which this host already
 * serves and fences.
 *
 * @param block - One entry of the user message's content array.
 * @returns The ACP block, or `undefined` for a shape ACP has no carrier for.
 */
const contentBlockOf = (block: unknown): ContentBlock | undefined => {
  const fields = record(block);
  if (typeof fields?.['text'] === 'string') {
    return { type: 'text', text: fields['text'] };
  }
  if (fields?.['type'] === 'image' && typeof fields['data'] === 'string' && typeof fields['mimeType'] === 'string') {
    return { type: 'image', data: fields['data'], mimeType: fields['mimeType'] };
  }
  if (fields?.['type'] === 'audio' && typeof fields['data'] === 'string' && typeof fields['mimeType'] === 'string') {
    return { type: 'audio', data: fields['data'], mimeType: fields['mimeType'] };
  }
  if (fields?.['type'] === 'resource_link' && typeof fields['uri'] === 'string') {
    return {
      type: 'resource_link',
      uri: fields['uri'],
      name: typeof fields['name'] === 'string' ? fields['name'] : fields['uri'],
    };
  }
  if (fields?.['type'] === 'resource') {
    const resource = record(fields['resource']);
    if (typeof resource?.['uri'] === 'string' && typeof resource['text'] === 'string') {
      return {
        type: 'resource',
        resource: {
          uri: resource['uri'],
          text: resource['text'],
          ...(typeof resource['mimeType'] === 'string' ? { mimeType: resource['mimeType'] } : {}),
        },
      };
    }
    if (typeof resource?.['uri'] === 'string' && typeof resource['blob'] === 'string') {
      return {
        type: 'resource',
        resource: {
          uri: resource['uri'],
          blob: resource['blob'],
          ...(typeof resource['mimeType'] === 'string' ? { mimeType: resource['mimeType'] } : {}),
        },
      };
    }
  }
  return undefined;
};

/**
 * One piece of Tau's own context, embedded rather than written into the tree (V12).
 *
 * @param uri - The `tau://` name this context is addressed by.
 * @param mimeType - How the agent should read it.
 * @param text - The context itself.
 * @returns The embedded resource block.
 */
const contextBlock = (uri: string, mimeType: string, text: string): ContentBlock => ({
  type: 'resource',
  resource: { uri, mimeType, text },
});

/**
 * The CAD context a Tau turn composes, as embedded resources.
 *
 * V12 supersedes the cheaper rung r4 proposed: in direct mode the agent's cwd
 * *is* the user's project, so writing an `AGENTS.md` there would put a Tau
 * control file in the authored tree (filesystem policy Rule 16) and capture it
 * into every revision. The same bytes ride the prompt instead, on the session's
 * first turn only. Current project facts still ride every turn so a session
 * resumed after another agent's edit cannot keep stale context (EQ8).
 *
 * This content is transmitted to the vendor, exactly like the tree the agent
 * already reads.
 *
 * @param config - The admission config the client sent for this turn.
 * @param first - Whether this is the first prompt on the vendor session.
 * @returns The resource blocks, or none when the client sent no context.
 */
const cadContextBlocks = (config: ExternalAgentTurn['config'], first: boolean): readonly ContentBlock[] => {
  if (!config) {
    return [];
  }
  const skills = config.clientContext?.skills ?? [];
  const memory = config.clientContext?.memory ?? {};
  return [
    ...(first ? [contextBlock('tau://agent-guidance', 'text/markdown', tauMcpInstructions)] : []),
    ...(skills.length === 0
      ? []
      : [
          contextBlock(
            'tau://skills',
            'text/markdown',
            skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n'),
          ),
        ]),
    ...(Object.keys(memory).length === 0
      ? []
      : [contextBlock('tau://memory', 'application/json', JSON.stringify(memory))]),
    ...(config.snapshot === undefined
      ? []
      : [contextBlock('tau://snapshot', 'application/json', JSON.stringify(config.snapshot))]),
  ];
};

/**
 * The prompt this turn sends, as content blocks.
 *
 * @param turn - The turn whose message carries the prompt.
 * @param first - Whether this is the first prompt of a fresh vendor session.
 * @returns The blocks, or `undefined` when this turn only reattaches.
 */
const promptBlocksOf = (turn: ExternalAgentTurn, first: boolean): readonly ContentBlock[] | undefined => {
  const { content } = turn.message ?? {};
  const blocks =
    typeof content === 'string'
      ? [{ type: 'text', text: content } satisfies ContentBlock]
      : Array.isArray(content)
        ? content.map((block) => {
            const mapped = contentBlockOf(block);
            if (!mapped) {
              throw Object.assign(new Error('This user message contains a block ACP cannot carry.'), {
                code: 'EXTERNAL_AGENT_CONTENT_UNSUPPORTED',
              });
            }
            return mapped;
          })
        : [];
  if (blocks.length === 0) {
    return undefined;
  }
  return [...cadContextBlocks(turn.config, first), ...blocks];
};

/**
 * A document as ACP carries it (D23): an embedded resource with its bytes.
 *
 * @param hash - The document's SHA-256, as its attachment path names it.
 * @param document - The bytes and media type read for this prompt.
 * @param reference - The durable reference, whose extension the uri keeps.
 * @returns The `resource` block {@link contentBlockOf} maps.
 */
const acpDocumentBlock: DocumentBlockBuilder = (hash, document, reference) => ({
  type: 'resource',
  resource: {
    uri: `tau://attachments/${hash}${reference.path.slice(reference.path.lastIndexOf('.'))}`,
    mimeType: document.mediaType,
    blob: document.data,
  },
});

const stringField = (state: JsonObject | undefined, name: string): string | undefined => {
  const value = state?.[name];
  return typeof value === 'string' ? value : undefined;
};

const usageNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const usageField = (state: JsonObject | undefined): AcpUsage | undefined => {
  const value = state?.['acpPriorUsage'];
  if (!isRecord(value)) {
    return undefined;
  }
  const totalTokens = usageNumber(value['totalTokens']);
  const inputTokens = usageNumber(value['inputTokens']);
  const outputTokens = usageNumber(value['outputTokens']);
  const thoughtTokens = usageNumber(value['thoughtTokens']);
  const cachedReadTokens = usageNumber(value['cachedReadTokens']);
  const cachedWriteTokens = usageNumber(value['cachedWriteTokens']);
  if (totalTokens === undefined || inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  return {
    totalTokens,
    inputTokens,
    outputTokens,
    ...(thoughtTokens === undefined ? {} : { thoughtTokens }),
    ...(cachedReadTokens === undefined ? {} : { cachedReadTokens }),
    ...(cachedWriteTokens === undefined ? {} : { cachedWriteTokens }),
  };
};

const usageState = (usage: AcpUsage): JsonObject => ({
  totalTokens: usage.totalTokens,
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  ...(typeof usage.thoughtTokens === 'number' ? { thoughtTokens: usage.thoughtTokens } : {}),
  ...(typeof usage.cachedReadTokens === 'number' ? { cachedReadTokens: usage.cachedReadTokens } : {}),
  ...(typeof usage.cachedWriteTokens === 'number' ? { cachedWriteTokens: usage.cachedWriteTokens } : {}),
});

/** The last vendor counter durably committed for this ACP session. */
const committedUsage = (turn: ExternalAgentTurn): AcpUsage | undefined => {
  const remembered = usageField(turn.state);
  if (remembered) {
    return remembered;
  }
  for (const message of reduceEventLog(turn.history).toReversed()) {
    const vendorUsage = isRecord(message.metadata?.tauInternal)
      ? message.metadata.tauInternal['vendorUsage']
      : undefined;
    const usage = usageField(isRecord(vendorUsage) ? vendorUsage : undefined);
    if (usage) {
      return usage;
    }
  }
  return undefined;
};

/** The replaceable ACP session-state envelope already present in this chat. */
const committedSessionMessageId = (turn: ExternalAgentTurn): string | undefined => {
  for (const message of reduceEventLog(turn.history).toReversed()) {
    if (
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some(
        (content) => isRecord(content) && content['type'] === 'acp-session' && content['agentId'] === turn.agentId,
      )
    ) {
      return message.id;
    }
  }
  return undefined;
};

/**
 * Build the external-agent port over a set of resolved ACP adapters.
 *
 * @param options - Adapters, workspace root, and the optional MCP endpoint.
 * @returns The port `createNodeAgentLauncher` routes external starts to.
 * @public
 *
 * @example <caption>Wire ACP agents into a launcher</caption>
 * ```typescript
 * import { createAcpExternalAgentPort } from '@taucad/host';
 * import type { AcpAdapter } from '@taucad/host';
 *
 * declare const agents: readonly AcpAdapter[];
 * const externalAgents = createAcpExternalAgentPort({ agents, workspaceRoot: process.cwd() });
 * console.log(externalAgents.list?.());
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- the live-session map, its eviction and the turn that reuses it are one mechanism; the port closes over it precisely so no module-global session table exists.
export const createAcpExternalAgentPort = (options: AcpExternalAgentPortOptions): ExternalAgentPort => {
  const createId = options.createId ?? randomUUID;
  const idleTimeout = options.idleTimeout ?? acpSessionIdleTimeout;
  /* Per port, not per module: a chat id is unique inside one workspace, and two
   * ports in one process serve two workspaces. */
  const live = new Map<string, LiveSession>();
  /* The chat log — and so its attachments — lives at the workspace root in
   * every mode; a candidate checkout never carries `.tau/chats`. */
  const attachments = createNodeAttachmentReader(options.workspaceRoot);
  const warnedAbsent = new Set<string>();

  /**
   * The turn with its attachment references replaced by bytes (D15, D23).
   *
   * @param turn - The admitted turn; its durable message is never mutated.
   * @returns The same turn, or a copy whose message carries images and resources.
   */
  const materializedTurn = async (turn: ExternalAgentTurn): Promise<ExternalAgentTurn> => {
    if (!turn.message) {
      return turn;
    }
    const outcome = await materializeAttachments(
      [turn.message],
      async (path) => attachments.read(turn.chatId, path),
      acpDocumentBlock,
    );
    for (const path of outcome.absent) {
      if (!warnedAbsent.has(`${turn.chatId}/${path}`)) {
        warnedAbsent.add(`${turn.chatId}/${path}`);
        console.warn(
          `Chat ${turn.chatId}: attachment ${path} is not available on this host; the agent will not see it.`,
        );
      }
    }
    const [message] = outcome.messages;
    return message === turn.message || message?.role !== 'user' ? turn : { ...turn, message };
  };

  const forget = async (key: string): Promise<void> => {
    const entry = live.get(key);
    if (!entry) {
      return;
    }
    live.delete(key);
    clearTimeout(entry.timer);
    await entry.session.close();
  };

  /**
   * Move an entry to the most-recent end and restart its idle timer.
   *
   * @param key - Agent and chat whose session was just used.
   */
  const touch = (key: string): void => {
    const entry = live.get(key);
    if (!entry) {
      return;
    }
    live.delete(key);
    live.set(key, entry);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      void forget(key);
    }, idleTimeout);
    entry.timer.unref();
  };

  /**
   * The one server list a session keeps for its whole life.
   *
   * @param capability - The token minted for this session, if the host serves MCP.
   * @returns Tau's own server under that token, or nothing.
   */
  const tauMcpServers = (capability: { readonly token: string } | undefined): readonly McpServer[] => {
    if (!capability) {
      return [];
    }
    if (!options.mcp?.url) {
      /* A session opened before the listener bound would carry an unusable
       * server, and its resume would carry the real one: a changed `mcpServers`
       * list is exactly the teardown V7 exists to prevent (review 2-review S2). */
      throw Object.assign(new Error('This Tau Host is still starting its tool endpoint; try again in a moment.'), {
        code: 'EXTERNAL_AGENT_UNAVAILABLE',
      });
    }
    return [
      {
        type: 'http',
        name: tauMcpServerName,
        url: options.mcp.url,
        headers: [{ name: 'Authorization', value: `Bearer ${capability.token}` }],
      },
    ];
  };

  /**
   * Open this chat's session, record it, and make room for it.
   *
   * @param input - Cache key, the turn opening it, its model and its adapter.
   * @returns The live entry every later turn of the chat reuses.
   */
  const start = async (input: {
    readonly key: string;
    readonly turn: ExternalAgentTurn;
    readonly model: string | undefined;
    readonly adapter: AcpAdapter;
    readonly cwd: string;
    /** The revision mode the host prepared this turn in; recorded on the session record. */
    readonly mode: string | undefined;
  }): Promise<LiveSession> => {
    const { turn, cwd } = input;
    /* A marker naming a directory this turn does not run in — a pre-V2 per-run
     * copy, or the previous turn's candidate checkout. That vendor session was
     * created against *that* directory, so resuming it here would restore a
     * conversation about files this session cannot see; it starts fresh
     * instead (r1 risk 7). */
    const rememberedCwd = stringField(turn.state, 'cwd');
    const cwdContextLost = rememberedCwd !== undefined && rememberedCwd !== cwd;
    const acpSessionId =
      rememberedCwd === undefined || rememberedCwd === cwd ? stringField(turn.state, 'acpSessionId') : undefined;
    /* Minted once per session, not per turn: the server list an agent is handed
     * at `session/new` is the one it keeps for the session's whole life, and
     * Claude tears a session down when that list changes (V7). */
    const capability = options.mcp?.mint({ runId: turn.runId, chatId: turn.chatId });
    const mcpServers = tauMcpServers(capability);
    const skillPublication = await publishSystemSkills(options.systemSkillBundles, turn.signal);
    const sessionMessageId = committedSessionMessageId(turn);
    const session = await abortableOpen(
      openAcpSession({
        adapter: input.adapter,
        cwd,
        mcpServers,
        ...(skillPublication === undefined ? {} : { additionalDirectories: [skillPublication.root] }),
        createId,
        ...(acpSessionId === undefined ? {} : { acpSessionId }),
        ...(acpSessionId === undefined ? {} : { priorUsage: committedUsage(turn) }),
        ...(sessionMessageId === undefined ? {} : { sessionMessageId }),
        ...(options.onFrame ? { onFrame: options.onFrame } : {}),
        signal: turn.signal,
      }),
      turn.signal,
    );
    /* Busy from the first instant: the awaits below would otherwise let a
     * concurrent chat's eviction close this session before its own first
     * prompt (review 2-review S7). `run` clears it. */
    const entry: LiveSession = {
      chatId: turn.chatId,
      session,
      cwd,
      busy: true,
      capabilityExpiresAt: capability === undefined ? undefined : Date.parse(capability.expiresAt),
      capabilityToken: capability?.token,
    };
    live.set(input.key, entry);
    const forgetClosed = async (): Promise<void> => {
      await session.closed;
      if (live.get(input.key) === entry) {
        await forget(input.key);
      }
    };
    // async-iife: lifecycle -- Session closure must retire the cache even when no run is awaiting it.
    void forgetClosed();
    try {
      if (session.acpSessionId !== acpSessionId) {
        /* One `remember`, not one per field: the record is rewritten from the
         * turn's *appended* envelope, so a second call would drop what the
         * first wrote (2-w2 §7.1). `cwd` and `mode` are the VSC3 fields that
         * make the guard above answerable on the next turn. */
        await turn.remember({
          acpSessionId: session.acpSessionId,
          cwd,
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          ...(input.model === undefined ? {} : { model: input.model }),
        });
      }
      if (session.contextLost || cwdContextLost) {
        /* Never a silent fresh start: the reader has to be able to see why the
         * agent stopped remembering. */
        await turn.append([
          {
            type: 'message.appended',
            message: {
              id: createId(),
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: cwdContextLost
                    ? `${turn.agentId} moved to a different Tau checkout, so it is starting a new session in that tree. Its earlier conversation remains in this chat but is not in the new agent session.`
                    : `${turn.agentId} could not restore this chat's earlier session, so it is starting a new one. Everything before this point is missing from its own context.`,
                },
              ],
              metadata: { tauInternal: { origin: 'external', agentId: turn.agentId } },
            },
          },
        ]);
      }
    } catch (error) {
      /* A busy entry nobody will ever clear must not outlive its failed open. */
      await forget(input.key);
      throw error;
    }
    /* Evict only after this session is in the map, and never one that is
     * answering a prompt for another chat. */
    for (const [candidate, held] of live) {
      if (live.size <= acpLiveSessionLimit) {
        break;
      }
      if (candidate !== input.key && !held.busy) {
        // oxlint-disable-next-line no-await-in-loop -- eviction is the cold path and its close is ordered.
        await forget(candidate);
      }
    }
    return entry;
  };

  return {
    list: () => options.agents.map((adapter) => adapter.id),
    closeChat: async (chatId) => {
      await Promise.all([...live].filter(([, entry]) => entry.chatId === chatId).map(async ([key]) => forget(key)));
    },
    run: async (turn) => {
      const adapter = options.agents.find((candidate) => candidate.id === turn.agentId);
      if (!adapter) {
        throw Object.assign(new Error(`This Tau Host cannot start the ${turn.agentId} agent.`), {
          code: 'EXTERNAL_AGENT_UNAVAILABLE',
        });
      }
      /* This turn's own selection first, then what the chat's record remembered.
       * Neither: the adapter runs its own current model (V5 deleted the pin's
       * hard-coded default, so Tau never names a model the user did not pick). */
      const model =
        (typeof turn.agent['model'] === 'string' ? turn.agent['model'] : undefined) ?? stringField(turn.state, 'model');
      const key = `${turn.agentId}:${turn.chatId}`;
      /* V19: direct mode is the workspace root, candidate mode the checkout the
       * host materialized for *this* run. The mode is read off the host's own
       * record of the prepared turn, never off a reference comparison and never
       * off what the agent claims. */
      const checkout = options.checkouts?.get(turn.runId);
      const cwd = checkout?.cwd ?? options.workspaceRoot;
      let entry = live.get(key);
      /* Synchronously, before the first `await`: an idle timer that fired while
       * this turn was being set up would close the session out from under it. */
      clearTimeout(entry?.timer);
      if (entry && entry.cwd !== cwd) {
        /* A candidate turn runs in its own checkout, so the chat's live session
         * is rooted in a directory this turn does not work in — and one the
         * host has already destroyed. Close it and open a session in the tree
         * this turn actually has. */
        await forget(key);
        entry = undefined;
      }
      if (
        entry?.capabilityExpiresAt !== undefined &&
        entry.capabilityExpiresAt - Date.now() < acpCapabilityRenewalMargin
      ) {
        /* The capability rides the session for its whole life (V7), so a
         * session whose capability is about to lapse is closed here and the
         * turn reopens through `session/resume` with a fresh one. */
        await forget(key);
        entry = undefined;
      }
      entry ??= await start({ key, turn, model, adapter, cwd, mode: checkout?.mode });
      entry.busy = true;
      let releaseMcp: (() => void | Promise<void>) | undefined;
      try {
        releaseMcp =
          options.mcp && entry.capabilityToken
            ? options.mcp.activate({
                token: entry.capabilityToken,
                runId: turn.runId,
                chatId: turn.chatId,
                signal: turn.signal,
              })
            : undefined;
        /* The vendor session Tau is about to prompt is not the one this chat's
         * record remembers: it is new (or a lost one was replaced), so it has
         * never seen Tau's CAD context and this prompt carries it (V12). */
        const prompt = promptBlocksOf(
          await materializedTurn(turn),
          entry.session.acpSessionId !== stringField(turn.state, 'acpSessionId'),
        );
        if (prompt === undefined) {
          throw Object.assign(
            new Error('Tau restored the ACP session, but ACP cannot prove whether the interrupted turn completed.'),
            { code: 'EXTERNAL_AGENT_RECOVERY_UNKNOWN' },
          );
        }
        const selectedConfig = isRecord(turn.agent['config'])
          ? turn.agent['config']
          : isRecord(turn.state?.['config'])
            ? turn.state['config']
            : undefined;
        const configuration = selectedConfig
          ? Object.fromEntries(
              Object.entries(selectedConfig).filter(
                (entry): entry is [string, string | boolean] =>
                  typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
              ),
            )
          : undefined;
        const outcome = await entry.session.prompt(prompt, turn, model, configuration);
        /* What the agent changed about its own session, written back to the
         * chat's record so the next turn — and the selector above it — start
         * from what actually ran rather than from what was last asked for
         * (V6/VSC3). One `remember`, because each is an append. */
        const moved = {
          ...(outcome.usage === undefined ? {} : { acpPriorUsage: usageState(outcome.usage) }),
          ...(outcome.model === undefined || outcome.model === model ? {} : { model: outcome.model }),
          ...(outcome.title === undefined ? {} : { title: outcome.title }),
          config: outcome.configuration,
        };
        if (Object.keys(moved).length > 0) {
          await turn.remember(moved);
        }
        return { stopReason: outcome.stopReason };
      } finally {
        await releaseMcp?.();
        entry.busy = false;
        touch(key);
      }
    },
  };
};
