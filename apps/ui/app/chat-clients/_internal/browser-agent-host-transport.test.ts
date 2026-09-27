import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chat } from '@ai-sdk/react';
import type { UIMessageChunk } from 'ai';
import { parseLogEvent } from '@taucad/agent-host';
import type { AgentLiveEvent, AgentLogEvent } from '@taucad/agent-host';
import { agentWireLimits } from '@taucad/agent-host/wire';
import type { MyUIMessage } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';
import { AgentHostWorkerError } from '#services/agent-host-client.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  BrowserPlacementChatTransport,
  deriveChatTranscript,
  retireBrowserAgentHostRun,
  getBrowserAgentHostRun,
  getHostFinalizedTurns,
  recordHostTurnSettlement,
  registerAgentHost,
  registerAgentHostRunReset,
  requestBrowserAgentHostResume,
  resumableBrowserAgentHostRunId,
  resolveBrowserAgentHostInterrupt,
  subscribeHostTurnSettlements,
  subscribeChatLogAnswers,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { ChatLogAnswer, HostTurnSettlement } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import hexagonalNutLog from '#services/__fixtures__/daemon-reattach-hexnut.jsonl?raw';
import hexagonalNutFourRunLog from '#services/__fixtures__/daemon-reattach-hexnut-4runs.jsonl?raw';

/** One read page, as the host answers it. */
const page = <Fields extends { readonly cursor: number; readonly nextCursor: number; readonly endCursor: number }>(
  fields: Fields,
): Fields & { readonly status: 'batch'; readonly chatId: string } => ({
  status: 'batch',
  chatId: 'chat-test',
  ...fields,
});

/** The follow's arguments: where it starts, and who hears each row. */
type Follow = Parameters<AgentHostClient['subscribe']>;
type LiveListener = Parameters<NonNullable<AgentHostClient['subscribeLive']>>[1];

const snapshot = (chatId: string, runId: string, state: 'running' | 'completed' | 'cancelled' = 'completed') =>
  ({
    chatId,
    runId,
    turnId: `message-${chatId}`,
    state,
    messages: [],
  }) satisfies Awaited<ReturnType<AgentHostClient['start']>>;

const clientFor = (chatId: string, runId: string, overrides: Partial<AgentHostClient> = {}) => {
  let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
  return {
    start: vi.fn(async () => {
      listener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-start',
        sequence: 1,
        recordedAt: '2026-09-01T00:00:01.000Z',
        runId,
        type: 'run.lifecycle',
        state: 'completed',
      });
      listener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-start',
        sequence: 2,
        recordedAt: '2026-09-01T00:00:02.000Z',
        runId,
        type: 'turn.finalized',
        turnId: `message-${chatId}`,
        chatId,
        projectId: `project-${chatId}`,
        changedPaths: [],
        trigger: 'turn',
        runIds: [runId],
      });
      return snapshot(chatId, runId);
    }),
    steer: vi.fn(async () => snapshot(chatId, runId)),
    cancel: vi.fn(async () => snapshot(chatId, runId, 'cancelled')),
    resume: vi.fn(async () => {
      listener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-resume',
        sequence: 1,
        recordedAt: '2026-09-01T00:00:01.000Z',
        runId,
        type: 'run.lifecycle',
        state: 'completed',
      });
      listener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-resume',
        sequence: 2,
        recordedAt: '2026-09-01T00:00:02.000Z',
        runId,
        type: 'turn.finalized',
        turnId: `message-${chatId}`,
        chatId,
        projectId: `project-${chatId}`,
        changedPaths: [],
        trigger: 'turn',
        runIds: [runId],
      });
      return snapshot(chatId, runId);
    }),
    resolveInterrupt: vi.fn(async () => snapshot(chatId, runId)),
    attach: vi.fn(async () =>
      page({
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
      }),
    ),
    read: vi.fn(async () =>
      page({
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
      }),
    ),
    subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
    subscribeLive: vi.fn(() => () => undefined),
    close: vi.fn(async () => undefined),
    ...overrides,
  } satisfies AgentHostClient;
};

/** A host client that records the commands it was asked to run. */
const scriptedClient = (commands: Array<Record<string, unknown>>) => {
  const client = clientFor('chat-external-placement', 'run-external-placement', {
    start: vi.fn(async (input: Parameters<AgentHostClient['start']>[0]) => {
      commands.push({ type: 'start', ...input });
      return snapshot(input.chatId, input.runId, 'completed');
    }),
  });
  return client;
};

const installBrowserGlobals = (): void => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
};

const browserConfig = {
  systemPrompt: 'Browser host prompt',
  systemPromptBlocks: [
    { type: 'text', text: 'static' },
    { type: 'text', text: '' },
    { type: 'text', text: 'dynamic' },
  ],
  model: { id: 'openai-gpt-5.5', providerKind: 'openai', contextWindow: 200_000 },
  toolChoice: 'auto',
  allowedTools: ['read_file'],
} as const;

const browserBody = (input: {
  readonly runId: string;
  readonly trigger: 'submit' | 'edit' | 'regenerate';
  readonly retainedMessageIds?: readonly string[];
}) => ({
  agent: { execution: { kind: 'tau', model: 'openai-gpt-5.5', placement: 'browser-host' } },
  admission: { version: 1, idempotencyKey: input.runId },
  browserHost:
    input.trigger === 'submit'
      ? { trigger: input.trigger, config: browserConfig }
      : { trigger: input.trigger, retainedMessageIds: input.retainedMessageIds, config: browserConfig },
});

/**
 * The daemon's own log for the operator's rung-2 hexagonal-nut turn, verbatim
 * (92 events, 26 assistant messages, 28 tool round trips). Parsed through the
 * host's own schema, so a fixture that drifts from the wire fails loudly here.
 */
const hexagonalNutEvents = (): AgentLogEvent[] =>
  hexagonalNutLog
    .trim()
    .split('\n')
    .map((line) => parseLogEvent(JSON.parse(line)));

/**
 * The same chat four turns later, verbatim (157 events, 4 runs, 29 assistant
 * texts, all distinct). The chat the operator's live rung-2 reload was taken
 * on, whose earlier turns had already been doubled into local persistence.
 */
const hexagonalNutFourRunEvents = (): AgentLogEvent[] =>
  hexagonalNutFourRunLog
    .trim()
    .split('\n')
    .map((line) => parseLogEvent(JSON.parse(line)));

const textParts = (message: MyUIMessage): string[] =>
  message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []));

/** Every assistant text in a transcript, in order. */
const assistantTexts = (messages: readonly MyUIMessage[]): string[] =>
  messages.flatMap((message) => (message.role === 'assistant' ? textParts(message) : []));

/** Every assistant text a log carries, in order — what the transcript must equal. */
const durableTexts = (events: readonly AgentLogEvent[]): string[] =>
  events.flatMap((event) =>
    event.type === 'message.appended' && event.message.role === 'assistant' && Array.isArray(event.message.content)
      ? event.message.content.flatMap((value) =>
          isRecord(value) && value['type'] === 'text' && typeof value['text'] === 'string' ? [value['text']] : [],
        )
      : [],
  );

/** What `ChatSessionStore` does with the rebuild the reattach hands back. */
const applyRunResets = (chat: Chat<MyUIMessage>, chatId: string): (() => void) =>
  registerAgentHostRunReset(chatId, (rebuild) => {
    chat.messages = [...rebuild(chat.messages)];
  });

const drain = async (reader: ReadableStreamDefaultReader<UIMessageChunk>): Promise<void> => {
  const result = await reader.read();
  if (result.done) {
    return;
  }
  await drain(reader);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrowserPlacementChatTransport', () => {
  it('surfaces a mid-admission host refusal through the visible AI SDK chat error state', async () => {
    installBrowserGlobals();
    const chatId = 'chat-mid-admission-refusal';
    const runId = 'run-mid-admission-refusal';
    const refusal = new AgentHostWorkerError(
      'MODEL_PROVIDER_UNSUPPORTED',
      'Browser host wire changed during admission.',
    );
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refusal',
        backend: 'opfs',
        providerBasePath: 'project-refusal',
      }),
      createClient: async () => {
        throw refusal;
      },
    });
    const onError = vi.fn();
    const chat = new Chat<MyUIMessage>({
      id: chatId,
      transport: new BrowserPlacementChatTransport(),
      onError,
    });

    await chat.sendMessage(
      { id: 'user-refusal', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] },
      { body: browserBody({ runId, trigger: 'submit' }) },
    );

    expect(onError).toHaveBeenCalledWith(refusal);
    expect(chat.status).toBe('error');
    expect(chat.error).toBe(refusal);
    unregister();
  });

  it('should not re-publish a cleared run when its late settlement replays', async () => {
    installBrowserGlobals();
    const chatId = 'chat-cleared-run';
    const runId = 'run-cleared-run';
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const lifecycleOnly = clientFor(chatId, runId, {
      start: vi.fn(async () => {
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-cleared',
          sequence: 1,
          recordedAt: '2026-09-01T00:00:01.000Z',
          runId,
          type: 'run.lifecycle',
          state: 'completed',
        });
        return snapshot(chatId, runId);
      }),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-cleared-run',
        backend: 'opfs',
        providerBasePath: 'project-cleared-run',
      }),
      createClient: async () => lifecycleOnly,
    });
    const chat = new Chat<MyUIMessage>({ id: chatId, transport: new BrowserPlacementChatTransport() });

    await chat.sendMessage(
      { id: 'user-cleared-run', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] },
      { body: browserBody({ runId, trigger: 'submit' }) },
    );
    await vi.waitFor(() => {
      expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'completed' });
    });

    /* What project settlement does the moment it finalizes the turn. The
     * stream is still subscribed, waiting out this run's settlement. */
    retireBrowserAgentHostRun(chatId, runId);
    listener?.(chatId, {
      version: 1,
      leaderEpoch: 'leader-cleared',
      sequence: 2,
      recordedAt: '2026-09-01T00:00:02.000Z',
      runId,
      type: 'turn.finalized',
      turnId: `message-${chatId}`,
      chatId,
      projectId: `project-${chatId}`,
      revisionId: 'revision-cleared-run',
      changedPaths: ['main.ts'],
      treeId: 'tree-cleared-run',
      trigger: 'turn',
      runIds: [runId],
    });

    await vi.waitFor(() => {
      expect(getHostFinalizedTurns().some((settlement) => settlement.runId === runId)).toBe(true);
    });
    expect(getBrowserAgentHostRun(chatId)).toBeUndefined();
    unregister();
  });

  it('refuses a Tau turn whose admission does not parse, naming the real reason', async () => {
    installBrowserGlobals();
    const chatId = 'chat-unparseable-admission';
    const runId = 'run-unparseable-admission';
    const transport = new BrowserPlacementChatTransport();
    const valid = browserBody({ runId, trigger: 'submit' });
    // The replay catalog row: `provider.id === 'tau'` is not a gateway wire,
    // so the admission config fails the host schema. The turn is still a Tau
    // turn, and the API executes external-agent turns only.
    const body = {
      ...valid,
      browserHost: {
        trigger: 'submit',
        config: { ...browserConfig, model: { ...browserConfig.model, providerKind: 'tau' } },
      },
    };

    await expect(
      transport.sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body,
      }),
    ).rejects.toMatchObject({ name: 'AgentHostWorkerError', code: 'BROWSER_HOST_ADMISSION_INVALID' });
  });

  it('places an external-agent turn on its host', async () => {
    installBrowserGlobals();
    const chatId = 'chat-external-placement';
    const runId = 'run-external-placement';
    const transport = new BrowserPlacementChatTransport();
    const commands: Array<Record<string, unknown>> = [];
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('An external-agent turn reads its workspace from the daemon.');
      },
      createClient: async () => scriptedClient(commands),
    });

    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
      abortSignal: undefined,
      body: {
        // An external execution carries no Tau model and no browser admission
        // config: the agent brings its own, and the daemon routes on `agent`.
        agent: { execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } },
        admission: { version: 1, idempotencyKey: runId },
        browserHost: { trigger: 'submit', agent: { kind: 'acp', id: 'codex' } },
      },
    });
    await drain(stream.getReader());

    expect(commands.find((command) => command['type'] === 'start')).toMatchObject({
      type: 'start',
      runId,
      agent: { kind: 'acp', id: 'codex' },
    });
    unregister();
  });

  it('uses authoritative durable tool rows for an external-agent turn', async () => {
    installBrowserGlobals();
    const chatId = 'chat-external-tools';
    const runId = 'run-external-tools';
    const toolCallId = 'call-external-tools';
    let durableListener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    let liveListener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[1] | undefined;
    const start = vi.fn(async () => {
      liveListener?.(chatId, {
        type: 'tool-input-start',
        chatId,
        runId,
        messageId: 'assistant-external-tools',
        contentIndex: 0,
        toolCallId,
        toolName: 'Read main.scad',
      });
      liveListener?.(chatId, {
        type: 'tool-input-end',
        chatId,
        runId,
        messageId: 'assistant-external-tools',
        contentIndex: 0,
        toolCallId,
        toolName: 'Read main.scad',
        input: { path: 'main.scad' },
      });
      const event = (sequence: number, message: Record<string, unknown>): AgentLogEvent =>
        parseLogEvent({
          version: 1,
          leaderEpoch: 'leader-external-tools',
          sequence,
          recordedAt: '2026-09-01T00:00:01.000Z',
          runId,
          type: 'message.appended',
          message,
        });
      durableListener?.(
        chatId,
        event(1, {
          id: 'input-external-tools',
          role: 'tool-input',
          toolCallId,
          toolName: 'Read main.scad',
          call: { toolCallId, kind: 'read', title: 'Read main.scad', status: 'completed' },
          content: { path: 'main.scad' },
          metadata: { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } },
        }),
      );
      liveListener?.(chatId, {
        type: 'tool-output-update',
        chatId,
        runId,
        messageId: 'assistant-external-tools',
        contentIndex: 0,
        toolCallId,
        toolName: 'Read main.scad',
        output: 'reading line 1',
        isError: false,
      });
      durableListener?.(
        chatId,
        event(2, {
          id: 'output-external-tools',
          role: 'tool-output',
          toolCallId,
          toolName: 'Read main.scad',
          call: { toolCallId, kind: 'read', title: 'Read main.scad', status: 'completed' },
          content: 'cube(20);',
          isError: false,
          metadata: { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } },
        }),
      );
      durableListener?.(
        chatId,
        parseLogEvent({
          version: 1,
          leaderEpoch: 'leader-external-tools',
          sequence: 3,
          recordedAt: '2026-09-01T00:00:03.000Z',
          runId,
          type: 'run.lifecycle',
          state: 'completed',
        }),
      );
      durableListener?.(
        chatId,
        parseLogEvent({
          version: 1,
          leaderEpoch: 'leader-external-tools',
          sequence: 4,
          recordedAt: '2026-09-01T00:00:04.000Z',
          runId,
          type: 'turn.finalized',
          turnId: 'user-external-tools',
          chatId,
          projectId: 'project-external-tools',
          changedPaths: [],
          trigger: 'turn',
          runIds: [runId],
        }),
      );
      return snapshot(chatId, runId);
    });
    const client = clientFor(chatId, runId, {
      start,
      subscribe: vi.fn((_input: Follow[0], listener: Follow[1]) => {
        durableListener = listener;
        return () => {
          durableListener = undefined;
        };
      }),
      subscribeLive: vi.fn((_chatId: string, listener: LiveListener) => {
        liveListener = listener;
        return () => {
          liveListener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('An external-agent turn reads its workspace from the daemon.');
      },
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: 'user-external-tools',
      messages: [{ id: 'user-external-tools', role: 'user', parts: [{ type: 'text', text: 'Read it.' }] }],
      abortSignal: undefined,
      body: {
        agent: { execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } },
        admission: { version: 1, idempotencyKey: runId },
        browserHost: { trigger: 'submit', agent: { kind: 'acp', id: 'codex' } },
      },
    });
    const reader = stream.getReader();
    const collect = async (): Promise<UIMessageChunk[]> => {
      const next = await reader.read();
      if (next.done) {
        return [];
      }
      return [next.value, ...(await collect())];
    };
    const chunks = await collect();

    expect(chunks.filter((chunk) => 'toolCallId' in chunk && chunk.toolCallId === toolCallId)).toEqual([
      expect.objectContaining({ type: 'tool-input-available', dynamic: true }),
      expect.objectContaining({ type: 'tool-output-available', output: 'reading line 1' }),
      expect.objectContaining({ type: 'tool-output-available', dynamic: true }),
    ]);
    unregister();
  });

  /* The store is module-scoped and lives as long as the tab: a session that
     sees thousands of host-recorded turns must not retain every one of them,
     and the snapshot the graph reads is rebuilt on each arrival (5-review N6). */
  it('keeps only the most recent host-attested turn settlements this tab has seen', async () => {
    installBrowserGlobals();
    const chatId = 'chat-host-finalized-cap';
    const runId = 'run-host-finalized-cap';
    const transport = new BrowserPlacementChatTransport();
    const recorded = 300;
    const finalized = (index: number): AgentLogEvent =>
      parseLogEvent({
        version: 1,
        leaderEpoch: 'leader-cap',
        sequence: index + 1,
        recordedAt: '2026-09-01T00:00:01.000Z',
        runId,
        type: 'turn.finalized',
        turnId: `user-${String(index)}`,
        chatId,
        projectId: 'project-cap',
        checkoutId: 'live',
        revisionId: `rev-${String(index)}`,
        branch: 'main',
        changedPaths: ['main.scad'],
        treeId: `tree-${String(index)}`,
        trigger: 'turn',
        runIds: [runId],
      });
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const client = clientFor(chatId, runId, {
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
      start: vi.fn(async () => {
        for (let index = 0; index < recorded; index += 1) {
          listener?.(chatId, finalized(index));
        }
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-cap',
          sequence: recorded + 1,
          recordedAt: '2026-09-01T00:00:02.000Z',
          runId,
          type: 'run.lifecycle',
          state: 'completed',
        });
        return snapshot(chatId, runId);
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A host-placed turn reads its workspace from the daemon.');
      },
      createClient: async () => client,
    });

    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
      abortSignal: undefined,
      body: {
        agent: { execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } },
        admission: { version: 1, idempotencyKey: runId },
        browserHost: { trigger: 'submit', agent: { kind: 'acp', id: 'codex' } },
      },
    });
    await drain(stream.getReader());

    const kept = getHostFinalizedTurns();
    expect(kept).toHaveLength(256);
    expect(kept.at(0)?.revisionId).toBe(`rev-${String(recorded - 256)}`);
    expect(kept.at(-1)?.revisionId).toBe(`rev-${String(recorded - 1)}`);
    unregister();
  });

  it('publishes finalized, failed and conflicted outcomes replayed from a host log', async () => {
    installBrowserGlobals();
    const chatId = 'chat-host-settlement-union';
    const runId = 'run-host-settlement-union';
    const events = [
      parseLogEvent({
        version: 1,
        leaderEpoch: 'leader-settlement-union',
        sequence: 1,
        recordedAt: '2026-09-01T00:00:01.000Z',
        runId: 'run-finalized',
        type: 'turn.finalized',
        turnId: 'turn-finalized',
        chatId,
        projectId: 'project-settlement-union',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-finalized'],
      }),
      parseLogEvent({
        version: 1,
        leaderEpoch: 'leader-settlement-union',
        sequence: 2,
        recordedAt: '2026-09-01T00:00:02.000Z',
        runId: 'run-failed',
        type: 'turn.failed',
        turnId: 'turn-failed',
        chatId,
        reason: 'revision cut failed',
      }),
      parseLogEvent({
        version: 1,
        leaderEpoch: 'leader-settlement-union',
        sequence: 3,
        recordedAt: '2026-09-01T00:00:03.000Z',
        runId,
        type: 'run.lifecycle',
        state: 'completed',
      }),
      parseLogEvent({
        version: 1,
        leaderEpoch: 'leader-settlement-union',
        sequence: 4,
        recordedAt: '2026-09-01T00:00:04.000Z',
        runId,
        type: 'turn.conflicted',
        turnId: 'turn-conflicted',
        chatId,
      }),
    ];
    const observed: Array<{ type: string; runState: string | undefined }> = [];
    const unsubscribe = subscribeHostTurnSettlements((event) => {
      observed.push({ type: event.type, runState: getBrowserAgentHostRun(chatId)?.state });
    });
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: events.length,
          endCursor: events.length,
          events,
          snapshot: snapshot(chatId, runId),
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A host-placed turn reads its workspace from the daemon.');
      },
      createClient: async () => client,
    });

    try {
      const stream = await new BrowserPlacementChatTransport().reconnectToStream({ chatId });
      expect(stream).not.toBeNull();
      if (stream === null) {
        return;
      }
      await drain(stream.getReader());
      expect(observed.map((event) => event.type)).toEqual(['turn.finalized', 'turn.failed', 'turn.conflicted']);
      expect(observed.at(-1)).toEqual({ type: 'turn.conflicted', runState: 'completed' });
    } finally {
      unsubscribe();
      unregister();
    }
  });

  it("keeps the follow open until the host's settlement row follows the completed lifecycle", async () => {
    installBrowserGlobals();
    const chatId = 'chat-late-turn-settlement';
    const runId = 'run-late-turn-settlement';
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => {
        const row = {
          version: 1,
          leaderEpoch: 'leader-late-settlement',
          recordedAt: '2026-09-14T00:00:01.000Z',
          runId,
        } as const;
        /* W8 TS-S5: the host states where it placed the attempt on its `running` row. */
        listener?.(chatId, {
          ...row,
          sequence: 1,
          type: 'run.lifecycle',
          state: 'running',
          placement: { checkoutId: 'live', baseRevisionId: 'rev-base', mode: 'direct' },
        });
        listener?.(chatId, { ...row, sequence: 2, type: 'run.lifecycle', state: 'completed' });
        return snapshot(chatId, runId);
      }),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-late-turn-settlement',
        backend: 'opfs',
        providerBasePath: 'project-late-turn-settlement',
      }),
      createClient: async () => client,
    });
    const observed: HostTurnSettlement[] = [];
    const unsubscribe = subscribeHostTurnSettlements((event) => {
      if (event.chatId === chatId) {
        observed.push(event);
      }
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: 'turn-late-settlement', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      await drain(stream.getReader());

      expect(client.close).not.toHaveBeenCalled();
      const finalized = {
        type: 'turn.finalized',
        turnId: 'turn-late-settlement',
        runId,
        chatId,
        projectId: 'project-late-turn-settlement',
        checkoutId: undefined,
        changedPaths: [],
        trigger: 'turn',
        runIds: [runId],
      } as const;
      expect(getBrowserAgentHostRun(chatId)?.placement).toEqual({ baseRevisionId: 'rev-base' });
      /* The host appends this run's row after the terminal one (W8 TS-S6); the follow projects it here. */
      recordHostTurnSettlement(finalized);

      await vi.waitFor(() => {
        expect(observed).toEqual([
          expect.objectContaining({ type: 'turn.finalized', chatId, runId, turnId: 'turn-late-settlement' }),
        ]);
        expect(client.close).toHaveBeenCalledOnce();
      });
    } finally {
      unsubscribe();
      unregister();
    }
  });

  /* W8 TS-S6: a start the host refused before its first row has no settlement coming; the chat must not wait. */
  it('should not hold the follow for a run the host recorded nothing of', async () => {
    installBrowserGlobals();
    const chatId = 'chat-never-recorded';
    const runId = 'run-never-recorded';
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => {
        throw new AgentHostWorkerError('CLIENT_CONTEXT_FAILED', 'The skills could not be read.');
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-never-recorded',
        backend: 'opfs',
        providerBasePath: 'project-never-recorded',
      }),
      createClient: async () => client,
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: 'turn-never-recorded', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      await drain(stream.getReader()).catch(() => undefined);

      await vi.waitFor(() => {
        expect(client.close).toHaveBeenCalledOnce();
      });
    } finally {
      unregister();
    }
  });

  /* Drift 4: no host reads `mode` or `baseRevisionId`, and the wire's start payload is strict, so a body that still
     carries them must not put them on the command (the owner would refuse it COMMAND_UNREADABLE). */
  it("keeps the body's dead revision mode off the host's start command", async () => {
    installBrowserGlobals();
    const chatId = 'chat-revision-mode';
    const runId = 'run-revision-mode';
    const transport = new BrowserPlacementChatTransport();
    const commands: Array<Record<string, unknown>> = [];
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A Tau Host turn reads its workspace from the daemon.');
      },
      createClient: async () => scriptedClient(commands),
    });

    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
      abortSignal: undefined,
      body: {
        ...browserBody({ runId, trigger: 'submit' }),
        execution: { hostId: 'origin', mode: 'candidate', baseRevisionId: 'rev:base-1' },
      },
    });
    await drain(stream.getReader());

    const start = commands.find((command) => command['type'] === 'start');
    expect(start).toMatchObject({ type: 'start', runId });
    expect(start).not.toHaveProperty('mode');
    expect(start).not.toHaveProperty('baseRevisionId');
    unregister();
  });

  it('refuses an external-agent turn whose admission does not parse', async () => {
    installBrowserGlobals();
    const transport = new BrowserPlacementChatTransport();

    await expect(
      transport.sendMessages({
        chatId: 'chat-external-unparseable',
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: {
          agent: { execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' } },
          admission: { version: 1, idempotencyKey: 'run-external-unparseable' },
          // Neither shape: no config, and no agent either.
          browserHost: { trigger: 'submit' },
        },
      }),
    ).rejects.toMatchObject({ name: 'AgentHostWorkerError', code: 'BROWSER_HOST_ADMISSION_INVALID' });
  });

  it('ends an unbound resume without the API when the durable log holds no run', async () => {
    installBrowserGlobals();
    const chatId = 'chat-reload-reattach';
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-reload',
        backend: 'opfs',
        providerBasePath: 'project-reload',
      }),
      createClient: async () => clientFor(chatId, 'run-reload'),
    });
    const transport = new BrowserPlacementChatTransport();

    // A reload drops the in-memory run binding. The API never held this chat's
    // runs: asking it answered 503 and left the chat stuck "reattaching".
    await expect(transport.reconnectToStream({ chatId, metadata: undefined })).resolves.toBeNull();

    expect(getBrowserAgentHostRun(chatId)).toBeUndefined();
    unregister();
  });

  /* W0.2 (L3 D1). A resume the host answers for an empty log is no request at
   * all: the SDK walked `submitted → ready` and called `onFinish`, which marked
   * the chat unread if focus had moved on. A refused registration is still an
   * error the person sees. */
  it('should resume an empty log without finishing a request, and still fail a refused registration', async () => {
    installBrowserGlobals();
    const chatId = 'chat-empty-resume';
    const onFinish = vi.fn();
    let unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: 'project-empty', backend: 'opfs', providerBasePath: 'project-empty' }),
      createClient: async () => clientFor(chatId, 'run-empty'),
    });
    const chat = new Chat<MyUIMessage>({ id: chatId, transport: new BrowserPlacementChatTransport(), onFinish });

    await chat.resumeStream();

    expect(onFinish).not.toHaveBeenCalled();
    expect(chat.status).toBe('ready');
    unregister();

    const refusal = new AgentHostWorkerError('WORKER_PROTOCOL_FAILED', 'The host would not open.');
    unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: 'project-empty', backend: 'opfs', providerBasePath: 'project-empty' }),
      createClient: async () => {
        throw refusal;
      },
    });

    await chat.resumeStream();

    expect(chat.status).toBe('error');
    expect(chat.error).toBe(refusal);
    unregister();
  });

  it('republishes a terminal failed log after a reload, with its durable reason and no API call', async () => {
    installBrowserGlobals();
    const chatId = 'chat-reload-failed';
    const runId = 'run-reload-failed';
    const base = {
      version: 1,
      leaderEpoch: 'leader-reload-failed',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    // The operator's shape: a run that reached the gateway, was refused, and
    // ended terminal in the durable log while this tab was gone.
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      {
        ...base,
        sequence: 2,
        type: 'message.appended',
        message: { id: 'user-reload-failed', role: 'user', content: 'Build it.' },
      },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        sequence: 4,
        type: 'run.lifecycle',
        state: 'failed',
        detail: {
          message: 'The funded-operation failsafe is active. Try again after current work finishes.',
          code: 'FUNDED_OPERATION_LIMIT',
          status: 429,
        },
      },
    ] satisfies AgentLogEvent[];
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 4,
          endCursor: 4,
          events,
          snapshot: {
            chatId,
            runId,
            turnId: 'user-reload-failed',
            state: 'failed',
            messages: [{ id: 'user-reload-failed', role: 'user', content: 'Build it.' }],
          } as const,
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-reload-failed',
        backend: 'opfs',
        providerBasePath: 'project-reload-failed',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    // No `bindRun`: a reload is exactly the state where this tab holds none.
    const stream = await transport.reconnectToStream({ chatId, metadata: undefined });
    const chunks: UIMessageChunk[] = [];
    const reader = stream!.getReader();
    const collect = async (): Promise<void> => {
      const next = await reader.read();
      if (next.done) {
        return;
      }
      chunks.push(next.value);
      await collect();
    };
    await collect();

    expect(client.start).not.toHaveBeenCalled();
    expect(client.resume).not.toHaveBeenCalled();
    const failure = chunks.find((chunk) => chunk.type === 'error');
    if (failure?.type !== 'error') {
      throw new Error('Expected the durable failure chunk');
    }
    expect(parseErrorForPersistence(new Error(failure.errorText))).toMatchObject({
      category: 'rate_limit',
      code: 'FUNDED_OPERATION_LIMIT',
      httpStatus: 429,
      message: 'The funded-operation failsafe is active. Try again after current work finishes.',
    });
    // Settlement reads this: a terminal browser run must never be looked up
    // through the API projection, and a failed one releases its claim.
    expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'failed', turnId: 'user-reload-failed' });
    expect(transport.getBoundRunId(chatId)).toBe(runId);
    unregister();
  });

  /*
   * R9 / Journey 2. A credit refusal never reached the provider, so the run's
   * history is whole and the host can continue it at the one call it could not
   * fund. That makes the run resumable — but only when someone asked: a reload
   * reattaches this chat on its own, and spending the credit the user has just
   * topped up without being asked is the failure this guard exists to prevent.
   */
  it('continues a credit-refused run only when the resume was asked for', async () => {
    installBrowserGlobals();
    const chatId = 'chat-refused-credit';
    const runId = 'run-refused-credit';
    const base = {
      version: 1,
      leaderEpoch: 'leader-refused-credit',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    const details = {
      requiredCreditAtoms: '3084332',
      availableCreditAtoms: '1000000',
      routeId: 'openai-gpt-6-astra',
    };
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      {
        ...base,
        sequence: 2,
        type: 'message.appended',
        message: { id: 'user-refused-credit', role: 'user', content: 'Build it.' },
      },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        sequence: 4,
        type: 'run.lifecycle',
        state: 'failed',
        detail: {
          message: 'Insufficient Tau credit for this model request.',
          code: 'INSUFFICIENT_CREDIT',
          status: 402,
          details,
        },
      },
    ] satisfies AgentLogEvent[];
    const refusedSnapshot = {
      chatId,
      runId,
      turnId: 'user-refused-credit',
      state: 'failed',
      messages: [{ id: 'user-refused-credit', role: 'user', content: 'Build it.' }],
      failure: {
        code: 'INSUFFICIENT_CREDIT',
        message: 'Insufficient Tau credit for this model request.',
        status: 402,
        details,
      },
    } as const;
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 4,
          endCursor: 4,
          events,
          snapshot: refusedSnapshot,
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refused-credit',
        backend: 'opfs',
        providerBasePath: 'project-refused-credit',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    // A reload's own reattach: reads the log, spends nothing.
    await drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader());

    expect(client.resume).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
    expect(getBrowserAgentHostRun(chatId)).toMatchObject({
      runId,
      state: 'failed',
      failure: { code: 'INSUFFICIENT_CREDIT', details },
    });
    // The store's `continue` dispatch answers the Resume the credits card
    // offers, and reads the same answer before choosing its verb.
    expect(resumableBrowserAgentHostRunId(chatId)).toBe(runId);
    requestBrowserAgentHostResume(chatId);
    await drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader());

    expect(client.resume).toHaveBeenCalledWith(chatId, runId);
    // The turn is continued, never re-admitted: `start` is what rewinds history.
    expect(client.start).not.toHaveBeenCalled();
    // One-shot: the next reattach this caller did not ask for spends nothing.
    await drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader());

    expect(client.resume).toHaveBeenCalledTimes(1);
    unregister();
  });

  /*
   * The replay a continuation opens with is not this request's outcome.
   *
   * `run.lifecycle: failed` projects to an `error` chunk, and the AI SDK's
   * stream reader rethrows the first one it sees: the resume's request ended
   * with `isError` before `client.resume` had even answered, the page settled
   * the reopened attempt `turn.failed`, and cancelling the readable cancelled
   * the run the host was still executing. The failure being continued is
   * already on screen from the attempt that produced it.
   */
  it('replays no failure chunk for the run a resume is about to continue', async () => {
    installBrowserGlobals();
    const chatId = 'chat-resume-replay';
    const runId = 'run-resume-replay';
    const base = {
      version: 1,
      leaderEpoch: 'leader-resume-replay',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    const detail = { message: 'Refused once.', code: 'INVALID_REQUEST', status: 400 };
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      {
        ...base,
        sequence: 2,
        type: 'message.appended',
        message: { id: 'user-resume-replay', role: 'user', content: 'Build it.' },
      },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      { ...base, sequence: 4, type: 'run.lifecycle', state: 'failed', detail },
    ] satisfies AgentLogEvent[];
    const refusedSnapshot = {
      chatId,
      runId,
      turnId: 'user-resume-replay',
      state: 'failed',
      messages: [{ id: 'user-resume-replay', role: 'user', content: 'Build it.' }],
      failure: detail,
    } as const;
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 4,
          endCursor: 4,
          events,
          snapshot: refusedSnapshot,
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-resume-replay',
        backend: 'opfs',
        providerBasePath: 'project-resume-replay',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const chunksOf = async (): Promise<UIMessageChunk[]> => {
      const stream = await transport.reconnectToStream({ chatId, metadata: undefined });
      const reader = stream!.getReader();
      const collected: UIMessageChunk[] = [];
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- reading a stream is sequential by construction.
        const next = await reader.read();
        if (next.done) {
          return collected;
        }
        collected.push(next.value);
      }
    };

    // A plain reattach still reports the failure: nobody is continuing it.
    const reattached = await chunksOf();

    expect(reattached.filter((chunk) => chunk.type === 'error')).toHaveLength(1);

    requestBrowserAgentHostResume(chatId);
    const resumed = await chunksOf();

    expect(client.resume).toHaveBeenCalledWith(chatId, runId);
    expect(resumed.filter((chunk) => chunk.type === 'error')).toEqual([]);
    expect(resumed.at(-1)).toMatchObject({ type: 'finish' });

    unregister();
  });

  /*
   * The other half of the same rule: only the *replay* is silent. The reopened
   * attempt's own failure is this request's outcome, and silencing it left the
   * saved-turn card unrendered — a second Resume had nothing to press.
   */
  it('reports the failure of the attempt a resume reopened', async () => {
    installBrowserGlobals();
    const chatId = 'chat-resume-refailed';
    const runId = 'run-resume-refailed';
    const base = {
      version: 1,
      leaderEpoch: 'leader-resume-refailed',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    const turnId = 'user-resume-refailed';
    const first = { message: 'Refused once.', code: 'INVALID_REQUEST', status: 400 };
    const second = { message: 'Refused twice.', code: 'INVALID_REQUEST', status: 400 };
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      { ...base, sequence: 2, type: 'run.lifecycle', state: 'running' },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'failed', detail: first },
    ] satisfies AgentLogEvent[];
    let notify: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const client = clientFor(chatId, runId, {
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        notify = next;
        return () => {
          notify = undefined;
        };
      }),
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 3,
          endCursor: 3,
          events,
          snapshot: { chatId, runId, turnId, state: 'failed', messages: [], failure: first } as const,
        }),
      ),
      resume: vi.fn(async (resumedChat: string) => {
        notify?.(resumedChat, {
          ...base,
          leaderEpoch: 'leader-resume-refailed-2',
          sequence: 1,
          type: 'run.lifecycle',
          state: 'failed',
          detail: second,
        });
        return { chatId, runId, turnId, state: 'failed', messages: [], failure: second } as const;
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-resume-refailed',
        backend: 'opfs',
        providerBasePath: 'project-resume-refailed',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    const first_ = await transport.reconnectToStream({ chatId, metadata: undefined });
    await drain(first_!.getReader());
    requestBrowserAgentHostResume(chatId);
    const resumed = await transport.reconnectToStream({ chatId, metadata: undefined });
    const reader = resumed!.getReader();
    const chunks: UIMessageChunk[] = [];
    // oxlint-disable-next-line no-await-in-loop -- reading a stream is sequential by construction.
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      chunks.push(next.value);
    }

    expect(chunks.filter((chunk) => chunk.type === 'error')).toEqual([
      { type: 'error', errorText: expect.stringContaining('Refused twice.') as unknown },
    ]);
    unregister();
  });

  /*
   * I1: one attempt, one settlement — so the gate that holds this stream's
   * follow open belongs to the attempt, not to the run id.
   *
   * The replay a continuation opens with republishes the *previous* attempt's
   * `turn.failed` under the same run id, which resolved the wait before the
   * reopened attempt had started. The stream then closed its client the moment
   * `resume` answered, and the `turn.finalized` row the host appends a tick
   * later reached nobody on this page.
   */
  it('holds its follow open for the settlement of the attempt a resume reopens', async () => {
    installBrowserGlobals();
    const chatId = 'chat-resume-settlement';
    const runId = 'run-resume-settlement';
    const turnId = 'user-resume-settlement';
    const base = {
      version: 1,
      leaderEpoch: 'leader-resume-settlement',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    const settlement = {
      chatId,
      runId,
      turnId,
      projectId: 'project-resume-settlement',
      checkoutId: 'live',
      changedPaths: [],
      trigger: 'turn',
      runIds: [runId],
    } as const;
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      { ...base, sequence: 2, type: 'message.appended', message: { id: turnId, role: 'user', content: 'Build it.' } },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        sequence: 4,
        type: 'run.lifecycle',
        state: 'failed',
        detail: { message: 'Refused once.', code: 'INVALID_REQUEST', status: 400 },
      },
      // The first attempt's own settlement, already in the log.
      { ...base, sequence: 5, type: 'turn.failed', ...settlement, reason: 'Refused once.' },
    ] satisfies AgentLogEvent[];
    const finalized = {
      type: 'turn.finalized',
      ...settlement,
      revisionId: 'rev-resume-settlement',
    } as const satisfies HostTurnSettlement;
    let closesBeforeSettlement: number | undefined;
    let notify: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const settleAfterTheStream = (): void => {
      closesBeforeSettlement = vi.mocked(client.close).mock.calls.length;
      recordHostTurnSettlement(finalized);
    };
    const client = clientFor(chatId, runId, {
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        notify = next;
        return () => {
          notify = undefined;
        };
      }),
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 5,
          endCursor: 5,
          events,
          snapshot: {
            chatId,
            runId,
            turnId,
            state: 'failed',
            messages: [{ id: turnId, role: 'user', content: 'Build it.' }],
            failure: { message: 'Refused once.', code: 'INVALID_REQUEST', status: 400 },
          } as const,
        }),
      ),
      resume: vi.fn(async (resumedChat: string) => {
        notify?.(resumedChat, {
          ...base,
          leaderEpoch: 'leader-resume-settlement-2',
          sequence: 1,
          type: 'run.lifecycle',
          state: 'running',
        });
        notify?.(resumedChat, {
          ...base,
          leaderEpoch: 'leader-resume-settlement-2',
          sequence: 2,
          type: 'run.lifecycle',
          state: 'completed',
        });
        /* The host appends the reopened attempt's row after the stream's last
         * chunk, one macrotask later (W8 TS-S6). */
        globalThis.setTimeout(settleAfterTheStream, 0);
        return { chatId, runId, turnId, state: 'completed', messages: [] } as const;
      }),
    });
    const createClient = vi.fn(async () => client);
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-resume-settlement',
        backend: 'opfs',
        providerBasePath: 'project-resume-settlement',
      }),
      createClient,
    });
    const transport = new BrowserPlacementChatTransport();

    const reattached = await transport.reconnectToStream({ chatId, metadata: undefined });
    await drain(reattached!.getReader());
    /* The read-only reattach closes its own client; the continuation's is the one that must wait. */
    await vi.waitFor(() => {
      expect(client.close).toHaveBeenCalledOnce();
    });
    requestBrowserAgentHostResume(chatId);
    const continued = await transport.reconnectToStream({ chatId, metadata: undefined });
    await drain(continued!.getReader());

    expect(client.resume).toHaveBeenCalledTimes(1);
    /* The readable is done once the last chunk is written; the follow this
     * asserts is held open past it, for the settlement row that follows. */
    await vi.waitFor(() => {
      expect(closesBeforeSettlement).toBe(1);
    });
    await vi.waitFor(() => {
      expect(client.close).toHaveBeenCalledTimes(2);
    });
    expect(createClient).toHaveBeenCalledTimes(2);
    unregister();
  });

  /*
   * The other gate the replay resolves, and the race the conditional re-arm
   * lost. The host appends `run.lifecycle: running` and publishes it *before*
   * it answers `resume`, so the row is already drained by the time the resume's
   * snapshot is reconciled: the re-arm's `terminal(state)` reads false, nothing
   * re-arms, and the stream closed on the previous attempt's gate while the
   * continuation was still producing the reply — A2's exact symptom, re-armed.
   */
  it('keeps a continuation open until the reopened attempt ends, not until its resume answers', async () => {
    installBrowserGlobals();
    const chatId = 'chat-resume-open';
    const runId = 'run-resume-open';
    const turnId = 'user-resume-open';
    const base = {
      version: 1,
      leaderEpoch: 'leader-resume-open',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    const refusal = { message: 'Refused once.', code: 'INVALID_REQUEST', status: 400 };
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      { ...base, sequence: 2, type: 'message.appended', message: { id: turnId, role: 'user', content: 'Build it.' } },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      { ...base, sequence: 4, type: 'run.lifecycle', state: 'failed', detail: refusal },
    ] satisfies AgentLogEvent[];
    const finalized = {
      type: 'turn.finalized',
      chatId,
      runId,
      turnId,
      projectId: 'project-resume-open',
      checkoutId: 'live',
      changedPaths: [],
      trigger: 'turn',
      runIds: [runId],
      revisionId: 'rev-resume-open',
    } as const satisfies HostTurnSettlement;
    let notify: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const client = clientFor(chatId, runId, {
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        notify = next;
        return () => {
          notify = undefined;
        };
      }),
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 4,
          endCursor: 4,
          events,
          snapshot: {
            chatId,
            runId,
            turnId,
            state: 'failed',
            messages: [{ id: turnId, role: 'user', content: 'Build it.' }],
            failure: refusal,
          } as const,
        }),
      ),
      resume: vi.fn(async (resumedChat: string) => {
        /* The host's own ordering: the reopened attempt is already running and
         * its row is on the subscription before this command answers. */
        notify?.(resumedChat, {
          ...base,
          leaderEpoch: 'leader-resume-open-2',
          sequence: 1,
          type: 'run.lifecycle',
          state: 'running',
        });
        globalThis.setTimeout(() => {
          notify?.(resumedChat, {
            ...base,
            leaderEpoch: 'leader-resume-open-2',
            sequence: 2,
            type: 'message.appended',
            message: {
              id: 'assistant-resume-open',
              role: 'assistant',
              content: [{ type: 'text', text: 'Reply one.' }],
            },
          });
          notify?.(resumedChat, {
            ...base,
            leaderEpoch: 'leader-resume-open-2',
            sequence: 3,
            type: 'run.lifecycle',
            state: 'completed',
          });
          recordHostTurnSettlement(finalized);
        }, 0);
        return { chatId, runId, turnId, state: 'running', messages: [] } as const;
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-resume-open',
        backend: 'opfs',
        providerBasePath: 'project-resume-open',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    const reattached = await transport.reconnectToStream({ chatId, metadata: undefined });
    await drain(reattached!.getReader());
    requestBrowserAgentHostResume(chatId);
    const continued = await transport.reconnectToStream({ chatId, metadata: undefined });
    const reader = continued!.getReader();
    const chunks: UIMessageChunk[] = [];
    // oxlint-disable-next-line no-await-in-loop -- reading a stream is sequential by construction.
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      chunks.push(next.value);
    }

    expect(chunks).toContainEqual({ type: 'text-delta', id: 'assistant-resume-open:text:0', delta: 'Reply one.' });
    unregister();
  });

  /*
   * T3-D8. A settlement retires this page's record of the run — it is the
   * page's live bookkeeping and the turn is over — but resumability is a fact
   * about the *host's* run, and it survives that. Reading it from the retired
   * record made every *Try again* after a credit refusal a full re-admission:
   * a new lease, a new run id and a rewind, which pays a second time for the
   * tool work the customer already paid for.
   */
  it('keeps a credit-refused run resumable after settlement retires the page record', async () => {
    installBrowserGlobals();
    const chatId = 'chat-refused-settled';
    const runId = 'run-refused-settled';
    const base = {
      version: 1,
      leaderEpoch: 'leader-refused-settled',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const client = clientFor(chatId, runId, {
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
      /* The admission is answered as soon as the run is admitted — long before
       * the model call the gateway refuses — so the failure reaches a live turn
       * on the run's own terminal row and never in a snapshot. */
      start: vi.fn(async () => {
        listener?.(chatId, {
          ...base,
          sequence: 1,
          type: 'run.lifecycle',
          state: 'failed',
          detail: {
            message: 'Insufficient Tau credit for this model request.',
            code: 'INSUFFICIENT_CREDIT',
            status: 402,
          },
        } satisfies AgentLogEvent);
        return { chatId, runId, turnId: 'user-refused-settled', state: 'running', messages: [] } as const;
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refused-settled',
        backend: 'opfs',
        providerBasePath: 'project-refused-settled',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      messages: [{ id: 'user-refused-settled', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
      abortSignal: undefined,
      body: {
        admission: { version: 1, idempotencyKey: runId },
        browserHost: { trigger: 'submit', agent: { kind: 'acp', id: 'codex' } },
      },
    });
    await drain(stream.getReader());

    expect(getBrowserAgentHostRun(chatId)).toMatchObject({
      runId,
      state: 'failed',
      failure: { code: 'INSUFFICIENT_CREDIT' },
    });
    expect(resumableBrowserAgentHostRunId(chatId)).toBe(runId);

    // The turn settled: the page's own record of the run is retired with it.
    retireBrowserAgentHostRun(chatId, runId);

    expect(resumableBrowserAgentHostRunId(chatId)).toBe(runId);
    expect(resumableBrowserAgentHostRunId(chatId)).toBe(runId);
    unregister();
  });

  it('leaves a non-retryable failed run unresumable even when a resume was asked for', async () => {
    installBrowserGlobals();
    const chatId = 'chat-refused-catalog';
    const runId = 'run-refused-catalog';
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
          snapshot: {
            chatId,
            runId,
            turnId: 'user-refused-catalog',
            state: 'failed',
            messages: [],
            failure: { code: 'MODEL_NOT_IN_CATALOG', message: 'That model is not in the catalog.', status: 400 },
          } as const,
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refused-catalog',
        backend: 'opfs',
        providerBasePath: 'project-refused-catalog',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    requestBrowserAgentHostResume(chatId);
    /* The Resume flag is one-shot and is spent the moment the stream opens, so
     * a resume nothing can honour has to say so: replaying and closing in
     * silence left the person having pressed Resume with no continuation and no
     * message. */
    await expect(
      drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader()),
    ).rejects.toMatchObject({ code: 'RESUME_UNAVAILABLE' });

    expect(client.resume).not.toHaveBeenCalled();
    expect(resumableBrowserAgentHostRunId(chatId)).toBeUndefined();
    unregister();
  });

  it('tails a non-terminal durable log after a reload instead of ending the resume', async () => {
    installBrowserGlobals();
    const chatId = 'chat-reload-running';
    const runId = 'run-reload-running';
    const running = {
      version: 1,
      leaderEpoch: 'leader-reload-running',
      sequence: 1,
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
      type: 'run.lifecycle',
      state: 'running',
    } satisfies AgentLogEvent;
    const appended = {
      ...running,
      sequence: 2,
      type: 'message.appended',
      message: { id: 'user-reload-running', role: 'user', content: 'Build it.' },
    } satisfies AgentLogEvent;
    const completed = { ...running, sequence: 3, state: 'completed' } satisfies AgentLogEvent;
    const attach = vi.fn(async () =>
      page({
        cursor: 0,
        nextCursor: 1,
        endCursor: 2,
        events: [running],
        snapshot: { chatId, runId, turnId: `message-${chatId}`, state: 'running', messages: [] } as const,
      }),
    );
    const read = vi.fn(async () =>
      page({
        cursor: 1,
        nextCursor: 2,
        endCursor: 2,
        events: [appended],
      }),
    );
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const client = clientFor(chatId, runId, {
      attach,
      read,
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-reload-running',
        backend: 'opfs',
        providerBasePath: 'project-reload-running',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const answers: ChatLogAnswer[] = [];
    const unsubscribeAnswers = subscribeChatLogAnswers((event) => {
      answers.push(event);
    });

    const stream = await transport.reconnectToStream({ chatId, metadata: undefined });
    const reader = stream!.getReader();
    // The log tail is non-terminal: the resume stays attached to the live run
    // (the host takes leadership over and resumes it) instead of ending here.
    await vi.waitFor(() => {
      expect(listener).toBeDefined();
    });
    expect(read).toHaveBeenCalledOnce();
    expect(client.subscribe).toHaveBeenCalledWith({ chatId, cursor: 2 }, expect.any(Function), expect.any(Function));
    expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'running' });
    listener!(chatId, completed, 2);
    await drain(reader);

    // Every answer the stream read reaches the chat's projection, a followed row at its position (PV-S7).
    expect(answers.map((event) => event.answer)).toMatchObject([
      { status: 'batch', cursor: 0, nextCursor: 1, events: [running] },
      { status: 'batch', cursor: 1, nextCursor: 2, events: [appended] },
      { status: 'batch', cursor: 2, nextCursor: 3, endCursor: 3, events: [completed] },
    ]);
    expect(answers).toMatchObject([{ chatId }, { chatId }, { chatId }]);
    unsubscribeAnswers();
    expect(attach).toHaveBeenCalledWith({ chatId, cursor: 0 });
    // The next page names the row it follows, so an owner on another history refuses it (SC-R11).
    expect(read).toHaveBeenCalledWith({
      chatId,
      cursor: 1,
      last: { leaderEpoch: 'leader-reload-running', sequence: 1 },
    });
    expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'completed' });
    unregister();
  });

  it.each([
    { hostTrigger: 'submit', sdkTrigger: 'submit-message', messageId: undefined, retained: undefined },
    { hostTrigger: 'edit', sdkTrigger: 'regenerate-message', messageId: undefined, retained: [] },
    { hostTrigger: 'regenerate', sdkTrigger: 'regenerate-message', messageId: undefined, retained: [] },
  ] as const)(
    'maps $hostTrigger through trigger-aware host admission',
    async ({ hostTrigger, sdkTrigger, messageId, retained }) => {
      installBrowserGlobals();
      const chatId = `chat-${hostTrigger}`;
      const runId = `run-${hostTrigger}`;
      const client = clientFor(chatId, runId);
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => ({
          projectId: `project-${hostTrigger}`,
          backend: 'opfs',
          providerBasePath: `project-${hostTrigger}`,
        }),
        createClient: async () => client,
      });
      const transport = new BrowserPlacementChatTransport();
      const stream = await transport.sendMessages({
        chatId,
        trigger: sdkTrigger,
        messageId,
        messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: hostTrigger, retainedMessageIds: retained }),
      });
      await stream.getReader().read();

      expect(client.start).toHaveBeenCalledWith({
        chatId,
        runId,
        message: { id: 'user-1', role: 'user', content: 'Build it.' },
        trigger: hostTrigger,
        config: browserConfig,
        ...(hostTrigger === 'submit' ? {} : { retainedMessageIds: retained }),
      });
      unregister();
    },
  );

  it('waits for the prior worker to release the chat log before starting an immediate retry', async () => {
    installBrowserGlobals();
    const chatId = 'chat-immediate-retry';
    const firstRunId = 'run-immediate-retry-first';
    const retryRunId = 'run-immediate-retry-second';
    const closeStarted = Promise.withResolvers<void>();
    const releaseClose = Promise.withResolvers<void>();
    let firstClosed = false;
    const firstClient = clientFor(chatId, firstRunId, {
      close: vi.fn(async () => {
        closeStarted.resolve();
        await releaseClose.promise;
        firstClosed = true;
      }),
    });
    const retryStart = vi.fn<AgentHostClient['start']>(async () => {
      if (!firstClosed) {
        throw new Error('Message id "user-1" cannot be appended or reintroduced twice.');
      }
      return snapshot(chatId, retryRunId);
    });
    const retryClient = clientFor(chatId, retryRunId, { start: retryStart });
    const firstRegistration = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: 'project-retry', backend: 'opfs', providerBasePath: 'project-retry' }),
      createClient: async () => firstClient,
    });
    const transport = new BrowserPlacementChatTransport();
    const chat = new Chat<MyUIMessage>({ id: chatId, transport });
    const user = { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] } satisfies MyUIMessage;

    await chat.sendMessage(user, { body: browserBody({ runId: firstRunId, trigger: 'submit' }) });
    await closeStarted.promise;
    firstRegistration();
    const retryRegistration = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: 'project-retry', backend: 'opfs', providerBasePath: 'project-retry' }),
      createClient: async () => retryClient,
    });
    chat.messages = [user, { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] }];

    const retry = chat.regenerate({
      messageId: 'assistant-1',
      body: browserBody({ runId: retryRunId, trigger: 'regenerate', retainedMessageIds: [] }),
    });
    const releaseTimer = globalThis.setTimeout(() => {
      releaseClose.resolve();
    }, 0);
    try {
      await retry;
    } finally {
      globalThis.clearTimeout(releaseTimer);
      releaseClose.resolve();
    }

    expect(chat.error).toBeUndefined();
    expect(retryStart).toHaveBeenCalledWith({
      chatId,
      runId: retryRunId,
      message: { id: 'user-1', role: 'user', content: 'Build it.' },
      trigger: 'regenerate',
      retainedMessageIds: [],
      config: browserConfig,
    });
    retryRegistration();
  });

  it('maps continue to a bounded follower attach, then follows from its end, without executing resume', async () => {
    installBrowserGlobals();
    const chatId = 'chat-follower';
    const runId = 'run-follower';
    const completed = {
      version: 1,
      leaderEpoch: 'leader-1',
      sequence: 2,
      recordedAt: '2026-09-01T00:00:02.000Z',
      runId,
      type: 'run.lifecycle',
      state: 'completed',
    } satisfies AgentLogEvent;
    const running = { ...completed, sequence: 1, state: 'running' } satisfies AgentLogEvent;
    const attach = vi.fn(async () =>
      page({
        cursor: 0,
        nextCursor: 1,
        endCursor: 2,
        events: [running],
      }),
    );
    const read = vi.fn(async () =>
      page({
        cursor: 1,
        nextCursor: 2,
        endCursor: 2,
        events: [completed],
      }),
    );
    const subscribe = vi.fn(() => () => undefined);
    const client = clientFor(chatId, runId, { attach, read, subscribe });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-follower',
        backend: 'opfs',
        providerBasePath: 'project-follower',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    transport.bindRun(chatId, runId);

    const stream = await transport.reconnectToStream({ chatId });
    expect(stream).not.toBeNull();
    const reader = stream!.getReader();
    await drain(reader);

    /* Rows are pulled, not pushed (SC-R14): the follow starts after the replay, from the cursor it ended on, so nothing
     * between the two is lost and nothing is delivered twice. */
    expect(attach.mock.invocationCallOrder[0]).toBeLessThan(subscribe.mock.invocationCallOrder[0]!);
    expect(subscribe).toHaveBeenCalledWith({ chatId, cursor: 2 }, expect.any(Function), expect.any(Function));
    expect(attach).toHaveBeenCalledWith({ chatId, cursor: 0 });
    expect(read).toHaveBeenCalledWith({ chatId, cursor: 1, last: { leaderEpoch: 'leader-1', sequence: 1 } });
    expect(client.resume).not.toHaveBeenCalled();
    unregister();
  });

  it.each(['completed', 'running'] as const)(
    'replays a %s attach snapshot before concurrent frames',
    async (snapshotState) => {
      installBrowserGlobals();
      const chatId = 'chat-attach-race';
      const runId = 'run-attach-race';
      let liveListener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[1] | undefined;
      let durableListener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
      const base = { version: 1, leaderEpoch: 'leader', recordedAt: '2026-09-01T00:00:00.000Z', runId } as const;
      const events: AgentLogEvent[] = [
        { ...base, sequence: 0, type: 'run.lifecycle', state: 'admitted' },
        ...['Earlier', 'Later'].map(
          (text, index): AgentLogEvent => ({
            ...base,
            sequence: index + 1,
            type: 'message.appended',
            message: {
              id: text,
              role: 'assistant',
              content: text,
              metadata: { tauInternal: { kind: 'external-tool', origin: 'external', streamState: 'final' } },
            },
          }),
        ),
        { ...base, sequence: 3, type: 'run.lifecycle', state: 'completed' },
      ];
      const client = clientFor(chatId, runId, {
        /* The follow pulls from where the replay ended (SC-R14): a row the log gained while the attach was in flight
         * arrives through it, not pushed into the gap. */
        subscribe: ({ cursor }, listener) => {
          durableListener = listener;
          queueMicrotask(() => {
            for (const event of events.slice(cursor)) {
              durableListener?.(chatId, event);
            }
          });
          return () => {
            durableListener = undefined;
          };
        },
        subscribeLive: (_chatId, listener) => {
          liveListener = listener;
          return () => {
            liveListener = undefined;
          };
        },
        attach: async () => {
          liveListener?.(chatId, {
            type: 'text-delta',
            chatId,
            runId,
            messageId: 'Later',
            contentIndex: 0,
            delta: 'Later',
            offset: 0,
          });
          const attachedEvents = snapshotState === 'running' ? events.slice(0, 3) : events;
          return page({
            cursor: 0,
            nextCursor: attachedEvents.length,
            endCursor: attachedEvents.length,
            events: attachedEvents,
            snapshot: { ...snapshot(chatId, runId), state: snapshotState },
          });
        },
      });
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => ({ projectId: 'project-race', backend: 'opfs', providerBasePath: 'project-race' }),
        createClient: async () => client,
      });
      try {
        const transport = new BrowserPlacementChatTransport();
        transport.bindRun(chatId, runId);
        const stream = await transport.reconnectToStream({ chatId });
        const chunks: UIMessageChunk[] = [];
        await stream!.pipeTo(
          new WritableStream({
            write(chunk) {
              chunks.push(chunk);
            },
          }),
        );
        expect(chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.delta)).toEqual([
          'Earlier',
          'Later',
        ]);
        expect(getBrowserAgentHostRun(chatId)?.state).toBe('completed');
      } finally {
        unregister();
      }
    },
  );

  it('projects a real live partial before start settles and closes it without durable replay', async () => {
    installBrowserGlobals();
    const chatId = 'chat-live';
    const runId = 'run-live';
    const startGate = Promise.withResolvers<void>();
    let durableListener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    let liveListener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[1] | undefined;
    const start = vi.fn(async () => {
      liveListener?.(chatId, {
        type: 'text-delta',
        chatId,
        runId,
        messageId: 'assistant-live',
        contentIndex: 0,
        delta: 'Browser host started the workspace change.',
      } satisfies AgentLiveEvent);
      await startGate.promise;
      durableListener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-live',
        sequence: 1,
        recordedAt: '2026-09-01T00:00:01.000Z',
        runId,
        type: 'message.appended',
        message: { id: 'assistant-live', role: 'assistant', content: 'Browser host started the workspace change.' },
      });
      durableListener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-live',
        sequence: 2,
        recordedAt: '2026-09-01T00:00:02.000Z',
        runId,
        type: 'run.lifecycle',
        state: 'completed',
      });
      return snapshot(chatId, runId);
    });
    const client = clientFor(chatId, runId, {
      start,
      subscribe: vi.fn((_input: Follow[0], listener: Follow[1]) => {
        durableListener = listener;
        return () => {
          durableListener = undefined;
        };
      }),
      subscribeLive: vi.fn((_chatId: string, listener: LiveListener) => {
        liveListener = listener;
        return () => {
          liveListener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: 'project-live', backend: 'opfs', providerBasePath: 'project-live' }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: 'user-live',
      messages: [{ id: 'user-live', role: 'user', parts: [{ type: 'text', text: 'Stream.' }] }],
      abortSignal: undefined,
      body: browserBody({ runId, trigger: 'submit' }),
    });
    const reader = stream.getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { type: 'text-start', id: 'assistant-live:text:0' },
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: {
        type: 'text-delta',
        id: 'assistant-live:text:0',
        delta: 'Browser host started the workspace change.',
      },
    });
    expect(startGate.promise).toBeInstanceOf(Promise);

    startGate.resolve();
    const readRemaining = async (): Promise<UIMessageChunk[]> => {
      const next = await reader.read();
      if (next.done) {
        return [];
      }
      return [next.value, ...(await readRemaining())];
    };
    const remaining = await readRemaining();
    expect(remaining.map((chunk) => chunk.type)).toEqual(['text-end', 'finish-step', 'finish']);
    expect(remaining).not.toContainEqual(
      expect.objectContaining({ type: 'text-delta', delta: 'Browser host started the workspace change.' }),
    );
    unregister();
  });

  it('reconciles a terminal attach snapshot from the durable log alone', async () => {
    installBrowserGlobals();
    const chatId = 'chat-snapshot-terminal';
    const runId = 'run-snapshot-terminal';
    const turnId = `message-${chatId}`;
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
          snapshot: {
            ...snapshot(chatId, runId),
            messages: [{ id: turnId, role: 'user', content: 'Restore this turn.' }] satisfies Awaited<
              ReturnType<AgentHostClient['start']>
            >['messages'],
          },
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-snapshot-terminal',
        backend: 'opfs',
        providerBasePath: 'project-snapshot-terminal',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    transport.bindRun(chatId, runId);

    const stream = await transport.reconnectToStream({ chatId });
    await expect(stream!.getReader().read()).resolves.toEqual({ done: true, value: undefined });

    expect(getBrowserAgentHostRun(chatId)).toEqual({
      runId,
      state: 'completed',
      eventCount: 0,
      turnId,
      userMessage: {
        id: turnId,
        role: 'user',
        parts: [{ type: 'text', text: 'Restore this turn.' }],
        metadata: { status: 'success' },
      },
    });
    unregister();
  });

  it('reattaches with no bound run and projects a turn the host finished with no client attached', async () => {
    // The shape a reloaded page takes: the in-memory run binding is gone, so
    // the log has to name the run *and* carry a turn this browser never saw.
    // Nothing here is transport-specific — a daemon-backed client answers the
    // same `attach`, which is why one projection serves both (W4 ruling 6).
    installBrowserGlobals();
    const chatId = 'chat-unattended-reattach';
    const runId = 'run-unattended-reattach';
    // Annotated, not inferred: `version` is the literal `1` on every log event,
    // and a bare object literal widens it to `number` for each spread below.
    const base: Pick<AgentLogEvent, 'version' | 'leaderEpoch' | 'recordedAt' | 'runId'> = {
      version: 1,
      leaderEpoch: 'leader-unattended',
      recordedAt: '2026-09-03T00:00:00.000Z',
      runId,
    };
    const events: AgentLogEvent[] = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      {
        ...base,
        sequence: 2,
        type: 'message.appended',
        message: { id: 'user-unattended', role: 'user', content: 'Build it.' },
      },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        sequence: 4,
        type: 'message.appended',
        message: { id: 'assistant-partial', role: 'assistant', content: [{ type: 'text', text: 'Started it.' }] },
      },
      // Appended after this browser lost its client; it exists only in the log.
      {
        ...base,
        sequence: 5,
        type: 'message.appended',
        message: { id: 'assistant-final', role: 'assistant', content: [{ type: 'text', text: 'Finished it.' }] },
      },
      { ...base, sequence: 6, type: 'run.lifecycle', state: 'completed' },
    ];
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: events.length,
          endCursor: events.length,
          events,
          snapshot: snapshot(chatId, runId),
        }),
      ),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-unattended',
        backend: 'opfs',
        providerBasePath: 'project-unattended',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    // Deliberately no `bindRun`: a reload drops it, and the log's own snapshot
    // is the only thing left that names the run to replay.
    const stream = await transport.reconnectToStream({ chatId });
    const reader = stream!.getReader();
    const readAll = async (): Promise<UIMessageChunk[]> => {
      const next = await reader.read();
      return next.done ? [] : [next.value, ...(await readAll())];
    };
    const chunks = await readAll();

    expect(chunks).toContainEqual({ type: 'text-delta', id: 'assistant-partial:text:0', delta: 'Started it.' });
    expect(chunks).toContainEqual({ type: 'text-delta', id: 'assistant-final:text:0', delta: 'Finished it.' });
    expect(chunks.at(-1)).toMatchObject({ type: 'finish' });
    expect(getBrowserAgentHostRun(chatId)?.runId).toBe(runId);
    unregister();
  });

  it('repairs a missing terminal projection by replaying the canonical log after start settles', async () => {
    installBrowserGlobals();
    const chatId = 'chat-terminal-repair';
    const runId = 'run-terminal-repair';
    const completed = {
      version: 1,
      leaderEpoch: 'leader-repair',
      sequence: 1,
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
      type: 'run.lifecycle',
      state: 'completed',
    } satisfies AgentLogEvent;
    const attach = vi
      .fn<AgentHostClient['attach']>()
      .mockResolvedValueOnce({
        status: 'batch',
        chatId: 'chat-test',
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
      })
      .mockResolvedValueOnce({
        status: 'batch',
        chatId: 'chat-test',
        cursor: 0,
        nextCursor: 1,
        endCursor: 1,
        events: [completed],
      });
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => snapshot(chatId, runId)),
      attach,
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-terminal-repair',
        backend: 'opfs',
        providerBasePath: 'project-terminal-repair',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();

    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: 'user-repair',
      messages: [{ id: 'user-repair', role: 'user', parts: [{ type: 'text', text: 'Repair.' }] }],
      abortSignal: undefined,
      body: browserBody({ runId, trigger: 'submit' }),
    });
    await drain(stream.getReader());

    expect(attach).toHaveBeenCalledTimes(2);
    expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'completed' });
    unregister();
  });

  it('cancels the worker and closes the UI stream when a browser-host turn aborts', async () => {
    installBrowserGlobals();
    const chatId = 'chat-browser-cancel';
    const runId = 'request-browser-cancel';
    const completion = Promise.withResolvers<Awaited<ReturnType<AgentHostClient['start']>>>();
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => completion.promise),
      cancel: vi.fn(async () => {
        const value = snapshot(chatId, runId, 'cancelled');
        completion.resolve(value);
        return value;
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-browser-cancel',
        backend: 'opfs',
        providerBasePath: 'project-browser-cancel',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const operation = new AbortController();

    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: 'message-browser-cancel',
      messages: [{ id: 'message-browser-cancel', role: 'user', parts: [{ type: 'text', text: 'Cancel this.' }] }],
      abortSignal: operation.signal,
      body: browserBody({ runId, trigger: 'submit' }),
    });
    operation.abort();

    await expect(stream.getReader().read()).resolves.toEqual({ done: true, value: undefined });
    expect(client.cancel).toHaveBeenCalledWith(runId);
    unregister();
  });

  /**
   * V10/C6: every admitted run settles exactly once, whatever ended its stream.
   *
   * A stopped turn closed its follow the moment the abort landed, so the
   * settlement row the host appends a beat later reached nobody on this page
   * (F6, W8 TS-S6). The stream that drove the admission holds its follow open
   * for the settlement of the run it admitted.
   */
  it('keeps the follow open for the settlement of a run whose turn was stopped', async () => {
    installBrowserGlobals();
    const chatId = 'chat-cancel-settlement';
    const runId = 'run-cancel-settlement';
    const completion = Promise.withResolvers<Awaited<ReturnType<AgentHostClient['start']>>>();
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => completion.promise),
      cancel: vi.fn(async () => {
        const value = snapshot(chatId, runId, 'cancelled');
        completion.resolve(value);
        return value;
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-cancel-settlement',
        backend: 'opfs',
        providerBasePath: 'project-cancel-settlement',
      }),
      createClient: async () => client,
    });
    const operation = new AbortController();

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: 'message-cancel-settlement',
        messages: [{ id: 'message-cancel-settlement', role: 'user', parts: [{ type: 'text', text: 'Stop this.' }] }],
        abortSignal: operation.signal,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      operation.abort();
      await drain(stream.getReader());

      const failed = {
        type: 'turn.failed',
        turnId: 'message-cancel-settlement',
        runId,
        chatId,
        checkoutId: undefined,
        reason: 'the person stopped this turn',
      } as const;
      expect(client.close).not.toHaveBeenCalled();
      recordHostTurnSettlement(failed);
      await vi.waitFor(() => {
        expect(client.close).toHaveBeenCalledOnce();
      });
    } finally {
      unregister();
    }
  });

  /* The same run of the same invariant for a refusal: `start` throws, the
   * stream aborts, and the host settles the turn as failed afterwards. */
  it('keeps the follow open for the settlement of a run the host refused', async () => {
    installBrowserGlobals();
    const chatId = 'chat-refusal-settlement';
    const runId = 'run-refusal-settlement';
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => {
        throw new Error('Refused once.');
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refusal-settlement',
        backend: 'opfs',
        providerBasePath: 'project-refusal-settlement',
      }),
      createClient: async () => client,
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: 'message-refusal-settlement',
        messages: [{ id: 'message-refusal-settlement', role: 'user', parts: [{ type: 'text', text: 'Refuse this.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      await drain(stream.getReader()).catch(() => undefined);

      const failed = {
        type: 'turn.failed',
        turnId: 'message-refusal-settlement',
        runId,
        chatId,
        checkoutId: undefined,
        reason: 'Refused once.',
      } as const;
      expect(client.close).not.toHaveBeenCalled();
      recordHostTurnSettlement(failed);
      await vi.waitFor(() => {
        expect(client.close).toHaveBeenCalledOnce();
      });
    } finally {
      unregister();
    }
  });

  /**
   * The page came back to a chat mid-turn: this document never attached to the
   * run the worker is still driving, and the workspace claim that reload
   * discovery reads was dropped when the previous document unloaded. The host
   * is the only authority that knows, and it says so with `CHAT_RUN_LIVE`.
   * Ending the turn on that banner made *navigate away mid-turn and back* a
   * dead chat; the stream waits for the live run to end and admits once, which
   * is what the person asked for.
   */
  it('waits out the live run the host named, then admits once', async () => {
    installBrowserGlobals();
    const chatId = 'chat-live-refusal';
    const runId = 'run-live-refusal';
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    let refusals = 0;
    const client = clientFor(chatId, runId, {
      start: vi.fn(async (input: Parameters<AgentHostClient['start']>[0]) => {
        refusals += 1;
        if (refusals === 1) {
          throw new AgentHostWorkerError('CHAT_RUN_LIVE', `Chat ${chatId} has a running run; admit the next turn.`);
        }
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-live-refusal',
          sequence: 9,
          recordedAt: '2026-09-18T00:00:09.000Z',
          runId: input.runId,
          type: 'run.lifecycle',
          state: 'completed',
        });
        return snapshot(chatId, input.runId);
      }),
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
          snapshot: snapshot(chatId, 'run-previous', 'running'),
        }),
      ),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        /* The run this page never attached to ends on its own. */
        globalThis.setTimeout(() => {
          next(chatId, {
            version: 1,
            leaderEpoch: 'leader-live-refusal',
            sequence: 4,
            recordedAt: '2026-09-18T00:00:04.000Z',
            runId: 'run-previous',
            type: 'run.lifecycle',
            state: 'completed',
          });
        }, 10);
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-live-refusal',
        backend: 'opfs',
        providerBasePath: 'project-live-refusal',
      }),
      createClient: async () => client,
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: 'message-live-refusal',
        messages: [{ id: 'message-live-refusal', role: 'user', parts: [{ type: 'text', text: 'Second.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      await drain(stream.getReader());

      expect(client.start).toHaveBeenCalledTimes(2);
      expect(refusals).toBe(2);
    } finally {
      unregister();
    }
  });

  /*
   * W8.r1 item 6 (probe P12): the previous attempt ended and its `turn.*` row freed the composer, but the host
   * acknowledges its lease a few milliseconds later; a quick follow-up meanwhile is refused `CHAT_RUN_LIVE` naming a
   * terminal (or settling) run. That is retry class `wait`: the stream re-sends until the host admits it.
   */
  it('re-sends a start the host refuses while the previous attempt settles, until it is admitted', async () => {
    installBrowserGlobals();
    const chatId = 'chat-settling';
    const runId = 'run-next';
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    let sends = 0;
    const client = clientFor(chatId, runId, {
      start: vi.fn(async (input: Parameters<AgentHostClient['start']>[0]) => {
        sends += 1;
        if (sends <= 3) {
          throw new AgentHostWorkerError(
            'CHAT_RUN_LIVE',
            `Chat ${chatId} has a ${sends === 1 ? 'terminal' : 'settling'} run; send the command again after it ends.`,
            { state: sends === 1 ? 'terminal' : 'settling', runId: 'run-previous' },
          );
        }
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-settling',
          sequence: 9,
          recordedAt: '2026-09-27T00:00:09.000Z',
          runId: input.runId,
          type: 'run.lifecycle',
          state: 'completed',
        });
        return snapshot(chatId, input.runId);
      }),
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
          snapshot: snapshot(chatId, 'run-previous', 'completed'),
        }),
      ),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-settling',
        backend: 'opfs',
        providerBasePath: 'project-settling',
      }),
      createClient: async () => client,
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: 'message-next',
        messages: [{ id: 'message-next', role: 'user', parts: [{ type: 'text', text: 'Follow-up.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      await drain(stream.getReader());

      expect(client.start).toHaveBeenCalledTimes(4);
    } finally {
      unregister();
    }
  });

  /**
   * The other half of the same refusal: after a document died with no takeover,
   * nobody drives the run the host is refusing over, so it never ends. The wait
   * used to have no timer and no abort — the composer sat on *Planning next
   * moves…* for as long as the page stayed open. A bounded wait turns an
   * invisible hang back into a failure the person can act on — and another
   * view's run ending is not this run ending, so it must not release the wait.
   */
  it('surfaces a live run nobody is driving once the settlement bound expires', async () => {
    installBrowserGlobals();
    vi.useFakeTimers();
    const chatId = 'chat-live-forever';
    const runId = 'run-live-forever';
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => {
        throw new AgentHostWorkerError('CHAT_RUN_LIVE', `Chat ${chatId} has a running run; admit the next turn.`);
      }),
      attach: vi.fn(async () =>
        page({
          cursor: 0,
          nextCursor: 0,
          endCursor: 0,
          events: [],
          snapshot: snapshot(chatId, 'run-orphan', 'running'),
        }),
      ),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        globalThis.setTimeout(() => {
          next(chatId, {
            version: 1,
            leaderEpoch: 'leader-live-forever',
            sequence: 4,
            recordedAt: '2026-09-18T00:00:04.000Z',
            runId: 'run-someone-else',
            type: 'run.lifecycle',
            state: 'completed',
          });
        }, 1000);
        return () => undefined;
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-live-forever',
        backend: 'opfs',
        providerBasePath: 'project-live-forever',
      }),
      createClient: async () => client,
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: 'message-live-forever',
        messages: [{ id: 'message-live-forever', role: 'user', parts: [{ type: 'text', text: 'Second.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      /* Observed before the clock moves: the bound rejects inside the advance,
       * and a rejection nothing is watching yet is reported as unhandled. */
      const refusal = expect(drain(stream.getReader())).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE' });
      await vi.advanceTimersByTimeAsync(31_000);

      await refusal;
      /* Once: the unrelated run ending at 1 s is not this run ending, so it
       * never released the wait into a second admission. */
      expect(client.start).toHaveBeenCalledOnce();
    } finally {
      unregister();
      vi.useRealTimers();
    }
  });

  it('resolves an approval on the attached run without creating another admission', async () => {
    installBrowserGlobals();
    const chatId = 'chat-browser-approval';
    const runId = 'run-browser-approval';
    const completion = Promise.withResolvers<Awaited<ReturnType<AgentHostClient['start']>>>();
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    const resolveInterrupt = vi.fn(async () => {
      listener?.(chatId, {
        version: 1,
        leaderEpoch: 'leader-approval',
        sequence: 1,
        recordedAt: '2026-09-01T00:00:01.000Z',
        runId,
        type: 'run.lifecycle',
        state: 'completed',
      });
      const value = snapshot(chatId, runId);
      completion.resolve(value);
      return value;
    });
    const client = clientFor(chatId, runId, {
      start: vi.fn(async () => completion.promise),
      resolveInterrupt,
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-browser-approval',
        backend: 'opfs',
        providerBasePath: 'project-browser-approval',
      }),
      createClient: async () => client,
    });
    const transport = new BrowserPlacementChatTransport();
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: 'message-browser-approval',
      messages: [{ id: 'message-browser-approval', role: 'user', parts: [{ type: 'text', text: 'Approve.' }] }],
      abortSignal: undefined,
      body: browserBody({ runId, trigger: 'submit' }),
    });
    const reader = stream.getReader();
    const firstChunk = reader.read();
    await vi.waitFor(() => {
      expect(client.start).toHaveBeenCalledOnce();
    });

    await resolveBrowserAgentHostInterrupt({
      chatId,
      runId,
      interruptId: 'interrupt-approval',
      approved: true,
      reason: 'Proceed',
    });

    expect(resolveInterrupt).toHaveBeenCalledWith(chatId, runId, {
      interruptId: 'interrupt-approval',
      outcome: 'approved',
      payload: { reason: 'Proceed' },
    });
    await firstChunk;
    await drain(reader);
    expect(client.start).toHaveBeenCalledOnce();
    unregister();
  });

  it('rebuilds the run it reattaches to instead of appending a second copy of every assistant text', async () => {
    // The operator's rung-2 reload, from the daemon's own log: every assistant
    // turn rendered twice — once as the structured projection, once again as
    // bare paragraphs. The AI SDK *continues* a trailing assistant message on a
    // resume (`createStreamingUIMessageState` keeps `lastMessage`), and while
    // tool parts are keyed by `toolCallId` and data parts by `id`, text parts
    // are keyed by nothing at all, so a replay from cursor 0 appended them a
    // second time. The log names the run; the run names its message; the
    // transcript's copy of that message is dropped before the rebuild.
    installBrowserGlobals();
    const chatId = 'chat-daemon-reattach-hexnut';
    const events = hexagonalNutEvents();
    const { runId } = events[0]!;
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A daemon-placed turn reads its workspace from the daemon.');
      },
      createClient: async () =>
        clientFor(chatId, runId, {
          attach: vi.fn(async () =>
            page({
              cursor: 0,
              nextCursor: events.length,
              endCursor: events.length,
              events,
              snapshot: snapshot(chatId, runId),
            }),
          ),
        }),
    });
    const transport = new BrowserPlacementChatTransport();

    // What the page rendered while the daemon ran the turn, and what local
    // persistence therefore restored on the reload.
    const live = new Chat<MyUIMessage>({ id: chatId, transport });
    await live.resumeStream();
    const transcript = structuredClone(live.messages);
    expect(transcript).toHaveLength(1);
    expect(transcript[0]!.id).toBe(runId);
    expect(textParts(transcript[0]!)).toHaveLength(20);

    // The reload: the same log, replayed from cursor 0 over that transcript.
    // The store drops the run's own message the moment the reattach names it.
    const reloaded = new Chat<MyUIMessage>({ id: chatId, transport, messages: structuredClone(transcript) });
    const unregisterReset = applyRunResets(reloaded, chatId);
    await reloaded.resumeStream();

    expect(assistantTexts(reloaded.messages)).toEqual(assistantTexts(transcript));
    // The log's canonical user turn comes back with it, ahead of the rebuild.
    expect(reloaded.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(reloaded.messages.filter((message) => message.role === 'assistant')).toEqual(transcript);
    unregisterReset();
    unregister();
  });

  // CL-S6 (W3 CL-R13): a version-1 host clamps a cursor past its end instead of refusing it. The reader detects the
  // clamp through the ledger's read fold and refolds from the start, rather than ending the replay on a short log.
  it('should refold from the start when a read comes back clamped', async () => {
    installBrowserGlobals();
    const chatId = 'chat-daemon-reattach-clamped';
    const events = hexagonalNutFourRunEvents();
    const streamingRunId = [...new Set(events.map((event) => event.runId))].at(-1)!;
    const batchFrom = (cursor: number) =>
      page({
        cursor,
        nextCursor: Math.min(cursor + agentWireLimits.batchRows, events.length),
        endCursor: events.length,
        events: events.slice(cursor, cursor + agentWireLimits.batchRows),
        snapshot: snapshot(chatId, streamingRunId),
      });
    let clamped = false;
    const read = vi.fn(async (input: { readonly cursor: number }) => {
      if (!clamped && input.cursor > 0) {
        clamped = true;
        return page({ cursor: 10, nextCursor: 10, endCursor: 10, events: [] });
      }
      return batchFrom(input.cursor);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A daemon-placed turn reads its workspace from the daemon.');
      },
      createClient: async () => clientFor(chatId, streamingRunId, { attach: vi.fn(async () => batchFrom(0)), read }),
    });
    const transport = new BrowserPlacementChatTransport();
    const chat = new Chat<MyUIMessage>({ id: chatId, transport, messages: [] });
    const unregisterReset = applyRunResets(chat, chatId);

    await chat.resumeStream();

    expect(read.mock.calls.slice(0, 2).map(([input]) => input.cursor)).toEqual([agentWireLimits.batchRows, 0]);
    expect(assistantTexts(chat.messages)).toEqual(durableTexts(events));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('clamped'), chatId);
    warn.mockRestore();
    unregisterReset();
    unregister();
  });

  it('rebuilds every run in the log on reattach, not only the one it streams', async () => {
    /*
     * The same chat four turns later. The first fix rebuilt only the run the
     * attach snapshot named, so the *earlier* turns kept whatever earlier
     * reloads had appended to them — the operator measured the third turn's
     * texts four times and the first turn's final sentence twice on a fresh
     * snapshot of the fixed tree. One AI SDK request builds one message, so
     * the earlier runs cannot come down this stream at all; they are rebuilt
     * through the same projection and handed to the transcript's owner.
     */
    installBrowserGlobals();
    const chatId = 'chat-daemon-reattach-4runs';
    const events = hexagonalNutFourRunEvents();
    const runIds = [...new Set(events.map((event) => event.runId))];
    const streamingRunId = runIds.at(-1)!;
    // Paged exactly as the host pages it: 157 events at 16 per batch.
    const batchFrom = (cursor: number) =>
      page({
        cursor,
        nextCursor: Math.min(cursor + agentWireLimits.batchRows, events.length),
        endCursor: events.length,
        events: events.slice(cursor, cursor + agentWireLimits.batchRows),
        snapshot: snapshot(chatId, streamingRunId),
      });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A daemon-placed turn reads its workspace from the daemon.');
      },
      createClient: async () =>
        clientFor(chatId, streamingRunId, {
          attach: vi.fn(async () => batchFrom(0)),
          read: vi.fn(async (input: { readonly cursor: number }) => batchFrom(input.cursor)),
        }),
    });
    const transport = new BrowserPlacementChatTransport();
    const expectedTexts = durableTexts(events);
    expect(runIds).toHaveLength(4);
    expect(expectedTexts).toHaveLength(29);
    expect(new Set(expectedTexts).size).toBe(29);

    const reattach = async (seed: readonly MyUIMessage[]): Promise<readonly MyUIMessage[]> => {
      const chat = new Chat<MyUIMessage>({ id: chatId, transport, messages: structuredClone([...seed]) });
      const unregisterReset = applyRunResets(chat, chatId);
      await chat.resumeStream();
      unregisterReset();
      return chat.messages;
    };

    // A page with nothing cached: the whole chat comes back, four turns of it.
    const rebuilt = await reattach([]);
    expect(rebuilt.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(assistantTexts(rebuilt)).toEqual(expectedTexts);

    // A page whose local persistence already holds it: unchanged, not doubled.
    expect(await reattach(rebuilt)).toEqual(rebuilt);

    // The live shape: a transcript earlier reloads had already corrupted.
    const corrupted = rebuilt.map((message) =>
      message.role === 'assistant'
        ? { ...message, parts: [...message.parts, ...message.parts.filter((part) => part.type === 'text')] }
        : message,
    );
    expect(assistantTexts(corrupted)).toHaveLength(58);
    expect(await reattach(corrupted)).toEqual(rebuilt);

    const lossy = structuredClone(rebuilt);
    const assistant = lossy.find((message) => message.role === 'assistant');
    const text = assistant?.parts.find((part) => part.type === 'text');
    if (text?.type === 'text') {
      text.text = `${text.text.slice(0, 8)}${text.text.slice(-8)}`;
    }
    expect(lossy).not.toEqual(rebuilt);
    expect(await reattach(lossy)).toEqual(rebuilt);
    unregister();
  });

  it('should keep another device’s turns that follow this host’s runs when it reattaches (V15)', async () => {
    /*
     * Two devices wrote one chat. This host's own log holds the first two runs;
     * the other device's two runs arrived as its projected segment
     * (`events/<device>.jsonl`), so the transcript the files imply is this
     * host's runs, then the other device's. A reload's reattach replays only
     * this host's log, and cut every turn after its first message (e2e V15:
     * the browser never rendered the desktop's reply).
     */
    installBrowserGlobals();
    const chatId = 'chat-two-device-reattach-trailing';
    const events = hexagonalNutFourRunEvents();
    const runIds = [...new Set(events.map((event) => event.runId))];
    const ownRunIds = new Set(runIds.slice(0, 2));
    const own = events.filter((event) => ownRunIds.has(event.runId));
    const streamingRunId = own.at(-1)!.runId;
    const batchFrom = (cursor: number) =>
      page({
        cursor,
        nextCursor: Math.min(cursor + agentWireLimits.batchRows, own.length),
        endCursor: own.length,
        events: own.slice(cursor, cursor + agentWireLimits.batchRows),
        snapshot: snapshot(chatId, streamingRunId),
      });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A daemon-placed turn reads its workspace from the daemon.');
      },
      createClient: async () =>
        clientFor(chatId, streamingRunId, {
          attach: vi.fn(async () => batchFrom(0)),
          read: vi.fn(async (input: { readonly cursor: number }) => batchFrom(input.cursor)),
        }),
    });

    // What the chat store derives on open from both devices' segments.
    const merged = await deriveChatTranscript(events);
    expect(merged).toHaveLength(8);

    const chat = new Chat<MyUIMessage>({
      id: chatId,
      transport: new BrowserPlacementChatTransport(),
      messages: structuredClone([...merged]),
    });
    const unregisterReset = applyRunResets(chat, chatId);
    await chat.resumeStream();
    unregisterReset();

    expect(chat.messages.map((message) => message.id)).toEqual(merged.map((message) => message.id));
    expect(chat.messages).toEqual(merged);
    unregister();
  });

  it("keeps another device's later turn when a reopen reattaches to this device's settled run", async () => {
    /*
     * Two devices, one chat (desktop-e2e two-client V15). The transcript comes
     * from the chat's files, which merge every device's log; this host's log
     * holds only its own runs. Here the last turn is another device's, after
     * this host's. The reattach replaced everything from this host's first run
     * onward, so the other device's turn vanished on every reopen — and simply
     * keeping it would have let the resume write this run's reply into it.
     */
    installBrowserGlobals();
    const chatId = 'chat-two-device-reattach';
    const events = hexagonalNutFourRunEvents();
    const runIds = [...new Set(events.map((event) => event.runId))];
    const foreignRunId = runIds.at(-1)!;
    const ownRunId = runIds.at(-2)!;
    const own = events.filter((event) => event.runId !== foreignRunId);
    const merged = await deriveChatTranscript(events);
    expect(merged.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A reattach reads the log, not the workspace.');
      },
      createClient: async () =>
        clientFor(chatId, ownRunId, {
          attach: vi.fn(async () =>
            page({
              cursor: 0,
              nextCursor: own.length,
              endCursor: own.length,
              events: own,
              snapshot: snapshot(chatId, ownRunId),
            }),
          ),
        }),
    });
    const chat = new Chat<MyUIMessage>({
      id: chatId,
      transport: new BrowserPlacementChatTransport(),
      messages: structuredClone([...merged]),
    });
    const unregisterReset = applyRunResets(chat, chatId);

    await chat.resumeStream();

    expect(chat.messages).toEqual(merged);
    unregisterReset();
    unregister();
  });

  it("never writes this device's running reply into another device's later turn when a reopen reattaches", async () => {
    /*
     * The attach finds this device's run still going, and the chat's files
     * already hold another device's turns after it. The AI SDK continues the
     * transcript's trailing assistant message, which is the other device's, so
     * streaming this run would write its reply into that message. The run is
     * rebuilt in place from the log instead, and nothing streams.
     */
    installBrowserGlobals();
    const chatId = 'chat-two-device-reattach-running';
    const events = hexagonalNutFourRunEvents();
    const runIds = [...new Set(events.map((event) => event.runId))];
    const ownRunIds = new Set(runIds.slice(0, 2));
    const own = events.filter((event) => ownRunIds.has(event.runId));
    const runningRunId = runIds[1]!;
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A reattach reads the log, not the workspace.');
      },
      createClient: async () =>
        clientFor(chatId, runningRunId, {
          attach: vi.fn(async () =>
            page({
              cursor: 0,
              nextCursor: own.length,
              endCursor: own.length,
              events: own,
              snapshot: snapshot(chatId, runningRunId, 'running'),
            }),
          ),
        }),
    });
    const merged = await deriveChatTranscript(events);
    const chat = new Chat<MyUIMessage>({
      id: chatId,
      transport: new BrowserPlacementChatTransport(),
      messages: structuredClone([...merged]),
    });
    const unregisterReset = applyRunResets(chat, chatId);

    await chat.resumeStream();

    expect(chat.messages.map((message) => message.id)).toEqual(merged.map((message) => message.id));
    expect(chat.messages.at(-1)).toEqual(merged.at(-1));
    expect(chat.messages).toEqual(merged);
    unregisterReset();
    unregister();
  });

  it('replays only the outcome of a settled failed run whose transcript owner rebuilt it', async () => {
    installBrowserGlobals();
    const chatId = 'chat-reopen-failed-owned';
    const runId = 'run-reopen-failed-owned';
    const base = {
      version: 1,
      leaderEpoch: 'leader-reopen-failed',
      recordedAt: '2026-09-01T00:00:01.000Z',
      runId,
    } as const;
    const events = [
      { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted' },
      {
        ...base,
        sequence: 2,
        type: 'message.appended',
        message: { id: 'user-reopen-failed', role: 'user', content: 'Build it.' },
      },
      { ...base, sequence: 3, type: 'run.lifecycle', state: 'running' },
      {
        ...base,
        sequence: 4,
        type: 'run.lifecycle',
        state: 'failed',
        detail: { message: 'The provider refused this turn.', code: 'PROVIDER_REFUSED', status: 400 },
      },
    ] satisfies AgentLogEvent[];
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A reattach reads the log, not the workspace.');
      },
      createClient: async () =>
        clientFor(chatId, runId, {
          attach: vi.fn(async () =>
            page({
              cursor: 0,
              nextCursor: events.length,
              endCursor: events.length,
              events,
              snapshot: { chatId, runId, turnId: 'user-reopen-failed', state: 'failed', messages: [] } as const,
            }),
          ),
        }),
    });
    const rebuilt: MyUIMessage[] = [];
    const unregisterReset = registerAgentHostRunReset(chatId, (rebuild) => {
      rebuilt.push(...rebuild([]));
    });

    const stream = await new BrowserPlacementChatTransport().reconnectToStream({ chatId, metadata: undefined });
    const chunks: UIMessageChunk[] = [];
    const reader = stream!.getReader();
    const collect = async (): Promise<void> => {
      const next = await reader.read();
      if (!next.done) {
        chunks.push(next.value);
        await collect();
      }
    };
    await collect();

    expect(chunks.map((chunk) => chunk.type)).toEqual(['error']);
    // The run's message is rebuilt by its owner, as its `start` chunk used to build it.
    expect(rebuilt.map((message) => [message.id, message.role])).toEqual([
      ['user-reopen-failed', 'user'],
      [runId, 'assistant'],
    ]);
    unregisterReset();
    unregister();
  });

  it('should fail a submit whose prior stream never settles within the deadline', async () => {
    installBrowserGlobals();
    vi.useFakeTimers();
    try {
      const chatId = 'chat-prior-never-settles';
      /* Two streams for one chat serialise through the same settlement. This
         reattach never gets its log back, and the submit behind it used to wait
         on it forever, silently, with the composer stuck on "Planning next
         moves…". */
      const wedged = clientFor(chatId, 'run-wedged', {
        attach: vi.fn(
          async () =>
            new Promise<never>(() => {
              /* The log this reattach asked for never comes back. */
            }),
        ),
      });
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => ({
          projectId: 'project-prior-settlement',
          backend: 'opfs',
          providerBasePath: 'project-prior-settlement',
        }),
        createClient: async () => wedged,
      });
      const transport = new BrowserPlacementChatTransport();
      // The reattach that never comes back, holding this chat's settlement.
      await transport.sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: 'user-wedged', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId: 'run-wedged', trigger: 'submit' }),
      });

      const chat = new Chat<MyUIMessage>({ id: chatId, transport });
      const sending = chat.sendMessage(
        { id: 'user-after-wedge', role: 'user', parts: [{ type: 'text', text: 'And again.' }] },
        { body: browserBody({ runId: 'run-after-wedge', trigger: 'submit' }) },
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await sending;

      expect(chat.status).toBe('error');
      expect(chat.error).toMatchObject({ code: 'BROWSER_HOST_SETTLEMENT_TIMEOUT' });
      unregister();
    } finally {
      vi.useRealTimers();
    }
  });

  /* W8 TS-S6, D6 and D7 deleted: no clock ends the wait for a settlement. A follow that stops for a reason of its
   * own (the host died) can deliver no row, so it frees the chat; the host that reconciles the attempt appends the
   * row for the next attach. */
  it('should free the chat when the follow ends before the settlement row arrives', async () => {
    installBrowserGlobals();
    const chatId = 'chat-follow-ends';
    let listener: Follow[1] | undefined;
    let ended: Follow[2];
    const lifecycleOnly = clientFor(chatId, 'run-unsettled', {
      start: vi.fn(async (input: Parameters<AgentHostClient['start']>[0]) => {
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-unsettled',
          sequence: 1,
          recordedAt: '2026-09-01T00:00:01.000Z',
          runId: input.runId,
          type: 'run.lifecycle',
          state: 'completed',
        });
        return snapshot(chatId, input.runId);
      }),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1], onEnded: Follow[2]) => {
        listener = next;
        ended = onEnded;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-follow-ends',
        backend: 'opfs',
        providerBasePath: 'project-follow-ends',
      }),
      createClient: async () => lifecycleOnly,
    });
    const transport = new BrowserPlacementChatTransport();
    const send = async (runId: string): Promise<ReadableStream<UIMessageChunk>> =>
      transport.sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: `user-${runId}`, role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });

    try {
      const unsettled = await send('run-unsettled');
      await drain(unsettled.getReader());
      await Promise.resolve();
      /* Held: the row is still coming. */
      expect(lifecycleOnly.close).not.toHaveBeenCalled();

      ended?.();

      await vi.waitFor(() => {
        expect(lifecycleOnly.close).toHaveBeenCalledOnce();
      });
      // And the chat is free: the next turn runs rather than inheriting the wait.
      const next = await send('run-after-unsettled');
      ended?.();
      await drain(next.getReader());
      expect(lifecycleOnly.start).toHaveBeenCalledTimes(2);
    } finally {
      unregister();
    }
  });
});

/* W9: a durable turn references its attachments by content-addressed path. The
   bytes are already on disk when the part is built, so the log row names them
   instead of re-inlining base64 on every retry, edit and reattach (D14). */
describe('BrowserPlacementChatTransport attachments', () => {
  const attachmentHash = 'c'.repeat(64);

  /** Admit one submit turn and hand back the message the host was started with. */
  const admittedMessage = async (
    chatId: string,
    parts: MyUIMessage['parts'],
  ): Promise<Record<string, unknown> | undefined> => {
    installBrowserGlobals();
    const runId = `run-${chatId}`;
    const transport = new BrowserPlacementChatTransport();
    const commands: Array<Record<string, unknown>> = [];
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: `project-${chatId}`, backend: 'opfs', providerBasePath: chatId }),
      createClient: async () =>
        clientFor(chatId, runId, {
          start: vi.fn(async (input: Parameters<AgentHostClient['start']>[0]) => {
            commands.push({ ...input });
            return snapshot(input.chatId, input.runId, 'completed');
          }),
        }),
    });
    try {
      const stream = await transport.sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: `user-${chatId}`, role: 'user', parts }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      await drain(stream.getReader());
    } finally {
      unregister();
    }
    const message = commands[0]?.['message'];
    return isRecord(message) ? message : undefined;
  };

  it('should record an attachment image part as a file-ref block', async () => {
    const message = await admittedMessage('chat-attachment-image', [
      { type: 'text', text: 'Match this.' },
      {
        type: 'file',
        mediaType: 'image/png',
        url: `attachments/${attachmentHash}.png`,
        providerMetadata: { common: { byteLength: 1234 } },
      },
    ]);

    expect(message?.['content']).toEqual([
      { type: 'text', text: 'Match this.' },
      { type: 'file-ref', path: `attachments/${attachmentHash}.png`, mimeType: 'image/png', byteLength: 1234 },
    ]);
  });

  it('should record an attachment document part as a file-ref block carrying its filename', async () => {
    const message = await admittedMessage('chat-attachment-pdf', [
      {
        type: 'file',
        mediaType: 'application/pdf',
        filename: 'bracket-spec.pdf',
        url: `attachments/${attachmentHash}.pdf`,
        providerMetadata: { common: { byteLength: 20_480 } },
      },
    ]);

    expect(message?.['content']).toEqual([
      {
        type: 'file-ref',
        path: `attachments/${attachmentHash}.pdf`,
        mimeType: 'application/pdf',
        byteLength: 20_480,
        filename: 'bracket-spec.pdf',
      },
    ]);
  });

  it('should still record a legacy data URL part as an inline image block', async () => {
    const message = await admittedMessage('chat-attachment-legacy', [
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' },
    ]);

    expect(message?.['content']).toEqual([{ type: 'image', mimeType: 'image/png', data: 'AAAA' }]);
  });

  it('should refuse a file part whose URL is neither an attachment nor a data URL', async () => {
    installBrowserGlobals();
    const chatId = 'chat-attachment-unknown-url';
    const runId = `run-${chatId}`;
    const transport = new BrowserPlacementChatTransport();
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: `project-${chatId}`, backend: 'opfs', providerBasePath: chatId }),
      createClient: async () => clientFor(chatId, runId),
    });
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      messages: [
        {
          id: 'user-unknown-url',
          role: 'user',
          parts: [{ type: 'file', mediaType: 'image/png', url: 'https://example.invalid/cat.png' }],
        },
      ],
      abortSignal: undefined,
      body: browserBody({ runId, trigger: 'submit' }),
    });

    await expect(drain(stream.getReader())).rejects.toThrow('https://example.invalid/cat.png');
    unregister();
  });

  it('should refuse a legacy data URL that is not an image rather than record it as one (G8)', async () => {
    installBrowserGlobals();
    const chatId = 'chat-attachment-legacy-pdf';
    const runId = `run-${chatId}`;
    const transport = new BrowserPlacementChatTransport();
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: `project-${chatId}`, backend: 'opfs', providerBasePath: chatId }),
      createClient: async () => clientFor(chatId, runId),
    });
    const stream = await transport.sendMessages({
      chatId,
      trigger: 'submit-message',
      messageId: undefined,
      messages: [
        {
          id: 'user-legacy-pdf',
          role: 'user',
          parts: [{ type: 'file', mediaType: 'application/pdf', url: 'data:application/pdf;base64,JVBERg==' }],
        },
      ],
      abortSignal: undefined,
      body: browserBody({ runId, trigger: 'submit' }),
    });

    await expect(drain(stream.getReader())).rejects.toThrow('data:application/pdf;base64,JVBERg==');
    unregister();
  });

  /* P29: a draft hydrated from a record carries a file part with no size — the
     reload-then-send path. The reference is still recorded; only the optional
     field is absent. */
  it('should record an attachment part that names no byte length, without the field', async () => {
    const message = await admittedMessage('chat-attachment-no-size', [
      { type: 'file', mediaType: 'image/png', url: `attachments/${attachmentHash}.png` },
    ]);

    expect(message?.['content']).toEqual([
      { type: 'file-ref', path: `attachments/${attachmentHash}.png`, mimeType: 'image/png' },
    ]);
  });
  /* R7: the consumer cancels the readable side the moment it reads the error
     chunk this stream wrote, which errors the transform's writable side. The
     close that followed then rejected into the settled-stream branch, and the
     console carried "Cannot close a ERRORED writable stream" for a failure the
     card had already reported. */
  it('should not log a settled-stream failure when the reader cancels on the error chunk', async () => {
    installBrowserGlobals();
    const chatId = 'chat-errored-writer-close';
    const runId = 'run-errored-writer-close';
    let listener: Parameters<AgentHostClient['subscribe']>[1] | undefined;
    /* Held open so the cancel lands while the stream body is still running,
       which is the field ordering: the SDK reads the error chunk and drops the
       reader long before the body reaches its close. */
    const started = Promise.withResolvers<void>();
    const failing = clientFor(chatId, runId, {
      start: vi.fn(async () => {
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-errored-close',
          sequence: 1,
          recordedAt: '2026-09-01T00:00:01.000Z',
          runId,
          type: 'run.lifecycle',
          state: 'failed',
          detail: {
            message: 'server_error: The server had an error while processing your request.',
            code: 'PROVIDER_UNAVAILABLE',
            status: 200,
          },
        });
        await started.promise;
        return { chatId, runId, turnId: `message-${chatId}`, state: 'failed', messages: [] } as const;
      }),
      subscribe: vi.fn((_input: Follow[0], next: Follow[1]) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-errored-close',
        backend: 'opfs',
        providerBasePath: 'project-errored-close',
      }),
      createClient: async () => failing,
    });
    const logged: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(...args);
    });

    try {
      const stream = await new BrowserPlacementChatTransport().sendMessages({
        chatId,
        trigger: 'submit-message',
        messageId: undefined,
        messages: [{ id: 'user-errored-close', role: 'user', parts: [{ type: 'text', text: 'Build it.' }] }],
        abortSignal: undefined,
        body: browserBody({ runId, trigger: 'submit' }),
      });
      const reader = stream.getReader();
      const readUntilFailure = async (): Promise<UIMessageChunk | undefined> => {
        const next = await reader.read();
        if (next.done) {
          return undefined;
        }
        return next.value.type === 'error' ? next.value : readUntilFailure();
      };
      const failureChunk = await readUntilFailure();
      expect(failureChunk).toMatchObject({ type: 'error' });

      // What the AI SDK does with an error chunk: stop reading and drop the
      // reader, which errors the writable side the body still holds.
      await reader.cancel();
      started.resolve();
      await vi.waitFor(() => {
        expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'failed' });
      });
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 20);
      });

      expect(
        logged.filter((entry) => typeof entry === 'string' && entry.includes('stream failed after it settled')),
      ).toEqual([]);
    } finally {
      consoleError.mockRestore();
      unregister();
      retireBrowserAgentHostRun(chatId, runId);
    }
  });
});
