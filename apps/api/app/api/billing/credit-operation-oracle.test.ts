import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson, readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { SpecView } from '@taucad/formal/graph';
import { replayGatewayTraceStep } from '#testing/credit-operation-oracle.js';
import type { GatewayTraceRow, GatewayTraceState } from '#testing/credit-operation-oracle.js';

const specs = path.resolve(import.meta.dirname, '../../../specs/GatewayInvocationOracleGraph');
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
    voided: (view['voided'] as readonly string[]).includes('a'),
    ...(claims[0] === undefined ? {} : { claim: { gen: claims[0].gen, t: claims[0].t } }),
  };
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
    const behaviours = suiteBehaviours(graph, suite);
    expect(behaviours.length).toBeGreaterThan(0);
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
      'ApiObserve',
      'ApiFinish',
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
  });
});
