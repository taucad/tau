import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { emptyChatLedger, foldProjectionFacts, foldReadAnswer } from '#log/chat-ledger.js';
import { projectionBatchSchema } from '#log/projection-facts.js';
import type { CatchUpFrame } from '#wire/frames.schema.js';
import { createNodeLauncher } from '#launchers/node-launcher.fixture.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import { createNodeChatStore } from '#node.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
const rows = (texts: readonly string[]): string =>
  texts
    .map((text, sequence) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'catch-up-conformance',
        sequence,
        recordedAt: '2026-10-09T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
        text,
      }),
    )
    .join('\n') + '\n';

/** Producer transitions corresponding to the bounded SeamCatchUp model. */
describe('SeamCatchUp production conformance', () => {
  it.each(['unchanged', 'append', 'replace', 'silent-replace', 'projection-equal-replace', 'abort'] as const)(
    'keeps pages provisional and validates only the captured source: %s',
    async (schedule) => {
      const root = await mkdtemp(join(tmpdir(), 'tau-seam-catch-up-'));
      const directory = join(root, '.tau/chats/conformance');
      await mkdir(directory, { recursive: true });
      const path = join(directory, 'events.jsonl');
      await writeFile(path, rows(['one', 'two']));
      const launcher = createAgentLauncher({
        chats: createNodeChatStore({ workspaceRoot: root }),
        modelTransport: createTauCloudGatewayModelTransport({
          baseUrl: 'https://gateway.example',
          model,
          auth: () => 'fixture-bearer',
          fetch: async () => {
            throw new Error('Catch-up conformance must not invoke a model.');
          },
        }),
        credential: () => ({ mode: 'session' }),
        systemPrompt: 'You are Tau.',
        model,
        toolRegistry: { list: () => [], invoke: async () => ({ content: 'unused', isError: true }) },
      });
      const controller = new AbortController();
      const iterator = launcher
        .catchUp({ chatId: 'conformance', limit: 1, maxBytes: 1024, signal: controller.signal })
        [Symbol.asyncIterator]();
      onTestFinished(async () => {
        controller.abort();
        await iterator.return?.();
        await launcher.close();
        await rm(root, { recursive: true, force: true });
      });
      const first = await iterator.next();
      expect(first.value).toMatchObject({ type: 'page', answer: { cursor: 0, nextCursor: 1, endCursor: 2 } });
      switch (schedule) {
        case 'append': {
          await writeFile(path, rows(['one', 'two', 'three']));
          break;
        }
        case 'replace': {
          await writeFile(path, rows(['foreign']));
          break;
        }
        case 'silent-replace': {
          await writeFile(path, rows(['two', 'one']));
          break;
        }
        case 'projection-equal-replace': {
          // Opaque facts retain type/key/history classification, so this payload edit projects identically.
          await writeFile(path, rows(['changed opaque payload', 'two']));
          break;
        }
        case 'abort': {
          controller.abort();
          break;
        }
        case 'unchanged': {
          break;
        }
      }
      const rest = [];
      for await (const frame of { [Symbol.asyncIterator]: () => iterator }) {
        rest.push(frame);
      }
      const validated = rest.filter((frame) => frame.type === 'validated');
      if (schedule === 'replace' || schedule === 'silent-replace' || schedule === 'projection-equal-replace') {
        expect(validated).toEqual([]);
        expect(rest.at(-1)).toMatchObject({ type: 'refused', answer: { reason: 'identity-mismatch' } });
      } else if (schedule === 'abort') {
        expect(rest).toEqual([]);
      } else {
        expect(validated).toHaveLength(1);
        expect(validated[0]).toMatchObject({
          position: { cursor: 2 },
          observedEndCursor: schedule === 'append' ? 3 : 2,
        });
        expect(rest[0]).toMatchObject({ type: 'page', answer: { cursor: 1, endCursor: 2 } });
      }
    },
  );
});

/** Actual filesystem owner; each case releases its own launcher and workspace. */
const healthFixture = async (text: string) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-catch-up-health-'));
  const directory = join(root, '.tau/chats/health');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'events.jsonl');
  await writeFile(path, text);
  const launcher = createNodeLauncher({
    workspaceRoot: root,
    systemPrompt: 'You are Tau.',
    model,
    toolRegistry: { list: () => [], invoke: async () => ({ content: 'unused', isError: true }) },
    fetch: async () => {
      throw new Error('Health conformance must not invoke a model.');
    },
  });
  onTestFinished(async () => {
    await launcher.close();
    await rm(root, { recursive: true, force: true });
  });
  return { launcher, path };
};

const healthy = { historyIntact: true, newerHistory: false, quarantined: false };
const damaged = { historyIntact: false, newerHistory: false, quarantined: true };

/** A deadline ends a broken long poll; a successful authoritative observation must precede it. */
const readDeadline = (): AbortController => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 1000);
  onTestFinished(() => {
    clearTimeout(timer);
    controller.abort();
  });
  return controller;
};

describe('SeamCatchUp source health conformance', () => {
  it.each(['replacement', 'writer'] as const)(
    'should publish new cursor-zero source identity before parking after %s',
    async (schedule) => {
      const { launcher, path } = await healthFixture(schedule === 'replacement' ? 'quarantined alpha\n' : '');
      const first = await launcher.read({ chatId: 'health', cursor: 0, limit: 16, maxBytes: 1024 });
      if (first.status !== 'batch') {
        throw new Error('Expected first authoritative health.');
      }
      await (schedule === 'replacement' ? writeFile(path, 'quarantined bravo\n') : launcher.host.ledger('health'));
      const controller = readDeadline();
      const next = await launcher.read({
        chatId: 'health',
        cursor: 0,
        sourceGeneration: first.sourceGeneration,
        sourceHealth: first.sourceHealth,
        limit: 16,
        maxBytes: 1024,
        signal: controller.signal,
      });
      expect(controller.signal.aborted).toBe(false);
      expect(next).toMatchObject({ status: 'batch', nextCursor: 0, endCursor: 0, sourceHealth: first.sourceHealth });
      if (next.status !== 'batch') {
        throw new Error('Expected replacement health.');
      }
      expect(next.sourceGeneration).not.toBe(first.sourceGeneration);
    },
  );

  it('should publish captured quarantine health even when every kept row is opaque', async () => {
    const { launcher } = await healthFixture(rows(['kept']) + 'malformed complete line\n');
    const frames = [];
    for await (const frame of launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 1024 })) {
      frames.push(frame);
    }
    expect(frames.at(-1)).toMatchObject({ type: 'validated', position: { cursor: 1 }, health: damaged });
  });

  it('should report semantic provider history rejection before publishing health', async () => {
    const event = {
      version: 1,
      leaderEpoch: 'health',
      sequence: 0,
      recordedAt: '2026-10-09T00:00:00.000Z',
      runId: 'r',
      type: 'message.envelope-replaced',
      messageId: 'missing',
      replacement: { id: 'missing', role: 'user', content: 'No original envelope exists.' },
    };
    const { launcher } = await healthFixture(JSON.stringify(event) + '\n');
    const frames = [];
    for await (const frame of launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 1024 })) {
      frames.push(frame);
    }
    expect(frames.at(-1)).toMatchObject({
      type: 'validated',
      health: { historyIntact: false, newerHistory: false, quarantined: false },
    });
  });

  it.each(['filesystem', 'writer', 'native'] as const)(
    'should return first empty %s health before parking',
    async (owner) => {
      const { launcher } = await healthFixture('');
      if (owner !== 'filesystem') {
        await launcher.host.ledger('health');
      }
      const controller = readDeadline();
      const read = owner === 'native' ? launcher.host.read : launcher.read;
      const answer = await read({ chatId: 'health', cursor: 0, limit: 16, maxBytes: 1024, signal: controller.signal });
      expect(controller.signal.aborted).toBe(false);
      expect(answer).toMatchObject({
        status: 'batch',
        cursor: 0,
        nextCursor: 0,
        endCursor: 0,
        events: [],
        sourceHealth: healthy,
      });
    },
  );

  it('should preserve captured health then deliver an appended quarantine without advancing the row cursor', async () => {
    const original = rows(['one', 'two']);
    const { launcher, path } = await healthFixture(original);
    const iterator = launcher.catchUp({ chatId: 'health', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    onTestFinished(async () => {
      await iterator.return?.();
    });
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: 'page', answer: { cursor: 0, endCursor: 2 } });
    await writeFile(path, original + 'malformed complete suffix\n');
    const rest = [];
    for await (const frame of { [Symbol.asyncIterator]: () => iterator }) {
      rest.push(frame);
    }
    const proof = rest.find((frame) => frame.type === 'validated');
    if (proof?.type !== 'validated') {
      throw new Error('Expected validated captured prefix.');
    }
    const controller = readDeadline();
    const request = {
      chatId: 'health',
      ...proof.position,
      limit: 16,
      maxBytes: 1024,
      signal: controller.signal,
      sourceHealth: healthy,
    };
    const answer = await launcher.read(request);
    expect(controller.signal.aborted).toBe(false);
    expect(answer).toMatchObject({
      status: 'batch',
      cursor: 2,
      nextCursor: 2,
      endCursor: 2,
      events: [],
      sourceHealth: damaged,
    });
    expect(proof).toMatchObject({ type: 'validated', health: healthy, observedEndCursor: 2 });
  });
});

describe('SeamCatchUp compact fact conformance', () => {
  it('should keep one bounded fact per physical row and preserve a rewind independently of an invalid user', async () => {
    const envelope = { version: 1, leaderEpoch: 'facts', recordedAt: '2026-10-09T00:00:00.000Z', runId: 'r' };
    const hiddenContext = 'execution-context-'.repeat(2000);
    const events = [
      {
        ...envelope,
        sequence: 0,
        type: 'run.lifecycle',
        state: 'admitted',
        admission: {
          kind: 'tau',
          turnId: 'u',
          message: { id: 'u', role: 'user', content: 'Visible user' },
          context: hiddenContext,
        },
      },
      {
        ...envelope,
        sequence: 1,
        type: 'run.lifecycle',
        state: 'admitted',
        admission: {
          kind: 'invalid-user-kind',
          message: null,
          rewind: { retainedMessageIds: ['u'] },
          context: hiddenContext,
        },
      },
      { ...envelope, sequence: 2, type: 'future.execution-only', hiddenContext },
    ];
    const { launcher } = await healthFixture(events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    const frames = [];
    for await (const frame of launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 4096 })) {
      frames.push(frame);
    }
    const pages = frames.filter((frame) => frame.type === 'page');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      type: 'page',
      answer: {
        cursor: 0,
        nextCursor: 3,
        endCursor: 3,
        facts: [
          {
            classification: 'known',
            row: { sequence: 0 },
            effect: {
              type: 'run.lifecycle',
              state: 'admitted',
              admission: { kind: 'tau', turnId: 'u', message: { id: 'u', role: 'user', content: 'Visible user' } },
            },
          },
          {
            classification: 'known',
            row: { sequence: 1 },
            effect: { type: 'run.lifecycle', state: 'admitted', rewind: { retainedMessageIds: ['u'] } },
          },
          { classification: 'opaque', row: { sequence: 2 }, eventType: 'future.execution-only', affectsHistory: false },
        ],
      },
    });
    expect(JSON.stringify(pages)).not.toContain(hiddenContext);
    expect(JSON.stringify(pages)).not.toContain('invalid-user-kind');
    expect(frames.at(-1)).toMatchObject({ type: 'validated', position: { cursor: 3 } });
  });

  it('should advance an oversized provider fact alone and retain its complete envelope', async () => {
    const content = 'Visible provider payload '.repeat(100);
    const events = [content, 'Next user'].map((text, sequence) => ({
      version: 1,
      leaderEpoch: 'oversized-facts',
      recordedAt: '2026-10-09T00:00:00.000Z',
      runId: 'r',
      sequence,
      type: 'message.appended',
      message: { id: `user-${sequence}`, role: 'user', content: text },
    }));
    const { launcher } = await healthFixture(events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    const frames = [];
    for await (const frame of launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 1024 })) {
      frames.push(frame);
    }
    const pages = frames.filter((frame) => frame.type === 'page');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      type: 'page',
      answer: {
        cursor: 0,
        nextCursor: 1,
        facts: [{ classification: 'known', effect: { type: 'message.appended', message: events[0]?.message } }],
      },
    });
    expect(pages[1]).toMatchObject({
      type: 'page',
      answer: {
        cursor: 1,
        nextCursor: 2,
        facts: [{ classification: 'known', effect: { type: 'message.appended', message: events[1]?.message } }],
      },
    });
  });
});

describe('SeamCatchUp physical duplicate row conformance', () => {
  it.each([
    { kind: 'known', limit: 1 },
    { kind: 'known', limit: 16 },
    { kind: 'opaque', limit: 1 },
    { kind: 'opaque', limit: 16 },
  ] as const)(
    'should preserve physical cursors while deduplicating $kind effects in pages of $limit',
    async ({ kind, limit }) => {
      const event = (sequence: number) => ({
        version: 1,
        leaderEpoch: 'physical-duplicates',
        sequence,
        recordedAt: '2026-10-09T00:00:00.000Z',
        runId: 'r',
        commandId: `cmd-${sequence}`,
        ...(kind === 'known'
          ? { type: 'message.appended', message: { id: `m-${sequence}`, role: 'user', content: `Message ${sequence}` } }
          : { type: 'future.row' }),
      });
      const line = (sequence: number) => JSON.stringify(event(sequence)) + '\n';
      const { launcher, path } = await healthFixture(line(0) + line(0) + line(1));
      const capture = async () => {
        const frames: CatchUpFrame[] = [];
        for await (const frame of launcher.catchUp({ chatId: 'health', limit, maxBytes: 16_384 })) {
          frames.push(frame);
        }
        return frames;
      };
      const initial = await capture();
      expect(initial.at(-1)).toMatchObject({
        type: 'validated',
        position: { cursor: 3, last: { sequence: 1 } },
        observedEndCursor: 3,
      });
      expect(initial.filter((frame) => frame.type === 'page').map((frame) => frame.answer.cursor)).toEqual(
        limit === 1 ? [0, 1, 2] : [0],
      );
      await appendFile(path, line(1) + line(2));
      const appended = await capture();
      expect(appended.at(-1)).toMatchObject({
        type: 'validated',
        position: { cursor: 5, last: { sequence: 2 } },
        observedEndCursor: 5,
      });
      let ledger = emptyChatLedger;
      for (const frame of appended) {
        if (frame.type === 'page') {
          const fold = foldProjectionFacts({ ledger, answer: frame.answer });
          if (fold.kind !== 'folded') {
            throw new Error(`Expected fold, received ${fold.kind}.`);
          }
          ledger = fold.ledger;
        }
      }
      expect(ledger.position.cursor).toBe(5);
      expect(ledger.applied['cmd-2']?.cursor).toBe(4);
      expect(ledger.anomalies.filter((anomaly) => anomaly.kind === 'opaque')).toHaveLength(kind === 'opaque' ? 3 : 0);
      expect(ledger.anomalies.filter((anomaly) => anomaly.kind === 'order')).toEqual([]);
      const raw = await launcher.read({ chatId: 'health', cursor: 0, limit: 16, maxBytes: 16_384 });
      expect(raw).toMatchObject({ status: 'batch', nextCursor: 5, endCursor: 5 });
      const rawFold = foldReadAnswer(emptyChatLedger, raw);
      if (rawFold.kind !== 'folded') {
        throw new Error('Expected canonical physical fold.');
      }
      expect(rawFold.ledger.applied['cmd-2']?.cursor).toBe(4);
      expect(rawFold.ledger).toEqual(ledger);
      const native = await launcher.host.ledger('health');
      expect(native.position.cursor).toBe(5);
      expect(native.applied['cmd-2']?.cursor).toBe(4);
      expect({ ...native, position: ledger.position }).toEqual(ledger);
    },
  );
});

describe('SeamCatchUp execution-only fact conformance', () => {
  it('should retain snapshot refresh identity without copying execution context', async () => {
    const event = {
      version: 1,
      leaderEpoch: 'snapshot-fact',
      sequence: 1,
      recordedAt: '2026-10-09T00:00:00.000Z',
      runId: 'r',
      type: 'snapshot-context.refreshed',
      messageId: 'snapshot-1',
      content: { file: 'private context '.repeat(1000) },
    };
    const original = {
      version: 1,
      leaderEpoch: event.leaderEpoch,
      sequence: 0,
      recordedAt: event.recordedAt,
      runId: event.runId,
      type: 'message.appended',
      message: { id: 'snapshot-1', role: 'user', content: 'Original snapshot' },
    };
    const { launcher } = await healthFixture(JSON.stringify(original) + '\n' + JSON.stringify(event) + '\n');
    const frames: CatchUpFrame[] = [];
    for await (const frame of launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 65_536 })) {
      frames.push(frame);
    }
    const page = frames.find((frame) => frame.type === 'page');
    if (page === undefined) {
      throw new Error('Expected one physical snapshot fact.');
    }
    expect(page.answer.facts.at(-1)).toEqual({
      classification: 'known',
      row: {
        version: 1,
        leaderEpoch: event.leaderEpoch,
        sequence: 1,
        recordedAt: event.recordedAt,
        runId: 'r',
      },
      effect: { type: 'snapshot-context.refreshed' },
    });
    expect(JSON.stringify(page.answer).length).toBeLessThan(1024);
    const compact = foldProjectionFacts({ ledger: emptyChatLedger, answer: page.answer });
    const raw = foldReadAnswer(
      emptyChatLedger,
      await launcher.read({ chatId: 'health', cursor: 0, limit: 16, maxBytes: 65_536 }),
    );
    expect(compact).toEqual(raw);
  });
});

describe('SeamCatchUp direct input bounds', () => {
  it('should reject a compact boundary page exceeding the shared row cap', async () => {
    const { launcher } = await healthFixture(rows(Array.from({ length: 17 }, (_, index) => String(index))));
    const iterator = launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 16_384 })[Symbol.asyncIterator]();
    try {
      const first = await iterator.next();
      if (first.done === true || first.value.type !== 'page') {
        throw new Error('Expected capped page.');
      }
      const { answer } = first.value;
      expect(
        projectionBatchSchema.safeParse({ ...answer, nextCursor: 17, facts: [...answer.facts, answer.facts[0]] })
          .success,
      ).toBe(false);
    } finally {
      await iterator.return?.();
    }
  });

  it('should budget the complete page frame including identity and cursor fields', async () => {
    const { launcher } = await healthFixture(rows(Array.from({ length: 20 }, (_, index) => String(index))));
    const encoder = new TextEncoder();
    for await (const frame of launcher.catchUp({ chatId: 'health', limit: 16, maxBytes: 900 })) {
      if (frame.type === 'page') {
        expect(frame.answer.facts.length).toBeGreaterThan(0);
        expect(frame.answer.facts.length).toBeLessThanOrEqual(16);
        if (frame.answer.facts.length > 1) {
          expect(encoder.encode(JSON.stringify(frame)).byteLength).toBeLessThanOrEqual(900);
        }
      }
    }
  });

  it.each([
    { limit: 17, maxBytes: 1024 },
    { limit: 16, maxBytes: 1_048_577 },
    { limit: 0, maxBytes: 1024 },
    { limit: 1, maxBytes: Number.NaN },
  ])('should reject malformed direct request before emitting a page: %j', async (bounds) => {
    const { launcher } = await healthFixture(rows(Array.from({ length: 20 }, (_, index) => String(index))));
    const iterator = launcher.catchUp({ chatId: 'health', ...bounds })[Symbol.asyncIterator]();
    try {
      await expect(iterator.next()).rejects.toThrow();
    } finally {
      await iterator.return?.();
    }
  });
});
