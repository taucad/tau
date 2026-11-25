/**
 * The transcript fold's last step against the pinned AI SDK (use_skill startup latency blueprint, T1, I-4): after
 * every row and live event of every fixture log and replay sequence, `reduceChunks` shows what the SDK's own readers
 * show for the same chunks, except for the deviations named here. The SDK is the oracle until T4 freezes its answers.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createUIMessageStream, parsePartialJson as sdkParsePartialJson, readUIMessageStream } from 'ai';
import type { InferUIMessageChunk, UIMessageChunk } from 'ai';
import type { AgentLiveEvent } from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import { reduceChunks } from '@taucad/chat-ui/services/ui-message-reducer';
import type { ChunkReduction } from '@taucad/chat-ui/services/ui-message-reducer';
import { parsePartialJson } from '@taucad/chat-ui/utils/partial-json';
import { chunksOf, initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent, ProjectedChunks } from '#machines/chat-projection.logic.js';
import { logRow, prestartedSkillPairRows } from '#machines/chat-projection.fixture.js';

// ===========================================================================
// Oracles: the two SDK readers the page runs today
// ===========================================================================

type Oracle = Readonly<{ message: MyUIMessage | undefined; error?: string }>;

/** The live chat's reader, as `materializeRun` and the run watch drive it: failure rows are the ledger's, not parts. */
const readOracle = async (chunks: readonly UIMessageChunk[]): Promise<Oracle> => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        if (chunk.type !== 'error') {
          controller.enqueue(chunk);
        }
      }
      controller.close();
    },
  });
  let message: MyUIMessage | undefined;
  try {
    for await (const next of readUIMessageStream<MyUIMessage>({ stream, terminateOnError: true })) {
      message = next;
    }
  } catch (error) {
    return { message, error: String(error) };
  }
  return { message };
};

/** Whether `materializeRun` reads these chunks through the finished-stream path instead. */
const finishedEligible = (chunks: readonly UIMessageChunk[]): boolean => {
  const last = chunks.at(-1);
  return (
    last?.type === 'finish' &&
    last.messageMetadata !== undefined &&
    last.messageMetadata !== null &&
    chunks.some((chunk) => chunk.type === 'start') &&
    chunks.every((chunk) => chunk.type !== 'start' || typeof chunk.messageId === 'string')
  );
};

/** The finished-run path `materializeRun` uses for a completed run (`createUIMessageStream`'s finish message). */
const finishOracle = async (chunks: readonly UIMessageChunk[]): Promise<Oracle> => {
  let message: MyUIMessage | undefined;
  const completed = createUIMessageStream<MyUIMessage>({
    generateId: () => '',
    execute({ writer }) {
      for (const chunk of chunks) {
        if (chunk.type !== 'error') {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- The projector's chunks are MyUIMessage chunks.
          writer.write(chunk as InferUIMessageChunk<MyUIMessage>);
        }
      }
    },
    onFinish({ responseMessage }) {
      message = structuredClone(responseMessage);
    },
  });
  const reader = completed.getReader();
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Drain the processor before reading its finish message.
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  } catch (error) {
    return { message, error: String(error) };
  } finally {
    reader.releaseLock();
  }
  return { message };
};

// ===========================================================================
// Named deviations (each replaces the SDK behaviour with the assertion below)
// ===========================================================================

/**
 * D1, total: a chunk that does not fit (an output, approval or delta with no call or block) makes the SDK reader throw
 * and end the stream, and today's store then blocks the transcript. The fold skips that chunk, counts it, and shows
 * what the SDK shows for the same chunks without it.
 */
const expectTotalDeviation = async (chunks: readonly UIMessageChunk[], ours: ChunkReduction): Promise<void> => {
  expect(ours.skipped).toBeGreaterThan(0);
  const fitting: UIMessageChunk[] = [];
  let before: ChunkReduction | undefined;
  for (const chunk of chunks) {
    const after = reduceChunks([chunk], before);
    if (after.skipped === (before?.skipped ?? 0)) {
      fitting.push(chunk);
    }
    before = after;
  }
  const oracle = await readOracle(fitting);
  expect(oracle.error).toBeUndefined();
  expect(ours.message).toEqual(oracle.message);
};

// ===========================================================================
// The harness: every chunk owner of a projection, after every event
// ===========================================================================

type Owner = Readonly<{ key: string; chunks: ProjectedChunks }>;

const ownersOf = (projection: ChatProjection): Owner[] => {
  const owners: Owner[] = [];
  const add = (prefix: string, views: ChatProjection['views'] | undefined): void => {
    for (const [runId, view] of Object.entries(views ?? {})) {
      owners.push({ key: `${prefix}${runId}`, chunks: view.chunks });
      for (const [index, segment] of (view.segments ?? []).entries()) {
        owners.push({ key: `${prefix}${runId}/segment/${String(index)}`, chunks: segment.chunks });
      }
    }
  };
  add('', projection.views);
  add('remote:', projection.remote?.views);
  if (projection.live !== undefined) {
    owners.push({ key: `live:${projection.live.runId}`, chunks: projection.live.chunks });
  }
  return owners;
};

const sameChunks = (left: readonly UIMessageChunk[], right: readonly UIMessageChunk[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** Folds events through the projection and checks every chunk owner that changed against the oracles. */
const createParityCheck = () => {
  const checked = new WeakSet<ProjectedChunks>();
  const previous = new Map<string, Readonly<{ chunks: readonly UIMessageChunk[]; reduction: ChunkReduction }>>();
  let compared = 0;
  let overlays = 0;

  const checkOwner = async ({ key, chunks }: Owner, label: string): Promise<void> => {
    const all = chunksOf(chunks);
    const ours = reduceChunks(all);
    compared++;
    const oracle = await readOracle(all);
    if (oracle.error === undefined) {
      expect(ours.message, `${label}: ${key}`).toEqual(oracle.message);
      expect(ours.skipped, `${label}: ${key}`).toBe(0);
    } else {
      await expectTotalDeviation(all, ours);
    }
    const finished = finishedEligible(all) ? await finishOracle(all) : undefined;
    if (finished?.error === undefined) {
      if (finished !== undefined) {
        expect(ours.message, `${label}: ${key} (finished)`).toEqual(finished.message);
      }
    } else {
      await expectTotalDeviation(all, ours);
    }
    // A suffix continues the previous reduction to the same message.
    const prior = previous.get(key);
    if (prior !== undefined && sameChunks(prior.chunks, all.slice(0, prior.chunks.length))) {
      const continued = reduceChunks(all.slice(prior.chunks.length), prior.reduction);
      expect(continued.message, `${label}: ${key} (continued)`).toEqual(ours.message);
    }
    previous.set(key, { chunks: all, reduction: ours });
  };

  const check = async (projection: ChatProjection, label: string): Promise<void> => {
    const changed = ownersOf(projection).filter(({ chunks }) => !checked.has(chunks));
    for (const { chunks } of changed) {
      checked.add(chunks);
    }
    await Promise.all(changed.map(async (owner) => checkOwner(owner, label)));
    // Overlay: once the live overlay holds nothing the log does not, it shows what the durable chunks show.
    const { live } = projection;
    const view = live === undefined ? undefined : projection.views[live.runId];
    if (
      live !== undefined &&
      view !== undefined &&
      JSON.stringify(live.blocks) === JSON.stringify(projection.blocks[live.runId] ?? {})
    ) {
      overlays++;
      expect(reduceChunks(chunksOf(live.chunks)).message?.parts, `${label}: overlay`).toEqual(
        reduceChunks(chunksOf(view.chunks)).message?.parts,
      );
    }
  };

  return {
    check,
    counts: () => ({ compared, overlays }),
  };
};

const batchOf = (rows: readonly unknown[], cursor: number, endCursor: number): ChatProjectionEvent => ({
  type: 'batch',
  answer: { status: 'batch', cursor, nextCursor: cursor + rows.length, endCursor, events: rows },
});

/** Fold each row as its own batch, checking parity after each, then the whole log as one batch. */
const replay = async (rows: readonly unknown[], name: string) => {
  const parity = createParityCheck();
  let state = initialChatProjection;
  for (const [at, row] of rows.entries()) {
    state = reduceChatProjection(state, batchOf([row], at, rows.length)).state;
    // oxlint-disable-next-line no-await-in-loop -- Parity is checked after each row, in log order.
    await parity.check(state, `${name} row ${String(at)}`);
  }
  await parity.check(reduceChatProjection(initialChatProjection, batchOf(rows, 0, rows.length)).state, `${name} whole`);
  return parity.counts();
};

// ===========================================================================
// Inputs
// ===========================================================================

const here = dirname(import.meta.filename);
const chatLogRoot = join(here, '../../../../packages/agent-host/specs/ChatLog');

const readRows = (path: string): unknown[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line));

/** Every fixture log in the repository, once each: the ChatLog corpus and the page's own recorded logs. */
const fixtureLogs = (): ReadonlyArray<readonly [string, unknown[]]> => {
  const files = [
    ...['recorded', 'seeded'].flatMap((folder) =>
      readdirSync(join(chatLogRoot, folder))
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => join(chatLogRoot, folder, name)),
    ),
    join(here, '__fixtures__/acp-approval-refined-while-paused.jsonl'),
    join(here, '../services/__fixtures__/daemon-reattach-hexnut.jsonl'),
    join(here, '../services/__fixtures__/daemon-reattach-hexnut-4runs.jsonl'),
  ];
  const seen = new Set<string>();
  return files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    if (seen.has(text)) {
      return [];
    }
    seen.add(text);
    return [[file.slice(file.lastIndexOf('/') + 1), readRows(file)] as const];
  });
};

type LiveFields = AgentLiveEvent extends infer Event
  ? Event extends AgentLiveEvent
    ? Omit<Event, 'chatId'>
    : never
  : never;

const live = (event: LiveFields): ChatProjectionEvent => ({
  type: 'live',
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Each literal below is one member of the union; spreading it loses the discriminant.
  event: { chatId: 'chat_1', ...event } as AgentLiveEvent,
});

/**
 * Run D with what the live channel carried between its rows: call B's input streaming before its prestart, and the
 * next step's text streaming before and past its checkpoint.
 */
const prestartedPairEvents = (): readonly ChatProjectionEvent[] => {
  const rows = prestartedSkillPairRows();
  const at = (sequence: number): ChatProjectionEvent => batchOf([rows[sequence]], sequence, rows.length);
  const tool = { runId: 'run_1', messageId: 'step-1', contentIndex: 1, toolCallId: 'skill-b', toolName: 'use_skill' };
  const text = { runId: 'run_1', messageId: 'step-2', contentIndex: 0 };
  return [
    at(0),
    at(1),
    at(2),
    at(3),
    at(4),
    live({ type: 'tool-input-start', ...tool }),
    live({ type: 'tool-input-delta', ...tool, delta: '{"na' }),
    live({ type: 'tool-input-delta', ...tool, delta: 'me":"geospec-' }),
    at(5),
    live({ type: 'tool-input-delta', ...tool, delta: 'authoring"}' }),
    live({ type: 'tool-input-end', ...tool, input: { name: 'geospec-authoring' } }),
    at(6),
    at(7),
    at(8),
    at(9),
    at(10),
    live({ type: 'text-start', ...text }),
    live({ type: 'text-delta', ...text, delta: 'Build', offset: 0 }),
    live({ type: 'text-delta', ...text, delta: 'ing the', offset: 5 }),
    at(11),
    live({ type: 'text-delta', ...text, delta: ' washer.', offset: 12 }),
    live({ type: 'text-end', ...text, content: 'Building the washer.' }),
    at(12),
    at(13),
  ];
};

/** A steering input folded while the active step's text streams. */
const steeringMidStream = (): readonly ChatProjectionEvent[] => {
  const rows = [
    logRow(0, { type: 'run.lifecycle', state: 'admitted', attempt: 1 }),
    logRow(1, { type: 'run.lifecycle', state: 'running', attempt: 1 }),
    logRow(2, { type: 'message.appended', message: { id: 'user-1', role: 'user', content: 'Make a cube.' } }),
    logRow(3, {
      type: 'message.appended',
      message: {
        id: 'step-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Drafting' }],
        metadata: { tauInternal: { kind: 'stream-checkpoint', streamState: 'checkpoint' } },
      },
    }),
    logRow(4, { type: 'message.appended', message: { id: 'steer:1', role: 'user', content: 'Make it red.' } }),
    logRow(5, {
      type: 'message.appended',
      message: { id: 'step-2', role: 'assistant', content: [{ type: 'text', text: 'Red cube.' }] },
    }),
    logRow(6, { type: 'run.lifecycle', state: 'completed', attempt: 1 }),
  ];
  const text = { runId: 'run_1', messageId: 'step-1', contentIndex: 0 };
  const at = (sequence: number): ChatProjectionEvent => batchOf([rows[sequence]], sequence, rows.length);
  return [
    at(0),
    at(1),
    at(2),
    live({ type: 'text-start', ...text }),
    live({ type: 'text-delta', ...text, delta: 'Drafting a', offset: 0 }),
    at(3),
    live({ type: 'text-delta', ...text, delta: ' cube', offset: 10 }),
    at(4),
    at(5),
    at(6),
  ];
};

const replayEvents = async (events: readonly ChatProjectionEvent[], name: string) => {
  const parity = createParityCheck();
  let state = initialChatProjection;
  for (const [index, event] of events.entries()) {
    state = reduceChatProjection(state, event).state;
    // oxlint-disable-next-line no-await-in-loop -- Parity is checked after each event, in order.
    await parity.check(state, `${name} event ${String(index)}`);
  }
  return parity.counts();
};

// ===========================================================================
// Tests
// ===========================================================================

describe('reduceChunks parity with the pinned AI SDK reader (T1)', () => {
  it('should show what the SDK shows after every row of every fixture log', async () => {
    const counts = await Promise.all(fixtureLogs().map(async ([name, rows]) => replay(rows, name)));
    expect(counts.reduce((total, { compared }) => total + compared, 0)).toBeGreaterThan(100);
  });

  it('should show what the SDK shows after every row and live event of Run D', async () => {
    const { compared, overlays } = await replayEvents(prestartedPairEvents(), 'Run D');
    expect(compared).toBeGreaterThan(10);
    expect(overlays).toBeGreaterThan(0);
  });

  it('should show what the SDK shows after every row of Run D folded row by row', async () => {
    const { compared } = await replay(prestartedSkillPairRows(), 'Run D rows');
    expect(compared).toBeGreaterThan(5);
  });

  it('should show what the SDK shows when a steering input folds while text streams', async () => {
    const { compared } = await replayEvents(steeringMidStream(), 'steering');
    expect(compared).toBeGreaterThan(5);
  });

  it('should skip and count an output with no call where the SDK throws (D1)', async () => {
    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: 'm' },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Before' },
      { type: 'tool-output-available', toolCallId: 'missing', output: 'x' },
      { type: 'text-delta', id: 'missing-block', delta: 'lost' },
      { type: 'text-delta', id: 't', delta: ' after' },
    ];
    const oracle = await readOracle(chunks);
    expect(oracle.error).toContain('No tool invocation found');

    const ours = reduceChunks(chunks);

    expect(ours.skipped).toBe(2);
    expect(ours.message?.parts).toEqual([{ type: 'text', text: 'Before after', state: 'streaming' }]);
    await expectTotalDeviation(chunks, ours);
  });
});

// ===========================================================================
// Partial JSON
// ===========================================================================

const toolInputsOf = (rows: readonly unknown[]): string[] =>
  rows.flatMap((row) => {
    type Envelope = { role?: unknown; content?: unknown };
    // oxlint-disable-next-line typescript/consistent-type-assertions -- A fixture row, read only for its envelope.
    const value = row as { message?: Envelope; replacement?: Envelope };
    const message = value.message ?? value.replacement;
    return message?.role === 'tool-input' ? [JSON.stringify(message.content)] : [];
  });

/** A deterministic corpus of JSON texts: nesting, escapes, unicode escapes, numbers, literals and whitespace. */
const generatedJson = (): string[] => {
  let seed = 7;
  const next = (bound: number): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return Math.floor((seed / 2_147_483_648) * bound);
  };
  const value = (depth: number): unknown => {
    switch (next(depth > 3 ? 6 : 8)) {
      case 0: {
        return null;
      }
      case 1: {
        return next(2) === 0;
      }
      case 2: {
        return [-1.5e-3, 0, 42, 123_456.789, -7][next(5)];
      }
      case 3: {
        return ['', 'plain', String.raw`quote " and \ slash`, 'line\nbreak\ttab', 'unicode é ✓ 🙂', '\u0001ctl'][
          next(6)
        ];
      }
      case 4:
      case 5: {
        return `s${String(next(100))}`;
      }
      case 6: {
        return Array.from({ length: next(4) }, () => value(depth + 1));
      }
      default: {
        return Object.fromEntries(
          Array.from({ length: next(4) }, (_, index) => [`k${String(index)}`, value(depth + 1)]),
        );
      }
    }
  };
  const texts = Array.from({ length: 200 }, () => JSON.stringify(value(0), undefined, next(3) === 0 ? 1 : undefined));
  return [
    ...texts,
    '{"__proto__": {"polluted": true}}',
    '{"a": {"constructor": {"prototype": {"x": 1}}}}',
    String.raw`{"__proto__": 1}`,
    '[tru',
    '{"n": -',
    '{"n": 1.',
    '{"n": 1e',
    String.raw`"\u00`,
  ];
};

describe('parsePartialJson parity with the pinned AI SDK (T1)', () => {
  const corpus = [
    ...new Set([
      ...fixtureLogs().flatMap(([, rows]) => toolInputsOf(rows)),
      ...toolInputsOf(prestartedSkillPairRows()),
      ...generatedJson(),
    ]),
  ];

  it('should parse every prefix of every fixture tool input and generated text as the SDK does', async () => {
    expect(corpus.length).toBeGreaterThan(100);
    let prefixes = 0;
    for (const text of corpus) {
      for (let end = 0; end <= text.length; end++) {
        const prefix = text.slice(0, end);
        // oxlint-disable-next-line no-await-in-loop -- The SDK parser is asynchronous; prefixes are compared in order.
        const { value } = await sdkParsePartialJson(prefix);
        expect(parsePartialJson(prefix), JSON.stringify(prefix)).toEqual(value);
        prefixes++;
      }
    }
    expect(prefixes).toBeGreaterThan(5000);
  });

  it('should reject a prototype-polluting key as the SDK does', async () => {
    const text = '{"__proto__": {"polluted": true}}';
    const sdk = await sdkParsePartialJson(text);
    expect(sdk.value).toBeUndefined();
    expect(parsePartialJson(text)).toBeUndefined();
  });
});
