import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chat } from '@ai-sdk/react';
import type { UIMessageChunk } from 'ai';
import { parseLogEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';
import { AgentHostWorkerError } from '#services/agent-host-client.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  BrowserPlacementChatTransport,
  clearBrowserAgentHostRun,
  getBrowserAgentHostRun,
  getHostFinalizedTurns,
  isBrowserAgentHostRunResumable,
  persistBrowserTurnSettlement,
  recordHostTurnSettlement,
  registerAgentHost,
  registerAgentHostRunReset,
  requestBrowserAgentHostResume,
  resolveBrowserAgentHostInterrupt,
  subscribeHostTurnSettlements,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { HostTurnSettlement } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { agentHostTailBatchLimit } from '#workers/agent-host.contract.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import hexagonalNutLog from '#services/__fixtures__/daemon-reattach-hexnut.jsonl?raw';
import hexagonalNutFourRunLog from '#services/__fixtures__/daemon-reattach-hexnut-4runs.jsonl?raw';

type AgentLogEvent = Parameters<Parameters<AgentHostClient['subscribe']>[0]>[1];
type AgentLiveEvent = Parameters<Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0]>[1];

const snapshot = (chatId: string, runId: string, state: 'running' | 'completed' | 'cancelled' = 'completed') =>
  ({
    chatId,
    runId,
    turnId: `message-${chatId}`,
    state,
    messages: [],
  }) satisfies Awaited<ReturnType<AgentHostClient['start']>>;

const clientFor = (chatId: string, runId: string, overrides: Partial<AgentHostClient> = {}) => {
  let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
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
    attach: vi.fn(async () => ({ cursor: 0, nextCursor: 0, endCursor: 0, events: [] })),
    tail: vi.fn(async () => ({ cursor: 0, nextCursor: 0, endCursor: 0, events: [] })),
    subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
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
    let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
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
      subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
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
    clearBrowserAgentHostRun(chatId);
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
      markRunId: async () => undefined,
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
    let durableListener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
    let liveListener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0] | undefined;
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
      subscribe: vi.fn((listener: Parameters<AgentHostClient['subscribe']>[0]) => {
        durableListener = listener;
        return () => {
          durableListener = undefined;
        };
      }),
      subscribeLive: vi.fn((listener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0]) => {
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
      markRunId: async () => undefined,
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
    let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
    const client = clientFor(chatId, runId, {
      subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
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
      attach: vi.fn(async () => ({
        cursor: 0,
        nextCursor: events.length,
        endCursor: events.length,
        events,
        snapshot: snapshot(chatId, runId),
      })),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A host-placed turn reads its workspace from the daemon.');
      },
      markRunId: async () => undefined,
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

  it('keeps the host lease alive when browser-root settlement follows completed lifecycle', async () => {
    installBrowserGlobals();
    const chatId = 'chat-late-turn-settlement';
    const runId = 'run-late-turn-settlement';
    let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
    const recordSettlement = vi.fn(async () => undefined);
    const client = clientFor(chatId, runId, {
      recordSettlement,
      start: vi.fn(async () => {
        listener?.(chatId, {
          version: 1,
          leaderEpoch: 'leader-late-settlement',
          sequence: 1,
          recordedAt: '2026-09-14T00:00:01.000Z',
          runId,
          type: 'run.lifecycle',
          state: 'completed',
        });
        return snapshot(chatId, runId);
      }),
      subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
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
      expect(await persistBrowserTurnSettlement(finalized)).toBe(true);
      expect(recordSettlement).toHaveBeenCalledWith(finalized);
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

  /* G-REV-MODE: the host that runs the turn is the host that records it, so
     the composer's revision selection has to leave the page with the admission.
     The body's `execution` is where `createRunBody` puts it. */
  it("carries the turn's revision mode from the durable body to the host's start command", async () => {
    installBrowserGlobals();
    const chatId = 'chat-revision-mode';
    const runId = 'run-revision-mode';
    const transport = new BrowserPlacementChatTransport();
    const commands: Array<Record<string, unknown>> = [];
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A Tau Host turn reads its workspace from the daemon.');
      },
      markRunId: async () => undefined,
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

    expect(commands.find((command) => command['type'] === 'start')).toMatchObject({
      type: 'start',
      runId,
      mode: 'candidate',
      baseRevisionId: 'rev:base-1',
    });
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
      markRunId: async () => undefined,
    });
    const transport = new BrowserPlacementChatTransport();

    // A reload drops the in-memory run binding. The API never held this chat's
    // runs: asking it answered 503 and left the chat stuck "reattaching".
    const stream = await transport.reconnectToStream({ chatId, metadata: undefined });
    await expect(stream!.getReader().read()).resolves.toEqual({ done: true, value: undefined });

    expect(getBrowserAgentHostRun(chatId)).toBeUndefined();
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
    const markRunId = vi.fn(async () => undefined);
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () => ({
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
      })),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-reload-failed',
        backend: 'opfs',
        providerBasePath: 'project-reload-failed',
      }),
      createClient: async () => client,
      markRunId,
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
    expect(markRunId).toHaveBeenCalledWith(runId);
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
      attach: vi.fn(async () => ({ cursor: 0, nextCursor: 4, endCursor: 4, events, snapshot: refusedSnapshot })),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refused-credit',
        backend: 'opfs',
        providerBasePath: 'project-refused-credit',
      }),
      createClient: async () => client,
      markRunId: async () => undefined,
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
    expect(isBrowserAgentHostRunResumable(chatId)).toBe(true);
    requestBrowserAgentHostResume(chatId);
    await drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader());

    expect(client.resume).toHaveBeenCalledWith(chatId);
    // The turn is continued, never re-admitted: `start` is what rewinds history.
    expect(client.start).not.toHaveBeenCalled();
    // One-shot: the next reattach this caller did not ask for spends nothing.
    await drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader());

    expect(client.resume).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('leaves a non-retryable failed run unresumable even when a resume was asked for', async () => {
    installBrowserGlobals();
    const chatId = 'chat-refused-catalog';
    const runId = 'run-refused-catalog';
    const client = clientFor(chatId, runId, {
      attach: vi.fn(async () => ({
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
      })),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-refused-catalog',
        backend: 'opfs',
        providerBasePath: 'project-refused-catalog',
      }),
      createClient: async () => client,
      markRunId: async () => undefined,
    });
    const transport = new BrowserPlacementChatTransport();

    requestBrowserAgentHostResume(chatId);
    await drain((await transport.reconnectToStream({ chatId, metadata: undefined }))!.getReader());

    expect(client.resume).not.toHaveBeenCalled();
    expect(isBrowserAgentHostRunResumable(chatId)).toBe(false);
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
    const attach = vi.fn(async () => ({
      cursor: 0,
      nextCursor: 1,
      endCursor: 2,
      events: [running],
      snapshot: { chatId, runId, turnId: `message-${chatId}`, state: 'running', messages: [] } as const,
    }));
    const tail = vi.fn(async () => ({ cursor: 1, nextCursor: 2, endCursor: 2, events: [appended] }));
    let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
    const client = clientFor(chatId, runId, {
      attach,
      tail,
      subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
    });
    const transport = new BrowserPlacementChatTransport();

    const stream = await transport.reconnectToStream({ chatId, metadata: undefined });
    const reader = stream!.getReader();
    // The log tail is non-terminal: the resume stays attached to the live run
    // (the host takes leadership over and resumes it) instead of ending here.
    await vi.waitFor(() => {
      expect(tail).toHaveBeenCalledOnce();
    });
    expect(getBrowserAgentHostRun(chatId)).toMatchObject({ runId, state: 'running' });
    listener!(chatId, completed);
    await drain(reader);

    expect(attach).toHaveBeenCalledWith({ chatId, cursor: 0, limit: 16 });
    expect(tail).toHaveBeenCalledWith({ chatId, cursor: 1, limit: 16 });
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
        markRunId: async () => undefined,
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
      markRunId: async () => undefined,
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
      markRunId: async () => undefined,
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

  it('maps continue to subscribe-first bounded follower attach without executing resume', async () => {
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
    const attach = vi.fn(async () => ({
      cursor: 0,
      nextCursor: 1,
      endCursor: 2,
      events: [running],
    }));
    const tail = vi.fn(async () => ({ cursor: 1, nextCursor: 2, endCursor: 2, events: [completed] }));
    const subscribe = vi.fn(() => () => undefined);
    const client = clientFor(chatId, runId, { attach, tail, subscribe });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-follower',
        backend: 'opfs',
        providerBasePath: 'project-follower',
      }),
      createClient: async () => client,
      markRunId: async () => undefined,
    });
    const transport = new BrowserPlacementChatTransport();
    transport.bindRun(chatId, runId);

    const stream = await transport.reconnectToStream({ chatId });
    expect(stream).not.toBeNull();
    const reader = stream!.getReader();
    await drain(reader);

    expect(subscribe.mock.invocationCallOrder[0]).toBeLessThan(attach.mock.invocationCallOrder[0]!);
    expect(attach).toHaveBeenCalledWith({ chatId, cursor: 0, limit: 16 });
    expect(tail).toHaveBeenCalledWith({ chatId, cursor: 1, limit: 16 });
    expect(client.resume).not.toHaveBeenCalled();
    unregister();
  });

  it.each(['completed', 'running'] as const)(
    'replays a %s attach snapshot before concurrent frames',
    async (snapshotState) => {
      installBrowserGlobals();
      const chatId = 'chat-attach-race';
      const runId = 'run-attach-race';
      let liveListener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0] | undefined;
      let durableListener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
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
        subscribe: (listener) => {
          durableListener = listener;
          return () => {
            durableListener = undefined;
          };
        },
        subscribeLive: (listener) => {
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
          if (snapshotState === 'running') {
            durableListener?.(chatId, events[3]!);
          }
          const attachedEvents = snapshotState === 'running' ? events.slice(0, 3) : events;
          return {
            cursor: 0,
            nextCursor: attachedEvents.length,
            endCursor: attachedEvents.length,
            events: attachedEvents,
            snapshot: { ...snapshot(chatId, runId), state: snapshotState },
          };
        },
      });
      const unregister = registerAgentHost(chatId, {
        projectStorage: async () => ({ projectId: 'project-race', backend: 'opfs', providerBasePath: 'project-race' }),
        createClient: async () => client,
        markRunId: async () => undefined,
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
    let durableListener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
    let liveListener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0] | undefined;
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
      subscribe: vi.fn((listener: Parameters<AgentHostClient['subscribe']>[0]) => {
        durableListener = listener;
        return () => {
          durableListener = undefined;
        };
      }),
      subscribeLive: vi.fn((listener: Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0]) => {
        liveListener = listener;
        return () => {
          liveListener = undefined;
        };
      }),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({ projectId: 'project-live', backend: 'opfs', providerBasePath: 'project-live' }),
      createClient: async () => client,
      markRunId: async () => undefined,
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
      attach: vi.fn(async () => ({
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
      })),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-snapshot-terminal',
        backend: 'opfs',
        providerBasePath: 'project-snapshot-terminal',
      }),
      createClient: async () => client,
      markRunId: async () => undefined,
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
      attach: vi.fn(async () => ({
        cursor: 0,
        nextCursor: events.length,
        endCursor: events.length,
        events,
        snapshot: snapshot(chatId, runId),
      })),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => ({
        projectId: 'project-unattended',
        backend: 'opfs',
        providerBasePath: 'project-unattended',
      }),
      createClient: async () => client,
      markRunId: async () => undefined,
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
      .mockResolvedValueOnce({ cursor: 0, nextCursor: 0, endCursor: 0, events: [] })
      .mockResolvedValueOnce({ cursor: 0, nextCursor: 1, endCursor: 1, events: [completed] });
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
      markRunId: async () => undefined,
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
      markRunId: async () => undefined,
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
   * A stopped turn closed its writer the moment the abort landed, so the
   * settlement the page produced a beat later had nowhere durable to go: the
   * run's outcome depended on whether the revision root answered before the
   * stream closed (F6). The stream that drove the admission holds its writer
   * open for the settlement of the run it admitted.
   */
  it('keeps the settlement writer open for a run whose turn was stopped', async () => {
    installBrowserGlobals();
    const chatId = 'chat-cancel-settlement';
    const runId = 'run-cancel-settlement';
    const completion = Promise.withResolvers<Awaited<ReturnType<AgentHostClient['start']>>>();
    const recordSettlement = vi.fn(async () => undefined);
    const client = clientFor(chatId, runId, {
      recordSettlement,
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
      markRunId: async () => undefined,
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
      expect(await persistBrowserTurnSettlement(failed)).toBe(true);
      expect(recordSettlement).toHaveBeenCalledWith(failed);
      recordHostTurnSettlement(failed);
      await vi.waitFor(() => {
        expect(client.close).toHaveBeenCalledOnce();
      });
    } finally {
      unregister();
    }
  });

  /* The same run of the same invariant for a refusal: `start` throws, the
   * stream aborts, and the turn is settled as failed by its owner afterwards. */
  it('keeps the settlement writer open for a run the host refused', async () => {
    installBrowserGlobals();
    const chatId = 'chat-refusal-settlement';
    const runId = 'run-refusal-settlement';
    const recordSettlement = vi.fn(async () => undefined);
    const client = clientFor(chatId, runId, {
      recordSettlement,
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
      markRunId: async () => undefined,
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
      expect(await persistBrowserTurnSettlement(failed)).toBe(true);
      expect(recordSettlement).toHaveBeenCalledWith(failed);
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
   * is the only authority that knows, and it says so — `admit is refused`
   * because the chat has a running run. Ending the turn on that banner made
   * *navigate away mid-turn and back* a dead chat; the stream waits for the
   * live run to end and admits once, which is what the person asked for.
   */
  it('waits out a live run the host refuses to admit over, then admits once', async () => {
    installBrowserGlobals();
    const chatId = 'chat-live-refusal';
    const runId = 'run-live-refusal';
    let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
    let refusals = 0;
    const client = clientFor(chatId, runId, {
      start: vi.fn(async (input: Parameters<AgentHostClient['start']>[0]) => {
        refusals += 1;
        if (refusals === 1) {
          throw new AgentHostWorkerError(
            'RUN_ADMISSION_CONFLICT',
            `Chat ${chatId} has a running run; admit is refused.`,
          );
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
      attach: vi.fn(async () => ({
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
        snapshot: snapshot(chatId, 'run-previous', 'running'),
      })),
      subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
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

  it('resolves an approval on the attached run without creating another admission', async () => {
    installBrowserGlobals();
    const chatId = 'chat-browser-approval';
    const runId = 'run-browser-approval';
    const completion = Promise.withResolvers<Awaited<ReturnType<AgentHostClient['start']>>>();
    let listener: Parameters<AgentHostClient['subscribe']>[0] | undefined;
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
      subscribe: vi.fn((next: Parameters<AgentHostClient['subscribe']>[0]) => {
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
      markRunId: async () => undefined,
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
          attach: vi.fn(async () => ({
            cursor: 0,
            nextCursor: events.length,
            endCursor: events.length,
            events,
            snapshot: snapshot(chatId, runId),
          })),
        }),
      markRunId: async () => undefined,
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
    const batchFrom = (cursor: number) => ({
      cursor,
      nextCursor: Math.min(cursor + agentHostTailBatchLimit, events.length),
      endCursor: events.length,
      events: events.slice(cursor, cursor + agentHostTailBatchLimit),
      snapshot: snapshot(chatId, streamingRunId),
    });
    const unregister = registerAgentHost(chatId, {
      projectStorage: async () => {
        throw new Error('A daemon-placed turn reads its workspace from the daemon.');
      },
      createClient: async () =>
        clientFor(chatId, streamingRunId, {
          attach: vi.fn(async () => batchFrom(0)),
          tail: vi.fn(async (input: { readonly cursor: number }) => batchFrom(input.cursor)),
        }),
      markRunId: async () => undefined,
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
      markRunId: async () => undefined,
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
      markRunId: async () => undefined,
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
      markRunId: async () => undefined,
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
});
