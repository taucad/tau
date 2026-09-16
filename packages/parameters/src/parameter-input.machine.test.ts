import { createActor, SimulatedClock, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#parameter-input.machine.js';
import { parameterInputMachine } from '#parameter-input.machine.js';
import type {
  ParameterInputBinding,
  ParameterInputMachineEmitted,
  ParameterInputMachineInput,
} from '#parameter-input.machine.js';
import { parameterSetHarness } from '#parameter-set.test-helper.js';
import type { ParameterSetIdentity, ParameterSetOutcome } from '#types.js';

const revision = (value = '1'): ParameterSetIdentity => ({
  sourceRevision: `source:${value}`,
  manifestRevision: `manifest:${value}`,
  valueRevision: `value:${value}`,
  dependencyRevision: `dependency:${value}`,
});

const binding = (overrides?: Partial<ParameterInputBinding>): ParameterInputBinding => ({
  target: {
    authority: 'node:project',
    root: '/project',
    checkout: 'main',
    entry: 'main.ts',
  },
  group: 'default',
  parameterId: 'width',
  resource: 'urn:test:schema',
  pointer: '/width',
  nativeUnit: 'mm',
  representation: 'binary64',
  constraints: { minimum: 0, maximum: 100, multipleOf: 0.5 },
  ...overrides,
});

const unknownBinding = (): ParameterInputBinding => ({
  target: {
    authority: 'node:project',
    root: '/project',
    checkout: 'main',
    entry: 'main.ts',
  },
  group: 'default',
  parameterId: 'width',
  resource: 'urn:test:schema',
  pointer: '/width',
  representation: 'binary64',
  constraints: { minimum: 0, maximum: 100, multipleOf: 0.5 },
});

const input = (overrides?: Partial<ParameterInputMachineInput>): ParameterInputMachineInput => ({
  editorInstance: 'editor:width',
  binding: binding(),
  acknowledgedValue: 25.4,
  acknowledgedRevision: revision(),
  display: { unit: '[in_i]', locale: 'en-NZ' },
  pressure: 'default',
  ...overrides,
});

type InputActor = ActorRefFrom<typeof parameterInputMachine>;

const startActor = (
  actorInput = input(),
  clock = new SimulatedClock(),
): Readonly<{
  actor: InputActor;
  emitted: ParameterInputMachineEmitted[];
  clock: SimulatedClock;
}> => {
  const actor = createActor(parameterInputMachine, {
    input: actorInput,
    clock,
  });
  const emitted: ParameterInputMachineEmitted[] = [];
  actor.on('parameterSetIntent', (event) => emitted.push(event));
  actor.start();
  return { actor, emitted, clock };
};

const interaction = (
  actor: InputActor,
  state: 'conflicted' | 'dragging' | 'failed' | 'initializing' | 'submitting' | 'viewing',
): boolean => actor.getSnapshot().matches({ active: { interaction: state } });

const editing = (actor: InputActor, state: 'complete-valid' | 'incomplete' | 'invalid'): boolean =>
  actor.getSnapshot().matches({ active: { interaction: { editing: state } } });

const committed = (event: ParameterInputMachineEmitted, value = '2'): ParameterSetOutcome => ({
  status: 'committed',
  requestId: event.request.requestId,
  revision: revision(value),
  write: 'applied',
});

const sendUnchecked = (actor: InputActor, event: unknown): void => {
  Reflect.apply(actor.send, actor, [event]);
};

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

describe('parameterInputMachine', () => {
  it.each([
    {
      name: 'nonfinite binary64',
      binding: binding(),
      value: Number.POSITIVE_INFINITY,
      message: 'Parameter values must be finite.',
    },
    {
      name: 'unsafe integer',
      binding: binding({ representation: 'safe-integer', constraints: {} }),
      value: Number.MAX_SAFE_INTEGER + 1,
      message: 'Input does not preserve a safe integer in the native unit.',
    },
    {
      name: 'exclusive lower bound',
      binding: binding({ constraints: { exclusiveMinimum: 0 } }),
      value: 0,
      message: 'Value must be greater than 0.',
    },
    {
      name: 'exclusive upper bound',
      binding: binding({ constraints: { exclusiveMaximum: 10 } }),
      value: 10,
      message: 'Value must be less than 10.',
    },
    {
      name: 'multiple-of lattice',
      binding: binding({ constraints: { multipleOf: 0.5 } }),
      value: 10.25,
      message: 'Value must be a multiple of 0.5.',
    },
    {
      name: 'constant',
      binding: binding({ constraints: { const: 3 } }),
      value: 4,
      message: 'Value does not match the required constant.',
    },
    {
      name: 'enumeration',
      binding: binding({ constraints: { enum: [1, 2] } }),
      value: 3,
      message: 'Value is not one of the admitted choices.',
    },
    {
      name: 'unsupported decimal',
      binding: binding({ representation: 'decimal', constraints: {} }),
      value: 1.25,
      message: 'Decimal input requires a decimal execution engine.',
    },
  ])('rejects $name through shared executable-value admission', ({ binding: candidate, value, message }) => {
    expect(machineModule.validateParameterInputValue(candidate, value)?.message).toBe(message);
  });

  it.each([
    binding({ constraints: { minimum: 0, maximum: 20, multipleOf: 0.1 } }),
    binding({ representation: 'safe-integer', constraints: { minimum: Number.MIN_SAFE_INTEGER } }),
  ])('admits executable values through the same shared validator', (candidate) => {
    const value = candidate.representation === 'safe-integer' ? Number.MAX_SAFE_INTEGER : 0.3;
    expect(machineModule.validateParameterInputValue(candidate, value)).toBeUndefined();
  });

  it('should start headlessly, stay serializable, stop cleanly, and export exactly one machine value', () => {
    const { actor, emitted, clock } = startActor();
    expect(interaction(actor, 'viewing')).toBe(true);
    expect(actor.getSnapshot().matches({ active: { attachment: 'attached' } })).toBe(true);
    expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([parameterInputMachine]);
    const before = actor.getSnapshot();
    clock.increment(60_000);
    expect(actor.getSnapshot()).toBe(before);
    expect(emitted).toEqual([]);
    actor.stop();

    const restarted = startActor();
    expect(interaction(restarted.actor, 'viewing')).toBe(true);
    restarted.actor.stop();
  });

  it('should expose malformed runtime input as a serializable failed state', () => {
    const { actor, emitted } = startActor(input({ editorInstance: '' }));
    expect(interaction(actor, 'failed')).toBe(true);
    expect(actor.getSnapshot().context.diagnostic).toMatchObject({
      code: 'METADATA_CONFLICT',
    });
    expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it.each([
    {
      text: '',
      state: 'incomplete',
      result: 'incomplete',
      code: 'UNIT_INVALID',
    },
    {
      text: '-',
      state: 'incomplete',
      result: 'incomplete',
      code: 'UNIT_INVALID',
    },
    { text: '1/', state: 'invalid', result: 'invalid', code: 'UNIT_INVALID' },
    {
      text: '1e999',
      state: 'invalid',
      result: 'invalid',
      code: 'NUMERIC_OVERFLOW',
    },
    {
      text: '1 splonk',
      state: 'invalid',
      result: 'invalid',
      code: 'UNIT_INVALID',
    },
  ] as const)('should retain $text as a structured draft without submitting', ({ text, state, result, code }) => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text });
    expect(editing(actor, state)).toBe(true);
    expect(actor.getSnapshot().context.draft).toMatchObject({
      raw: text,
      resultStatus: result,
    });
    expect(actor.getSnapshot().context.draft?.diagnostic).toMatchObject({
      code,
    });
    actor.send({ type: 'pressEnter' });
    actor.send({ type: 'blur' });
    expect(emitted).toEqual([]);
    expect(actor.getSnapshot().context.draft?.raw).toBe(text);
    actor.stop();
  });

  it('should keep unsafe integers and unsupported decimals draft-only', () => {
    const unsafe = startActor(
      input({
        binding: binding({ representation: 'safe-integer', nativeUnit: '1' }),
        acknowledgedValue: 1,
        display: { unit: '1', locale: 'en' },
      }),
    );
    unsafe.actor.send({ type: 'focus' });
    unsafe.actor.send({ type: 'changeRaw', text: '9007199254740992' });
    expect(editing(unsafe.actor, 'invalid')).toBe(true);
    expect(unsafe.actor.getSnapshot().context.draft).toMatchObject({
      resultStatus: 'unsupported',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED' },
    });
    expect(unsafe.emitted).toEqual([]);
    unsafe.actor.stop();

    const decimal = startActor(
      input({
        binding: binding({ representation: 'decimal' }),
        acknowledgedValue: '25.4',
        display: { unit: 'mm', locale: 'en' },
      }),
    );
    decimal.actor.send({ type: 'focus' });
    decimal.actor.send({ type: 'changeRaw', text: '25.5' });
    expect(editing(decimal.actor, 'invalid')).toBe(true);
    expect(decimal.actor.getSnapshot().context.draft).toMatchObject({
      resultStatus: 'unsupported',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED' },
    });
    expect(decimal.emitted).toEqual([]);
    decimal.actor.stop();
  });

  it('should keep unknown numeric semantics distinct from explicit dimensionless semantics', () => {
    const unknown = startActor(
      input({
        binding: unknownBinding(),
        acknowledgedValue: 2,
        display: { locale: 'en' },
      }),
    );
    unknown.actor.send({ type: 'focus' });
    unknown.actor.send({ type: 'changeRaw', text: '3.5' });
    unknown.actor.send({ type: 'pressEnter' });
    expect(unknown.emitted[0]?.request.operation).toEqual({
      kind: 'native-value',
      group: 'default',
      parameterId: 'width',
      resource: 'urn:test:schema',
      pointer: '/width',
      value: 3.5,
    });
    unknown.actor.stop();

    const suffixedUnknown = startActor(
      input({
        binding: unknownBinding(),
        acknowledgedValue: 2,
        display: { locale: 'en' },
      }),
    );
    suffixedUnknown.actor.send({ type: 'focus' });
    suffixedUnknown.actor.send({ type: 'changeRaw', text: '3.5 mm' });
    expect(editing(suffixedUnknown.actor, 'invalid')).toBe(true);
    suffixedUnknown.actor.send({ type: 'pressEnter' });
    expect(suffixedUnknown.emitted).toEqual([]);
    suffixedUnknown.actor.stop();

    const dimensionless = startActor(
      input({
        binding: binding({ nativeUnit: '1' }),
        acknowledgedValue: 2,
        display: { unit: '1', locale: 'en' },
      }),
    );
    dimensionless.actor.send({ type: 'focus' });
    dimensionless.actor.send({ type: 'changeRaw', text: '3.5' });
    dimensionless.actor.send({ type: 'pressEnter' });
    expect(dimensionless.emitted[0]?.request.operation).toMatchObject({
      kind: 'unit-value',
      inputUnit: '1',
    });
    dimensionless.actor.stop();
  });

  it('should emit one captured unit-value intent on Enter and acknowledge only its committed outcome', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '1/2 in' });
    expect(editing(actor, 'complete-valid')).toBe(true);
    actor.send({ type: 'pressEnter' });
    expect(interaction(actor, 'submitting')).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      target: input().binding.target,
      locale: 'en-NZ',
      request: {
        pressure: 'final',
        expected: revision(),
        operation: {
          kind: 'unit-value',
          group: 'default',
          parameterId: 'width',
          pointer: '/width',
          inputUnit: '[in_i]',
          value: '1/2 in',
        },
      },
    });
    expect(actor.getSnapshot().context.acknowledged.value).toBe(25.4);
    actor.send({
      type: 'settleSubmission',
      generation: 999,
      outcome: committed(emitted[0]!),
    });
    expect(actor.getSnapshot().context.acknowledged.value).toBe(25.4);
    actor.send({
      type: 'settleSubmission',
      generation: emitted[0]!.request.draftGeneration,
      outcome: committed(emitted[0]!),
    });
    expect(interaction(actor, 'viewing')).toBe(true);
    expect(actor.getSnapshot().context.acknowledged.revision).toEqual(revision('2'));
    expect(actor.getSnapshot().context.acknowledged.value).toBeCloseTo(12.7, 12);
    actor.stop();
  });

  it('should accept its observed write while blurred and return to locale-formatted viewing', () => {
    const { actor, emitted } = startActor(input({ acknowledgedValue: 1, display: { unit: 'mm', locale: 'en-NZ' } }));
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '123456789' });
    actor.send({ type: 'pressEnter' });
    const active = emitted[0]!;
    actor.send({ type: 'blur' });
    actor.send({
      type: 'refreshAuthority',
      binding: binding(),
      value: 123_456_789,
      revision: revision('2'),
    });
    expect(interaction(actor, 'submitting')).toBe(true);
    expect(actor.getSnapshot().context.draft?.focused).toBe(false);
    actor.send({
      type: 'settleSubmission',
      generation: active.request.draftGeneration,
      outcome: committed(active, '2'),
    });
    expect(interaction(actor, 'viewing')).toBe(true);
    expect(actor.getSnapshot().context.draft).toBeUndefined();
    const { projection } = actor.getSnapshot().context.acknowledged;
    expect(
      projection.status === 'success' ? projection.value.parts.map(({ value }) => value).join('') : undefined,
    ).toBe('123,456,789');
    actor.stop();
  });

  it('should emit nothing for focus, blur, Escape, no-op Enter, display change, and clean refresh', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'blur' });
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEscape' });
    actor.send({
      type: 'changeDisplay',
      display: { unit: 'cm', locale: 'de-DE' },
    });
    actor.send({
      type: 'refreshAuthority',
      binding: binding(),
      value: 25.4,
      revision: revision('2'),
    });
    actor.send({ type: 'focus' });
    actor.send({ type: 'pressEnter' });
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '1 in' });
    actor.send({ type: 'pressEnter' });
    expect(interaction(actor, 'viewing')).toBe(true);
    expect(actor.getSnapshot().context.draft).toBeUndefined();
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it('should preserve captured unit and locale across display changes while editing', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2' });
    const capture = actor.getSnapshot().context.draft;
    actor.send({
      type: 'changeDisplay',
      display: { unit: 'cm', locale: 'de-DE' },
    });
    expect(actor.getSnapshot().context.draft).toEqual(capture);
    expect(emitted).toEqual([]);
    actor.send({ type: 'pressEnter' });
    expect(emitted[0]).toMatchObject({
      locale: 'en-NZ',
      request: { operation: { inputUnit: '[in_i]', value: '2' } },
    });
    actor.stop();
  });

  it('should refresh clean data and retain a dirty draft in rebind conflict', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({
      type: 'refreshAuthority',
      binding: binding(),
      value: 50.8,
      revision: revision('2'),
    });
    expect(editing(actor, 'complete-valid')).toBe(true);
    expect(actor.getSnapshot().context.acknowledged.value).toBe(50.8);
    actor.send({ type: 'changeRaw', text: '3 in' });
    actor.send({
      type: 'refreshAuthority',
      binding: binding(),
      value: 63.5,
      revision: revision('3'),
    });
    expect(interaction(actor, 'conflicted')).toBe(true);
    expect(actor.getSnapshot().context.draft).toMatchObject({
      raw: '3 in',
      conflict: { reason: 'revision-changed', rebindable: true },
    });
    actor.send({ type: 'pressEnter' });
    expect(emitted).toEqual([]);
    actor.send({ type: 'rebind' });
    actor.send({ type: 'pressEnter' });
    expect(emitted[0]?.request.expected).toEqual(revision('3'));
    actor.stop();
  });

  it.each([
    { name: 'removed', next: undefined, reason: 'binding-removed' },
    {
      name: 'structurally changed',
      next: binding({ pointer: '/items/0/width' }),
      reason: 'binding-changed',
    },
  ] as const)('should block a $name pointer', ({ next, reason }) => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({
      type: 'refreshAuthority',
      ...(next === undefined ? {} : { binding: next }),
      value: 50.8,
      revision: revision('2'),
    });
    expect(interaction(actor, 'conflicted')).toBe(true);
    expect(actor.getSnapshot().context.draft?.conflict).toEqual({
      reason,
      rebindable: false,
    });
    actor.send({ type: 'rebind' });
    actor.send({ type: 'pressEnter' });
    expect(interaction(actor, 'conflicted')).toBe(true);
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it('should emit once on default pointer release and never on cancel', () => {
    const released = startActor();
    released.actor.send({ type: 'pointerChanged', value: 2 });
    released.actor.send({ type: 'pointerChanged', value: 3 });
    expect(interaction(released.actor, 'dragging')).toBe(true);
    expect(released.emitted).toEqual([]);
    released.actor.send({ type: 'pointerReleased' });
    expect(released.emitted).toHaveLength(1);
    expect(released.emitted[0]?.request).toMatchObject({
      pressure: 'final',
      operation: { kind: 'native-value', value: 76.2 },
    });
    released.actor.stop();

    const cancelled = startActor();
    cancelled.actor.send({ type: 'pointerChanged', value: 2 });
    cancelled.actor.send({ type: 'pointerCancelled' });
    expect(interaction(cancelled.actor, 'viewing')).toBe(true);
    expect(cancelled.emitted).toEqual([]);
    cancelled.actor.stop();
  });

  it('should bound continual mode to one active plus the latest pending generation', () => {
    const { actor, emitted } = startActor(input({ pressure: 'continual', display: { unit: 'mm', locale: 'en' } }));
    actor.send({ type: 'pointerChanged', value: 30 });
    const first = emitted[0]!;
    actor.send({ type: 'pointerChanged', value: 40 });
    const replaced = actor.getSnapshot().context.submission?.pending?.request.draftGeneration;
    actor.send({ type: 'pointerChanged', value: 50 });
    actor.send({ type: 'pointerReleased' });
    expect(emitted).toHaveLength(1);
    expect(actor.getSnapshot().context.submission?.pending?.request).toMatchObject({
      pressure: 'final',
      operation: { kind: 'native-value', value: 50 },
    });
    expect(actor.getSnapshot().context.submission?.pending?.request.draftGeneration).not.toBe(replaced);
    actor.send({
      type: 'settleSubmission',
      generation: first.request.draftGeneration,
      outcome: committed(first, '2'),
    });
    const latest = emitted[1]!;
    expect(latest.request).toMatchObject({
      pressure: 'final',
      operation: { kind: 'native-value', value: 50 },
    });
    expect(actor.getSnapshot().context.acknowledged.value).toBe(30);
    actor.send({
      type: 'settleSubmission',
      generation: latest.request.draftGeneration,
      outcome: committed(latest, '3'),
    });
    expect(actor.getSnapshot().context.acknowledged.value).toBe(50);
    actor.send({
      type: 'settleSubmission',
      generation: first.request.draftGeneration,
      outcome: committed(first, '2'),
    });
    expect(actor.getSnapshot().context.acknowledged.value).toBe(50);
    actor.stop();
  });

  it('should cancel only retained continual work while preserving active settlement identity', () => {
    const { actor, emitted } = startActor(input({ pressure: 'continual', display: { unit: 'mm', locale: 'en' } }));
    actor.send({ type: 'pointerChanged', value: 30 });
    const active = emitted[0]!;
    actor.send({ type: 'pointerChanged', value: 40 });
    actor.send({ type: 'pointerCancelled' });
    expect(actor.getSnapshot().context.submission?.active.request.requestId).toBe(active.request.requestId);
    expect(actor.getSnapshot().context.submission?.pending).toBeUndefined();
    expect(actor.getSnapshot().context.draft).toBeUndefined();
    actor.send({
      type: 'settleSubmission',
      generation: active.request.draftGeneration,
      outcome: committed(active),
    });
    expect(emitted).toHaveLength(1);
    expect(actor.getSnapshot().context.acknowledged.value).toBe(30);
    actor.stop();
  });

  it('should compose continual settlement through the real parameter-set owner with the committed revision', async () => {
    const parameterSet = await parameterSetHarness();
    await waitFor(parameterSet.actor, (snapshot) => snapshot.matches({ open: 'ready' }));
    const inputActor = startActor({
      ...input({ pressure: 'continual', display: { unit: 'mm', locale: 'en' } }),
      acknowledgedRevision: parameterSet.snapshot.identity,
      binding: {
        ...binding(),
        target: parameterSet.snapshot.target,
        parameterId: 'width',
        resource: parameterSet.snapshot.manifest.bindings['/width']!.schema.resource,
      },
    });
    inputActor.actor.send({ type: 'pointerChanged', value: 30 });
    inputActor.actor.send({ type: 'pointerChanged', value: 40 });
    inputActor.actor.send({ type: 'pointerReleased' });

    const first = inputActor.emitted[0]!;
    const firstOutcome = await parameterSet.submit(first.request);
    inputActor.actor.send({
      type: 'settleSubmission',
      generation: first.request.draftGeneration,
      outcome: firstOutcome,
    });
    const latest = inputActor.emitted[1]!;
    expect(latest.request.expected).toEqual(firstOutcome.status === 'committed' ? firstOutcome.revision : undefined);
    expect(latest.request.fingerprint).not.toBe(first.request.fingerprint);

    const latestOutcome = await parameterSet.submit(latest.request);
    expect(latestOutcome.status).toBe('committed');
    inputActor.actor.send({
      type: 'settleSubmission',
      generation: latest.request.draftGeneration,
      outcome: latestOutcome,
    });
    expect(inputActor.actor.getSnapshot().context.acknowledged.value).toBe(40);
    inputActor.actor.stop();
    parameterSet.actor.stop();
  });

  it('should preserve unique request identity after a real known-not-applied settlement and discard', async () => {
    const parameterSet = await parameterSetHarness(true);
    await waitFor(parameterSet.actor, (snapshot) => snapshot.matches({ open: 'ready' }));
    const inputActor = startActor({
      ...input({ display: { unit: 'mm', locale: 'en', increment: 1 } }),
      acknowledgedRevision: parameterSet.snapshot.identity,
      binding: {
        ...binding(),
        target: parameterSet.snapshot.target,
        parameterId: 'width',
        resource: parameterSet.snapshot.manifest.bindings['/width']!.schema.resource,
      },
    });
    inputActor.actor.send({ type: 'step', direction: 1 });
    const first = inputActor.emitted[0]!;
    const firstOutcome = await parameterSet.submit(first.request);
    expect(firstOutcome.status).toBe('known-not-applied-failure');
    inputActor.actor.send({
      type: 'settleSubmission',
      generation: first.request.draftGeneration,
      outcome: firstOutcome,
    });
    inputActor.actor.send({ type: 'discard' });
    inputActor.actor.send({ type: 'step', direction: 1 });
    const second = inputActor.emitted[1]!;
    expect(second.request.requestId).not.toBe(first.request.requestId);
    expect(second.request.draftGeneration).toBeGreaterThan(first.request.draftGeneration);

    const secondOutcome = await parameterSet.submit(second.request);
    expect(secondOutcome).toMatchObject({
      status: 'committed',
      requestId: second.request.requestId,
    });
    inputActor.actor.stop();
    parameterSet.actor.stop();
  });

  it('should retain an active settlement barrier through refresh, rebind, discard, and focus', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    const active = emitted[0]!;
    actor.send({ type: 'pressEscape' });
    expect(emitted).toHaveLength(1);
    expect(actor.getSnapshot().context.submission?.active.request.requestId).toBe(active.request.requestId);
    actor.send({
      type: 'refreshAuthority',
      binding: binding(),
      value: 50.8,
      revision: revision('9'),
    });
    actor.send({ type: 'rebind' });
    actor.send({ type: 'step', direction: 1 });
    expect(emitted).toHaveLength(1);
    actor.send({ type: 'pressEnter' });
    actor.send({ type: 'discard' });
    actor.send({ type: 'step', direction: 1 });
    expect(emitted).toHaveLength(1);
    actor.send({ type: 'focus' });
    actor.send({ type: 'step', direction: 1 });
    actor.send({ type: 'changeRaw', text: '3 in' });
    actor.send({ type: 'pressEnter' });
    expect(emitted).toHaveLength(1);
    expect(actor.getSnapshot().context.submission?.active.request.requestId).toBe(active.request.requestId);
    actor.stop();
  });

  it.each(['discard', 'rebind', 'focus'] as const)(
    'should block keyboard submission behind an indeterminate %s settlement',
    (route) => {
      const { actor, emitted } = startActor();
      actor.send({ type: 'focus' });
      actor.send({ type: 'changeRaw', text: '2 in' });
      actor.send({ type: 'pressEnter' });
      const active = emitted[0]!;
      actor.send({
        type: 'settleSubmission',
        generation: active.request.draftGeneration,
        outcome: {
          status: 'indeterminate',
          requestId: active.request.requestId,
          code: 'TEST_INDETERMINATE',
          message: 'Settlement remains unknown.',
        },
      });
      if (route === 'focus') {
        actor.send({ type: 'focus' });
        actor.send({ type: 'changeRaw', text: '4 in' });
      } else {
        actor.send({
          type: 'refreshAuthority',
          binding: binding(),
          value: 50.8,
          revision: revision('9'),
        });
        actor.send({ type: route });
      }
      actor.send({ type: 'step', direction: 1 });

      expect(emitted).toHaveLength(1);
      expect(actor.getSnapshot().context.submission?.active.request.requestId).toBe(active.request.requestId);
      actor.stop();
    },
  );

  it('should preserve refreshed authority when an obsolete binding settles late', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    const active = emitted[0]!;
    const renamed = binding({ pointer: '/renamed' });
    actor.send({
      type: 'refreshAuthority',
      binding: renamed,
      value: 90,
      revision: revision('9'),
    });
    actor.send({
      type: 'settleSubmission',
      generation: active.request.draftGeneration,
      outcome: committed(active, '2'),
    });
    expect(actor.getSnapshot().context.acknowledged).toMatchObject({
      binding: { pointer: '/renamed' },
      value: 90,
      revision: revision('9'),
    });
    expect(actor.getSnapshot().context.submission).toBeUndefined();
    actor.stop();
  });

  it('should retain an indeterminate barrier across Escape until a matching reconciliation settles', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    const active = emitted[0]!;
    actor.send({
      type: 'settleSubmission',
      generation: active.request.draftGeneration,
      outcome: {
        status: 'indeterminate',
        requestId: active.request.requestId,
        code: 'ACK_LOST',
        message: 'lost',
      },
    });
    actor.send({ type: 'pressEscape' });
    actor.send({ type: 'step', direction: 1 });
    expect(emitted).toHaveLength(1);
    actor.send({ type: 'focus' });
    actor.send({ type: 'step', direction: 1 });
    actor.send({ type: 'changeRaw', text: '3 in' });
    actor.send({ type: 'pressEnter' });
    expect(emitted).toHaveLength(1);
    expect(actor.getSnapshot().context.submission?.outcome?.status).toBe('indeterminate');

    actor.send({
      type: 'settleSubmission',
      generation: active.request.draftGeneration,
      outcome: committed(active, '2'),
    });
    actor.send({ type: 'pressEnter' });
    expect(emitted).toHaveLength(2);
    expect(emitted[1]?.request.expected).toEqual(revision('2'));
    actor.stop();
  });

  it('should convert fractional pointer and keyboard numbers without locale reinterpretation', () => {
    const pointer = startActor(input({ display: { unit: 'mm', locale: 'de-DE' } }));
    pointer.actor.send({ type: 'pointerChanged', value: 1.5 });
    pointer.actor.send({ type: 'pointerReleased' });
    expect(pointer.emitted[0]?.request.operation).toMatchObject({
      kind: 'native-value',
      value: 1.5,
    });
    expect(pointer.actor.getSnapshot().context.draft?.raw).toBe('1,5');
    pointer.actor.stop();

    const keyboard = startActor(
      input({
        acknowledgedValue: 1,
        display: { unit: 'mm', locale: 'de-DE', increment: 0.5 },
      }),
    );
    keyboard.actor.send({ type: 'step', direction: 1 });
    expect(keyboard.emitted[0]?.request.operation).toMatchObject({
      kind: 'native-value',
      value: 1.5,
    });
    expect(keyboard.actor.getSnapshot().context.draft?.raw).toBe('1,5');
    keyboard.actor.stop();
  });

  it.each(['50 %', '3 mm', '3 1'])('should reject explicit suffix %s when numeric semantics are unknown', (text) => {
    const { actor, emitted } = startActor(
      input({
        binding: unknownBinding(),
        acknowledgedValue: 2,
        display: { locale: 'en' },
      }),
    );
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text });
    expect(editing(actor, 'invalid')).toBe(true);
    expect(actor.getSnapshot().context.draft?.diagnostic).toMatchObject({
      code: 'SEMANTICS_UNRESOLVED',
    });
    actor.send({ type: 'pressEnter' });
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it('should keep a removed binding unavailable through discard and restore it only on valid refresh', () => {
    const { actor, emitted } = startActor();
    actor.send({
      type: 'refreshAuthority',
      value: 25.4,
      revision: revision('2'),
    });
    actor.send({ type: 'discard' });
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    expect(actor.getSnapshot().context.bindingAvailable).toBe(false);
    expect(emitted).toEqual([]);

    actor.send({
      type: 'refreshAuthority',
      binding: binding(),
      value: 25.4,
      revision: revision('3'),
    });
    actor.send({ type: 'discard' });
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    expect(emitted[0]?.request.expected).toEqual(revision('3'));
    actor.stop();
  });

  it.each([
    {
      type: 'changeDisplay',
      display: { unit: 'mm', locale: 'en', increment: () => 1 },
    },
    { type: 'pointerChanged', value: Number.POSITIVE_INFINITY },
    {
      type: 'refreshAuthority',
      binding: { ...binding(), constraints: { callback: () => undefined } },
      value: 2,
      revision: revision('2'),
    },
  ])('should reject a non-serializable runtime event without corrupting context', (event) => {
    const { actor, emitted } = startActor();
    sendUnchecked(actor, event);
    expect(interaction(actor, 'failed')).toBe(true);
    expect(actor.getSnapshot().context.diagnostic).toEqual({
      code: 'METADATA_CONFLICT',
      message: 'Parameter input event is malformed or not serializable.',
    });
    expect(() => structuredClone(actor.getSnapshot().context)).not.toThrow();
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it.each(['focus', 'detach', 'close'] as const)(
    'should reject extra non-serializable payload on the named %s event before transition',
    (type) => {
      const { actor, emitted } = startActor();
      sendUnchecked(actor, { type, callback: () => undefined });
      expect(interaction(actor, 'failed')).toBe(true);
      expect(actor.getSnapshot().context.diagnostic).toEqual({
        code: 'METADATA_CONFLICT',
        message: 'Parameter input event is malformed or not serializable.',
      });
      expect(actor.getSnapshot().status).toBe('active');
      expect(emitted).toEqual([]);
      actor.stop();
    },
  );

  it('should reject a non-serializable settlement without losing the active identity', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    const active = emitted[0]!;
    sendUnchecked(actor, {
      type: 'settleSubmission',
      generation: active.request.draftGeneration,
      outcome: { ...committed(active), callback: () => undefined },
    });
    expect(interaction(actor, 'failed')).toBe(true);
    expect(actor.getSnapshot().context.submission?.active.request.requestId).toBe(active.request.requestId);
    expect(() => structuredClone(actor.getSnapshot().context)).not.toThrow();
    actor.stop();
  });

  it.each([
    {
      status: 'rejected',
      code: 'STALE_MANIFEST',
      expected: 'conflicted',
      retry: false,
    },
    {
      status: 'known-not-applied-failure',
      code: 'WRITE_FAILED',
      expected: 'failed',
      retry: true,
    },
    {
      status: 'indeterminate',
      code: 'ACK_LOST',
      expected: 'failed',
      retry: false,
    },
  ] as const)('should represent $status settlement without unsafe replay', ({ status, code, expected, retry }) => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    const intent = emitted[0]!;
    actor.send({
      type: 'settleSubmission',
      generation: intent.request.draftGeneration,
      outcome: {
        status,
        requestId: intent.request.requestId,
        code,
        message: code,
      },
    });
    expect(interaction(actor, expected)).toBe(true);
    actor.send({ type: 'retry' });
    expect(emitted).toHaveLength(retry ? 2 : 1);
    actor.stop();
  });

  it('should retain acknowledgement when submission is cancelled before apply', () => {
    const { actor, emitted } = startActor();
    actor.send({ type: 'focus' });
    actor.send({ type: 'changeRaw', text: '2 in' });
    actor.send({ type: 'pressEnter' });
    const intent = emitted[0]!;
    actor.send({
      type: 'settleSubmission',
      generation: intent.request.draftGeneration,
      outcome: {
        status: 'cancelled-before-apply',
        requestId: intent.request.requestId,
      },
    });
    expect(interaction(actor, 'viewing')).toBe(true);
    expect(actor.getSnapshot().context.acknowledged.value).toBe(25.4);
    actor.stop();
  });

  it('should apply constrained arrow intent with captured modifiers', () => {
    const { actor, emitted } = startActor(
      input({
        binding: binding({
          constraints: { minimum: 0, maximum: 10, multipleOf: 0.5 },
        }),
        acknowledgedValue: 9,
        display: { unit: 'mm', locale: 'en', increment: 0.25 },
      }),
    );
    actor.send({ type: 'step', direction: 1, modifiers: { shift: true } });
    expect(interaction(actor, 'submitting')).toBe(true);
    expect(emitted[0]?.request.operation).toMatchObject({
      kind: 'native-value',
      value: 10,
    });
    actor.stop();
  });

  it('should release clean detach and retain dirty or in-flight state until discard or close', () => {
    const clean = startActor();
    clean.actor.send({ type: 'detach' });
    expect(
      clean.actor.getSnapshot().matches({
        active: { attachment: 'detached', interaction: 'viewing' },
      }),
    ).toBe(true);
    clean.actor.send({ type: 'attach' });
    expect(clean.actor.getSnapshot().matches({ active: { attachment: 'attached' } })).toBe(true);
    expect(clean.emitted).toEqual([]);
    clean.actor.stop();

    const discarded = startActor();
    discarded.actor.send({ type: 'focus' });
    discarded.actor.send({ type: 'changeRaw', text: '2 in' });
    discarded.actor.send({ type: 'detach' });
    discarded.actor.send({ type: 'discard' });
    expect(
      discarded.actor.getSnapshot().matches({
        active: { attachment: 'detached', interaction: 'viewing' },
      }),
    ).toBe(true);
    expect(discarded.actor.getSnapshot().context.draft).toBeUndefined();
    expect(discarded.emitted).toEqual([]);
    discarded.actor.stop();

    const dirty = startActor();
    dirty.actor.send({ type: 'focus' });
    dirty.actor.send({ type: 'changeRaw', text: '2 in' });
    dirty.actor.send({ type: 'detach' });
    expect(dirty.actor.getSnapshot().matches({ active: { attachment: 'detached' } })).toBe(true);
    expect(editing(dirty.actor, 'complete-valid')).toBe(true);
    expect(dirty.actor.getSnapshot().context.draft?.raw).toBe('2 in');
    dirty.actor.send({ type: 'pressEnter' });
    dirty.actor.send({ type: 'detach' });
    expect(interaction(dirty.actor, 'submitting')).toBe(true);
    expect(dirty.actor.getSnapshot().context.submission).toBeDefined();
    dirty.actor.send({ type: 'close' });
    expect(dirty.actor.getSnapshot().status).toBe('done');
    dirty.actor.stop();
  });
});
