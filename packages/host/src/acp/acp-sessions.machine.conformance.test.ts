/*
 * Conformance of `acpSessionsMachine` to `specs/AcpSessions.tla` (W10 EA-S7): forward replay
 * of the TLC-exported covering suite through the adapter, replay equality over the recorded
 * transitions (MC-R6), and the drift manifest (FM-R13).
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  checkActionCorrespondence,
  driftManifestProblems,
  hashFiles,
  machineActions,
  machineAlphabet,
  specOperators,
} from '@taucad/formal/drift';
import { canonicalJson, readSpecGraph, suiteBehaviours, walkPaths } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView, WalkPath } from '@taucad/formal/graph';
import { replayEquality, replaySuite } from '@taucad/formal/replay';

import { acpSessionMachine } from '#acp/acp-session.machine.js';
import { acpSessionsMachine } from '#acp/acp-sessions.machine.js';
import {
  acpSessionsAdapter,
  acpSessionsInput,
  enabledOps,
  perform,
  startAcpSessions,
  viewOf,
} from '#acp/test/acp-sessions.adapter.js';
import type { AcpOp } from '#acp/test/acp-sessions.adapter.js';

const specs = path.resolve(import.meta.dirname, '../../specs');
const graph = readSpecGraph(path.join(specs, 'AcpSessions/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'AcpSessions/suite.json'), 'utf8')) as CoveringSuite;
const behaviours = suiteBehaviours(graph, suite);
/* Nightly: `formal nightly` writes TLC-simulated behaviours from a fresh seed here (host `formal:nightly`). */
const simulated = process.env['FORMAL_SIMULATED'];
/* A suite replay settles each of its behaviours in turn: about 9 ms each on an idle host (163 in 1.4 s), so 250 ms each
 * holds on a loaded one. It grows with the suite, and the global default stays. */
const replayTimeout = behaviours.length * 250;

type Step = WalkPath['steps'][number];

/*
 * Every distinct view the facade, the children and the environment can drive the real parent
 * into, breadth first, each with the shortest path that reaches it. A step that leaves the view
 * unchanged (a refused or answered no-op) stutters and is not a spec step.
 */
const implementationPaths = (): WalkPath[] => {
  const replayed = (ops: readonly AcpOp[]) => {
    const harness = startAcpSessions();
    for (const op of ops) {
      perform(harness, op);
    }
    return harness;
  };
  const initialHarness = replayed([]);
  const initial = viewOf(initialHarness);
  initialHarness.actor.stop();
  const seen = new Set([canonicalJson(initial)]);
  const paths: WalkPath[] = [];
  let frontier: Array<{ ops: readonly AcpOp[]; steps: readonly Step[]; view: SpecView }> = [
    { ops: [], steps: [], view: initial },
  ];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const harness = replayed(node.ops);
      const ops = enabledOps(harness);
      harness.actor.stop();
      for (const op of ops) {
        const after = replayed([...node.ops, op]);
        const view = viewOf(after);
        after.actor.stop();
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

describe('acpSessionsMachine conforms to AcpSessions.tla', () => {
  it(
    'replays the TLC covering suite through the adapter',
    async () => {
      expect(behaviours).toHaveLength(suite.behaviours.length);
      expect(await replaySuite(behaviours, acpSessionsAdapter, (state) => [state['act'], state])).toEqual([]);
    },
    replayTimeout,
  );

  it.runIf(simulated !== undefined)(
    'replays the simulated behaviours through the adapter',
    async () => {
      const replayed = readFileSync(path.join(simulated ?? '', 'AcpSessions.ndjson'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as SpecView[]);

      const divergences = await replaySuite(replayed, acpSessionsAdapter, (state) => [state['act'], state]);

      expect(replayed.length).toBeGreaterThan(0);
      expect(divergences.slice(0, 3)).toEqual([]);
    },
    300_000,
  );

  it(
    'replays recorded transitions equally',
    async () => {
      const divergences = [];
      for (const behaviour of behaviours) {
        const harness = acpSessionsAdapter.start();
        for (const state of behaviour.slice(1)) {
          // oxlint-disable-next-line no-await-in-loop -- each step settles before the next.
          await acpSessionsAdapter.apply(harness, [state['act'], state]);
        }
        const records = harness.records().filter((record) => record.machineId === 'acpSessions');
        divergences.push(...replayEquality(acpSessionsMachine, acpSessionsInput, records));
        acpSessionsAdapter.stop?.(harness);
      }
      expect(divergences).toEqual([]);
    },
    replayTimeout,
  );

  it('walks every implementation path through the spec graph without rejection', () => {
    const paths = implementationPaths();
    /* Every spec state, less the step label and the process counter the view leaves unchecked. */
    const specStates = new Set(graph.views.map(({ act: _act, next: _next, ...state }) => canonicalJson(state)));
    const reached = new Set(paths.map((path) => canonicalJson(path.steps.at(-1)!.view)));

    expect(walkPaths(graph, paths).slice(0, 3)).toEqual([]);
    /* And the other way: with `Init`, the parent reaches all 1,059 states of the spec's projection: 915 before
     * W6.r1's `bound` flag, which splits a lent run into before and after its prompt is sent. */
    expect(reached.size + 1).toBe(specStates.size);
    expect(specStates.size).toBe(1059);
  }, 120_000);

  it('matches the committed drift manifest', () => {
    const machines = [acpSessionsMachine, acpSessionMachine];
    expect(
      driftManifestProblems(path.join(specs, 'AcpSessions/drift.json'), {
        alphabet: machineAlphabet(machines),
        versions: Object.fromEntries(machines.map((machine) => [machine.id, String(machine.version)])),
        tables: {},
        actions: machineActions(machines),
        specs: hashFiles(specs, ['AcpSessions.tla']),
      }),
    ).toEqual([]);
  });

  it('names a spec action on every refining transition, and a transition for every system action (MC-R27)', () => {
    const machines = [acpSessionsMachine, acpSessionMachine];
    expect(
      checkActionCorrespondence(machineActions(machines), {
        operators: specOperators(readFileSync(path.join(specs, 'AcpSessions.tla'), 'utf8')),
        /* CancelQueued is the parent `cancel`'s second branch, under its success-path label Cancel (spec header). */
        next: [
          'Acquire',
          'Opened',
          'Dequeued',
          'Bound',
          'PromptAnswered',
          'TurnEnded',
          'Cancel',
          'CancelBinding',
          'CancelSettled',
          'CancelTimedOut',
          'Tick',
          'AdapterExited',
          'SoftCloseDone',
          'IdleExpired',
          'CloseChat',
        ],
        /* Time, and the HARD_CLOSE witness's SIGTERM-only close. */
        environment: ['Tick', 'SoftCloseDone'],
      }),
    ).toEqual([]);
  });
});
