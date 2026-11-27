import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson, readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { SpecGraph, SpecView } from '@taucad/formal/graph';
import { replayGatewayTraceStep } from '#testing/credit-operation-oracle.js';
import type { GatewayTraceRow, GatewayTraceState } from '#testing/credit-operation-oracle.js';

const specs = path.resolve(import.meta.dirname, '../specs/GatewayInvocationOracleGraph');
const graphFile = path.join(specs, 'graph.json');
const suiteFile = path.join(specs, 'suite.json');

const project = (view: SpecView): GatewayTraceState => {
  const claims = view['claims'] as Array<{ readonly k: string; readonly gen: number; readonly t: number }>;
  const raw = (view['row'] as { readonly a: Omit<GatewayTraceRow, 'terminalTtl'> & { readonly ['ttl']: boolean } }).a;
  const { ttl: terminalTtl, ...row } = raw;
  return {
    now: view['now'] as number,
    row: { ...row, terminalTtl, ev: [...row.ev].sort() },
    held: view['acctHeld'] as number,
    supplier: (view['sup'] as { readonly a: GatewayTraceState['supplier'] }).a,
    voided: (view['voided'] as readonly string[]).includes('a'),
    ...(claims[0] === undefined ? {} : { claim: { gen: claims[0].gen, t: claims[0].t } }),
  };
};

/**
 * The shortest behaviour of the graph whose last step satisfies the predicate. The covering suite keeps one path per
 * (phase, action) class, so which terminal kinds its paths happen to pass through moves whenever the spec's shape
 * does (AtomicAdmit, chat performance WP-14, moved several); the replay also walks one path per outcome it asserts.
 */
const shortestBehaviourThrough = (
  graph: SpecGraph,
  holds: (before: SpecView, after: SpecView) => boolean,
): SpecView[] | undefined => {
  const successors = new Map<number, number[]>();
  for (const [from, to] of graph.edges) {
    successors.set(from, [...(successors.get(from) ?? []), to]);
  }
  const previous = new Map<number, number | undefined>(graph.initial.map((state) => [state, undefined]));
  const queue = [...graph.initial];
  const pathTo = (state: number): SpecView[] => {
    const path: number[] = [];
    for (let at: number | undefined = state; at !== undefined; at = previous.get(at)) {
      path.unshift(at);
    }
    return path.map((index) => graph.views[index] ?? {});
  };
  for (const state of queue) {
    for (const next of successors.get(state) ?? []) {
      if (holds(graph.views[state] ?? {}, graph.views[next] ?? {})) {
        return [...pathTo(state), graph.views[next] ?? {}];
      }
      if (!previous.has(next)) {
        previous.set(next, state);
        queue.push(next);
      }
    }
  }
  return undefined;
};

describe('GatewayInvocation TLC to credit operation oracle (GI-A5)', () => {
  it('should replay every TLC covering trace without divergence', () => {
    expect(statSync(graphFile).size).toBeLessThan(1_000_000);
    expect(statSync(suiteFile).size).toBeLessThan(1_000_000);
    const graph = readSpecGraph(graphFile);
    const suite = JSON.parse(readFileSync(suiteFile, 'utf8')) as {
      readonly phase: string;
      readonly behaviours: ReadonlyArray<readonly number[]>;
    };
    expect(suite.phase).toBe('row.a.cust');
    const settlesVia =
      (action: string) =>
      (before: SpecView, after: SpecView): boolean => {
        const previous = project(before);
        const next = project(after);
        return (
          after['act'] === action &&
          previous.row.cust === 'pending' &&
          next.row.cust === 'settled' &&
          next.row.gen === (action === 'ApiFinish' ? 1 : 2)
        );
      };
    const targets = [
      (_before: SpecView, after: SpecView): boolean => project(after).row.ev.includes('unresolvable'),
      settlesVia('ApiFinish'),
      settlesVia('SweepResolve'),
      (before: SpecView, after: SpecView): boolean =>
        after['act'] === 'ApiFinish' &&
        project(before).row.cust === 'pending' &&
        project(after).row.cust === 'absorbed' &&
        project(after).row.tgen === 1,
    ].map((holds) => shortestBehaviourThrough(graph, holds));
    expect(targets.every((target) => target !== undefined)).toBe(true);
    const behaviours = [
      ...suiteBehaviours(graph, suite),
      ...targets.filter((target): target is SpecView[] => target !== undefined),
    ];
    expect(behaviours.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const [index, behaviour] of behaviours.entries()) {
      let state = project(behaviour[0] ?? {});
      for (let step = 1; step < behaviour.length; step += 1) {
        const view = behaviour[step] ?? {};
        const action = view['act'];
        expect(typeof action).toBe('string');
        seen.add(action as string);
        const expected = project(view);
        const alternatives = replayGatewayTraceStep(state, action as string);
        const matching = alternatives.find((candidate) => canonicalJson(candidate) === canonicalJson(expected));
        expect(matching, `TLC behaviour ${index}, step ${step}, action ${String(action)}`).toBeDefined();
        state = matching ?? state;
      }
    }
    for (const action of [
      'ApiAdmit',
      'ApiMarkIntent',
      'ApiDispatch',
      'ApiAccepted',
      'ApiObserve',
      'ApiFinish',
      'SupplierEnd',
      'HostResume',
      'SweepClaim',
      'SweepResolve',
      'SweepFail',
    ]) {
      expect(seen.has(action), `Missing covering action ${action}`).toBe(true);
    }
    const coversUnresolvable = behaviours.some((behaviour) =>
      behaviour.some((view) => project(view).row.ev.includes('unresolvable')),
    );
    const coversVoid = behaviours.some((behaviour) => behaviour.some((view) => project(view).voided));
    expect(coversUnresolvable).toBe(true);
    expect(coversVoid).toBe(true);
    for (const action of ['ApiFinish', 'SweepResolve']) {
      const settles = behaviours.some((behaviour) =>
        behaviour.some((view, index) => {
          const previous = behaviour[index - 1];
          if (previous === undefined || view['act'] !== action) {
            return false;
          }
          const before = project(previous);
          const after = project(view);
          return (
            before.row.cust === 'pending' &&
            after.row.cust === 'settled' &&
            after.row.ev.includes('final') &&
            after.row.charged === 1 &&
            after.row.gen === (action === 'ApiFinish' ? 1 : 2) &&
            after.row.tgen === after.row.gen &&
            after.held === 0
          );
        }),
      );
      expect(settles, `Missing final-evidence settlement via ${action}`).toBe(true);
    }
    /* A supplier cut is absorbed by the live finish under the admitting generation, not left for the sweep. */
    const absorbsLive = behaviours.some((behaviour) =>
      behaviour.some((view, index) => {
        const previous = behaviour[index - 1];
        if (previous === undefined || view['act'] !== 'ApiFinish') {
          return false;
        }
        const after = project(view);
        return (
          project(previous).row.cust === 'pending' &&
          after.row.cust === 'absorbed' &&
          after.row.ev.includes('unknown') &&
          after.row.charged === 0 &&
          after.row.tgen === 1 &&
          after.held === 0
        );
      }),
    );
    expect(absorbsLive, 'Missing supplier-cut absorption via ApiFinish').toBe(true);
  });
});
