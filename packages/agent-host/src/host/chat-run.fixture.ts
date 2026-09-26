/**
 * Test support for M1's machine and conformance suites (W7 RA-S15): a chat log written through W3's own stamp, gate
 * and fold, and one incarnation from `createChatRunActor` over services the test answers one call at a time.
 */

import type { ActorOptions, AnyActorLogic, AnyEventObject } from 'xstate';

import { createChatRunActor } from '#host/chat-run-effects.js';
import type { ChatRunActor, ChatRunServices, DriverReport } from '#host/chat-run-effects.js';
import type { ChatRunOutcomeEvent, ChatRunRow, PreparedAdmission, PreparedResume } from '#host/chat-run-events.js';
import { emptyChatLedger, foldChatLedger, gateRows, stampRows } from '#log/chat-ledger.js';
import type { ChatLedger, LogRowBody } from '#log/chat-ledger.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

export const chatId = 'chat-1';

/**
 * A `run.lifecycle` body; M1's extra fields ride the loose row.
 *
 * @param state - The run state the row records.
 * @param fields - Extra fields, such as `detail`.
 * @returns The row body.
 */
export const lifecycle = (state: string, fields: Readonly<Record<string, unknown>> = {}): LogRowBody =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the lifecycle row is loose (RA-Q4).
  ({ type: 'run.lifecycle', state, ...fields }) as LogRowBody;

/** One command event per verb, framed as M1 reads it. */
export const commands = {
  start: (commandId: string, runId = 'run-1') =>
    ({
      type: 'start',
      commandId,
      payload: { chatId, runId, trigger: 'submit', message: { id: `turn-${runId}`, role: 'user', content: 'Hello.' } },
    }) as const,
  resume: (commandId: string, runId = 'run-1') => ({ type: 'resume', commandId, payload: { chatId, runId } }) as const,
  cancel: (commandId: string, runId = 'run-1') => ({ type: 'cancel', commandId, payload: { chatId, runId } }) as const,
  steer: (commandId: string, runId = 'run-1') =>
    ({ type: 'steer', commandId, payload: { chatId, runId, message: 'Also this.' } }) as const,
  interrupt: (commandId: string, runId = 'run-1') =>
    ({
      type: 'interrupt',
      commandId,
      payload: { chatId, runId, interruptId: 'interrupt-1', kind: 'approval', prompt: 'May I?' },
    }) as const,
  'resolve-interrupt': (commandId: string, runId = 'run-1') =>
    ({
      type: 'resolve-interrupt',
      commandId,
      payload: { chatId, runId, interruptId: 'interrupt-1', outcome: 'approved' },
    }) as const,
};

/** An append's result, as the host's `write` returns it. */
type Written = Readonly<{ ledger: ChatLedger; messageIds: readonly string[] }>;

/** A log over W3's stamp, gate and fold. */
export type ChatLog = Readonly<{
  rows: readonly AgentLogEvent[];
  /** W3's fold of every row. */
  ledger: () => ChatLedger;
  /** Stamp and gate one batch; throws a coded refusal when the gate refuses. */
  append: (leaderEpoch: string, batch: readonly ChatRunRow[]) => Written;
}>;

/**
 * A log appended as the host's `write` appends: each row stamped by W3's `stampRows`, the batch checked by `gateRows`.
 *
 * @returns An empty log over W3's own stamp, gate and fold.
 */
export const createChatLog = (): ChatLog => {
  const rows: AgentLogEvent[] = [];
  let tick = 0;
  const ledger = (): ChatLedger => foldChatLedger(emptyChatLedger, rows);
  const append = (leaderEpoch: string, batch: readonly ChatRunRow[]): Written => {
    const before = ledger();
    let scratch = before;
    const recordedAt = new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)).toISOString();
    const stamped = batch.map((row) => {
      const [event] = stampRows({
        ledger: scratch,
        leaderEpoch,
        runId: row.runId,
        recordedAt,
        ...(row.commandId === undefined ? {} : { commandId: row.commandId }),
        bodies: [row.body],
      });
      scratch = foldChatLedger(scratch, [event]);
      return event!;
    });
    const gated = gateRows(before, stamped);
    if (!gated.ok) {
      throw Object.assign(new Error(`The gate refused row ${String(gated.row)}: ${gated.code}.`), {
        code: gated.code,
        effect: 'not-applied',
      });
    }
    rows.push(...stamped);
    const messageIds = stamped.flatMap((event) => (event.type === 'message.appended' ? [event.message.id] : []));
    return { ledger: ledger(), messageIds };
  };
  return { rows, ledger, append };
};

/** One service call the test has not answered yet. */
type Call = Readonly<{
  name: 'openLog' | 'append' | 'prepareAdmission' | 'prepareResume' | 'closeLog';
  input: unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}>;

/** Options for {@link createChatRunHarness}. */
export type ChatRunHarnessOptions = Readonly<
  {
    /** Rewrites every ledger the machine is handed (a seeded mutant strips its applied set). */
    ledgerView?: (ledger: ChatLedger) => ChatLedger;
  } & Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect'>
>;

/** One started incarnation, its log and answers, and one helper per outcome; each helper settles its effects. */
export type ChatRunHarness = Readonly<{
  actor: ChatRunActor;
  log: ChatLog;
  answers: readonly CommandAnswer[];
  /** Service calls still waiting, by name. */
  pendingCalls: () => ReadonlyArray<Call['name']>;
  send: (event: AnyEventObject) => Promise<void>;
  open: () => Promise<void>;
  /** Write the oldest pending append to the log and answer it; a gate refusal answers as the host's does. */
  commit: () => Promise<void>;
  admit: (kind?: PreparedAdmission['kind']) => Promise<void>;
  refuseAdmission: () => Promise<void>;
  prepareResume: (mode?: PreparedResume['mode']) => Promise<void>;
  closeLog: () => Promise<void>;
  /** The latest driver reports how its attempt ended. */
  report: (outcome: 'completed' | 'failed' | 'aborted') => Promise<void>;
  /** A driver reports; `driver` counts drivers from the first started (default: the latest). */
  drive: (report: DriverReport, driver?: number) => Promise<void>;
  /** The running driver writes its own rows, as the session does through the append gate. */
  driverWrites: (rows: readonly ChatRunRow[]) => Promise<void>;
}>;

/**
 * Wait one macrotask, so every promise effect that settled delivers its outcome.
 *
 * @returns A promise that resolves on the next macrotask.
 */
const flush = async (): Promise<void> =>
  new Promise((resolve) => {
    /* A macrotask, not a timer: the timeout inventory lists substrate bounds, not test flushes. */
    setImmediate(resolve);
  });

const refusal = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/**
 * One M1 incarnation, built by `createChatRunActor`, over services that wait for the test: each call stays pending
 * until a helper answers it, so a test (or the replay adapter) chooses the order outcomes arrive in. No placement.
 *
 * @param options - A ledger rewrite, and the actor's clock and inspection observer.
 * @returns The started harness.
 */
export const createChatRunHarness = (options: ChatRunHarnessOptions = {}): ChatRunHarness => {
  const log = createChatLog();
  const view = options.ledgerView ?? ((ledger: ChatLedger) => ledger);
  const calls: Call[] = [];
  const answers: CommandAnswer[] = [];
  const reports: Array<(report: DriverReport) => void> = [];
  let deliver: ((event: ChatRunOutcomeEvent) => void) | undefined;
  const leaderEpoch = 'epoch-m1';

  const pending = async <T>(name: Call['name'], input: unknown): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      calls.push({ name, input, resolve: resolve as (value: unknown) => void, reject });
    });
  const take = (name: Call['name']): Call => {
    const index = calls.findIndex((call) => call.name === name);
    if (index === -1) {
      throw new Error(`No ${name} call is pending.`);
    }
    return calls.splice(index, 1)[0]!;
  };
  const settle = async (call: Call, outcome: Readonly<{ value: unknown } | { error: unknown }>): Promise<void> => {
    if ('error' in outcome) {
      call.reject(outcome.error);
    } else {
      call.resolve(outcome.value);
    }
    await flush();
  };

  const services: ChatRunServices = {
    openLog: async (input) => {
      deliver = input.deliver;
      return pending('openLog', input);
    },
    append: async (input) => pending('append', input),
    prepareAdmission: async (input) => pending('prepareAdmission', input),
    prepareResume: async (input) => pending('prepareResume', input),
    startDriver: ({ report }) => {
      reports.push(report);
      return { steer: () => undefined, abort: () => undefined, decide: () => undefined };
    },
    closeLog: async (input) => pending('closeLog', input),
  };

  const actor = createChatRunActor(
    { chatId, leaderEpoch, placement: false },
    {
      services,
      answer: (answer) => {
        answers.push(answer);
      },
      redeliver: () => undefined,
    },
    {
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    },
  );
  actor.start();

  return {
    actor,
    log,
    answers,
    pendingCalls: () => calls.map((call) => call.name),
    send: async (event) => {
      actor.send(event as Parameters<ChatRunActor['send']>[0]);
      await flush();
    },
    open: async () => settle(take('openLog'), { value: { ledger: view(log.ledger()), repair: [] } }),
    commit: async () => {
      const call = take('append');
      const input = call.input as Parameters<ChatRunServices['append']>[0];
      let written: Written;
      try {
        written = log.append(input.leaderEpoch, input.rows);
      } catch (error) {
        await settle(call, { error });
        return;
      }
      await settle(call, { value: { ...written, ledger: view(written.ledger) } });
    },
    admit: async (kind = 'tau') => {
      const call = take('prepareAdmission');
      const { payload } = call.input as Readonly<{ payload: Readonly<{ message: Readonly<{ id: string }> }> }>;
      const prepared: PreparedAdmission = {
        kind,
        turnId: payload.message.id,
        intent: [lifecycle('admitted')],
        start: [],
      };
      await settle(call, { value: prepared });
    },
    refuseAdmission: async () =>
      settle(take('prepareAdmission'), { error: refusal('HOST_MODEL_UNAVAILABLE', 'This host configures no model.') }),
    prepareResume: async (mode = 'continue') => {
      const call = take('prepareResume');
      const { runId } = call.input as Readonly<{ runId: string }>;
      const prepared: PreparedResume = { kind: 'tau', turnId: `turn-${runId}`, mode, intent: [lifecycle('running')] };
      await settle(call, { value: prepared });
    },
    closeLog: async () => settle(take('closeLog'), { value: undefined }),
    report: async (outcome) => {
      const report = reports.at(-1);
      if (report === undefined) {
        throw new Error('No driver was started.');
      }
      report({ type: 'agentEnded', outcome });
      await flush();
    },
    drive: async (report, driver = -1) => {
      const target = reports.at(driver);
      if (target === undefined) {
        throw new Error(`No driver ${String(driver)} was started.`);
      }
      target(report);
      await flush();
    },
    driverWrites: async (rows) => {
      const written = log.append(leaderEpoch, rows);
      deliver?.({ type: 'rowsCommitted', ledger: view(written.ledger), messageIds: written.messageIds });
      await flush();
    },
  };
};
