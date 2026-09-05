/**
 * One ACP turn, projected into Tau's durable event log.
 *
 * OQ-X2 answered thin: `session/update` becomes the *same* provider messages a
 * Tau run records, so one client projection renders both and no second
 * transcript store exists. The mapping is deliberately lossy where ACP carries
 * presentation rather than history:
 *
 * | ACP `session/update` | Durable event |
 * | --- | --- |
 * | `agent_message_chunk` | accumulated, then one `message.appended` assistant message per ACP message id |
 * | `agent_thought_chunk` | dropped (counted); Tau's log has no thinking part an external agent could fill honestly |
 * | `tool_call` | `message.appended` `tool-input`, `toolName` = the agent's own tool name, content = its raw input |
 * | `tool_call_update` (`completed`/`failed`) | `message.appended` `tool-output`, content = raw output, `isError` on `failed` |
 * | `plan`, `current_mode_update`, `usage_update`, … | dropped |
 *
 * Every message carries `tauInternal.origin = 'external'` so a reader can tell
 * an agent-executed tool call from one Tau dispatched itself — an additive
 * marker on existing metadata, never a new event type.
 *
 * `session/request_permission` becomes the host's durable approval inbox
 * (OQ-X4), and the client filesystem methods are confined to the branch: SP-4
 * observed a real adapter writing outside its session `cwd`, so the boundary is
 * enforced here rather than trusted.
 */

import { resolve, sep } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { Client, ContentBlock, McpServer, SessionUpdate, StopReason } from '@agentclientprotocol/sdk';

import type { ExternalAgentTurn } from '@taucad/agent-host/node-launcher';
import type { JsonValue } from '@taucad/agent-host';

import { spawnAcpAdapter } from '#acp/spawn.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import type { AcpAdapter } from '#acp/registry.js';

/** ACP protocol version this client speaks. */
const protocolVersion = 1;

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

/** What one ACP turn reported beyond the durable log. @public */
export type AcpTurnOutcome = {
  readonly stopReason: StopReason;
  /** ACP session id, so a later attempt can `session/resume` instead of starting over. */
  readonly acpSessionId: string;
  /** Reasoning chunks dropped by the thin projection. */
  readonly droppedThoughts: number;
};

const textOf = (content: ContentBlock): string =>
  content.type === 'text' ? content.text : `[${content.type}] ${JSON.stringify(content)}`;

/**
 * A path is inside the branch, or it is refused — never resolved leniently.
 *
 * @param branch - Absolute branch directory.
 * @param path - Path the agent asked for.
 * @returns The resolved absolute path.
 * @throws When the path escapes the branch.
 */
const confine = (branch: string, path: string): string => {
  const resolved = resolve(branch, path);
  if (resolved !== branch && !resolved.startsWith(branch + sep)) {
    throw Object.assign(new Error(`This agent may only read and write inside ${branch}.`), {
      code: 'BRANCH_CONFINEMENT',
    });
  }
  return resolved;
};

// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an ACP payload is JSON by construction of its transport.
const asJson = (value: unknown): JsonValue => (value === undefined ? null : (value as JsonValue));

/** Options for {@link runAcpSession}. @public */
export type RunAcpSessionOptions = {
  readonly adapter: AcpAdapter;
  /** Absolute branch directory; the agent's `cwd` and its filesystem fence. */
  readonly branch: string;
  /** MCP servers offered to the session — normally just Tau's own. */
  readonly mcpServers?: readonly McpServer[] | undefined;
  /** Existing ACP session to resume rather than create. */
  readonly acpSessionId?: string | undefined;
  /** Prompt text for this turn; omit to only reattach to an existing session. */
  readonly prompt?: string | undefined;
  /** The launcher's durable seams for this run. */
  readonly turn: Pick<ExternalAgentTurn, 'append' | 'approve' | 'remember' | 'signal'>;
  readonly onFrame?: ((frame: AcpWireFrame) => void) | undefined;
  readonly createId: () => string;
};

/**
 * Drive one external agent turn end to end.
 *
 * @param options - Adapter, branch, MCP servers, prompt, and the run's seams.
 * @returns What the turn reported beyond the log.
 * @public
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one turn is one protocol conversation; splitting the update projection from the handlers that feed it would hide the ordering this function exists to keep.
export const runAcpSession = async (options: RunAcpSessionOptions): Promise<AcpTurnOutcome> => {
  const { branch, turn } = options;
  const adapter = spawnAcpAdapter({
    adapter: options.adapter,
    cwd: branch,
    ...(options.onFrame ? { onFrame: options.onFrame } : {}),
  });
  let droppedThoughts = 0;
  /** The assistant text block being accumulated, flushed at a real boundary. */
  let pendingText: { readonly messageId: string; text: string } | undefined;
  /** Tool calls awaiting their result, so a `tool_call_update` names its input. */
  const openToolCalls = new Map<string, { readonly toolName: string; readonly callId: string }>();

  const externalMetadata = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: options.adapter.id } };

  let idleFlush: NodeJS.Timeout | undefined;
  const flushText = async (): Promise<void> => {
    if (idleFlush) {
      clearTimeout(idleFlush);
      idleFlush = undefined;
    }
    const block = pendingText;
    pendingText = undefined;
    if (!block || block.text === '') {
      return;
    }
    await turn.append([
      {
        type: 'message.appended',
        message: {
          id: options.createId(),
          role: 'assistant',
          content: [{ type: 'text', text: block.text }],
          metadata: externalMetadata,
        },
      },
    ]);
  };

  const projectToolCall = async (update: Extract<SessionUpdate, { sessionUpdate: 'tool_call' }>): Promise<void> => {
    await flushText();
    const callId = options.createId();
    const toolName = update.name ?? update.title;
    openToolCalls.set(update.toolCallId, { toolName, callId });
    await turn.append([
      {
        type: 'message.appended',
        message: {
          id: options.createId(),
          role: 'tool-input',
          toolCallId: callId,
          toolName,
          content: asJson(update.rawInput ?? { title: update.title }),
          metadata: externalMetadata,
        },
      },
    ]);
  };

  const projectToolResult = async (
    update: Extract<SessionUpdate, { sessionUpdate: 'tool_call_update' }>,
  ): Promise<void> => {
    if (update.status !== 'completed' && update.status !== 'failed') {
      return;
    }
    const open = openToolCalls.get(update.toolCallId);
    if (!open) {
      return;
    }
    openToolCalls.delete(update.toolCallId);
    await turn.append([
      {
        type: 'message.appended',
        message: {
          id: options.createId(),
          role: 'tool-output',
          toolCallId: open.callId,
          toolName: open.toolName,
          content: asJson(update.rawOutput ?? update.content ?? { status: update.status }),
          isError: update.status === 'failed',
          metadata: externalMetadata,
        },
      },
    ]);
  };

  const project = async (update: SessionUpdate): Promise<void> => {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const messageId = update.messageId ?? 'anonymous';
        if (pendingText && pendingText.messageId !== messageId) {
          await flushText();
        }
        pendingText = { messageId, text: (pendingText?.text ?? '') + textOf(update.content) };
        if (idleFlush) {
          clearTimeout(idleFlush);
        }
        idleFlush = setTimeout(() => {
          idleFlush = undefined;
          enqueue(flushText);
        }, textIdleFlushDelay);
        idleFlush.unref();
        return;
      }
      case 'agent_thought_chunk': {
        droppedThoughts += 1;
        return;
      }

      case 'tool_call': {
        await projectToolCall(update);
        return;
      }
      case 'tool_call_update': {
        await projectToolResult(update);
      }
      // No default: plans, mode changes and usage are presentation, not history.
    }
  };

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
  const handler: Client = {
    sessionUpdate: (params) => {
      enqueue(async () => project(params.update));
    },
    requestPermission: async (params) => {
      await flushText();
      const outcome = await turn.approve({
        prompt: params.toolCall.title ?? `Allow ${params.toolCall.toolCallId}?`,
        payload: asJson({ toolCall: params.toolCall, options: params.options }),
      });
      const pick = (...kinds: ReadonlyArray<(typeof params.options)[number]['kind']>): string | undefined =>
        kinds.flatMap((kind) => params.options.filter((option) => option.kind === kind)).at(0)?.optionId;
      const optionId =
        outcome === 'approved'
          ? pick('allow_always', 'allow_once')
          : outcome === 'denied'
            ? pick('reject_once', 'reject_always')
            : undefined;
      return optionId === undefined
        ? { outcome: { outcome: 'cancelled' } }
        : { outcome: { outcome: 'selected', optionId } };
    },
    readTextFile: async (params) => ({ content: await readFile(confine(branch, params.path), 'utf8') }),
    writeTextFile: async (params) => {
      await writeFile(confine(branch, params.path), params.content, 'utf8');
      return {};
    },
  };

  /* oxlint-disable-next-line typescript/no-deprecated -- the long-lived connection
   * object is the shape SP-4 proved; the replacement scopes a connection to one
   * callback, which cannot outlive a turn the way an always-on run must. */
  const connection = new ClientSideConnection(() => handler, adapter.stream);
  const onAbort = (): void => {
    if (acpSessionId !== undefined) {
      void connection.cancel({ sessionId: acpSessionId });
    }
  };
  let acpSessionId: string | undefined;
  try {
    await connection.initialize({
      protocolVersion,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      clientInfo: { name: 'tau-host', version: '1' },
    });
    const mcpServers = [...(options.mcpServers ?? [])];
    if (options.acpSessionId) {
      await connection.resumeSession({ sessionId: options.acpSessionId, cwd: branch, mcpServers });
      acpSessionId = options.acpSessionId;
    } else {
      const session = await connection.newSession({ cwd: branch, mcpServers });
      acpSessionId = session.sessionId;
      /* Remembered before the prompt, not after: a daemon that dies mid-turn
       * must still be able to resume the session it created. */
      await turn.remember({ acpSessionId, cwd: branch });
    }
    turn.signal.addEventListener('abort', onAbort, { once: true });
    if (turn.signal.aborted) {
      onAbort();
    }
    const answered = options.prompt
      ? await connection.prompt({ sessionId: acpSessionId, prompt: [{ type: 'text', text: options.prompt }] })
      : { stopReason: 'end_turn' as StopReason };
    const { stopReason } = answered;
    await projection;
    await flushText();
    return { stopReason, acpSessionId, droppedThoughts };
  } catch (error) {
    try {
      await projection;
    } catch {
      /* The turn is already failing; a projection error adds nothing. */
    }
    const stderr = adapter.stderr();
    throw Object.assign(
      new Error(
        `${options.adapter.id} failed: ${error instanceof Error ? error.message : String(error)}${stderr === '' ? '' : `\n${stderr}`}`,
      ),
      { code: 'EXTERNAL_AGENT_FAILED' },
    );
  } finally {
    turn.signal.removeEventListener('abort', onAbort);
    adapter.close();
  }
};

/**
 * Create the branch directory the agent works in.
 *
 * @param path - Absolute branch directory.
 * @returns The same path, once it exists.
 * @public
 */
export const ensureBranchDirectory = async (path: string): Promise<string> => {
  await mkdir(path, { recursive: true });
  return path;
};
