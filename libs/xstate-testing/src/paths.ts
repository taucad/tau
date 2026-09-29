/**
 * Audience: owner-machine tests (MC-R17, MC-R20, MC-R23) and W1's enumeration
 * bridge. Totality, reachability and path tables by enumeration over
 * `xstate/graph`, and a check that a fold ignores foreign events.
 *
 * @packageDocumentation
 */

import { initialTransition, transition } from 'xstate';
import type { AnyActorLogic, AnyEventObject, AnyMachineSnapshot, AnyStateMachine, Snapshot, StateValue } from 'xstate';
import { getShortestPaths, getStateNodes } from 'xstate/graph';
import type { StatePath } from 'xstate/graph';

import { isIgnoredPair } from '#inspect.js';
import type { IgnoredPairs } from '#inspect.js';

/** Traversal options every enumeration states explicitly (N22). @public */
export type PathOptions = Readonly<{
  /** The machine's input. */
  input?: unknown;
  /** The sampled events, or the events to sample at one snapshot. */
  events: readonly AnyEventObject[] | ((snapshot: AnyMachineSnapshot) => readonly AnyEventObject[]);
  /** The traversal bound; the stated limit of every totality claim. */
  limit: number;
  /** The state projection: two snapshots with one serialization are one vertex. */
  serializeState: (snapshot: AnyMachineSnapshot) => string;
}>;

/** One reachable state and the shortest events that reach it from the initial snapshot. @public */
export type PathRow = Readonly<{ state: StateValue; events: readonly AnyEventObject[] }>;

/** A sampled public event that a reachable active snapshot neither takes nor ignores. @public */
export type UnansweredEvent = Readonly<{ state: StateValue; eventType: string }>;

/** A foreign event that changed a fold. @public */
export type FoldChange = Readonly<{ eventType: string; change: 'status' | 'context' | 'effects' | 'threw' }>;

const isBuiltIn = (type: string): boolean => type.startsWith('xstate.') || type.startsWith('@xstate.');

const shortestPaths = (
  machine: AnyStateMachine,
  options: PathOptions,
): Array<StatePath<AnyMachineSnapshot, AnyEventObject>> =>
  // oxlint-disable-next-line typescript-eslint/no-unsafe-return -- `AnyStateMachine` erases the snapshot type to `any`.
  getShortestPaths(machine, {
    input: options.input,
    events: options.events,
    limit: options.limit,
    // The graph keeps the last snapshot per vertex: without the status, an errored
    // snapshot would replace the active one it shares a projection with.
    serializeState: (snapshot: AnyMachineSnapshot) => `${snapshot.status}:${options.serializeState(snapshot)}`,
  });

const reachable = (machine: AnyStateMachine, options: PathOptions): AnyMachineSnapshot[] =>
  shortestPaths(machine, options).map((path) => path.state);

const sampleAt = (options: PathOptions, snapshot: AnyMachineSnapshot): readonly AnyEventObject[] =>
  typeof options.events === 'function' ? options.events(snapshot) : options.events;

/**
 * The shortest path to each reachable state, with full events and without the
 * `@xstate.init` step (T17). W1's `walkPaths` reads these rows.
 *
 * @param machine - The owner machine.
 * @param options - The traversal options.
 * @returns One row per reachable state.
 * @public
 */
export const pathTable = (machine: AnyStateMachine, options: PathOptions): PathRow[] =>
  shortestPaths(machine, options).map((path) => ({
    state: path.state.value as StateValue,
    events: path.steps.map((step) => step.event).filter((event) => event.type !== '@xstate.init'),
  }));

/**
 * Every (reachable active snapshot, sampled public event) pair where `can()` is
 * false and no ignore pair covers it (MC-R17). A final snapshot is skipped: a done
 * actor dead-letters every event, which `guardActors` reports. Built-in `xstate.*`
 * samples are never public. `can()` reads a static targetless `{}` as refused, so an
 * answered no-op is a transition function returning `{}`.
 *
 * @param machine - The owner machine.
 * @param options - The traversal options and the machine's declared ignore pairs.
 * @returns The unanswered pairs; empty for a total machine.
 * @public
 */
export const unansweredEvents = (
  machine: AnyStateMachine,
  options: PathOptions & Readonly<{ ignore?: IgnoredPairs }>,
): UnansweredEvent[] => {
  const found = new Map<string, UnansweredEvent>();
  for (const snapshot of reachable(machine, options)) {
    if (snapshot.status !== 'active') {
      continue;
    }
    for (const event of sampleAt(options, snapshot)) {
      /* One row per (state value, event type), however many vertices the projection splits it into. */
      const key = JSON.stringify([snapshot.value, event.type]);
      if (isBuiltIn(event.type) || found.has(key) || snapshot.can(event)) {
        continue;
      }
      if (!isIgnoredPair(options.ignore, snapshot, event.type)) {
        found.set(key, { state: snapshot.value as StateValue, eventType: event.type });
      }
    }
  }
  return [...found.values()];
};

/**
 * Ids of state nodes that no enumerated path reaches. Choice and history nodes
 * are never active and are excluded. Sample `{ type: 'xstate.error.execution' }`
 * to reach a state entered only through a root `onError`.
 *
 * @param machine - The owner machine.
 * @param options - The traversal options.
 * @returns The unreached state node ids; empty when every state is reached.
 * @public
 */
export const unreachedStates = (machine: AnyStateMachine, options: PathOptions): string[] => {
  const snapshots = reachable(machine, options);
  return getStateNodes(machine.root)
    .filter((node) => node.type !== 'choice' && node.type !== 'history')
    .filter((node) => !snapshots.some((snapshot) => snapshot.matches(node.path.join('.'))))
    .map((node) => node.id);
};

const foreignDefaults: readonly AnyEventObject[] = [
  { type: '@xstate.init' },
  { type: 'xstate.harness.foreign' },
  { type: 'harness.foreign' },
];

/**
 * Prove that a fold ignores every event but its input (MC-R20): for each snapshot
 * and foreign event, pure `transition` must keep `status` and the `context`
 * object, return no effects and not throw. Snapshot identity is not compared,
 * because `transition` returns a new snapshot even for an ignored event.
 *
 * @param logic - The fold.
 * @param options - `input` for the initial snapshot; `snapshots` and `events` override the defaults
 *   (the initial snapshot; `@xstate.init`, an unknown `xstate.*` type and an unknown type).
 * @returns The changes found; empty for a well-behaved fold.
 * @public
 */
export const foreignEventChanges = (
  logic: AnyActorLogic,
  options: Readonly<{
    input?: unknown;
    snapshots?: ReadonlyArray<Snapshot<unknown>>;
    events?: readonly AnyEventObject[];
  }> = {},
): FoldChange[] => {
  const snapshots = options.snapshots ?? [initialTransition(logic, options.input)[0]];
  const changes: FoldChange[] = [];
  for (const snapshot of snapshots) {
    for (const event of options.events ?? foreignDefaults) {
      const before = snapshot as Readonly<{ status: string; context?: unknown }>;
      let result: readonly [Readonly<{ status: string; context?: unknown }>, readonly unknown[]];
      try {
        result = transition(logic, snapshot, event) as typeof result;
      } catch {
        changes.push({ eventType: event.type, change: 'threw' });
        continue;
      }
      const [next, effects] = result;
      if (next.status !== before.status) {
        changes.push({ eventType: event.type, change: 'status' });
      } else if (next.context !== before.context) {
        changes.push({ eventType: event.type, change: 'context' });
      } else if (effects.length > 0) {
        changes.push({ eventType: event.type, change: 'effects' });
      }
    }
  }
  return changes;
};
