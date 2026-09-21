import { assertType, expectTypeOf } from 'vitest';
import type { AnyStateMachine, SnapshotFrom } from 'xstate';
import type { JSONValue, ParameterGroup } from '@taucad/types';

import { parameterSetMachine } from '#parameter-set.machine.js';
import type {
  ParameterSetEmission,
  ParameterSetMachineEvent,
  ParameterSetMachineInput,
} from '#parameter-set.machine.js';
import type { ParameterSetIdentity, ParameterSetOperation, ParameterSetOutcome, ParameterSetRequest } from '#types.js';

expectTypeOf(parameterSetMachine).toExtend<AnyStateMachine>();

const identity: ParameterSetIdentity = { manifestRevision: 'manifest:1' };
expectTypeOf<ParameterSetIdentity>().toEqualTypeOf<Readonly<{ manifestRevision: string }>>();
expectTypeOf<ParameterGroup>().toEqualTypeOf<{
  values: Record<string, JSONValue>;
  units?: Record<string, string>;
  sourceUnits?: Record<string, string>;
}>();
// A field is named by its group and pointer under the manifest revision the request declares.
const field = { group: 'default', pointer: '/width' } as const;

// Every operation kind is a positive fixture of the public operation union.
const operations = [
  { kind: 'native-value', ...field, value: 1 },
  { kind: 'unit-value', ...field, inputUnit: 'cm', value: '1' },
  { kind: 'batch', group: 'default', edits: [{ ...field, value: 1, inputUnit: 'cm' }] },
  { kind: 'reset-group', group: 'default' },
  { kind: 'replace-group-values', group: 'default', values: { width: 1 } },
  { kind: 'create-group', group: 'second', values: { width: 1 } },
  { kind: 'delete-group', group: 'second' },
  { kind: 'select-group', group: 'second' },
  { kind: 'rename-group', group: 'second', nextGroup: 'third' },
  {
    kind: 'source-unit',
    mode: 'preserve-size',
    ...field,
    unit: 'cm',
    producerCapability: { producer: 'fixture', sourceRevision: 'source:1', capability: 'change-source-unit:v1' },
  },
] as const satisfies readonly ParameterSetOperation[];
expectTypeOf(operations).toExtend<readonly ParameterSetOperation[]>();

const request: ParameterSetRequest = {
  requestId: 'edit',
  pressure: 'final',
  expected: identity,
  base: { pointer: '/width', value: 1, binding: { unit: 'mm', representation: 'binary64' } },
  operation: operations[0],
};
expectTypeOf(request.fingerprint).toEqualTypeOf<string | undefined>();

assertType<ParameterSetOperation>({
  // @ts-expect-error -- the operation vocabulary is closed
  kind: 'set-everything',
  group: 'default',
});
assertType<ParameterSetOperation>({
  kind: 'native-value',
  ...field,
  // @ts-expect-error -- the package derives identity from the pinned manifest
  parameterId: `${'sha256:1'}:/width`,
  value: 1,
});
assertType<ParameterSetOperation>({
  kind: 'unit-value',
  ...field,
  inputUnit: 'cm',
  // @ts-expect-error -- no caller spells the root schema resource any more
  resource: 'urn:taucad:parameter-schema:root',
  value: '1',
});
assertType<ParameterSetOperation>({
  kind: 'batch',
  group: 'default',
  // @ts-expect-error -- a batch edit is a pointer and a value; it carries no identity either
  edits: [{ pointer: '/width', parameterId: 'width', resource: 'urn:test', value: 1 }],
});
assertType<ParameterSetOperation>({
  kind: 'source-unit',
  mode: 'preserve-size',
  ...field,
  unit: 'cm',
  // @ts-expect-error -- source-unit keeps its producer pin and drops the field pair like every other kind
  parameterId: 'width',
  producerCapability: { producer: 'fixture', sourceRevision: 'source:1', capability: 'change-source-unit:v1' },
});
assertType<ParameterSetOperation>({
  // @ts-expect-error -- user-authored kind, space and reference claims were retired with the record ledger
  kind: 'bind-parameter',
  ...field,
  binding: { unit: 'mm' },
});
assertType<ParameterSetOperation>({
  // @ts-expect-error -- display preferences are not parameter record operations
  kind: 'display-preference',
  parameterId: 'width',
  unit: 'cm',
});
assertType<ParameterSetOperation>({
  kind: 'source-unit',
  // @ts-expect-error -- source-unit changes preserve physical size
  mode: 'reinterpret',
  ...field,
  unit: 'cm',
  producerCapability: { producer: 'fixture', sourceRevision: 'source:1', capability: 'change-source-unit:v1' },
});
assertType<ParameterSetRequest>({
  ...request,
  // @ts-expect-error -- pressure is transient or final
  pressure: 'eager',
});

const outcomes = [
  { status: 'committed', requestId: 'a', revision: identity, write: 'applied' },
  { status: 'rejected', requestId: 'a', code: 'STALE_MANIFEST', message: 'stale' },
  { status: 'cancelled-before-apply', requestId: 'a' },
  { status: 'known-not-applied-failure', requestId: 'a', code: 'APPLY_REFUSED', message: 'refused' },
  { status: 'indeterminate', requestId: 'a', code: 'UNKNOWN_APPLICATION', message: 'unknown' },
] as const satisfies readonly ParameterSetOutcome[];
expectTypeOf(outcomes).toExtend<readonly ParameterSetOutcome[]>();
assertType<ParameterSetOutcome>({
  status: 'committed',
  requestId: 'a',
  revision: identity,
  // @ts-expect-error -- the write classification is closed
  write: 'probably',
});

// Settlements always name the request they settle; request-less rejections are a distinct emission.
declare const emission: ParameterSetEmission;
if (emission.type === 'settled') {
  expectTypeOf(emission.request).toEqualTypeOf<ParameterSetRequest>();
  expectTypeOf(emission.current).toEqualTypeOf<ParameterSetIdentity | undefined>();
}
if (emission.type === 'command-rejected') {
  expectTypeOf(emission.outcome.status).toEqualTypeOf<'rejected'>();
  // @ts-expect-error -- a command rejection never carries a submitted request
  void emission.request;
}
assertType<ParameterSetEmission>({
  type: 'settled',
  outcome: outcomes[2],
  // @ts-expect-error -- settled emissions require the settled request
  request: undefined,
});

assertType<ParameterSetMachineEvent>({ type: 'confirm', requestId: 'unit', fingerprint: 'sha256:plan' });
assertType<ParameterSetMachineEvent>({ type: 'close', invalidDrafts: ['width'] });
// @ts-expect-error -- confirmation requires the plan fingerprint
assertType<ParameterSetMachineEvent>({ type: 'confirm', requestId: 'unit' });
assertType<ParameterSetMachineEvent>({
  type: 'resolve',
  // @ts-expect-error -- resolution modes are closed
  resolution: { mode: 'guess' },
});

const input: ParameterSetMachineInput = { target: { authority: 'memory', root: '/project', entry: 'main.ts' } };
expectTypeOf(input.resolution).toEqualTypeOf<ParameterSetMachineInput['resolution']>();

declare const snapshot: SnapshotFrom<typeof parameterSetMachine>;
expectTypeOf(snapshot.context.pending).toEqualTypeOf<readonly ParameterSetRequest[]>();
expectTypeOf(snapshot.context.diagnostic).toEqualTypeOf<Readonly<{ code: string; message: string }> | undefined>();
