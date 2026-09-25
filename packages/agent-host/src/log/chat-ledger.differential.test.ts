/**
 * Differential test of the log core against the Lean model `specs/lean/ChatLedger.lean` (S5; FM-R10).
 *
 * Each corpus is regenerated from its seed and byte-compared with the committed
 * `specs/lean/corpus/<corpus>.trace`; the real appender, `runLedgerOf`, `recordSettlement`,
 * `readBatch`, `mergeLogSegments`, the legality tables and `replayedStartOutcome` then run it,
 * and their output must equal the committed Lean goldens `<corpus>.expected` line by line.
 * The Lean tier (`agent-host:formal:lean`) regenerates the goldens with the oracle and fails on
 * stale ones, so this test needs no Lean. `formal update packages/agent-host` rewrites the traces
 * (this test, with `FORMAL_UPDATE=1`) and then the goldens.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import { serializeLogEventBytes } from '#log/serialization.js';
import { mergeLogSegments } from '#log/segments.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { replayedStartOutcome } from '#host/replayed-start.js';
import {
  createTauAgentHost,
  hostRunStateOfLifecycle,
  isHostLifecycleLegal,
  isHostRunOperationLegal,
  isHostSettlementLegal,
  runLedgerOf,
} from '#host/tau-agent-host.js';
import type { HostRunAppendState, HostRunState, TauAgentHost } from '#host/tau-agent-host.js';

const corpusDirectory = fileURLToPath(new URL('../../specs/lean/corpus/', import.meta.url));
const freshDirectory = fileURLToPath(
  new URL('../../../../out/test-results/formal/packages/agent-host/lean/', import.meta.url),
);
const updating = process.env['FORMAL_UPDATE'] === '1';
/** Nightly: this many fresh-seed traces for `formal nightly` to run through the oracle (FM-R10). */
const freshTraces = Number(process.env['FORMAL_FRESH_TRACES'] ?? 0);

// ponytail: mulberry32, the generator the committed corpora were written with; a new one rewrites them.
/* eslint-disable no-bitwise -- mulberry32 is bit mixing */
const randomOf = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};
/* eslint-enable no-bitwise -- end of mulberry32 */
type Random = ReturnType<typeof randomOf>;
const below = (random: Random, bound: number) => Math.floor(random() * bound);
const pick = <T>(random: Random, items: readonly T[]): T => items[below(random, items.length)]!;

type Kind = 'L' | 'S' | 'H' | 'O';
/** `undefinedKeys`: the row object carries optional keys set to `undefined`, invisible to the oracle and to the bytes. */
type Row = { epoch: number; seq: number; run: number; kind: Kind; arg: number; ms: number; undefinedKeys?: boolean };

const base = Date.UTC(2026, 8, 1);
const epochId = (epoch: number) => `e${String(epoch).padStart(2, '0')}`;
const lifeStates = ['admitted', 'running', 'paused', 'completed', 'failed', 'failed', 'cancelled'] as const;
type Settlement = Parameters<TauAgentHost['recordSettlement']>[0]['event'];

const settlementBody = (content: number): Settlement =>
  content % 3 === 0
    ? { type: 'turn.failed', turnId: 't', chatId: 'chat', reason: `reason-${content}` }
    : content % 3 === 1
      ? {
          type: 'turn.finalized',
          turnId: 't',
          chatId: 'chat',
          projectId: 'p',
          changedPaths: [`f${content}`],
          trigger: 'turn',
          runIds: [],
        }
      : { type: 'turn.conflicted', turnId: `t${content}`, chatId: 'chat' };

const eventOf = (row: Row): AgentLogEvent => {
  const version: AgentLogEvent['version'] = 1;
  const envelope = {
    version,
    leaderEpoch: epochId(row.epoch),
    sequence: row.seq,
    recordedAt: new Date(base + row.ms).toISOString(),
    runId: `r${row.run}`,
    ...(row.undefinedKeys === true ? { storageDurability: undefined, payload: undefined, checkoutId: undefined } : {}),
  };
  switch (row.kind) {
    case 'L': {
      return {
        ...envelope,
        type: 'run.lifecycle',
        state: lifeStates[row.arg]!,
        ...(row.arg === 4 ? { detail: { message: 'fatal', code: 'FATAL_TEST' } } : {}),
        ...(row.arg === 5 ? { detail: { message: 'rate', code: 'RATE_LIMITED' } } : {}),
      };
    }
    case 'S': {
      const settlement: AgentLogEvent = { ...envelope, ...settlementBody(row.arg) };
      return settlement;
    }
    case 'H': {
      return {
        ...envelope,
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: `u-${row.epoch}-${row.seq}-${row.arg}`, role: 'user', content: 'x' },
        context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
      };
    }
    case 'O': {
      return { ...envelope, type: 'interrupt.recorded', interruptId: `i${row.arg}`, phase: 'requested', reason: 'x' };
    }
  }
};

/** The inverse of {@link eventOf}, for printing what the code returns. */
const rowOf = (event: AgentLogEvent): Row => {
  const common = {
    epoch: Number(event.leaderEpoch.slice(1)),
    seq: event.sequence,
    run: Number(event.runId.slice(1)),
    ms: Date.parse(event.recordedAt) - base,
  };
  switch (event.type) {
    case 'run.lifecycle': {
      const argument =
        event.state === 'failed' ? (event.detail?.code === 'RATE_LIMITED' ? 5 : 4) : lifeStates.indexOf(event.state);
      return { ...common, kind: 'L', arg: argument };
    }
    case 'turn.failed': {
      return { ...common, kind: 'S', arg: Number(event.reason.slice('reason-'.length)) };
    }
    case 'turn.finalized': {
      return { ...common, kind: 'S', arg: Number(event.changedPaths[0]!.slice(1)) };
    }
    case 'turn.conflicted': {
      return { ...common, kind: 'S', arg: Number(event.turnId.slice(1)) };
    }
    case 'turn.history-projection-committed': {
      return { ...common, kind: 'H', arg: Number(event.message.id.split('-')[3]) };
    }
    case 'interrupt.recorded': {
      return { ...common, kind: 'O', arg: Number(event.interruptId.slice(1)) };
    }
    default: {
      throw new Error(`unexpected ${event.type}`);
    }
  }
};

const rowLine = (row: Row) => `${row.epoch} ${row.seq} ${row.run} ${row.kind} ${row.arg} ${row.ms}`;
const keyOf = (event: AgentLogEvent) => `${Number(event.leaderEpoch.slice(1))}:${event.sequence}`;
const rowText = (row: Row) => `${row.epoch}:${row.seq}:${row.run}:${row.kind}${row.arg}:${row.ms}`;

const memoryStorage = (initial: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0))) => {
  let bytes = initial;
  const storage: EventLogStorage = {
    read: async () => bytes,
    async append(next) {
      const combined = new Uint8Array(new ArrayBuffer(bytes.byteLength + next.byteLength));
      combined.set(bytes);
      combined.set(next, bytes.byteLength);
      bytes = combined;
    },
    async truncate(size) {
      bytes = bytes.slice(0, size);
    },
    close: async () => undefined,
  };
  return { storage, bytes: () => bytes };
};

const ledgerLines = (events: readonly AgentLogEvent[]): string[] => {
  const ledger = runLedgerOf(events);
  const lines = [...ledger.runs].map(([runId, entry]) => {
    const settlement = entry.settlement === undefined ? '-' : keyOf(entry.settlement);
    return `R ${runId.slice(1)} ${entry.lifecycle ?? '-'} ${settlement} ${entry.state} ${replayedStartOutcome({ events, runId })}`;
  });
  lines.push(ledger.chat === undefined ? 'C -' : `C ${ledger.chat.runId.slice(1)} ${ledger.chat.state}`);
  return lines;
};

/** `recordSettlement` on a fresh host whose log is a copy of `bytes`. */
const hostSettle = async (
  bytes: Uint8Array<ArrayBuffer>,
  settle: { readonly run: number; readonly content: number },
): Promise<string> => {
  const copy = await createEventLogAppender(memoryStorage(new Uint8Array(bytes)).storage);
  const host = createTauAgentHost({
    systemPrompt: 'differential',
    model: { id: 'differential-model', contextWindow: 1000 },
    modelTransport: {
      async *stream() {
        yield* [];
      },
    },
    toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
    openEventLog: async () => copy,
    interruptPort: {
      pause: async (request) => ({ interruptId: request.interruptId, outcome: 'approved' }),
      pending: async () => [],
      resume: async () => undefined,
    },
    createLeaderEpoch: () => 'e99',
    now: () => new Date(base + 999_999),
  });
  const initial = await copy.read();
  try {
    await host.recordSettlement({ chatId: 'chat', runId: `r${settle.run}`, event: settlementBody(settle.content) });
    const after = await copy.read();
    return after.length > initial.length ? 'appended' : 'skipped';
  } catch (error) {
    return String((error as { code?: string }).code ?? (error as Error).message);
  }
};

type Trace = { readonly text: string[]; readonly expected: string[] };

const logTrace = async (
  random: Random,
  { name, undefinedKeys }: { readonly name: string; readonly undefinedKeys: boolean },
): Promise<Trace> => {
  const text = [`T ${name}`];
  const expected = [`T ${name}`];
  const { storage, bytes } = memoryStorage();
  let appender: EventLogAppender = await createEventLogAppender(storage);
  const flag = (): Pick<Row, 'undefinedKeys'> => (undefinedKeys && random() < 0.4 ? { undefinedKeys: true } : {});
  const committed: Row[] = [];
  let epoch = 0;
  let nextSeq = below(random, 10) === 0 ? 1 + below(random, 3) : 0;
  let maxEpoch = 0;
  let clock = 0;
  const kind = (): Pick<Row, 'kind' | 'arg'> => {
    const draw = random();
    if (draw < 0.45) {
      return { kind: 'L', arg: pick(random, [0, 1, 1, 1, 2, 3, 3, 4, 5, 6]) };
    }
    if (draw < 0.72) {
      return { kind: 'S', arg: below(random, 4) };
    }
    return draw < 0.8 ? { kind: 'H', arg: below(random, 3) } : { kind: 'O', arg: below(random, 3) };
  };
  const steps = 4 + below(random, 28);
  // Each step depends on the previous outcome, so the appends run in order.
  for (let index = 0; index < steps; index++) {
    clock += below(random, 5);
    const draw = random();
    let row: Row;
    if (random() < 0.08) {
      text.push('RELOAD');
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      appender = await createEventLogAppender(storage);
    }
    if (draw < 0.68 || committed.length === 0) {
      row = { epoch, seq: nextSeq, run: 1 + below(random, 3), ...kind(), ms: clock, ...flag() };
    } else if (draw < 0.78) {
      maxEpoch++;
      row = {
        epoch: maxEpoch,
        seq: below(random, 8) === 0 ? 1 + below(random, 3) : 0,
        run: 1 + below(random, 3),
        ...kind(),
        ms: clock,
      };
    } else if (draw < 0.86) {
      const { undefinedKeys: _dropped, ...prior } = pick(random, committed);
      row = { ...prior, ...flag() };
    } else if (draw < 0.91) {
      const prior = pick(random, committed);
      row = { ...prior, arg: prior.kind === 'L' ? (prior.arg + 1) % 7 : prior.arg + 1 };
    } else if (draw < 0.96) {
      row = { epoch, seq: nextSeq + 1 + below(random, 2), run: 1 + below(random, 3), ...kind(), ms: clock };
    } else {
      const old = pick(random, committed);
      row = { epoch: old.epoch, seq: nextSeq + below(random, 3), run: 1 + below(random, 3), ...kind(), ms: clock };
    }
    text.push(`E ${rowLine(row)}`);
    let outcome: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      const appended = await appender.append(eventOf(row));
      outcome = appended.appended ? 'appended' : 'duplicate';
    } catch (error) {
      outcome = String((error as { code?: string }).code);
    }
    expected.push(`A ${index} ${outcome}`);
    if (outcome === 'appended') {
      committed.push(row);
      epoch = row.epoch;
      nextSeq = row.seq + 1;
    }
    if (random() < 0.2) {
      text.push('LEDGER');
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      expected.push(...ledgerLines(await appender.read()));
    }
  }
  text.push('LEDGER');
  expected.push(...ledgerLines(await appender.read()));
  for (let query = 0; query < 3; query++) {
    const settle = { run: 1 + below(random, 4), content: below(random, 4) };
    text.push(`SETTLE ${settle.run} ${settle.content}`);
    // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
    expected.push(`QS ${await hostSettle(bytes(), settle)}`);
  }
  const events = await appender.read();
  const sizes = events.map((event) => serializeLogEventBytes(event).byteLength);
  for (let query = 0; query < 3; query++) {
    const cursor = below(random, events.length + 3);
    const limit = 1 + below(random, 6);
    const maxBytes = random() < 0.4 ? undefined : 100 + below(random, 1200);
    text.push(`BATCH ${cursor} ${limit} ${maxBytes ?? '-'} ${sizes.length === 0 ? '-' : sizes.join(',')}`);
    // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
    const batch = await appender.readBatch({ cursor, limit, maxBytes });
    expected.push(
      `QB ${batch.cursor} ${batch.nextCursor} ${batch.endCursor} ${batch.events.map((event) => keyOf(event)).join(',')}`,
    );
  }
  text.push('X');
  expected.push('X');
  return { text, expected };
};

const segmentBytes = (rows: readonly Row[]): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(rows.map((row) => `${JSON.stringify(eventOf(row))}\n`).join(''));

/** Devices with skewed clocks, a segment read twice, and a term copied into another segment. */
const mergeSegmentsOf = (random: Random): Array<{ device: number; rows: Row[] }> => {
  const devices = 1 + below(random, 3);
  let nextEpoch = 0;
  const segments = Array.from({ length: devices }, (_unused, device) => {
    const rows: Row[] = [];
    let clock = below(random, 60);
    for (let term = 0, terms = 1 + below(random, 3); term < terms; term++) {
      const epoch = nextEpoch++;
      clock = random() < 0.3 ? Math.max(0, clock - below(random, 60)) : clock + below(random, 20);
      for (let seq = 0, count = 1 + below(random, 3); seq < count; seq++) {
        rows.push({ epoch, seq, run: 1, kind: 'O', arg: below(random, 3), ms: clock });
        clock += below(random, 4);
      }
    }
    return { device, rows };
  });
  if (random() < 0.3) {
    const source = pick(random, segments);
    segments.push({ device: random() < 0.5 ? source.device : devices, rows: [...source.rows] });
  }
  if (random() < 0.35 && segments.length > 1) {
    const [from, to] = [pick(random, segments), pick(random, segments)];
    const { epoch } = pick(random, from.rows);
    const copied = from.rows.filter((row) => row.epoch === epoch).slice(0, 1 + below(random, 3));
    to.rows.push(
      ...copied.map((row) =>
        random() < 0.2 ? { ...row, arg: row.arg + 7 } : { ...row, ms: row.ms + below(random, 3) - 1 },
      ),
    );
  }
  for (let index = segments.length - 1; index > 0; index--) {
    const other = below(random, index + 1);
    [segments[index], segments[other]] = [segments[other]!, segments[index]!];
  }
  return segments;
};

const mergeTrace = (random: Random, name: string): Trace => {
  const segments = mergeSegmentsOf(random).map((segment) => ({
    ...segment,
    rows: segment.rows.map((row) => ({ ...row, ms: Math.max(0, row.ms) })),
  }));
  const text = [`T ${name}`];
  for (const segment of segments) {
    text.push(`SEG ${segment.device}`, ...segment.rows.map((row) => `ROW ${rowLine(row)}`));
  }
  const merged = mergeLogSegments(
    segments.map((segment) => ({ deviceId: `d${segment.device}`, bytes: segmentBytes(segment.rows) })),
  );
  text.push('MERGE', 'X');
  return { text, expected: [`T ${name}`, `M ${merged.map((event) => rowText(rowOf(event))).join(',')}`, 'X'] };
};

/** The four legality tables, exhaustively. */
const tablesTrace = (): Trace => {
  const lives = [undefined, 'admitted', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const;
  const hostStates: HostRunState[] = ['none', 'reserved', 'admitted', 'running', 'paused', 'terminal'];
  const appendStates: HostRunAppendState[] = ['unadmitted', 'open', 'terminal', 'settled'];
  const expected = ['T tables', ...lives.map((life) => `HS ${life ?? '-'} ${hostRunStateOfLifecycle(life)}`)];
  for (const operation of ['admit', 'resume'] as const) {
    expected.push(
      ...hostStates.map((state) => `OP ${operation} ${state} ${isHostRunOperationLegal(operation, state)}`),
    );
  }
  expected.push(...appendStates.map((state) => `SL ${state} ${isHostSettlementLegal(state)}`));
  for (const next of ['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const) {
    for (const state of appendStates) {
      for (const lifecycle of lives) {
        for (const reopenable of [false, true]) {
          expected.push(
            `LL ${next} ${state} ${lifecycle ?? '-'} ${reopenable} ${isHostLifecycleLegal({ next, state, lifecycle, reopenable })}`,
          );
        }
      }
    }
  }
  expected.push('X');
  return { text: ['T tables', 'TABLES', 'X'], expected };
};

type Corpus = { readonly name: string; readonly seed: number; readonly count: number; readonly undefinedKeys: boolean };

/** The tables, `count` log traces and `count / 2` merge traces, from one seeded stream. */
const generate = async ({ seed, count, undefinedKeys }: Corpus): Promise<Trace[]> => {
  const random = randomOf(seed);
  const traces: Trace[] = [tablesTrace()];
  for (let index = 0; index < count; index++) {
    // oxlint-disable-next-line no-await-in-loop -- one trace at a time keeps the seeded stream reproducible.
    traces.push(await logTrace(random, { name: `log-${index}`, undefinedKeys }));
  }
  for (let index = 0; index < count / 2; index++) {
    traces.push(mergeTrace(random, `merge-${index}`));
  }
  return traces;
};

const traceText = (traces: readonly Trace[]) => `${traces.flatMap((trace) => trace.text).join('\n')}\n`;

/** Splits a flat output into traces by their `T` header. */
const byTrace = (lines: readonly string[]): Map<string, string[]> => {
  const traces = new Map<string, string[]>();
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith('T ')) {
      current = [];
      traces.set(line.slice(2), current);
    }
    current.push(line);
  }
  return traces;
};

/** Each trace whose output differs from the goldens, with its first differing line. */
const mismatches = (traces: readonly Trace[], goldens: string): string[] => {
  const lean = byTrace(goldens.split('\n').filter((line) => line.length > 0));
  return traces.flatMap((trace) => {
    const name = trace.expected[0]!.slice(2);
    const actual = lean.get(name) ?? [];
    const index = trace.expected.findIndex((line, position) => line !== actual[position]);
    const at = index === -1 && actual.length !== trace.expected.length ? trace.expected.length : index;
    return at === -1
      ? []
      : [`${name}: typescript ${JSON.stringify(trace.expected[at])}, lean ${JSON.stringify(actual[at])}`];
  });
};

const corpora = {
  base: { name: 'base', seed: 20_260_925, count: 200, undefinedKeys: false },
  undefinedKeys: { name: 'undefined-keys', seed: 20_260_926, count: 200, undefinedKeys: true },
} as const satisfies Record<string, Corpus>;

const tracesByCorpus = new Map<string, Trace[]>();
const tracesOf = async (corpus: Corpus): Promise<Trace[]> => {
  const cached = tracesByCorpus.get(corpus.name);
  if (cached) {
    return cached;
  }
  const traces = await generate(corpus);
  tracesByCorpus.set(corpus.name, traces);
  return traces;
};

const corpusFile = (corpus: Corpus, extension: 'trace' | 'expected') => `${corpusDirectory}${corpus.name}.${extension}`;

describe('ChatLedger differential (Lean goldens)', () => {
  for (const corpus of Object.values(corpora)) {
    it(`should regenerate the committed ${corpus.name} corpus from seed ${corpus.seed}`, async () => {
      const text = traceText(await tracesOf(corpus));
      if (updating) {
        writeFileSync(corpusFile(corpus, 'trace'), text);
      }

      expect(text).toBe(readFileSync(corpusFile(corpus, 'trace'), 'utf8'));
    }, 60_000);
  }

  it.skipIf(updating)(
    'should match the Lean goldens on the base corpus',
    async () => {
      const traces = await tracesOf(corpora.base);

      expect(existsSync(corpusFile(corpora.base, 'expected'))).toBe(true);
      expect(mismatches(traces, readFileSync(corpusFile(corpora.base, 'expected'), 'utf8')).slice(0, 3)).toEqual([]);
    },
    60_000,
  );

  // S5 D1: after a reload, an identical re-append whose object carries an undefined optional key was
  // EVENT_MUTATED in TypeScript and a duplicate in the model. W0.1 skips undefined keys; the specs'
  // mutant `undefined-key-skip` removes that skip and this test catches it (RV6-F2).
  it.skipIf(updating)(
    'should match the Lean goldens on the undefined-key corpus (S5 D1; fixed by W0.1)',
    async () => {
      const traces = await tracesOf(corpora.undefinedKeys);

      expect(
        mismatches(traces, readFileSync(corpusFile(corpora.undefinedKeys, 'expected'), 'utf8')).slice(0, 3),
      ).toEqual([]);
    },
    60_000,
  );

  it.runIf(freshTraces > 0)(
    'should write fresh-seed corpora and their TypeScript output for the nightly oracle',
    async () => {
      const seed = Number(process.env['FORMAL_SEED'] ?? Math.floor(Math.random() * 2_147_483_647));
      process.stdout.write(
        `chat-ledger fresh differential: seed ${seed}, ${freshTraces} traces per generator (replay with FORMAL_SEED=${seed})\n`,
      );
      rmSync(freshDirectory, { recursive: true, force: true });
      mkdirSync(freshDirectory, { recursive: true });
      for (const [name, undefinedKeys] of [
        ['base', false],
        ['undefined-keys', true],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- one generator at a time bounds memory at 20,000 traces.
        const traces = await generate({ name: 'fresh', seed, count: freshTraces, undefinedKeys });
        writeFileSync(`${freshDirectory}${name}-${seed}.trace`, traceText(traces));
        writeFileSync(
          `${freshDirectory}${name}-${seed}.typescript`,
          `${traces.flatMap((trace) => trace.expected).join('\n')}\n`,
        );
      }

      expect(existsSync(`${freshDirectory}undefined-keys-${seed}.typescript`)).toBe(true);
    },
    1_800_000,
  );
});
