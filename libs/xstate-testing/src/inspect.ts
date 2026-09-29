/**
 * Audience: owner-machine tests (MC-R23) and W1's replay bridge. Inspection
 * observers that fail a test on a silent drop, and a recorder for every delivery.
 *
 * @packageDocumentation
 */

import { onTestFinished } from 'vitest';
import { isMachineSnapshot } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot, AnyStateMachine, InspectionEvent, StateValue } from 'xstate';
import { standardSchemaValidator } from 'xstate/validation';

/** One problem `guardActors` saw; a test takes the ones it expects. @public */
export type Finding =
  | Readonly<{ kind: 'deadLetter'; reason: string; eventType: string; targetId?: string }>
  | Readonly<{ kind: 'unanswered'; machineId: string; value: unknown; eventType: string; timerId?: string }>
  | Readonly<{ kind: 'fault'; machineId: string; eventType: string; status: string }>;

/** The `[state, eventType]` pairs one machine declares it ignores (MC-R17); a state is a dotted path or `'*'`. @public */
export type IgnoredPairs = ReadonlyArray<readonly [state: string, eventType: string]>;

/** Per machine id, the pairs that machine declares it ignores (MC-R17). @public */
export type IgnoredEvents = Readonly<Record<string, IgnoredPairs>>;

/** The observer and drain returned by {@link guardActors}. @public */
export type ActorGuard = Readonly<{
  /** Pass as `createActor(logic, { inspect })`; it sees every actor in the system. */
  inspect: (event: InspectionEvent) => void;
  /** Remove and return the findings of `kind` (every finding when omitted). */
  take: (kind?: Finding['kind']) => Finding[];
}>;

/** `@xstate.deadletter` in alpha.59; `@xstate.deadLetter` after upstream #5738 (N17). */
const deadLetterTypes: ReadonlySet<string> = new Set(['@xstate.deadletter', '@xstate.deadLetter']);

/** The descriptor of a catch-all `onError` microstep. An invoke's own `onError` is `xstate.error.actor`. */
const catchAllErrorType = 'xstate.error.*';

/**
 * Lifecycle notifications a parent may leave unhandled. A timer delivery (`xstate.timer`) is not one.
 *
 * @param type - The delivered event type.
 * @returns Whether the type is a lifecycle built-in.
 */
const isLifecycle = (type: string): boolean => /^(?:@xstate\.|xstate\.done\.|xstate\.error\.)/u.test(type);

/**
 * Whether a machine snapshot's (state, event) pair is on the ignore list for its machine.
 *
 * @param pairs - The ignore pairs for the snapshot's machine.
 * @param snapshot - The snapshot the event reached.
 * @param type - The delivered event type.
 * @returns Whether some pair covers the delivery.
 * @public
 */
export const isIgnoredPair = (pairs: IgnoredPairs | undefined, snapshot: AnyMachineSnapshot, type: string): boolean =>
  pairs?.some(([state, eventType]) => eventType === type && (state === '*' || snapshot.matches(state))) === true;

const idOf = (ref: unknown): string | undefined =>
  typeof ref === 'object' && ref !== null && 'id' in ref && typeof ref.id === 'string' ? ref.id : undefined;

/**
 * Guard every actor in one system: the running test fails at teardown on any dead
 * letter, unanswered delivery or fault it did not `take`.
 *
 * - `deadLetter`: any dead letter, under either spelling.
 * - `unanswered`: a delivery to a machine that took no microstep, other than a
 *   lifecycle built-in or an ignored pair. A timer (`xstate.timer`) is reported
 *   with its id unless a pair names that id: every timer delivery is answered
 *   (MC-R16), so only a test's `knownDefects` debt row names one.
 * - `fault`: a catch-all `onError` took an execution, actor or communication
 *   error, or a machine reached `error` status.
 *
 * @param options - `ignore`: the declared ignore pairs per machine id, plus any test-local `knownDefects`.
 * @returns The inspection observer and a drain for expected findings.
 * @public
 */
export const guardActors = (options: Readonly<{ ignore?: IgnoredEvents }> = {}): ActorGuard => {
  let findings: Finding[] = [];
  onTestFinished(() => {
    if (findings.length > 0) {
      throw new Error(`Untaken actor findings: ${JSON.stringify(findings)}`);
    }
  });

  const inspect = (event: InspectionEvent): void => {
    if (deadLetterTypes.has(event.type) && 'reason' in event) {
      const targetId = idOf(event.actorRef);
      findings.push({
        kind: 'deadLetter',
        reason: event.reason,
        eventType: event.event.type,
        ...(targetId === undefined ? {} : { targetId }),
      });
      return;
    }
    if (event.type !== '@xstate.transition' || !isMachineSnapshot(event.snapshot)) {
      return;
    }
    const { snapshot } = event;
    const { type } = event.event;
    if (snapshot.status === 'error' || event.microsteps.some((step) => step.eventType === catchAllErrorType)) {
      findings.push({ kind: 'fault', machineId: snapshot.machine.id, eventType: type, status: snapshot.status });
    }
    // An errored delivery takes no microstep; the fault already reports it.
    if (snapshot.status === 'error' || event.microsteps.length > 0 || isLifecycle(type)) {
      return;
    }
    if (type === 'xstate.timer') {
      const timerId = String((event.event as { id?: unknown }).id);
      // Only a pair naming the timer id covers a timer, so `xstate.timer` itself is never ignorable.
      if (!isIgnoredPair(options.ignore?.[snapshot.machine.id], snapshot, timerId)) {
        findings.push({
          kind: 'unanswered',
          machineId: snapshot.machine.id,
          value: snapshot.value,
          eventType: type,
          timerId,
        });
      }
      return;
    }
    if (!isIgnoredPair(options.ignore?.[snapshot.machine.id], snapshot, type)) {
      findings.push({ kind: 'unanswered', machineId: snapshot.machine.id, value: snapshot.value, eventType: type });
    }
  };

  const take = (kind?: Finding['kind']): Finding[] => {
    const taken = findings.filter((finding) => kind === undefined || finding.kind === kind);
    findings = findings.filter((finding) => !taken.includes(finding));
    return taken;
  };

  return { inspect, take };
};

/** One taken microstep, reduced to plain data. `meta` carries MC-R27's `tla` action. @public */
export type MicrostepRecord = Readonly<{
  eventType: string;
  source: string;
  targets: readonly string[];
  meta?: unknown;
}>;

/** One event relayed during a delivery. @public */
export type SentEventRecord = Readonly<{
  targetId: string;
  event: AnyEventObject;
  delayMilliseconds?: number;
  id?: string;
}>;

/** One delivery to one machine actor, with the full event and resulting context. @public */
export type TransitionRecord = Readonly<{
  actorId: string;
  machineId: string;
  version: string | undefined;
  event: AnyEventObject;
  value: StateValue;
  context: unknown;
  microsteps: readonly MicrostepRecord[];
  sent: readonly SentEventRecord[];
}>;

/**
 * Record every delivery to every machine actor in one system, built-ins included,
 * in each actor's own order. Never order records across actors by position:
 * inspection order is not causal order (S2 surprise 11).
 *
 * @returns The inspection observer and the records so far.
 * @public
 */
export const recordTransitions = (): Readonly<{
  inspect: (event: InspectionEvent) => void;
  records: () => readonly TransitionRecord[];
}> => {
  const records: TransitionRecord[] = [];
  return {
    inspect: (event) => {
      if (event.type !== '@xstate.transition' || !isMachineSnapshot(event.snapshot)) {
        return;
      }
      const { snapshot } = event;
      const value = snapshot.value as StateValue;
      const context = snapshot.context as unknown;
      records.push({
        actorId: idOf(event.actorRef) ?? '',
        machineId: snapshot.machine.id,
        version: snapshot.machine.version,
        event: event.event,
        value,
        context,
        microsteps: event.microsteps.map((step) => ({
          eventType: step.eventType as string,
          source: step.source.id,
          targets: step.target?.map((node) => node.id) ?? [],
          ...(step.meta === undefined ? {} : { meta: step.meta as unknown }),
        })),
        sent: event.sent.map((sent) => ({
          targetId: sent.targetId,
          event: sent.event,
          ...(sent.delay === undefined ? {} : { delayMilliseconds: sent.delay }),
          ...(sent.id === undefined ? {} : { id: sent.id }),
        })),
      });
    },
    records: () => records,
  };
};

/**
 * A provided copy of `machine` that validates events, context, per-state context,
 * emitted events and output against its declared runtime schemas at every step
 * (MC-R30). A validation failure errors the actor, which `guardActors` reports as a
 * `fault`. The product machine keeps no validator: `xstate/validation` is gated to
 * tests and tooling (MC-R22).
 *
 * @param machine - The owner machine under test.
 * @returns A copy with `standardSchemaValidator()` installed.
 * @public
 */
export const validated = <Machine extends AnyStateMachine>(machine: Machine): Machine => {
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- `provide({})` returns the same machine type.
  const copy = machine.provide({}) as Machine;
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- `validator` is read-only on the type; the copy is ours (k10).
  (copy as { validator?: unknown }).validator = standardSchemaValidator();
  return copy;
};
