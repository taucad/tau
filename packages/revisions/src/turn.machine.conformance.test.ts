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
import type { TurnMachineEvent } from '#turn.machine.js';
import { abstractTurn, sampleTurnEvents, turnAdapter, turnInput } from '#test/conformance/turn-adapter.js';

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
const shortestPaths = (): Path[] =>
  pathTable(turnMachine, {
    input: turnInput,
    events,
    limit: 100_000,
    serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify([snapshot.value, snapshot.context as unknown]),
  }).map((row) => {
    const [initial] = initialTransition(turnMachine, turnInput);
    const snapshots = [initial];
    for (const event of row.events) {
      const previous = snapshots.at(-1)!;
      snapshots.push(transition(turnMachine, previous, rebind(previous, event) as TurnMachineEvent)[0]);
    }
    return { events: row.events, snapshots };
  });

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

    expect(behaviours).toHaveLength(83);
    expect(await replaySuite(behaviours, turnAdapter(turnMachine), (state) => state['act'] as unknown[])).toEqual([]);
  });

  it.runIf(simulated !== undefined)(
    'should replay the simulated behaviours without divergence',
    async () => {
      const behaviours = readFileSync(path.join(simulated ?? '', 'TurnProtocol.ndjson'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as SpecView[]);

      const divergences = await replaySuite(behaviours, turnAdapter(turnMachine), (state) => state['act'] as unknown[]);

      expect(behaviours.length).toBeGreaterThan(0);
      expect(divergences.slice(0, 3)).toEqual([]);
    },
    120_000,
  );

  it('should walk every shortest implementation path through the spec graph without rejection', () => {
    const paths = shortestPaths();

    expect(paths).toHaveLength(294);
    expect(
      walkPaths(
        graph,
        paths.map((path) => asWalk(path)),
      ),
    ).toEqual([]);
  });

  it('should reach all 196 abstract states', () => {
    const states = new Set(
      shortestPaths().flatMap((path) => path.snapshots.map((snapshot) => JSON.stringify(abstractTurn(snapshot)))),
    );

    expect(states.size).toBe(196);
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
