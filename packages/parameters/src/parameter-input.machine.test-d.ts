import { assertType, expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { parameterInputMachine } from '#parameter-input.machine.js';
import type {
  ParameterInputMachineContext,
  ParameterInputMachineEmitted,
  ParameterInputMachineEvent,
  ParameterInputMachineInput,
} from '#parameter-input.machine.js';

expectTypeOf(parameterInputMachine).toExtend<AnyStateMachine>();

const input: ParameterInputMachineInput = {
  editorInstance: 'editor:width',
  binding: {
    target: { authority: 'node:project', root: '/project', checkout: 'main', entry: 'main.ts' },
    group: 'default',
    parameterId: 'width',
    resource: 'urn:test:schema',
    pointer: '/width',
    nativeUnit: 'mm',
    representation: 'binary64',
    constraints: { minimum: 0, maximum: 100 },
  },
  acknowledgedValue: 25.4,
  acknowledgedRevision: {
    sourceRevision: 'source:1',
    manifestRevision: 'manifest:1',
    valueRevision: 'value:1',
    dependencyRevision: 'dependency:1',
  },
  display: { unit: '[in_i]', locale: 'en-NZ', increment: 0.125 },
  pressure: 'continual',
};

assertType<ParameterInputMachineInput>(input);
assertType<ParameterInputMachineInput>({
  ...input,
  binding: {
    target: input.binding.target,
    group: 'default',
    parameterId: 'width',
    resource: 'urn:test:schema',
    pointer: '/width',
    representation: 'binary64',
    constraints: {},
  },
  display: { locale: 'en-NZ' },
});
assertType<ParameterInputMachineEvent>({ type: 'focus' });
assertType<ParameterInputMachineEvent>({ type: 'changeRaw', text: '1/2 in' });
assertType<ParameterInputMachineEvent>({ type: 'step', direction: 1, modifiers: { shift: true } });
assertType<ParameterInputMachineEvent>({ type: 'pointerChanged', value: 1.5, modifiers: { alt: true } });
assertType<ParameterInputMachineEvent>({ type: 'changeDisplay', display: { unit: 'cm', locale: 'de-DE' } });
assertType<ParameterInputMachineEvent>({
  type: 'refreshAuthority',
  value: 10,
  revision: input.acknowledgedRevision,
});
assertType<ParameterInputMachineEvent>({ type: 'discard' });
assertType<ParameterInputMachineEmitted>({
  type: 'parameterSetIntent',
  target: input.binding.target,
  locale: 'en-NZ',
  request: {
    requestId: 'editor:width:1',
    draftGeneration: 1,
    fingerprint: 'fingerprint:1',
    expected: input.acknowledgedRevision,
    pressure: 'final',
    operation: {
      kind: 'unit-value',
      group: 'default',
      parameterId: 'width',
      resource: 'urn:test:schema',
      pointer: '/width',
      inputUnit: '[in_i]',
      value: '1/2 in',
    },
  },
});

declare const context: ParameterInputMachineContext;
expectTypeOf(context.draft?.raw).toEqualTypeOf<string | undefined>();
expectTypeOf(context.submission?.active.request.draftGeneration).toEqualTypeOf<number | undefined>();
expectTypeOf(context.sequence).toEqualTypeOf<number>();
expectTypeOf(context.bindingAvailable).toEqualTypeOf<boolean>();
expectTypeOf(context.draft?.source).toEqualTypeOf<'text' | 'numeric' | undefined>();

assertType<ParameterInputMachineInput>({
  ...input,
  // @ts-expect-error -- pressure is a closed public contract
  pressure: 'eager',
});

assertType<ParameterInputMachineEvent>({
  type: 'step',
  // @ts-expect-error -- direction must describe one arrow step
  direction: 2,
});

assertType<ParameterInputMachineInput>({
  ...input,
  // @ts-expect-error -- callbacks and actor references are not serializable machine input
  onCommit: () => undefined,
});
