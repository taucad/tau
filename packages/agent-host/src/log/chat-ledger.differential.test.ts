/**
 * Differential test of the log core against the Lean model `specs/lean/ChatLedger.lean` (S5; FM-R10; W3 SC3).
 *
 * Each corpus is regenerated from its seed and byte-compared with the committed
 * `specs/lean/corpus/<corpus>.trace`; the real appender, `foldChatLedger`, `foldReadAnswer`, `gateRows`,
 * the host's `appendChatRows` (M1's append), `readBatch`, `mergeLogSegments` and the legality tables then run it, and their output must equal
 * the committed Lean goldens `<corpus>.expected` line by line. The Lean tier (`agent-host:formal:lean`) regenerates the
 * goldens with the oracle and fails on stale ones, so this test needs no Lean. `formal update packages/agent-host`
 * rewrites the traces (this test, with `FORMAL_UPDATE=1`) and then the goldens.
 *
 * Line format v2 (the oracle's header in `ChatLedgerOracle.lean` is the reference):
 *
 * - A row is `<term> <seq> <run> <kind> <arg> <ms> <epoch> <attempt>`; `epoch` and `attempt` 0 mean absent.
 * - Kinds: `L` lifecycle, `S` settlement, `H` turn commit, `O`/`R` interrupt requested/resolved, `P` invocation
 *   prepared, `V` invocation settled, `M` assistant reply, `U` opaque (only written raw).
 * - Commands: `E` append through the appender, `W` another writer's row, `WJ` a junk line, `TEAR` a torn tail,
 *   `RELOAD`, `LEDGER`, `SETTLE`, `LIFE`, `PREP`, `BATCH`, `READER`, `READ`, `DELIVER`, `DELIVER1`, `RLEDGER`, `SEG`,
 *   `ROW`, `MERGE`, `TABLES`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appendChatRows } from '#host/tau-agent-host.js';
import {
  chatRunState,
  emptyChatLedger,
  foldChatLedger,
  foldReadAnswer,
  gateRows,
  replayedStartOutcome,
  stampRows,
  unsettledAttempts,
} from '#log/chat-ledger.js';
import type { ChatLedger, LogRowBody } from '#log/chat-ledger.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import { classifyLogRow } from '#log/event-schema.js';
import type { AgentLogEvent, RowKey } from '#log/event-types.js';
import { isResumableRunFailure } from '#log/resumable.js';
import lifecycleTable from '#log/run-lifecycle.legality.json' with { type: 'json' };
import operationTable from '#log/run-operation.legality.json' with { type: 'json' };
import settlementTable from '#log/run-settlement.legality.json' with { type: 'json' };
import { mergeLogSegments } from '#log/segments.js';
import { serializeLogEventBytes } from '#log/serialization.js';

const corpusDirectory = fileURLToPath(new URL('../../specs/lean/corpus/', import.meta.url));
const freshDirectory = fileURLToPath(
  new URL('../../../../out/test-results/formal/packages/agent-host/lean/', import.meta.url),
);
const updating = process.env['FORMAL_UPDATE'] === '1';
/** Under update, each corpus's TypeScript output is written here, for diffing against the oracle's. */
const outputDirectory = fileURLToPath(
  new URL('../../../../out/test-results/formal/packages/agent-host/lean-corpus/', import.meta.url),
);
/**
 * Nightly: this many fresh-seed traces for `formal nightly` to run through the oracle (FM-R10), split over the
 * generators.
 */
const freshTraces = Number(process.env['FORMAL_FRESH_TRACES'] ?? 0);
// ponytail: 20000 per generator over eight generators outran the mutant harness's 600 s bound, which inherits this
// env; two base generators' worth, 40000 in all, keeps the v1 budget. Restore it once the harness strips the env.
const freshPerGenerator = (generators: number): number => Math.ceil((freshTraces * 2) / generators);

// ponytail: mulberry32; a new generator rewrites every corpus.
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

type Kind = 'L' | 'S' | 'H' | 'O' | 'R' | 'P' | 'V' | 'M' | 'U';
/** `undefinedKeys`: the row object carries optional keys set to `undefined`, invisible to the oracle and to the bytes. */
type Row = {
  term: number;
  seq: number;
  run: number;
  kind: Kind;
  argument: number;
  ms: number;
  epoch: number;
  attempt: number;
  undefinedKeys?: boolean;
};

const base = Date.UTC(2026, 8, 1);
const termId = (term: number) => `e${String(term).padStart(2, '0')}`;
const lifeStates = ['admitted', 'running', 'paused', 'completed', 'failed', 'failed', 'cancelled'] as const;
const settledOutcomes = ['settled', 'released', 'absorbed', 'voided'] as const;
type Settlement = Extract<LogRowBody, { readonly type: 'turn.finalized' | 'turn.conflicted' | 'turn.failed' }>;

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

/** A row's body: every field but the envelope. */
const bodyOf = (row: Pick<Row, 'term' | 'seq' | 'kind' | 'argument'>): Record<string, unknown> => {
  const { argument } = row;
  switch (row.kind) {
    case 'L': {
      return {
        type: 'run.lifecycle',
        state: lifeStates[argument]!,
        ...(argument === 4 ? { detail: { message: 'fatal', code: 'FATAL_TEST' } } : {}),
        ...(argument === 5 ? { detail: { message: 'rate', code: 'RATE_LIMITED' } } : {}),
      };
    }
    case 'S': {
      return settlementBody(argument);
    }
    case 'H': {
      return {
        type: 'turn.history-projection-committed',
        retainedMessageIds: [],
        message: { id: `u-${row.term}-${row.seq}-${argument}`, role: 'user', content: 'x' },
        context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
      };
    }
    case 'O':
    case 'R': {
      return {
        type: 'interrupt.recorded',
        interruptId: `i${argument}`,
        phase: row.kind === 'O' ? 'requested' : 'resolved',
        reason: 'x',
        ...(row.kind === 'R' ? { payload: { outcome: 'approved' } } : {}),
      };
    }
    case 'P': {
      return {
        type: 'model.invocation-prepared',
        attemptId: `a${argument % 4}`,
        purpose: argument < 4 ? 'generation' : 'compaction',
        modelId: 'm',
      };
    }
    case 'V': {
      const outcome = settledOutcomes[Math.floor(argument / 4) % 4]!;
      return {
        type: 'model.invocation-settled',
        attemptId: `a${argument % 4}`,
        outcome,
        ...(outcome === 'voided' ? {} : { operationId: 'op', chargedCreditAtoms: outcome === 'settled' ? '5' : '0' }),
      };
    }
    case 'M': {
      return {
        type: 'message.appended',
        message: {
          id: `m-${row.term}-${row.seq}`,
          role: 'assistant',
          content: 'reply',
          metadata: {
            stopReason: argument < 4 ? 'stop' : 'error',
            tauInternal: { kind: 'billing-invocation', attemptId: `a${argument % 4}` },
          },
        },
      };
    }
    case 'U': {
      // A newer build's rows: an unknown type, a history row of a newer version, an unknown lifecycle state.
      return argument === 0
        ? { type: 'future.fact', note: 'x' }
        : argument === 1
          ? { type: 'message.appended', message: { id: `v2-${row.term}-${row.seq}`, role: 'user', content: 'x' } }
          : { type: 'run.lifecycle', state: 'suspended' };
    }
  }
};

const eventOf = (row: Row): AgentLogEvent =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- opaque rows are rows this build cannot type.
  ({
    version: row.kind === 'U' && row.argument === 1 ? 2 : 1,
    leaderEpoch: termId(row.term),
    ...(row.epoch === 0 ? {} : { epoch: row.epoch }),
    sequence: row.seq,
    recordedAt: new Date(base + row.ms).toISOString(),
    runId: `r${row.run}`,
    ...(row.attempt === 0 ? {} : { attempt: row.attempt }),
    ...(row.undefinedKeys === true ? { storageDurability: undefined, payload: undefined, checkoutId: undefined } : {}),
    ...bodyOf(row),
  }) as AgentLogEvent;

const rowLine = (row: Row) =>
  `${row.term} ${row.seq} ${row.run} ${row.kind} ${row.argument} ${row.ms} ${row.epoch} ${row.attempt}`;
const termOf = (leaderEpoch: string) => Number(leaderEpoch.slice(1));
const keyText = (key: RowKey | undefined) => (key === undefined ? '-' : `${termOf(key.leaderEpoch)}:${key.sequence}`);
const listText = (items: readonly string[]) => (items.length === 0 ? '-' : items.join(','));
const runOf = (runId: string) => runId.slice(1);

/** Merge rows print as `<term>:<seq>:<run>:O<arg>:<ms>`. */
const mergedText = (event: AgentLogEvent) => {
  const interrupt = event as Extract<AgentLogEvent, { type: 'interrupt.recorded' }>;
  return `${termOf(event.leaderEpoch)}:${event.sequence}:${runOf(event.runId)}:O${interrupt.interruptId.slice(1)}:${Date.parse(event.recordedAt) - base}`;
};

/** The ledger, projected onto what the Lean model keeps. */
const ledgerLines = (ledger: ChatLedger, prefix = ''): string[] => {
  const lines = Object.entries(ledger.runs).map(([runId, entry]) => {
    const life =
      entry.lifecycle === 'failed'
        ? `failed:${isResumableRunFailure(entry.failure) ? 'r' : 'f'}`
        : (entry.lifecycle ?? '-');
    const settlements = entry.settlements.map((settlement) => `${settlement.attempt}@${keyText(settlement.row)}`);
    const pending = Object.keys(entry.pendingInterrupts).toSorted();
    return [
      'R',
      runOf(runId),
      life,
      entry.attempt,
      entry.appendState,
      Number(entry.committed),
      Number(entry.opaque),
      listText(settlements),
      listText(pending),
      entry.openInvocation ?? '-',
      replayedStartOutcome(ledger, runId),
    ].join(' ');
  });
  for (const [attemptId, invocation] of Object.entries(ledger.invocations)) {
    lines.push(
      `I ${attemptId} ${runOf(invocation.runId)} ${invocation.attempt} ${invocation.purpose[0]} ${Number(invocation.shown)} ${invocation.settled?.outcome ?? '-'}`,
    );
  }
  const terminal = ledger.lastTerminal;
  lines.push(
    `C ${ledger.currentRunId === undefined ? '-' : runOf(ledger.currentRunId)} ${chatRunState(ledger)} ${terminal === undefined ? '-' : `${runOf(terminal.runId)}:${terminal.outcome}`}`,
    `P ${ledger.position.cursor} ${keyText(ledger.position.last)} ${ledger.maxEpoch} ${Number(ledger.historyIntact)}`,
    `N ${listText(ledger.anomalies.map((anomaly) => `${anomaly.kind}@${keyText(anomaly.row)}`))}`,
    `U ${listText(unsettledAttempts(ledger).map((attempt) => `${runOf(attempt.runId)}:${attempt.attempt}`))}`,
  );
  return lines.map((line) => `${prefix}${line}`);
};

const encoder = new TextEncoder();
const rowBytes = (row: Row) => encoder.encode(`${JSON.stringify(eventOf(row))}\n`);
/** The appender's measure: its serializer for a known row, `JSON.stringify` for an opaque one. */
const sizeOf = (event: AgentLogEvent) =>
  classifyLogRow(event).class === 'known'
    ? serializeLogEventBytes(event).byteLength
    : encoder.encode(`${JSON.stringify(event)}\n`).byteLength;
const tornFragment = '{"version":';

const codeOf = (error: unknown) => String((error as { code?: string }).code ?? (error as Error).message);

/** The host's append (`appendChatRows`, M1's writer) of one settlement row, under a new term, on a copy of `bytes`. */
const hostSettle = async (
  bytes: Uint8Array<ArrayBuffer>,
  settle: { readonly run: number; readonly content: number },
): Promise<string> => {
  const copy = await createEventLogAppender(memoryEventLogStorage(new Uint8Array(bytes)).storage);
  const initial = await copy.read();
  try {
    await appendChatRows({
      chatId: 'chat',
      log: copy,
      ledger: foldChatLedger(emptyChatLedger, initial),
      leaderEpoch: 'e99',
      recordedAt: new Date(base + 999_999).toISOString(),
      rows: [{ runId: `r${settle.run}`, body: settlementBody(settle.content) }],
    });
    const after = await copy.read();
    return after.length > initial.length ? 'appended' : 'skipped';
  } catch (error) {
    return codeOf(error);
  }
};

/** The pure gate on one body, stamped as a new writer's term would be. */
const gateOne = (ledger: ChatLedger, run: number, body: LogRowBody): string => {
  const rows = stampRows({
    ledger,
    leaderEpoch: 'e99',
    runId: `r${run}`,
    recordedAt: new Date(base).toISOString(),
    bodies: [body],
  });
  const answer = gateRows(ledger, rows);
  return answer.ok ? 'ok' : answer.code;
};

type Trace = { readonly text: string[]; readonly expected: string[] };

/** Which commands a log trace draws, and how often. */
type Profile = {
  /** Row kinds `E` appends, with weights. */
  readonly appendKinds: readonly Kind[];
  /** Row kinds `W` writes. */
  readonly rawKinds: readonly Kind[];
  readonly undefinedKeys: boolean;
  /** Probability a new term is legacy (no integer epoch). */
  readonly legacy: number;
  /** Probability a lifecycle or settlement row states an attempt. */
  readonly attempts: number;
  /** Probability of each other-writer command per step. */
  readonly raw: number;
  readonly reader: boolean;
  readonly queries: boolean;
};

const lifeArgs = [0, 1, 1, 1, 2, 3, 3, 4, 5, 6] as const;

const logTrace = async (random: Random, name: string, profile: Profile): Promise<Trace> => {
  const text = [`T ${name}`];
  const expected = [`T ${name}`];
  const file = memoryEventLogStorage();
  let tornLength = 0;
  let appender: EventLogAppender = await createEventLogAppender(file.storage);
  let reader: ChatLedger = emptyChatLedger;
  const committed: Row[] = [];
  let term = 0;
  let nextSeq = below(random, 10) === 0 ? 1 + below(random, 3) : 0;
  let termEpoch = random() < profile.legacy ? 0 : 1;
  let maxTerm = 0;
  let maxEpoch = termEpoch;
  let clock = 0;
  const flag = (): Pick<Row, 'undefinedKeys'> =>
    profile.undefinedKeys && random() < 0.4 ? { undefinedKeys: true } : {};
  const body = (kinds: readonly Kind[]): Pick<Row, 'kind' | 'argument' | 'attempt'> => {
    const kind = pick(random, kinds);
    const argument =
      kind === 'L'
        ? pick(random, lifeArgs)
        : kind === 'S'
          ? below(random, 4)
          : kind === 'U'
            ? below(random, 3)
            : kind === 'P' || kind === 'V' || kind === 'M'
              ? below(random, kind === 'V' ? 16 : 8)
              : below(random, 3);
    const attempt = (kind === 'L' || kind === 'S') && random() < profile.attempts ? 1 + below(random, 3) : 0;
    return { kind, argument, attempt };
  };
  const nextRow = (kinds: readonly Kind[]): Row => {
    const draw = random();
    const run = 1 + below(random, 3);
    if (draw < 0.66 || committed.length === 0) {
      return { term, seq: nextSeq, run, ...body(kinds), ms: clock, epoch: termEpoch, ...flag() };
    }
    if (draw < 0.78) {
      maxTerm++;
      const legacy = random() < profile.legacy;
      // Mostly the claim a writer makes (one above every epoch), sometimes a stale or repeated claim.
      const epoch = legacy ? 0 : random() < 0.85 ? maxEpoch + 1 : below(random, maxEpoch + 1);
      return {
        term: maxTerm,
        seq: below(random, 8) === 0 ? 1 + below(random, 3) : 0,
        run,
        ...body(kinds),
        ms: clock,
        epoch,
      };
    }
    if (draw < 0.86) {
      const { undefinedKeys: _dropped, ...prior } = pick(random, committed);
      return { ...prior, ...flag() };
    }
    if (draw < 0.91) {
      const prior = pick(random, committed);
      return { ...prior, argument: prior.kind === 'L' ? (prior.argument + 1) % 7 : prior.argument + 1 };
    }
    if (draw < 0.96) {
      return { term, seq: nextSeq + 1 + below(random, 2), run, ...body(kinds), ms: clock, epoch: termEpoch };
    }
    const old = pick(random, committed);
    return { term: old.term, seq: nextSeq + below(random, 3), run, ...body(kinds), ms: clock, epoch: old.epoch };
  };
  const adopt = (row: Row) => {
    committed.push(row);
    term = row.term;
    termEpoch = row.epoch;
    nextSeq = row.seq + 1;
    maxEpoch = Math.max(maxEpoch, row.epoch);
  };
  /** Another writer's bytes: it repairs a torn tail first, as its own guarded append would. */
  const writeRaw = async (bytes: Uint8Array<ArrayBuffer>) => {
    if (tornLength > 0) {
      await file.storage.truncate(file.bytes().byteLength - tornLength);
      tornLength = 0;
    }
    await file.storage.append(bytes);
  };
  const server = async () => createEventLogAppender(memoryEventLogStorage(new Uint8Array(file.bytes())).storage);

  const steps = 4 + below(random, 28);
  let fenced = false;
  // Each step depends on the previous outcome, so the steps run in order.
  for (let index = 0; index < steps; index++) {
    clock += below(random, 5);
    // A fenced writer reopens (D5): usually at once, sometimes after more refused appends.
    if (random() < (fenced ? 0.6 : 0.08)) {
      fenced = false;
      text.push('RELOAD');
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      await appender.close();
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      appender = await createEventLogAppender(file.storage);
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      const anomalies = await appender.anomalies();
      const count = (kind: string) => anomalies.filter((anomaly) => anomaly.kind === kind).length;
      expected.push(`O ${count('quarantined')} ${count('order')} ${count('conflict')} ${count('history')}`);
    }
    if (random() < profile.raw) {
      const draw = random();
      if (draw < 0.6) {
        const row = nextRow(profile.rawKinds);
        text.push(`W ${rowLine(row)}`);
        // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
        await writeRaw(rowBytes(row));
        // This writer continues from the other writer's row once it reopens.
        adopt(row);
      } else if (draw < 0.8) {
        text.push('WJ');
        // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
        await writeRaw(encoder.encode('junk\n'));
      } else {
        text.push('TEAR');
        // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
        await file.storage.append(encoder.encode(tornFragment));
        tornLength += tornFragment.length;
      }
    }
    const row = nextRow(profile.appendKinds);
    text.push(`E ${rowLine(row)}`);
    let outcome: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      const appended = await appender.append(eventOf(row));
      outcome = appended.appended ? 'appended' : 'duplicate';
    } catch (error) {
      outcome = codeOf(error);
    }
    expected.push(`A ${index} ${outcome}`);
    fenced = outcome === 'LOG_FENCED';
    if (outcome === 'appended') {
      tornLength = 0;
      adopt(row);
    }
    if (random() < 0.2) {
      text.push('LEDGER');
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      expected.push(...ledgerLines(foldChatLedger(emptyChatLedger, await appender.read())));
    }
    if (profile.reader && random() < 0.35) {
      const draw = random();
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      const log = await server();
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      const physical = await log.read();
      const limit = 1 + below(random, 4);
      let answer: Parameters<typeof foldReadAnswer>[1];
      if (draw < 0.1) {
        text.push('READER');
        reader = emptyChatLedger;
      }
      if (draw < 0.55) {
        text.push(`READ ${limit}`);
        // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
        answer = await log.readBatch({ cursor: reader.position.cursor, limit, last: reader.position.last });
      } else if (draw < 0.85) {
        const cursor = below(random, physical.length + 2);
        text.push(`DELIVER ${cursor} ${limit}`);
        // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
        answer = await log.readBatch({ cursor, limit });
      } else {
        // A version-1 server clamps a cursor past the end instead of refusing it: here the writer's own view,
        // which lags the file while another writer's rows are unread.
        // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
        const view = await appender.read();
        const requested = below(random, view.length + 3);
        text.push(`DELIVER1 ${requested} ${limit}`);
        const at = Math.min(requested, view.length);
        const events = view.slice(at, at + limit);
        answer = { status: 'batch', cursor: at, nextCursor: at + events.length, endCursor: view.length, events };
      }
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      await log.close();
      const folded = foldReadAnswer(reader, answer);
      expected.push(`D ${folded.kind}${'reason' in folded ? `:${folded.reason}` : ''}`);
      if (folded.kind === 'folded') {
        reader = folded.ledger;
      } else if (folded.kind === 'reset') {
        reader = emptyChatLedger;
      }
      if (random() < 0.4) {
        text.push('RLEDGER');
        expected.push(...ledgerLines(reader, 'r'));
      }
    }
  }
  text.push('LEDGER');
  // Every appender's view folds to one ledger (host path).
  const ledger = foldChatLedger(emptyChatLedger, await appender.read());
  expected.push(...ledgerLines(ledger));
  if (profile.queries) {
    for (let query = 0; query < 3; query++) {
      const settle = { run: 1 + below(random, 4), content: below(random, 4) };
      text.push(`SETTLE ${settle.run} ${settle.content}`);
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      expected.push(`QS ${await hostSettle(file.bytes(), settle)}`);
    }
    for (let query = 0; query < 2; query++) {
      const run = 1 + below(random, 4);
      const state = below(random, 7);
      text.push(`LIFE ${run} ${state}`);
      expected.push(
        `QL ${gateOne(ledger, run, bodyOf({ term: 99, seq: 0, kind: 'L', argument: state }) as LogRowBody)}`,
      );
    }
    if (profile.appendKinds.includes('P') || profile.rawKinds.includes('P')) {
      for (let query = 0; query < 2; query++) {
        const run = 1 + below(random, 4);
        const argument = below(random, 8);
        text.push(`PREP ${run} ${argument}`);
        expected.push(`QP ${gateOne(ledger, run, bodyOf({ term: 99, seq: 0, kind: 'P', argument }) as LogRowBody)}`);
      }
    }
    const events = await appender.read();
    const sizes = events.map((event) => sizeOf(event));
    for (let query = 0; query < 3; query++) {
      const cursor = below(random, events.length + 3);
      const limit = 1 + below(random, 6);
      const maxBytes = random() < 0.4 ? undefined : 100 + below(random, 1200);
      const lastDraw = random();
      const prior = cursor > 0 ? events[cursor - 1] : undefined;
      const other = events.length === 0 ? undefined : pick(random, events);
      const last = lastDraw < 0.4 ? undefined : lastDraw < 0.8 ? prior : other;
      const lastKey = last === undefined ? undefined : { leaderEpoch: last.leaderEpoch, sequence: last.sequence };
      text.push(`BATCH ${cursor} ${limit} ${maxBytes ?? '-'} ${keyText(lastKey)} ${listText(sizes.map(String))}`);
      // oxlint-disable-next-line no-await-in-loop -- the seeded stream is consumed in order.
      const answer = await appender.readBatch({ cursor, limit, maxBytes, last: lastKey });
      expected.push(
        answer.status === 'batch'
          ? `QB batch ${answer.cursor} ${answer.nextCursor} ${answer.endCursor} ${listText(answer.events.map((event) => keyText(event)))}`
          : `QB refused ${answer.reason} ${answer.expected.endCursor} ${keyText(answer.expected.last)}`,
      );
    }
  }
  if (profile.reader) {
    // Catch the reader up: a complete reader folds to the ledger of the whole log (T6), up to its cursor.
    const log = await server();
    for (let round = 0; round < 64; round++) {
      text.push('READ 4');
      // oxlint-disable-next-line no-await-in-loop -- the reader loop is sequential.
      const answer = await log.readBatch({ cursor: reader.position.cursor, limit: 4, last: reader.position.last });
      const folded = foldReadAnswer(reader, answer);
      expected.push(`D ${folded.kind}${'reason' in folded ? `:${folded.reason}` : ''}`);
      if (folded.kind === 'reset') {
        reader = emptyChatLedger;
        continue;
      }
      if (folded.kind !== 'folded' || folded.ledger === reader) {
        break;
      }
      reader = folded.ledger;
    }
    await log.close();
    text.push('RLEDGER');
    expected.push(...ledgerLines(reader, 'r'));
  }
  await appender.close();
  text.push('X');
  expected.push('X');
  return { text, expected };
};

type MergeRow = Omit<Row, 'kind'> & { kind: 'O' };
const segmentBytes = (rows: readonly MergeRow[]): Uint8Array<ArrayBuffer> =>
  encoder.encode(rows.map((row) => `${JSON.stringify(eventOf(row))}\n`).join(''));

/** Devices with skewed clocks, segments read twice, and terms copied, sometimes altered, into other segments. */
const mergeSegmentsOf = (random: Random, duplicates: boolean): Array<{ device: number; rows: MergeRow[] }> => {
  const devices = 1 + below(random, 3);
  let nextTerm = 0;
  const segments = Array.from({ length: devices }, (_unused, device) => {
    const rows: MergeRow[] = [];
    let clock = below(random, 60);
    for (let index = 0, terms = 1 + below(random, 3); index < terms; index++) {
      const term = nextTerm++;
      clock = random() < 0.3 ? Math.max(0, clock - below(random, 60)) : clock + below(random, 20);
      for (let seq = 0, count = 1 + below(random, 3); seq < count; seq++) {
        rows.push({ term, seq, run: 1, kind: 'O', argument: below(random, 3), ms: clock, epoch: term + 1, attempt: 0 });
        clock += below(random, 4);
      }
    }
    return { device, rows };
  });
  for (let copy = 0, copies = duplicates ? 1 + below(random, 3) : 1; copy < copies; copy++) {
    if (random() < (duplicates ? 0.6 : 0.3)) {
      const source = pick(random, segments);
      segments.push({ device: random() < 0.5 ? source.device : devices, rows: [...source.rows] });
    }
    if (random() < (duplicates ? 0.6 : 0.35) && segments.length > 1) {
      const [from, to] = [pick(random, segments), pick(random, segments)];
      const { term } = pick(random, from.rows);
      const copied = from.rows.filter((row) => row.term === term).slice(0, 1 + below(random, 3));
      to.rows.push(
        ...copied.map((row) =>
          random() < 0.2
            ? { ...row, argument: row.argument + 7 }
            : { ...row, ms: Math.max(0, row.ms + below(random, 3) - 1) },
        ),
      );
    }
  }
  for (let index = segments.length - 1; index > 0; index--) {
    const other = below(random, index + 1);
    [segments[index], segments[other]] = [segments[other]!, segments[index]!];
  }
  return segments;
};

const mergeTrace = (random: Random, name: string, duplicates: boolean): Trace => {
  const segments = mergeSegmentsOf(random, duplicates);
  const text = [`T ${name}`];
  for (const segment of segments) {
    text.push(`SEG ${segment.device}`, ...segment.rows.map((row) => `ROW ${rowLine(row)}`));
  }
  const conflicts: string[] = [];
  const merged = mergeLogSegments(
    segments.map((segment) => ({ deviceId: `d${segment.device}`, bytes: segmentBytes(segment.rows) })),
    {
      onConflict: ({ key, keptDeviceId, droppedDeviceId }) => {
        conflicts.push(`${keyText(key)}:${keptDeviceId.slice(1)}:${droppedDeviceId.slice(1)}`);
      },
    },
  );
  text.push('MERGE', 'X');
  return {
    text,
    expected: [
      `T ${name}`,
      `M ${merged.map((event) => mergedText(event)).join(',')}`,
      `MC ${listText(conflicts)}`,
      'X',
    ],
  };
};

/** The three legality tables, every cell (T8). */
const tablesTrace = (): Trace => {
  const expected = ['T tables'];
  for (const [state, row] of Object.entries(operationTable.table)) {
    for (const [operation, code] of Object.entries(row)) {
      expected.push(`TO ${state} ${operation} ${code}`);
    }
  }
  for (const [state, row] of Object.entries(settlementTable.table)) {
    for (const [operation, code] of Object.entries(row)) {
      expected.push(`TS ${state} ${operation} ${code}`);
    }
  }
  for (const [state, row] of Object.entries(lifecycleTable.table)) {
    for (const [operation, code] of Object.entries(row)) {
      expected.push(`TL ${state} ${operation} ${code}`);
    }
  }
  expected.push('X');
  return { text: ['T tables', 'TABLES', 'X'], expected };
};

const historyKinds: readonly Kind[] = ['L', 'L', 'L', 'L', 'S', 'S', 'S', 'H', 'O'];
const baseProfile: Profile = {
  appendKinds: historyKinds,
  rawKinds: historyKinds,
  undefinedKeys: false,
  legacy: 0,
  attempts: 0,
  raw: 0,
  reader: false,
  queries: true,
};

type Corpus = {
  readonly name: string;
  readonly seed: number;
  readonly count: number;
  readonly profile?: Profile;
  /** Merge traces instead of log traces; `true` draws duplicated and conflicting segments. */
  readonly merge?: boolean;
  readonly duplicates?: boolean;
};

/** The tables, then `count` traces of the corpus's kind, from one seeded stream. */
const generate = async (corpus: Corpus, seed = corpus.seed): Promise<Trace[]> => {
  const random = randomOf(seed);
  const traces: Trace[] = [tablesTrace()];
  for (let index = 0; index < corpus.count; index++) {
    traces.push(
      corpus.merge === true
        ? mergeTrace(random, `merge-${index}`, corpus.duplicates === true)
        : // oxlint-disable-next-line no-await-in-loop -- one trace at a time keeps the seeded stream reproducible.
          await logTrace(random, `log-${index}`, corpus.profile ?? baseProfile),
    );
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

const corpora: readonly Corpus[] = [
  { name: 'base', seed: 20_260_925, count: 200 },
  { name: 'undefined-keys', seed: 20_260_926, count: 200, profile: { ...baseProfile, undefinedKeys: true } },
  {
    name: 'redelivery',
    seed: 20_260_927,
    count: 120,
    profile: { ...baseProfile, raw: 0.15, reader: true, queries: false },
  },
  { name: 'duplicate-segments', seed: 20_260_928, count: 150, merge: true, duplicates: true },
  { name: 'legacy-epochs', seed: 20_260_929, count: 120, profile: { ...baseProfile, legacy: 0.5, attempts: 0.3 } },
  {
    name: 'opaque-rows',
    seed: 20_260_930,
    count: 120,
    profile: { ...baseProfile, rawKinds: [...historyKinds, 'U', 'U', 'U'], raw: 0.35, reader: true },
  },
  {
    name: 'stale-append',
    seed: 20_260_931,
    count: 120,
    profile: { ...baseProfile, raw: 0.3, attempts: 0.2 },
  },
  {
    name: 'invocations',
    seed: 20_260_932,
    count: 120,
    profile: {
      ...baseProfile,
      appendKinds: ['L', 'L', 'S', 'H', 'P', 'P', 'V', 'V', 'M', 'M', 'O', 'R'],
      rawKinds: ['P', 'V', 'M'],
      raw: 0.15,
      attempts: 0.3,
    },
  },
];

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
  for (const corpus of corpora) {
    it(`should regenerate the committed ${corpus.name} corpus from seed ${corpus.seed}`, async () => {
      const text = traceText(await tracesOf(corpus));
      if (updating) {
        writeFileSync(corpusFile(corpus, 'trace'), text);
        mkdirSync(outputDirectory, { recursive: true });
        const traces = await tracesOf(corpus);
        writeFileSync(
          `${outputDirectory}${corpus.name}.typescript`,
          `${traces.flatMap((trace) => trace.expected).join('\n')}\n`,
        );
      }

      expect(text).toBe(readFileSync(corpusFile(corpus, 'trace'), 'utf8'));
    }, 120_000);
  }

  // CL-A11, SC3: every generator, 0 mismatches. `undefined-keys` is S5 D1 (W0.1, CL-S1): the mutant
  // `undefined-key-skip` removes the skip and this test catches it (RV6-F2).
  it.skipIf(updating)(
    'should match the Lean goldens on every corpus',
    async () => {
      const found: string[] = [];
      for (const corpus of corpora) {
        expect(existsSync(corpusFile(corpus, 'expected')), corpus.name).toBe(true);
        // oxlint-disable-next-line no-await-in-loop -- corpora are generated one at a time.
        found.push(...mismatches(await tracesOf(corpus), readFileSync(corpusFile(corpus, 'expected'), 'utf8')));
      }

      expect(found.slice(0, 5)).toEqual([]);
    },
    240_000,
  );

  it.runIf(freshTraces > 0)(
    'should write fresh-seed corpora and their TypeScript output for the nightly oracle',
    async () => {
      const seed = Number(process.env['FORMAL_SEED'] ?? Math.floor(Math.random() * 2_147_483_647));
      process.stdout.write(
        `chat-ledger fresh differential: seed ${seed}, ${freshPerGenerator(corpora.length)} traces per generator (replay with FORMAL_SEED=${seed})\n`,
      );
      rmSync(freshDirectory, { recursive: true, force: true });
      mkdirSync(freshDirectory, { recursive: true });
      for (const corpus of corpora) {
        // oxlint-disable-next-line no-await-in-loop -- one generator at a time bounds memory.
        const traces = await generate({ ...corpus, count: freshPerGenerator(corpora.length) }, seed);
        writeFileSync(`${freshDirectory}${corpus.name}-${seed}.trace`, traceText(traces));
        writeFileSync(
          `${freshDirectory}${corpus.name}-${seed}.typescript`,
          `${traces.flatMap((trace) => trace.expected).join('\n')}\n`,
        );
      }

      expect(existsSync(`${freshDirectory}invocations-${seed}.typescript`)).toBe(true);
    },
    1_800_000,
  );
});
