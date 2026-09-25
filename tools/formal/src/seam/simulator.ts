import type { Scheduler } from 'fast-check';
import { flush, StepClock } from '@taucad/xstate-testing/clock';

export type SeamFault = 'portClose' | 'processDeath' | 'duplicate' | 'reconnect' | 'freeze' | 'thaw';

/** Numbers are 32-bit integers (FM-R8). */
export type TraceValue = string | boolean | number;

/**
 * A trace line's body, as a scenario's `describe` returns it. `kind` is the spec action; a machine
 * step's is its microstep's `meta.tla` (W2 MC-R27).
 */
export type TraceEntry = {
  /** Further fields: commandId, status, effect, cursor, generation, … */
  readonly [field: string]: TraceValue | Readonly<Record<string, TraceValue>> | undefined;
  readonly kind: string;
  /** Process id, or `env`. */
  readonly actor?: string;
  /** The handling machine's `version` (D16, MC-R21). */
  readonly version?: string;
  /** Spec state the line's own fields do not carry (L5 D6). */
  readonly alpha?: Readonly<Record<string, TraceValue>>;
};

/**
 * Trace format v1: one flat NDJSON object per spec action, so TLA+ reads `Trace[l].kind` directly.
 * `t` is the release counter: lines are written at release points, so their order is causal.
 */
export type TraceLine = TraceEntry & { readonly t: number };

export type SimulatorStep = {
  readonly t: number;
  readonly actor: string;
  readonly task: 'deliver' | 'timer' | SeamFault;
  readonly message?: unknown;
};

/**
 * A simulated `@taucad/rpc` port end: structurally a `Port<T>`, so code that takes one runs over it.
 * Deliveries are scheduled tasks; `onClose` fires on a `portClose` fault.
 */
export type SimulatedPort<T> = {
  postMessage: (data: T) => void;
  onMessage: (handler: (data: T) => void) => () => void;
  onClose: (handler: () => void) => () => void;
  close: () => void;
};

export type SimulatedProcess = { readonly clock: StepClock };

export type ProcessHooks = { readonly stop: () => void; readonly reconnect?: () => void };

export type RunOutcome = 'done' | 'no-progress' | 'step-cap';

export type SeamSimulator = {
  readonly process: (id: string, hooks: ProcessHooks) => SimulatedProcess;
  readonly port: <T>(from: string, to: string) => readonly [SimulatedPort<T>, SimulatedPort<T>];
  readonly fault: (kind: SeamFault, target: string) => void;
  /**
   * Releases one scheduled task at a time until `done()` holds (`done`), nothing is pending while it
   * does not (`no-progress`: an unanswered command), or `maxSteps` tasks ran (`step-cap`). `done()` is
   * the conjunction of the quiescence predicates of the properties the scenario exercises (FM-R17);
   * any outcome other than `done` fails the scenario. A `done` run's trace ends with a `done` line.
   */
  readonly run: (bound: { readonly maxSteps: number; readonly done: () => boolean }) => Promise<RunOutcome>;
  readonly trace: () => readonly TraceLine[];
};

type ProcessState = {
  readonly clock: StepClock;
  readonly hooks: ProcessHooks;
  dead: boolean;
  frozen: boolean;
  duplicateNext: boolean;
  timerPending: boolean;
  readonly held: Array<() => void>;
  readonly ends: Array<PortEnd<unknown>>;
};

type PortEnd<T> = {
  readonly owner: string;
  readonly handlers: Set<(data: T) => void>;
  readonly closeHandlers: Set<() => void>;
  closed: boolean;
  peer?: PortEnd<T>;
};

const removable = <T>(set: Set<T>, item: T): (() => void) => {
  set.add(item);
  return () => {
    set.delete(item);
  };
};

/**
 * The seam simulator kernel (FM-S11): simulated processes with their own `StepClock`, simulated ports
 * and faults, every delivery, timer and fault a task on fast-check's seeded `scheduler`, which picks
 * the order, shrinks a failure and replays it (`fc.schedulerFor`). After each released task the
 * simulator flushes and appends the lines `describe` builds for that step.
 */
export const createSeamSimulator = (
  scheduler: Scheduler,
  describe: (step: SimulatorStep) => readonly TraceEntry[],
): SeamSimulator => {
  const processes = new Map<string, ProcessState>();
  const lines: TraceLine[] = [];
  /** Steps released since the last describe, in release order. */
  const pendingSteps: SimulatorStep[] = [];
  /** Every scheduled task until it settles; a task that throws fails the run instead of vanishing. */
  const tasks = new Map<number, Promise<void>>();
  const failures: unknown[] = [];
  let scheduled = 0;
  let released = 0;

  const stateOf = (id: string): ProcessState => {
    const state = processes.get(id);
    if (!state) {
      throw new Error(`seam simulator: unknown process ${id}`);
    }
    return state;
  };

  type Task = {
    readonly actor: string;
    readonly task: SimulatorStep['task'];
    readonly work: () => void;
    readonly message?: unknown;
  };

  /** Schedules `work` as one task for `actor`; a frozen actor's task waits for `thaw`. */
  const schedule = (entry: Task): void => {
    const id = scheduled;
    scheduled += 1;
    const settle = async (): Promise<void> => {
      try {
        await scheduler.schedule(Promise.resolve(), `${entry.task} ${entry.actor}`);
        const state = processes.get(entry.actor);
        if (state?.frozen && entry.task !== 'thaw') {
          state.held.push(() => {
            schedule(entry);
          });
          return;
        }
        released += 1;
        entry.work();
        pendingSteps.push({
          t: released,
          actor: entry.actor,
          task: entry.task,
          ...(entry.message === undefined ? {} : { message: entry.message }),
        });
      } catch (error) {
        failures.push(error);
      } finally {
        tasks.delete(id);
      }
    };
    tasks.set(id, settle());
  };

  const deliver = <T>(to: PortEnd<T>, data: T): void => {
    const receiver = stateOf(to.owner);
    const copies = receiver.duplicateNext ? 2 : 1;
    receiver.duplicateNext = false;
    for (let copy = 0; copy < copies; copy += 1) {
      schedule({
        actor: to.owner,
        task: 'deliver',
        work: () => {
          if (!receiver.dead && !to.closed) {
            for (const handler of to.handlers) {
              handler(data);
            }
          }
        },
        message: data,
      });
    }
  };

  const armTimers = (): void => {
    for (const [id, state] of processes) {
      if (!state.dead && !state.timerPending && state.clock.nextDue() !== undefined) {
        state.timerPending = true;
        schedule({
          actor: id,
          task: 'timer',
          work: () => {
            state.timerPending = false;
            if (!state.dead) {
              state.clock.next();
            }
          },
        });
      }
    }
  };

  const faults: Readonly<Record<SeamFault, (state: ProcessState) => void>> = {
    // Silent to peers: shipping browsers have no port close event (S7); D8 detects departure by heartbeat.
    processDeath: (state) => {
      state.dead = true;
      state.hooks.stop();
    },
    portClose: (state) => {
      for (const end of state.ends) {
        for (const closing of [end, end.peer]) {
          if (closing && !closing.closed) {
            closing.closed = true;
            for (const handler of closing.closeHandlers) {
              handler();
            }
          }
        }
      }
    },
    duplicate: (state) => {
      state.duplicateNext = true;
    },
    reconnect: (state) => {
      state.hooks.reconnect?.();
    },
    freeze: (state) => {
      state.frozen = true;
    },
    thaw: (state) => {
      state.frozen = false;
      for (const task of state.held.splice(0)) {
        task();
      }
    },
  };

  const run: SeamSimulator['run'] = async ({ maxSteps, done }) => {
    for (let steps = 0; ; steps += 1) {
      armTimers();
      if (done()) {
        lines.push({ t: released + 1, kind: 'done', actor: 'env' });
        return 'done';
      }
      if (scheduler.count() === 0) {
        return 'no-progress';
      }
      if (steps >= maxSteps) {
        return 'step-cap';
      }
      // oxlint-disable-next-line no-await-in-loop -- one task at a time: the release order is the trace order.
      await scheduler.waitNext(1);
      // oxlint-disable-next-line no-await-in-loop -- effects of the released task settle before it is described.
      await flush();
      if (failures.length > 0) {
        throw new AggregateError(failures, 'seam simulator: a released task threw');
      }
      for (const step of pendingSteps.splice(0)) {
        lines.push(...describe(step).map((line): TraceLine => ({ t: step.t, ...line })));
      }
    }
  };

  return {
    process: (id, hooks) => {
      const clock = new StepClock();
      processes.set(id, {
        clock,
        hooks,
        dead: false,
        frozen: false,
        duplicateNext: false,
        timerPending: false,
        held: [],
        ends: [],
      });
      return { clock };
    },
    port: <T>(from: string, to: string) => {
      const end = (owner: string): PortEnd<T> => ({
        owner,
        handlers: new Set(),
        closeHandlers: new Set(),
        closed: false,
      });
      const left = end(from);
      const right = end(to);
      left.peer = right;
      right.peer = left;
      stateOf(from).ends.push(left as PortEnd<unknown>);
      stateOf(to).ends.push(right as PortEnd<unknown>);
      const facade = (self: PortEnd<T>, peer: PortEnd<T>): SimulatedPort<T> => ({
        postMessage: (data) => {
          if (!self.closed && !stateOf(self.owner).dead) {
            deliver(peer, data);
          }
        },
        onMessage: (handler) => removable(self.handlers, handler),
        onClose: (handler) => removable(self.closeHandlers, handler),
        close: () => {
          self.closed = true;
        },
      });
      return [facade(left, right), facade(right, left)] as const;
    },
    fault: (kind, target) => {
      const state = stateOf(target);
      schedule({
        actor: target,
        task: kind,
        work: () => {
          faults[kind](state);
        },
      });
    },
    run,
    trace: () => lines,
  };
};
