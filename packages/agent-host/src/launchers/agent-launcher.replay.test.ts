import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi, onTestFinished } from 'vitest';
import { agentChannelPort } from '#channel/endpoint.js';
import { createAgentChannelClient } from '#channel/agent-channel-client.js';
import { serveAgentChannel } from '#launchers/agent-channel.js';
import { createAgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { chatStoreBinding, createChatStore } from '#launchers/chat-store.js';
import { createNodeChatStore } from '#node.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import type { ToolRegistry } from '#waist/ports.js';
import { fakePlacement } from '#host/tau-agent-host.fixture.js';
import { parseEventLogBytes } from '#log/serialization.js';
import { foldClassifiedChatLedger } from '#log/chat-ledger.js';
import { isBytePrefix } from '#launchers/replay-view.js';
import type { CatchUpFrame } from '#wire/frames.schema.js';
import type * as ReplayViewModule from '#launchers/replay-view.js';
import type * as SerializationModule from '#log/serialization.js';
import type * as LedgerModule from '#log/chat-ledger.js';

vi.mock('#log/serialization.js', async (original) => {
  const actual = await original<typeof SerializationModule>();
  return { ...actual, parseEventLogBytes: vi.fn(actual.parseEventLogBytes) };
});
vi.mock('#log/chat-ledger.js', async (original) => {
  const actual = await original<typeof LedgerModule>();
  return { ...actual, foldClassifiedChatLedger: vi.fn(actual.foldClassifiedChatLedger) };
});
vi.mock('#launchers/replay-view.js', async (original) => {
  const actual = await original<typeof ReplayViewModule>();
  return { ...actual, isBytePrefix: vi.fn(actual.isBytePrefix) };
});

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };
const scriptedGateway = (): typeof globalThis.fetch => async () => {
  throw new Error('Read-only replay must not invoke a model.');
};
const roots: string[] = [];
let launcher: AgentLauncher | undefined;
const currentRoot = (): string => roots.at(-1)!;
const makeLauncher = async (
  readAcquired?: () => void | Promise<void>,
  observeBytes?: NonNullable<ReturnType<typeof chatStoreBinding>['observeBytes']>,
  admitTurns = false,
): Promise<AgentLauncher> => {
  const fetch = scriptedGateway();
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-replay-'));
  roots.push(workspaceRoot);
  const nodeStore = createNodeChatStore({ workspaceRoot });
  const base = chatStoreBinding(nodeStore);
  launcher = createAgentLauncher({
    chats:
      readAcquired === undefined && observeBytes === undefined
        ? nodeStore
        : createChatStore({
            ...base,
            ...(observeBytes === undefined ? {} : { observeBytes }),
            readBytes: async (chatId) => {
              const bytes = await base.readBytes(chatId);
              await readAcquired?.();
              return bytes;
            },
          }),
    modelTransport: createTauCloudGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      model,
      auth: () => 'daemon-bearer',
      fetch,
    }),
    credential: () => ({ mode: 'session' }),
    systemPrompt: 'You are Tau.',
    model,
    toolRegistry: emptyTools,
    ...(admitTurns ? { turnPlacement: fakePlacement({ registry: emptyTools }).port } : {}),
  });
  return launcher;
};
const read = async (host: AgentLauncher, chatId: string) =>
  host.read({ chatId, cursor: 0, limit: 16, maxBytes: 1_048_576 });
afterEach(async () => {
  await launcher?.close();
  launcher = undefined;
  for (const root of roots.splice(0)) {
    // oxlint-disable-next-line no-await-in-loop -- release only test-owned roots after their launcher closes.
    await rm(root, { recursive: true, force: true });
  }
});

describe('launcher replay source ownership', () => {
  it('should reject cancellation before observation without acquiring bytes or fabricating health', async () => {
    const acquire = vi.fn();
    const observe = vi.fn(async () => vi.fn());
    const reader = await makeLauncher(acquire, observe);
    await expect(
      reader.read({ chatId: 'already-aborted', cursor: 0, limit: 16, maxBytes: 1024, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(acquire).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it('preserves fresh full-byte proof on every ordinary production page', async () => {
    let acquired = 0;
    const reader = await makeLauncher(() => {
      acquired += 1;
    });
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up-cost');
    await mkdir(directory, { recursive: true });
    const rows = Array.from({ length: 5 }, (_, sequence) => ({
      version: 1,
      leaderEpoch: 'cost',
      sequence,
      recordedAt: '2026-10-08T00:00:00.000Z',
      runId: 'r',
      type: 'future.row',
    }));
    await writeFile(join(directory, 'events.jsonl'), rows.map((row) => JSON.stringify(row) + '\n').join(''));
    const received = [];
    let cursor = 0;
    let sourceGeneration: string | undefined;
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
      const answer = await reader.read({ chatId: 'catch-up-cost', cursor, limit: 2, maxBytes: 1024, sourceGeneration });
      expect(answer.status).toBe('batch');
      if (answer.status !== 'batch') {
        throw new Error('Production pagination refused the unchanged fixture.');
      }
      received.push(...answer.events);
      cursor = answer.nextCursor;
      sourceGeneration = answer.sourceGeneration;
      if (cursor === answer.endCursor) {
        break;
      }
    }
    expect(received).toEqual(rows);
    expect(acquired).toBeGreaterThanOrEqual(3);
  });

  it('captures bounded immutable catch-up pages with only opening and final authoritative acquisition', async () => {
    let acquired = 0;
    const release = vi.fn();
    const observeBytes = vi.fn(async () => release);
    const reader = await makeLauncher(() => {
      acquired += 1;
    }, observeBytes);
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up');
    await mkdir(directory, { recursive: true });
    const rows = Array.from({ length: 5 }, (_, sequence) => ({
      version: 1,
      leaderEpoch: 'catch-up',
      sequence,
      recordedAt: '2026-10-08T00:00:00.000Z',
      runId: 'r',
      type: 'future.row',
      text: `row-${sequence}`,
    }));
    await writeFile(join(directory, 'events.jsonl'), rows.map((row) => JSON.stringify(row) + '\n').join(''));
    const frames = [];
    for await (const frame of reader.catchUp({ chatId: 'catch-up', limit: 2, maxBytes: 1024 })) {
      frames.push(frame);
    }
    expect(frames.map((frame) => frame.type)).toEqual(['page', 'page', 'page', 'validated']);
    expect(frames.filter((frame) => frame.type === 'page').flatMap((frame) => frame.answer.facts)).toMatchObject(
      rows.map((row) => ({
        classification: 'opaque',
        row: { leaderEpoch: row.leaderEpoch, sequence: row.sequence, runId: row.runId },
        eventType: row.type,
        affectsHistory: false,
      })),
    );
    expect(frames.at(-1)).toMatchObject({ type: 'validated', position: { cursor: 5 }, observedEndCursor: 5 });
    expect(acquired).toBe(2);
    expect(observeBytes).toHaveBeenCalledOnce();
    await reader.close();
    expect(release).toHaveBeenCalledOnce();
  });

  it('makes finite captured-prefix progress when every slow acquisition overlaps an append wake', async () => {
    let changed: (() => void) | undefined;
    let acquisitions = 0;
    const line = (sequence: number) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'continuous-append',
        sequence,
        recordedAt: '2026-10-09T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n';
    let path = '';
    const reader = await makeLauncher(
      async () => {
        acquisitions++;
        // Bound the broken schedule without a timeout: no acquisition ever observes a quiet source.
        if (acquisitions > 8) {
          throw new Error('Catch-up waited for a quiescent source instead of validating a finite prefix.');
        }
        await appendFile(path, line(acquisitions));
        changed?.();
      },
      async (_chatId, input) => {
        changed = input.onChange;
        return () => undefined;
      },
    );
    const directory = join(currentRoot(), '.tau/chats/continuous-append');
    await mkdir(directory, { recursive: true });
    path = join(directory, 'events.jsonl');
    await writeFile(path, line(0));
    const frames: CatchUpFrame[] = [];
    for await (const frame of reader.catchUp({ chatId: 'continuous-append', limit: 1, maxBytes: 1024 })) {
      frames.push(frame);
    }
    expect(frames.at(-1)).toMatchObject({ type: 'validated' });
    expect(acquisitions).toBeLessThanOrEqual(4);
    const pages = frames.filter((frame) => frame.type === 'page');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((frame) => frame.answer.endCursor === pages[0]?.answer.endCursor)).toBe(true);
  });

  it('linearizes final proof before a later replacement wake and resets the next fresh read', async () => {
    let changed: (() => void) | undefined;
    let acquisitions = 0;
    let path = '';
    const line = (text: string) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'proof-linearization',
        sequence: 0,
        recordedAt: '2026-10-09T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
        text,
      }) + '\n';
    const reader = await makeLauncher(
      async () => {
        if (++acquisitions === 2) {
          await writeFile(path, line('replacement'));
          changed?.();
        }
      },
      async (_chatId, input) => {
        changed = input.onChange;
        return () => undefined;
      },
    );
    const directory = join(currentRoot(), '.tau/chats/proof-linearization');
    await mkdir(directory, { recursive: true });
    path = join(directory, 'events.jsonl');
    await writeFile(path, line('captured'));
    const frames: CatchUpFrame[] = [];
    for await (const frame of reader.catchUp({ chatId: 'proof-linearization', limit: 1, maxBytes: 1024 })) {
      frames.push(frame);
    }
    const proof = frames.at(-1);
    expect(proof).toMatchObject({ type: 'validated', position: { cursor: 1 } });
    expect(acquisitions).toBe(2);
    if (proof?.type !== 'validated') {
      throw new Error('Expected the acquired prefix proof.');
    }
    await expect(
      reader.read({
        chatId: 'proof-linearization',
        ...proof.position,
        sourceHealth: proof.health,
        limit: 16,
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
  });

  it('answers an observed ordinary batch when every acquisition overlaps an append wake', async () => {
    let changed: (() => void) | undefined;
    let acquisitions = 0;
    let path = '';
    const line = (sequence: number) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'ordinary-progress',
        sequence,
        recordedAt: '2026-10-09T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n';
    const reader = await makeLauncher(
      async () => {
        if (++acquisitions > 8) {
          throw new Error('Ordinary read waited for source quiescence.');
        }
        await appendFile(path, line(acquisitions));
        changed?.();
      },
      async (_chatId, input) => {
        changed = input.onChange;
        return () => undefined;
      },
    );
    const directory = join(currentRoot(), '.tau/chats/ordinary-progress');
    await mkdir(directory, { recursive: true });
    path = join(directory, 'events.jsonl');
    await writeFile(path, line(0));
    await expect(
      reader.read({ chatId: 'ordinary-progress', cursor: 0, limit: 16, maxBytes: 1024 }),
    ).resolves.toMatchObject({ status: 'batch', cursor: 0, nextCursor: 1, endCursor: 1 });
    expect(acquisitions).toBe(1);
  });

  it('reacquires held opening bytes after an acknowledged append wake before catch-up publication', async () => {
    const held = Promise.withResolvers<void>();
    const captured = Promise.withResolvers<void>();
    let acquired = 0;
    let changed: (() => void) | undefined;
    const release = vi.fn();
    const observeBytes = vi.fn(
      async (
        _chatId: string,
        input: Parameters<NonNullable<ReturnType<typeof chatStoreBinding>['observeBytes']>>[1],
      ) => {
        changed = input.onChange;
        return release;
      },
    );
    const reader = await makeLauncher(async () => {
      acquired += 1;
      if (acquired === 1) {
        captured.resolve();
        await held.promise;
      }
    }, observeBytes);
    const directory = join(currentRoot(), '.tau', 'chats', 'held-capture');
    await mkdir(directory, { recursive: true });
    const row = (sequence: number) => ({
      version: 1,
      leaderEpoch: 'held-capture',
      sequence,
      recordedAt: '2026-10-08T00:00:00.000Z',
      runId: 'r',
      type: 'future.row',
      text: `row-${sequence}`,
    });
    await writeFile(join(directory, 'events.jsonl'), JSON.stringify(row(0)) + '\n');
    const frames: CatchUpFrame[] = [];
    const consuming = (async () => {
      for await (const frame of reader.catchUp({ chatId: 'held-capture', limit: 1, maxBytes: 1024 })) {
        frames.push(frame);
      }
    })();
    try {
      await captured.promise;
      expect(frames).toEqual([]);
      await appendFile(join(directory, 'events.jsonl'), JSON.stringify(row(1)) + '\n');
      expect(changed).toBeDefined();
      changed!();
      held.resolve();
      await consuming;
      expect(acquired).toBe(3);
      expect(frames.filter((frame) => frame.type === 'page').flatMap((frame) => frame.answer.facts)).toMatchObject(
        [row(0), row(1)].map((event) => ({
          classification: 'opaque',
          row: { leaderEpoch: event.leaderEpoch, sequence: event.sequence, runId: event.runId },
          eventType: event.type,
          affectsHistory: false,
        })),
      );
      expect(frames.at(-1)).toMatchObject({ type: 'validated', position: { cursor: 2 }, observedEndCursor: 2 });
      expect(observeBytes).toHaveBeenCalledOnce();
    } finally {
      held.resolve();
      await consuming;
      await reader.close();
    }
    expect(release).toHaveBeenCalledOnce();
  });

  it('reroutes an empty byte acquisition to admitted writer rows instead of publishing an empty batch', async () => {
    const captured = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    let acquired = 0;
    const release = vi.fn();
    const reader = await makeLauncher(
      async () => {
        acquired += 1;
        if (acquired === 1) {
          captured.resolve();
          await held.promise;
        }
      },
      async () => release,
      true,
    );
    const pending = reader.read({ chatId: 'empty-writer-reroute', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    try {
      await captured.promise;
      const answer = await reader.execute({
        type: 'start',
        commandId: 'empty-writer-start',
        payload: {
          chatId: 'empty-writer-reroute',
          runId: 'empty-writer-run',
          trigger: 'submit',
          message: { id: 'empty-writer-user', role: 'user', content: 'Open a writer while old empty bytes are held.' },
        },
      });
      if (answer.status === 'refused') {
        throw new Error(`Actual writer admission refused ${answer.code}: ${answer.message}`);
      }
      expect(answer).toMatchObject({ status: 'applied' });
      held.resolve();
      const batch = await pending;
      expect(batch.status).toBe('batch');
      if (batch.status !== 'batch') {
        throw new Error('The admitted writer must answer a batch.');
      }
      expect(batch.events.length).toBeGreaterThan(0);
      expect(
        batch.events.some(
          (event) =>
            typeof event === 'object' &&
            event !== null &&
            'type' in event &&
            event.type === 'run.lifecycle' &&
            'runId' in event &&
            event.runId === 'empty-writer-run',
        ),
      ).toBe(true);
      expect(batch.nextCursor).toBeGreaterThan(0);
      expect(acquired).toBeGreaterThanOrEqual(1);
    } finally {
      held.resolve();
      await pending;
      await reader.close();
    }
  });

  it('refuses a silently replaced same-size source before validating catch-up pages', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up-replace');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    const source = (text: string) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'same',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
        text,
      }) + '\n';
    await writeFile(path, source('before'));
    const iterator = reader.catchUp({ chatId: 'catch-up-replace', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'page' } });
    await writeFile(path, source('edited'));
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'refused', answer: { reason: 'identity-mismatch' } },
    });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('keeps captured end and rows stable when an independent dynamic read extends replay', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up-append');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    const row = (sequence: number) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'append',
        sequence,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n';
    await writeFile(path, row(0) + row(1));
    const iterator = reader.catchUp({ chatId: 'catch-up-append', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: 'page', answer: { cursor: 0, nextCursor: 1, endCursor: 2 } });
    await appendFile(path, row(2));
    await expect(read(reader, 'catch-up-append')).resolves.toMatchObject({ status: 'batch', endCursor: 3 });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'page', answer: { cursor: 1, nextCursor: 2, endCursor: 2 } },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'validated', position: { cursor: 2 }, observedEndCursor: 3 },
    });
  });

  it('refuses final validation when an unterminated published row changes generation on append', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up-tail');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    const row = JSON.stringify({
      version: 1,
      leaderEpoch: 'tail',
      sequence: 0,
      recordedAt: '2026-10-08T00:00:00.000Z',
      runId: 'r',
      type: 'future.row',
    });
    await writeFile(path, row);
    const iterator = reader.catchUp({ chatId: 'catch-up-tail', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'page' } });
    await appendFile(path, '\n');
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'refused', answer: { reason: 'identity-mismatch' } },
    });
  });

  it('shares exact captured views but refuses a thirty-third distinct active lease until release', async () => {
    const reader = await makeLauncher();
    const iterators: Array<AsyncIterator<CatchUpFrame>> = [];
    const firstAbort = new AbortController();
    try {
      for (let index = 0; index < 33; index++) {
        const chatId = `catch-up-capacity-${index}`;
        const directory = join(currentRoot(), '.tau', 'chats', chatId);
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await mkdir(directory, { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await writeFile(
          join(directory, 'events.jsonl'),
          JSON.stringify({
            version: 1,
            leaderEpoch: 'capacity',
            sequence: 0,
            recordedAt: '2026-10-08T00:00:00.000Z',
            runId: 'r',
            type: 'future.row',
          }) + '\n',
        );
        if (index < 32) {
          const iterator = reader
            .catchUp({ chatId, limit: 1, maxBytes: 1024, ...(index === 0 ? { signal: firstAbort.signal } : {}) })
            [Symbol.asyncIterator]();
          iterators.push(iterator);
          // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
          await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'page' } });
        }
      }
      const same = reader.catchUp({ chatId: 'catch-up-capacity-31', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
      iterators.push(same);
      await expect(same.next()).resolves.toMatchObject({ value: { type: 'page' } });
      const refused = reader
        .catchUp({ chatId: 'catch-up-capacity-32', limit: 1, maxBytes: 1024 })
        [Symbol.asyncIterator]();
      await expect(refused.next()).resolves.toMatchObject({
        value: { type: 'refused', answer: { reason: 'capacity-exceeded' } },
      });
      await refused.return?.();
      firstAbort.abort();
      const admitted = reader
        .catchUp({ chatId: 'catch-up-capacity-32', limit: 1, maxBytes: 1024 })
        [Symbol.asyncIterator]();
      iterators.push(admitted);
      await expect(admitted.next()).resolves.toMatchObject({ value: { type: 'page' } });
    } finally {
      for (const iterator of iterators) {
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await iterator.return?.();
      }
    }
  });

  it('bounds actual RPC catch-up credit delivery and releases an aborted slow consumer lease', async () => {
    const reader = await makeLauncher();
    const held: Array<AsyncIterator<CatchUpFrame>> = [];
    const channel = new MessageChannel();
    const controller = new AbortController();
    let pages = 0;
    const endpoint = agentChannelPort(channel.port2);
    const client = createAgentChannelClient({
      connect: () => ({
        ...endpoint,
        onMessage(handler) {
          return endpoint.onMessage((frame) => {
            const message = frame as { k?: string; d?: { type?: string } } | undefined;
            if (message?.k === 'sn' && message.d?.type === 'page') {
              pages += 1;
            }
            handler(frame);
          });
        },
      }),
    });
    const server = serveAgentChannel(channel.port1, reader, { build: 'catch-up-flow' });
    onTestFinished(() => {
      controller.abort();
      client.close();
      server.dispose();
      channel.port1.close();
      channel.port2.close();
    });
    try {
      for (let index = 0; index < 33; index++) {
        const chatId = `catch-up-flow-${index}`;
        const directory = join(currentRoot(), '.tau', 'chats', chatId);
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await mkdir(directory, { recursive: true });
        const rows = Array.from(
          { length: index === 31 ? 100 : 1 },
          (_, sequence) =>
            JSON.stringify({
              version: 1,
              leaderEpoch: 'flow',
              sequence,
              recordedAt: '2026-10-08T00:00:00.000Z',
              runId: 'r',
              type: 'future.row',
            }) + '\n',
        ).join('');
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await writeFile(join(directory, 'events.jsonl'), rows);
        if (index < 31) {
          const iterator = reader.catchUp({ chatId, limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
          held.push(iterator);
          // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
          await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'page' } });
        }
      }
      const slow = client
        .catchUp({ chatId: 'catch-up-flow-31', limit: 1, maxBytes: 1024, signal: controller.signal })
        [Symbol.asyncIterator]();
      await expect(slow.next()).resolves.toMatchObject({ value: { type: 'page' } });
      for (let tick = 0; tick < 10; tick++) {
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
      }
      expect(pages).toBeGreaterThan(1);
      expect(pages).toBeLessThanOrEqual(17);
      const refused = reader.catchUp({ chatId: 'catch-up-flow-32', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
      await expect(refused.next()).resolves.toMatchObject({
        value: { type: 'refused', answer: { reason: 'capacity-exceeded' } },
      });
      await refused.return?.();
      controller.abort();
      await slow.return?.();
      await vi.waitFor(async () => {
        const admitted = reader
          .catchUp({ chatId: 'catch-up-flow-32', limit: 1, maxBytes: 1024 })
          [Symbol.asyncIterator]();
        const next = await admitted.next();
        await admitted.return?.();
        expect(next).toMatchObject({ value: { type: 'page' } });
      });
    } finally {
      controller.abort();
      client.close();
      server.dispose();
      channel.port1.close();
      channel.port2.close();
      for (const iterator of held) {
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await iterator.return?.();
      }
    }
  });

  it('completes oversized cold then new-port warm catch-up with server-received credits', async () => {
    const reader = await makeLauncher();
    const chatId = 'repeat-capture-flow';
    const directory = join(currentRoot(), '.tau', 'chats', chatId);
    await mkdir(directory, { recursive: true });
    const payload = 'x'.repeat(6000);
    await writeFile(
      join(directory, 'events.jsonl'),
      Array.from(
        { length: 6000 },
        (_, sequence) =>
          JSON.stringify({
            version: 1,
            leaderEpoch: 'repeat',
            sequence,
            recordedAt: '2026-10-08T00:00:00.000Z',
            runId: 'repeat-run',
            type: 'future.row',
            payload,
          }) + '\n',
      ).join(''),
    );
    const complete = async () => {
      const channel = new MessageChannel();
      const endpoint = agentChannelPort(channel.port1);
      const received = { fa: 0, fw: 0, su: 0 };
      const server = serveAgentChannel(
        {
          ...endpoint,
          onMessage(handler) {
            return endpoint.onMessage((frame) => {
              const message = frame as { k?: string };
              if (message.k === 'fa' || message.k === 'fw' || message.k === 'su') {
                received[message.k]++;
              }
              handler(frame);
            });
          },
        },
        reader,
        { build: 'repeat-capture-flow' },
      );
      const client = createAgentChannelClient({ connect: () => agentChannelPort(channel.port2) });
      let pages = 0;
      let cursor = 0;
      let validated = false;
      let sourceGeneration: string | undefined;
      try {
        for await (const frame of client.catchUp({ chatId, limit: 16, maxBytes: 1_048_576 })) {
          if (frame.type === 'page') {
            expect(frame.answer.cursor).toBe(cursor);
            cursor = frame.answer.nextCursor;
            sourceGeneration ??= frame.answer.sourceGeneration;
            expect(frame.answer.sourceGeneration).toBe(sourceGeneration);
            pages++;
          } else {
            expect(frame).toMatchObject({ type: 'validated', position: { cursor: 6000, sourceGeneration } });
            validated = true;
          }
        }
        expect({ pages, cursor, validated }).toEqual({ pages: 375, cursor: 6000, validated: true });
        expect(received.fa).toBeGreaterThanOrEqual(375);
        expect(received.fw).toBeGreaterThanOrEqual(375);
        return sourceGeneration;
      } finally {
        client.close();
        server.dispose();
        channel.port1.close();
        channel.port2.close();
      }
    };
    const cold = await complete();
    const warm = await complete();
    expect(warm).toBe(cold);
  });

  it('validates an authoritative empty catch-up without parking a long poll', async () => {
    const reader = await makeLauncher();
    const controller = new AbortController();
    const iterator = reader
      .catchUp({ chatId: 'catch-up-empty', limit: 1, maxBytes: 1024, signal: controller.signal })
      [Symbol.asyncIterator]();
    let result: IteratorResult<CatchUpFrame> | undefined;
    const pending = (async () => {
      result = await iterator.next();
    })();
    try {
      await vi.waitFor(() => {
        expect(result).toMatchObject({ value: { type: 'validated', position: { cursor: 0 }, observedEndCursor: 0 } });
      });
    } finally {
      controller.abort();
      await pending;
      await iterator.return?.();
    }
  });

  it('refuses deletion before final catch-up proof without parking on the new empty source', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up-delete');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        leaderEpoch: 'delete',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const controller = new AbortController();
    const iterator = reader
      .catchUp({ chatId: 'catch-up-delete', limit: 1, maxBytes: 1024, signal: controller.signal })
      [Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: 'page' } });
    await rm(path);
    let result: IteratorResult<CatchUpFrame> | undefined;
    const pending = (async () => {
      result = await iterator.next();
    })();
    try {
      await vi.waitFor(() => {
        expect(result).toMatchObject({ value: { type: 'refused', answer: { reason: 'identity-mismatch' } } });
      });
    } finally {
      controller.abort();
      await pending;
      await iterator.return?.();
    }
  });

  it('uses strict writer-owned refusal and fences a writer opened during catch-up capture', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'catch-up-writer');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'events.jsonl'),
      JSON.stringify({
        version: 1,
        leaderEpoch: 'writer',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const captured = reader.catchUp({ chatId: 'catch-up-writer', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    await expect(captured.next()).resolves.toMatchObject({ value: { type: 'page' } });
    await reader.host.ledger('catch-up-writer');
    await expect(captured.next()).resolves.toMatchObject({
      value: { type: 'refused', answer: { chatId: 'catch-up-writer', reason: 'identity-mismatch' } },
    });
    const writer = reader.catchUp({ chatId: 'catch-up-writer', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    await expect(writer.next()).resolves.toMatchObject({
      value: { type: 'refused', answer: { chatId: 'catch-up-writer', reason: 'writer-owned' } },
    });
    await writer.return?.();
    await captured.return?.();
    await expect(read(reader, 'catch-up-writer')).resolves.toMatchObject({ status: 'batch', endCursor: 1 });
  });

  it('keeps an oversized validated marker usable immediately while an empty sibling ordinary read remains parked', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-catch-up-follow-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const row = (sequence: number) =>
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          leaderEpoch: 'oversized-follow',
          sequence,
          recordedAt: '2026-10-08T00:00:00.000Z',
          runId: 'r',
          type: 'future.row',
        }) + '\n',
      );
    let large = new Uint8Array(32 * 1024 * 1024 + 1).fill(32);
    large.set(row(0));
    large[large.length - 1] = 10;
    const released: string[] = [];
    const emptyAcquired = Promise.withResolvers<void>();
    const controller = new AbortController();
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        readBytes: async (chatId) => {
          if (chatId === 'small-follow') {
            emptyAcquired.resolve();
            return new Uint8Array();
          }
          return large;
        },
        observeBytes: async (chatId) => () => {
          released.push(chatId);
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const capture = launcher.catchUp({ chatId: 'large-follow', limit: 16, maxBytes: 1024 })[Symbol.asyncIterator]();
    await expect(capture.next()).resolves.toMatchObject({ value: { type: 'page' } });
    // Match the empty sibling's still-active cursor-zero long poll during final validation.
    const small = launcher.read({
      chatId: 'small-follow',
      cursor: 0,
      limit: 16,
      maxBytes: 1024,
      signal: controller.signal,
    });
    await emptyAcquired.promise;
    try {
      const marker = await capture.next();
      expect(marker.value).toMatchObject({ type: 'validated' });
      const validated = marker.value as Extract<CatchUpFrame, { type: 'validated' }>;
      await capture.next();
      expect(validated).toBeDefined();
      expect(released).not.toContain('large-follow');
      const append = row(1);
      const extended = new Uint8Array(large.length + append.length);
      extended.set(large);
      extended.set(append, large.length);
      large = extended;
      const next = await launcher.read({
        chatId: 'large-follow',
        ...validated.position,
        limit: 16,
        maxBytes: 1024,
      });
      expect(next).toMatchObject({
        status: 'batch',
        cursor: 1,
        nextCursor: 2,
        sourceGeneration: validated.position.sourceGeneration,
      });
    } finally {
      controller.abort();
      await small;
      await capture.return?.();
    }
  });

  it('allows normal captures beside one shared oversized view and refuses a second oversized identity until abort', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-catch-up-pins-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const row = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'pins',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const oversized = new Uint8Array(32 * 1024 * 1024 + 1).fill(32);
    oversized.set(row);
    oversized[oversized.length - 1] = 10;
    const released: string[] = [];
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        readBytes: async (chatId) => (chatId === 'normal' ? row : oversized),
        observeBytes: async (chatId) => () => {
          released.push(chatId);
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const controller = new AbortController();
    const held: Array<AsyncIterator<CatchUpFrame>> = [];
    try {
      const first = launcher
        .catchUp({ chatId: 'large-one', limit: 1, maxBytes: 1024, signal: controller.signal })
        [Symbol.asyncIterator]();
      held.push(first);
      await expect(first.next()).resolves.toMatchObject({ value: { type: 'page' } });
      const normal = launcher.catchUp({ chatId: 'normal', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
      held.push(normal);
      await expect(normal.next()).resolves.toMatchObject({ value: { type: 'page' } });
      const shared = launcher.catchUp({ chatId: 'large-one', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
      held.push(shared);
      await expect(shared.next()).resolves.toMatchObject({ value: { type: 'page' } });
      const other = launcher.catchUp({ chatId: 'large-two', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
      await expect(other.next()).resolves.toMatchObject({
        value: { type: 'refused', answer: { reason: 'capacity-exceeded' } },
      });
      await other.return?.();
      expect(released).toContain('large-two');
      controller.abort();
      await shared.return?.();
      const replacement = launcher.catchUp({ chatId: 'large-two', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
      held.push(replacement);
      await expect(replacement.next()).resolves.toMatchObject({ value: { type: 'page' } });
    } finally {
      controller.abort();
      for (const iterator of held) {
        // oxlint-disable-next-line no-await-in-loop -- sequential acquisition/release preserves the bounded ownership schedule under test.
        await iterator.return?.();
      }
    }
  });

  it('releases an aborted held catch-up acquisition and lets a replacement owner read fresh bytes before it settles', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-catch-up-held-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const bytes = (text: string) =>
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          leaderEpoch: 'held',
          sequence: 0,
          recordedAt: '2026-10-08T00:00:00.000Z',
          runId: text,
          type: 'future.row',
          text,
        }) + '\n',
      );
    const acquired = Promise.withResolvers<void>();
    const held = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const release = vi.fn();
    let reads = 0;
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        readBytes: async () => {
          reads += 1;
          if (reads === 1) {
            acquired.resolve();
            return held.promise;
          }
          return bytes('current');
        },
        observeBytes: async () => release,
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const controller = new AbortController();
    const old = launcher
      .catchUp({ chatId: 'held', limit: 1, maxBytes: 1024, signal: controller.signal })
      [Symbol.asyncIterator]();
    const oldNext = old.next();
    await acquired.promise;
    controller.abort();
    expect(release).toHaveBeenCalledOnce();
    const replacement = launcher.catchUp({ chatId: 'held', limit: 1, maxBytes: 1024 })[Symbol.asyncIterator]();
    let current: IteratorResult<CatchUpFrame> | undefined;
    const currentNext = (async () => {
      current = await replacement.next();
    })();
    try {
      await vi.waitFor(() => {
        expect(current).toMatchObject({
          value: { type: 'page', answer: { facts: [{ classification: 'opaque', row: { runId: 'current' } }] } },
        });
      });
      held.resolve(bytes('retired'));
      await oldNext;
      await expect(replacement.next()).resolves.toMatchObject({ value: { type: 'validated' } });
    } finally {
      held.resolve(bytes('retired'));
      await oldNext;
      await currentNext;
      await old.return?.();
      await replacement.return?.();
    }
  });

  it('prunes normal replay budget after final concurrent ordinary read release without a later read', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-replay-release-budget-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const row = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'budget',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const gate = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const release = vi.fn();
    let acquired = 0;
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        readBytes: async () => {
          acquired += 1;
          return gate.promise;
        },
        observeBytes: async () => release,
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const pending = Array.from({ length: 33 }, async (_, index) =>
      launcher!.read({ chatId: `release-budget-${index}`, cursor: 0, limit: 1, maxBytes: 1024 }),
    );
    try {
      await vi.waitFor(() => {
        expect(acquired).toBe(33);
      });
      gate.resolve(row);
      const answers = await Promise.all(pending);
      expect(answers.every((answer) => answer.status === 'batch')).toBe(true);
      expect(release).toHaveBeenCalled();
    } finally {
      gate.resolve(row);
      await Promise.allSettled(pending);
    }
  });

  it('detaches completed and aborted readers from a retained observation failure', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-replay-failure-lifetime-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'failure-lifetime',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    let acquired: (() => void) | undefined;
    let fail: (() => void) | undefined;
    let retiredInputReads = 0;
    const release = vi.fn();
    const observeBytes = vi.fn(async (_chatId: string, input: Parameters<NonNullable<typeof base.observeBytes>>[1]) => {
      fail = () => {
        input.onError(new Error('Retained source failed.'));
      };
      return release;
    });
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        observeBytes,
        readBytes: async () => {
          acquired?.();
          return bytes;
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const initial = await launcher.read({ chatId: 'failure-lifetime', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    if (initial.status !== 'batch') {
      throw new Error('The retained source did not acquire its initial generation.');
    }
    const attachments = new Map<Promise<unknown>, { count: number; settled: boolean }>();
    const originalThen = Promise.prototype.then;
    // oxlint-disable-next-line typescript/promise-function-async -- Preserve native Promise.then identity and scheduling while auditing attachments.
    const auditedThen = function (
      this: Promise<unknown>,
      fulfilled: Parameters<Promise<unknown>['then']>[0],
      rejected: Parameters<Promise<unknown>['then']>[1],
    ) {
      let entry = attachments.get(this);
      if (entry === undefined) {
        entry = { count: 0, settled: false };
        attachments.set(this, entry);
        const tracked = entry;
        void originalThen.call(
          this,
          () => {
            tracked.settled = true;
          },
          () => {
            tracked.settled = true;
          },
        );
      }
      entry.count += 1;
      return originalThen.call(this, fulfilled, rejected);
    };
    // oxlint-disable-next-line no-extend-native, no-thenable -- Audit actual native promise attachments only within this test, restoring the method in finally.
    void Object.defineProperty(Promise.prototype, 'then', { value: auditedThen, configurable: true, writable: true });
    try {
      for (let index = 0; index < 64; index += 1) {
        let retired = false;
        const entered = Promise.withResolvers<void>();
        acquired = entered.resolve;
        const controller = new AbortController();
        const input = {
          // oxlint-disable-next-line no-loop-func -- Each request owns its retired flag; the shared counter witnesses later callbacks.
          get chatId(): string {
            if (retired) {
              retiredInputReads += 1;
            }
            return 'failure-lifetime';
          },
          cursor: index < 32 ? 0 : 1,
          sourceGeneration: initial.sourceGeneration,
          sourceHealth: initial.sourceHealth,
          limit: 16,
          maxBytes: 1_048_576,
          signal: controller.signal,
        };
        const pending = launcher.read(input);
        // oxlint-disable-next-line no-await-in-loop -- Enter the actual byte acquisition before aborting a parked reader.
        await entered.promise;
        if (index >= 32) {
          controller.abort();
        }
        // oxlint-disable-next-line no-await-in-loop -- Each completed or cancelled acquisition must release independently.
        await (index >= 32
          ? expect(pending).rejects.toMatchObject({ name: 'AbortError' })
          : expect(pending).resolves.toMatchObject({ status: 'batch' }));
        retired = true;
      }
      await Promise.resolve();
      await Promise.resolve();
      expect
        .soft(
          [...attachments.values()].filter((entry) => !entry.settled && entry.count > 1).map((entry) => entry.count),
        )
        .toEqual([]);
      const entered = Promise.withResolvers<void>();
      acquired = entered.resolve;
      const active = launcher.read({
        chatId: 'failure-lifetime',
        cursor: 1,
        sourceGeneration: initial.sourceGeneration,
        sourceHealth: initial.sourceHealth,
        limit: 16,
        maxBytes: 1_048_576,
      });
      await entered.promise;
      retiredInputReads = 0;
      fail?.();
      await expect(active).resolves.toMatchObject({ status: 'refused', reason: 'unreadable' });
      expect(retiredInputReads).toBe(0);
      expect(observeBytes).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      await launcher.close();
      expect(release).toHaveBeenCalledOnce();
    } finally {
      // oxlint-disable-next-line no-extend-native, no-thenable -- Audit actual native promise attachments only within this test, restoring the method in finally.
      void Object.defineProperty(Promise.prototype, 'then', {
        value: originalThen,
        configurable: true,
        writable: true,
      });
    }
  });

  it('cancels one consumer during shared byte acquisition without cancelling the other', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'shared',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const observeBytes = vi.fn(base.observeBytes);
    const readBytes = vi.fn(async () => {
      entered.resolve();
      await held.promise;
      return bytes;
    });
    launcher = createAgentLauncher({
      chats: createChatStore({ ...base, readBytes, observeBytes }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const aborted = new AbortController();
    const input = { chatId: 'shared-read', cursor: 0, limit: 16, maxBytes: 1_048_576 };
    const a = launcher.read({ ...input, signal: aborted.signal });
    const b = launcher.read(input);
    await entered.promise;
    aborted.abort();
    try {
      await expect(
        Promise.race([
          a,
          new Promise((resolve) => {
            setTimeout(() => {
              resolve('consumer remained blocked');
            }, 200);
          }),
        ]),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      held.resolve();
    }
    await expect(b).resolves.toMatchObject({ status: 'batch', nextCursor: 1 });
    expect(readBytes).toHaveBeenCalledOnce();
    expect(observeBytes).toHaveBeenCalledOnce();
  });

  it('reacquires current bytes after observation failure while the retired acquisition is held', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'shared',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    let fail: (() => void) | undefined;
    const observeBytes = vi.fn(async (_chatId: string, input: Parameters<NonNullable<typeof base.observeBytes>>[1]) => {
      fail = () => {
        input.onError(new Error('Old source failed.'));
      };
      return () => {
        // This synthetic observer owns no external registration.
      };
    });
    const text = new TextDecoder().decode(bytes);
    const suffix = text.replace('"sequence":0', '"sequence":1');
    const oldBytes = new TextEncoder().encode(text + suffix.replace('"runId":"r"', '"runId":"retired"'));
    let currentBytes = bytes;
    const readBytes = vi.fn(async () => {
      if (readBytes.mock.calls.length === 1) {
        entered.resolve();
        await held.promise;
        return oldBytes;
      }
      return currentBytes;
    });
    launcher = createAgentLauncher({
      chats: createChatStore({ ...base, readBytes, observeBytes }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const input = { chatId: 'replacement-acquisition', cursor: 0, limit: 16, maxBytes: 1_048_576 };
    const old = launcher.read(input);
    await entered.promise;
    fail?.();
    await expect(old).resolves.toMatchObject({ status: 'refused', reason: 'unreadable' });
    const replacement = launcher.read(input);
    try {
      await expect(replacement).resolves.toMatchObject({ status: 'batch', events: [{ sequence: 0, runId: 'r' }] });
    } finally {
      held.resolve();
    }
    const current = await replacement;
    if (current.status !== 'batch') {
      throw new Error('The replacement did not acquire current bytes.');
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(readBytes).toHaveBeenCalledTimes(2);
    currentBytes = new TextEncoder().encode(text + suffix.replace('"runId":"r"', '"runId":"current"'));
    await expect(launcher.read(input)).resolves.toMatchObject({
      status: 'batch',
      sourceGeneration: current.sourceGeneration,
      events: [
        { sequence: 0, runId: 'r' },
        { sequence: 1, runId: 'current' },
      ],
    });
    expect(observeBytes).toHaveBeenCalledTimes(2);
  });

  it('retires an oversized replay only after its final active reader becomes idle', async () => {
    vi.useFakeTimers();
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-replay-large-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const row = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'large',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const bytes = new Uint8Array(32 * 1024 * 1024 + 1);
    bytes.set(row);
    bytes[bytes.length - 1] = 10;
    const release = vi.fn();
    const readBytes = vi.fn(async () => bytes);
    const observeBytes = vi.fn(async () => release);
    launcher = createAgentLauncher({
      chats: createChatStore({ ...base, observeBytes, readBytes }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    try {
      const input = { chatId: 'oversized', cursor: 0, limit: 16, maxBytes: 1_048_576 };
      const first = await launcher.read(input);
      if (first.status !== 'batch') {
        throw new Error('Expected replay.');
      }
      await vi.advanceTimersByTimeAsync(1500);
      // A replacement must not be retired by the old source's scheduled timer.
      bytes.set(new TextEncoder().encode(new TextDecoder().decode(row).replace('large', 'fresh')));
      const replacement = await launcher.read(input);
      if (replacement.status !== 'batch') {
        throw new Error('Expected replacement replay.');
      }
      expect(replacement.sourceGeneration).not.toBe(first.sourceGeneration);
      await vi.advanceTimersByTimeAsync(600);
      expect(release).not.toHaveBeenCalled();
      const aborted = new AbortController();
      const otherAborted = new AbortController();
      const next = {
        ...input,
        cursor: replacement.nextCursor,
        sourceGeneration: replacement.sourceGeneration,
        sourceHealth: replacement.sourceHealth,
      };
      const parked = launcher.read({ ...next, signal: aborted.signal });
      const other = launcher.read({ ...next, signal: otherAborted.signal });
      await vi.advanceTimersByTimeAsync(3000);
      expect(release).not.toHaveBeenCalled();
      const cancelled = expect(parked).rejects.toMatchObject({ name: 'AbortError' });
      aborted.abort();
      await cancelled;
      await vi.advanceTimersByTimeAsync(2100);
      expect(release).not.toHaveBeenCalled();
      const otherCancelled = expect(other).rejects.toMatchObject({ name: 'AbortError' });
      otherAborted.abort();
      await otherCancelled;
      await vi.advanceTimersByTimeAsync(1999);
      expect(release).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(release).toHaveBeenCalledOnce();
      const stale = await launcher.read({
        ...input,
        cursor: first.nextCursor,
        sourceGeneration: first.sourceGeneration,
        sourceHealth: first.sourceHealth,
      });
      expect(stale).toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
      const current = await launcher.read(input);
      expect(current).toMatchObject({ status: 'batch', nextCursor: first.nextCursor });
      expect(observeBytes).toHaveBeenCalledTimes(2);
      expect(readBytes.mock.calls.length).toBeGreaterThanOrEqual(4);
    } finally {
      await launcher.close();
      vi.useRealTimers();
    }
  });

  it('keeps a replacement owner after the failed prior registration rejects late', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-replay-owner-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const firstRegistered = Promise.withResolvers<void>();
    const firstAcknowledgement = Promise.withResolvers<() => void>();
    let oldError: ((error: unknown) => void) | undefined;
    const release = vi.fn();
    const observeBytes = vi.fn(async (_chatId: string, input: Parameters<NonNullable<typeof base.observeBytes>>[1]) => {
      if (observeBytes.mock.calls.length === 1) {
        oldError = input.onError;
        firstRegistered.resolve();
        return firstAcknowledgement.promise;
      }
      return release;
    });
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'owner',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    launcher = createAgentLauncher({
      chats: createChatStore({ ...base, observeBytes, readBytes: async () => bytes }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const input = { chatId: 'late-owner', cursor: 0, limit: 16, maxBytes: 1_048_576 };
    const old = launcher.read(input);
    await firstRegistered.promise;
    oldError?.(new Error('Prior observation failed.'));
    const replacement = launcher.read(input);
    // The prior owner still has an active reader while its replacement registers.
    oldError?.(new Error('Prior observation failed again before its reader unwound.'));
    const current = await replacement;
    await expect(old).resolves.toMatchObject({ status: 'refused', reason: 'unreadable' });
    firstAcknowledgement.reject(new Error('Prior registration rejected late.'));
    await Promise.resolve();
    await Promise.resolve();
    expect(await launcher.read(input)).toEqual(current);
    expect(observeBytes).toHaveBeenCalledTimes(2);
    expect(release).not.toHaveBeenCalled();
    await launcher.close();
    expect(release).toHaveBeenCalledOnce();
  });

  it('ends failed observation as unreadable and releases pending acknowledgement after close', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const reading = Promise.withResolvers<void>();
    const acknowledged = Promise.withResolvers<void>();
    let failed: ((error: unknown) => void) | undefined;
    let pending = false;
    const release = vi.fn();
    launcher = createAgentLauncher({
      chats: createChatStore({
        ...base,
        readBytes: async () => {
          reading.resolve();
          return new Uint8Array();
        },
        observeBytes: async (_chatId, input) => {
          failed = input.onError;
          if (pending) {
            await acknowledged.promise;
          }
          return release;
        },
      }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const input = { chatId: 'failed-observation', cursor: 0, limit: 16, maxBytes: 1_048_576 };
    const waiting = launcher.read(input);
    await reading.promise;
    failed?.(new Error('Source channel closed.'));
    await expect(waiting).resolves.toMatchObject({ status: 'refused', reason: 'unreadable' });
    expect(release).toHaveBeenCalledOnce();
    pending = true;
    const held = launcher.read(input);
    await Promise.resolve();
    await launcher.close();
    await expect(held).rejects.toMatchObject({ name: 'AbortError' });
    acknowledged.resolve();
    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledTimes(2);
    });
  });

  it('resets two parked native readers after same-key replacement', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'parked-reset');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    const source = (text: string) =>
      [0, 1]
        .map(
          (sequence) =>
            JSON.stringify({
              version: 1,
              leaderEpoch: 'external',
              sequence,
              recordedAt: '2026-10-08T00:00:00.000Z',
              runId: 'r',
              type: 'future.row',
              text: sequence === 0 ? text : 'boundary',
            }) + '\n',
        )
        .join('');
    await writeFile(path, source('before'));
    const first = await read(reader, 'parked-reset');
    if (first.status !== 'batch') {
      throw new Error('Expected native source.');
    }
    const input = {
      chatId: 'parked-reset',
      cursor: 2,
      sourceGeneration: first.sourceGeneration,
      sourceHealth: first.sourceHealth,
      last: { leaderEpoch: 'external', sequence: 1 },
      limit: 16,
      maxBytes: 1_048_576,
    };
    const a = reader.read({ ...input, signal: AbortSignal.timeout(2000) });
    const b = reader.read({ ...input, signal: AbortSignal.timeout(2000) });
    await writeFile(path, source('after!'));
    await expect(a).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
    await expect(b).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
  });

  it('wakes a real Node parked reader on an external append and resets it on deletion', async () => {
    const acquired = Promise.withResolvers<void>();
    let reads = 0;
    const reader = await makeLauncher(() => {
      reads++;
      if (reads === 2) {
        acquired.resolve();
      }
    });
    const directory = join(currentRoot(), '.tau', 'chats', 'native-source');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    const line = (sequence: number) =>
      JSON.stringify({
        version: 1,
        leaderEpoch: 'external',
        sequence,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'run',
        type: 'future.row',
      }) + '\n';
    await writeFile(path, line(0));
    const first = await read(reader, 'native-source');
    if (first.status !== 'batch') {
      throw new Error('Expected native batch.');
    }
    const input = {
      chatId: 'native-source',
      cursor: 1,
      sourceGeneration: first.sourceGeneration,
      sourceHealth: first.sourceHealth,
      last: { leaderEpoch: 'external', sequence: 0 },
      limit: 16,
      maxBytes: 1_048_576,
    };
    const waiting = reader.read({ ...input, signal: AbortSignal.timeout(2000) });
    await acquired.promise;
    // Flush the production read continuation into its parked state before the external append.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    await appendFile(path, line(1));
    await expect(waiting).resolves.toMatchObject({ status: 'batch', cursor: 1, nextCursor: 2 });
    await rm(path);
    await expect(reader.read(input)).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
  });

  it('resets an evicted source and keeps an unchanged warm source generation', async () => {
    const reader = await makeLauncher();
    const seed = async (chatId: string) => {
      const directory = join(currentRoot(), '.tau', 'chats', chatId);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, 'events.jsonl'),
        JSON.stringify({
          version: 1,
          leaderEpoch: 'evict',
          sequence: 0,
          recordedAt: '2026-10-08T00:00:00.000Z',
          runId: 'r',
          type: 'future.row',
        }) + '\n',
      );
    };
    await seed('cache-0');
    const first = await read(reader, 'cache-0');
    if (first.status !== 'batch') {
      throw new Error('Expected source batch.');
    }
    for (let index = 1; index <= 32; index++) {
      // oxlint-disable-next-line no-await-in-loop -- each acquisition advances the bounded LRU.
      await seed(`cache-${index}`);
      // oxlint-disable-next-line no-await-in-loop -- each acquisition advances the bounded LRU.
      await read(reader, `cache-${index}`);
    }
    await expect(
      reader.read({
        chatId: 'cache-0',
        cursor: 1,
        sourceGeneration: first.sourceGeneration,
        sourceHealth: first.sourceHealth,
        limit: 16,
        maxBytes: 1_048_576,
      }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
    const fresh = await read(reader, 'cache-0');
    expect(fresh.status === 'batch' && fresh.sourceGeneration).not.toBe(first.sourceGeneration);
  });

  it('reuses decoded rows only after each independent authoritative byte read', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'reuse',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'r',
        type: 'future.row',
      }) + '\n',
    );
    const readBytes = vi.fn(async () => new Uint8Array(bytes));
    const observeBytes = vi.fn(base.observeBytes);
    launcher = createAgentLauncher({
      chats: createChatStore({ ...base, readBytes, observeBytes }),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    vi.mocked(parseEventLogBytes).mockClear();
    vi.mocked(foldClassifiedChatLedger).mockClear();
    vi.mocked(isBytePrefix).mockClear();
    const readPage = async () => launcher!.read({ chatId: 'reuse', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    const first = await readPage();
    const second = await readPage();
    expect(parseEventLogBytes).toHaveBeenCalledOnce();
    expect(foldClassifiedChatLedger).toHaveBeenCalledOnce();
    expect(isBytePrefix).toHaveBeenCalledOnce();
    expect(vi.mocked(parseEventLogBytes).mock.calls[0]?.[0].byteLength).toBe(bytes.byteLength);
    expect(vi.mocked(isBytePrefix).mock.calls[0]?.[0].byteLength).toBe(bytes.byteLength);
    for (let index = 0; index < 30; index++) {
      // oxlint-disable-next-line no-await-in-loop -- each independent page validates current bytes.
      await readPage();
    }
    expect(readBytes).toHaveBeenCalledTimes(32);
    expect(observeBytes).toHaveBeenCalledOnce();
    expect(parseEventLogBytes).toHaveBeenCalledOnce();
    expect(foldClassifiedChatLedger).toHaveBeenCalledOnce();
    expect(isBytePrefix).toHaveBeenCalledTimes(31);
    expect(first.status).toBe('batch');
    expect(second.status).toBe('batch');
    if (first.status === 'batch' && second.status === 'batch') {
      expect(second.events[0]).toBe(first.events[0]);
      expect(second.sourceGeneration).toBe(first.sourceGeneration);
    }
  });

  it('acknowledges source observation before reading and wakes a parked external append', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-node-launcher-'));
    roots.push(workspaceRoot);
    const base = chatStoreBinding(createNodeChatStore({ workspaceRoot }));
    const acknowledged = Promise.withResolvers<void>();
    const reading = Promise.withResolvers<void>();
    let changed: (() => void) | undefined;
    let bytes = new Uint8Array();
    const release = vi.fn();
    const readBytes = vi.fn(async () => {
      reading.resolve();
      return bytes;
    });
    const observed = {
      ...base,
      readBytes,
      observeBytes: async (_chatId: string, input: { onChange: () => void }) => {
        changed = input.onChange;
        await acknowledged.promise;
        return release;
      },
    };
    launcher = createAgentLauncher({
      chats: createChatStore(observed),
      modelTransport: createTauCloudGatewayModelTransport({
        baseUrl: 'https://gateway.example',
        model,
        auth: () => 'daemon-bearer',
        fetch: scriptedGateway(),
      }),
      credential: () => ({ mode: 'session' }),
      systemPrompt: 'You are Tau.',
      model,
      toolRegistry: emptyTools,
    });
    const observing = launcher.read({ chatId: 'external-wake', cursor: 0, limit: 16, maxBytes: 1_048_576 });
    await Promise.resolve();
    expect(readBytes).not.toHaveBeenCalled();
    acknowledged.resolve();
    await reading.promise;
    const initial = await observing;
    expect(initial).toMatchObject({ status: 'batch', nextCursor: 0 });
    if (initial.status !== 'batch') {
      throw new Error('Expected initial authoritative health.');
    }
    const waiting = launcher.read({
      chatId: 'external-wake',
      cursor: 0,
      limit: 16,
      maxBytes: 1_048_576,
      sourceGeneration: initial.sourceGeneration,
      sourceHealth: initial.sourceHealth,
    });
    await vi.waitFor(() => {
      expect(readBytes).toHaveBeenCalledTimes(2);
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        leaderEpoch: 'external',
        sequence: 0,
        recordedAt: '2026-10-08T00:00:00.000Z',
        runId: 'run',
        type: 'future.row',
      }) + '\n',
    );
    changed?.();
    await expect(waiting).resolves.toMatchObject({ status: 'batch', nextCursor: 1 });
    expect(release).not.toHaveBeenCalled();
    await launcher.close();
    expect(release).toHaveBeenCalledOnce();
  });

  it('resets both old readers after an earlier same-key source replacement', async () => {
    const reader = await makeLauncher();
    const directory = join(currentRoot(), '.tau', 'chats', 'source-reset');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'events.jsonl');
    const row = (sequence: number, text: string) => ({
      version: 1,
      leaderEpoch: 'source',
      sequence,
      recordedAt: '2026-10-08T00:00:00.000Z',
      runId: 'run-source',
      type: 'future.row',
      text,
    });
    const source = (text: string) =>
      [row(0, text), row(1, 'boundary'), row(2, 'suffix')].map((event) => JSON.stringify(event) + '\n').join('');
    await writeFile(path, source('before'));
    const request = { chatId: 'source-reset', cursor: 0, limit: 2, maxBytes: 1_048_576 };
    const first = await reader.read(request);
    expect(first).toMatchObject({ status: 'batch', nextCursor: 2 });
    if (first.status !== 'batch') {
      throw new Error('Expected source batch.');
    }
    const secondReader = await reader.read(request);
    if (secondReader.status !== 'batch') {
      throw new Error('Expected second source batch.');
    }
    const { sourceGeneration } = first;
    const old = { ...request, cursor: 2, last: { leaderEpoch: 'source', sequence: 1 }, sourceGeneration };
    await writeFile(path, source('after!'));
    await expect(reader.read(old)).resolves.toMatchObject({ status: 'refused', reason: 'identity-mismatch' });
    await expect(reader.read({ ...old, sourceGeneration: secondReader.sourceGeneration })).resolves.toMatchObject({
      status: 'refused',
      reason: 'identity-mismatch',
    });
    await expect(reader.read({ ...request, cursor: 2 })).resolves.toMatchObject({
      status: 'refused',
      reason: 'identity-mismatch',
    });
    const fresh = await reader.read(request);
    expect(fresh).toMatchObject({ status: 'batch', events: [row(0, 'after!'), row(1, 'boundary')] });
  });
});
