/* oxlint-disable typescript/no-restricted-types -- The checked-file test authority uses null for absent bytes. */
import { contentDigest } from '@taucad/cache-core';
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

it('loads without writing and commits once without another producer resolution', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let reads = 0;
  let resolves = 0;
  let writes = 0;
  let preconditions = 0;
  const authority: ParameterAuthority = {
    path: () => fixture.snapshot.path,
    read: async () => {
      reads += 1;
      return null;
    },
    semanticPreconditions: async () => {
      preconditions += 1;
      return [{ path: 'main.ts', expected: 'source:1' }];
    },
    writeChecked: async (write) => {
      writes += 1;
      expect(write.preconditions).toEqual([
        { path: 'main.ts', expected: 'source:1' },
        { path: fixture.snapshot.path, expected: null },
      ]);
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
  expect({ reads, resolves, writes, preconditions }).toEqual({ reads: 1, resolves: 1, writes: 0, preconditions: 2 });
  const change = await planParameterChange({
    current,
    request: {
      requestId: 'create',
      draftGeneration: 0,
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
  expect({ reads, resolves, writes, preconditions }).toEqual({ reads: 1, resolves: 1, writes: 1, preconditions: 2 });
});

it('refuses a manifest resolved across a source change before reading or writing the record', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let revision = 0;
  const authority: ParameterAuthority = {
    path: () => fixture.snapshot.path,
    read: async () => {
      throw new Error('Unexpected record read');
    },
    writeChecked: async () => {
      throw new Error('Unexpected write');
    },
    semanticPreconditions: async () => [{ path: 'main.ts', expected: String(revision++) }],
  };
  await expect(
    loadParameterSnapshot({
      target: fixture.snapshot.target,
      authority,
      manifest: async () => fixture.snapshot.manifest,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
});

const target: ParameterSetTarget = { authority: 'memory', root: '/project', entry: 'main.ts' };
const recordPath = '.tau/parameters/main.ts.json';
const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const encoder = new TextEncoder();
const { signal } = new AbortController();
const legacyRecord = JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 100 } } } });

const widthManifest = async (
  binding: 'declared' | 'undeclared-unit' | 'none' = 'declared',
  revision = digest,
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
  options: Readonly<{ backup?: boolean }> = {},
): {
  authority: ParameterAuthority;
  bytes(): Uint8Array<ArrayBuffer> | null;
  setSource(next: string): void;
  counts(): { writes: number; backups: number };
} => {
  let source = encoder.encode('source:1');
  let bytes: Uint8Array<ArrayBuffer> | null = initial === null ? null : encoder.encode(initial);
  let writes = 0;
  let backups = 0;
  const authority: ParameterAuthority = {
    path: () => recordPath,
    read: async () => (bytes === null ? null : Uint8Array.from(bytes)),
    semanticPreconditions: async () => [{ path: 'main.ts', expected: Uint8Array.from(source) }],
    writeChecked: async (write) => {
      const conflicts = write.preconditions
        .map(({ path, expected }) => ({ path, expected, actual: path === 'main.ts' ? source : bytes }))
        .filter(({ expected, actual }) => !sameBytes(expected, actual))
        .map(({ path, actual }) => ({ path, actual: actual === null ? null : Uint8Array.from(actual) }));
      if (conflicts.length > 0) {
        return { status: 'conflict', conflicts };
      }
      bytes = typeof write.data === 'string' ? encoder.encode(write.data) : Uint8Array.from(write.data);
      writes += 1;
      return { status: 'applied', content: Uint8Array.from(bytes) };
    },
    ...(options.backup === true
      ? {
          backupLegacy: async () => {
            backups += 1;
            return 'revision:before-migration';
          },
        }
      : {}),
  };
  return {
    authority,
    bytes: () => bytes,
    setSource: (next) => {
      source = encoder.encode(next);
    },
    counts: () => ({ writes, backups }),
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
  draftGeneration: 1,
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

it('backs up and migrates legacy bytes during load, then commits one checked unit-bearing edit', async () => {
  const memory = memoryAuthority(legacyRecord, { backup: true });
  const current = await load(memory, await widthManifest());
  expect(memory.counts()).toEqual({ writes: 1, backups: 1 });
  expect(current).toMatchObject({
    access: { status: 'current', writeAllowed: true },
    entry: { recordVersion: 1, migration: { backupRevision: 'revision:before-migration' } },
  });
  const change = prepared(
    await planParameterChange({ current, request: request('edit', current.identity, unitEdit('12')) }),
  );
  await expect(commitParameterChange({ change, authority: memory.authority, signal })).resolves.toMatchObject({
    status: 'applied',
  });
  expect(memory.counts()).toEqual({ writes: 2, backups: 1 });
  expect(currentRecord(memory.bytes())).toMatchObject({
    groups: { default: { values: { width: 120 }, bindings: { '/width': { representation: 'binary64', unit: 'mm' } } } },
    lastOperation: { requestId: 'edit' },
  });
});

it('reads legacy values without rewriting when no durable backup owner exists', async () => {
  const memory = memoryAuthority(legacyRecord);
  const current = await load(memory, await widthManifest());
  expect(current).toMatchObject({
    access: { status: 'legacy-readable', writeAllowed: false },
    entry: { groups: { default: { values: { width: 100 } } } },
  });
  await expect(
    planParameterChange({ current, request: request('legacy-edit', current.identity, unitEdit('12')) }),
  ).resolves.toMatchObject({ status: 'rejected', code: 'LEGACY_READ_ONLY' });
  expect(memory.counts()).toEqual({ writes: 0, backups: 0 });
  expect(new TextDecoder().decode(memory.bytes()!)).toBe(legacyRecord);
});

it('refuses a prepared change with zero writes when source bytes change after planning', async () => {
  const memory = memoryAuthority(null);
  const current = await load(memory, await widthManifest());
  const change = prepared(
    await planParameterChange({ current, request: request('race', current.identity, unitEdit('12')) }),
  );
  memory.setSource('source:2');
  await expect(commitParameterChange({ change, authority: memory.authority, signal })).resolves.toMatchObject({
    status: 'conflict',
    conflicts: [{ path: 'main.ts' }],
  });
  expect(memory.counts().writes).toBe(0);
  expect(memory.bytes()).toBeNull();
});

it('admits one of two stale actors, conflicts the other, and refreshes the loser to the winning record', async () => {
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
  await expect(submitParameterRequest(second, request('second', identity, unitEdit('15')))).resolves.toMatchObject({
    status: 'rejected',
    code: 'STALE_MANIFEST',
  });
  await waitFor(second, (state) => state.matches({ open: 'ready' }));
  expect(second.getSnapshot().context.current?.entry.groups['default']?.values).toEqual({ width: 120 });
  expect(memory.counts().writes).toBe(1);
  first.stop();
  second.stop();
});

it('keeps historical receipts readable across source refresh and consecutive edits', async () => {
  const memory = memoryAuthority(null);
  const initial = await load(memory, await widthManifest());
  const first = prepared(
    await planParameterChange({ current: initial, request: request('first', initial.identity, unitEdit('12')) }),
  );
  await commitParameterChange({ change: first, authority: memory.authority, signal });
  const refreshed = await load(
    memory,
    await widthManifest('declared', contentDigest({ value: `sha256:${'2'.repeat(64)}` })),
  );
  expect(refreshed.entry.lastOperation).toMatchObject({ requestId: 'first' });
  expect(refreshed.entry.identity).toEqual(refreshed.identity);
  expect(refreshed.entry.lastOperation?.sourceRevision).not.toBe(refreshed.identity.sourceRevision);
  const second = prepared(
    await planParameterChange({ current: refreshed, request: request('second', refreshed.identity, unitEdit('13')) }),
  );
  await expect(commitParameterChange({ change: second, authority: memory.authority, signal })).resolves.toMatchObject({
    status: 'applied',
  });
  expect(currentRecord(memory.bytes()).lastOperation).toMatchObject({ requestId: 'second' });
});

it('binds an unknown numeric parameter once and preserves project provenance through a later edit', async () => {
  const memory = memoryAuthority(null);
  const manifest = await widthManifest('none');
  const { parameter, schema } = manifest.bindings['/width']!;
  const current = await load(memory, manifest);
  const bound = prepared(
    await planParameterChange({
      current,
      request: request('bind', current.identity, {
        kind: 'bind-parameter',
        group: 'default',
        parameterId: parameter.value,
        resource: schema.resource,
        pointer: '/width',
        binding: { unit: 'mm', quantityKind: 'http://qudt.org/vocab/quantitykind/Length', space: 'linear' },
      }),
    }),
  );
  await commitParameterChange({ change: bound, authority: memory.authority, signal });
  const edited = prepared(
    await planParameterChange({
      current: bound.proposed,
      request: request('edit', bound.proposed.identity, {
        kind: 'native-value',
        group: 'default',
        parameterId: parameter.value,
        resource: schema.resource,
        pointer: '/width',
        value: 120,
      }),
    }),
  );
  await commitParameterChange({ change: edited, authority: memory.authority, signal });
  expect(currentRecord(memory.bytes()).groups['default']).toMatchObject({
    values: { width: 120 },
    bindings: {
      '/width': {
        unit: 'mm',
        quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
        provenance: { unit: { origin: 'project' }, quantityKind: { origin: 'project' } },
      },
    },
  });
  expect(memory.counts().writes).toBe(2);
});

it('rejects conflicting project metadata and undeclared source-unit relabeling without writing', async () => {
  const memory = memoryAuthority(null);
  const declared = await load(memory, await widthManifest());
  await expect(
    planParameterChange({
      current: declared,
      request: request('bind-declared', declared.identity, {
        kind: 'bind-parameter',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:taucad:parameter-schema:root',
        pointer: '/width',
        binding: { unit: 'cm' },
      }),
    }),
  ).resolves.toMatchObject({ status: 'rejected', code: 'METADATA_CONFLICT' });
  const manifest = await widthManifest('undeclared-unit');
  const undeclared = await load(memory, manifest);
  await expect(
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
        dependencies: { 'main.ts': manifest.source.revision },
      }),
    }),
  ).resolves.toMatchObject({ status: 'rejected', code: 'SOURCE_UNIT_UNAVAILABLE' });
  expect(memory.counts().writes).toBe(0);
});
/* oxlint-enable typescript/no-restricted-types -- Resume the workspace default. */
