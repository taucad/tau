/**
 * The conformance adapter between `projectHostMachine` and `specs/AttachGeneration.tla` (W6.f1, I31).
 *
 * The harness is main's side of the spec, played by the adapter, over the real utility-side machine with
 * recording effects. Main's actions (`Retain`, `Release`, `Connect`, `MainFinish`) move the adapter's own
 * records; the utility's actions deliver the head of `msgs` to the machine or finish its effects:
 * - `UConnect`: the head connect is sent as `connect`; a host that is not open (no actor yet, or the last one
 *   closed, as the desktop composition starts a fresh one) opens in the same step, its `opened` sent at once.
 * - `URelStart`: the head release is sent as `release`. When the machine starts a drain, the drain's `quiescent`
 *   is sent in the same step: the spec begins the close at once, and `draining` is not in the spec (RH-Q12).
 *   With no actor, the release is answered at once, as the composition answers it.
 * - `UCloseDone`: the close effect ends (the launcher is `closed`); `UCheck` sends its `closed`.
 *
 * The view is the refinement mapping: main's variables from the adapter; `launcher`, `lGen`, `upc` and `lstate`
 * from the machine's state and effects; `replied` from its `released` answers; `served` from its `serve` effects.
 * The ghosts `lEp`, `boundEp`, `bad` and `uRel` are left unchecked.
 *
 * Scope: `AttachGeneration.export.cfg` (two holders; generations, epochs and launchers up to 3, two messages in flight). A message
 * is delivered only when the spec's utility takes it (FIFO, never during a close); the machine's handling of a
 * connect or release that arrives during a close, of a drain a remount interrupts, and of shutdown are covered by
 * the unit tests, not here.
 */

import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { SpecView } from '@taucad/formal/graph';
import type { ConformanceAdapter, TransitionRecord } from '@taucad/formal/replay';
import { guardActors, recordTransitions, validated } from '@taucad/xstate-testing/inspect';

import { projectHostIgnoredEvents, projectHostMachine } from '#project-host.machine.js';
import type { ProjectHostInput } from '#project-host.machine.js';

/** `AttachGeneration.export.cfg`'s scope. */
const ids = ['a', 'b'] as const;
const maxGen = 3;
const maxEpoch = 3;
const maxL = 3;
const maxMsgs = 2;

/** The machine's input. */
export const projectHostInput: ProjectHostInput = { root: '/home/bracket' };

type Message = { type: 'connect' | 'release'; g: number; ep: number; id: string };

/** One live `projectHost` actor, as the desktop composition keeps one per root. */
type Incarnation = {
  readonly actor: Actor<typeof projectHostMachine>;
  readonly records: () => readonly TransitionRecord[];
  /** The open effect's incarnation, until `opened` answers it. */
  opening?: number;
  /** The drain effect's id, until `quiescent` answers it. */
  draining?: number;
  /** The close effect's incarnation, until `closed` answers it, and whether the close has ended. */
  closing?: Readonly<{ incarnation: number; done: boolean }>;
  /** The spec launcher each opened incarnation stands for, and the last one opened. */
  readonly launchers: Map<number, number>;
  launcher?: number;
};

/** Main's records, the spec's launchers, and the live actor. */
export type AttachGenerationHarness = {
  gen: number;
  readonly holders: Set<string>;
  rel: { active: boolean; g: number; ep: number };
  replied: boolean;
  epoch: number;
  readonly connected: Set<number>;
  readonly msgs: Message[];
  readonly lstate: string[];
  nextL: number;
  readonly served: Set<number>;
  /** Every actor this harness started, in order; the last is live unless it ended. */
  readonly actors: Incarnation[];
  sequence: number;
};

const current = (harness: AttachGenerationHarness): Incarnation | undefined => {
  const last = harness.actors.at(-1);
  return last?.actor.getSnapshot().status === 'active' ? last : undefined;
};

/* The machine's context, read only inside the state that declares each key (MC-R26). */
type Snapshot = ReturnType<Actor<typeof projectHostMachine>['getSnapshot']>;
const contextOf = (snapshot: Snapshot): Readonly<Record<string, unknown>> =>
  snapshot.context as unknown as Readonly<Record<string, unknown>>;

/* The spec launcher the live actor's current incarnation stands for, while it serves or closes. */
const launcherOf = (live: Incarnation | undefined): number => {
  const snapshot = live?.actor.getSnapshot();
  if (snapshot === undefined || !(snapshot.matches('serving') || snapshot.matches('closing'))) {
    return 0;
  }
  return live?.launchers.get(Number(contextOf(snapshot)['incarnation'])) ?? 0;
};

/** The refinement mapping: the spec fields the harness stands for. */
export const viewOf = (harness: AttachGenerationHarness): SpecView => {
  const live = current(harness);
  const snapshot = live?.actor.getSnapshot();
  const lGen =
    snapshot === undefined
      ? 0
      : snapshot.matches('serving') || snapshot.matches('draining')
        ? Number(contextOf(snapshot)['gen'])
        : snapshot.matches('closing')
          ? Number(contextOf(snapshot)['closedGen'])
          : 0;
  const upc = snapshot?.matches('closing') === true ? (live?.closing?.done === true ? 'check' : 'closing') : 'idle';
  return {
    gen: harness.gen,
    holders: [...harness.holders].sort((left, right) => left.localeCompare(right)),
    rel: { ...harness.rel },
    replied: harness.replied,
    epoch: harness.epoch,
    connected: [...harness.connected].sort((left, right) => left - right),
    msgs: harness.msgs.map(({ type, g, ep }) => ({ type, g, ep })),
    lGen,
    launcher: launcherOf(live),
    lstate: [...harness.lstate],
    nextL: harness.nextL,
    upc,
    served: [...harness.served].sort((left, right) => left - right),
  };
};

/* Start a fresh actor, as the desktop composition does on a connect with no live one. */
const startActor = (harness: AttachGenerationHarness): Incarnation => {
  const guard = guardActors({ ignore: projectHostIgnoredEvents });
  const recorder = recordTransitions();
  const built: { incarnation?: Incarnation } = {};
  const messageOf = (id: string): Message | undefined => harness.msgs.find((message) => message.id === id);
  const consume = (id: string): void => {
    const index = harness.msgs.findIndex((message) => message.id === id);
    if (index !== -1) {
      harness.msgs.splice(index, 1);
    }
  };
  const actor = createActor(
    validated(
      projectHostMachine.provide({
        actions: {
          open: ({ incarnation }) => {
            built.incarnation!.opening = incarnation;
          },
          serve: ({ connectionId }) => {
            /* An effect runs inside the step, so the launcher comes from the adapter's record, not the snapshot. */
            const message = messageOf(connectionId);
            const launcher = built.incarnation!.launcher ?? 0;
            if (message !== undefined && launcher !== 0 && harness.lstate[launcher - 1] === 'open') {
              harness.served.add(message.ep);
            }
            consume(connectionId);
          },
          refuse: ({ connectionId }) => {
            consume(connectionId);
          },
          drain: ({ drain }) => {
            built.incarnation!.draining = drain;
          },
          close: ({ incarnation }) => {
            const launcher = built.incarnation!.launchers.get(incarnation) ?? 0;
            if (launcher !== 0) {
              harness.lstate[launcher - 1] = 'closing';
            }
            built.incarnation!.closing = { incarnation, done: false };
          },
        },
      }),
    ),
    {
      input: projectHostInput,
      inspect: (event) => {
        guard.inspect(event);
        recorder.inspect(event);
      },
    },
  );
  built.incarnation = { actor, records: recorder.records, launchers: new Map() };
  /* Any answer to main is main's `replied` (the spec's utility sets it on every answer). */
  actor.on('released', () => {
    harness.replied = true;
  });
  harness.actors.push(built.incarnation);
  actor.start();
  return built.incarnation;
};

/** Start main's side with no actor, as the utility starts. */
export const startAttachGeneration = (): AttachGenerationHarness => ({
  gen: 0,
  holders: new Set(),
  rel: { active: false, g: 0, ep: 0 },
  replied: false,
  epoch: 0,
  connected: new Set(),
  msgs: [],
  lstate: Array.from({ length: maxL }, () => 'unused'),
  nextL: 1,
  served: new Set(),
  actors: [],
  sequence: 0,
});

/** One spec action: main's, or the utility's taking the head message or finishing an effect. */
export type AttachOp = Readonly<{ act: string; id?: string }>;

/* Answer the live incarnation's `open` with `opened`, naming the next spec launcher. */
const open = (harness: AttachGenerationHarness, live: Incarnation): void => {
  const incarnation = live.opening!;
  live.opening = undefined;
  live.launchers.set(incarnation, harness.nextL);
  live.launcher = harness.nextL;
  harness.lstate[harness.nextL - 1] = 'open';
  harness.nextL += 1;
  live.actor.send({ type: 'opened', incarnation });
};

/** Perform one spec action on the harness. */
export const perform = (harness: AttachGenerationHarness, op: AttachOp): void => {
  switch (op.act) {
    case 'Retain': {
      if (harness.holders.size === 0) {
        harness.epoch += 1;
      }
      harness.gen += 1;
      harness.holders.add(op.id!);
      return;
    }
    case 'Connect': {
      harness.msgs.push({ type: 'connect', g: harness.gen, ep: harness.epoch, id: `c${String(harness.sequence++)}` });
      harness.connected.add(harness.epoch);
      return;
    }
    case 'Release': {
      harness.holders.delete(op.id!);
      if (harness.holders.size === 0) {
        harness.rel = { active: true, g: harness.gen, ep: harness.epoch };
        harness.msgs.push({ type: 'release', g: harness.gen, ep: harness.epoch, id: `r${String(harness.sequence++)}` });
        harness.replied = false;
      }
      return;
    }
    case 'MainFinish': {
      harness.rel = { active: false, g: 0, ep: 0 };
      harness.replied = false;
      return;
    }
    case 'UConnect': {
      const message = harness.msgs[0]!;
      const live = current(harness) ?? startActor(harness);
      live.actor.send({ type: 'connect', gen: message.g, connectionId: message.id });
      if (live.opening !== undefined) {
        open(harness, live);
      }
      return;
    }
    case 'URelStart': {
      const message = harness.msgs.shift()!;
      const live = current(harness);
      if (live === undefined) {
        /* No host for the root: the composition answers the release at once. */
        harness.replied = true;
        return;
      }
      live.actor.send({ type: 'release', gen: message.g, requestId: message.id });
      if (live.draining !== undefined) {
        const drain = live.draining;
        live.draining = undefined;
        live.actor.send({ type: 'quiescent', drain });
      }
      return;
    }
    case 'UCloseDone': {
      const live = current(harness)!;
      const launcher = live.launchers.get(live.closing!.incarnation) ?? 0;
      if (launcher !== 0) {
        harness.lstate[launcher - 1] = 'closed';
      }
      live.closing = { ...live.closing!, done: true };
      return;
    }
    case 'UCheck': {
      const live = current(harness)!;
      const { incarnation } = live.closing!;
      live.closing = undefined;
      live.actor.send({ type: 'closed', incarnation, message: null });
      return;
    }
    default: {
      throw new Error(`Unknown AttachGeneration action ${op.act}.`);
    }
  }
};

/* The holder a `Retain` or `Release` step moved, from the step's target state. */
const moved = (harness: AttachGenerationHarness, target: SpecView): string => {
  const after = new Set(target['holders'] as string[]);
  const id = ids.find((candidate) => harness.holders.has(candidate) !== after.has(candidate));
  if (id === undefined) {
    throw new Error('No holder moves.');
  }
  return id;
};

/**
 * The actions main, the message queue and the effects allow next (the walk's inputs): each reads only its own
 * precondition. Delivery is the spec's: the head message, only while no close is in flight.
 */
export const enabledOps = (harness: AttachGenerationHarness): AttachOp[] => {
  const view = viewOf(harness);
  const ops: AttachOp[] = [];
  for (const id of ids) {
    if (harness.gen < maxGen && harness.epoch < maxEpoch && (!harness.holders.has(id) || harness.rel.active)) {
      ops.push({ act: 'Retain', id });
    }
    if (harness.holders.has(id) && !harness.rel.active && harness.msgs.length < maxMsgs) {
      ops.push({ act: 'Release', id });
    }
  }
  if (harness.holders.size > 0 && !harness.connected.has(harness.epoch) && harness.msgs.length < maxMsgs) {
    ops.push({ act: 'Connect' });
  }
  if (harness.rel.active) {
    ops.push({ act: 'MainFinish' });
  }
  const head = harness.msgs[0];
  if (view['upc'] === 'idle' && head?.type === 'connect' && (view['launcher'] !== 0 || harness.nextL <= maxL)) {
    ops.push({ act: 'UConnect' });
  }
  if (view['upc'] === 'idle' && head?.type === 'release') {
    ops.push({ act: 'URelStart' });
  }
  if (view['upc'] === 'closing') {
    ops.push({ act: 'UCloseDone' });
  }
  if (view['upc'] === 'check') {
    ops.push({ act: 'UCheck' });
  }
  return ops;
};

/** Every recorded delivery, per actor, for replay equality. */
export const recordsOf = (harness: AttachGenerationHarness): Array<readonly TransitionRecord[]> =>
  harness.actors.map((incarnation) => incarnation.records());

/** Forward replay over the machine (I31). */
export const attachGenerationAdapter: ConformanceAdapter<AttachGenerationHarness> = {
  start: startAttachGeneration,
  apply: async (harness, [act, target]) => {
    const name = String(act);
    const id = name === 'Retain' || name === 'Release' ? moved(harness, target as SpecView) : undefined;
    perform(harness, { act: name, ...(id === undefined ? {} : { id }) });
  },
  view: viewOf,
  stop: (harness) => {
    for (const { actor } of harness.actors) {
      actor.stop();
    }
  },
};
