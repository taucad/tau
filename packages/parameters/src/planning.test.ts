import { createActor, fromPromise, waitFor } from 'xstate';
import { parameterSetMachine, submitParameterRequest } from '#parameter-set.machine.js';
import { commitParameterChange } from '#authority.js';
import type { ParameterAuthority } from '#authority.js';
import { contentDigest } from '@taucad/cache-core';
import { expect, it } from 'vitest';
import {
  compileParameterManifest,
  resolveParameterSnapshot,
  planParameterChange,
  classifyParameterReceipt,
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
  const source = { path: 'main.ts', expected: 'source:1' };
  const current = await resolveParameterSnapshot({
    target,
    manifest: admitted,
    path,
    bytes: null,
    preconditions: [source],
  });
  expect(current.bytes).toBeNull();
  const before = structuredClone(current);
  const request: ParameterSetRequest = {
    requestId: 'edit:1',
    draftGeneration: 1,
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
  const plan = await planParameterChange({ current, request });
  if (plan.status !== 'prepared') {
    throw new Error(JSON.stringify(plan));
  }
  expect(plan.write.preconditions).toEqual([source, { path, expected: null }]);
  expect(plan.proposed.entry.groups['default']?.values).toEqual({ width: 101 });
  expect(current).toEqual(before);
  expect(await planParameterChange({ current, request })).toEqual(plan);
  expect(plan.fingerprint).not.toBe(request.fingerprint);
  expect(classifyParameterReceipt({ change: plan, current: plan.proposed })).toBe('committed');
  expect(classifyParameterReceipt({ change: plan, current })).toBe('indeterminate');
  expect(classifyParameterReceipt({ change: plan, refused: true })).toBe('known-not-applied');
});

it('rejects deleting the last group through the pure API', async () => {
  const current = await resolveParameterSnapshot({
    target,
    manifest: await manifest(),
    path,
    bytes: null,
    preconditions: [],
  });
  const plan = await planParameterChange({
    current,
    request: {
      requestId: 'delete',
      draftGeneration: 0,
      fingerprint: 'delete',
      pressure: 'final',
      expected: current.identity,
      operation: { kind: 'delete-group', group: 'default' },
    },
  });
  expect(plan).toMatchObject({ status: 'rejected', code: 'LAST_GROUP_DELETE' });
});

it('requires explicit source-unit confirmation before one record write', async () => {
  const admitted = await manifest();
  const current = await resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null, preconditions: [] });
  const request: ParameterSetRequest = {
    requestId: 'source-unit',
    draftGeneration: 0,
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
      dependencies: admitted.identity.sourceFiles,
    },
  };
  const plan = await planParameterChange({ current, request });
  expect(plan.status).toBe('prepared');
  if (plan.status !== 'prepared' || plan.confirmation === undefined) {
    throw new Error('Expected confirmation plan');
  }
  expect(plan.confirmation.planFingerprint).toBe(plan.fingerprint);
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
  const current = await resolveParameterSnapshot({
    target,
    manifest: await admitted,
    path,
    bytes: null,
    preconditions: [],
  });
  const operation: ParameterSetRequest = {
    requestId: 'write-prototype-keys',
    draftGeneration: 1,
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
    const plan = await planParameterChange({ current, request: operation });
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
  const input: Parameters<typeof resolveParameterSnapshot>[0] = {
    target,
    manifest: admitted,
    path,
    bytes: null,
    preconditions: [],
  };
  const loading = resolveParameterSnapshot(input);
  Object.assign(input, { bytes: new TextEncoder().encode('invalid') });
  await expect(loading).resolves.toMatchObject({ bytes: null, entry: { recordVersion: 1 } });
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
  draftGeneration: 1,
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
  const current = await resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null, preconditions: [] });
  const first = await planParameterChange({
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
  expect(first.proposed.identity.valueRevision).not.toBe(current.identity.valueRevision);

  // The height editor still holds the pre-edit revision and has never been refreshed.
  const second = await planParameterChange({
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
  const current = await resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null, preconditions: [] });
  const first = await planParameterChange({
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
  const conflicting = await planParameterChange({
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
  const current = await resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null, preconditions: [] });
  const stale = await planParameterChange({
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
  const current = await resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null, preconditions: [] });
  const first = await planParameterChange({
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
        draftGeneration: 1,
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
        draftGeneration: 1,
        pressure: 'final',
        expected: stale,
        base: heightBase,
        operation: { kind: 'reset-group', group: 'default' },
      } as unknown as ParameterSetRequest,
    ],
  ];
  const plans = await Promise.all(
    scoped.map(
      async ([label, request]) => [label, await planParameterChange({ current: first.proposed, request })] as const,
    ),
  );
  for (const [label, plan] of plans) {
    expect(plan.status, label).toBe('rejected');
  }

  const inactive = await planParameterChange({
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
  expect(inactive).toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
});

it('keeps a source-unit choice across unrelated source edits and asks for rebind when its declaration changes', async () => {
  const admitted = await manifest();
  const current = await resolveParameterSnapshot({ target, manifest: admitted, path, bytes: null, preconditions: [] });
  const plan = await planParameterChange({
    current,
    request: {
      requestId: 'unit',
      draftGeneration: 0,
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
  const later = await resolveParameterSnapshot({ target, manifest: edited, path, bytes, preconditions: [] });
  const edit = await planParameterChange({
    current: later,
    request: {
      requestId: 'value',
      draftGeneration: 1,
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

  const undeclared = await manifest(false, contentDigest({ value: `sha256:${'3'.repeat(64)}` }));
  const outcome = await resolveParameterSnapshot({ target, manifest: undeclared, path, bytes, preconditions: [] }).then(
    async (snapshot) =>
      planParameterChange({
        current: snapshot,
        request: {
          requestId: 'value:rebind',
          draftGeneration: 1,
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
    (error: unknown) => error,
  );
  expect(outcome).toMatchObject({ code: 'SOURCE_UNIT_REBIND_REQUIRED' });
});
