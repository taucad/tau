/**
 * The conformance adapter between `acpSessionsMachine` and `specs/AcpSessions.tla` (W10 EA-S7).
 *
 * The harness is the real parent over stub children. A stub child stands for one
 * `acpSession` and its adapter process group, the spec's `proc`: the adapter plays
 * the child's reports (`opened`, `turnEnded`, `closed`) for the spec's child and
 * environment actions, and the parent's own sends (`lend`, `close`) move the
 * process record. The view is the blueprint's refinement mapping:
 * - `ent[k]`: the parent's slot (opening and lent are busy, resting is idle).
 * - `timer[k]`: the parent's scheduled `idle:<key>` raise.
 * - `proc[p]`: the stub's process, closing once the parent sent it `close`.
 * - `run[r]`: the facade request, from the slot that holds it or its `turnSettled`; `cx`
 *   (a dropped cancel) is FALSE in the target.
 *
 * Scope: `AcpSessions.export.cfg` (`Runs = {1}`, `MaxProcs = 2`), whose graph and
 * covering suite are committed.
 */

import { createActor, createCallbackLogic } from 'xstate';
import type { Actor, AnyEventObject } from 'xstate';
import { canonicalJson } from '@taucad/formal/graph';
import type { SpecView } from '@taucad/formal/graph';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors, recordTransitions, validated } from '@taucad/xstate-testing/inspect';

import type { acpSessionMachine } from '#acp/acp-session.machine.js';
import { acpSessionsIgnoredEvents, acpSessionsMachine } from '#acp/acp-sessions.machine.js';
import type { AcpAcquire, AcpSessionsInput, AcpSlot } from '#acp/acp-sessions.machine.js';
import type { AcpAdapter } from '#acp/registry.js';

/** `AcpSessions.export.cfg`'s scope. */
const keys = ['a', 'b'] as const;
const maxProcs = 2;
const runs = 1;

/* Every capability expires here; an acquire's `at` places the key's process in its spec bucket. */
const expiresAt = 100_000;

const cancelled = { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED', message: 'cancelled' } } as const;

/** The parent's input: a limit of one, as the spec's. */
export const acpSessionsInput: AcpSessionsInput = { limit: 1, idleTimeout: 60_000, renewalMargin: 1000 };

const adapter: AcpAdapter = {
  id: 'fake',
  displayName: 'Fake',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: '/nonexistent',
};

type Cap = 'fresh' | 'margin' | 'expired';
type Proc = { key: string; st: 'unused' | 'open' | 'closing' | 'closed'; cap: Cap; bound: boolean; soft: boolean };
/* `queued`: the child holds the lend behind a presentation write (`idle.persisting`). */
type Run = { key: string; requestId?: string; phase: 'queued' | 'prompting' | 'cancelling' | 'finishing' };
type Child = { readonly sendBack: (event: AnyEventObject) => void; opened: boolean };

/** One live parent over stub children, with the adapter's process and run records. */
export type AcpSessionsHarness = {
  readonly actor: Actor<typeof acpSessionsMachine>;
  readonly emitted: readonly AnyEventObject[];
  readonly records: ReturnType<typeof recordTransitions>['records'];
  readonly children: Map<string, Child>;
  readonly procs: Proc[];
  readonly pidOf: Map<string, number>;
  readonly runs: Run[];
  next: number;
  sequence: number;
};

const implKey = (key: string): string => `fake:${key}`;
const unused = (): Proc => ({ key: keys[0], st: 'unused', cap: 'fresh', bound: false, soft: false });

/* The process a key's child stands for (spec pids are 1-based; 0 is none). */
const procOf = (harness: AcpSessionsHarness, key: string): Proc | undefined => {
  const pid = harness.pidOf.get(key);
  return pid === undefined ? undefined : harness.procs[pid - 1];
};

/* Allocate the next process for `key`, as the spec's `next`. */
const allocate = (harness: AcpSessionsHarness, key: string, proc: Omit<Proc, 'key' | 'soft'>): void => {
  const pid = harness.next;
  harness.next += 1;
  harness.procs[pid - 1] = { key, soft: false, ...proc };
  harness.pidOf.set(key, pid);
};

/* A stub child reports to the parent. */
const report = (harness: AcpSessionsHarness, key: string, event: AnyEventObject): void => {
  const child = harness.children.get(key);
  if (child === undefined) {
    throw new Error(`No live child for ${key} to send ${event.type}.`);
  }
  child.sendBack(event);
};

const slotsOf = (harness: AcpSessionsHarness): Readonly<Record<string, AcpSlot>> =>
  (harness.actor.getSnapshot() as { context: { slots: Record<string, AcpSlot> } }).context.slots;

/*
 * The parent's scheduled `idle:<key>` raises.
 * ponytail: reads alpha.59's system scheduler (`${sessionId}.${id}` keys); switch when xstate exposes pending timers.
 */
const armedIdle = (harness: AcpSessionsHarness): Set<string> => {
  const system = harness.actor.system as unknown as { _snapshot?: { _scheduledTimers?: Record<string, unknown> } };
  const ids = Object.keys(system._snapshot?._scheduledTimers ?? {});
  return new Set(keys.filter((key) => ids.some((id) => id.endsWith(`.idle:${implKey(key)}`))));
};

const settled = (harness: AcpSessionsHarness, requestId: string | undefined): boolean =>
  requestId === undefined ||
  harness.emitted.some(
    (event) => (event.type === 'turnSettled' || event.type === 'refused') && event['requestId'] === requestId,
  );

/* The spec's slot state for each parent slot status: opening and lent are busy, resting is idle. */
const entState: Readonly<Record<AcpSlot['status'], string>> = {
  opening: 'busy',
  lent: 'busy',
  resting: 'idle',
  closing: 'closing',
};

/** The refinement mapping: the spec fields the harness stands for. */
export const viewOf = (harness: AcpSessionsHarness): SpecView => {
  const slots = slotsOf(harness);
  const timers = armedIdle(harness);
  const ent = Object.fromEntries(
    keys.map((key) => {
      const slot = slots[implKey(key)];
      /* An opening slot has no process yet. */
      const pid = slot === undefined || slot.status === 'opening' ? 0 : (harness.pidOf.get(key) ?? 0);
      return [key, { pid, st: slot === undefined ? 'none' : entState[slot.status] }];
    }),
  );
  const run = harness.runs.map((entry) => {
    const slot = slots[implKey(entry.key)];
    const pid = harness.pidOf.get(entry.key) ?? 0;
    const at = (pc: string, where = pid) => ({ key: entry.key, pc, pid: where, cx: false });
    if (settled(harness, entry.requestId)) {
      return at('free', 0);
    }
    if (slot?.status === 'closing' && slot.queued?.requestId === entry.requestId) {
      return at('waitClose');
    }
    if (slot?.status === 'opening' && slot.requestId === entry.requestId) {
      return at('opening', 0);
    }
    if (slot?.status === 'lent' && slot.requestId === entry.requestId) {
      return at(entry.phase);
    }
    return at('unknown');
  });
  return {
    ent,
    timer: Object.fromEntries(keys.map((key) => [key, timers.has(key)])),
    proc: harness.procs.map((proc) => ({ ...proc })),
    run,
  };
};

/* The `at` that puts the key's process in its spec capability bucket. */
const atFor = (harness: AcpSessionsHarness, key: string): number => {
  switch (procOf(harness, key)?.cap) {
    case 'margin': {
      return expiresAt - acpSessionsInput.renewalMargin / 2;
    }
    case 'expired': {
      return expiresAt + 1;
    }
    default: {
      return 0;
    }
  }
};

const acquireOf = (harness: AcpSessionsHarness, key: string): AcpAcquire => {
  const requestId = `run:${String(harness.sequence++)}`;
  return {
    requestId,
    key: implKey(key),
    chatId: key,
    cwd: '/work',
    at: atFor(harness, key),
    capabilityExpiresAt: expiresAt,
    opening: { adapter, cwd: '/work', mcpServers: [], sessionMessageId: 'm', sessionCommitted: false, notices: true },
    lend: { requestId, prompt: { fresh: [{ type: 'text', text: 'hi' }] } },
  };
};

/** Start the parent over stub children. */
export const startAcpSessions = (): AcpSessionsHarness => {
  const guard = guardActors({ ignore: acpSessionsIgnoredEvents });
  const recorder = recordTransitions();
  const children = new Map<string, Child>();
  /* The harness, once built: the stub children read it when the parent sends them something. */
  const built: { harness?: AcpSessionsHarness } = {};
  /* The parent's sends move the process record: `lend` binds it (unless queued), `close` starts the ladder. */
  const received = (key: string, event: AnyEventObject): void => {
    const self = built.harness!;
    const proc = procOf(self, key);
    const queued = self.runs.find((run) => run.key === key && run.phase === 'queued');
    if (event.type === 'lend' && proc) {
      proc.bound = queued === undefined;
    } else if (event.type === 'cancel' && queued !== undefined) {
      /* A cancelled queued lend: the child ends it resting, before it prompts. */
      report(self, key, {
        type: 'turnEnded',
        key: implKey(key),
        requestId: queued.requestId,
        outcome: cancelled,
        resting: true,
      });
    } else if (event.type === 'close' && proc) {
      proc.st = 'closing';
    } else if (event.type === 'cancel' && children.get(key)?.opened === false) {
      /* A cancelled open: the child answers at once and closes the adapter it spawned. */
      allocate(self, key, { st: 'closing', cap: 'fresh', bound: false });
      const requestId = (slotsOf(self)[implKey(key)] as { requestId?: string } | undefined)?.requestId ?? '';
      report(self, key, {
        type: 'turnEnded',
        key: implKey(key),
        requestId,
        outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED', message: 'cancelled' } },
        resting: false,
      });
    }
  };
  const child = createCallbackLogic<AnyEventObject, { key: string }>(({ input, sendBack, receive }) => {
    const key = input.key.replace(/^fake:/u, '');
    const entry: Child = { sendBack, opened: false };
    children.set(key, entry);
    receive((event) => {
      received(key, event);
    });
    return () => {
      if (children.get(key) === entry) {
        children.delete(key);
      }
    };
  });
  const clock = new StepClock();
  /* A stub child fits the slot `setup` typed as the child machine (provide slots are invariant, k9). */
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  const actor = createActor(
    validated(acpSessionsMachine.provide({ actors: { acpSession: child as unknown as typeof acpSessionMachine } })),
    {
      input: acpSessionsInput,
      clock,
      inspect: (event) => {
        guard.inspect(event);
        recorder.inspect(event);
      },
    },
  );
  const emitted = recordEmitted(actor);
  const harness: AcpSessionsHarness = {
    actor,
    emitted,
    records: recorder.records,
    children,
    procs: Array.from({ length: maxProcs }, unused),
    pidOf: new Map(),
    runs: Array.from({ length: runs }, (): Run => ({ key: keys[0], phase: 'prompting' })),
    next: 1,
    sequence: 0,
  };
  built.harness = harness;
  actor.start();
  return harness;
};

/** One spec action with its parameters: a run index, a key, or a process index (0-based). */
export type AcpOp = Readonly<{ act: string; r?: number; key?: string; p?: number; cap?: Cap; queued?: boolean }>;

type RunView = { key: string; pc: string };

/* The parameters of a spec step, found by comparing the harness's view with the step's target state. */
const resolve = (current: SpecView, act: string, target: SpecView): AcpOp => {
  const before = current['run'] as RunView[];
  const after = target['run'] as RunView[];
  const run = (from?: string): number => {
    const index = before.findIndex(
      (entry, at) => (from === undefined || entry.pc === from) && after[at]?.pc !== entry.pc,
    );
    if (index === -1) {
      throw new Error(`No run moves for ${act}.`);
    }
    return index;
  };
  const proc = (changed: (was: Proc, is: Proc) => boolean): number => {
    const procs = target['proc'] as Proc[];
    const index = (current['proc'] as Proc[]).findIndex((was, at) => changed(was, procs[at]!));
    if (index === -1) {
      throw new Error(`No process moves for ${act}.`);
    }
    return index;
  };
  const slot = (): string => {
    const was = current['ent'] as Record<string, unknown>;
    const is = target['ent'] as Record<string, unknown>;
    const key = keys.find((candidate) => canonicalJson(was[candidate]) !== canonicalJson(is[candidate]));
    if (key === undefined) {
      throw new Error(`No slot moves for ${act}.`);
    }
    return key;
  };
  switch (act) {
    case 'Acquire': {
      const r = run('free');
      return { act, r, key: after[r]!.key, queued: after[r]!.pc === 'queued' };
    }
    case 'Opened': {
      return { act, r: run('opening') };
    }
    case 'Dequeued': {
      return { act, r: run('queued') };
    }
    case 'CancelQueued': {
      return { act, r: run('waitClose') };
    }
    case 'PromptAnswered': {
      return { act, r: run('prompting') };
    }
    case 'TurnEnded': {
      return { act, r: run('finishing') };
    }
    case 'Cancel': {
      return { act, r: run() };
    }
    case 'CancelSettled':
    case 'CancelTimedOut': {
      return { act, r: run('cancelling') };
    }
    case 'Tick': {
      const p = proc((was, is) => was.cap !== is.cap);
      return { act, p, cap: (target['proc'] as Proc[])[p]!.cap };
    }
    case 'AdapterExited': {
      return { act, p: proc((was, is) => was.st === 'closing' && is.st === 'closed') };
    }
    case 'IdleExpired':
    case 'CloseChat': {
      return { act, key: slot() };
    }
    default: {
      throw new Error(`Unknown AcpSessions action ${act}.`);
    }
  }
};

/** Perform one spec action on the harness: the facade's call, a child's report, or the environment. */
export const perform = (harness: AcpSessionsHarness, op: AcpOp): void => {
  const { actor } = harness;
  const run = harness.runs[op.r ?? 0]!;
  switch (op.act) {
    case 'Acquire': {
      const key = op.key!;
      const acquire = acquireOf(harness, key);
      harness.runs[op.r!] = { key, requestId: acquire.requestId, phase: op.queued === true ? 'queued' : 'prompting' };
      actor.send({ type: 'acquire', acquire });
      return;
    }
    case 'Dequeued': {
      /* The write landed: the child lends the queued turn, which binds and prompts. */
      run.phase = 'prompting';
      procOf(harness, run.key)!.bound = true;
      return;
    }
    case 'Opened': {
      allocate(harness, run.key, { st: 'open', cap: 'fresh', bound: true });
      harness.children.get(run.key)!.opened = true;
      run.phase = 'prompting';
      report(harness, run.key, { type: 'opened', key: implKey(run.key) });
      return;
    }
    case 'PromptAnswered':
    case 'CancelSettled': {
      run.phase = 'finishing';
      return;
    }
    case 'TurnEnded': {
      procOf(harness, run.key)!.bound = false;
      report(harness, run.key, {
        type: 'turnEnded',
        key: implKey(run.key),
        requestId: run.requestId,
        outcome: { ok: true, stopReason: 'end_turn' },
        resting: true,
      });
      return;
    }
    case 'Cancel': {
      if (harness.children.get(run.key)?.opened === true && run.phase !== 'queued') {
        run.phase = 'cancelling';
      }
      actor.send({ type: 'cancel', requestId: run.requestId ?? '' });
      return;
    }
    case 'CancelQueued': {
      actor.send({ type: 'cancel', requestId: run.requestId ?? '' });
      return;
    }
    case 'CancelTimedOut': {
      const proc = procOf(harness, run.key)!;
      /* The ladder killed the group: `closed` reports the deferred turn, then the close. */
      report(harness, run.key, {
        type: 'turnEnded',
        key: implKey(run.key),
        requestId: run.requestId,
        outcome: cancelled,
        resting: false,
      });
      proc.st = 'closed';
      proc.bound = false;
      report(harness, run.key, { type: 'closed', key: implKey(run.key), failure: undefined });
      return;
    }
    case 'Tick': {
      harness.procs[op.p!]!.cap = op.cap!;
      return;
    }
    case 'AdapterExited': {
      const proc = harness.procs[op.p!]!;
      proc.st = 'closed';
      proc.bound = false;
      report(harness, proc.key, { type: 'closed', key: implKey(proc.key), failure: undefined });
      return;
    }
    case 'IdleExpired': {
      /* The delayed raise, delivered: `idle:<key>` fires in any order the spec allows. */
      actor.send({ type: 'idleExpired', key: implKey(op.key!) });
      return;
    }
    case 'CloseChat': {
      actor.send({ type: 'closeChat', requestId: `close:${String(harness.sequence++)}`, chatId: op.key! });
      return;
    }
    default: {
      throw new Error(`Unknown AcpSessions action ${op.act}.`);
    }
  }
};

/**
 * The actions the facade, the children and the environment may take next (the backward walk's
 * inputs). Only their own preconditions are read; what the parent does with them is what the walk checks.
 */
export const enabledOps = (harness: AcpSessionsHarness): AcpOp[] => {
  const view = viewOf(harness);
  const procs = view['proc'] as Proc[];
  const ent = view['ent'] as Record<string, { st: string }>;
  const timer = view['timer'] as Record<string, boolean>;
  const room = harness.next <= maxProcs;
  const ops: AcpOp[] = [];
  for (const [r, run] of (view['run'] as RunView[]).entries()) {
    const at = (act: string): void => {
      ops.push({ act, r });
    };
    switch (run.pc) {
      case 'free': {
        ops.push(...keys.map((key) => ({ act: 'Acquire', r, key })));
        /* A resting child with a fresh capability may be mid-write: the lend queues. */
        for (const key of keys) {
          if (ent[key]?.st === 'idle' && procOf(harness, key)?.cap === 'fresh') {
            ops.push({ act: 'Acquire', r, key, queued: true });
          }
        }
        break;
      }
      case 'queued': {
        at('Dequeued');
        at('Cancel');
        break;
      }
      case 'waitClose': {
        /* The facade cancels; otherwise it moves when its process exits. */
        at('CancelQueued');
        break;
      }
      case 'opening': {
        if (room) {
          at('Opened');
          at('Cancel');
        }
        break;
      }
      case 'prompting': {
        at('PromptAnswered');
        at('Cancel');
        break;
      }
      case 'cancelling': {
        at('CancelSettled');
        at('CancelTimedOut');
        break;
      }
      case 'finishing': {
        at('TurnEnded');
        break;
      }
      default:
    }
  }
  for (const [p, proc] of procs.entries()) {
    if (proc.st === 'open' && proc.cap !== 'expired') {
      ops.push({ act: 'Tick', p, cap: proc.cap === 'fresh' ? 'margin' : 'expired' });
    }
    if (proc.st === 'closing') {
      ops.push({ act: 'AdapterExited', p });
    }
  }
  const active = new Set((view['run'] as RunView[]).filter((run) => run.pc !== 'free').map((run) => run.key));
  for (const key of keys) {
    if (timer[key] === true) {
      ops.push({ act: 'IdleExpired', key });
    }
    /* W7 closes a chat only once its run settled. */
    if (!active.has(key)) {
      ops.push({ act: 'CloseChat', key });
    }
  }
  return ops;
};

/** Perform one spec step, `[act, targetState]`, then let effects settle. */
export const applyAction = async (harness: AcpSessionsHarness, act: string, target: SpecView): Promise<void> => {
  perform(harness, resolve(viewOf(harness), act, target));
  await flush();
};

/** Forward replay over the parent (EA-S7). */
export const acpSessionsAdapter: ConformanceAdapter<AcpSessionsHarness> = {
  start: startAcpSessions,
  apply: async (harness, [act, target]) => applyAction(harness, String(act), target as SpecView),
  view: viewOf,
  stop: (harness) => {
    harness.actor.stop();
  },
};
