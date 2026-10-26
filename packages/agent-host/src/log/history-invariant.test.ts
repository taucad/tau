/**
 * The history invariant (round 21; T14 in `specs/lean/ChatLedger.lean`): the model's history is well formed, every tool
 * output following its call directly before any other message, and the history an open log keeps as it appends is the
 * one a fresh fold of the same rows serves.
 *
 * Seeded sequences of steps drive one appender over this device's log and another device's segment: this device's
 * turns, replies that call tools and their outputs, a Resume under a new term that closes the calls the history left
 * open and says an abandoned run's words where {@link carriedPlace} puts them, the other device's settled turns, and the
 * clock. After every step the log's history must equal a fresh appender's over the same bytes, segments and clock, and,
 * while the other device's terms only ever arrive after every row read (what the run fence gives), be well formed.
 */
import { describe, expect, it } from 'vitest';

import { carriedPlace, historyWellFormed, openToolCalls } from '#host/run-history.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import { abandonedTurnOf } from '#log/event-types.js';
import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';
import type { LogRowBody } from '#log/chat-ledger.js';
import type { ChatLogSegment } from '#log/segments.js';
import { serializeLogEvent } from '#log/serialization.js';

const encoder = new TextEncoder();
const bytesOf = (events: readonly AgentLogEvent[]): Uint8Array<ArrayBuffer> =>
  encoder.encode(events.map((event) => serializeLogEvent(event)).join(''));

// ponytail: mulberry32, as the ledger's differential generator draws.
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

type Step = 'turn' | 'call' | 'output' | 'reply' | 'resume' | 'foreign' | 'foreign-late' | 'tick';
const steps: readonly Step[] = [
  'turn',
  'call',
  'call',
  'output',
  'output',
  'output',
  'reply',
  'resume',
  'foreign',
  'tick',
];

const ids = (messages: readonly ProviderMessage[]): string[] => messages.map((message) => message.id);

/** One seeded trace: the steps it took, and the first step whose history broke the invariant. */
const runTrace = async (
  seed: number,
  options: Readonly<{ late: boolean; length: number }>,
): Promise<Readonly<{ taken: string[]; broken?: string }>> => {
  const random = randomOf(seed);
  const below = (bound: number): number => Math.floor(random() * bound);
  const clock = { now: Date.UTC(2026, 9, 25, 9) };
  const { storage, bytes } = memoryEventLogStorage(bytesOf([]));
  const phone: AgentLogEvent[] = [];
  const segments = (): ChatLogSegment[] =>
    phone.length === 0 ? [] : [{ deviceId: 'device-phone', bytes: bytesOf(phone) }];
  const log = await createEventLogAppender({ ...storage, segments: async () => segments() }, { now: () => clock.now });
  let term = 0;
  let sequence = 0;
  let phoneTerms = 0;
  let made = 0;
  /* The calls the run writing under this device's term is executing: its driver writes their outputs under that term. */
  let executing: string[] = [];
  /* Whether every term the other device wrote arrived after every row this device read. */
  let ordered = true;
  const taken: string[] = [];
  const fresh = async (): Promise<EventLogAppender> =>
    createEventLogAppender(
      { ...memoryEventLogStorage(bytes()).storage, segments: async () => segments() },
      { now: () => clock.now },
    );
  const write = async (runId: string, bodies: readonly LogRowBody[]): Promise<void> => {
    const at = (await log.stampAfterRead?.(clock.now)) ?? clock.now;
    for (const body of bodies) {
      // oxlint-disable-next-line no-await-in-loop -- one batch's rows land in order.
      await log.append({
        version: 1,
        leaderEpoch: `own-${String(term).padStart(2, '0')}`,
        sequence,
        recordedAt: new Date(at).toISOString(),
        runId,
        ...body,
      } as AgentLogEvent);
      sequence += 1;
    }
  };
  const message = (body: ProviderMessage): LogRowBody => ({ type: 'message.appended', message: body });
  const phoneTurn = async (at: number): Promise<void> => {
    phoneTerms += 1;
    const leaderEpoch = `phone-${String(phoneTerms).padStart(2, '0')}`;
    const runId = `run-phone-${String(phoneTerms)}`;
    made += 1;
    const bodies: LogRowBody[] = [
      { type: 'run.lifecycle', state: 'admitted' },
      message({ id: `phone-user-${String(made)}`, role: 'user', content: 'from the phone' }),
      message({ id: `phone-reply-${String(made)}`, role: 'assistant', content: [{ type: 'text', text: 'ok' }] }),
      { type: 'run.lifecycle', state: 'completed' },
    ];
    for (const [sequenceOf, body] of bodies.entries()) {
      phone.push({
        version: 1,
        leaderEpoch,
        sequence: sequenceOf,
        recordedAt: new Date(at).toISOString(),
        runId,
        ...body,
      } as AgentLogEvent);
    }
    await log.refresh?.();
  };
  for (let index = 0; index < options.length; index++) {
    const step: Step = options.late && below(6) === 0 ? 'foreign-late' : steps[below(steps.length)]!;
    taken.push(step);
    made += 1;
    const id = String(made);
    switch (step) {
      case 'turn': {
        // oxlint-disable-next-line no-await-in-loop -- a trace's steps are sequential.
        await write('run-own', [message({ id: `own-user-${id}`, role: 'user', content: 'asks' })]);
        executing = [];
        break;
      }
      case 'call': {
        const calls = Array.from({ length: 1 + below(2) }, (_unused, at) => `call-${id}-${String(at)}`);
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await write('run-own', [
          message({
            id: `own-call-${id}`,
            role: 'assistant',
            content: calls.map((call) => ({ type: 'toolCall', id: call, name: 'read_file', arguments: {} })),
            metadata: { stopReason: 'toolUse' },
          }),
        ]);
        executing = calls;
        break;
      }
      case 'output': {
        const call = executing.shift();
        if (call !== undefined) {
          // oxlint-disable-next-line no-await-in-loop -- see above.
          await write('run-own', [
            message({
              id: `own-out-${id}`,
              role: 'tool-output',
              toolCallId: call,
              toolName: 'read_file',
              content: 'ok',
              isError: false,
            }),
          ]);
        }
        break;
      }
      case 'reply': {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await write('run-own', [
          message({ id: `own-reply-${id}`, role: 'assistant', content: [{ type: 'text', text: 'done' }] }),
        ]);
        executing = [];
        break;
      }
      case 'resume': {
        /* A Resume under a new term: outputs for the calls the history leaves open, then a reminder, with an abandoned
         * run's words carried where `carriedPlace` puts them. */
        term += 1;
        sequence = 0;
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const history = await log.messages();
        const open = openToolCalls(history);
        const own: LogRowBody[] = [
          { type: 'run.lifecycle', state: 'running' },
          ...open.map((call, at) =>
            message({
              id: `own-disconnected-${id}-${String(at)}`,
              role: 'tool-output',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              content: { errorCode: 'CLIENT_DISCONNECTED' },
              isError: true,
            }),
          ),
          ...(open.length === 0 ? [] : [message({ id: `own-reminder-${id}`, role: 'user', content: 'reminder' })]),
        ];
        const carried = message(abandonedTurnOf({ id: `abandoned-${id}`, role: 'user', content: 'from the desktop' }));
        const place = carriedPlace(history, own);
        expect(place).toBeDefined();
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await write('run-own', [...own.slice(0, place), carried, ...own.slice(place)]);
        executing = [];
        break;
      }
      case 'foreign': {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const at = Math.max(clock.now, ((await log.stampAfterRead?.(clock.now)) ?? clock.now) + 1000);
        clock.now = at + 1000;
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await phoneTurn(at);
        break;
      }
      case 'foreign-late': {
        ordered = false;
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await phoneTurn(Date.UTC(2026, 9, 25, 9) + below(Math.max(1, clock.now - Date.UTC(2026, 9, 25, 9))));
        break;
      }
      case 'tick': {
        clock.now += 1000 * (1 + below(120));
        break;
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- each step's history is checked before the next.
    const kept = await log.messages();
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const reader = await fresh();
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const folded = await reader.messages();
    if (JSON.stringify(ids(kept)) !== JSON.stringify(ids(folded))) {
      return {
        taken,
        broken: `step ${String(index)} (${step}): kept ${ids(kept).join(' ')} | fresh ${ids(folded).join(' ')}`,
      };
    }
    if (ordered && !historyWellFormed(kept)) {
      return { taken, broken: `step ${String(index)} (${step}): not well formed: ${ids(kept).join(' ')}` };
    }
  }
  return { taken };
};

describe('the history invariant (T14)', () => {
  it('should keep, as it appends, the well-formed history a fresh fold serves', async () => {
    for (let seed = 1; seed <= 100; seed++) {
      // oxlint-disable-next-line no-await-in-loop -- one seeded trace at a time keeps a failure reproducible.
      const trace = await runTrace(seed, { late: false, length: 30 });
      expect(trace.broken, `seed ${String(seed)}: ${trace.taken.join(',')}`).toBeUndefined();
    }
  }, 120_000);

  it('should keep the history a fresh fold serves when another device’s terms arrive out of order', async () => {
    for (let seed = 1001; seed <= 1100; seed++) {
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const trace = await runTrace(seed, { late: true, length: 30 });
      expect(trace.broken, `seed ${String(seed)}: ${trace.taken.join(',')}`).toBeUndefined();
    }
  }, 120_000);
});
