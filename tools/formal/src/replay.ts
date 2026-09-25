import { initialTransition, transition } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot, AnyStateMachine } from 'xstate';
import type { SpecView } from '#graph.js';
import { canonicalJson } from '#graph.js';

/**
 * Drives one live actor from spec actions (forward replay, S6 bridge b). The adapter supplies the
 * determinism replay needs (L1 F19): W2's fakes and `StepClock`, stable ids, pinned versions.
 */
export type ConformanceAdapter<H> = {
  /** A fresh live actor over fakes. */
  readonly start: () => H;
  /** Performs one spec action on the harness, then flushes. */
  readonly apply: (harness: H, action: readonly unknown[]) => Promise<void>;
  /** The refinement mapping: the spec fields this harness state stands for. Fields it omits are unchecked. */
  readonly view: (harness: H) => SpecView;
  /** Adds facts the spec implies but does not store (the effects a phase holds), compared like any field. */
  readonly project?: (state: SpecView) => SpecView;
  readonly stop?: (harness: H) => void;
};

export type Divergence = {
  readonly behaviour: number;
  readonly step: number;
  readonly action: string;
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The first field (one level into records) where the implementation's view differs from the spec state. */
export const firstDifference = (
  spec: SpecView,
  actual: SpecView,
): { field: string; expected: unknown; actual: unknown } | undefined => {
  for (const [field, value] of Object.entries(actual)) {
    const expected = spec[field];
    if (canonicalJson(expected) === canonicalJson(value)) {
      continue;
    }
    if (isRecord(expected) && isRecord(value)) {
      const inner = Object.keys({ ...expected, ...value })
        .sort()
        .find((key) => canonicalJson(expected[key]) !== canonicalJson(value[key]));
      if (inner !== undefined) {
        return { field: `${field}.${inner}`, expected: expected[inner], actual: value[inner] };
      }
    }
    return { field, expected, actual: value };
  }
  return undefined;
};

/**
 * Replays spec behaviours on live actors and returns each behaviour's first divergence.
 * Each behaviour's first state is its `Init`; every later state names the action that produced it.
 */
export const replaySuite = async <H>(
  behaviours: ReadonlyArray<readonly SpecView[]>,
  adapter: ConformanceAdapter<H>,
  action: (state: SpecView) => readonly unknown[],
): Promise<Divergence[]> => {
  const divergences: Divergence[] = [];
  for (const [index, behaviour] of behaviours.entries()) {
    const harness = adapter.start();
    try {
      for (const [step, state] of behaviour.entries()) {
        const label = action(state);
        if (step > 0) {
          // oxlint-disable-next-line no-await-in-loop -- each step settles before the next is taken.
          await adapter.apply(harness, label);
        }
        const difference = firstDifference(adapter.project?.(state) ?? state, adapter.view(harness));
        if (difference) {
          divergences.push({ behaviour: index, step, action: JSON.stringify(label), ...difference });
          break;
        }
      }
    } catch (error) {
      divergences.push({
        behaviour: index,
        step: -1,
        action: 'apply',
        field: 'step',
        expected: 'executable',
        actual: String(error),
      });
    } finally {
      adapter.stop?.(harness);
    }
  }
  return divergences;
};

/** One recorded delivery (W2's `recordTransitions` record, of which replay needs these fields). */
export type TransitionRecord = {
  readonly event: AnyEventObject;
  readonly value: unknown;
  readonly context: unknown;
};

/**
 * Replay equality (D3, W2 MC-R6): fold the live actor's recorded events through pure `transition`
 * from `initialTransition` and compare state value and context after every step. A difference means
 * a transition read something outside its snapshot and event.
 */
export const replayEquality = (
  machine: AnyStateMachine,
  input: unknown,
  records: readonly TransitionRecord[],
): Divergence[] => {
  const [initial] = initialTransition(machine, input) as unknown as [AnyMachineSnapshot];
  let snapshot = initial;
  for (const [step, record] of records.entries()) {
    [snapshot] = transition(machine, snapshot, record.event) as unknown as [AnyMachineSnapshot];
    const difference = firstDifference(
      { value: record.value, context: record.context },
      { value: snapshot.value, context: snapshot.context },
    );
    if (difference) {
      return [{ behaviour: 0, step, action: record.event.type, ...difference }];
    }
  }
  return [];
};
