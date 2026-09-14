import { assertType, expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { parameterSetMachine } from '#parameter-set.machine.js';
import type {
  ParameterSetMachineEvent,
  ParameterSetMachineInput,
  ParameterSetOutcome,
  ParameterSetRequest,
} from '#parameter-set.machine.js';

expectTypeOf(parameterSetMachine).toExtend<AnyStateMachine>();

assertType<ParameterSetMachineInput>({
  target: { authority: 'node:project', root: '/project', checkout: 'main', entry: 'main.ts' },
  initialRequestId: 'resolve:initial',
});

const request: ParameterSetRequest = {
  requestId: 'request-1',
  draftGeneration: 1,
  fingerprint: 'fingerprint:1',
  expected: {
    sourceRevision: 'source:1',
    manifestRevision: 'manifest:1',
    valueRevision: 'value:1',
    dependencyRevision: 'dependency:1',
  },
  pressure: 'final',
  operation: {
    kind: 'unit-value',
    group: 'default',
    parameterId: 'width',
    resource: 'urn:test:schema',
    pointer: '/width',
    inputUnit: 'in',
    value: '1/2',
  },
};

assertType<ParameterSetMachineEvent>({ type: 'submit', request });
assertType<ParameterSetOutcome>({
  status: 'committed',
  requestId: 'request-1',
  revision: request.expected,
  write: 'authority-no-op',
});

assertType<ParameterSetRequest>({
  ...request,
  operation: {
    kind: 'native-value',
    group: 'default',
    parameterId: 'width',
    resource: 'urn:test:schema',
    pointer: '/width',
    value: { nested: [1, true, null, { label: 'valid' }] },
  },
});

assertType<ParameterSetRequest>({
  ...request,
  operation: { kind: 'create-group', group: 'large', values: { width: 100, nested: [true, null] } },
});

assertType<ParameterSetRequest>({
  ...request,
  operation: { kind: 'delete-group', group: 'large' },
});

assertType<ParameterSetRequest>({
  ...request,
  operation: {
    kind: 'native-value',
    group: 'default',
    parameterId: 'width',
    resource: 'urn:test:schema',
    pointer: '/width',
    // @ts-expect-error -- persisted operation values must be JSON-compatible before admission
    value: 12n,
  },
});

assertType<ParameterSetMachineInput>({
  target: { authority: 'a', root: '/', entry: 'main.ts' },
  initialRequestId: 'r',
  // @ts-expect-error -- callback/service objects are not part of serializable machine input
  read: () => undefined,
});

// @ts-expect-error -- confirmation must carry the exact plan fingerprint vocabulary
assertType<ParameterSetMachineEvent>({ type: 'confirm', requestId: 'request-1' });
