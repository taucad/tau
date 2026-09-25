import { createActor, createMachine } from 'xstate';
import type { AnyEventObject, AnyStateMachine } from 'xstate';
import { describe, expect, it } from 'vitest';
import type { SpecView } from '#graph.js';
import type { ConformanceAdapter, TransitionRecord } from '#replay.js';
import { replayEquality, replaySuite } from '#replay.js';

/* Stand-in for W2's `recordTransitions` (@taucad/xstate-testing/inspect): one record per delivery. */
const record = (
  machine: AnyStateMachine,
  events: readonly AnyEventObject[],
  between: () => void = () => undefined,
): TransitionRecord[] => {
  const records: TransitionRecord[] = [];
  const actor = createActor(machine, {
    inspect: (inspection) => {
      if (inspection.type === '@xstate.transition' && inspection.event.type !== '@xstate.init') {
        const { value, context } = inspection.snapshot as unknown as {
          readonly value: unknown;
          readonly context: unknown;
        };
        records.push({ event: inspection.event, value, context });
      }
    },
  });
  actor.start();
  for (const event of events) {
    between();
    actor.send(event);
  }
  actor.stop();
  return records;
};

type Counter = { readonly count: number };

/* Untyped fixtures: v6's inference needs schemas these tiny machines do not declare. */
const counterMachine = (add: (count: number, event: AnyEventObject) => number): AnyStateMachine =>
  createMachine({
    context: { count: 0 },
    on: {
      add: ({ context, event }: { readonly context: Counter; readonly event: AnyEventObject }) => ({
        context: { count: add(context.count, event) },
      }),
    },
  } as unknown as Parameters<typeof createMachine>[0]);

describe('replayEquality', () => {
  it('should find no divergence when every transition reads only its snapshot and event', () => {
    const machine = counterMachine((count, event) => count + Number((event as { readonly by?: number }).by));

    expect(
      replayEquality(
        machine,
        undefined,
        record(machine, [
          { type: 'add', by: 2 },
          { type: 'add', by: 3 },
        ]),
      ),
    ).toEqual([]);
  });

  it('should report a divergence when a transition reads a value outside its snapshot and event', () => {
    let outside = 0;
    const machine = counterMachine((count) => count + 1 + outside);

    const records = record(machine, [{ type: 'add' }], () => {
      outside = 5;
    });
    outside = 0;

    expect(replayEquality(machine, undefined, records)).toEqual([
      { behaviour: 0, step: 0, action: 'add', field: 'context.count', expected: 6, actual: 1 },
    ]);
  });
});

describe('replaySuite', () => {
  type Harness = { phase: string };
  const behaviours: SpecView[][] = [
    [
      { phase: 'idle', act: ['Init'] },
      { phase: 'busy', act: ['Start'] },
      { phase: 'idle', act: ['Finish'] },
    ],
  ];
  const adapter = (finish: string): ConformanceAdapter<Harness> => ({
    start: () => ({ phase: 'idle' }),
    apply: async (harness, action) => {
      harness.phase = action[0] === 'Start' ? 'busy' : finish;
    },
    view: (harness) => ({ phase: harness.phase }),
  });

  it('should replay a conforming implementation without divergence', async () => {
    expect(await replaySuite(behaviours, adapter('idle'), (state) => state['act'] as unknown[])).toEqual([]);
  });

  it('should report the first step whose view differs from the spec', async () => {
    expect(await replaySuite(behaviours, adapter('failed'), (state) => state['act'] as unknown[])).toEqual([
      { behaviour: 0, step: 2, action: '["Finish"]', field: 'phase', expected: 'idle', actual: 'failed' },
    ]);
  });
});
