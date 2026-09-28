/**
 * M2's conformance bridges (W6.r1 finding 13, following W7's and W10's): forward replay of the TLC-generated covering
 * suite of `LogLeadershipGraph.tla` over two live M2 actors, the backward walk of every implementation path through
 * the spec graph, replay equality over the recorded transitions (MC-R6), and the drift manifest (FM-R13). The adapter
 * (`test/log-leadership.adapter.ts`) states the refinement mapping and the export's scope.
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { canonicalJson, readSpecGraph, suiteBehaviours, walkPaths } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView, WalkPath } from '@taucad/formal/graph';
import { replayEquality, replaySuite } from '@taucad/formal/replay';

import { leadershipMachine } from '#launchers/leadership/leadership.machine.js';
import {
  enabledOps,
  leadershipInput,
  logLeadershipAdapter,
  perform,
  startLogLeadership,
  viewOf,
  workers,
} from '#launchers/leadership/test/log-leadership.adapter.js';
import type { LogLeadershipOp } from '#launchers/leadership/test/log-leadership.adapter.js';

const specs = path.resolve(import.meta.dirname, '../../../specs');
const graph = readSpecGraph(path.join(specs, 'LogLeadershipGraph/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'LogLeadershipGraph/suite.json'), 'utf8')) as CoveringSuite;
const behaviours = suiteBehaviours(graph, suite);
const simulated = process.env['FORMAL_SIMULATED'];

type Step = WalkPath['steps'][number];

/** The graph's label for an op: `<<name, w>>`, or `<<"Start", w, x>>`, as TLC prints it. */
const labelOf = (op: LogLeadershipOp): string =>
  JSON.stringify(op.x === undefined ? [op.act, op.w] : [op.act, op.w, op.x]);

/*
 * Every distinct state the environment can drive the two M2 actors into, breadth first, each with the shortest path
 * that reaches it, keyed by the view, the fakes' budgets and what each M2 waits on.
 */
const implementationPaths = (): WalkPath[] => {
  const replayed = (ops: readonly LogLeadershipOp[]) => {
    const harness = startLogLeadership();
    for (const op of ops) {
      perform(harness, op);
    }
    return harness;
  };
  const keyOf = (harness: ReturnType<typeof startLogLeadership>): string =>
    canonicalJson({
      view: viewOf(harness),
      budgets: [harness.wants, harness.queues, harness.freezes, harness.live],
      requests: [harness.holder?.worker, [...harness.ifAvailable.keys()], [...harness.queued.keys()]],
      pending: workers.map((worker) => [harness.tabs[worker].view !== undefined, harness.tabs[worker].running.length]),
    });
  const stop = (harness: ReturnType<typeof startLogLeadership>): void => {
    logLeadershipAdapter.stop?.(harness);
  };
  const initialHarness = replayed([]);
  const initial = viewOf(initialHarness);
  const seen = new Set([keyOf(initialHarness)]);
  stop(initialHarness);
  const paths: WalkPath[] = [];
  let frontier: Array<{ ops: readonly LogLeadershipOp[]; steps: readonly Step[]; view: SpecView }> = [
    { ops: [], steps: [], view: initial },
  ];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const harness = replayed(node.ops);
      const ops = enabledOps(harness);
      stop(harness);
      for (const op of ops) {
        const after = replayed([...node.ops, op]);
        const view = viewOf(after);
        const key = keyOf(after);
        stop(after);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const reached = { ops: [...node.ops, op], steps: [...node.steps, { action: labelOf(op), view }], view };
        paths.push({ initial, steps: reached.steps });
        next.push(reached);
      }
    }
    frontier = next;
  }
  return paths;
};

describe('leadershipMachine conforms to LogLeadership.tla', () => {
  it('should replay the TLC covering suite over two tabs without divergence', async () => {
    expect(behaviours).toHaveLength(suite.behaviours.length);
    expect(await replaySuite(behaviours, logLeadershipAdapter, (state) => [state['act'], state])).toEqual([]);
  });

  it.runIf(simulated !== undefined && existsSync(path.join(simulated, 'LogLeadershipGraph.ndjson')))(
    'should replay the simulated behaviours without divergence',
    async () => {
      const traces = readFileSync(path.join(simulated ?? '', 'LogLeadershipGraph.ndjson'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as SpecView[]);

      expect(traces.length).toBeGreaterThan(0);
      expect(await replaySuite(traces, logLeadershipAdapter, (state) => [state['act'], state])).toEqual([]);
    },
    120_000,
  );

  it('should walk every implementation path through the spec graph without rejection', () => {
    const paths = implementationPaths();
    const views = (state: SpecView): string =>
      canonicalJson({ m2: state['m2'], frozen: state['frozen'], want: state['want'], drives: state['drives'] });
    const specViews = new Set(graph.views.map((state) => views(state)));
    const reached = new Set(paths.map((walked) => canonicalJson(walked.steps.at(-1)?.view ?? walked.initial)));

    expect(walkPaths(graph, paths).slice(0, 3)).toEqual([]);
    /* And the other way: the two tabs reach all 51 views of the spec's projection (191 states), `Init` included. */
    expect([...specViews].filter((view) => !reached.has(view) && view !== canonicalJson(paths[0]?.initial))).toEqual(
      [],
    );
    expect(specViews.size).toBe(51);
  }, 120_000);

  it('should replay recorded transitions equally (MC-R6)', async () => {
    const divergences = [];
    for (const behaviour of behaviours) {
      const harness = logLeadershipAdapter.start();
      for (const state of behaviour.slice(1)) {
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next.
        await logLeadershipAdapter.apply(harness, [state['act'], state]);
      }
      for (const worker of workers) {
        divergences.push(...replayEquality(leadershipMachine, leadershipInput(worker), harness.tabs[worker].records()));
      }
      logLeadershipAdapter.stop?.(harness);
    }

    expect(divergences).toEqual([]);
  });

  it('should match the committed drift manifest', () => {
    const machines = [leadershipMachine];
    expect(
      driftManifestProblems(path.join(specs, 'LogLeadershipGraph/drift.json'), {
        alphabet: machineAlphabet(machines),
        versions: Object.fromEntries(machines.map((machine) => [machine.id, String(machine.version)])),
        tables: {},
        actions: machineActions(machines),
        specs: hashFiles(specs, ['LogLeadership.tla', 'LogLeadershipGraph.tla']),
      }),
    ).toEqual([]);
  });
});
