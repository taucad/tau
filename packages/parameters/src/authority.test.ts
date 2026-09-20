/* oxlint-disable typescript/no-restricted-types -- The checked-file test authority uses null for absent bytes. */
import { contentDigest, digestContent } from '@taucad/cache-core';
import { expect, it } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { commitParameterChange, loadParameterSnapshot, refreshParameterSnapshot } from '#authority.js';
import type { ParameterAuthority } from '#authority.js';
import { compileParameterManifest } from '#manifest.js';
import type { ParameterManifest } from '#manifest.js';
import { planParameterChange } from '#planning.js';
import type { ParameterChange } from '#planning.js';
import { parameterSetMachine, submitParameterRequest } from '#parameter-set.machine.js';
import { parameterSetHarness } from '#parameter-set.test-helper.js';
import { readParameterRecord } from '#record.js';
import type { ParameterSnapshot } from '#snapshot.js';
import type { ParameterSetIdentity, ParameterSetRequest, ParameterSetTarget } from '#types.js';

const target: ParameterSetTarget = { authority: 'memory', root: '/project', entry: 'main.ts' };
const recordPath = '.tau/parameters/main.ts.json';
const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const encoder = new TextEncoder();
const { signal } = new AbortController();
const legacyRecord = JSON.stringify({
  recordVersion: 1,
  profile: 'tau-json-structure-units-03-v1',
  activeGroup: 'default',
  order: ['default'],
  groups: { default: { values: { width: 100 } } },
});

it('loads without writing, pins only the sidecar, and commits once without another resolution', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let reads = 0;
  let resolves = 0;
  let writes = 0;
  const authority: ParameterAuthority = {
    path: () => fixture.snapshot.path,
    read: async () => {
      reads += 1;
      return null;
    },
    writeChecked: async (write) => {
      writes += 1;
      // No source file is read, digested or pinned: the sidecar's own bytes are the whole proof.
      expect(write.preconditions).toEqual([{ path: fixture.snapshot.path, expected: null }]);
      return {
        status: 'applied',
        content: typeof write.data === 'string' ? new TextEncoder().encode(write.data) : write.data,
      };
    },
  };
  const current = await loadParameterSnapshot({
    target: fixture.snapshot.target,
    authority,
    signal: new AbortController().signal,
    manifest: async () => {
      resolves += 1;
      return fixture.snapshot.manifest;
    },
  });
  expect({ reads, resolves, writes }).toEqual({ reads: 1, resolves: 1, writes: 0 });
  const change = planParameterChange({
    current,
    request: {
      requestId: 'create',
      fingerprint: 'label',
      pressure: 'final',
      expected: current.identity,
      operation: { kind: 'create-group', group: 'second' },
    },
  });
  if (change.status !== 'prepared') {
    throw new Error(JSON.stringify(change));
  }
  await commitParameterChange({ change, authority, signal: new AbortController().signal });
  expect({ reads, resolves, writes }).toEqual({ reads: 1, resolves: 1, writes: 1 });
});

const widthManifest = async (
  binding: 'declared' | 'undeclared-unit' | 'none' = 'declared',
  revision = digest,
  sourceText = 'source:1',
): Promise<ParameterManifest> =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: { width: binding === 'none' ? { type: 'double' } : { type: 'double', ucumUnit: 'mm', minimum: 0 } },
      },
      defaults: { width: 100 },
      ...(binding === 'none'
        ? {}
        : {
            bindings: {
              '/width': {
                parameterId: 'width',
                quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
                space: 'linear',
                ...(binding === 'declared'
                  ? { unit: 'mm', sourceUnitCapability: 'change-source-unit:preserve-size:v1' }
                  : {}),
              },
            },
          }),
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision, capability: 'json-structure' },
    dependency: revision,
    middleware: digest,
    sourceFiles: { 'main.ts': await digestContent({ bytes: encoder.encode(sourceText) }) },
  });

const sameBytes = (left: Uint8Array<ArrayBuffer> | string | null, right: Uint8Array<ArrayBuffer> | null): boolean => {
  const a = typeof left === 'string' ? encoder.encode(left) : left;
  return a === null || right === null
    ? a === right
    : a.length === right.length && a.every((byte, index) => byte === right[index]);
};

/** A checked in-memory writer that enforces every precondition like the workspace authority. */
const memoryAuthority = (
  initial: string | null,
): {
  authority: ParameterAuthority;
  bytes(): Uint8Array<ArrayBuffer> | null;
  write(next: string): void;
  counts(): { writes: number };
} => {
  let bytes: Uint8Array<ArrayBuffer> | null = initial === null ? null : encoder.encode(initial);
  let writes = 0;
  const authority: ParameterAuthority = {
    path: () => recordPath,
    read: async () => (bytes === null ? null : Uint8Array.from(bytes)),
    writeChecked: async (write) => {
      const conflicts = write.preconditions
        .filter(({ expected }) => !sameBytes(expected, bytes))
        .map(({ path }) => ({ path, actual: bytes === null ? null : Uint8Array.from(bytes) }));
      if (conflicts.length > 0) {
        return { status: 'conflict', conflicts };
      }
      bytes = typeof write.data === 'string' ? encoder.encode(write.data) : Uint8Array.from(write.data);
      writes += 1;
      return { status: 'applied', content: Uint8Array.from(bytes) };
    },
  };
  return {
    authority,
    bytes: () => bytes,
    write: (next) => {
      bytes = encoder.encode(next);
    },
    counts: () => ({ writes }),
  };
};

const load = async (
  memory: ReturnType<typeof memoryAuthority>,
  manifest: ParameterManifest,
): Promise<ParameterSnapshot> =>
  loadParameterSnapshot({ target, authority: memory.authority, signal, manifest: async () => manifest });

const request = (
  requestId: string,
  expected: ParameterSetIdentity,
  operation: ParameterSetRequest['operation'],
): ParameterSetRequest => ({
  requestId,
  fingerprint: requestId,
  pressure: 'final',
  expected,
  operation,
});

const unitEdit = (value: string): ParameterSetRequest['operation'] => ({
  kind: 'unit-value',
  group: 'default',
  parameterId: 'width',
  resource: 'urn:taucad:parameter-schema:root',
  pointer: '/width',
  inputUnit: 'cm',
  value,
});

const prepared = (change: ParameterChange): Extract<ParameterChange, { status: 'prepared' }> => {
  if (change.status !== 'prepared') {
    throw new Error(JSON.stringify(change));
  }
  return change;
};

const currentRecord = (bytes: Uint8Array<ArrayBuffer> | null) => {
  const decoded = readParameterRecord(bytes!);
  if (decoded.status !== 'current') {
    throw new Error(`Expected a current record, received ${decoded.status}`);
  }
  return decoded.record;
};

it('refuses a pre-simplification record at load without rewriting it', async () => {
  const memory = memoryAuthority(legacyRecord);
  await expect(load(memory, await widthManifest())).rejects.toMatchObject({
    code: 'INVALID_RECORD',
    applicationState: 'known-not-applied',
  });
  expect(memory.counts()).toEqual({ writes: 0 });
  expect(new TextDecoder().decode(memory.bytes()!)).toBe(legacyRecord);
});

it('commits one checked unit-bearing edit onto an absent record and stores only the value', async () => {
  const memory = memoryAuthority(null);
  const current = await load(memory, await widthManifest());
  const change = prepared(planParameterChange({ current, request: request('edit', current.identity, unitEdit('12')) }));
  await expect(commitParameterChange({ change, authority: memory.authority, signal })).resolves.toMatchObject({
    status: 'applied',
  });
  expect(memory.counts()).toEqual({ writes: 1 });
  expect(currentRecord(memory.bytes())).toEqual({
    activeGroup: 'default',
    groups: { default: { values: { width: 120 } } },
  });
});

it('refuses a prepared change with zero writes when the record changed after planning', async () => {
  const memory = memoryAuthority(null);
  const current = await load(memory, await widthManifest());
  const change = prepared(planParameterChange({ current, request: request('race', current.identity, unitEdit('12')) }));
  memory.write(JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 7 } } } }));
  await expect(commitParameterChange({ change, authority: memory.authority, signal })).resolves.toMatchObject({
    status: 'conflict',
    conflicts: [{ path: recordPath }],
  });
  expect(memory.counts().writes).toBe(0);
});

it('commits consecutive edits across a manifest refresh without storing any revision', async () => {
  const memory = memoryAuthority(null);
  const initial = await load(memory, await widthManifest());
  const first = prepared(
    planParameterChange({ current: initial, request: request('first', initial.identity, unitEdit('12')) }),
  );
  await commitParameterChange({ change: first, authority: memory.authority, signal });
  const refreshed = await load(
    memory,
    await widthManifest('declared', contentDigest({ value: `sha256:${'2'.repeat(64)}` }), 'source:2'),
  );
  expect(refreshed.entry).toEqual({ activeGroup: 'default', groups: { default: { values: { width: 120 } } } });
  const second = prepared(
    planParameterChange({ current: refreshed, request: request('second', refreshed.identity, unitEdit('13')) }),
  );
  await expect(commitParameterChange({ change: second, authority: memory.authority, signal })).resolves.toMatchObject({
    status: 'applied',
  });
  expect(currentRecord(memory.bytes()).groups['default']?.values).toEqual({ width: 130 });
});

it('refuses a request built on a manifest the authority has replaced', async () => {
  const memory = memoryAuthority(null);
  const stale = await load(memory, await widthManifest());
  const current = await load(
    memory,
    await widthManifest('declared', contentDigest({ value: `sha256:${'3'.repeat(64)}` })),
  );
  expect(planParameterChange({ current, request: request('stale', stale.identity, unitEdit('12')) })).toMatchObject({
    status: 'rejected',
    code: 'STALE_MANIFEST',
  });
  expect(memory.counts().writes).toBe(0);
});

it('re-plans a stale actor without a field base and commits over the winning record', async () => {
  const memory = memoryAuthority(null);
  const manifest = await widthManifest();
  const actorFor = () =>
    createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: fromPromise(async ({ input, signal: loadSignal }) =>
            input.current === undefined
              ? loadParameterSnapshot({
                  target,
                  authority: memory.authority,
                  manifest: async () => manifest,
                  signal: loadSignal,
                })
              : refreshParameterSnapshot({ current: input.current, authority: memory.authority, signal: loadSignal }),
          ),
          commitParameterSet: fromPromise(async ({ input: change, signal: commitSignal }) =>
            commitParameterChange({ change, authority: memory.authority, signal: commitSignal }),
          ),
        },
      }),
      { input: { target } },
    ).start();
  const first = actorFor();
  const second = actorFor();
  await Promise.all([first, second].map(async (actor) => waitFor(actor, (state) => state.matches({ open: 'ready' }))));
  const { identity } = first.getSnapshot().context.current!;
  await expect(submitParameterRequest(first, request('first', identity, unitEdit('12')))).resolves.toMatchObject({
    status: 'committed',
    write: 'applied',
  });
  // The second actor has no field base, so the byte conflict refreshes and re-plans the overwrite.
  await expect(submitParameterRequest(second, request('second', identity, unitEdit('15')))).resolves.toMatchObject({
    status: 'committed',
    write: 'applied',
  });
  await waitFor(second, (state) => state.matches({ open: 'ready' }));
  expect(second.getSnapshot().context.current?.entry.groups['default']?.values).toEqual({ width: 150 });
  expect(memory.counts().writes).toBe(2);
  first.stop();
  second.stop();
});

it('honours an authored unit for a field the producer left undeclared, through a later edit', async () => {
  const memory = memoryAuthority(
    JSON.stringify({ activeGroup: 'default', groups: { default: { values: {}, units: { '/width': 'mm' } } } }),
  );
  const manifest = await widthManifest('none');
  const { parameter, schema } = manifest.bindings['/width']!;
  const current = await load(memory, manifest);
  const edited = prepared(
    planParameterChange({
      current,
      request: request('edit', current.identity, {
        kind: 'unit-value',
        group: 'default',
        parameterId: parameter.value,
        resource: schema.resource,
        pointer: '/width',
        inputUnit: 'cm',
        value: '12',
      }),
    }),
  );
  await commitParameterChange({ change: edited, authority: memory.authority, signal });
  // The typed centimetres were converted into the unit the record claims for the field.
  expect(currentRecord(memory.bytes()).groups['default']).toEqual({
    values: { width: 120 },
    units: { '/width': 'mm' },
  });
  expect(memory.counts().writes).toBe(1);
});

it('rejects an authored unit the declaration contradicts, and an undeclared source-unit change', async () => {
  const conflicting = memoryAuthority(
    JSON.stringify({ activeGroup: 'default', groups: { default: { values: {}, units: { '/width': 'cm' } } } }),
  );
  const declared = await load(conflicting, await widthManifest());
  expect(
    planParameterChange({
      current: declared,
      request: request('edit-conflicting', declared.identity, {
        kind: 'native-value',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:taucad:parameter-schema:root',
        pointer: '/width',
        value: 12,
      }),
    }),
  ).toMatchObject({ status: 'rejected', code: 'METADATA_CONFLICT' });

  const memory = memoryAuthority(null);
  const manifest = await widthManifest('undeclared-unit');
  const undeclared = await load(memory, manifest);
  expect(
    planParameterChange({
      current: undeclared,
      request: request('relabel', undeclared.identity, {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:taucad:parameter-schema:root',
        pointer: '/width',
        unit: 'cm',
        producerCapability: {
          producer: 'fixture',
          sourceRevision: manifest.source.revision,
          capability: 'change-source-unit:preserve-size:v1',
        },
      }),
    }),
  ).toMatchObject({ status: 'rejected', code: 'SOURCE_UNIT_UNAVAILABLE' });
  expect(memory.counts().writes).toBe(0);
  expect(conflicting.counts().writes).toBe(0);
});

it('records a sanctioned source-unit change as the chosen unit in both claim maps', async () => {
  const memory = memoryAuthority(null);
  const manifest = await widthManifest();
  const current = await load(memory, manifest);
  const change = prepared(
    planParameterChange({
      current,
      request: request('source-unit', current.identity, {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:taucad:parameter-schema:root',
        pointer: '/width',
        unit: 'cm',
        producerCapability: {
          producer: 'fixture',
          sourceRevision: manifest.source.revision,
          capability: 'change-source-unit:preserve-size:v1',
        },
      }),
    }),
  );
  await commitParameterChange({
    change: { ...change, confirmed: change.confirmation!.planFingerprint },
    authority: memory.authority,
    signal,
  });
  expect(currentRecord(memory.bytes()).groups['default']).toEqual({
    values: { width: 10 },
    units: { '/width': 'cm' },
    sourceUnits: { '/width': 'cm' },
  });
});
/* oxlint-enable typescript/no-restricted-types -- Resume the workspace default. */
