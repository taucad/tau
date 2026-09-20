/* oxlint-disable no-await-in-loop, no-loop-func -- The invariant drive intentionally mutates and reloads one log in order. */
import { describe, expect, it, vi } from 'vitest';
import { estimateContextTokens } from '@earendil-works/pi-agent-core';
import type { Api, Model, Usage } from '@earendil-works/pi-ai';
import type { CompactionOutcome } from '#harness/compaction.js';
import { MessageIdentities, providerMessageToPi } from '#harness/session-record.js';
import { createAgentSession } from '#harness/session.js';
import type { AgentSession } from '#harness/session.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { parseLogEvent } from '#log/event-schema.js';
import type { AgentLogEvent, JsonObject, JsonValue, ModelProviderKind } from '#log/event-types.js';
import { createEventLogReducer, reduceEventLog } from '#log/reducer.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

const contextWindow = 8192;
const compactionThreshold = Math.floor(contextWindow * 0.8);
const stepCount = 200;

const createInvariantLogFile = (): {
  messages(): ReturnType<ReturnType<typeof createEventLogReducer>['messages']>;
  open(): Promise<EventLogAppender>;
} => {
  const events: AgentLogEvent[] = [];
  const reducer = createEventLogReducer();
  return {
    messages: () => reducer.messages(),
    open: async () => {
      return {
        append: async (candidate) => {
          const event = parseLogEvent(candidate);
          const transition = reducer.prepare(event);
          if (transition.duplicate) {
            return { appended: false };
          }
          transition.commit();
          events.push(event);
          return { appended: true };
        },
        read: async () => [...events],
        readBatch: async ({ cursor, limit }) => {
          const boundedCursor = Math.min(cursor, events.length);
          const batch = events.slice(boundedCursor, boundedCursor + limit);
          return {
            cursor: boundedCursor,
            nextCursor: boundedCursor + batch.length,
            endCursor: events.length,
            events: batch,
          };
        },
        close: async () => undefined,
      };
    },
  };
};

const usage = (totalTokens: number): Usage => ({
  input: totalTokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

const mulberry32 =
  (seed: number): (() => number) =>
  () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };

const shapes = [
  'text',
  'tool',
  'parallel',
  'create',
  'edit',
  'kernel',
  'screenshot',
  'steer',
  'abort',
  'largeUser',
] as const;
type StepShape = (typeof shapes)[number];

const sizes = [
  { label: 'small', characters: 64 },
  { label: '0.05x', characters: Math.floor(contextWindow * 0.05 * 4) },
  { label: '0.3x', characters: Math.floor(contextWindow * 0.3 * 4) },
  { label: '1.2x', characters: Math.floor(contextWindow * 1.2 * 4) },
] as const;

const models: ReadonlyArray<{ readonly id: string; readonly providerKind: ModelProviderKind }> = [
  { id: 'claude-invariant', providerKind: 'anthropic' },
  { id: 'gpt-invariant', providerKind: 'openai' },
  { id: 'gemini-invariant', providerKind: 'vertexai' },
  { id: 'grok-invariant', providerKind: 'xai' },
];

const toolFor = (shape: StepShape): string =>
  shape === 'create'
    ? 'create_file'
    : shape === 'edit'
      ? 'edit_file'
      : shape === 'kernel'
        ? 'get_kernel_result'
        : shape === 'screenshot'
          ? 'screenshot'
          : 'read_file';

const resultFor = (options: { readonly shape: StepShape; readonly size: number; readonly step: number }): JsonValue => {
  if (options.shape === 'create' || options.shape === 'edit') {
    const payload = `payload-${options.step}-${'x'.repeat(Math.floor(options.size / 3))}`;
    return {
      message: payload,
      diffStats: { linesAdded: 1, linesRemoved: 0, originalContent: payload, modifiedContent: payload },
    };
  }
  if (options.shape === 'kernel') {
    const payload = `payload-${options.step}-${'x'.repeat(Math.floor(options.size / 2))}`;
    return {
      status: 'error',
      kernelIssues: [{ code: 'GEOMETRY_INVALID', message: payload, severity: 'error', details: { payload } }],
    };
  }
  if (options.shape === 'screenshot') {
    return {
      images: [{ view: 'front', dataUrl: `data:image/png;base64,${'eA=='.repeat(Math.max(1, options.size / 4))}` }],
    };
  }
  return `payload-${options.step}-${'x'.repeat(options.size)}`;
};

const requestModel: Model<Api> = {
  id: 'request-estimate',
  name: 'request-estimate',
  api: 'openai-responses',
  provider: 'stub',
  baseUrl: '',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow,
  maxTokens: 1024,
};

const requestTokens = (request: ModelStreamRequest): number => {
  const identities = new MessageIdentities(() => 'request-estimate');
  const messages = request.messages.flatMap((message) => {
    const hydrated = providerMessageToPi(message, requestModel, identities);
    return hydrated ? [hydrated] : [];
  });
  return estimateContextTokens(messages).tokens;
};

const assertToolPairing = (request: ModelStreamRequest): void => {
  const calls: string[] = [];
  const results: string[] = [];
  for (const message of request.messages) {
    if (message.role === 'tool-output') {
      results.push(message.toolCallId);
    }
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content) {
      const candidate = block as JsonObject;
      if (candidate['type'] === 'toolCall' && typeof candidate['id'] === 'string') {
        calls.push(candidate['id']);
      }
    }
  }
  expect(calls.toSorted((left, right) => left.localeCompare(right))).toEqual(
    results.toSorted((left, right) => left.localeCompare(right)),
  );
};

const transportFor = (options: {
  readonly shape: StepShape;
  readonly step: number;
  readonly onRequest: (request: ModelStreamRequest) => void;
  readonly steer: () => void;
  readonly abort: () => void;
}): ModelTransport => {
  let call = 0;
  return {
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      call++;
      options.onRequest(request);
      if (options.shape === 'abort' && call === 1) {
        yield { type: 'text-delta', text: 'partial \\(x\\)' };
        options.abort();
        yield { type: 'completed', stopReason: 'aborted' };
        return;
      }
      if (options.shape === 'steer' && call === 1) {
        options.steer();
        yield { type: 'text-delta', text: 'before steering \\(x\\)' };
        yield { type: 'completed', stopReason: 'stop' };
        return;
      }
      if (['tool', 'parallel', 'create', 'edit', 'kernel', 'screenshot'].includes(options.shape) && call === 1) {
        const toolName = toolFor(options.shape);
        const count = options.shape === 'parallel' ? 2 : 1;
        for (let index = 0; index < count; index++) {
          yield {
            type: 'tool-input',
            toolCallId: `call-${options.step}-${index}`,
            toolName,
            input: { targetFile: options.shape === 'parallel' ? 'same.ts' : `step-${options.step}.ts` },
          };
        }
        yield { type: 'usage', usage: usage(256) };
        yield { type: 'completed', stopReason: 'toolUse' };
        return;
      }
      yield { type: 'text-delta', text: `step ${options.step}: \\(x + y\\) and \\[z\\]` };
      yield { type: 'usage', usage: usage(Math.min(compactionThreshold - 1, requestTokens(request) + 64)) };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
};

const toolsFor = (options: {
  readonly shape: StepShape;
  readonly size: number;
  readonly step: number;
}): ToolRegistry => ({
  list: () =>
    ['read_file', 'create_file', 'edit_file', 'get_kernel_result', 'screenshot'].map((name) => ({
      name,
      description: `Run ${name}.`,
      inputSchema: { type: 'object' },
    })),
  invoke: vi.fn(async () => ({ content: resultFor(options), isError: false })),
});

describe('long-session compaction invariants', () => {
  it('should preserve replay, pairing, budget, and resumability across a deterministic 200-step drive', async () => {
    const random = mulberry32(1_592_639_710);
    const file = createInvariantLogFile();
    const compactions: CompactionOutcome[] = [];
    const sizeCoverage = new Set<string>();
    const providerCoverage = new Set<ModelProviderKind>();
    let globalId = 0;
    const clockStart = Date.now();

    for (let step = 0; step < stepCount; step++) {
      const shape = shapes[step % shapes.length]!;
      const size = sizes[Math.floor(random() * sizes.length)]!;
      const model = models[Math.floor(step / 25) % models.length]!;
      const pendingCompactions: CompactionOutcome[] = [];
      const requests: ModelStreamRequest[] = [];
      const current: { session?: AgentSession } = {};
      if (['tool', 'parallel', 'create', 'edit', 'kernel', 'screenshot'].includes(shape)) {
        sizeCoverage.add(size.label);
      }
      providerCoverage.add(model.providerKind);

      const transport = transportFor({
        shape,
        step,
        steer: () => current.session?.steer(`steer-${step}`),
        abort: () => current.session?.abort(),
        onRequest: (request) => {
          requests.push(request);
          assertToolPairing(request);
          if (pendingCompactions.length > 0) {
            expect(requestTokens(request)).toBeLessThan(compactionThreshold);
            for (const outcome of pendingCompactions.splice(0)) {
              expect(outcome.details?.tokensAfter).toBeLessThan(compactionThreshold);
            }
          }
        },
      });
      const session = await createAgentSession({
        chatId: 'invariant-drive',
        runId: `run-${step}`,
        leaderEpoch: `epoch-${step}`,
        systemPrompt: 'system',
        model: { ...model, contextWindow },
        modelTransport: transport,
        toolRegistry: toolsFor({ shape, size: size.characters, step }),
        eventLog: await file.open(),
        summarize: async () => `Summary through step ${step}.`,
        safeguardThresholds: { identicalCall: 2, identicalErrorTerminate: 100 },
        onCompaction: (outcome) => {
          if (outcome.tier) {
            if (outcome.tier === 'summarization' && outcome.evicted > 1) {
              expect(outcome.messages).not.toHaveLength(1);
            }
            compactions.push(outcome);
            pendingCompactions.push(outcome);
          }
        },
        createId: () => `generated-${globalId++}`,
        now: () => new Date(clockStart + globalId * 1000),
      });
      current.session = session;

      await session.prompt({
        id: `user-${step}`,
        role: 'user',
        content: shape === 'largeUser' ? `large-${'u'.repeat(sizes[3].characters)}` : `prompt-${step}`,
      });

      const snapshot = await session.snapshot();
      const log = await file.open();
      const events = await log.read();
      const durable = file.messages();
      const terminal = events.findLast((event) => event.runId === `run-${step}` && event.type === 'run.lifecycle');
      const failureCode =
        terminal?.type === 'run.lifecycle' && terminal.state === 'failed' ? terminal.detail?.code : undefined;
      const compactionCodes = new Set([
        'SUMMARY_REQUIRED',
        'NO_EVICTABLE_HISTORY',
        'SESSION_LOG_INTEGRITY',
        'CIRCUIT_BREAKER_OPEN',
      ]);

      expect(snapshot.messages).toEqual(durable);
      expect(
        requests.length,
        `step ${step} dispatched no request: ${JSON.stringify(snapshot.failure)}`,
      ).toBeGreaterThan(0);
      if (failureCode && compactionCodes.has(failureCode)) {
        expect(
          snapshot.messages.length,
          `step ${step} ended with ${failureCode} after ${compactions.length} successful compactions: ${JSON.stringify(snapshot.failure)}`,
        ).toBeLessThanOrEqual(1);
      }
      await log.close();
      await session.close();
    }

    const finalLog = await file.open();
    const finalEvents = await finalLog.read();
    const finalDurable = reduceEventLog(finalEvents);
    const reopened = await createAgentSession({
      chatId: 'invariant-drive',
      runId: 'reopen-final',
      leaderEpoch: 'reopen-final-epoch',
      systemPrompt: 'system',
      model: { ...models.at(-1)!, contextWindow },
      modelTransport: {
        async *stream() {
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: toolsFor({ shape: 'text', size: sizes[0].characters, step: stepCount }),
      eventLog: finalLog,
    });
    const reopenedSnapshot = await reopened.snapshot();
    expect(reopenedSnapshot.messages).toEqual(finalDurable);
    await reopened.close();

    expect(compactions.length).toBeGreaterThanOrEqual(5);
    expect(sizeCoverage).toEqual(new Set(sizes.map((size) => size.label)));
    expect(providerCoverage).toEqual(new Set(models.map((model) => model.providerKind)));
    expect(finalEvents.some((event) => event.type === 'safeguard.recorded')).toBe(true);
  }, 30_000);
});
