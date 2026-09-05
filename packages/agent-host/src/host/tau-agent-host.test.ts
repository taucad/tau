import { describe, expect, it, vi } from 'vitest';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import type {
  InterruptApprovalPort,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { reduceEventLog } from '#log/reducer.js';
import { ScriptedParityModelTransport, scriptedParityResponses } from '#host/scripted-model.fixture.js';
import type { JsonObject, ProviderMessage } from '#log/event-types.js';
import { GatewayModelTransportError } from '#transport/gateway-model-transport.js';

const tauInternal = (message: ProviderMessage | undefined): JsonObject | undefined => message?.metadata?.tauInternal;

const createMemoryLogFile = () => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  return {
    open: async () => {
      const storage: EventLogStorage = {
        read: async () => bytes,
        append: async (next) => {
          const combined = new Uint8Array(bytes.byteLength + next.byteLength);
          combined.set(bytes);
          combined.set(next, bytes.byteLength);
          bytes = combined;
        },
        truncate: async (size) => {
          bytes = bytes.slice(0, size);
        },
        close: async () => undefined,
      };
      return createEventLogAppender(storage);
    },
  };
};

const createIds = (prefix: string) => {
  let next = 0;
  return () => `${prefix}-${next++}`;
};

const resolvedInterruptPort = () =>
  ({
    pause: async (request) => ({ interruptId: request.interruptId, outcome: 'approved' }),
    pending: async () => [],
    resume: async () => undefined,
  }) satisfies InterruptApprovalPort;

const toolDefinition = {
  name: 'read_file',
  description: 'Read one workspace file.',
  inputSchema: {
    type: 'object',
    properties: { targetFile: { type: 'string' } },
    required: ['targetFile'],
    additionalProperties: false,
  },
} as const;

const tools = (invoke: ToolRegistry['invoke']): ToolRegistry => ({
  list: () => [toolDefinition],
  invoke,
});

const hostOptions = (input: {
  readonly openEventLog: () => ReturnType<ReturnType<typeof createMemoryLogFile>['open']>;
  readonly transport: ModelTransport;
  readonly toolRegistry: ToolRegistry;
  readonly interruptPort?: InterruptApprovalPort | undefined;
  readonly idPrefix?: string | undefined;
}) => {
  const ids = createIds(input.idPrefix ?? 'message');
  const epochs = createIds(`epoch-${input.idPrefix ?? 'host'}`);
  let tick = 0;
  return {
    systemPrompt: 'You are the deterministic G2 host fixture.',
    model: { id: 'scripted-g2-model', contextWindow: 200_000 },
    modelTransport: input.transport,
    toolRegistry: input.toolRegistry,
    openEventLog: async () => input.openEventLog(),
    interruptPort: input.interruptPort ?? resolvedInterruptPort(),
    createId: ids,
    createLeaderEpoch: epochs,
    now: () => new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)),
  };
};

describe('createTauAgentHost', () => {
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
          close: opened.close,
        }),
        transport: {
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

    expect(order).toEqual(['text-delta:live-0', 'thinking-delta:live-0', 'durable:live-0']);
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
  ] as const)('retains %s as a typed failed-run snapshot', async (code, status) => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
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
    await expect(
      resumedHost.admit({
        chatId: 'chat-recovery',
        runId: 'replacement-run',
        trigger: 'submit',
        message: { id: 'replacement-turn', role: 'user', content: 'Do not bypass recovery.' },
      }),
    ).rejects.toThrow('has a non-terminal run; resume it');
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
operating on (read_file / list_directory / get_kernel_result) and only then
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

  it('routes active interruption and resolution through W5 before resuming', async () => {
    const file = createMemoryLogFile();
    const modelStarted = Promise.withResolvers<void>();
    const releaseResolution = Promise.withResolvers<void>();
    let pauseCalls = 0;
    let pendingInterrupt: Parameters<InterruptApprovalPort['pause']>[0] | undefined;
    const interruptPort: InterruptApprovalPort = {
      pause: async (request) => {
        pauseCalls++;
        pendingInterrupt = request;
        await releaseResolution.promise;
        pendingInterrupt = undefined;
        return { interruptId: request.interruptId, outcome: 'approved' };
      },
      pending: async ({ runId }) => (pendingInterrupt?.runId === runId ? [pendingInterrupt] : []),
      resume: async () => {
        releaseResolution.resolve();
      },
    };
    let calls = 0;
    const transport: ModelTransport = {
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
        interruptPort,
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
    await vi.waitFor(() => {
      expect(pauseCalls).toBe(1);
    });
    await expect(
      host.resolveInterrupt({ runId: 'wrong-run', interruptId: 'interrupt-1', outcome: 'approved' }),
    ).rejects.toThrow('does not belong');
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

  it('reserves a chat synchronously so immediate cancel reaches the admitted run and duplicate starts are rejected', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    const transport: ModelTransport = {
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

    await expect(duplicate).rejects.toMatchObject({ code: 'RUN_ADMISSION_CONFLICT' });
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

    await expect(host.waitForAdmission('chat-admission-ack')).resolves.toMatchObject({
      runId: 'run-admission-ack',
      state: 'running',
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
    host.assumeLeadership('chat-generation', 'generation-one');
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

    host.assumeLeadership('chat-generation', 'generation-two');
    await host.resume('chat-generation');
    const log = await file.open();
    const events = await log.read();
    expect(events.findLast((event) => event.leaderEpoch === 'generation-one')?.leaderEpoch).toBe('generation-one');
    expect(events.at(-1)?.leaderEpoch).toBe('generation-two');
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
});
