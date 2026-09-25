/*
 * Conformance of `turn.machine` to `specs/turn/TurnProtocol.tla` (formal-verification policy):
 * forward replay of the TLC-exported covering suite, the backward walk of every shortest
 * implementation path through the spec graph, and the drift manifest (FM-A8, FM-A9).
 */

import path from 'node:path';

import { getNextTransitions, initialTransition, transition } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { pathTable } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineAlphabet } from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours, walkPaths } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView, WalkPath } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import { readFileSync } from 'node:fs';

import { turnMachine } from '#turn.machine.js';
import type { TurnMachineEvent, TurnMachineInput } from '#turn.machine.js';
import {
  abstractTurn,
  adoptedTurnInput,
  sampleTurnEvents,
  turnAdapter,
  turnInput,
} from '#test/conformance/turn-adapter.js';

const specs = path.resolve(import.meta.dirname, '../specs/turn');
const graph = readSpecGraph(path.join(specs, 'TurnProtocol/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'TurnProtocol/suite.json'), 'utf8')) as CoveringSuite;
/* Nightly: `formal nightly` writes TLC-simulated behaviours from a fresh seed here (FM-A11). */
const simulated = process.env['FORMAL_SIMULATED'];

const events = (snapshot: AnyMachineSnapshot): AnyEventObject[] =>
  (getNextTransitions(snapshot) as unknown as Array<{ eventType: string; matches?: Record<string, unknown> }>)
    .filter((transition) => transition.eventType !== '')
    .flatMap((transition) =>
      sampleTurnEvents(transition.eventType, transition.matches ?? {}, snapshot).map((sample) => sample.event),
    );

type Path = Readonly<{ events: readonly AnyEventObject[]; snapshots: readonly AnyMachineSnapshot[] }>;

/*
 * A child's done or error event names the session of the actor system the graph enumerated; the fold
 * starts its own system, so the event is re-addressed to the folded snapshot's child of that id.
 */
const rebind = (snapshot: AnyMachineSnapshot, event: AnyEventObject): AnyEventObject => {
  const { actorId, sessionId } = event as { actorId?: unknown; sessionId?: unknown };
  const child =
    typeof actorId === 'string'
      ? (snapshot.children as Record<string, { sessionId: string } | undefined>)[actorId]
      : undefined;
  return typeof sessionId === 'string' && child ? { ...event, sessionId: child.sessionId } : event;
};

/* Each shortest path (W2's `pathTable`), with the snapshots its events fold to from the initial one. */
const pathsFrom = (input: TurnMachineInput): Path[] =>
  pathTable(turnMachine, {
    input,
    events,
    limit: 100_000,
    /* The abstract state: the cut sequence and refusal count grow without bound, and the spec reads neither. */
    serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(abstractTurn(snapshot)),
  }).map((row) => {
    const [initial] = initialTransition(turnMachine, input);
    const snapshots = [initial];
    for (const event of row.events) {
      const previous = snapshots.at(-1)!;
      snapshots.push(transition(turnMachine, previous, rebind(previous, event) as TurnMachineEvent)[0]);
    }
    return { events: row.events, snapshots };
  });

/* The spec's two initial states: a fresh attempt and one adopted from a lease record (RM-R14). */
const shortestPaths = (): Path[] => [...pathsFrom(turnInput), ...pathsFrom(adoptedTurnInput)];

/* The behaviours that start adopted replay on an adopted actor. */
const adopted = (behaviour: readonly SpecView[]): boolean =>
  (behaviour[0]?.['turn'] as Record<string, unknown> | undefined)?.['phase'] === 'adopting';

const replay = async (behaviours: ReadonlyArray<readonly SpecView[]>) => [
  ...(await replaySuite(
    behaviours.filter((behaviour) => !adopted(behaviour)),
    turnAdapter(turnMachine),
    (state) => state['act'] as unknown[],
  )),
  ...(await replaySuite(
    behaviours.filter((behaviour) => adopted(behaviour)),
    turnAdapter(turnMachine, adoptedTurnInput),
    (state) => state['act'] as unknown[],
  )),
];

/* An implementation path in the spec's vocabulary. */
const asWalk = (path: Path): WalkPath => ({
  initial: { turn: abstractTurn(path.snapshots[0]!) },
  steps: path.events.map((event, index) => ({
    action: String(event['label']),
    view: { turn: abstractTurn(path.snapshots[index + 1]!) },
  })),
});

describe('turn.machine conforms to TurnProtocol.tla', () => {
  it('should replay the covering suite without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite);

    expect(behaviours).toHaveLength(77);
    expect(await replay(behaviours)).toEqual([]);
  });

  it.runIf(simulated !== undefined)(
    'should replay the simulated behaviours without divergence',
    async () => {
      const behaviours = readFileSync(path.join(simulated ?? '', 'TurnProtocol.ndjson'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as SpecView[]);

      const divergences = await replay(behaviours);

      expect(behaviours.length).toBeGreaterThan(0);
      expect(divergences.slice(0, 3)).toEqual([]);
    },
    120_000,
  );

  it('should walk every shortest implementation path through the spec graph without rejection', () => {
    const paths = shortestPaths();

    expect(paths).toHaveLength(1290);
    expect(
      walkPaths(
        graph,
        paths.map((path) => asWalk(path)),
      ),
    ).toEqual([]);
  });

  it('should reach all 1,290 abstract states', () => {
    const states = new Set(
      shortestPaths().flatMap((path) => path.snapshots.map((snapshot) => JSON.stringify(abstractTurn(snapshot)))),
    );

    expect(states.size).toBe(1290);
  });

  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'TurnProtocol/drift.json'), {
        alphabet: machineAlphabet([turnMachine]),
        tables: {},
        specs: hashFiles(specs, ['TurnProtocol.tla']),
      }),
    ).toEqual([]);
  });
});
