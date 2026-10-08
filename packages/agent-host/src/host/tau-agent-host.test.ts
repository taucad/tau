import { describe, expect, it, vi } from 'vitest';
import type {
  InvocationFunding,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import { appendChatRows, createTauAgentHost } from '#host/tau-agent-host.js';
import { chatRunState, emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { LogRowBody } from '#log/chat-ledger.js';
import { isResumableRunFailure } from '#log/resumable.js';
import lifecycleTable from '#log/run-lifecycle.legality.json' with { type: 'json' };
import type { ExternalAgentPort } from '#host/external-agent.js';
import type { TauAgentHost } from '#host/tau-agent-host.js';
import { reduceEventLog } from '#log/reducer.js';
import { ScriptedParityModelTransport, scriptedParityResponses } from '#host/scripted-model.fixture.js';
import type { ScriptedParityResponse } from '#host/scripted-model.fixture.js';
import type { AgentLogEvent, JsonObject, ProviderMessage } from '#log/event-types.js';
import { GatewayModelTransportError } from '#transport/gateway-model-transport.js';
import type { GatewayModelErrorCode } from '#transport/gateway-model-transport.js';
import type { HostCompactionError } from '#harness/compaction.js';
import { fundedFacet } from '#harness/harness.fixture.js';

import {
  tauInternal,
  createMemoryLogFile,
  seedLog,
  readLog,
  completedFirstTurn,
  settlementOnlySecondRun,
  tools,
  hostOptions,
  fakePlacement,
} from '#host/tau-agent-host.fixture.js';
import type { SeededLogEvent } from '#host/tau-agent-host.fixture.js';

/**
 * M1's append of one settlement row (`appendChatRows`, the host's only writer of `turn.*` rows; W8 M2) under a new
 * term, over a log no host holds open.
 */
const appendSettlement = async (
  file: ReturnType<typeof createMemoryLogFile>,
  runId: string,
  body: LogRowBody & { readonly attempt?: number },
): Promise<void> => {
  const log = await file.open();
  try {
    await appendChatRows({
      chatId: 'chat',
      log,
      ledger: foldChatLedger(emptyChatLedger, await log.read()),
      leaderEpoch: 'epoch-settle',
      recordedAt: new Date(Date.UTC(2026, 8, 2)).toISOString(),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stated attempt rides the body (N4), as M1 writes it.
      rows: [{ runId, body: body as LogRowBody }],
    });
  } finally {
    await log.close();
  }
};

/** An orphaned first turn: admitted and running, with no driver, which opening abandons (RA-R9). */
const orphanedFirstTurn: readonly SeededLogEvent[] = completedFirstTurn.slice(0, 3);

describe('createTauAgentHost', () => {
  it('should reject agent-authored turn-change proof', async () => {
    const file = createMemoryLogFile();
    let outcome: unknown;
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('No Tau model call expected');
          },
        },
      }),
      externalRunners: {
        acp: {
          list: () => ['stub'],
          run: async (turn) => {
            try {
              await turn.append([
                {
                  type: 'turn.changed',
                  turnId: 'turn-1',
                  chatId: turn.chatId,
                  attempt: turn.attempt,
                  checkoutId: 'checkout-live',
                },
              ]);
              outcome = 'accepted';
            } catch (error) {
              outcome = error;
            }
            return undefined;
          },
        },
      },
    });
    try {
      await host.admit({
        chatId: 'chat',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1', role: 'user', content: 'Only talk' },
        config: { systemPrompt: '', toolChoice: 'none', agent: { kind: 'acp', id: 'stub' } },
      });
      await vi.waitFor(() => {
        expect(outcome).toMatchObject({ code: 'FRAME_UNREADABLE' });
      });
      const rows = await readLog(file);
      expect(rows.some((row) => row.type === 'turn.changed')).toBe(false);
    } finally {
      await host.close();
    }
  });

  it('should cancel before the first model request while invocation preparation is pending', async () => {
    const file = createMemoryLogFile();
    const preparing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const stream = vi.fn(async function* (): AsyncGenerator<ModelStreamEvent> {
      yield { type: 'completed', stopReason: 'stop' };
    });
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: async () => {
          const log = await file.open();
          return {
            ...log,
            append: async (event: AgentLogEvent) => {
              if (event.type === 'model.invocation-prepared') {
                preparing.resolve();
                await release.promise;
              }
              return log.append(event);
            },
          };
        },
        transport: { funding: fundedFacet(), stream },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'pre-request-cancel',
      }),
    );
    const admission = host.admit({
      chatId: 'chat-pre-request-cancel',
      runId: 'run-pre-request-cancel',
      trigger: 'submit',
      message: { id: 'turn-pre-request-cancel', role: 'user', content: 'Go.' },
    });
    await preparing.promise;
    const cancellation = host.cancel({ runId: 'run-pre-request-cancel' });
    release.resolve();
    await Promise.all([admission, cancellation]);
    expect(stream).not.toHaveBeenCalled();
    await expect(host.snapshot('chat-pre-request-cancel')).resolves.toMatchObject({ state: 'cancelled' });
    const events = await readLog(file);
    expect(events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({
      state: 'cancelled',
    });
    await host.close();
  });

  it('publishes live deltas before their durable assistant completion', async () => {
    const order: string[] = [];
    const file = createMemoryLogFile();
    const opened = await file.open();
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: async () => ({
          append: async (event) => {
            if (event.type === 'message.appended' && event.message.role === 'assistant') {
              order.push(`durable:${event.message.id}`);
            }
            return opened.append(event);
          },
          read: opened.read,
          readBatch: opened.readBatch,
          messages: opened.messages,
          historyIntact: opened.historyIntact,
          anomalies: opened.anomalies,
          close: opened.close,
        }),
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'text-delta', text: 'hello' };
            yield { type: 'thinking-delta', text: 'because' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'live',
      }),
      onLiveEvent: (event) => {
        order.push(`${event.type}:${event.messageId}`);
      },
    });

    await host.admit({
      chatId: 'chat-live',
      runId: 'run-live',
      trigger: 'submit',
      message: { id: 'turn-live', role: 'user', content: 'Stream.' },
    });

    expect(order).toEqual([
      'text-start:live-0',
      'text-delta:live-0',
      'text-end:live-0',
      'thinking-start:live-0',
      'thinking-delta:live-0',
      'thinking-end:live-0',
      'durable:live-0',
    ]);
    await host.close();
  });

  it('applies the complete admission config and enforces tool selection in the host', async () => {
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: null, isError: false }));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            yield { type: 'text-delta', text: 'configured' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'config',
      }),
    );

    await host.admit({
      chatId: 'chat-config',
      runId: 'run-config',
      trigger: 'submit',
      message: { id: 'turn-config', role: 'user', content: 'Configured run.' },
      config: {
        systemPrompt: 'admission prompt',
        systemPromptBlocks: [
          { type: 'text', text: 'static' },
          { type: 'text', text: 'workspace' },
          { type: 'text', text: 'dynamic' },
        ],
        model: { id: 'retry-model', providerKind: 'openai', contextWindow: 64_000 },
        toolChoice: 'none',
        allowedTools: ['read_file'],
        snapshot: { activeFile: { path: 'main.ts', name: 'main.ts' } },
        clientContext: { memory: { 'AGENTS.md': 'workspace memory' } },
        contextMessages: [
          { id: 'snapshot-run-config', role: 'user', content: '<system-reminder>snapshot</system-reminder>' },
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ modelId: 'retry-model', systemPrompt: 'static\n\nworkspace\n\ndynamic' });
    expect(requests[0]?.tools).toEqual([]);
    expect(requests[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tau:client-memory' }),
        expect.objectContaining({ id: 'snapshot-run-config' }),
      ]),
    );
    const log = await file.open();
    const events = await log.read();
    expect(events.find((event) => event.type === 'turn.history-projection-committed')).toMatchObject({
      context: {
        model: { id: 'retry-model', providerKind: 'openai', contextWindow: 64_000 },
        toolChoice: 'none',
        allowedTools: ['read_file'],
        snapshot: { activeFile: { path: 'main.ts', name: 'main.ts' } },
      },
    });
    expect(invoke).not.toHaveBeenCalled();
    await host.close();
  });

  it.each([
    ['INSUFFICIENT_CREDIT', 402],
    ['MODEL_NOT_IN_CATALOG', 400],
    ['RATE_LIMITED', 429],
    ['FUNDED_OPERATION_LIMIT', 429],
    ['FUNDED_HELPER_LIMIT', 429],
    ['BILLING_RECOVERY_UNAVAILABLE', 503],
    ['MODEL_ROUTE_PAUSED', 503],
    ['BILLING_ACCOUNT_RESTRICTED', 403],
  ] as const)('retains %s as a typed failed-run snapshot', async (code, status) => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => ({
            [Symbol.asyncIterator]: () => ({
              next: async (): Promise<IteratorResult<ModelStreamEvent>> => {
                throw new GatewayModelTransportError({ code, status, message: `fixture ${code}` });
              },
            }),
          }),
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: `failure-${code}`,
      }),
    );

    await host.admit({
      chatId: `chat-${code}`,
      runId: `run-${code}`,
      trigger: 'submit',
      message: { id: `turn-${code}`, role: 'user', content: 'Trigger the typed refusal.' },
    });
    const snapshot = await host.snapshot(`chat-${code}`);

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure).toEqual({ code, status, message: `fixture ${code}` });
    await host.close();
  });

  it('records the credit denial shortfall on the in-process terminal run record', async () => {
    const details = {
      requiredCreditAtoms: '4244000',
      availableCreditAtoms: '300000',
      routeId: 'anthropic-claude-astra-5',
    };
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => ({
            [Symbol.asyncIterator]: () => ({
              next: async (): Promise<IteratorResult<ModelStreamEvent>> => {
                throw new GatewayModelTransportError({
                  code: 'INSUFFICIENT_CREDIT',
                  status: 402,
                  message: 'Insufficient Tau credit for this model request.',
                  details,
                });
              },
            }),
          }),
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'denied',
      }),
    );

    await host.admit({
      chatId: 'chat-denied',
      runId: 'run-denied',
      trigger: 'submit',
      message: { id: 'turn-denied', role: 'user', content: 'Spend credit I do not have.' },
    });
    const eventLog = await file.open();
    const events = await eventLog.read();
    const failed = events.flatMap((event) =>
      event.type === 'run.lifecycle' && event.state === 'failed' ? [event.detail] : [],
    );

    expect(failed).toEqual([
      {
        message: 'Insufficient Tau credit for this model request.',
        code: 'INSUFFICIENT_CREDIT',
        status: 402,
        details,
      },
    ]);
    await host.close();
  });

  it.each([
    ['INSUFFICIENT_CREDIT', 402, true],
    /* The in-stream guard wraps a provider failure with the *healthy*
     * response's status, so a mid-call `NETWORK_ERROR` carries a 200. */
    ['NETWORK_ERROR', 200, true],
    ['MODEL_NOT_IN_CATALOG', 400, false],
  ] as const)('resumes a %s failure at the blocked step only when it is retryable', async (code, status, retryable) => {
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    let call = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call === 1) {
              yield {
                type: 'tool-input',
                toolCallId: 'refused-call-read',
                toolName: 'read_file',
                input: { targetFile: 'main.ts' },
              };
              yield { type: 'completed', stopReason: 'toolUse' };
              return;
            }
            if (call === 2) {
              throw new GatewayModelTransportError({
                code,
                status,
                message: `fixture ${code}`,
                details: { requiredCreditAtoms: '4244000', availableCreditAtoms: '300000', routeId: 'route' },
              });
            }
            yield { type: 'text-delta', text: 'Finished after the account was funded.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: `refused-${code}`,
      }),
    );

    await host.admit({
      chatId: `chat-refused-${code}`,
      runId: `run-refused-${code}`,
      trigger: 'submit',
      message: { id: `turn-refused-${code}`, role: 'user', content: 'Read main.ts, then answer.' },
    });
    const refused = await host.snapshot(`chat-refused-${code}`);
    const resumed = await host.resume(`chat-refused-${code}`);
    const eventLog = await file.open();
    const events = await eventLog.read();
    const lifecycle = events.flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []));

    expect(refused.state).toBe('failed');
    expect(refused.failure).toMatchObject({ code, status });
    // One tool call, whoever resumed: the settled result is replayed from the
    // log, never paid for twice.
    expect(invoke).toHaveBeenCalledTimes(1);
    if (!retryable) {
      expect(requests).toHaveLength(2);
      expect(lifecycle).toEqual(['admitted', 'running', 'failed']);
      expect(resumed).toEqual(refused.messages);
      await host.close();
      return;
    }
    // A new attempt on the same run, from the same context the refusal was
    // built from: the prior tool result intact, the user turn appearing once,
    // and no rewind of the turn itself.
    expect(lifecycle).toEqual(['admitted', 'running', 'failed', 'running', 'completed']);
    /* The one retraction a resume makes: the trailing failure marker, and
     * nothing before it (R4). A `regenerate` would retain nothing past the
     * user message instead. */
    const rewound = events.filter((event) => event.type === 'history.rewound');
    expect(rewound.map((event) => event.trigger)).toEqual(['retry']);
    expect(rewound[0]?.retainedMessageIds).toEqual(refused.messages.slice(0, -1).map((message) => message.id));
    expect(requests).toHaveLength(3);
    expect(requests[2]?.messages.map((message) => `${message.role}:${message.id}`)).toEqual(
      requests[1]?.messages.map((message) => `${message.role}:${message.id}`),
    );
    expect(requests[2]?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(requests[2]?.messages.at(-1)).toMatchObject({
      role: 'tool-output',
      toolCallId: 'refused-call-read',
      isError: false,
    });
    expect(resumed.at(-1)).toMatchObject({ role: 'assistant', content: [{ type: 'text' }] });
    expect(await host.snapshot(`chat-refused-${code}`)).toMatchObject({
      runId: `run-refused-${code}`,
      state: 'completed',
    });
    await host.close();
  });

  it('should keep the user message when start-of-turn compaction fails', async () => {
    const file = createMemoryLogFile();
    let failCompaction = false;
    let call = 0;
    const requests: ModelStreamRequest[] = [];
    const usage = (input: number): ModelStreamEvent => ({
      type: 'usage',
      usage: {
        input,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: input,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: async () => {
          const opened = await file.open();
          return {
            ...opened,
            append: async (event) => {
              if (event.type === 'history.compacted' && failCompaction) {
                failCompaction = false;
                throw new Error('durable compaction append rejected');
              }
              return opened.append(event);
            },
          };
        },
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call <= 2) {
              yield {
                type: 'tool-input',
                toolCallId: `read-${call}`,
                toolName: 'read_file',
                input: { targetFile: 'a.ts' },
              };
              yield usage(call === 1 ? 1000 : 3000);
              yield { type: 'completed', stopReason: 'toolUse' };
              return;
            }
            yield { type: 'text-delta', text: `answer ${call}` };
            yield usage(call === 3 ? 7000 : 100);
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: 'x'.repeat(9000), isError: false })),
        idPrefix: 'summary-fails',
      }),
      model: { id: 'scripted-g2-model', contextWindow: 8192 },
      summarize: async () => 'Earlier work.',
    });
    await host.admit({
      chatId: 'chat-summary-fails',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Read a.ts.' },
    });
    failCompaction = true;

    await host.admit({
      chatId: 'chat-summary-fails',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Now continue.' },
    });

    // D5: the payload is durable in the intent row before the turn's compaction, so the failure loses nothing.
    const failed = await host.snapshot('chat-summary-fails');
    expect(failed).toMatchObject({ runId: 'run-2', state: 'failed', failure: { code: 'SESSION_LOG_INTEGRITY' } });
    const events = await readLog(file);
    const intent = events.findIndex(
      (event) =>
        event.type === 'run.lifecycle' &&
        event.runId === 'run-2' &&
        event.state === 'admitted' &&
        JSON.stringify(event).includes('Now continue.'),
    );
    expect(intent).toBeGreaterThanOrEqual(0);

    await host.resume('chat-summary-fails');
    expect(requests.at(-1)?.messages.filter((message) => message.id === 'turn-2')).toHaveLength(1);
    expect(await host.snapshot('chat-summary-fails')).toMatchObject({ runId: 'run-2', state: 'completed' });
    await host.close();
  });

  it('should clear a compaction failure marker and re-enter start-of-turn compaction on resume', async () => {
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    let rejectCompactionAppend = true;
    let call = 0;
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: async () => {
          const opened = await file.open();
          return {
            ...opened,
            append: async (event) => {
              if (event.type === 'history.compacted' && rejectCompactionAppend) {
                rejectCompactionAppend = false;
                throw new Error('durable compaction append rejected');
              }
              return opened.append(event);
            },
          };
        },
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call <= 2) {
              yield {
                type: 'tool-input',
                toolCallId: `compaction-resume-read-${call}`,
                toolName: 'read_file',
                input: { targetFile: `completed-${call}.ts` },
              };
              yield {
                type: 'usage',
                usage: {
                  input: call === 1 ? 1000 : 3000,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: call === 1 ? 1000 : 3000,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              };
              yield { type: 'completed', stopReason: 'toolUse' };
              return;
            }
            if (call === 3) {
              yield { type: 'text-delta', text: 'completed work' };
              yield {
                type: 'usage',
                usage: {
                  input: 7000,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 7000,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              };
              yield { type: 'completed', stopReason: 'stop' };
              return;
            }
            yield { type: 'text-delta', text: 'resumed after compaction' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: 'x'.repeat(9000), isError: false })),
        idPrefix: 'compaction-resume',
      }),
      model: { id: 'scripted-g2-model', contextWindow: 8192 },
      summarize: async () => 'Earlier completed work.',
    });
    await host.admit({
      chatId: 'chat-compaction-resume',
      runId: 'run-before-compaction',
      trigger: 'submit',
      message: { id: 'turn-before-compaction', role: 'user', content: 'Create the model.' },
    });
    await host.admit({
      chatId: 'chat-compaction-resume',
      runId: 'run-compaction-failed',
      trigger: 'submit',
      message: { id: 'turn-compaction-failed', role: 'user', content: 'Keep the completed work and continue.' },
    });

    const failed = await host.snapshot('chat-compaction-resume');
    expect(failed).toMatchObject({
      runId: 'run-compaction-failed',
      state: 'failed',
      failure: { code: 'SESSION_LOG_INTEGRITY', message: 'durable compaction append rejected' },
    });
    expect(failed.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Compaction failed: durable compaction append rejected' }],
    });

    const resumed = await host.resume('chat-compaction-resume');
    const events = await readLog(file);
    const markerId = failed.messages.at(-1)?.id;
    const rewind = events.findLast((event) => event.type === 'history.rewound');
    expect(rewind).toMatchObject({ type: 'history.rewound', trigger: 'retry' });
    expect(rewind?.type === 'history.rewound' && rewind.retainedMessageIds).not.toContain(markerId);
    const compacted = events.find((event) => event.type === 'history.compacted');
    expect(compacted?.type === 'history.compacted' && compacted.details?.lane).toBe('start_of_turn');
    expect(requests).toHaveLength(4);
    expect(requests[3]?.messages.filter((message) => message.id === 'turn-compaction-failed')).toHaveLength(1);
    expect(resumed.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'resumed after compaction' }],
    });
    expect(await host.snapshot('chat-compaction-resume')).toMatchObject({
      runId: 'run-compaction-failed',
      state: 'completed',
    });
    await host.close();
  });

  it('resumes from the real result of a tool that ran before the stream failed', async () => {
    /* The stream starts a tool the moment its call is complete (`prestartTool`),
     * so a failure one frame later leaves a tool that *ran* with no durable
     * result: pi never executes the call, and the dropped promise used to reach
     * the resumed model as `CLIENT_DISCONNECTED` — an invitation to apply a
     * non-idempotent tool twice (F2). */
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    let call = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call === 1) {
              yield {
                type: 'tool-input',
                toolCallId: 'prestart-call-read',
                toolName: 'read_file',
                input: { targetFile: 'main.ts' },
              };
              throw new GatewayModelTransportError({
                code: 'NETWORK_ERROR',
                status: 200,
                message: 'fixture NETWORK_ERROR',
              });
            }
            yield { type: 'text-delta', text: 'Answered from the tool result that survived.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'prestart',
      }),
    );

    await host.admit({
      chatId: 'chat-prestart',
      runId: 'run-prestart',
      trigger: 'submit',
      message: { id: 'turn-prestart', role: 'user', content: 'Read main.ts, then answer.' },
    });
    const refused = await host.snapshot('chat-prestart');
    const resumed = await host.resume('chat-prestart');
    const events = await readLog(file);

    expect(refused.state).toBe('failed');
    expect(refused.failure).toMatchObject({ code: 'NETWORK_ERROR' });
    // The tool ran once, before the failure, and is never dispatched again.
    expect(invoke).toHaveBeenCalledTimes(1);
    // Its real result is durable, and there is exactly one record of it.
    expect(
      resumed.filter((message) => message.role === 'tool-output' && message.toolCallId === 'prestart-call-read'),
    ).toMatchObject([{ content: 'fixture-main', isError: false }]);
    // The re-issued call carries that result, not a fabricated disconnect.
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool-output',
      toolCallId: 'prestart-call-read',
      isError: false,
      content: 'fixture-main',
    });
    expect(JSON.stringify(requests[1]?.messages)).not.toContain('CLIENT_DISCONNECTED');
    // The assistant row the provider sees is a plain tool-use turn, not a marker.
    const assistant = requests[1]?.messages.filter((message) => message.role === 'assistant') ?? [];
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.metadata).toMatchObject({ stopReason: 'toolUse' });
    expect(assistant[0]?.metadata?.errorMessage).toBeUndefined();
    // The turn itself is untouched: the one user message, and no rewind of it.
    expect(requests[1]?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'history.rewound')).toHaveLength(0);
    /* The marker's diagnostic is what `snapshot` reads a chat's failure from,
     * so a marker left in history would report this chat as failed for the rest
     * of its life. */
    const completed = await host.snapshot('chat-prestart');
    expect(completed.state).toBe('completed');
    expect(completed.failure).toBeUndefined();
    await host.close();
  });

  it('rules every failure code a run can end on either resumable or not', () => {
    /* Q5: the *non-resumable* half of the ruling lives here rather than in a
     * second production set nothing would read. Both unions are keyed
     * exhaustively, so a code added to the transport or to compaction fails to
     * compile until this table rules it one way or the other. */
    /* eslint-disable @typescript-eslint/naming-convention -- the keys are wire failure codes, not identifiers. */
    const resumability = {
      // Gateway transport (`gatewayModelErrorCodes`); the seven resumable ones are Q2's list.
      BILLING_RECOVERY_UNAVAILABLE: false,
      FUNDED_HELPER_LIMIT: false,
      FUNDED_OPERATION_LIMIT: false,
      INSUFFICIENT_CREDIT: true,
      MODEL_NOT_IN_CATALOG: false,
      MODEL_PROVIDER_UNSUPPORTED: false,
      ORIGIN_NOT_ALLOWED: false,
      PROVIDER_ACCOUNT_EXHAUSTED: false,
      RATE_LIMITED: true,
      // The resumed run re-sends the same history, which meets the same bound.
      REQUEST_TOO_LARGE: false,
      UNAUTHENTICATED: true,
      INVALID_REQUEST: true,
      PROVIDER_UNAVAILABLE: true,
      UPSTREAM_REJECTED: true,
      MALFORMED_RESPONSE: true,
      NETWORK_ERROR: true,
      UNKNOWN_GATEWAY_ERROR: false,
      // A voided attempt was never charged or answered; the person sends again (W11).
      ATTEMPT_VOIDED: false,
      // A closed account's attempt cannot be resolved or charged; signing in again does not change it (W11).
      BILLING_ACCOUNT_CLOSED: false,
      // Resuming re-sends to the paused route; the person switches model instead (W6).
      MODEL_ROUTE_PAUSED: false,
      // Spending on the account is held; neither a resume nor another model changes it (W11a).
      BILLING_ACCOUNT_RESTRICTED: false,
      // Compaction failures resume through start-of-turn reprojection and the degradation ladder.
      SUMMARY_REQUIRED: true,
      NO_EVICTABLE_HISTORY: true,
      SESSION_LOG_INTEGRITY: true,
      CIRCUIT_BREAKER_OPEN: true,
      LEADERSHIP_LOST: false,
      // EQ1: an attempt the gateway still owns is waited out, never resumed into a second charge.
      MODEL_ATTEMPT_PENDING: false,
      // Another principal funded the attempt: signing in as that account resumes it.
      MODEL_ATTEMPT_OTHER_ACCOUNT: true,
    } as const satisfies Record<
      | GatewayModelErrorCode
      | HostCompactionError['code']
      | 'LEADERSHIP_LOST'
      | 'MODEL_ATTEMPT_PENDING'
      | 'MODEL_ATTEMPT_OTHER_ACCOUNT',
      boolean
    >;
    /* eslint-enable @typescript-eslint/naming-convention -- ends the wire-code key exception. */
    const ruled = Object.entries(resumability);

    expect(
      ruled.filter(([code]) => isResumableRunFailure({ message: `fixture ${code}`, code })).map(([code]) => code),
    ).toEqual(ruled.filter(([, resumable]) => resumable).map(([code]) => code));
  });

  it('executes tool and steady-state turns, then cold-rebuilds the completed transcript', async () => {
    const file = createMemoryLogFile();
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 3)),
        toolRegistry: tools(invoke),
      }),
    );

    await host.admit({
      chatId: 'chat-multi-turn',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Read main.ts.' },
    });
    const final = await host.admit({
      chatId: 'chat-multi-turn',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Continue using that history.' },
    });
    const eventLog = await file.open();
    const events = await eventLog.read();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(final.filter((message) => message.role === 'user').map((message) => message.id)).toEqual([
      'turn-1',
      'turn-2',
    ]);
    expect(events.filter((event) => event.type === 'turn.history-projection-committed')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'run.lifecycle').map((event) => event.state)).toEqual([
      'admitted',
      'running',
      'completed',
      'admitted',
      'running',
      'completed',
    ]);

    const coldHost = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport([]),
        toolRegistry: tools(invoke),
        idPrefix: 'cold',
      }),
    );
    await expect(coldHost.resume('chat-multi-turn')).resolves.toEqual(final);
    await coldHost.close();
    await host.close();
  });

  it('cold-resumes a run killed during a tool by pairing the pending call from W1', async () => {
    const file = createMemoryLogFile();
    const toolStarted = Promise.withResolvers<void>();
    const hangingTools = tools(async () => {
      toolStarted.resolve();
      return new Promise<never>(() => {
        // Simulate a worker terminated while its tool request is outstanding.
      });
    });
    const crashedHost = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 1)),
        toolRegistry: hangingTools,
        idPrefix: 'crashed',
      }),
    );

    void crashedHost.admit({
      chatId: 'chat-recovery',
      runId: 'run-recovery',
      trigger: 'submit',
      message: { id: 'turn-recovery', role: 'user', content: 'Read before the worker is killed.' },
    });
    await toolStarted.promise;

    const resumedInvoke = vi.fn(async () => ({ content: 'must-not-run', isError: false }));
    const resumedHost = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(1, 2)),
        toolRegistry: tools(resumedInvoke),
        idPrefix: 'resumed',
      }),
    );
    /* Opening the chat abandons the orphan as the new term's claim (RA-R9); the person's Resume continues it. */
    await expect(resumedHost.markAbandoned('chat-recovery')).resolves.toMatchObject({
      runId: 'run-recovery',
      state: 'failed',
      failure: { code: 'RUN_ABANDONED' },
    });
    const final = await resumedHost.resume('chat-recovery');

    expect(resumedInvoke).not.toHaveBeenCalled();
    expect(final.find((message) => message.role === 'tool-output')).toMatchObject({
      role: 'tool-output',
      toolCallId: 'fixture-call-read',
      isError: true,
      content: { errorCode: 'CLIENT_DISCONNECTED' },
    });
    const recovery = final.find(
      (message) => message.role === 'user' && tauInternal(message)?.['kind'] === 'interrupt-recovery',
    );
    const recoveryInternal = tauInternal(recovery);
    expect(recovery?.id).toMatch(/^tau:interrupt-recovery:[0-9a-f]{16}$/u);
    expect(recovery?.role).toBe('user');
    expect(recovery?.content).toBe(`<system-reminder>
The previous turn was cut short by a network drop. 0 tool call(s)
completed successfully and 1 were cancelled before they
finished. Tools that mutate state (file writes, edits, deletes) may have
partially executed.

Before retrying, verify the current state of any file or resource you were
operating on (read_file / list_directory / evaluate_model) and only then
decide whether to repeat, adjust, or skip the cancelled work. Do NOT assume
the cancelled tools left the system unchanged.
</system-reminder>`);
    // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
    const recoveryKind = recoveryInternal?.['kind'];
    // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
    const recoveryAnchorId = recoveryInternal?.['anchorId'];
    // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
    const recoveryPruning = recoveryInternal?.['pruning'];
    expect(recoveryKind).toBe('interrupt-recovery');
    expect(recoveryAnchorId).toMatch(/^[0-9a-f]{16}$/u);
    if (typeof recoveryAnchorId !== 'string') {
      throw new TypeError('Interrupt recovery anchor must be a string.');
    }
    expect(recoveryPruning).toBe('preserve-until-compaction');
    expect(typeof recovery?.metadata?.timestamp).toBe('number');
    expect(recovery?.id.endsWith(recoveryAnchorId)).toBe(true);
    expect(final.findLast((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'text', text: 'Read main.ts and completed the first turn.' },
    ]);
    await resumedHost.close();
  });

  it('durably delivers the interrupt-recovery reminder before an in-process retry', async () => {
    const file = createMemoryLogFile();
    const transport = new ScriptedParityModelTransport(scriptedParityResponses.slice(3, 5));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({
          content: {
            errorCode: 'CLIENT_DISCONNECTED',
            message: 'The scripted execution host disconnected.',
            rpcName: 'read_file',
          },
          isError: true,
        })),
        idPrefix: 'disconnected',
      }),
    );

    const final = await host.admit({
      chatId: 'chat-disconnected',
      runId: 'run-disconnected',
      trigger: 'submit',
      message: { id: 'turn-disconnected', role: 'user', content: 'Resume after an interrupted read.' },
    });
    const eventLog = await file.open();
    const events = await eventLog.read();
    const recovery = final.find(
      (message) => message.role === 'user' && tauInternal(message)?.['kind'] === 'interrupt-recovery',
    );
    const recoveryInternal = tauInternal(recovery);

    expect(recovery?.id).toMatch(/^tau:interrupt-recovery:[0-9a-f]{16}$/u);
    expect(recovery?.content).toContain('The previous turn was cut short by a network drop.');
    expect(recoveryInternal?.['kind']).toBe('interrupt-recovery');
    expect(recoveryInternal?.['anchorId']).toMatch(/^[0-9a-f]{16}$/u);
    expect(recoveryInternal?.['pruning']).toBe('preserve-until-compaction');
    expect(
      events.find((event) => event.type === 'message.appended' && event.message.id === recovery?.id),
    ).toBeDefined();
    expect(transport.requests[1]?.messages).toContainEqual(recovery);
    expect(final.findLast((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'text', text: 'Recovered after the interrupted tool call.' },
    ]);
    await host.close();
  });

  it('routes active interruption and resolution through durable rows before resuming', async () => {
    const file = createMemoryLogFile();
    const modelStarted = Promise.withResolvers<void>();
    let calls = 0;
    const transport: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
        calls++;
        if (calls === 1) {
          modelStarted.resolve();
          await new Promise<void>((resolve) => {
            request.signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          });
          yield { type: 'completed', stopReason: 'aborted' };
          return;
        }
        yield { type: 'text-delta', text: 'Resumed after operator approval.' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'interrupt',
      }),
    );
    const admission = host.admit({
      chatId: 'chat-interrupt',
      runId: 'run-interrupt',
      trigger: 'submit',
      message: { id: 'turn-interrupt', role: 'user', content: 'Wait for operator input.' },
    });
    await modelStarted.promise;
    const interruption = host.interrupt({
      interruptId: 'interrupt-1',
      runId: 'run-interrupt',
      kind: 'operator',
      prompt: 'Continue this run?',
    });
    await admission;
    await vi.waitFor(async () => {
      await expect(host.pendingInterrupts('run-interrupt')).resolves.toHaveLength(1);
    });
    await expect(
      host.resolveInterrupt({ runId: 'wrong-run', interruptId: 'interrupt-1', outcome: 'approved' }),
    ).rejects.toThrow('is not pending on run wrong-run');
    await host.resolveInterrupt({ runId: 'run-interrupt', interruptId: 'interrupt-1', outcome: 'approved' });
    await expect(interruption).resolves.toEqual({ interruptId: 'interrupt-1', outcome: 'approved' });

    const final = await host.resume('chat-interrupt');
    const snapshot = await host.snapshot('chat-interrupt');
    const eventLog = await file.open();
    const events = await eventLog.read();

    expect(final.findLast((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'text', text: 'Resumed after operator approval.' },
    ]);
    expect(snapshot.state).toBe('completed');
    expect(events.filter((event) => event.type === 'interrupt.recorded').map((event) => event.phase)).toEqual([
      'requested',
      'resolved',
    ]);
    await host.close();
  });

  it('should replay one real result when interruption overlaps an early tool call', async () => {
    const file = createMemoryLogFile();
    const toolStarted = Promise.withResolvers<void>();
    const toolResult = Promise.withResolvers<{ content: string; isError: false }>();
    const toolAborted = Promise.withResolvers<void>();
    const requests: ModelStreamRequest[] = [];
    const transport: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        if (requests.length === 1) {
          yield {
            type: 'tool-input',
            toolCallId: 'interrupted-read',
            toolName: 'read_file',
            input: { targetFile: 'main.ts' },
          };
          yield { type: 'completed', stopReason: 'toolUse' };
          return;
        }
        yield { type: 'text-delta', text: 'Recovered.' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const invoke = vi.fn(async (invocation: Parameters<ToolRegistry['invoke']>[0]) => {
      toolStarted.resolve();
      invocation.signal.addEventListener(
        'abort',
        () => {
          toolAborted.resolve();
        },
        { once: true },
      );
      return toolResult.promise;
    });
    const host = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport, toolRegistry: tools(invoke), idPrefix: 'interrupted-tool' }),
    );
    const admission = host.admit({
      chatId: 'chat-interrupted-tool',
      runId: 'run-interrupted-tool',
      trigger: 'submit',
      message: { id: 'turn-interrupted-tool', role: 'user', content: 'Read main.ts.' },
    });
    await toolStarted.promise;
    const interruption = host.interrupt({
      interruptId: 'interrupt-tool',
      runId: 'run-interrupted-tool',
      kind: 'operator',
      prompt: 'Continue?',
    });
    await toolAborted.promise;
    toolResult.resolve({ content: 'fixture-main', isError: false });
    await admission;
    await host.resolveInterrupt({ runId: 'run-interrupted-tool', interruptId: 'interrupt-tool', outcome: 'approved' });
    await interruption;
    const resumed = await host.resume('chat-interrupted-tool');
    const events = await readLog(file);
    const outputs = resumed.filter(
      (message) => message.role === 'tool-output' && message.toolCallId === 'interrupted-read',
    );
    expect(outputs).toMatchObject([{ content: 'fixture-main', isError: false }]);
    expect(
      events.filter(
        (event) =>
          event.type === 'message.appended' &&
          event.message.role === 'tool-output' &&
          event.message.toolCallId === 'interrupted-read',
      ),
    ).toHaveLength(1);
    expect(
      requests[1]?.messages.filter(
        (message) => message.role === 'tool-output' && message.toolCallId === 'interrupted-read',
      ),
    ).toHaveLength(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    await host.close();
  });

  /*
   * D5 on the substrate (the fixture's one tool stands in for `request_print`): a tool's approval is the run's native durable interrupt. Asking ends the attempt paused
   * (D10, TS-R10); the answer resolves it, and the run's next attempt asks again and reads the answer. Geospec's
   * version held the attempt's driver open on an interrupt port instead, which M1 admits only for external runs.
   */
  const printResponses: readonly ScriptedParityResponse[] = [
    {
      id: 'print-assistant-1',
      toolCalls: [{ id: 'call-print-1', name: 'read_file', input: { targetFile: 'main.ts' } }],
      usage: { inputTokens: 100, outputTokens: 4 },
    },
    {
      id: 'print-assistant-2',
      toolCalls: [{ id: 'call-print-2', name: 'read_file', input: { targetFile: 'main.ts' } }],
      usage: { inputTokens: 120, outputTokens: 4 },
    },
    { id: 'print-assistant-3', text: 'The print is approved.', usage: { inputTokens: 140, outputTokens: 5 } },
  ];
  const printTool = (outcomes: string[]) =>
    tools(async (invocation) => {
      const resolution = await invocation.approve!({
        key: 'print:main.ts',
        prompt: 'Print main.gcode.3mf on Workshop X1C?',
        payload: { kind: 'print-request', requestId: 'request-1' },
      });
      outcomes.push(resolution.outcome);
      return { content: { approval: resolution.outcome }, isError: false };
    });

  it('pauses a Tau run on a tool approval and continues it on the answer as its next attempt', async () => {
    const file = createMemoryLogFile();
    const outcomes: string[] = [];
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: printTool(outcomes),
        idPrefix: 'approval',
      }),
    );

    await host.admit({
      chatId: 'chat-approval',
      runId: 'run-approval',
      trigger: 'submit',
      message: { id: 'turn-approval', role: 'user', content: 'Print it.' },
    });
    await expect(host.snapshot('chat-approval')).resolves.toMatchObject({ state: 'paused' });
    const [pending] = await host.pendingInterrupts('run-approval');
    expect(pending).toMatchObject({
      runId: 'run-approval',
      kind: 'approval',
      prompt: 'Print main.gcode.3mf on Workshop X1C?',
      payload: { kind: 'print-request', requestId: 'request-1', approvalKey: 'print:main.ts' },
    });
    expect(outcomes).toEqual([]);

    await host.resolveInterrupt({ runId: 'run-approval', interruptId: pending!.interruptId, outcome: 'approved' });
    await host.resume('chat-approval');

    const eventLog = await file.open();
    const events = await eventLog.read();
    expect(outcomes).toEqual(['approved']);
    expect(events.filter((event) => event.type === 'run.lifecycle').map((event) => event.state)).toEqual([
      'admitted',
      'running',
      'paused',
      'running',
      'completed',
    ]);
    const recorded = events.filter((event) => event.type === 'interrupt.recorded');
    expect(recorded.map((event) => event.phase)).toEqual(['requested', 'resolved']);
    expect(recorded[1]?.payload).toEqual({ outcome: 'approved' });
    await host.close();
  });

  it('ends a run paused on a tool approval when the person declines, and asks nothing of the tool', async () => {
    const file = createMemoryLogFile();
    const outcomes: string[] = [];
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: printTool(outcomes),
        idPrefix: 'decline',
      }),
    );
    await host.admit({
      chatId: 'chat-decline',
      runId: 'run-decline',
      trigger: 'submit',
      message: { id: 'turn-decline', role: 'user', content: 'Print it.' },
    });
    const [pending] = await host.pendingInterrupts('run-decline');

    await host.resolveInterrupt({ runId: 'run-decline', interruptId: pending!.interruptId, outcome: 'denied' });

    const eventLog = await file.open();
    const events = await eventLog.read();
    expect(outcomes).toEqual([]);
    expect(events.filter((event) => event.type === 'interrupt.recorded').map((event) => event.reason)).toEqual([
      'Print main.gcode.3mf on Workshop X1C?',
      'denied',
    ]);
    /* `[resolved, cancelled]` ends the settled pause (`paused-reopenable`). */
    expect(events.findLast((event) => event.type === 'run.lifecycle')?.state).toBe('cancelled');
    await expect(host.snapshot('chat-decline')).resolves.toMatchObject({ state: 'cancelled' });
    await host.close();
  });

  it('answers a tool approval cancelled when its paused run is cancelled', async () => {
    const file = createMemoryLogFile();
    const outcomes: string[] = [];
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: printTool(outcomes),
        idPrefix: 'stop',
      }),
    );
    await host.admit({
      chatId: 'chat-stop',
      runId: 'run-stop',
      trigger: 'submit',
      message: { id: 'turn-stop', role: 'user', content: 'Print it.' },
    });
    await expect(host.pendingInterrupts('run-stop')).resolves.toHaveLength(1);

    await host.cancel({ runId: 'run-stop' });

    const eventLog = await file.open();
    const events = await eventLog.read();
    expect(outcomes).toEqual([]);
    await expect(host.pendingInterrupts('run-stop')).resolves.toEqual([]);
    expect(events.filter((event) => event.type === 'interrupt.recorded').map((event) => event.reason)).toEqual([
      'Print main.gcode.3mf on Workshop X1C?',
      'cancelled',
    ]);
    expect(events.findLast((event) => event.type === 'run.lifecycle')?.state).toBe('cancelled');
    await host.close();
  });

  it.each([
    ['approved', 'approves'],
    ['denied', 'declines'],
    ['cancelled', 'cancels the paused run'],
  ] as const)('hands the answer to the tool that asked when the person %s it (%s)', async (outcome, _gesture) => {
    const file = createMemoryLogFile();
    const answerApproval = vi.fn<NonNullable<ToolRegistry['answerApproval']>>(async () => undefined);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: { ...printTool([]), answerApproval },
        idPrefix: `answer-${outcome}`,
      }),
    );
    await host.admit({
      chatId: 'chat-answer',
      runId: 'run-answer',
      trigger: 'submit',
      message: { id: 'turn-answer', role: 'user', content: 'Print it.' },
    });
    const [pending] = await host.pendingInterrupts('run-answer');
    expect(answerApproval).not.toHaveBeenCalled();

    await (outcome === 'cancelled'
      ? host.cancel({ runId: 'run-answer' })
      : host.resolveInterrupt({ runId: 'run-answer', interruptId: pending!.interruptId, outcome }));

    await vi.waitFor(() => {
      expect(answerApproval).toHaveBeenCalledTimes(1);
    });
    expect(answerApproval).toHaveBeenCalledWith({
      toolName: 'read_file',
      payload: { kind: 'print-request', requestId: 'request-1' },
      resolution: { interruptId: pending!.interruptId, outcome },
    });
    await host.close();
  });

  it.each([
    ['close', 'approved'],
    ['relinquish', 'approved'],
    ['evictChat', 'denied'],
  ] as const)(
    'should read an applied approval before %s closes its log without waiting for the tool',
    async (verb, outcome) => {
      const file = createMemoryLogFile();
      const reading = Promise.withResolvers<void>();
      const releaseRead = Promise.withResolvers<void>();
      const logClosed = Promise.withResolvers<void>();
      const finishHandover = Promise.withResolvers<void>();
      let holdApprovalRead = false;
      const answerApproval = vi.fn<NonNullable<ToolRegistry['answerApproval']>>(async () => {
        await finishHandover.promise;
      });
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const host = createTauAgentHost(
        hostOptions({
          openEventLog: async () => {
            const log = await file.open();
            return {
              ...log,
              read: async () => {
                if (holdApprovalRead) {
                  holdApprovalRead = false;
                  reading.resolve();
                  await releaseRead.promise;
                }
                return log.read();
              },
              close: async () => {
                await log.close();
                logClosed.resolve();
              },
            };
          },
          transport: new ScriptedParityModelTransport(printResponses),
          toolRegistry: { ...printTool([]), answerApproval },
          idPrefix: 'close-approval',
        }),
      );
      await host.admit({
        chatId: 'chat-close-approval',
        runId: 'run-close-approval',
        trigger: 'submit',
        message: { id: 'turn-close-approval', role: 'user', content: 'Print it.' },
      });
      const [pending] = await host.pendingInterrupts('run-close-approval');
      await host.resolveInterrupt({
        runId: 'run-close-approval',
        interruptId: pending!.interruptId,
        outcome,
      });
      holdApprovalRead = true;
      await reading.promise;
      const closing =
        verb === 'close'
          ? host.close()
          : verb === 'relinquish'
            ? host.relinquish('chat-close-approval')
            : host.evictChat('chat-close-approval');
      await Promise.race([
        logClosed.promise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        }),
      ]);
      releaseRead.resolve();
      await closing;
      expect(answerApproval).toHaveBeenCalledExactlyOnceWith({
        toolName: 'read_file',
        payload: { kind: 'print-request', requestId: 'request-1' },
        resolution: { interruptId: pending!.interruptId, outcome },
      });
      expect(errors).not.toHaveBeenCalled();
      finishHandover.resolve();
      if (verb !== 'close') {
        await host.close();
      }
      errors.mockRestore();
    },
  );

  it('should wait for an approval scan before starting a run on an evicting chat', async () => {
    const file = createMemoryLogFile();
    const reading = Promise.withResolvers<void>();
    const releaseRead = Promise.withResolvers<void>();
    let holdRead = false;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: async () => {
          const log = await file.open();
          return {
            ...log,
            read: async () => {
              if (holdRead) {
                holdRead = false;
                reading.resolve();
                await releaseRead.promise;
              }
              return log.read();
            },
          };
        },
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: { ...printTool([]), answerApproval: async () => undefined },
        idPrefix: 'evict-start-race',
      }),
    );
    await host.admit({
      chatId: 'chat-evict-start-race',
      runId: 'run-first',
      trigger: 'submit',
      message: { id: 'turn-first', role: 'user', content: 'Print it.' },
    });
    const [pending] = await host.pendingInterrupts('run-first');
    await host.resolveInterrupt({ runId: 'run-first', interruptId: pending!.interruptId, outcome: 'denied' });
    holdRead = true;
    await reading.promise;

    const evicting = host.evictChat('chat-evict-start-race');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    let started = false;
    const start = async () => {
      const answer = await host.command({
        type: 'start',
        commandId: 'start:run-second',
        payload: {
          chatId: 'chat-evict-start-race',
          runId: 'run-second',
          trigger: 'submit',
          message: { id: 'turn-second', role: 'user', content: 'Again.' },
        },
      });
      started = true;
      return answer;
    };
    const starting = start();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(started).toBe(false);

    releaseRead.resolve();
    await evicting;
    await expect(starting).resolves.toMatchObject({ status: 'applied', effect: 'durable' });
    await host.close();
  });

  it('hands a Stop only the answers its own rows record, never an earlier approval (GM.r2 M2, mutant C)', async () => {
    const file = createMemoryLogFile();
    const answerApproval = vi.fn<NonNullable<ToolRegistry['answerApproval']>>(async () => undefined);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: { ...printTool([]), answerApproval },
        idPrefix: 'stop-after-approve',
      }),
    );
    await host.admit({
      chatId: 'chat-stop-approved',
      runId: 'run-stop-approved',
      trigger: 'submit',
      message: { id: 'turn-stop-approved', role: 'user', content: 'Print it.' },
    });
    const [pending] = await host.pendingInterrupts('run-stop-approved');
    await host.resolveInterrupt({ runId: 'run-stop-approved', interruptId: pending!.interruptId, outcome: 'approved' });
    await vi.waitFor(() => {
      expect(answerApproval).toHaveBeenCalledTimes(1);
    });

    await host.cancel({ runId: 'run-stop-approved' });
    await host.snapshot('chat-stop-approved');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(answerApproval.mock.calls.map(([answer]) => answer.resolution.outcome)).toEqual(['approved']);
    await host.close();
  });

  it('hands an approval over again when its run continues, if the first hand-over was lost (GM.r2 M2)', async () => {
    const file = createMemoryLogFile();
    const answerApproval = vi
      .fn<NonNullable<ToolRegistry['answerApproval']>>()
      .mockRejectedValueOnce(new Error('The machine host was restarting.'))
      .mockResolvedValue(undefined);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(printResponses),
        toolRegistry: { ...printTool([]), answerApproval },
        idPrefix: 'lost-hand-over',
      }),
    );
    await host.admit({
      chatId: 'chat-lost',
      runId: 'run-lost',
      trigger: 'submit',
      message: { id: 'turn-lost', role: 'user', content: 'Print it.' },
    });
    const [pending] = await host.pendingInterrupts('run-lost');
    await host.resolveInterrupt({ runId: 'run-lost', interruptId: pending!.interruptId, outcome: 'approved' });
    await vi.waitFor(() => {
      expect(errors).toHaveBeenCalled();
    });

    await host.resume('chat-lost');

    await vi.waitFor(() => {
      expect(answerApproval).toHaveBeenCalledTimes(2);
    });
    expect(answerApproval.mock.calls[1]![0]).toMatchObject({ resolution: { outcome: 'approved' } });
    errors.mockRestore();
    await host.close();
  });

  it('tells the continued attempt the answer its call paused on, not only that the call was aborted', async () => {
    const file = createMemoryLogFile();
    const transport = new ScriptedParityModelTransport([...printResponses.slice(0, 1), ...printResponses.slice(2)]);
    const host = createTauAgentHost(
      hostOptions({ openEventLog: file.open, transport, toolRegistry: printTool([]), idPrefix: 'told' }),
    );
    await host.admit({
      chatId: 'chat-told',
      runId: 'run-told',
      trigger: 'submit',
      message: { id: 'turn-told', role: 'user', content: 'Print it.' },
    });
    const [pending] = await host.pendingInterrupts('run-told');
    await host.resolveInterrupt({ runId: 'run-told', interruptId: pending!.interruptId, outcome: 'approved' });
    await host.resume('chat-told');

    const continued = JSON.stringify(transport.requests.at(-1));
    expect(continued).toContain('paused for the person');
    expect(continued).toMatch(/approved: \W{0,3}Print main\.gcode\.3mf on Workshop X1C\?/u);
    await expect(host.snapshot('chat-told')).resolves.toMatchObject({ state: 'completed' });
    await host.close();
  });

  const promptsOf = async (host: TauAgentHost, runId: string): Promise<string[]> => {
    const pending = await host.pendingInterrupts(runId);
    return pending.map((request) => request.prompt);
  };
  /** A tool keyed by its target file, as `request_print` keys by machine and file (D5). */
  const keyedTool = (outcomes: string[]) =>
    tools(async (invocation) => {
      const file = (invocation.input as { targetFile: string }).targetFile;
      const resolution = await invocation.approve!({
        key: `print:${file}`,
        prompt: `Print ${file}?`,
        payload: { kind: 'print-request', requestId: `request-${file}` },
      });
      outcomes.push(`${file}:${resolution.outcome}`);
      return { content: { approval: resolution.outcome }, isError: false };
    });
  const readCall = (id: string, file: string) => ({ id, name: 'read_file', input: { targetFile: file } });
  const usage = { inputTokens: 1, outputTokens: 1 };
  /* The tools: a keyed print tool recording its outcomes, or a registry of the test's own. */
  const keyedHost = (label: string, responses: readonly ScriptedParityResponse[], tools: string[] | ToolRegistry) => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(responses),
        toolRegistry: Array.isArray(tools) ? keyedTool(tools) : tools,
        idPrefix: label,
      }),
    );
    const admit = async (runId: string) =>
      host.admit({
        chatId: `chat-${label}`,
        runId,
        trigger: 'submit',
        message: { id: `turn-${runId}`, role: 'user', content: 'Print it.' },
      });
    const approveAndResume = async (runId: string) => {
      const [pending] = await host.pendingInterrupts(runId);
      await host.resolveInterrupt({ runId, interruptId: pending!.interruptId, outcome: 'approved' });
      await host.resume(`chat-${label}`);
    };
    return { host, file, admit, approveAndResume };
  };

  it('spends an approval only on the call that recalled it, not on another key asked first (GM.r1 M1)', async () => {
    const outcomes: string[] = [];
    const { host, admit, approveAndResume } = keyedHost(
      'spend-other',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', toolCalls: [readCall('c2', 'b.ts')], usage },
        { id: 'a3', toolCalls: [readCall('c3', 'a.ts')], usage },
        { id: 'a4', text: 'done', usage },
      ],
      outcomes,
    );
    await admit('run-spend-other');
    await approveAndResume('run-spend-other');
    expect(await promptsOf(host, 'run-spend-other')).toEqual(['Print b.ts?']);
    await approveAndResume('run-spend-other');

    expect(await host.pendingInterrupts('run-spend-other')).toEqual([]);
    expect(outcomes).toEqual(['a.ts:approved']);
    await expect(host.snapshot('chat-spend-other')).resolves.toMatchObject({ state: 'completed' });
    await host.close();
  });

  it('tells each attempt only the answers given since it last ran (GM.r2 L-a, mutant D)', async () => {
    const { host, file, admit, approveAndResume } = keyedHost(
      'told-once',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', toolCalls: [readCall('c2', 'b.ts')], usage },
        { id: 'a3', text: 'done', usage },
      ],
      [],
    );
    await admit('run-told-once');
    await approveAndResume('run-told-once');
    await approveAndResume('run-told-once');

    const eventLog = await file.open();
    const messages = await eventLog.messages();
    const reminders = messages.filter(
      (message) => message.role === 'user' && message.metadata?.tauInternal?.['kind'] === 'approval-answer',
    );
    expect(reminders.map((message) => JSON.stringify(message.content))).toEqual([
      expect.stringContaining('Print a.ts?'),
      expect.not.stringContaining('Print a.ts?'),
    ]);
    expect(JSON.stringify(reminders[1]?.content)).toContain('Print b.ts?');
    await host.close();
  });

  it('releases an approval whose recalling call threw, so the next call recalls it (GM.r2 L-c)', async () => {
    const outcomes: string[] = [];
    let failed = false;
    const flaky = tools(async (invocation) => {
      const file = (invocation.input as { targetFile: string }).targetFile;
      const resolution = await invocation.approve!({ key: `print:${file}`, prompt: `Print ${file}?` });
      if (!failed) {
        failed = true;
        throw new Error('The upload failed.');
      }
      outcomes.push(`${file}:${resolution.outcome}`);
      return { content: { approval: resolution.outcome }, isError: false };
    });
    const { host, admit, approveAndResume } = keyedHost(
      'release-thrown',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', toolCalls: [readCall('c2', 'a.ts')], usage },
        { id: 'a3', toolCalls: [readCall('c3', 'a.ts')], usage },
        { id: 'a4', text: 'done', usage },
      ],
      flaky,
    );
    await admit('run-release-thrown');
    await approveAndResume('run-release-thrown');

    expect(outcomes).toEqual(['a.ts:approved']);
    expect(await promptsOf(host, 'run-release-thrown')).toEqual([]);
    await expect(host.snapshot('chat-release-thrown')).resolves.toMatchObject({ state: 'completed' });
    await host.close();
  });

  it('asks again for a second call under a key whose approval a first call used (GM.r1 M2, mutant B)', async () => {
    const outcomes: string[] = [];
    const { host, admit, approveAndResume } = keyedHost(
      'spend-twice',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', toolCalls: [readCall('c2', 'a.ts')], usage },
        { id: 'a3', toolCalls: [readCall('c3', 'a.ts')], usage },
        { id: 'a4', text: 'done', usage },
      ],
      outcomes,
    );
    await admit('run-spend-twice');
    await approveAndResume('run-spend-twice');

    expect(outcomes).toEqual(['a.ts:approved']);
    expect(await promptsOf(host, 'run-spend-twice')).toEqual(['Print a.ts?']);
    await host.close();
  });

  it('keeps an approval a call used spent for the next host that opens the chat (GM.r1 M1)', async () => {
    const file = createMemoryLogFile();
    const outcomes: string[] = [];
    const hostOver = (label: string, responses: readonly ScriptedParityResponse[]) =>
      createTauAgentHost(
        hostOptions({
          openEventLog: file.open,
          transport: new ScriptedParityModelTransport(responses),
          toolRegistry: keyedTool(outcomes),
          idPrefix: label,
        }),
      );
    const first = hostOver('spent-first', [
      { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
      { id: 'a2', toolCalls: [readCall('c2', 'a.ts')], usage },
      { id: 'a3', toolCalls: [readCall('c3', 'b.ts')], usage },
    ]);
    await first.admit({
      chatId: 'chat-spent',
      runId: 'run-spent',
      trigger: 'submit',
      message: { id: 'turn-spent', role: 'user', content: 'Print it.' },
    });
    const [asked] = await first.pendingInterrupts('run-spent');
    await first.resolveInterrupt({ runId: 'run-spent', interruptId: asked!.interruptId, outcome: 'approved' });
    await first.resume('chat-spent');
    const [second] = await first.pendingInterrupts('run-spent');
    expect(second?.prompt).toBe('Print b.ts?');
    await first.close();

    const next = hostOver('spent-next', [
      { id: 'a4', toolCalls: [readCall('c4', 'a.ts')], usage },
      { id: 'a5', text: 'done', usage },
    ]);
    await expect(next.snapshot('chat-spent')).resolves.toMatchObject({ state: 'paused' });
    await next.resolveInterrupt({ runId: 'run-spent', interruptId: second!.interruptId, outcome: 'approved' });
    await next.resume('chat-spent');

    expect(outcomes).toEqual(['a.ts:approved']);
    expect(await promptsOf(next, 'run-spent')).toEqual(['Print a.ts?']);
    await next.close();
  });

  it('answers only one of two parallel calls under the same key with one approval (GM.r1 L4)', async () => {
    const outcomes: string[] = [];
    const { host, admit, approveAndResume } = keyedHost(
      'spend-parallel',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', toolCalls: [readCall('c2', 'a.ts'), readCall('c3', 'a.ts')], usage },
        { id: 'a3', text: 'done', usage },
        { id: 'a4', text: 'done', usage },
      ],
      outcomes,
    );
    await admit('run-spend-parallel');
    await approveAndResume('run-spend-parallel');

    expect(outcomes).toEqual(['a.ts:approved']);
    expect(await promptsOf(host, 'run-spend-parallel')).toEqual(['Print a.ts?']);
    await host.close();
  });

  it("tells the chat's next run the answer a denial ended the last run with (GM.r3 clause 10)", async () => {
    const { host, file, admit } = keyedHost(
      'denied-next-run',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', text: 'Understood, no print.', usage },
      ],
      [],
    );
    await admit('run-denied');
    const [pending] = await host.pendingInterrupts('run-denied');
    await host.resolveInterrupt({ runId: 'run-denied', interruptId: pending!.interruptId, outcome: 'denied' });
    await expect(host.snapshot('chat-denied-next-run')).resolves.toMatchObject({ state: 'cancelled' });

    await admit('run-after-denial');

    const eventLog = await file.open();
    const messages = await eventLog.messages();
    const told = messages.filter(
      (message) => message.role === 'user' && message.metadata?.tauInternal?.['kind'] === 'approval-answer',
    );
    expect(told).toHaveLength(1);
    expect(told[0]!.content).toContain('- denied: "Print a.ts?"');
    expect(told[0]!.content).toContain('That run has ended');
    /* Told before the person's new message, and only once: a third run is not told again. */
    expect(messages.indexOf(told[0]!)).toBeLessThan(
      messages.findIndex((message) => message.id === 'turn-run-after-denial'),
    );
    await host.close();
  });

  it("does not carry an earlier run's unused approval into a later run of the chat (GM.r1 M2, mutant A)", async () => {
    const outcomes: string[] = [];
    const { host, admit } = keyedHost(
      'spend-runs',
      [
        { id: 'a1', toolCalls: [readCall('c1', 'a.ts')], usage },
        { id: 'a2', toolCalls: [readCall('c2', 'a.ts')], usage },
        { id: 'a3', text: 'done', usage },
      ],
      outcomes,
    );
    await admit('run-first');
    const [first] = await host.pendingInterrupts('run-first');
    await host.resolveInterrupt({ runId: 'run-first', interruptId: first!.interruptId, outcome: 'approved' });
    await host.cancel({ runId: 'run-first' });

    await admit('run-second');

    expect(outcomes).toEqual([]);
    expect(await promptsOf(host, 'run-second')).toEqual(['Print a.ts?']);
    await host.close();
  });

  it('reserves a chat synchronously so immediate cancel reaches the admitted run and duplicate starts are rejected', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    const transport: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        calls++;
        if (!request.signal.aborted) {
          await Promise.race([
            release.promise,
            new Promise<void>((resolve) => {
              request.signal.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            }),
          ]);
        }
        yield { type: 'completed', stopReason: request.signal.aborted ? 'aborted' : 'stop' };
      },
    };
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'reservation',
      }),
    );
    const first = host.admit({
      chatId: 'chat-reserved',
      runId: 'run-reserved',
      trigger: 'submit',
      message: { id: 'turn-reserved', role: 'user', content: 'Wait.' },
    });
    const duplicate = host.admit({
      chatId: 'chat-reserved',
      runId: 'run-duplicate',
      trigger: 'submit',
      message: { id: 'turn-duplicate', role: 'user', content: 'Duplicate.' },
    });
    const cancellation = host.cancel({ runId: 'run-reserved' });

    await expect(duplicate).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', state: 'reserved' });
    await cancellation;
    release.resolve();
    await first;
    await expect(host.snapshot('chat-reserved')).resolves.toMatchObject({ state: 'cancelled' });
    expect(calls).toBeLessThanOrEqual(1);
    await host.close();
  });

  it('acknowledges durable admission without waiting for run completion', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            await release.promise;
            yield { type: 'text-delta', text: 'finished after admission' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'admission-ack',
      }),
    );
    const completion = host.admit({
      chatId: 'chat-admission-ack',
      runId: 'run-admission-ack',
      trigger: 'submit',
      message: { id: 'turn-admission-ack', role: 'user', content: 'Wait after admitting.' },
    });

    /* Answered once the intent row is durable (I18): the admission, not the model call. */
    await expect(host.waitForAdmission('chat-admission-ack')).resolves.toMatchObject({
      runId: 'run-admission-ack',
      state: 'admitted',
    });
    await expect(
      Promise.race([
        completion.then(() => 'completed'),
        new Promise<'pending'>((resolve) => {
          globalThis.setTimeout(() => {
            resolve('pending');
          }, 20);
        }),
      ]),
    ).resolves.toBe('pending');

    release.resolve();
    await completion;
    await expect(host.snapshot('chat-admission-ack')).resolves.toMatchObject({ state: 'completed' });
    await host.close();
  });

  it('records an explicit usage-unsettled marker when cancellation interrupts an active provider stream', async () => {
    const file = createMemoryLogFile();
    const started = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            started.resolve();
            yield { type: 'message-metadata', metadata: { providerTrace: { id: 'trace-cancel' } } };
            if (!request.signal.aborted) {
              await new Promise<void>((resolve) => {
                request.signal.addEventListener(
                  'abort',
                  () => {
                    resolve();
                  },
                  { once: true },
                );
              });
            }
            yield { type: 'completed', stopReason: 'aborted' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'usage-cancel',
      }),
    );
    const run = host.admit({
      chatId: 'chat-usage-cancel',
      runId: 'run-usage-cancel',
      trigger: 'submit',
      message: { id: 'turn-usage-cancel', role: 'user', content: 'Wait.' },
    });
    await started.promise;
    await host.cancel({ runId: 'run-usage-cancel' });
    await run;

    const log = await file.open();
    const events = await log.read();
    const assistant = reduceEventLog(events).findLast((message) => message.role === 'assistant');
    expect(assistant?.metadata?.['usageUnsettled']).toEqual({ type: 'tau.usage-unsettled', reason: 'aborted' });
    expect(assistant?.metadata?.['providerTrace']).toEqual({ id: 'trace-cancel' });
    await host.close();
  });

  it('fences stale appends, closes the lost-leader log, and resumes under a new generation', async () => {
    const file = createMemoryLogFile();
    const started = Promise.withResolvers<void>();
    let calls = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            calls++;
            if (calls === 1) {
              started.resolve();
              if (!request.signal.aborted) {
                await new Promise<void>((resolve) => {
                  request.signal.addEventListener(
                    'abort',
                    () => {
                      resolve();
                    },
                    { once: true },
                  );
                });
              }
              yield { type: 'completed', stopReason: 'aborted' };
              return;
            }
            yield { type: 'text-delta', text: 'Recovered under the new generation.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'generation',
      }),
    );
    host.assumeLeadership('chat-generation', 1);
    const first = host.admit({
      chatId: 'chat-generation',
      runId: 'run-generation',
      trigger: 'submit',
      message: { id: 'turn-generation', role: 'user', content: 'Wait.' },
    });
    const firstFailure = expect(first).rejects.toMatchObject({ code: 'LEADERSHIP_LOST' });
    await started.promise;
    await host.relinquish('chat-generation');
    await firstFailure;

    host.assumeLeadership('chat-generation', 2);
    await host.resume('chat-generation');
    const log = await file.open();
    const events = await log.read();
    /* Each incarnation writes under its own term; the term's integer epoch is the ledger's (W6 RH-S3). */
    const firstRow = events[0]!;
    expect(events.at(-1)?.leaderEpoch).not.toBe(firstRow.leaderEpoch);
    expect(events.at(-1)?.epoch).toBeGreaterThan(firstRow.epoch ?? 0);
    await host.close();
  });

  it('applies retry history-prefix semantics through an explicit rewind event and exposes bounded replay', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 3)),
        toolRegistry: tools(async () => ({ content: 'fixture-main', isError: false })),
        idPrefix: 'rewind',
      }),
    );
    await host.admit({
      chatId: 'chat-rewind',
      runId: 'run-original',
      trigger: 'submit',
      message: { id: 'turn-original', role: 'user', content: 'Original.' },
    });
    await host.admit({
      chatId: 'chat-rewind',
      runId: 'run-retry',
      trigger: 'edit',
      retainedMessageIds: [],
      message: { id: 'turn-original', role: 'user', content: 'Edited.' },
    });

    const log = await file.open();
    const events = await log.read();
    expect(events).toContainEqual(expect.objectContaining({ type: 'history.rewound', trigger: 'edit' }));
    // RA-R3 (RowsNeedRun): the attempt's intent row precedes its rewind.
    const admittedAt = events.findIndex(
      (event) => event.type === 'run.lifecycle' && event.runId === 'run-retry' && event.state === 'admitted',
    );
    expect(admittedAt).toBeGreaterThanOrEqual(0);
    expect(admittedAt).toBeLessThan(events.findIndex((event) => event.type === 'history.rewound'));
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-original']);
    const batch = await host.readEvents({ chatId: 'chat-rewind', cursor: 1, limit: 2 });
    expect(batch).toMatchObject({ cursor: 1, nextCursor: 3 });
    expect(Array.isArray(batch.events)).toBe(true);
    await host.close();
  });

  /**
   * F2, closeout: a rewind of any turn but the first.
   *
   * The client's transcript and this log do not share assistant message ids —
   * one run is one assistant message on a page and any number of provider
   * messages here — so a client can only ever name the *user* message its turn
   * belongs to. Matching its `retainedMessageIds` against this projection
   * refused every *Try again* and every edit whose retained prefix contained
   * an assistant message, which is every one after the first turn.
   */
  it('rewinds to the turn the client names, not to the prefix it guessed', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 3)),
        toolRegistry: tools(async () => ({ content: 'fixture-main', isError: false })),
        idPrefix: 'anchor',
      }),
    );
    await host.admit({
      chatId: 'chat-anchor',
      runId: 'run-one',
      trigger: 'submit',
      message: { id: 'turn-one', role: 'user', content: 'First.' },
    });
    await host.admit({
      chatId: 'chat-anchor',
      runId: 'run-two',
      trigger: 'submit',
      message: { id: 'turn-two', role: 'user', content: 'Second.' },
    });

    /* What the page retains: its own ids, where the assistant message of turn
     * one is named after the run that produced it. */
    await host.admit({
      chatId: 'chat-anchor',
      runId: 'run-three',
      trigger: 'regenerate',
      retainedMessageIds: ['turn-one', 'run-one'],
      message: { id: 'turn-two', role: 'user', content: 'Second.' },
    });

    const log = await file.open();
    const events = await log.read();
    expect(events).toContainEqual(expect.objectContaining({ type: 'history.rewound', trigger: 'regenerate' }));
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-one', 'turn-two']);
    await host.close();
  });

  it('resolves every tool call of a turn that fires four of them at once', async () => {
    // The API-coordinated placement deadlocked here (Postgres 40P01): three
    // delivery transactions locked `chat_rpc_exchange` rows and the
    // `chat_workspace_lease` tuple in different orders, the RPC was committed
    // without live delivery, and the tool results stayed at "[Pending...]"
    // forever. The host executes tools in-process against the workspace, so no
    // such lock exists — this pins that every call of a parallel batch lands.
    const file = createMemoryLogFile();
    const entered = new Set<string>();
    const allEntered = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport([
          {
            id: 'fixture-parallel-tools',
            toolCalls: [
              { id: 'call-skill', name: 'read_file', input: { targetFile: 'SKILL.md' } },
              { id: 'call-read-1', name: 'read_file', input: { targetFile: 'a.ts' } },
              { id: 'call-read-2', name: 'read_file', input: { targetFile: 'b.ts' } },
              { id: 'call-read-3', name: 'read_file', input: { targetFile: 'c.ts' } },
            ],
            usage: { inputTokens: 100, outputTokens: 8 },
          },
          {
            id: 'fixture-parallel-done',
            text: 'All four tool results are in.',
            usage: { inputTokens: 120, outputTokens: 6 },
          },
        ]),
        // No call may complete until every call has started: a serialized
        // executor would deadlock this fixture rather than pass it silently.
        toolRegistry: tools(async (call) => {
          const targetFile = String((call.input as { readonly targetFile: string }).targetFile);
          entered.add(targetFile);
          if (entered.size === 4) {
            allEntered.resolve();
          }
          await allEntered.promise;
          return { content: `contents of ${targetFile}`, isError: false };
        }),
        idPrefix: 'parallel',
      }),
    );

    await host.admit({
      chatId: 'chat-parallel',
      runId: 'run-parallel',
      trigger: 'submit',
      message: { id: 'turn-parallel', role: 'user', content: 'Read all four.' },
    });

    const log = await file.open();
    const events = await log.read();
    const outputs = reduceEventLog(events).filter((message) => message.role === 'tool-output');
    expect(outputs.map((message) => message.toolCallId).sort()).toEqual([
      'call-read-1',
      'call-read-2',
      'call-read-3',
      'call-skill',
    ]);
    // None left pending, none failed.
    expect(outputs.every((message) => !message.isError)).toBe(true);
    await host.close();
  });

  it('runs a rewinding trigger against an empty log as the first turn it is', async () => {
    // A chat whose first turn never reached the host has an empty log, and an
    // empty log has no prefix any retain can match — so the prefix guard
    // refused every later retry and the chat was permanently stuck with no way
    // out. There is nothing to rewind: the turn *is* a submit.
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 1)),
        toolRegistry: tools(async () => ({ content: 'fixture-main', isError: false })),
        idPrefix: 'empty-rewind',
      }),
    );

    await expect(
      host.admit({
        chatId: 'chat-empty-rewind',
        runId: 'run-retry',
        trigger: 'retry',
        retainedMessageIds: [],
        message: { id: 'turn-first', role: 'user', content: 'Retry of a turn that never ran.' },
      }),
    ).resolves.toContainEqual(
      expect.objectContaining({ id: 'turn-first', role: 'user', content: 'Retry of a turn that never ran.' }),
    );

    const log = await file.open();
    const events = await log.read();
    // Nothing was rewound, so nothing claims it was.
    expect(events.some((event) => event.type === 'history.rewound')).toBe(false);
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-first']);
    await host.close();
  });

  it('hands the second turn of a chat the session the first one remembered', async () => {
    const file = createMemoryLogFile();
    const seen: Array<{ readonly agentId: string; readonly state: JsonObject | undefined }> = [];
    const closedChats: string[] = [];
    let nextSession = 0;
    const placement = fakePlacement({ registry: tools(async () => ({ content: null, isError: false })) });
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent', 'other-agent'],
      run: async (turn) => {
        seen.push({ agentId: turn.agentId, state: turn.state });
        if (typeof turn.state?.['acpSessionId'] !== 'string') {
          nextSession += 1;
          await turn.remember({ acpSessionId: `session-${String(nextSession)}`, model: 'stub-model' });
        }
      },
      closeChat: async (chatId) => {
        closedChats.push(chatId);
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-session',
      }),
      placement: placement.port,
      externalRunners: { acp: externalPort },
    });

    const start = async (input: {
      readonly runId: string;
      readonly messageId: string;
      readonly agentId: string;
    }): Promise<void> => {
      await host.admit({
        chatId: 'chat-external-session',
        runId: input.runId,
        trigger: 'submit',
        message: { id: input.messageId, role: 'user', content: 'Run this elsewhere.' },
        config: {
          systemPrompt: 'unused by an external turn',
          toolChoice: 'none',
          agent: { kind: 'acp', id: input.agentId },
        },
      });
      await host.cancel({ runId: input.runId });
      /* The cancelled attempt settles (RA-R12) before the chat takes the next start. */
      await vi.waitFor(() => {
        const acknowledged = placement.calls.filter((call) => call.verb === 'acknowledge');
        expect(acknowledged.map((call) => call.key.runId)).toContain(input.runId);
      });
    };

    await start({ runId: 'run-1', messageId: 'turn-1', agentId: 'stub-agent' });
    await start({ runId: 'run-2', messageId: 'turn-2', agentId: 'stub-agent' });
    // A different agent in the same chat never inherits another vendor's session.
    await start({ runId: 'run-3', messageId: 'turn-3', agentId: 'other-agent' });

    expect(seen[0]?.state?.['acpSessionId']).toBeUndefined();
    expect(seen[1]?.state).toMatchObject({ acpSessionId: 'session-1', model: 'stub-model', agentId: 'stub-agent' });
    expect(seen[2]?.state?.['acpSessionId']).toBeUndefined();

    /* A rewind retracts a turn the vendor thread still holds, so the runner is
     * told to end that session and the retained selection loses its id. */
    const log = await file.open();
    const retained = reduceEventLog(await log.read())
      .map((message) => message.id)
      .slice(0, 1);
    await host.admit({
      chatId: 'chat-external-session',
      runId: 'run-4',
      trigger: 'retry',
      retainedMessageIds: retained,
      message: { id: 'turn-4', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });
    await host.cancel({ runId: 'run-4' });
    expect(closedChats).toEqual(['chat-external-session']);
    expect(seen[3]?.state?.['acpSessionId']).toBeUndefined();
    expect(seen[3]?.state).toMatchObject({ model: 'stub-model' });

    await host.close();
    // Closing the host ends every chat the runner still holds open.
    expect(closedChats).toEqual(['chat-external-session', 'chat-external-session']);
  });

  it('should record the stop details an external runner throws on its failed run', async () => {
    const file = createMemoryLogFile();
    const details = {
      agentId: 'stub-agent',
      failure: { category: 'limit', title: 'You have hit your usage limit.', actions: [] },
    };
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async () => {
        throw Object.assign(new Error('You have hit your usage limit.'), {
          code: 'EXTERNAL_AGENT_LIMIT_REACHED',
          details,
        });
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-stop',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-stop',
      runId: 'run-external-stop',
      trigger: 'submit',
      message: { id: 'turn-external-stop', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });

    await vi.waitFor(async () => {
      const log = await file.open();
      const events = await log.read();
      const failed = events.flatMap((event) =>
        event.type === 'run.lifecycle' && event.state === 'failed' ? [event.detail] : [],
      );
      expect(failed).toEqual([
        { message: 'You have hit your usage limit.', code: 'EXTERNAL_AGENT_LIMIT_REACHED', details },
      ]);
    });
    await host.close();
  });

  it.each([
    ['a retry the agent offers', ['retry'], true],
    // A usage limit: nothing helps *now*, and what clears it is time.
    ['a usage limit with no action at all', [], true],
    ['a context limit only a new session clears', ['new_session'], false],
  ] as const)('continues an external stop on the session it remembered for %s', async (_label, actions, resumable) => {
    const file = createMemoryLogFile();
    const seen: Array<JsonObject | undefined> = [];
    const closedChats: string[] = [];
    let attempt = 0;
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        seen.push(turn.state);
        attempt += 1;
        if (attempt > 1) {
          return;
        }
        await turn.remember({ acpSessionId: 'session-1' });
        throw Object.assign(new Error('The agent is rate limited.'), {
          code: 'EXTERNAL_AGENT_LIMIT_REACHED',
          details: {
            agentId: 'stub-agent',
            failure: { category: 'limit', title: 'The agent is rate limited.', actions },
          },
        });
      },
      closeChat: async (chatId) => {
        closedChats.push(chatId);
      },
    };
    const slug = actions.join('-') || 'none';
    const chatId = `chat-external-${slug}`;
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: `external-${slug}`,
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId,
      runId: 'run-external-limit',
      trigger: 'submit',
      message: { id: 'turn-external-limit', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });
    await vi.waitFor(async () => {
      const settling = await host.snapshot(chatId);
      expect(settling.state).toBe('failed');
    });
    /* The gesture a person actually makes: a surface reads the run's failure
     * off the snapshot and only calls resume when that record says it can be
     * continued. An external stop writes no assistant diagnostic, so a
     * snapshot that reported no failure at all made every Resume a rewind
     * (F1). */
    const stopped = await host.snapshot(chatId);
    expect(stopped.failure).toMatchObject({
      code: 'EXTERNAL_AGENT_LIMIT_REACHED',
      message: 'The agent is rate limited.',
    });
    expect(isResumableRunFailure(stopped.failure, 'external')).toBe(resumable);
    await host.resume(chatId);
    if (!resumable) {
      const settled = await readLog(file);
      expect(seen).toHaveLength(1);
      expect(settled.flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []))).toEqual([
        'admitted',
        'running',
        'failed',
      ]);
      await host.close();
      return;
    }
    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });
    const events = await readLog(file);
    /* The agent said retrying can help, so the turn continues in the vendor
     * session it already holds: nothing told the runner to close the chat,
     * the second attempt carries the remembered session id, and the turn is
     * neither rewound nor sent a second time (R9/S11). */
    expect(seen).toHaveLength(2);
    expect(closedChats).toEqual([]);
    expect(seen[1]).toMatchObject({ acpSessionId: 'session-1', agentId: 'stub-agent' });
    expect(events.some((event) => event.type === 'history.rewound')).toBe(false);
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-external-limit']);
    await host.close();
  });

  it('holds cancel open until an external run settles as cancelled', async () => {
    const file = createMemoryLogFile();
    const settled = Promise.withResolvers<void>();
    let aborted = false;
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        turn.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            // A real adapter answers `session/cancel` a beat later, with its
            // own terminal stop reason; settle after the turn, not inside it.
            globalThis.setTimeout(() => {
              settled.resolve();
            }, 20);
          },
          { once: true },
        );
        await settled.promise;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-cancel',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-cancel',
      runId: 'run-external-cancel',
      trigger: 'submit',
      message: { id: 'turn-external-cancel', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });
    await expect(host.snapshot('chat-external-cancel')).resolves.toMatchObject({ state: 'running' });

    await host.cancel({ runId: 'run-external-cancel' });

    expect(aborted).toBe(true);
    await expect(host.snapshot('chat-external-cancel')).resolves.toMatchObject({ state: 'cancelled' });
    await host.close();
  });
  it('admits a run whose only record is a settlement written under its id', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [...completedFirstTurn, settlementOnlySecondRun]);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'settlement-only',
      }),
    );

    await host.admit({
      chatId: 'chat-settlement-only',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });

    const events = await readLog(file);
    expect(
      events.flatMap((event) => (event.runId === 'run-2' && event.type === 'run.lifecycle' ? [event.state] : [])),
    ).toEqual(['admitted', 'running', 'completed']);
    /* The turn the user actually sent is committed under the new run, which is
     * what a replayed `start` reads to tell a real admission from a phantom. */
    expect(
      events.find((event) => event.runId === 'run-2' && event.type === 'turn.history-projection-committed'),
    ).toMatchObject({ message: { id: 'turn-2' } });
    await host.close();
  });

  it('refuses a re-admission of a run that already has a lifecycle record', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'readmit',
      }),
    );

    await expect(
      host.admit({
        chatId: 'chat-readmit',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1-again', role: 'user', content: 'Again.' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_ID_TAKEN', runId: 'run-1' });
    await host.close();
  });

  it('names the last run with a lifecycle and resumes nothing for a settlement-only tail', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [...completedFirstTurn, settlementOnlySecondRun]);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'settlement-tail',
      }),
    );

    await expect(host.snapshot('chat-settlement-only')).resolves.toMatchObject({
      runId: 'run-1',
      state: 'completed',
    });
    const before = await readLog(file);
    await host.resume('chat-settlement-only');

    const after = await readLog(file);
    expect(after).toHaveLength(before.length);
    await host.close();
  });

  it('refuses a settlement for a run that was never admitted', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);

    await expect(
      appendSettlement(file, 'run-unknown', {
        type: 'turn.failed',
        turnId: 'turn-1',
        chatId: 'chat-unadmitted',
        reason: 'The turn ended before it recorded a revision.',
      }),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_WITHOUT_RUN' });
    const remaining = await readLog(file);
    expect(remaining).toHaveLength(completedFirstTurn.length);
  });
});

/**
 * The run ledger, driven through a real host (R9, C5).
 *
 * `admit`, `resume` and the settlement writers each used to decide their own
 * legality from a different reading of the same facts, and the table that was
 * meant to unify them was read by two of the four operations and pinned by a
 * test that re-declared it. These rows drive a host over scripted logs instead,
 * one per cell of the fold.
 */
describe('the host run ledger', () => {
  const ledgerHost = (file: ReturnType<typeof createMemoryLogFile>, idPrefix: string) =>
    createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix,
      }),
    );

  const settlement = {
    type: 'turn.failed',
    turnId: 'turn-1',
    chatId: 'chat-ledger',
    reason: 'The turn ended before it recorded a revision.',
  } as const;

  /** One seeded body under the envelope the fold reads it through. */
  const recorded = (event: SeededLogEvent, sequence: number): AgentLogEvent =>
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- one envelope over a closed union of seeded bodies.
    ({
      ...event,
      version: 1,
      leaderEpoch: 'epoch-fold',
      sequence,
      recordedAt: '2026-09-26T00:00:00.000Z',
    }) as AgentLogEvent;

  it('should fold one log into the chat run and every run append state', () => {
    const seeded: readonly SeededLogEvent[] = [
      ...completedFirstTurn,
      {
        type: 'turn.finalized',
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-ledger',
        projectId: 'project-1',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-1'],
      },
      { type: 'run.lifecycle', runId: 'run-2', state: 'admitted' },
      settlementOnlySecondRun,
    ];

    const ledger = foldChatLedger(
      emptyChatLedger,
      seeded.map((event, index) => recorded(event, index)),
    );

    expect(ledger.currentRunId).toBe('run-2');
    expect(chatRunState(ledger)).toBe('admitted');
    expect(ledger.runs['run-1']?.appendState).toBe('settled');
    /* `run-2` carries both an admission and, from the seeded tail, a
     * settlement — the shape a fixed host will no longer write. */
    expect(ledger.runs['run-2']?.appendState).toBe('settled');
    expect(chatRunState(emptyChatLedger)).toBe('none');
  });

  // CL-A15 (L2a D18): the host folds a log once and then folds its own appends; it never re-reads per append.
  it('should append without re-reading the log', async () => {
    const file = createMemoryLogFile();
    /* Keyed, so opening abandons it and then settles it: two appends of the host's own. */
    await seedLog(file, [
      { ...orphanedFirstTurn[0]!, commandId: 'start-1' } satisfies SeededLogEvent,
      ...orphanedFirstTurn.slice(1),
    ]);
    let reads = 0;
    const readsAtAppend: number[] = [];
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: async () => {
          const log = await file.open();
          return {
            ...log,
            read: async () => {
              reads++;
              return log.read();
            },
            append: async (row) => {
              readsAtAppend.push(reads);
              return log.append(row);
            },
          };
        },
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'no-reread',
      }),
    );

    /* Opening folds the log; the abandonment and the settlement are folded from the host's own appends. */
    await host.markAbandoned('chat-ledger');

    const log = await readLog(file);
    expect(log.map((row) => row.type).slice(orphanedFirstTurn.length)).toEqual(['run.lifecycle', 'turn.finalized']);
    expect(readsAtAppend).toHaveLength(2);
    expect(readsAtAppend[1]).toBe(readsAtAppend[0]);
    await host.close();
  });

  // SC-R14 (W4.r1): a row appended while an empty read is in flight wakes that read; it must not park past it.
  it('should answer a read with a row appended while its empty read was in flight', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, orphanedFirstTurn);
    let raced = false;
    const host: TauAgentHost = createTauAgentHost(
      hostOptions({
        openEventLog: async () => {
          const log = await file.open();
          return {
            ...log,
            readBatch: async (request) => {
              const answer = await log.readBatch(request);
              if (!raced && answer.status === 'batch' && answer.events.length === 0) {
                raced = true;
                await host.markAbandoned('chat-ledger');
              }
              return answer;
            },
          };
        },
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'read-race',
      }),
    );
    const parked = new AbortController();
    const timer = setTimeout(() => {
      parked.abort();
    }, 2000);

    const answer = await host.read({
      chatId: 'chat-ledger',
      cursor: orphanedFirstTurn.length,
      limit: 16,
      maxBytes: 1_048_576,
      signal: parked.signal,
    });
    clearTimeout(timer);

    // Answered by the row's wake, not by the reader giving up and re-reading.
    expect({ gaveUp: parked.signal.aborted, answer }).toMatchObject({
      gaveUp: false,
      answer: { status: 'batch', events: [{ type: 'run.lifecycle', state: 'failed' }] },
    });
    await host.close();
  });

  // CL-S10 (L2a D18): eviction closes the chat's log and drops its ledger; the next use reopens and refolds.
  it('should reopen an evicted chat with an equal ledger', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, orphanedFirstTurn);
    let opens = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: async () => {
          opens++;
          return file.open();
        },
        transport: {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'evict',
      }),
    );
    await host.markAbandoned('chat-ledger');
    const before = await host.describeRun('chat-ledger');

    await host.evictChat('chat-ledger');

    expect(await host.describeRun('chat-ledger')).toEqual(before);
    // The abandonment is still recognised: the refolded ledger holds it, so nothing is abandoned twice.
    await host.markAbandoned('chat-ledger');
    expect(opens).toBe(2);
    const rows = await readLog(file);
    expect(rows.length).toBe(orphanedFirstTurn.length + 1);
    await host.close();
  });

  it('should treat an identical repeat of a settlement as a no-op', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);

    await appendSettlement(file, 'run-1', settlement);
    const once = await readLog(file);
    await appendSettlement(file, 'run-1', settlement);

    /* At-least-once delivery is what makes "exactly one settlement" reachable
     * at all, so the repeat has to add nothing rather than refuse (V10). */
    expect(await readLog(file)).toHaveLength(once.length);
  });

  it('should refuse a second settlement that says something else', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);

    await appendSettlement(file, 'run-1', settlement);

    await expect(
      appendSettlement(file, 'run-1', {
        type: 'turn.finalized',
        turnId: 'turn-1',
        chatId: 'chat-ledger',
        projectId: 'project-1',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-1'],
      }),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_CONFLICT' });
  });

  // N4 (W8): M1's append keeps the attempt a settlement states; a late one never settles the attempt a Resume opened.
  it('should not settle a resumed attempt with a late settlement of the attempt before it', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      ...completedFirstTurn.slice(0, 3),
      { type: 'run.lifecycle', runId: 'run-1', state: 'failed', detail: { code: 'RATE_LIMITED', message: 'Busy.' } },
      /* The quick Resume: attempt 2 opens before attempt 1's settlement is appended. */
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);

    await appendSettlement(file, 'run-1', { ...settlement, attempt: 1 }).catch(() => undefined);

    const log = await readLog(file);
    const settlements = log.filter((row) => row.type === 'turn.failed');
    expect(settlements.every((row) => row.attempt === 1)).toBe(true);
    /* Attempt 2 is still unsettled, so its own settlement is taken. */
    await appendSettlement(file, 'run-1', { ...settlement, attempt: 2 });
    const logged = await readLog(file);
    expect(logged.filter((row) => row.type === 'turn.failed').map((row) => row.attempt)).toEqual(
      expect.arrayContaining([2]),
    );
  });

  it('should refuse to describe a chat whose log admitted no run', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [settlementOnlySecondRun]);
    const host = ledgerHost(file, 'no-run');

    /* R2: a run with no lifecycle record is not a run. `snapshot` answered
     * `admitted` for one, which is the same default that made an abandoned
     * lease's settlement look like a live turn. */
    await expect(host.snapshot('chat-no-run')).rejects.toMatchObject({ code: 'NO_RUN_ADMITTED' });
    await host.close();
  });

  it.each([
    [undefined, 'none'],
    ['admitted', 'admitted'],
    ['running', 'running'],
    ['paused', 'paused'],
    ['completed', 'terminal'],
    ['failed', 'terminal'],
    ['cancelled', 'terminal'],
  ] as const)('should read the lifecycle %s as %s', (lifecycle, expected) => {
    const states = lifecycle === undefined ? [] : [...new Set(['admitted', lifecycle] as const)];
    const ledger = foldChatLedger(
      emptyChatLedger,
      states.map((state, index) => recorded({ type: 'run.lifecycle', runId: 'run-1', state }, index)),
    );
    expect(chatRunState(ledger)).toBe(expected);
  });
});

describe('the attempt ledger and its refusal taxonomy', () => {
  /** A first turn stopped inside the admission window: records, and no projection. */
  const stoppedInAdmission: readonly SeededLogEvent[] = [
    { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
    { type: 'run.lifecycle', runId: 'run-1', state: 'cancelled' },
  ];

  const settlementOf = (
    input: { readonly runId: string; readonly chatId: string } & Partial<{ readonly revisionId: string }>,
  ) =>
    ({
      type: 'turn.finalized',
      turnId: `turn-${input.runId}`,
      chatId: input.chatId,
      projectId: 'project-1',
      changedPaths: ['main.ts'],
      trigger: 'turn',
      runIds: [input.runId],
      ...(input.revisionId === undefined ? {} : { revisionId: input.revisionId }),
    }) as const;

  const silentHost = (file: ReturnType<typeof createMemoryLogFile>, idPrefix: string, stream?: ModelTransport) =>
    createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: stream ?? {
          funding: { type: 'unfunded' },
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'text-delta', text: 'ok' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix,
      }),
    );

  it('admits a rewinding gesture on a chat whose first run committed no turn', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, stoppedInAdmission);
    const host = silentHost(file, 'wedge');

    /* The log is not empty and the projection is: gating the prefix check on
     * records instead of history refused this forever with
     * `HISTORY_PREFIX_INVALID`. */
    await host.admit({
      chatId: 'chat-wedge',
      runId: 'run-2',
      trigger: 'regenerate',
      retainedMessageIds: [],
      message: { id: 'turn-2', role: 'user', content: 'Try again.' },
    });

    const events = await readLog(file);
    expect(
      events.flatMap((event) => (event.type === 'run.lifecycle' && event.runId === 'run-2' ? [event.state] : [])),
    ).toEqual(['admitted', 'running', 'completed']);
    await host.close();
  });

  it('retains a whole history prefix, as the reducer already allows', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = silentHost(file, 'prefix');
    const retained = reduceEventLog(await readLog(file)).map((message) => message.id);

    /* `>=` was one stricter than `reducer.ts`'s `retained.length <= messages.length`. */
    await host.admit({
      chatId: 'chat-prefix',
      runId: 'run-2',
      trigger: 'edit',
      retainedMessageIds: retained,
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });

    expect(await host.snapshot('chat-prefix')).toMatchObject({ runId: 'run-2', state: 'completed' });
    await host.close();
  });

  it('rules every lifecycle record an attempt may add', () => {
    const { table } = lifecycleTable;
    // `admitted` is a run's first word.
    expect(table.unadmitted.admitted).toBe('ok');
    expect(table.open.admitted).toBe('RUN_ID_TAKEN');
    expect(table.ended.admitted).toBe('RUN_ID_TAKEN');
    // Everything before the settlement stays legal: teardown re-records, resume reopens.
    expect(table.ended.cancelled).toBe('ok');
    expect(table.ended.running).toBe('ok');
    /* A settlement that landed while the run was executing does not stop it
     * recording how it ended — refusing that row would kill a live run. */
    expect(table['settled-open'].completed).toBe('ok');
    // Once it has ended and settled, only a reopening `running` may follow.
    expect(table.reopenable.completed).toBe('RUN_ID_TAKEN');
    expect(table.settled.running).toBe('RUN_ID_TAKEN');
    expect(table.reopenable.running).toBe('ok');
  });

  it('refuses a lifecycle record an external runner writes for a settled run', async () => {
    const file = createMemoryLogFile();
    const refusals: unknown[] = [];
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        await turn.append([
          { type: 'turn.failed', chatId: 'chat-external-settled', turnId: 'turn-1', reason: 'Nothing to record.' },
        ]);
        await turn.append([{ type: 'run.lifecycle', state: 'admitted' }]).catch((error: unknown) => {
          refusals.push(error);
        });
        return undefined;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-settled',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-settled',
      runId: 'run-external-settled',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Run this elsewhere.' },
      config: { systemPrompt: 'unused', toolChoice: 'none', agent: { kind: 'acp', id: 'stub-agent' } },
    });

    await vi.waitFor(() => {
      expect(refusals).toHaveLength(1);
    });
    expect(refusals[0]).toMatchObject({ code: 'RUN_ID_TAKEN', runId: 'run-external-settled' });
    await host.close();
  });

  it('refuses a batch of two differing settlements whole, writing neither', async () => {
    const file = createMemoryLogFile();
    const refusals: unknown[] = [];
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        await turn
          .append([
            { type: 'turn.failed', chatId: 'chat-external-batch', turnId: 'turn-1', reason: 'First.' },
            { type: 'turn.failed', chatId: 'chat-external-batch', turnId: 'turn-1', reason: 'Second.' },
          ])
          .catch((error: unknown) => {
            refusals.push(error);
          });
        return undefined;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-batch',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-batch',
      runId: 'run-external-batch',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Run this elsewhere.' },
      config: { systemPrompt: 'unused', toolChoice: 'none', agent: { kind: 'acp', id: 'stub-agent' } },
    });

    await vi.waitFor(() => {
      expect(refusals).toHaveLength(1);
    });
    expect(refusals[0]).toMatchObject({ code: 'SETTLEMENT_CONFLICT' });
    const recorded = await readLog(file);
    // The gate refuses the batch at its first refused row, before anything is written (T9).
    expect(recorded.filter((event) => event.type === 'turn.failed')).toHaveLength(0);
    await host.close();
  });

  it('refuses a settlement that drops what the stored one named', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const stored = settlementOf({ runId: 'run-1', chatId: 'chat-union', revisionId: 'rev-1' });
    await appendSettlement(file, 'run-1', stored);

    /* Comparing only the *new* body's keys made a settlement that named no
     * revision dedupe against one that named a revision: the key was absent,
     * so it was never compared. */
    const { revisionId: _dropped, ...poorer } = stored;
    await expect(appendSettlement(file, 'run-1', poorer)).rejects.toMatchObject({ code: 'SETTLEMENT_CONFLICT' });

    // An identical repeat is still the delivery guarantee doing its job.
    await appendSettlement(file, 'run-1', { ...stored });
    const recorded = await readLog(file);
    expect(recorded.filter((event) => event.type === 'turn.finalized')).toHaveLength(1);
  });

  it("refuses a live chat with one code, and abandons a dead host's run at opening instead", async () => {
    const durableFile = createMemoryLogFile();
    await seedLog(durableFile, [
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);
    const durableHost = silentHost(durableFile, 'live-durable');

    /* The branch a reload-then-send reaches: a fresh host has no slot for run-1, so its driver died with the last
     * incarnation. Opening abandons it as the new term's claim (RA-R9, I13), and the send is admitted. */
    await durableHost.admit({
      chatId: 'chat-live-durable',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });
    const abandonedLog = await readLog(durableFile);
    const abandoned = abandonedLog.find(
      (event) => event.runId === 'run-1' && event.type === 'run.lifecycle' && event.state === 'failed',
    );
    expect(abandoned).toMatchObject({ detail: { code: 'RUN_ABANDONED' } });

    // And the same run id, refused as taken rather than as a live run.
    await expect(
      durableHost.admit({
        chatId: 'chat-live-durable',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-3', role: 'user', content: 'Third.' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_ID_TAKEN', runId: 'run-1' });
    await durableHost.close();

    const memoryFile = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    const memoryHost = silentHost(memoryFile, 'live-memory', {
      funding: { type: 'unfunded' },
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        await release.promise;
        yield { type: 'completed', stopReason: 'stop' };
      },
    });
    const first = memoryHost.admit({
      chatId: 'chat-live-memory',
      runId: 'run-a',
      trigger: 'submit',
      message: { id: 'turn-a', role: 'user', content: 'First.' },
    });
    await vi.waitFor(async () => {
      const live = await memoryHost.describeRun('chat-live-memory');
      expect(live?.state).toBe('running');
    });
    await expect(
      memoryHost.admit({
        chatId: 'chat-live-memory',
        runId: 'run-b',
        trigger: 'submit',
        message: { id: 'turn-b', role: 'user', content: 'Second.' },
      }),
    ).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', runId: 'run-a' });
    release.resolve();
    await first;
    await memoryHost.close();
  });

  it('describes a chat with no admitted run instead of refusing it', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [settlementOnlySecondRun]);
    const host = silentHost(file, 'describe');

    /* `attach` and every command epilogue read through here: a thrown
     * `NO_RUN_ADMITTED` made a chat in this shape impossible to open again. */
    await expect(host.describeRun('chat-settlement-only')).resolves.toBeUndefined();
    await expect(host.snapshot('chat-settlement-only')).rejects.toMatchObject({ code: 'NO_RUN_ADMITTED' });
    await expect(host.describeRun('chat-never-written')).resolves.toBeUndefined();
    await host.close();
  });

  it('waits for the admission of the run the caller names', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    const host = silentHost(file, 'ack', {
      funding: { type: 'unfunded' },
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        await release.promise;
        yield { type: 'completed', stopReason: 'stop' };
      },
    });
    const running = host.admit({
      chatId: 'chat-ack',
      runId: 'run-a',
      trigger: 'submit',
      message: { id: 'turn-a', role: 'user', content: 'First.' },
    });

    await expect(host.waitForAdmission('chat-ack', 'run-a')).resolves.toMatchObject({ runId: 'run-a' });
    /* Asking by chat alone answered one command with whatever run the chat was
     * on, which is the run-id mismatch this wait exists to prevent. */
    await expect(host.waitForAdmission('chat-ack', 'run-b')).resolves.toBeUndefined();
    release.resolve();
    await running;
    await host.close();
  });

  it('records an abandoned run as failed rather than resuming it', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);
    const requests: ModelStreamRequest[] = [];
    const host = silentHost(file, 'abandoned', {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'completed', stopReason: 'stop' };
      },
    });

    const marked = await host.markAbandoned('chat-abandoned');

    /* Never a provider call: the turn was asked once and paid for once. */
    expect(requests).toHaveLength(0);
    expect(marked).toMatchObject({ runId: 'run-1', state: 'failed' });
    expect(marked?.failure).toMatchObject({ code: 'RUN_ABANDONED' });
    expect(isResumableRunFailure(marked?.failure)).toBe(true);
    await host.close();
  });

  it('leaves a paused run paused and a live run alone', async () => {
    const pausedFile = createMemoryLogFile();
    await seedLog(pausedFile, [
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'paused' },
    ]);
    const host = silentHost(pausedFile, 'paused-abandon');
    const before = await readLog(pausedFile);

    expect(await host.markAbandoned('chat-paused')).toMatchObject({ runId: 'run-1', state: 'paused' });
    expect(await readLog(pausedFile)).toHaveLength(before.length);
    await host.close();
  });

  /** One assistant message as the stream wrapper leaves it when a call is refused. */
  const refusalMarker = (id: string, code: string): ProviderMessage => ({
    id,
    role: 'assistant',
    content: [],
    metadata: {
      diagnostics: [
        {
          type: 'tau.model-transport-failure',
          timestamp: 1,
          error: { name: 'GatewayModelTransportError', message: 'The stream dropped.', code },
          details: { status: 200, refusal: { routeId: 'route' } },
        },
      ],
    },
  });

  it("names this run's failure after an older run left its marker in the history", async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      { type: 'message.appended', runId: 'run-1', message: refusalMarker('assistant-1', 'NETWORK_ERROR') },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: { code: 'NETWORK_ERROR', message: 'The stream dropped.' },
      },
      /* A plain resend rather than a Resume: nothing rewinds run-1's marker, so
       * it is still the newest diagnostic the chat's history holds. */
      { type: 'message.appended', runId: 'run-2', message: { id: 'turn-2', role: 'user', content: 'Second.' } },
      { type: 'run.lifecycle', runId: 'run-2', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-2', state: 'running' },
    ]);
    const host = silentHost(file, 'stale-marker');

    const marked = await host.markAbandoned('chat-stale-marker');

    /* A snapshot's failure is a fact about the run it names: the page keys the
     * saved-turn card and `isResumableRunFailure` off it, so an older run's
     * refusal leaking in shows the wrong card for this one. */
    expect(marked).toMatchObject({ runId: 'run-2', state: 'failed' });
    expect(marked?.failure).toEqual({
      code: 'RUN_ABANDONED',
      message: 'The host executing this run is gone. Resume the turn to continue it.',
    });
    await host.close();
  });

  it("prefers a run's own transport diagnostic to the codeless detail its terminal row carries", async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      { type: 'message.appended', runId: 'run-1', message: refusalMarker('assistant-1', 'RATE_LIMITED') },
      /* What the host's own catch records for a throw that carried no code:
       * the transport's status and refusal fields live only on the marker. */
      { type: 'run.lifecycle', runId: 'run-1', state: 'failed', detail: { message: 'The stream dropped.' } },
    ]);
    const host = silentHost(file, 'own-marker');

    const described = await host.snapshot('chat-own-marker');

    expect(described.failure).toEqual({
      code: 'RATE_LIMITED',
      message: 'The stream dropped.',
      status: 200,
      details: { routeId: 'route' },
    });
    await host.close();
  });

  /** A run whose page died mid-turn, as `markAbandoned` leaves it. */
  const abandonedAfter = (tail: ProviderMessage): readonly SeededLogEvent[] => [
    { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
    { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
    { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    { type: 'message.appended', runId: 'run-1', message: tail },
    {
      type: 'run.lifecycle',
      runId: 'run-1',
      state: 'failed',
      detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
    },
  ];

  it('resumes an abandoned run from the agent work its tail already holds', async () => {
    const file = createMemoryLogFile();
    await seedLog(
      file,
      abandonedAfter({ id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Half an answer.' }] }),
    );
    const requests: ModelStreamRequest[] = [];
    const host = silentHost(file, 'abandoned-tail', {
      funding: { type: 'unfunded' },
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'completed', stopReason: 'stop' };
      },
    });

    /* `RUN_ABANDONED` is resumable, so the terminal branch runs the failure
     * marker's clearance over a tail that is not a marker at all: the agent's
     * own committed text. Rewinding it loses the work and asks — and pays for —
     * the turn a second time. */
    const resumed = await host.resume('chat-abandoned-tail');
    const events = await readLog(file);

    expect(events.filter((event) => event.type === 'history.rewound')).toHaveLength(0);
    expect(resumed.at(-1)).toMatchObject({ id: 'assistant-1', content: [{ type: 'text', text: 'Half an answer.' }] });
    expect(requests).toHaveLength(0);
    await host.close();
  });

  it("answers an abandoned run's unanswered tool call instead of retracting it", async () => {
    const file = createMemoryLogFile();
    await seedLog(
      file,
      abandonedAfter({
        id: 'assistant-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading main.ts.' },
          { type: 'toolCall', id: 'call-read', name: 'read_file', arguments: { targetFile: 'main.ts' } },
        ],
      }),
    );
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: 'must-not-run', isError: false }));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            yield { type: 'text-delta', text: 'Recovered.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'abandoned-call',
      }),
    );

    const resumed = await host.resume('chat-abandoned-call');
    const events = await readLog(file);

    expect(events.filter((event) => event.type === 'history.rewound')).toHaveLength(0);
    expect(resumed.find((message) => message.id === 'assistant-1')).toMatchObject({
      content: [{ type: 'text' }, { type: 'toolCall', id: 'call-read' }],
    });
    /* The dangling call gets the same synthetic result the tool-input path
     * gets: a provider refuses an unanswered call, and the tool itself is never
     * re-run. */
    expect(resumed.find((message) => message.role === 'tool-output')).toMatchObject({
      toolCallId: 'call-read',
      isError: true,
      content: { errorCode: 'CLIENT_DISCONNECTED' },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    await host.close();
  });

  it('reopens a settled run whose refusal is resumable, and refuses one that is not', async () => {
    const reopenFile = createMemoryLogFile();
    await seedLog(reopenFile, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: { code: 'INSUFFICIENT_CREDIT', message: 'Top up.' },
      },
      {
        type: 'turn.failed',
        runId: 'run-1',
        chatId: 'chat-reopen',
        turnId: 'turn-1',
        reason: 'The turn ended before it recorded a revision.',
      },
    ]);
    const host = silentHost(reopenFile, 'reopen');

    await host.resume('chat-reopen');

    /* The second attempt settles on its own terms: the reopening row clears the
     * first attempt's settlement slot, so M1's row for attempt 2 is no longer the
     * `SETTLEMENT_CONFLICT` that left the turn with no revision. */
    await vi.waitFor(async () => {
      expect(await readLog(reopenFile)).toContainEqual(
        expect.objectContaining({ type: 'turn.finalized', runId: 'run-1', attempt: 2 }),
      );
    });
    expect(await host.snapshot('chat-reopen')).toMatchObject({ runId: 'run-1', state: 'completed' });
    await host.close();

    const closedFile = createMemoryLogFile();
    await seedLog(closedFile, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      {
        type: 'turn.failed',
        runId: 'run-1',
        chatId: 'chat-closed',
        turnId: 'turn-1',
        reason: 'The turn ended before it recorded a revision.',
      },
    ]);
    const closedHost = silentHost(closedFile, 'closed');

    /* A settled attempt whose driver is gone: opening abandons it (RA-R9), and Resume then opens attempt 2 through
     * the one reopen predicate, with a settlement slot of its own, never re-running attempt 1 under its settlement. */
    await closedHost.resume('chat-closed');
    const rowsLog = await readLog(closedFile);
    const rows = rowsLog.filter((event) => event.type === 'run.lifecycle').slice(2);
    expect(rows.slice(0, 2)).toMatchObject([
      { state: 'failed', attempt: 1, detail: { code: 'RUN_ABANDONED' } },
      { state: 'running', attempt: 2 },
    ]);
    await closedHost.close();
  });
});

describe('reservation release and chat exclusivity (W0.5–W0.7)', () => {
  const okTransport: ModelTransport = {
    funding: { type: 'unfunded' },
    async *stream(): AsyncGenerator<ModelStreamEvent> {
      yield { type: 'text-delta', text: 'ok' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };

  const lastLifecycle = async (file: ReturnType<typeof createMemoryLogFile>) => {
    const events = await readLog(file);
    return events.findLast((event) => event.type === 'run.lifecycle');
  };

  /** A log whose reads carry a row the reducer refuses, as a corrupt history reads. */
  const invalidHistoryLog = (file: ReturnType<typeof createMemoryLogFile>) => async () => {
    const log = await file.open();
    const invalid: AgentLogEvent = {
      version: 1,
      leaderEpoch: 'epoch-seed',
      sequence: 0,
      recordedAt: '2026-09-01T00:00:00.000Z',
      runId: 'run-0',
      type: 'message.envelope-replaced',
      messageId: 'missing-message',
      replacement: { id: 'missing-message', role: 'user', content: 'replacement' },
    };
    /* The history reads through `messages()` (RA-S10), which reads tolerantly; the open's verdict breaks once the
     * admission is durable, so driver construction is what refuses it. */
    return {
      ...log,
      read: async () => [invalid, ...(await log.read())],
      historyIntact: async () => {
        const rows = await log.read();
        return rows.length === 0;
      },
    };
  };

  /** Settle a command to `'admitted'` or the error it was refused with. */
  const outcomeOf = async (command: Promise<unknown>): Promise<unknown> => {
    try {
      await command;
      return 'admitted';
    } catch (error) {
      return error;
    }
  };

  const secondAdmission = async (host: TauAgentHost, chatId: string): Promise<unknown> =>
    outcomeOf(
      host.admit({
        chatId,
        runId: 'run-second',
        trigger: 'submit',
        message: { id: 'turn-second', role: 'user', content: 'Again.' },
        config: {
          systemPrompt: 'You are the deterministic G2 host fixture.',
          toolChoice: 'none',
          model: { id: 'scripted-g2-model', contextWindow: 200_000 },
        },
      }),
    );

  const leakHost = (file: ReturnType<typeof createMemoryLogFile>, code: string, command: string): TauAgentHost => {
    let clientContextCalls = 0;
    const base = hostOptions({
      openEventLog: code === 'HISTORY_INVALID' ? invalidHistoryLog(file) : file.open,
      transport: okTransport,
      toolRegistry: tools(async () => ({ content: null, isError: false })),
      idPrefix: `leak-${code}-${command}`,
    });
    return createTauAgentHost({
      ...base,
      model: code === 'HOST_MODEL_UNAVAILABLE' ? undefined : base.model,
      clientContext: async () => {
        clientContextCalls++;
        if (code === 'CLIENT_CONTEXT_FAILED' && clientContextCalls === 1) {
          throw Object.assign(new Error('The client context is unavailable.'), { code });
        }
        return {};
      },
    });
  };

  it.each(['HOST_MODEL_UNAVAILABLE', 'CLIENT_CONTEXT_FAILED'] as const)(
    'should refuse a start %s before any row and leave the chat admittable (RA-R4)',
    async (code) => {
      const file = createMemoryLogFile();
      const chatId = `chat-${code}-start`;
      const host = leakHost(file, code, 'start');

      await expect(
        host.admit({
          chatId,
          runId: 'run-1',
          trigger: 'submit',
          message: { id: 'turn-1', role: 'user', content: 'First.' },
        }),
      ).rejects.toMatchObject({ code });

      expect(await readLog(file)).toEqual([]);
      const second = await secondAdmission(host, chatId);
      expect((second as { readonly code?: unknown } | undefined)?.code).not.toBe('CHAT_RUN_LIVE');
      await host.close();
    },
  );

  it.each([
    ['HISTORY_INVALID', 'start'],
    ['HOST_MODEL_UNAVAILABLE', 'resume'],
    ['CLIENT_CONTEXT_FAILED', 'resume'],
  ] as const)(
    'should end the attempt with a coded last row when %s fails driver construction on %s',
    async (code, command) => {
      const file = createMemoryLogFile();
      const chatId = `chat-${code}-${command}`;
      if (command === 'resume') {
        await seedLog(file, [
          { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
          { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
          { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
        ]);
      }
      const host = leakHost(file, code, command);

      await (command === 'start'
        ? host.admit({
            chatId,
            runId: 'run-1',
            trigger: 'submit',
            message: { id: 'turn-1', role: 'user', content: 'First.' },
          })
        : host.resume(chatId));

      await vi.waitFor(async () => {
        expect(await lastLifecycle(file)).toMatchObject({
          type: 'run.lifecycle',
          runId: 'run-1',
          state: 'failed',
          detail: { code },
        });
      });
      const second = await secondAdmission(host, chatId);
      expect((second as { readonly code?: unknown } | undefined)?.code).not.toBe('CHAT_RUN_LIVE');
      await host.close();
    },
  );

  it('should write a construction failure under its incarnation term', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);
    const host = leakHost(file, 'CLIENT_CONTEXT_FAILED', 'term');

    await host.resume('chat-term');
    await vi.waitFor(async () => {
      expect(await lastLifecycle(file)).toMatchObject({ state: 'failed', detail: { code: 'CLIENT_CONTEXT_FAILED' } });
    });

    // L2a D12: every row this incarnation wrote, the failure included, carries the term its first append claimed.
    const writtenLog = await readLog(file);
    const written = writtenLog.slice(3);
    expect(written.length).toBeGreaterThan(1);
    expect(new Set(written.map((event) => event.leaderEpoch)).size).toBe(1);
    expect(written[0]?.leaderEpoch).not.toBe('epoch-seed');
    await host.close();
  });

  it('should release the reservation when leadership is lost before the session is built', async () => {
    const file = createMemoryLogFile();
    const host = silentLeakHost(file);
    await host.relinquish('chat-fenced');

    await expect(
      host.admit({
        chatId: 'chat-fenced',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1', role: 'user', content: 'First.' },
      }),
    ).rejects.toMatchObject({ code: 'LEADERSHIP_LOST' });

    // A fenced generation writes nothing; the next leader takes the chat and admits.
    expect(await readLog(file)).toEqual([]);
    expect(() => {
      host.assumeLeadership('chat-fenced', 2);
    }).not.toThrow();
    await host.admit({
      chatId: 'chat-fenced',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });
    expect(await host.snapshot('chat-fenced')).toMatchObject({ runId: 'run-2', state: 'completed' });
    await host.close();
  });

  function silentLeakHost(file: ReturnType<typeof createMemoryLogFile>) {
    return createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: okTransport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'fenced',
      }),
    );
  }

  const externalAgent = { kind: 'acp', id: 'stub-agent' } as const;

  it.each([
    ['external', 'tau'],
    ['external', 'external'],
    ['tau', 'external'],
  ] as const)(
    'should admit one run and refuse the other CHAT_RUN_LIVE when a %s and a %s start race',
    async (first, second) => {
      const file = createMemoryLogFile();
      const release = Promise.withResolvers<void>();
      /* Holds the first admission's rows short of storage: the window in which an
       * external turn used to have released its reservation without a run
       * registered (L2a D2). */
      const gate = Promise.withResolvers<void>();
      const reached = Promise.withResolvers<void>();
      let reads = 0;
      let gated = false;
      const externalPort: ExternalAgentPort = {
        list: () => ['stub-agent'],
        run: async () => {
          await release.promise;
        },
      };
      const host = createTauAgentHost({
        ...hostOptions({
          openEventLog: async () => {
            const log = await file.open();
            return {
              ...log,
              read: async () => {
                reads++;
                return log.read();
              },
              append: async (event) => {
                if (event.runId === 'run-a' && !gated) {
                  gated = true;
                  reached.resolve();
                  await gate.promise;
                }
                return log.append(event);
              },
            };
          },
          transport: {
            funding: { type: 'unfunded' },
            async *stream(): AsyncGenerator<ModelStreamEvent> {
              await release.promise;
              yield { type: 'text-delta', text: 'ok' };
              yield { type: 'completed', stopReason: 'stop' };
            },
          },
          toolRegistry: tools(async () => ({ content: null, isError: false })),
          idPrefix: `race-${first}-${second}`,
        }),
        externalRunners: { acp: externalPort },
      });
      const start = async (kind: 'external' | 'tau', runId: string) =>
        host.admit({
          chatId: 'chat-race',
          runId,
          trigger: 'submit',
          message: { id: `turn-${runId}`, role: 'user', content: 'Go.' },
          ...(kind === 'external'
            ? { config: { systemPrompt: 'unused', toolChoice: 'none', agent: externalAgent } }
            : {}),
        });

      const a = outcomeOf(start(first, 'run-a'));
      await reached.promise;
      const readsAtGate = reads;
      let secondSettled = false;
      const settleSecond = async (): Promise<unknown> => {
        try {
          return await outcomeOf(start(second, 'run-b'));
        } finally {
          secondSettled = true;
        }
      };
      const b = settleSecond();
      // The second start either is refused outright or reads the log inside the window.
      await vi.waitFor(() => {
        expect(secondSettled || reads > readsAtGate).toBe(true);
      });
      gate.resolve();
      release.resolve();

      expect(await a).toBe('admitted');
      expect(await b).toMatchObject({ code: 'CHAT_RUN_LIVE' });
      await host.close();
      const logged = await readLog(file);
      const lifecycles = logged.filter((event) => event.type === 'run.lifecycle');
      expect(lifecycles.filter((event) => event.state === 'admitted').map((event) => event.runId)).toEqual(['run-a']);
      // A refused start leaves no record, so it cannot become the chat's current run.
      expect(lifecycles.filter((event) => event.runId === 'run-b')).toEqual([]);
    },
  );

  it('should fence the incarnation, not reject unhandled, when an external run cannot write its ending', async () => {
    const file = createMemoryLogFile();
    let failAppends = false;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async () => {
        failAppends = true;
        throw new Error('The runner failed.');
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: async () => {
          const log = await file.open();
          return {
            ...log,
            append: async (event) => {
              if (failAppends) {
                throw new Error('injected append failure');
              }
              return log.append(event);
            },
          };
        },
        transport: okTransport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'untrack',
      }),
      externalRunners: { acp: externalPort },
    });

    try {
      await host.admit({
        chatId: 'chat-untrack',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1', role: 'user', content: 'Go.' },
        config: { systemPrompt: 'unused', toolChoice: 'none', agent: externalAgent },
      });
      await host.close();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      /* M1 owns the ending row: a refused append fences the incarnation (RA-A9); nothing escapes as a rejection. */
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('early-started tools on cancel (W0.15)', () => {
  it('should record the result of a tool started early when the run is cancelled mid-stream', async () => {
    const file = createMemoryLogFile();
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    const streaming = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          funding: { type: 'unfunded' },
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            yield {
              type: 'tool-input',
              toolCallId: 'cancel-call-read',
              toolName: 'read_file',
              input: { targetFile: 'main.ts' },
            };
            streaming.resolve();
            await new Promise<void>((resolve) => {
              request.signal.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            });
            yield { type: 'completed', stopReason: 'aborted' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'cancel-prestart',
      }),
    );

    const run = host.admit({
      chatId: 'chat-cancel-prestart',
      runId: 'run-cancel-prestart',
      trigger: 'submit',
      message: { id: 'turn-cancel-prestart', role: 'user', content: 'Read main.ts.' },
    });
    await streaming.promise;
    await host.cancel({ runId: 'run-cancel-prestart' });
    await run;

    expect(invoke).toHaveBeenCalledTimes(1);
    const history = reduceEventLog(await readLog(file));
    // The tool ran; its real result is durable, so Resume has no open tool part to fabricate a disconnect for.
    expect(history.filter((message) => message.role === 'tool-output')).toMatchObject([
      { toolCallId: 'cancel-call-read', content: 'fixture-main', isError: false },
    ]);
    expect(await host.snapshot('chat-cancel-prestart')).toMatchObject({ state: 'cancelled' });
    await host.close();
  });
});

describe('model attempts: charge and proceed (RA-S11, EQ1)', () => {
  /**
   * The gateway's ledger, simulated at the seam: one row per attempt key. A call is admitted, then charged when the
   * supplier finishes; a lookup of a key it never admitted voids it (GI-R3), and a late request for a voided key is
   * refused (GI-A10).
   */
  const gateway = (script: ReadonlyArray<'complete' | 'drop' | 'hang' | 'oversized'>, principal = 'account-a') => {
    const keys = new Map<string, 'admitted' | 'charged' | 'voided'>();
    const attempts: string[] = [];
    const lookups: string[] = [];
    let charges = 0;
    const funding: InvocationFunding = {
      type: 'funded',
      usesBillingAttempt: () => true,
      principal: async () => principal,
      resolveInvocation: async ({ attemptId }) => {
        lookups.push(attemptId);
        const state = keys.get(attemptId);
        if (state === undefined || state === 'voided') {
          keys.set(attemptId, 'voided');
          return { status: 'voided' };
        }
        return state === 'admitted'
          ? { status: 'pending' }
          : { status: 'terminal', operationId: `operation-${attemptId}`, outcome: 'settled', chargedCreditAtoms: '10' };
      },
    };
    const transport: ModelTransport = {
      funding,
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        const step = script[attempts.length] ?? 'complete';
        attempts.push(request.attemptId);
        if (keys.get(request.attemptId) === 'voided') {
          throw new GatewayModelTransportError({ code: 'INVALID_REQUEST', message: 'This attempt was voided.' });
        }
        keys.set(request.attemptId, 'admitted');
        await request.onInvocationBound?.({ operationId: `operation-${request.attemptId}` });
        if (step === 'hang') {
          await new Promise<never>(() => {
            /* The host dies mid-call: this call never returns. */
          });
        }
        keys.set(request.attemptId, 'charged');
        charges++;
        yield { type: 'text-delta', text: `Reply to ${request.attemptId}.` };
        if (step === 'oversized') {
          /* The reply's input exceeds the capped window: charged, and the step's reply (RV5-F1). */
          const input = 250_000;
          yield {
            type: 'usage',
            usage: {
              input,
              output: 10,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: input + 10,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          };
        }
        if (step === 'drop') {
          /* The supplier finished and the gateway charged; the relay dropped the reply. */
          throw new GatewayModelTransportError({ code: 'NETWORK_ERROR', status: 200, message: 'fixture drop' });
        }
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    /** A request for `attemptId` that reaches the gateway after the host gave it up. */
    const late = (attemptId: string): 'refused' | 'charged' => {
      if (keys.get(attemptId) === 'voided') {
        return 'refused';
      }
      keys.set(attemptId, 'charged');
      charges++;
      return 'charged';
    };
    return { attempts, lookups, transport, late, charges: () => charges, keys };
  };

  const hostOn = (file: ReturnType<typeof createMemoryLogFile>, transport: ModelTransport, idPrefix: string) =>
    createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix,
      }),
    );

  const start = async (host: TauAgentHost, chatId: string) =>
    host.admit({
      chatId,
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Answer.' },
    });

  const invocationRows = (events: readonly AgentLogEvent[]) =>
    events.flatMap((event) =>
      event.type === 'model.invocation-prepared'
        ? [`prepared ${event.attemptId}`]
        : event.type === 'model.invocation-settled'
          ? [`settled ${event.attemptId} ${event.outcome}`]
          : [],
    );

  it('should record the charge before re-preparing when the connection drops after the supplier finished', async () => {
    const file = createMemoryLogFile();
    const sim = gateway(['drop', 'complete']);
    const host = hostOn(file, sim.transport, 'gi-a9');

    await start(host, 'chat-drop');

    // GI-A9: the first charge is recorded before the next prepared row; the step continues under a new key.
    expect(invocationRows(await readLog(file))).toEqual([
      'prepared run-1:1:0',
      'settled run-1:1:0 settled',
      'prepared run-1:1:1',
    ]);
    expect(sim.charges()).toBe(2);
    // No card: the run completed, with no refusal for the charged loss.
    expect(await host.snapshot('chat-drop')).toMatchObject({ state: 'completed' });
    const dropped = await host.snapshot('chat-drop');
    expect(dropped.failure).toBeUndefined();
    await host.close();
  });

  it('should append the settled row before the next prepared row', async () => {
    const file = createMemoryLogFile();
    const sim = gateway(['drop', 'drop', 'complete']);
    const host = hostOn(file, sim.transport, 'ordered');

    await start(host, 'chat-ordered');
    await host.resume('chat-ordered');

    const rows = invocationRows(await readLog(file));
    // Every prepared row after the first follows the settlement of each attempt before it (ChargeAfterRecordedLoss).
    for (const [index, row] of rows.entries()) {
      if (row.startsWith('prepared') && index > 0) {
        const earlier = rows.slice(0, index).filter((prior) => prior.startsWith('prepared'));
        for (const prior of earlier) {
          expect(rows.slice(0, index)).toContain(prior.replace('prepared', 'settled') + ' settled');
        }
      }
    }
    expect(rows.filter((row) => row.startsWith('prepared'))).toHaveLength(3);
    await host.close();
  });

  it('should not charge twice when a completed reply exceeds the capped context window', async () => {
    const file = createMemoryLogFile();
    const sim = gateway(['oversized']);
    const host = hostOn(file, sim.transport, 'oversized');

    await start(host, 'chat-oversized');

    expect(sim.attempts).toEqual(['run-1:1:0']);
    expect(sim.charges()).toBe(1);
    expect(await host.snapshot('chat-oversized')).toMatchObject({ state: 'completed' });
    await host.close();
  });

  it('should re-prepare once after a charged loss and end the run on the second', async () => {
    const file = createMemoryLogFile();
    const sim = gateway(['drop', 'drop', 'complete']);
    const host = hostOn(file, sim.transport, 'lost-twice');

    await start(host, 'chat-twice');

    expect(sim.attempts).toEqual(['run-1:1:0', 'run-1:1:1']);
    const ended = await host.snapshot('chat-twice');
    expect(ended).toMatchObject({ state: 'failed', failure: { code: 'NETWORK_ERROR' } });
    expect(isResumableRunFailure(ended.failure)).toBe(true);

    // Resume proceeds the same way: the second charge is recorded, then the step continues under a new key.
    await host.resume('chat-twice');
    expect(invocationRows(await readLog(file))).toEqual([
      'prepared run-1:1:0',
      'settled run-1:1:0 settled',
      'prepared run-1:1:1',
      'settled run-1:1:1 settled',
      // The resume opened attempt 2, so its key is new by construction.
      'prepared run-1:2:0',
    ]);
    expect(await host.snapshot('chat-twice')).toMatchObject({ state: 'completed' });
    await host.close();
  });

  /** Drive a first host into a bound call it never finishes, then hand the log to a second host. */
  const diedMidCall = async (sim: ReturnType<typeof gateway>, chatId: string) => {
    const file = createMemoryLogFile();
    const dead = hostOn(file, sim.transport, 'dead');
    // async-iife: the host dies mid-call, so its admission never settles.
    void start(dead, chatId);
    await vi.waitFor(async () => {
      const logged = await readLog(file);
      expect(logged.some((event) => event.type === 'model.invocation-bound')).toBe(true);
    });
    return file;
  };

  it('should record the charge and resume under a new key after a death mid-call', async () => {
    const sim = gateway(['hang', 'complete']);
    const file = await diedMidCall(sim, 'chat-died');
    // The supplier finished after the host died.
    sim.keys.set('run-1:1:0', 'charged');
    const survivor = hostOn(file, sim.transport, 'survivor');

    // Opening records the answered attempt and abandons the orphan (RA-R9, GI-R10).
    await survivor.markAbandoned('chat-died');
    await survivor.resume('chat-died');

    expect(invocationRows(await readLog(file))).toEqual([
      'prepared run-1:1:0',
      'settled run-1:1:0 settled',
      'prepared run-1:2:0',
    ]);
    expect(sim.attempts).toEqual(['run-1:1:0', 'run-1:2:0']);
    expect(await survivor.snapshot('chat-died')).toMatchObject({ state: 'completed' });
    await survivor.close();
  });

  // W7.r1 finding 4 (ChatRunSlot.tla resume: `running` first, recovery rows without its command id).
  it('should write the reopening row first and reopen once when a resume is sent again after a crash', async () => {
    const sim = gateway(['hang', 'hang']);
    const file = await diedMidCall(sim, 'chat-order');
    const survivor = hostOn(file, sim.transport, 'survivor-order');
    await survivor.markAbandoned('chat-order');
    // The supplier finished after the opening asked: only the resume records the charge.
    sim.keys.set('run-1:1:0', 'charged');
    const resume = {
      type: 'resume',
      commandId: 'resume-order',
      payload: { chatId: 'chat-order', runId: 'run-1' },
    } as const;

    await expect(survivor.command(resume)).resolves.toMatchObject({ status: 'applied' });
    const logged = await readLog(file);
    const batch = logged.filter((event) => event.leaderEpoch === logged.at(-1)?.leaderEpoch);
    const reopening = batch.findIndex((event) => event.type === 'run.lifecycle' && event.state === 'running');
    const settled = batch.findIndex((event) => event.type === 'model.invocation-settled');
    expect(reopening).toBeGreaterThanOrEqual(0);
    expect(settled).toBeGreaterThan(reopening);
    expect(batch[settled]).not.toHaveProperty('commandId');

    // The host dies before anyone sees the answer; the page sends the resume again to the next host.
    const next = hostOn(file, sim.transport, 'next-order');
    await next.markAbandoned('chat-order');
    await expect(next.command(resume)).resolves.toMatchObject({ status: 'replayed' });
    const after = await readLog(file);
    const reopened = after.filter(
      (event) => event.type === 'run.lifecycle' && event.state === 'running' && event.commandId === 'resume-order',
    );
    expect(reopened).toMatchObject([{ attempt: 2 }]);
    await next.close();
  });

  // W7.r1 finding 5: a cancel that lands while the retry reads the failed step dispatches nothing more.
  /* W7.r1 finding 5 and round 2 N3: the stop is read after each await of the retry, the clearance write and the build. */
  it.each(['the failure-marker clearance', 'the next session build'] as const)(
    'should dispatch no funded call after a cancel that lands during %s of a lost-reply retry',
    async (during) => {
      const sim = gateway(['drop', 'complete']);
      const file = createMemoryLogFile();
      let dropped = false;
      let cleared = false;
      let hold: (() => void) | undefined;
      const holding = new Promise<void>((resolve) => {
        hold = resolve;
      });
      let reached: (() => void) | undefined;
      const retrying = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const transport: ModelTransport = {
        funding: sim.transport.funding,
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          try {
            yield* sim.transport.stream(request);
          } catch (error) {
            dropped = true;
            throw error;
          }
        },
      };
      const wait = async (): Promise<void> => {
        reached?.();
        await holding;
      };
      /* The retry clears the lost reply's failure marker, then builds the next session, whose record first reads the
       * log: the chosen step waits here. */
      const open = async (): Promise<Awaited<ReturnType<typeof file.open>>> => {
        const appender = await file.open();
        return {
          ...appender,
          append: async (event) => {
            if (dropped && (event.type === 'history.rewound' || event.type === 'message.envelope-replaced')) {
              dropped = false;
              if (during === 'the failure-marker clearance') {
                await wait();
              } else {
                cleared = true;
              }
            }
            return appender.append(event);
          },
          read: async () => {
            if (cleared) {
              cleared = false;
              await wait();
            }
            return appender.read();
          },
        };
      };
      const host = createTauAgentHost(
        hostOptions({
          openEventLog: open,
          transport,
          toolRegistry: tools(async () => ({ content: null, isError: false })),
          idPrefix: 'cancel-retry',
        }),
      );
      const started = start(host, 'chat-cancel-retry');
      await retrying;

      const cancelled = host.command({
        type: 'cancel',
        commandId: 'cancel-retry',
        payload: { chatId: 'chat-cancel-retry', runId: 'run-1' },
      });
      await vi.waitFor(async () => {
        expect(await host.describeRun('chat-cancel-retry')).toMatchObject({ state: 'running' });
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      hold?.();
      await started;

      await expect(cancelled).resolves.toMatchObject({ status: 'applied' });
      expect(sim.attempts).toEqual(['run-1:1:0']);
      expect(await host.snapshot('chat-cancel-retry')).toMatchObject({ state: 'cancelled' });
      await host.close();
    },
  );

  it('should answer MODEL_ATTEMPT_PENDING while the gateway owns the attempt', async () => {
    const sim = gateway(['hang']);
    const file = await diedMidCall(sim, 'chat-pending');
    const survivor = hostOn(file, sim.transport, 'survivor-pending');
    await survivor.markAbandoned('chat-pending');
    const before = await readLog(file);

    const answer = await survivor.command({
      type: 'resume',
      commandId: 'resume-pending',
      payload: { chatId: 'chat-pending', runId: 'run-1' },
    });

    expect(answer).toMatchObject({
      status: 'refused',
      code: 'MODEL_ATTEMPT_PENDING',
      details: { attemptId: 'run-1:1:0' },
    });
    // Nothing is written and nothing is sent again while the gateway owns the attempt.
    expect(await readLog(file)).toEqual(before);
    expect(sim.attempts).toEqual(['run-1:1:0']);
    await survivor.close();
  });

  it('should refuse the late request of an attempt the host abandoned', async () => {
    const sim = gateway(['hang', 'complete']);
    const file = await diedMidCall(sim, 'chat-late');
    // Crash before admission: the gateway never admitted the key the dead host sent.
    sim.keys.delete('run-1:1:0');
    const survivor = hostOn(file, sim.transport, 'survivor-late');

    await survivor.markAbandoned('chat-late');
    await survivor.resume('chat-late');

    // GI-A10: the old key is voided, the late request is refused, one charge in total.
    expect(invocationRows(await readLog(file))).toEqual([
      'prepared run-1:1:0',
      'settled run-1:1:0 voided',
      'prepared run-1:2:0',
    ]);
    expect(sim.late('run-1:1:0')).toBe('refused');
    expect(sim.charges()).toBe(1);
    expect(await survivor.snapshot('chat-late')).toMatchObject({ state: 'completed' });
    await survivor.close();
  });

  it('should refuse MODEL_ATTEMPT_OTHER_ACCOUNT and neither void nor record an attempt another principal funded', async () => {
    const sim = gateway(['hang']);
    const file = await diedMidCall(sim, 'chat-other');
    // RV5-F2: the prepared row names the account that funded it.
    const died = await readLog(file);
    expect(died.find((event) => event.type === 'model.invocation-prepared')).toMatchObject({
      principal: 'account-a',
    });
    const signedInAsB = gateway(['complete'], 'account-b');
    const unfunded: ModelTransport = {
      funding: { type: 'unfunded' },
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        yield { type: 'completed', stopReason: 'stop' };
      },
    };

    for (const [index, transport] of [signedInAsB.transport, unfunded].entries()) {
      const other = hostOn(file, transport, `other-account-${String(index)}`);
      // oxlint-disable-next-line no-await-in-loop -- one host at a time on the chat.
      await other.markAbandoned('chat-other');
      // oxlint-disable-next-line no-await-in-loop -- as above.
      const before = await readLog(file);

      // oxlint-disable-next-line no-await-in-loop -- as above.
      const answer = await other.command({
        type: 'resume',
        commandId: `resume-other-${String(index)}`,
        payload: { chatId: 'chat-other', runId: 'run-1' },
      });

      expect(answer).toMatchObject({ status: 'refused', code: 'MODEL_ATTEMPT_OTHER_ACCOUNT' });
      // oxlint-disable-next-line no-await-in-loop -- as above.
      expect(await readLog(file)).toEqual(before);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await other.close();
    }
    // Neither the opening nor the resume asked the gateway about account A's attempt: nothing voided it.
    expect([...sim.lookups, ...signedInAsB.lookups]).toEqual([]);
    expect(invocationRows(await readLog(file))).toEqual(['prepared run-1:1:0']);
  });

  const withPrincipal = (transport: ModelTransport, principal: () => Promise<string>): ModelTransport => {
    const { funding } = transport;
    return funding.type === 'funded' ? { ...transport, funding: { ...funding, principal } } : transport;
  };

  // W7 round 2 N1: an account the host cannot read blocks only what needs it, not every command on the chat.
  it('should open a chat with nothing to resolve without asking for the funding account', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const sim = gateway(['complete']);
    const principal = vi.fn(async (): Promise<string> => {
      throw new Error('The session expired.');
    });
    const host = hostOn(file, withPrincipal(sim.transport, principal), 'no-account');

    const answer = await host.command({
      type: 'cancel',
      commandId: 'cancel-no-account',
      payload: { chatId: 'chat-no-account', runId: 'run-1' },
    });

    expect(answer).toMatchObject({ status: 'applied', effect: 'not-applied' });
    expect(principal).not.toHaveBeenCalled();
    await host.close();
  });

  it('should open a chat whose account it cannot read, resolving nothing, and refuse its resume UNAUTHENTICATED', async () => {
    const sim = gateway(['hang']);
    const file = await diedMidCall(sim, 'chat-unread');
    sim.keys.set('run-1:1:0', 'charged');
    const principal = async (): Promise<string> => {
      throw new Error('The session expired.');
    };
    const host = hostOn(file, withPrincipal(sim.transport, principal), 'unread');

    await host.markAbandoned('chat-unread');
    const resumed = await host.command({
      type: 'resume',
      commandId: 'resume-unread',
      payload: { chatId: 'chat-unread', runId: 'run-1' },
    });

    expect(resumed).toMatchObject({ status: 'refused', code: 'UNAUTHENTICATED' });
    expect(invocationRows(await readLog(file))).toEqual(['prepared run-1:1:0']);
    await host.close();
  });

  it('should answer MODEL_ATTEMPT_PENDING for a crash between a billed summary and history.compacted', async () => {
    const sim = gateway(['hang']);
    const died = await diedMidCall(sim, 'chat-summary');
    const events = await readLog(died);
    const cut = events.findIndex((event) => event.type === 'model.invocation-prepared');
    const file = createMemoryLogFile();
    await seedLog(file, [
      ...events
        .slice(0, cut)
        .map(
          ({
            version: _version,
            leaderEpoch: _leaderEpoch,
            epoch: _epoch,
            sequence: _sequence,
            recordedAt: _recordedAt,
            ...event
          }) => event as SeededLogEvent,
        ),
      {
        type: 'model.invocation-prepared',
        runId: 'run-1',
        attemptId: 'attempt-summary',
        purpose: 'compaction',
        modelId: 'scripted-g2-model',
      },
      {
        type: 'model.invocation-bound',
        runId: 'run-1',
        attemptId: 'attempt-summary',
        operationId: 'operation-summary',
        status: 'pending',
      },
    ]);
    sim.keys.set('attempt-summary', 'admitted');
    const host = hostOn(file, sim.transport, 'summary');
    await host.markAbandoned('chat-summary');

    await expect(host.resume('chat-summary')).rejects.toMatchObject({ code: 'MODEL_ATTEMPT_PENDING' });
    expect(sim.lookups).toContain('attempt-summary');
    expect(sim.attempts).toEqual(['run-1:1:0']);
    await host.close();
  });
});
