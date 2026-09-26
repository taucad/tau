/*
 * Conformance of `projectHostMachine` to `specs/AttachGeneration.tla` (W6.f1, I31): forward replay of the
 * TLC-exported covering suite through the adapter, replay equality over the recorded transitions (MC-R6), the
 * backward walk of every implementation path through the spec graph, and the drift manifest (FM-R13). Scope and
 * what the adapter leaves to the unit tests: `test/attach-generation.adapter.ts`.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { canonicalJson, readSpecGraph, suiteBehaviours, walkPaths } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView, WalkPath } from '@taucad/formal/graph';
import { replayEquality, replaySuite } from '@taucad/formal/replay';

import { projectHostMachine } from '#project-host.machine.js';
import {
  attachGenerationAdapter,
  enabledOps,
  perform,
  projectHostInput,
  recordsOf,
  startAttachGeneration,
  viewOf,
} from '#test/attach-generation.adapter.js';
import type { AttachOp } from '#test/attach-generation.adapter.js';

const specs = path.resolve(import.meta.dirname, '../specs');
const graph = readSpecGraph(path.join(specs, 'AttachGeneration/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'AttachGeneration/suite.json'), 'utf8')) as CoveringSuite;
const behaviours = suiteBehaviours(graph, suite);

type Step = WalkPath['steps'][number];

/*
 * Every distinct view main, the message queue and the effects can drive the machine into, breadth first, each with
 * the shortest path that reaches it. A step that leaves the view unchanged stutters and is not a spec step.
 */
const implementationPaths = (): WalkPath[] => {
  const replayed = (ops: readonly AttachOp[]) => {
    const harness = startAttachGeneration();
    for (const op of ops) {
      perform(harness, op);
    }
    return harness;
  };
  const initialHarness = replayed([]);
  const initial = viewOf(initialHarness);
  attachGenerationAdapter.stop?.(initialHarness);
  const seen = new Set([canonicalJson(initial)]);
  const paths: WalkPath[] = [];
  let frontier: Array<{ ops: readonly AttachOp[]; steps: readonly Step[]; view: SpecView }> = [
    { ops: [], steps: [], view: initial },
  ];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const harness = replayed(node.ops);
      const ops = enabledOps(harness);
      attachGenerationAdapter.stop?.(harness);
      for (const op of ops) {
        const after = replayed([...node.ops, op]);
        const view = viewOf(after);
        attachGenerationAdapter.stop?.(after);
        const key = canonicalJson(view);
        if (key === canonicalJson(node.view) || seen.has(key)) {
          continue;
        }
        seen.add(key);
        /* The graph labels an edge with `act` as TLC prints it: a quoted string. */
        const step = { action: JSON.stringify(op.act), view };
        const reached = { ops: [...node.ops, op], steps: [...node.steps, step], view };
        paths.push({ initial, steps: reached.steps });
        next.push(reached);
      }
    }
    frontier = next;
  }
  return paths;
};

/* A spec state as the adapter's view projects it: the ghosts and the step label are unchecked. */
const unchecked: ReadonlySet<string> = new Set(['act', 'lEp', 'boundEp', 'bad', 'uRel']);
const projected = (view: SpecView): string =>
  canonicalJson(Object.fromEntries(Object.entries(view).filter(([field]) => !unchecked.has(field))));

describe('projectHostMachine conforms to AttachGeneration.tla', () => {
  it('replays the TLC covering suite through the adapter', async () => {
    expect(behaviours).toHaveLength(suite.behaviours.length);
    expect(await replaySuite(behaviours, attachGenerationAdapter, (state) => [state['act'], state])).toEqual([]);
  });

  it('replays recorded transitions equally', async () => {
    const divergences = [];
    for (const behaviour of behaviours) {
      const harness = attachGenerationAdapter.start();
      for (const state of behaviour.slice(1)) {
        // oxlint-disable-next-line no-await-in-loop -- each step settles before the next.
        await attachGenerationAdapter.apply(harness, [state['act'], state]);
      }
      for (const records of recordsOf(harness)) {
        /* One machine and no children: every record is the actor's own. */
        divergences.push(...replayEquality(projectHostMachine, projectHostInput, records));
      }
      attachGenerationAdapter.stop?.(harness);
    }
    expect(divergences).toEqual([]);
  });

  it('walks every implementation path through the spec graph without rejection', () => {
    const paths = implementationPaths();
    const specStates = new Set(graph.views.map((view) => projected(view)));
    const reached = new Set(paths.map((walked) => canonicalJson(walked.steps.at(-1)!.view)));

    expect(walkPaths(graph, paths).slice(0, 3)).toEqual([]);
    /* And the other way: with `Init`, the machine and main reach every state of the spec's projection. */
    expect(reached.size + 1).toBe(specStates.size);
  }, 120_000);

  it('matches the committed drift manifest', () => {
    const machines = [projectHostMachine];
    expect(
      driftManifestProblems(path.join(specs, 'AttachGeneration/drift.json'), {
        alphabet: machineAlphabet(machines),
        versions: Object.fromEntries(machines.map((machine) => [machine.id, String(machine.version)])),
        tables: {},
        actions: machineActions(machines),
        specs: hashFiles(specs, ['AttachGeneration.tla']),
      }),
    ).toEqual([]);
  });
});
