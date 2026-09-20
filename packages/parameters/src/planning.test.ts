import { createActor, fromPromise, waitFor } from 'xstate';
import { parameterSetMachine, submitParameterRequest } from '#parameter-set.machine.js';
import { commitParameterChange } from '#authority.js';
import type { ParameterAuthority } from '#authority.js';
import { contentDigest } from '@taucad/cache-core';
import { createQuantity, convert } from '@taucad/units/quantity';
import { expect, it } from 'vitest';
import {
  compileParameterManifest,
  parameterRecordInputValues,
  resolveParameterSnapshot,
  planParameterChange,
  resolveEffectiveParameterBinding,
  resolveParameterInputValues,
  readParameterRecord,
} from '@taucad/parameters';
import type { ParameterSetTarget, ParameterSetRequest } from '#types.js';

const target: ParameterSetTarget = {
  authority: 'memory',
  root: '/project',
  entry: 'main.ts',
};
const path = '.tau/parameters/main.ts.json';
const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });

const manifest = async (sourceUnit = true, revision = digest) =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: { width: { type: 'double', ucumUnit: 'mm', minimum: 0 } },
      },
      defaults: { width: 100 },
      bindings: {
        '/width': {
          parameterId: 'width',
          quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
          space: 'linear',
          ...(sourceUnit
            ? {
                unit: 'mm',
                sourceUnitCapability: 'change-source-unit:preserve-size:v1',
              }
            : {}),
        },
      },
    },
    scope: {
      kind: 'source',
      authority: 'memory',
      root: '/project',
      entry: 'main.ts',
    },
    source: {
      id: 'fixture',
      version: '1',
      revision,
      capability: 'json-structure',
    },
    dependency: revision,
    middleware: digest,
  });

it('plans one checked first write without creating a record during resolution', async () => {
  const admitted = await manifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  expect(current.bytes).toBeNull();
  const before = structuredClone(current);
  const request: ParameterSetRequest = {
    requestId: 'edit:1',
    fingerprint: 'caller-label',
    pressure: 'final',
    expected: current.identity,
    operation: {
      kind: 'native-value',
      group: 'default',
      parameterId: 'width',
      resource: admitted.bindings['/width']!.schema.resource,
      pointer: '/width',
      value: 101,
    },
  };
  const plan = planParameterChange({ current, request });
  if (plan.status !== 'prepared') {
    throw new Error(JSON.stringify(plan));
  }
  // The sidecar's own bytes are the only precondition: no source file is pinned or digested.
  expect(plan.write.preconditions).toEqual([{ path, expected: null }]);
  expect(plan.proposed.entry.groups['default']?.values).toEqual({ width: 101 });
  expect(current).toEqual(before);
  expect(planParameterChange({ current, request })).toEqual(plan);
});

it('rejects deleting the last group through the pure API', async () => {
  const current = resolveParameterSnapshot({ target, manifest: await manifest(), path, bytes: null });
  const plan = planParameterChange({
    current,
    request: {
      requestId: 'delete',
      fingerprint: 'delete',
      pressure: 'final',
      expected: current.identity,
      operation: { kind: 'delete-group', group: 'default' },
    },
  });
  expect(plan).toMatchObject({ status: 'rejected', code: 'LAST_GROUP_DELETE' });
});

it('names the missing group when a value edit addresses one that does not exist', async () => {
  const admitted = await manifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const plan = planParameterChange({
    current,
    request: {
      requestId: 'edit:absent',
      fingerprint: 'absent',
      pressure: 'final',
      expected: current.identity,
      operation: {
        kind: 'native-value',
        group: 'metric',
        parameterId: 'width',
        resource: admitted.bindings['/width']!.schema.resource,
        pointer: '/width',
        value: 101,
      },
    },
  });
  expect(plan).toMatchObject({ status: 'rejected', code: 'GROUP_NOT_FOUND' });
});

it('requires explicit source-unit confirmation before one record write', async () => {
  const admitted = await manifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const request: ParameterSetRequest = {
    requestId: 'source-unit',
    fingerprint: 'untrusted-label',
    pressure: 'final',
    expected: current.identity,
    operation: {
      kind: 'source-unit',
      mode: 'preserve-size',
      group: 'default',
      parameterId: 'width',
      resource: admitted.bindings['/width']!.schema.resource,
      pointer: '/width',
      unit: 'cm',
      producerCapability: {
        producer: 'fixture',
        sourceRevision: admitted.source.revision,
        capability: 'change-source-unit:preserve-size:v1',
      },
    },
  };
  const plan = planParameterChange({ current, request });
  expect(plan.status).toBe('prepared');
  if (plan.status !== 'prepared' || plan.confirmation === undefined) {
    throw new Error('Expected confirmation plan');
  }
  let writes = 0;
  const authority: Pick<ParameterAuthority, 'writeChecked'> = {
    writeChecked: async (write) => {
      writes += 1;
      return {
        status: 'applied',
        content: typeof write.data === 'string' ? new TextEncoder().encode(write.data) : write.data,
      };
    },
  };
  await expect(
    commitParameterChange({ change: plan, authority, signal: new AbortController().signal }),
  ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED', applicationState: 'known-not-applied' });
  expect(writes).toBe(0);
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: fromPromise(async () => current),
        commitParameterSet: fromPromise(async ({ input: change, signal }) =>
          commitParameterChange({ change, signal, authority }),
        ),
      },
    }),
    { input: { target } },
  );
  actor.start();
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  const submission = submitParameterRequest(actor, request);
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'confirmation' }));
  expect(writes).toBe(0);
  actor.send({ type: 'confirm', requestId: request.requestId, fingerprint: `${request.requestId}:not-the-plan` });
  expect(actor.getSnapshot().matches({ open: 'confirmation' })).toBe(true);
  actor.send({ type: 'confirm', requestId: request.requestId, fingerprint: plan.confirmation.planFingerprint });
  await expect(submission).resolves.toMatchObject({ status: 'committed', write: 'applied' });
  expect(writes).toBe(1);
  if (request.operation.kind !== 'source-unit') {
    throw new Error('Expected a source-unit operation');
  }
  const cancelled = submitParameterRequest(actor, {
    ...request,
    requestId: 'source-unit-cancel',
    expected: plan.proposed.identity,
    operation: { ...request.operation, unit: 'mm' },
  });
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'confirmation' }));
  actor.send({ type: 'cancel', requestId: 'source-unit-cancel' });
  await expect(cancelled).resolves.toEqual({ status: 'cancelled-before-apply', requestId: 'source-unit-cancel' });
  expect(writes).toBe(1);
  actor.stop();
});

it('executes unknown numbers, array units, and affine text while refusing decimal execution', async () => {
  const admitted = await compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:numeric-coverage',
        $uses: ['JSONSchemaUnits'],
        name: 'NumericCoverage',
        type: 'object',
        properties: {
          opaque: { type: 'double' },
          exact: { type: 'decimal' },
          samples: { type: 'array', items: { type: 'double', ucumUnit: 'mm' } },
          temperature: { type: 'double', ucumUnit: 'Cel' },
        },
      },
      defaults: { opaque: 2, exact: '0.1234567890123456789', samples: [1, 2], temperature: 0 },
      bindings: {
        '/temperature': {
          quantityKind: 'http://qudt.org/vocab/quantitykind/Temperature',
          space: 'point',
          reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
        },
      },
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
  });

  const resolved = resolveParameterInputValues(admitted, {
    opaque: 3,
    samples: ['1 cm', '2 cm'],
    temperature: '32 °F',
  });
  expect(resolved).toMatchObject({ opaque: 3, samples: [10, 20] });
  // Affine conversion through absolute zero leaves one ulp of 273.15; the value is persisted as computed.
  expect(resolved['temperature']).toBe(Number.EPSILON * 256);
  expect(() => resolveParameterInputValues(admitted, { exact: '0.1234567890123456789' })).toThrow(
    'Decimal parameter data is preserved but cannot be executed exactly.',
  );
});

it('converts unit-bearing text once while retaining native numeric overrides', async () => {
  const admitted = await manifest();

  const unitBearing = resolveParameterInputValues(admitted, {
    width: '1/2 in',
  });
  expect(unitBearing['width']).toBeCloseTo(12.7, 12);
  expect(resolveParameterInputValues(admitted, { width: 150 })).toEqual({
    width: 150,
  });
});

it('should render a sourceUnits field as unit-bearing text and a units-only field as its number', () => {
  expect(
    parameterRecordInputValues({
      activeGroup: 'default',
      groups: {
        default: {
          values: { sourceLength: 20, labelledLength: 30 },
          units: { '/sourceLength': 'in', '/labelledLength': 'cm' },
          sourceUnits: { '/sourceLength': 'in' },
        },
        inactive: { values: { sourceLength: 99 } },
      },
    }),
  ).toEqual({ sourceLength: '20 in', labelledLength: 30 });
});

it.each([
  { name: 'in', storedUnit: '[in_i]', storedValue: 2, nativeUnit: 'mm', nativeValue: 50.8 },
  { name: 'ft', storedUnit: '[ft_i]', storedValue: 2, nativeUnit: 'mm', nativeValue: 609.6 },
  { name: 'cm', storedUnit: 'cm', storedValue: 2, nativeUnit: 'mm', nativeValue: 20 },
  { name: 'm', storedUnit: 'm', storedValue: 2, nativeUnit: 'mm', nativeValue: 2000 },
  {
    name: 'point space',
    storedUnit: '[degF]',
    storedValue: 32,
    nativeUnit: 'Cel',
    nativeValue: Number.EPSILON * 256,
  },
  { name: 'safe integer', storedUnit: 'mm', storedValue: 5, nativeUnit: 'mm', nativeValue: 5, integer: true },
])('should convert a stored value identically as text and as a number ($name)', async (testCase) => {
  const admitted = await compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: `urn:test:record-input:${testCase.name}`,
        $uses: ['JSONSchemaUnits'],
        name: 'RecordInput',
        type: 'object',
        properties: {
          value: { type: testCase.integer === true ? 'integer' : 'double', ucumUnit: testCase.nativeUnit },
        },
      },
      defaults: { value: testCase.nativeValue },
      ...(testCase.name === 'point space'
        ? {
            bindings: {
              '/value': {
                quantityKind: 'http://qudt.org/vocab/quantitykind/Temperature',
                space: 'point',
                reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
              },
            },
          }
        : {}),
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
  });
  const recordInput = parameterRecordInputValues({
    activeGroup: 'default',
    groups: {
      default: {
        values: { value: testCase.storedValue },
        units: { '/value': testCase.storedUnit },
        sourceUnits: { '/value': testCase.storedUnit },
      },
    },
  });
  const numeric = createQuantity({
    value: testCase.storedValue,
    representation: testCase.integer === true ? 'safe-integer' : 'binary64',
    unit: testCase.storedUnit,
    space: testCase.name === 'point space' ? 'point' : 'linear',
    ...(testCase.name === 'point space'
      ? {
          kind: 'http://qudt.org/vocab/quantitykind/Temperature',
          reference: 'urn:taucad:reference:thermodynamic-absolute-zero',
        }
      : {}),
  });
  if (numeric.status !== 'success') {
    throw new Error(JSON.stringify(numeric.diagnostic));
  }
  const converted = convert({ quantity: numeric.value, to: testCase.nativeUnit });
  if (converted.status !== 'success') {
    throw new Error(JSON.stringify(converted.diagnostic));
  }

  expect(resolveParameterInputValues(admitted, recordInput)).toEqual({ value: converted.value.value });
});

it('writes arbitrary JSON property names without traversing object prototypes', async () => {
  const admitted = compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:prototype-keys',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: {
          ['__proto__']: {
            type: 'object',
            properties: {
              unitsAuditMarker: { type: 'double', ucumUnit: 'mm' },
            },
          },
          constructor: {
            type: 'object',
            properties: {
              prototype: {
                type: 'object',
                properties: {
                  value: { type: 'double', ucumUnit: 'mm' },
                },
              },
            },
          },
          'safe/branch': {
            type: 'object',
            properties: {
              '~leaf': { type: 'double', ucumUnit: 'mm' },
            },
          },
        },
      },
      defaults: {},
      bindings: {
        '/__proto__/unitsAuditMarker': {
          parameterId: 'prototype-marker',
        },
        '/constructor/prototype/value': { parameterId: 'constructor-value' },
        '/safe~1branch/~0leaf': { parameterId: 'escaped-value' },
      },
    },
    scope: {
      kind: 'source',
      authority: 'memory',
      root: '/project',
      entry: 'main.ts',
    },
    source: {
      id: 'fixture',
      version: '1',
      revision: digest,
      capability: 'json-structure',
    },
    dependency: digest,
    middleware: digest,
  });
  const current = resolveParameterSnapshot({
    target,
    manifest: await admitted,
    path,
    bytes: null,
  });
  const operation: ParameterSetRequest = {
    requestId: 'write-prototype-keys',
    fingerprint: 'fingerprint:write-prototype-keys',
    expected: current.identity,
    pressure: 'final',
    operation: {
      kind: 'batch',
      group: 'default',
      edits: [
        {
          parameterId: 'prototype-marker',
          resource: 'urn:taucad:parameter-schema:root',
          pointer: '/__proto__/unitsAuditMarker',
          value: 42,
        },
        {
          parameterId: 'constructor-value',
          resource: 'urn:taucad:parameter-schema:root',
          pointer: '/constructor/prototype/value',
          value: 7,
        },
        {
          parameterId: 'escaped-value',
          resource: 'urn:taucad:parameter-schema:root',
          pointer: '/safe~1branch/~0leaf',
          value: 3,
        },
      ],
    },
  };

  try {
    const plan = planParameterChange({ current, request: operation });
    expect(plan.status).toBe('prepared');
    if (plan.status !== 'prepared') {
      throw new Error('Expected a ready plan');
    }
    expect(Object.hasOwn(plan.proposed.entry.groups['default']!.values, '__proto__')).toBe(true);
    expect(plan.proposed.entry.groups['default']!.values).toMatchObject({
      constructor: { prototype: { value: 7 } },
      'safe/branch': { '~leaf': 3 },
    });
    const decoded = readParameterRecord(plan.proposed.bytes!);
    expect(decoded.status).toBe('current');
    if (decoded.status !== 'current') {
      throw new Error('Expected current record');
    }
    expect(Object.hasOwn(decoded.record.groups['default']!.values, '__proto__')).toBe(true);
    expect(Reflect.get(decoded.record.groups['default']!.values, '__proto__')).toEqual({
      unitsAuditMarker: 42,
    });
    expect(Reflect.get({}, 'unitsAuditMarker')).toBeUndefined();
  } finally {
    Reflect.deleteProperty(Object.prototype, 'unitsAuditMarker');
  }
});

it('uses the captured sidecar bytes if the caller mutates input during manifest admission', async () => {
  const admitted = await manifest();
  const input: Parameters<typeof resolveParameterSnapshot>[0] = { target, manifest: admitted, path, bytes: null };
  const loaded = resolveParameterSnapshot(input);
  Object.assign(input, { bytes: new TextEncoder().encode('invalid') });
  expect(loaded).toMatchObject({ bytes: null, entry: { activeGroup: 'default' } });
});

const twoFieldManifest = async () =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: {
          width: { type: 'double', ucumUnit: 'mm', minimum: 0 },
          height: { type: 'double', ucumUnit: 'mm', minimum: 0 },
        },
      },
      defaults: { width: 100, height: 14 },
      bindings: {
        '/width': {
          parameterId: 'width',
          quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
          space: 'linear',
        },
        '/height': {
          parameterId: 'height',
          quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
          space: 'linear',
        },
      },
    },
    scope: { kind: 'source', authority: 'memory', root: '/project', entry: 'main.ts' },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
  });

const fieldBase = (pointer: string, value: number): NonNullable<ParameterSetRequest['base']> => ({
  pointer,
  value,
  binding: {
    unit: 'mm',
    quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
    space: 'linear',
    representation: 'binary64',
  },
});

const fieldRequest = (
  admitted: Awaited<ReturnType<typeof twoFieldManifest>>,
  input: Readonly<{
    requestId: string;
    pointer: string;
    parameterId: string;
    value: number;
    expected: ParameterSetRequest['expected'];
    base?: ParameterSetRequest['base'];
  }>,
): ParameterSetRequest => ({
  requestId: input.requestId,
  fingerprint: `${input.requestId}:label`,
  pressure: 'final',
  expected: input.expected,
  ...(input.base === undefined ? {} : { base: input.base }),
  operation: {
    kind: 'native-value',
    group: 'default',
    parameterId: input.parameterId,
    resource: admitted.bindings[input.pointer]!.schema.resource,
    pointer: input.pointer,
    value: input.value,
  },
});

it('rebases a draft whose record revision moved only because another field changed', async () => {
  const admitted = await twoFieldManifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const first = planParameterChange({
    current,
    request: fieldRequest(admitted, {
      requestId: 'width:1',
      pointer: '/width',
      parameterId: 'width',
      value: 101,
      expected: current.identity,
    }),
  });
  if (first.status !== 'prepared') {
    throw new Error(JSON.stringify(first));
  }
  // The record moved; its identity did not, because only the manifest is named there.
  expect(first.proposed.bytes).not.toEqual(current.bytes);
  expect(first.proposed.identity).toEqual(current.identity);

  // The height editor still holds the pre-edit revision and has never been refreshed.
  const second = planParameterChange({
    current: first.proposed,
    request: fieldRequest(admitted, {
      requestId: 'height:1',
      pointer: '/height',
      parameterId: 'height',
      value: 15,
      expected: current.identity,
      base: fieldBase('/height', 14),
    }),
  });
  if (second.status !== 'prepared') {
    throw new Error(JSON.stringify(second));
  }
  expect(second.proposed.entry.groups['default']?.values).toEqual({ width: 101, height: 15 });
});

it('refuses a rebase when the field the draft touches changed underneath it', async () => {
  const admitted = await twoFieldManifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const first = planParameterChange({
    current,
    request: fieldRequest(admitted, {
      requestId: 'width:1',
      pointer: '/width',
      parameterId: 'width',
      value: 101,
      expected: current.identity,
    }),
  });
  if (first.status !== 'prepared') {
    throw new Error(JSON.stringify(first));
  }
  const conflicting = planParameterChange({
    current: first.proposed,
    request: fieldRequest(admitted, {
      requestId: 'width:2',
      pointer: '/width',
      parameterId: 'width',
      value: 102,
      expected: current.identity,
      base: fieldBase('/width', 100),
    }),
  });
  expect(conflicting).toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
});

it('never rebases across a manifest revision change', async () => {
  const admitted = await twoFieldManifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const stale = planParameterChange({
    current,
    request: fieldRequest(admitted, {
      requestId: 'height:1',
      pointer: '/height',
      parameterId: 'height',
      value: 15,
      expected: { ...current.identity, manifestRevision: `${current.identity.manifestRevision}-old` },
      base: fieldBase('/height', 14),
    }),
  });
  expect(stale).toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
});

it('confines field-scoped rebase to a value edit of the same pointer in the active group', async () => {
  const admitted = await twoFieldManifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const first = planParameterChange({
    current,
    request: fieldRequest(admitted, {
      requestId: 'width:1',
      pointer: '/width',
      parameterId: 'width',
      value: 101,
      expected: current.identity,
    }),
  });
  if (first.status !== 'prepared') {
    throw new Error(JSON.stringify(first));
  }
  const stale = current.identity;
  const heightBase = fieldBase('/height', 14);
  const scoped: ReadonlyArray<readonly [string, ParameterSetRequest]> = [
    [
      'another pointer',
      fieldRequest(admitted, {
        requestId: 'cross',
        pointer: '/width',
        parameterId: 'width',
        value: 5,
        expected: stale,
        base: heightBase,
      }),
    ],
    [
      'a batch',
      {
        requestId: 'batch',
        pressure: 'final',
        expected: stale,
        base: heightBase,
        operation: {
          kind: 'batch',
          group: 'default',
          edits: [
            {
              parameterId: 'height',
              resource: admitted.bindings['/height']!.schema.resource,
              pointer: '/height',
              value: 1,
            },
          ],
        },
      } as unknown as ParameterSetRequest,
    ],
    [
      'a group reset',
      {
        requestId: 'reset',
        pressure: 'final',
        expected: stale,
        base: heightBase,
        operation: { kind: 'reset-group', group: 'default' },
      } as unknown as ParameterSetRequest,
    ],
  ];
  const plans = await Promise.all(
    scoped.map(async ([label, request]) => [label, planParameterChange({ current: first.proposed, request })] as const),
  );
  for (const [label, plan] of plans) {
    expect(plan.status, label).toBe('rejected');
  }

  const inactive = planParameterChange({
    current: first.proposed,
    request: {
      ...fieldRequest(admitted, {
        requestId: 'inactive',
        pointer: '/height',
        parameterId: 'height',
        value: 15,
        expected: stale,
        base: heightBase,
      }),
      operation: {
        kind: 'native-value',
        group: 'other',
        parameterId: 'height',
        resource: admitted.bindings['/height']!.schema.resource,
        pointer: '/height',
        value: 15,
      },
    },
  });
  // A base never reaches a group the record does not hold; the record itself refuses the edit.
  expect(inactive).toMatchObject({ status: 'rejected' });
});

it('should refuse SOURCE_UNIT_REBIND_REQUIRED at admission for a marked claim whose producer no longer advertises the capability', async () => {
  const admitted = await manifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const plan = planParameterChange({
    current,
    request: {
      requestId: 'unit',
      pressure: 'final',
      expected: current.identity,
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: admitted.bindings['/width']!.schema.resource,
        pointer: '/width',
        unit: 'cm',
        producerCapability: {
          producer: 'fixture',
          sourceRevision: admitted.source.revision,
          capability: 'change-source-unit:preserve-size:v1',
        },
      },
    },
  });
  if (plan.status !== 'prepared') {
    throw new Error(JSON.stringify(plan));
  }
  const bytes = typeof plan.write.data === 'string' ? new TextEncoder().encode(plan.write.data) : plan.write.data;
  const edited = await manifest(true, contentDigest({ value: `sha256:${'2'.repeat(64)}` }));
  const later = resolveParameterSnapshot({ target, manifest: edited, path, bytes });
  const edit = planParameterChange({
    current: later,
    request: {
      requestId: 'value',
      pressure: 'final',
      expected: later.identity,
      operation: {
        kind: 'native-value',
        group: 'default',
        parameterId: 'width',
        resource: edited.bindings['/width']!.schema.resource,
        pointer: '/width',
        value: 12,
      },
    },
  });
  expect(edit.status).toBe('prepared');

  // The producer no longer advertises the source-unit capability, so the saved claim is refused.
  const undeclared = await manifest(false, contentDigest({ value: `sha256:${'3'.repeat(64)}` }));
  const snapshot = resolveParameterSnapshot({ target, manifest: undeclared, path, bytes });
  expect(
    planParameterChange({
      current: snapshot,
      request: {
        requestId: 'value:rebind',
        pressure: 'final',
        expected: snapshot.identity,
        operation: {
          kind: 'native-value',
          group: 'default',
          parameterId: 'width',
          resource: undeclared.bindings['/width']!.schema.resource,
          pointer: '/width',
          value: 12,
        },
      },
    }),
  ).toMatchObject({ code: 'SOURCE_UNIT_REBIND_REQUIRED' });
});

const boundedManifest = async () =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:bounded-parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'BoundedParameters',
        type: 'object',
        properties: { width: { type: 'double', minimum: 10, maximum: 1000 } },
      },
      defaults: { width: 100 },
      bindings: {
        '/width': {
          parameterId: 'width',
          quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
          space: 'linear',
          unit: 'mm',
          sourceUnitCapability: 'change-source-unit:preserve-size:v1',
          provenance: {
            unit: {
              origin: 'inferred',
              producer: 'fixture',
              sourceRevision: digest,
              profile: 'test-v1',
              rule: 'width-unit',
              evidence: '/width',
            },
          },
        },
      },
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
  });

it('should convert a claim marked in sourceUnits and only relabel a units-only claim', async () => {
  const admitted = await boundedManifest();
  const binding = admitted.bindings['/width']!;

  expect(
    resolveEffectiveParameterBinding(admitted, '/width', binding, {
      values: { width: 10 },
      units: { '/width': 'cm' },
      sourceUnits: { '/width': 'cm' },
    }),
  ).toMatchObject({ unit: 'cm', constraints: { minimum: 1, maximum: 100 } });
  expect(
    resolveEffectiveParameterBinding(admitted, '/width', binding, {
      values: { width: 10 },
      units: { '/width': 'cm' },
    }),
  ).toMatchObject({ unit: 'cm', constraints: { minimum: 10, maximum: 1000 } });
});

it('should restate bounds in the chosen unit on a capability field', async () => {
  const admitted = await boundedManifest();
  expect(
    resolveEffectiveParameterBinding(admitted, '/width', admitted.bindings['/width']!, {
      values: {},
      units: { '/width': 'cm' },
      sourceUnits: { '/width': 'cm' },
    }).constraints,
  ).toEqual({ minimum: 1, maximum: 100 });
});

it('should keep bounds unchanged for a relabel', async () => {
  const admitted = await boundedManifest();
  expect(
    resolveEffectiveParameterBinding(admitted, '/width', admitted.bindings['/width']!, {
      values: {},
      units: { '/width': 'cm' },
    }).constraints,
  ).toEqual({ minimum: 10, maximum: 1000 });
});

it('should remove the claim when the producer unit is chosen again', async () => {
  const admitted = await boundedManifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  const capability = {
    producer: admitted.source.id,
    sourceRevision: admitted.source.revision,
    capability: 'change-source-unit:preserve-size:v1',
  };
  const chooseCentimetres = planParameterChange({
    current,
    request: {
      requestId: 'centimetres',
      pressure: 'final',
      expected: current.identity,
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: admitted.bindings['/width']!.schema.resource,
        pointer: '/width',
        unit: 'cm',
        producerCapability: capability,
      },
    },
  });
  if (chooseCentimetres.status !== 'prepared') {
    throw new Error(JSON.stringify(chooseCentimetres));
  }
  const chooseProducerUnit = planParameterChange({
    current: chooseCentimetres.proposed,
    request: {
      requestId: 'millimetres',
      pressure: 'final',
      expected: current.identity,
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: admitted.bindings['/width']!.schema.resource,
        pointer: '/width',
        unit: 'mm',
        producerCapability: capability,
      },
    },
  });
  if (chooseProducerUnit.status !== 'prepared') {
    throw new Error(JSON.stringify(chooseProducerUnit));
  }
  expect(chooseProducerUnit.proposed.entry.groups['default']).toEqual({ values: { width: 100 } });
});

it('should keep a renamed group in its display position', async () => {
  const admitted = await manifest();
  let current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  for (const group of ['middle', 'last']) {
    const created = planParameterChange({
      current,
      request: {
        requestId: `create:${group}`,
        pressure: 'final',
        expected: current.identity,
        operation: { kind: 'create-group', group },
      },
    });
    if (created.status !== 'prepared') {
      throw new Error(JSON.stringify(created));
    }
    current = created.proposed;
  }
  const renamed = planParameterChange({
    current,
    request: {
      requestId: 'rename',
      pressure: 'final',
      expected: current.identity,
      operation: { kind: 'rename-group', group: 'middle', nextGroup: 'renamed' },
    },
  });
  if (renamed.status !== 'prepared') {
    throw new Error(JSON.stringify(renamed));
  }
  expect(Object.keys(renamed.proposed.entry.groups)).toEqual(['default', 'renamed', 'last']);
});

const missingGroupOperations: ReadonlyArray<ParameterSetRequest['operation']> = [
  { kind: 'select-group', group: 'missing' },
  { kind: 'reset-group', group: 'missing' },
  { kind: 'replace-group-values', group: 'missing', values: {} },
  {
    kind: 'native-value',
    group: 'missing',
    parameterId: 'width',
    resource: 'urn:taucad:parameter-schema:root',
    pointer: '/width',
    value: 1,
  },
  {
    kind: 'unit-value',
    group: 'missing',
    parameterId: 'width',
    resource: 'urn:taucad:parameter-schema:root',
    pointer: '/width',
    inputUnit: 'cm',
    value: '1',
  },
  {
    kind: 'batch',
    group: 'missing',
    edits: [{ parameterId: 'width', resource: 'urn:taucad:parameter-schema:root', pointer: '/width', value: 1 }],
  },
  {
    kind: 'source-unit',
    mode: 'preserve-size',
    group: 'missing',
    parameterId: 'width',
    resource: 'urn:taucad:parameter-schema:root',
    pointer: '/width',
    unit: 'cm',
    producerCapability: {
      producer: 'fixture',
      sourceRevision: digest,
      capability: 'change-source-unit:preserve-size:v1',
    },
  },
];

it.each(missingGroupOperations)('should refuse GROUP_NOT_FOUND for in-place $kind', async (operation) => {
  const admitted = await manifest();
  const current = resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null });
  expect(
    planParameterChange({
      current,
      request: {
        requestId: `missing:${operation.kind}`,
        pressure: 'final',
        expected: current.identity,
        operation,
      },
    }),
  ).toMatchObject({ status: 'rejected', code: 'GROUP_NOT_FOUND' });
});
