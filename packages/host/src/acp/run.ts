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
import { pathToFileURL } from 'node:url';

import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { ContentBlock, McpServer, StopReason, Usage as AcpUsage } from '@agentclientprotocol/sdk';

import { isResumableRunFailure, materializeAttachments, reduceEventLog } from '@taucad/agent-host';
import type {
  DocumentBlockBuilder,
  ExternalAgentPort,
  ExternalAgentTurn,
  JsonObject,
  JsonValue,
  RunLifecycleEvent,
} from '@taucad/agent-host';
import { externalAgentStopCodes } from '@taucad/agent-host/wire';
import { createNodeAttachmentReader } from '@taucad/agent-host/node';
import { createSkillBundleRegistry } from '@taucad/agent-tools/registry';
import { tauMcpInstructions } from '@taucad/mcp';
import { isRecord } from '@taucad/utils/schema';

import { failureError } from '#acp/acp-session.machine.js';
import type { AcpFailure, AcpTurnResult } from '#acp/acp-session.machine.js';
import { provideAcpSession } from '#acp/acp-session.js';
import { acpSessionsMachine } from '#acp/acp-sessions.machine.js';
import type { AcpAcquire } from '#acp/acp-sessions.machine.js';
import { createAcpMediaStore } from '#acp/media.js';
import type { AcpLimitReset } from '#acp/session.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import type { AcpAdapter } from '#acp/registry.js';
import type { HostSystemSkillBundle } from '#agent-tools.js';
import { defaultConfigDirectory } from '#credential-store.js';

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

/**
 * An external turn with its placed root: W8 TS-S4 adds `root` to `ExternalAgentTurn`, the checkout a placed attempt's
 * grant rooted it at. Typed here until then; the intersection stays compatible once the field lands.
 */
type PlacedExternalAgentTurn = ExternalAgentTurn & Readonly<{ root?: string | undefined }>;

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
  /** The clock an acquire is stamped with, for the capability's renewal margin; defaults to `Date.now`. */
  readonly now?: (() => number) | undefined;
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
  /* The user's own blocks lead: a vendor names its mirrored thread after the
   * prompt's first text (Codex titled every Tau thread "tau://agent-guidance…"). */
  return [...blocks, ...cadContextBlocks(turn.config, first)];
};

/**
 * A document as ACP carries it (D23): a link to the file *and* its bytes.
 *
 * Two carriers, because the adapters have no document item. A `resource` blob
 * reaches the model as raw base64 inside a text block (codex-acp's
 * `buildPromptItems`), which it can only read by hand-inflating the stream — an
 * observed ~190 s of reasoning for one PDF. The `resource_link` names the path
 * the agent's own document tooling opens; the blob stays so an agent whose
 * sandbox excludes the workspace root still receives the bytes.
 *
 * The attachment always lives under the workspace root, in every revision mode
 * ({@link createAcpExternalAgentPort}'s reader is rooted there), so the path is
 * always derivable.
 *
 * @param workspaceRoot - The root the chat's `.tau/chats` lives under.
 * @param chatId - The chat owning the attachment directory.
 * @returns The builder {@link materializeAttachments} calls per document.
 */
const acpDocumentBlock =
  (workspaceRoot: string, chatId: string): DocumentBlockBuilder =>
  (hash, document, reference): readonly JsonValue[] => {
    const extension = reference.path.slice(reference.path.lastIndexOf('.'));
    return [
      {
        type: 'resource_link',
        uri: pathToFileURL(join(workspaceRoot, '.tau', 'chats', chatId, reference.path)).href,
        name: reference.filename ?? `${hash}${extension}`,
      },
      {
        type: 'resource',
        resource: {
          uri: `tau://attachments/${hash}${extension}`,
          mimeType: document.mediaType,
          blob: document.data,
        },
      },
    ];
  };

const stringField = (state: JsonObject | undefined, name: string): string | undefined => {
  const value = state?.[name];
  return typeof value === 'string' ? value : undefined;
};

/**
 * What a resumed turn says when it has no new message of its own.
 *
 * A resume re-enters the vendor session that already holds this turn, so it
 * sends no user message: replaying the one the turn started from would make
 * the agent begin it again, and the host cannot re-append that message's id
 * anyway. One sentence is the whole prompt — the agent's own transcript, still
 * live in its session, is the context (R9/S11).
 */
const continuationPrompt = 'Continue from where you stopped.';

/**
 * Whether the agent itself ended this run, immediately before this attempt.
 *
 * A turn arriving with no message is one of two things. The agent stopped and
 * said so — a usage or rate limit the person can retry — which leaves a
 * terminal failure on this run and an idle vendor session holding the whole
 * turn; or a restart found the turn still `running`, and ACP can report
 * nothing about whether it finished. Only the first can be continued.
 *
 * Read from the row before this attempt's own opening rows, not from the run's
 * whole history: a resume reuses the run id, so a run that stopped, resumed
 * and was *then* cut short by a restart still carries the first stop's
 * `failed` row, followed by the takeover's `RUN_ABANDONED`. Answering on the
 * first would continue exactly the turn the ambiguity guard exists for, and
 * `RUN_ABANDONED` is the host's record that nobody knows how the turn ended,
 * not the agent's own stop.
 *
 * @param turn - The turn being run.
 * @returns Whether the state this attempt resumes from is the agent's own resumable stop.
 */
const stopRecorded = (turn: ExternalAgentTurn): boolean => {
  const rows = turn.history.filter(
    (event): event is RunLifecycleEvent => event.runId === turn.runId && event.type === 'run.lifecycle',
  );
  /* This attempt opened with `running` (a resume) or `admitted` then
   * `running` (a first attempt); whatever precedes those rows is the state it
   * resumes from. */
  const opening = rows.findLastIndex((row) => row.state !== 'running' && row.state !== 'admitted');
  const prior = rows[opening];
  return (
    prior?.state === 'failed' &&
    externalAgentStopCodes.some((code) => code === prior.detail?.code) &&
    isResumableRunFailure(prior.detail)
  );
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

/** The limit reset the chat's record holds, when it names a usable one. */
const limitField = (state: JsonObject | undefined): AcpLimitReset | undefined => {
  const value = state?.['limit'];
  if (!isRecord(value) || typeof value['resetsAt'] !== 'number') {
    return undefined;
  }
  return {
    resetsAt: value['resetsAt'],
    ...(typeof value['window'] === 'string' ? { window: value['window'] } : {}),
  };
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
 * @returns The port `createAgentLauncher` routes external starts to.
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
// oxlint-disable-next-line eslint/max-lines-per-function -- the facade turns three port calls into parent events and back; its helpers close over one parent.
export const createAcpExternalAgentPort = (options: AcpExternalAgentPortOptions): ExternalAgentPort => {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? Date.now;
  /* The chat log — and so its attachments — lives at the workspace root in
   * every mode; a candidate checkout never carries `.tau/chats`. */
  const attachments = createNodeAttachmentReader(options.workspaceRoot);
  const warnedAbsent = new Set<string>();
  /* The seams of every lent turn, by request id: the machines hold only the id (MC-R5). */
  const turns = new Map<string, ExternalAgentTurn>();
  const settlements = new Map<string, (outcome: AcpTurnResult) => void>();
  const closes = new Map<string, (refusal: AcpFailure | undefined) => void>();

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
      acpDocumentBlock(options.workspaceRoot, turn.chatId),
    );
    for (const path of outcome.absent) {
      if (!warnedAbsent.has(`${turn.chatId}/${path}`)) {
        warnedAbsent.add(`${turn.chatId}/${path}`);
        console.warn(
          `Chat ${turn.chatId}: attachment ${path} is not available on this host; the agent will not see it.`,
        );
      }
    }
    if (outcome.malformed > 0) {
      console.warn(
        `Chat ${turn.chatId}: ${String(outcome.malformed)} malformed attachment row(s) omitted; the agent will not see them.`,
      );
    }
    const [message] = outcome.messages;
    return message === turn.message || message?.role !== 'user' ? turn : { ...turn, message };
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

  const sessionLogic = provideAcpSession({
    createId,
    ...(options.onFrame ? { onFrame: options.onFrame } : {}),
    seams: (requestId) => turns.get(requestId),
    /* The binding lives exactly as long as the lend (EA-R6). */
    bind: (requestId, token) => {
      const turn = turns.get(requestId);
      return options.mcp && token !== undefined && turn
        ? options.mcp.activate({ token, runId: turn.runId, chatId: turn.chatId, signal: turn.signal })
        : undefined;
    },
    publishSkills: async (signal) => {
      const publication = await publishSystemSkills(options.systemSkillBundles, signal);
      return publication === undefined ? [] : [publication.root];
    },
  });
  const sessionsLogic = acpSessionsMachine.provide({ actors: { acpSession: sessionLogic } });

  let parent: Actor<typeof acpSessionsMachine> | undefined;
  /* A stopped actor is never restarted (MC-R24): a failed parent is replaced on the next call. */
  const sessions = (): Actor<typeof acpSessionsMachine> => {
    if (parent?.getSnapshot().status === 'active') {
      return parent;
    }
    const created = createActor(sessionsLogic, {
      input: {
        limit: acpLiveSessionLimit,
        idleTimeout: options.idleTimeout ?? acpSessionIdleTimeout,
        renewalMargin: acpCapabilityRenewalMargin,
      },
    });
    created.on('turnSettled', (event) => {
      settlements.get(event.requestId)?.(event.outcome);
    });
    created.on('refused', (event) => {
      settlements.get(event.requestId)?.({ ok: false, failure: event.failure });
      closes.get(event.requestId)?.(event.failure);
    });
    created.on('chatClosed', (event) => {
      closes.get(event.requestId)?.(undefined);
    });
    created.subscribe({ error: () => undefined });
    parent = created;
    created.start();
    return created;
  };

  return {
    list: () => options.agents.map((adapter) => adapter.id),
    closeChat: async (chatId) => {
      const requestId = `close:${createId()}`;
      const answered = new Promise<AcpFailure | undefined>((resolve) => {
        closes.set(requestId, resolve);
      });
      try {
        sessions().send({ type: 'closeChat', requestId, chatId });
        const refusal = await answered;
        if (refusal !== undefined) {
          throw failureError(refusal);
        }
      } finally {
        closes.delete(requestId);
      }
    },
    run: async (turn: PlacedExternalAgentTurn) => {
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
      /* V19: direct mode is the workspace root, candidate mode the checkout the
       * host materialized for *this* run. The mode is read off the host's own
       * record of the prepared turn, never off what the agent claims. */
      const checkout = options.checkouts?.get(turn.runId);
      /* W8 TS-S4: a placed attempt runs where its grant rooted it (`turn.root`); hosts without placement fall back to
       * the run's checkout, then the workspace. */
      const cwd = turn.root ?? checkout?.cwd ?? options.workspaceRoot;
      /* A record naming a directory this turn does not run in — a pre-V2 per-run
       * copy, or the previous turn's candidate checkout — names a vendor session
       * about files this one cannot see; it starts fresh instead (r1 risk 7). */
      const rememberedCwd = stringField(turn.state, 'cwd');
      const cwdMoved = rememberedCwd !== undefined && rememberedCwd !== cwd;
      const acpSessionId = cwdMoved ? undefined : stringField(turn.state, 'acpSessionId');
      /* Minted with every acquire and used only when a child is spawned: the
       * server list a session is opened with is the one it keeps for life, and
       * Claude tears a session down when that list changes (V7). */
      const capability = options.mcp?.mint({ runId: turn.runId, chatId: turn.chatId });
      const mcpServers = tauMcpServers(capability);
      const materialized = await materializedTurn(turn);
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
      const sessionMessageId = committedSessionMessageId(turn);
      const priorUsage = acpSessionId === undefined ? undefined : usageField(turn.state);
      const limit = limitField(turn.state);
      /* M1 opens attempt n+1 on every reopening, so one live turn per request id (W7 RA-S14). */
      const requestId = `${turn.runId}:${String(turn.attempt)}`;
      const acquire: AcpAcquire = {
        requestId,
        key: `${turn.agentId}:${turn.chatId}`,
        chatId: turn.chatId,
        cwd,
        at: now(),
        ...(capability === undefined ? {} : { capabilityExpiresAt: Date.parse(capability.expiresAt) }),
        opening: {
          adapter,
          cwd,
          mcpServers,
          ...(acpSessionId === undefined ? {} : { acpSessionId }),
          ...(priorUsage === undefined ? {} : { priorUsage }),
          ...(limit === undefined ? {} : { limit }),
          sessionMessageId: sessionMessageId ?? createId(),
          sessionCommitted: sessionMessageId !== undefined,
          cwdMoved,
          ...(checkout?.mode === undefined ? {} : { mode: checkout.mode }),
          notices: true,
          ...(capability === undefined ? {} : { capabilityToken: capability.token }),
        },
        lend: {
          requestId,
          ...(model === undefined ? {} : { model }),
          ...(configuration === undefined ? {} : { configuration }),
          prompt: {
            /* A vendor session Tau has not prompted before has never seen Tau's CAD
             * context, so its prompt carries it (V12). */
            fresh: promptBlocksOf(materialized, true),
            /* Reattached to the session the agent stopped in: it still holds the
             * turn, so a resume with no message nudges it on (R9/S11). */
            reattached:
              promptBlocksOf(materialized, false) ??
              (stopRecorded(turn) ? [{ type: 'text', text: continuationPrompt } satisfies ContentBlock] : undefined),
          },
          ...(turn.state === undefined ? {} : { record: turn.state }),
        },
      };
      const outcome = new Promise<AcpTurnResult>((resolve) => {
        settlements.set(requestId, resolve);
      });
      /* A cancel is settled, not assumed (EA-R8): `run` answers when the parent does. */
      const onAbort = (): void => {
        sessions().send({ type: 'cancel', requestId });
      };
      /* Every durable row of the turn names agent media by attachment rather
       * than carrying it inline (see `createAcpMediaStore`). */
      const moveMedia = createAcpMediaStore(options.workspaceRoot, turn.chatId);
      turns.set(requestId, { ...turn, append: async (events) => turn.append(await moveMedia(events)) });
      turn.signal.addEventListener('abort', onAbort, { once: true });
      try {
        sessions().send({ type: 'acquire', acquire });
        if (turn.signal.aborted) {
          onAbort();
        }
        const result = await outcome;
        if (!result.ok) {
          throw failureError(result.failure);
        }
        return { stopReason: result.stopReason as StopReason };
      } finally {
        turn.signal.removeEventListener('abort', onAbort);
        turns.delete(requestId);
        settlements.delete(requestId);
      }
    },
  };
};
