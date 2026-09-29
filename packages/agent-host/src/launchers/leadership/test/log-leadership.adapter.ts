/**
 * The conformance adapter between M2 (`leadershipMachine`) and `specs/LogLeadership.tla` (W6.r1 finding 13), over the
 * graph export `LogLeadershipGraph.tla` (`LogLeadershipGraph.export.cfg`).
 *
 * The harness is two real M2 actors, one per spec worker (`w1`, `w2`: two tabs of one build), over fakes for what
 * each worker's M2 talks to: the Web Lock manager, the chat's `BroadcastChannel`, the page lifecycle, and M1 with its
 * writer. Each M2 effect moves the fakes; each spec action is the fake's event that performs it:
 * - `Want(w)`: M1 needs the writer to start a run, so M2 gets the `start` command.
 * - `Acquire(w)`, `GrantQueued(w)`: the lock manager grants the request M2 made (`lockGranted`).
 * - `Read(w)`: the writer's read of the log answers M2's `readView` at the log's next epoch (`viewRead`).
 * - `Start(w, x)`: w's M1 admits the run that `x` wanted, which M2 ran here (its own command, or `x`'s forward):
 *   M1 leaves quiescence and the command is answered (`executed`).
 * - `Release(w)`: M1 is quiescent (`quiescent`). A grant M2 has not read yet is read first: M2 never lets a grant go
 *   before its reconciling read, where the spec may.
 * - `QueueReconcile(w)`: the reconciliation that waits (`reconcile{wait: true}`), on a page shown to queue it.
 * - `Freeze(w)`: the page hides before it freezes (`visibility{visible: false}`); nothing reaches a frozen worker, and
 *   its frames wait. `Thaw(w)`: the frames are delivered after `resume`; the page stays hidden, as the spec's thawed tab
 *   does not queue again.
 * - `Heartbeat`, `End`: stutters for M2 (its heartbeat rides the claim; M1's ending row is M1's).
 *
 * The refinement mapping (the view): `m2[w]`, each M2's phase (`leading`, `claiming`, `queued` for a request not yet
 * granted, else `idle`), with the fakes' `frozen`, `want` and `drives`.
 *
 * Scope (`LogLeadershipGraph.export.cfg`): two workers of one build, the lock per run (`Scope = "run"`), one run, one
 * queued reconciliation, one freeze, and the lazy fence; no steal, no crash, no forwarded follower keys. Steals,
 * notices, crashes and the frozen-time rule are TLC-checked in `LogLeadership.scope-*.cfg` and driven by the M2 and
 * binding tests; a bigger scope passes the 1 MB graph budget (FM-R7).
 */

import { createActor } from 'xstate';
import type { Actor, AnyEventObject, EventFromLogic } from 'xstate';

import type { SpecView } from '@taucad/formal/graph';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors, recordTransitions } from '@taucad/xstate-testing/inspect';

import type { LeadershipMessage } from '#launchers/leadership/frames.js';
import { leadershipIgnoredEvents, leadershipMachine } from '#launchers/leadership/leadership.machine.js';
import type { LeadershipEffectArgs, LeadershipInput } from '#launchers/leadership/leadership.machine.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import { agentWireVersion } from '#wire/frames.schema.js';

/** The export's workers. */
export const workers = ['w1', 'w2'] as const;
type Worker = (typeof workers)[number];

/** Each worker's M2 input. */
export const leadershipInput = (worker: Worker): LeadershipInput => ({
  chatId: 'chat-1',
  sender: worker,
  build: 'build-1',
  wire: agentWireVersion,
  canSteal: false,
  visible: true,
});

type Effect = {
  readonly [Name in keyof LeadershipEffectArgs]: Readonly<{ name: Name; args: LeadershipEffectArgs[Name] }>;
}[keyof LeadershipEffectArgs];

type Tab = {
  readonly worker: Worker;
  readonly actor: Actor<typeof leadershipMachine>;
  readonly records: ReturnType<typeof recordTransitions>['records'];
  frozen: boolean;
  /** Frames sent while this worker was frozen, delivered when it thaws. */
  readonly inbox: LeadershipMessage[];
  /** The `readView` M2 is waiting on. */
  view: string | undefined;
  /** Commands M2 ran here, awaiting M1's admission: its own, or another worker's forward. */
  readonly running: Array<Readonly<{ corr: string; from: Worker; command: HostCommand }>>;
  /** The run this worker's M1 drives (the spec's `drives`). */
  drives: number;
};

/** One replay: two M2 actors over the fakes. */
export type LogLeadershipHarness = {
  readonly tabs: Readonly<Record<Worker, Tab>>;
  /** The effects M2 ordered, not yet applied to the fakes. */
  readonly effects: Array<Readonly<{ worker: Worker; effect: Effect }>>;
  /** The lock manager: the grant, and requests waiting for the spec's grant step. */
  holder: Readonly<{ worker: Worker; corr: string }> | undefined;
  readonly ifAvailable: Map<Worker, string>;
  readonly queued: Map<Worker, string>;
  /** The spec's `want`: the worker whose run is wanted and not yet admitted. */
  wanted: Worker | undefined;
  /** Budgets the walk spends as the spec does (`MaxWants`, `MaxQueues`, `MaxFreezes`). */
  wants: number;
  queues: number;
  freezes: number;
  /** A run is live (admitted, not yet ended). */
  live: boolean;
};

const other = (worker: Worker): Worker => (worker === 'w1' ? 'w2' : 'w1');

const effectNames = [
  'requestLock',
  'releaseLock',
  'broadcast',
  'readView',
  'claim',
  'runLocal',
  'answer',
  'readLocal',
  'serveRead',
  'answerRead',
  'relinquish',
  'wakeReads',
  'watchHolder',
  'checkHolder',
] as const satisfies ReadonlyArray<keyof LeadershipEffectArgs>;

const startOf = (worker: Worker): HostCommand => ({
  type: 'start',
  commandId: `start-${worker}`,
  payload: {
    chatId: 'chat-1',
    runId: `run-${worker}`,
    trigger: 'submit',
    message: { id: `user-${worker}`, role: 'user', content: 'hello' },
  },
});

const applied = (command: HostCommand, generation: number): CommandAnswer => ({
  commandId: command.commandId,
  generation,
  status: 'applied',
  effect: 'durable',
  cursor: 0,
});

/** Start the two workers' M2 actors over the fakes. */
export const startLogLeadership = (): LogLeadershipHarness => {
  const effects: LogLeadershipHarness['effects'] = [];
  const tabOf = (worker: Worker): Tab => {
    const guard = guardActors({ ignore: { leadership: leadershipIgnoredEvents } });
    const recorder = recordTransitions();
    const actions = Object.fromEntries(
      effectNames.map((name) => [
        name,
        (args: unknown) => {
          const effect = { name, args };
          effects.push({ worker, effect: effect as Effect });
        },
      ]),
    ) as { readonly [Name in keyof LeadershipEffectArgs]: (args: LeadershipEffectArgs[Name]) => void };
    const actor = createActor(leadershipMachine.provide({ actions }), {
      input: leadershipInput(worker),
      clock: new StepClock(),
      inspect: (event) => {
        guard.inspect(event);
        recorder.inspect(event);
      },
    });
    actor.start();
    return {
      worker,
      actor,
      records: recorder.records,
      frozen: false,
      inbox: [],
      view: undefined,
      running: [],
      drives: 0,
    };
  };
  return {
    tabs: { w1: tabOf('w1'), w2: tabOf('w2') },
    effects,
    holder: undefined,
    ifAvailable: new Map(),
    queued: new Map(),
    wanted: undefined,
    wants: 0,
    queues: 0,
    freezes: 0,
    live: false,
  };
};

const send = (harness: LogLeadershipHarness, worker: Worker, event: AnyEventObject): void => {
  harness.tabs[worker].actor.send(event as EventFromLogic<typeof leadershipMachine>);
};

/** A frame on the chat's channel, as the other worker's binding parses it. */
const frameOf = (
  from: Worker,
  { kind, epoch, body }: LeadershipEffectArgs['broadcast'],
): LeadershipMessage | undefined => {
  const fields = body;
  switch (kind) {
    case 'hb': {
      return { kind, sender: from, epoch, state: fields['state'] as 'leading' | 'released', foreign: false };
    }
    case 'cmd': {
      const { type, commandId, payload } = fields;
      const command = { type, commandId, payload };
      return {
        kind,
        sender: from,
        epoch,
        corr: String(fields['corr']),
        command: command as HostCommand,
        foreign: false,
      };
    }
    case 'ans': {
      return {
        kind,
        sender: from,
        epoch,
        to: String(fields['to']),
        corr: String(fields['corr']),
        answer: fields['answer'] as CommandAnswer,
      };
    }
    default: {
      return undefined;
    }
  }
};

/** Apply the effects M2 ordered to the fakes, until none are left. */
const pump = (harness: LogLeadershipHarness): void => {
  for (let next = harness.effects.shift(); next !== undefined; next = harness.effects.shift()) {
    const { worker, effect } = next;
    const tab = harness.tabs[worker];
    switch (effect.name) {
      case 'requestLock': {
        const { corr, mode } = effect.args;
        if (mode === 'queued') {
          harness.queued.set(worker, corr);
        } else if (mode === 'ifAvailable' && harness.holder === undefined && harness.queued.size === 0) {
          /* Granted at the spec's `Acquire`. */
          harness.ifAvailable.set(worker, corr);
        } else if (mode === 'ifAvailable') {
          send(harness, worker, { type: 'lockUnavailable', corr });
        } else {
          throw new Error('The export has no steal.');
        }
        break;
      }
      case 'releaseLock': {
        const { corr } = effect.args;
        if (harness.holder?.corr === corr) {
          harness.holder = undefined;
        }
        for (const requests of [harness.ifAvailable, harness.queued]) {
          if (requests.get(worker) === corr) {
            requests.delete(worker);
          }
        }
        break;
      }
      case 'broadcast': {
        const to = other(worker);
        const message = frameOf(worker, effect.args);
        if (message === undefined) {
          break;
        }
        if (harness.tabs[to].frozen) {
          harness.tabs[to].inbox.push(message);
        } else {
          send(harness, to, { type: 'frame', message });
        }
        break;
      }
      case 'readView': {
        tab.view = effect.args.corr;
        break;
      }
      case 'runLocal': {
        const { corr, command } = effect.args;
        tab.running.push({ corr, from: corr.startsWith('remote:') ? other(worker) : worker, command });
        break;
      }
      default:
    }
  }
};

/** Grant `worker` the request it made. */
const grant = (harness: LogLeadershipHarness, worker: Worker, requests: Map<Worker, string>): void => {
  const corr = requests.get(worker);
  if (corr === undefined) {
    throw new Error(`${worker} has no lock request to grant.`);
  }
  requests.delete(worker);
  harness.holder = { worker, corr };
  send(harness, worker, { type: 'lockGranted', corr });
};

/** Answer M2's `readView` at `epoch`. */
const read = (harness: LogLeadershipHarness, worker: Worker, epoch: number): void => {
  const tab = harness.tabs[worker];
  if (tab.view === undefined) {
    throw new Error(`${worker} has no read to answer.`);
  }
  const corr = tab.view;
  tab.view = undefined;
  send(harness, worker, { type: 'viewRead', corr, epoch });
};

const epochOf = (harness: LogLeadershipHarness, worker: Worker): number =>
  (harness.tabs[worker].actor.getSnapshot().context as { readonly epoch?: number }).epoch ?? 0;

/** One spec action: its name, its worker, and for `Start` the worker whose run it admits. */
export type LogLeadershipOp = Readonly<{ act: string; w: Worker; x?: Worker; epoch?: number }>;

/** Perform one spec action on the harness, then apply what M2 ordered. */
export const perform = (harness: LogLeadershipHarness, op: LogLeadershipOp): void => {
  const { w } = op;
  const tab = harness.tabs[w];
  switch (op.act) {
    case 'Want': {
      harness.wanted = w;
      harness.wants += 1;
      send(harness, w, { type: 'command', corr: `want:${w}`, command: startOf(w) });
      break;
    }
    case 'Acquire': {
      grant(harness, w, harness.ifAvailable);
      break;
    }
    case 'GrantQueued': {
      grant(harness, w, harness.queued);
      break;
    }
    case 'Read': {
      read(harness, w, op.epoch ?? 1);
      break;
    }
    case 'Start': {
      const from = op.x ?? w;
      const index = tab.running.findIndex((entry) => entry.from === from);
      if (index === -1) {
        throw new Error(`${w} runs no command of ${from}'s.`);
      }
      const [entry] = tab.running.splice(index, 1);
      tab.drives = 1;
      harness.live = true;
      harness.wanted = undefined;
      send(harness, w, { type: 'quiescent', quiescent: false });
      send(harness, w, { type: 'executed', corr: entry!.corr, answer: applied(entry!.command, epochOf(harness, w)) });
      break;
    }
    case 'End': {
      tab.drives = 0;
      harness.live = false;
      break;
    }
    case 'Release': {
      if (tab.view !== undefined) {
        read(harness, w, (op.epoch ?? 0) + 1);
        pump(harness);
      }
      send(harness, w, { type: 'quiescent', quiescent: true });
      break;
    }
    case 'QueueReconcile': {
      harness.queues += 1;
      send(harness, w, { type: 'visibility', visible: true });
      send(harness, w, { type: 'reconcile', wait: true });
      break;
    }
    case 'Freeze': {
      harness.freezes += 1;
      send(harness, w, { type: 'visibility', visible: false });
      tab.frozen = true;
      break;
    }
    case 'Thaw': {
      tab.frozen = false;
      send(harness, w, { type: 'resume' });
      for (const message of tab.inbox.splice(0)) {
        send(harness, w, { type: 'frame', message });
      }
      break;
    }
    case 'Heartbeat': {
      break;
    }
    default: {
      throw new Error(`The adapter maps no M2 step to ${op.act}.`);
    }
  }
  pump(harness);
};

/** Each M2's phase: the lock held with a term, held before its read, requested in the queue, or none of these. */
const phaseOf = (tab: Tab): string => {
  const snapshot = tab.actor.getSnapshot();
  if (snapshot.hasTag('leading')) {
    return 'leading';
  }
  if (snapshot.matches('claiming')) {
    return 'claiming';
  }
  const { lock } = snapshot.context;
  return lock?.mode === 'queued' && !lock.granted ? 'queued' : 'idle';
};

const perWorker = <T>(of: (worker: Worker) => T): Record<Worker, T> =>
  Object.fromEntries(workers.map((worker) => [worker, of(worker)])) as Record<Worker, T>;

/** The refinement mapping: M2's phase per worker, with the fakes' page and M1 facts. */
export const viewOf = (harness: LogLeadershipHarness): SpecView => ({
  m2: perWorker((worker) => phaseOf(harness.tabs[worker])),
  frozen: perWorker((worker) => harness.tabs[worker].frozen),
  want: perWorker((worker) => harness.wanted === worker),
  drives: perWorker((worker) => harness.tabs[worker].drives),
});

/**
 * The actions the environment may take next (the walk's inputs): the lock manager, M1, the page and the reconciler,
 * each on its own precondition and the export's budgets. What M2 does with them is what the walk checks. The
 * environment releases only when no write waits anywhere, as `Release`'s `~SameWant` requires: M2 lets its grant go
 * when M1 is quiescent even while another tab's write it has not heard of waits, and that tab takes the lock on the
 * released heartbeat, which this spec does not model.
 */
export const enabledOps = (harness: LogLeadershipHarness): LogLeadershipOp[] => {
  const ops: LogLeadershipOp[] = [];
  for (const w of workers) {
    const tab = harness.tabs[w];
    if (tab.frozen) {
      ops.push({ act: 'Thaw', w });
      continue;
    }
    const phase = phaseOf(tab);
    if (harness.wants < 1) {
      ops.push({ act: 'Want', w });
    }
    if (harness.ifAvailable.has(w) && harness.holder === undefined) {
      ops.push({ act: 'Acquire', w });
    }
    if (harness.queued.has(w) && harness.holder === undefined) {
      ops.push({ act: 'GrantQueued', w });
    }
    if (tab.view !== undefined) {
      ops.push({ act: 'Read', w, epoch: 1 });
    }
    if (!harness.live) {
      for (const entry of tab.running) {
        ops.push({ act: 'Start', w, x: entry.from });
      }
    }
    if (tab.drives > 0) {
      ops.push({ act: 'End', w });
    }
    if ((phase === 'claiming' || phase === 'leading') && tab.drives === 0 && harness.wanted === undefined) {
      ops.push({ act: 'Release', w });
    }
    if (harness.queues < 1 && harness.live && phase === 'idle' && harness.holder?.worker === other(w)) {
      ops.push({ act: 'QueueReconcile', w });
    }
    if (harness.freezes < 1) {
      ops.push({ act: 'Freeze', w });
    }
  }
  return ops;
};

/** The graph labels a step `<<name, w>>`, or `<<"Start", w, x>>`; `Read` takes the log's epoch from the target. */
const opOf = (act: readonly unknown[], target: SpecView): LogLeadershipOp => {
  const [name, w, x] = act as readonly [string, Worker, Worker | undefined];
  if (name === 'Read') {
    return { act: name, w, epoch: (target['mine'] as Record<Worker, number>)[w] };
  }
  if (name === 'Release') {
    return { act: name, w, epoch: (target['mine'] as Record<Worker, number>)[w] };
  }
  return x === undefined ? { act: name, w } : { act: name, w, x };
};

/** Forward replay over the two workers. */
export const logLeadershipAdapter: ConformanceAdapter<LogLeadershipHarness> = {
  start: startLogLeadership,
  apply: async (harness, [act, target]) => {
    perform(harness, opOf(act as readonly unknown[], target as SpecView));
    await flush();
  },
  view: viewOf,
  stop: (harness) => {
    for (const worker of workers) {
      harness.tabs[worker].actor.stop();
    }
  },
};
