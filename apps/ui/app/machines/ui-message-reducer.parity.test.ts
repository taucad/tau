/**
 * The transcript fold's last step against the AI SDK's answers, frozen (use_skill startup latency blueprint, T1, T4,
 * I-4): after every row and live event of every fixture log and replay sequence, `reduceChunks` shows what the pinned
 * SDK's readers showed for the same chunks when T4 removed them, except for D1 below. The answers are content hashes in
 * `__fixtures__/ui-message-reducer.parity.json`, one per distinct chunk sequence and per partial-JSON text; a chunk
 * sequence with no frozen answer fails, so a new fixture row cannot pass unseen. Regenerate the file only against the
 * SDK oracle this test replaced (git history of this file, T1), never from `reduceChunks` itself.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { UIMessageChunk } from 'ai';
import type { AgentLiveEvent } from '@taucad/agent-host';
import { reduceChunks } from '@taucad/chat-ui/services/ui-message-reducer';
import type { ChunkReduction } from '@taucad/chat-ui/services/ui-message-reducer';
import { parsePartialJson } from '@taucad/chat-ui/utils/partial-json';
import { chunksOf, initialChatProjection, reduceChatProjection } from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent, ProjectedChunks } from '#machines/chat-projection.logic.js';
import { logRow, prestartedSkillPairRows } from '#machines/chat-projection.fixture.js';

// ===========================================================================
// Frozen answers of the pinned SDK readers (T4)
// ===========================================================================

const here = dirname(import.meta.filename);

type Frozen = Readonly<{
  /** Chunk sequence hash → [message hash, skipped count]. */
  messages: Readonly<Record<string, readonly [string, number]>>;
  /** Partial-JSON text hash → hash of the parsed value of each of its prefixes, in order. */
  partialJson: Readonly<Record<string, string>>;
}>;

// oxlint-disable-next-line typescript/consistent-type-assertions -- The frozen fixture's shape is the type above.
const frozen = JSON.parse(readFileSync(join(here, '__fixtures__/ui-message-reducer.parity.json'), 'utf8')) as Frozen;

const hash = (text: string): string => createHash('sha256').update(text).digest('base64url').slice(0, 16);

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

  const checkOwner = ({ key, chunks }: Owner, label: string): void => {
    const all = chunksOf(chunks);
    const ours = reduceChunks(all);
    compared++;
    const answer = frozen.messages[hash(JSON.stringify(all))];
    expect(answer, `${label}: ${key} has no frozen SDK answer`).toBeDefined();
    expect([hash(JSON.stringify(ours.message ?? null)), ours.skipped], `${label}: ${key}`).toEqual(answer);
    // A suffix continues the previous reduction to the same message.
    const prior = previous.get(key);
    if (prior !== undefined && sameChunks(prior.chunks, all.slice(0, prior.chunks.length))) {
      const continued = reduceChunks(all.slice(prior.chunks.length), prior.reduction);
      expect(continued.message, `${label}: ${key} (continued)`).toEqual(ours.message);
    }
    previous.set(key, { chunks: all, reduction: ours });
  };

  const check = (projection: ChatProjection, label: string): void => {
    const changed = ownersOf(projection).filter(({ chunks }) => !checked.has(chunks));
    for (const { chunks } of changed) {
      checked.add(chunks);
    }
    for (const owner of changed) {
      checkOwner(owner, label);
    }
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
const replay = (rows: readonly unknown[], name: string) => {
  const parity = createParityCheck();
  let state = initialChatProjection;
  for (const [at, row] of rows.entries()) {
    state = reduceChatProjection(state, batchOf([row], at, rows.length)).state;
    parity.check(state, `${name} row ${String(at)}`);
  }
  parity.check(reduceChatProjection(initialChatProjection, batchOf(rows, 0, rows.length)).state, `${name} whole`);
  return parity.counts();
};

// ===========================================================================
// Inputs
// ===========================================================================

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

const replayEvents = (events: readonly ChatProjectionEvent[], name: string) => {
  const parity = createParityCheck();
  let state = initialChatProjection;
  for (const [index, event] of events.entries()) {
    state = reduceChatProjection(state, event).state;
    parity.check(state, `${name} event ${String(index)}`);
  }
  return parity.counts();
};

// ===========================================================================
// Tests
// ===========================================================================

describe('reduceChunks parity with the frozen AI SDK reader answers (T1, T4)', () => {
  it('should show what the SDK showed after every row of every fixture log', () => {
    const counts = fixtureLogs().map(([name, rows]) => replay(rows, name));
    expect(counts.reduce((total, { compared }) => total + compared, 0)).toBeGreaterThan(100);
  });

  it('should show what the SDK showed after every row and live event of Run D', () => {
    const { compared, overlays } = replayEvents(prestartedPairEvents(), 'Run D');
    expect(compared).toBeGreaterThan(10);
    expect(overlays).toBeGreaterThan(0);
  });

  it('should show what the SDK showed after every row of Run D folded row by row', () => {
    const { compared } = replay(prestartedSkillPairRows(), 'Run D rows');
    expect(compared).toBeGreaterThan(5);
  });

  it('should show what the SDK showed when a steering input folds while text streams', () => {
    const { compared } = replayEvents(steeringMidStream(), 'steering');
    expect(compared).toBeGreaterThan(5);
  });

  /*
   * D1, total: a chunk that does not fit (an output, approval or delta with no call or block) made the SDK reader throw
   * ("No tool invocation found") and end the stream, and the store then blocked the transcript. The fold skips that
   * chunk, counts it, and shows what the SDK showed for the same chunks without it.
   */
  it('should skip and count an output with no call where the SDK throws (D1)', () => {
    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: 'm' },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Before' },
      { type: 'tool-output-available', toolCallId: 'missing', output: 'x' },
      { type: 'text-delta', id: 'missing-block', delta: 'lost' },
      { type: 'text-delta', id: 't', delta: ' after' },
    ];
    const ours = reduceChunks(chunks);

    expect(ours.skipped).toBe(2);
    expect(ours.message).toEqual({
      id: 'm',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Before after', state: 'streaming' }],
    });
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

describe('parsePartialJson parity with the frozen AI SDK answers (T1, T4)', () => {
  const corpus = [
    ...new Set([
      ...fixtureLogs().flatMap(([, rows]) => toolInputsOf(rows)),
      ...toolInputsOf(prestartedSkillPairRows()),
      ...generatedJson(),
    ]),
  ];

  it('should parse every prefix of every fixture tool input and generated text as the SDK did', () => {
    expect(corpus.length).toBeGreaterThan(100);
    let prefixes = 0;
    for (const text of corpus) {
      const values: string[] = [];
      for (let end = 0; end <= text.length; end++) {
        values.push(String(JSON.stringify(parsePartialJson(text.slice(0, end)))));
        prefixes++;
      }
      const answer = frozen.partialJson[hash(text)];
      expect(answer, `${JSON.stringify(text)} has no frozen SDK answer`).toBeDefined();
      expect(hash(values.join('\n')), JSON.stringify(text)).toBe(answer);
    }
    expect(prefixes).toBeGreaterThan(5000);
  });

  it('should reject a prototype-polluting key as the SDK did', () => {
    expect(parsePartialJson('{"__proto__": {"polluted": true}}')).toBeUndefined();
  });
});
