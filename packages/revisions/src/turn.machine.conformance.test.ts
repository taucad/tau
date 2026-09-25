/*
 * Conformance of `turn.machine` to `specs/turn/TurnProtocol.tla` (formal-verification policy):
 * forward replay of the TLC-exported covering suite, the backward walk of every shortest
 * implementation path through the spec graph, and the drift manifest (FM-A8, FM-A9).
 */

import path from 'node:path';

import { getNextTransitions } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineAlphabet } from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours, walkPaths } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView, WalkPath } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import { readFileSync } from 'node:fs';

import { turnMachine } from '#turn.machine.js';
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

type Path = Readonly<{ steps: ReadonlyArray<Readonly<{ state: AnyMachineSnapshot; event: AnyEventObject }>> }>;

/* Stand-in for W2's `pathTable` (@taucad/xstate-testing/paths, MC-S1): shortest paths with full events and snapshots. */
const shortestPaths = (): Path[] =>
  getShortestPaths(turnMachine, { input: turnInput, events } as unknown as Parameters<
    typeof getShortestPaths
  >[1]) as unknown as Path[];

/* An implementation path in the spec's vocabulary: steps[0] is `@xstate.init` (T17). */
const asWalk = (path: Path): WalkPath => ({
  initial: { turn: abstractTurn(path.steps[0]!.state) },
  steps: path.steps
    .slice(1)
    .map((step) => ({ action: String(step.event['label']), view: { turn: abstractTurn(step.state) } })),
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
      shortestPaths().flatMap((path) => path.steps.map((step) => JSON.stringify(abstractTurn(step.state)))),
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
