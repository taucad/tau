import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256Bytes } from '@taucad/runtime/kernel';
import {
  encodeGeoSpecCanonicalJson,
  geoSpecEngineProtocolVersion,
  geoSpecMatcherRegistryVersion,
} from 'geospec/engine';
import type { GeoSpecIngestSubjectRequest } from 'geospec/engine';
import type { JSONValue } from '@taucad/runtime/types';
import {
  createGeoSpecEngineProtocol,
  decodeProtocolClaim,
  protocolEngineValue,
  protocolWireValue,
} from '#engine/protocol.js';
import { clearEngineSubjects, retainEngineSubject } from '#engine/subject-store.js';
import { geoSpecMatcherImplementations } from '#matchers/implementations.js';
import { boxSoup, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';

const glbBytes = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array([0, 1, 2]));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  document
    .createScene('scene')
    .addChild(document.createNode('tri').setMesh(document.createMesh('tri').addPrimitive(primitive)));
  return new WebIO().writeBinary(document);
};

const stepFixture = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

const ingest = async (protocol: ReturnType<typeof createGeoSpecEngineProtocol>) => {
  const bytes = await glbBytes();
  return protocol.ingestSubject(
    {
      requestId: 'ingest-1',
      contentHash: `sha256:${await sha256Bytes(bytes)}`,
      format: 'glb',
      frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', targetUnit: 'mm' },
      provenance: { source: 'test' },
      options: {},
    },
    bytes,
  );
};

const claimBytes = (subjectId: string, claimId = 'claim-1') =>
  encodeGeoSpecCanonicalJson({
    claimId,
    capability: 'toHaveVolume',
    subjectIds: [subjectId],
    payload: { kind: 'volume', arguments: [{ value: 0 }], expected: { value: 0 } },
    workUnitBudget: 100,
  });

const encoded = (value: JSONValue): Uint8Array<ArrayBuffer> => encodeGeoSpecCanonicalJson(value);
const execution = { forensic: false, matcherWallBackstop: 600_000 } as const;

const operationClaim = (
  capability: string,
  subjectIds: string[],
  options: { payload: JSONValue; claimId?: string },
): Uint8Array<ArrayBuffer> =>
  encoded({
    claimId: options.claimId ?? capability,
    capability,
    subjectIds,
    payload: options.payload,
    workUnitBudget: 100,
  });

afterEach(() => {
  clearEngineSubjects();
});

describe('Contract-B engine implementation', () => {
  it('validates every decoded claim field at the wire boundary', () => {
    expect(() => decodeProtocolClaim(encoded(null))).toThrow(TypeError);
    expect(() => decodeProtocolClaim(encoded({ workUnitBudget: '100' }))).toThrow(/positive finite number/u);
    expect(() => decodeProtocolClaim(encoded({ workUnitBudget: 0 }))).toThrow(/positive finite number/u);
    expect(() =>
      decodeProtocolClaim(encoded({ claimId: 1, capability: 'x', subjectIds: [], workUnitBudget: 1 })),
    ).toThrow("claimId' must be a string");
    expect(() =>
      decodeProtocolClaim(encoded({ claimId: 'x', capability: 1, subjectIds: [], workUnitBudget: 1 })),
    ).toThrow("capability' must be a string");
    expect(() =>
      decodeProtocolClaim(encoded({ claimId: 'x', capability: 'x', subjectIds: 'x', workUnitBudget: 1 })),
    ).toThrow("subjectIds' must be a string array");
    expect(() =>
      decodeProtocolClaim(encoded({ claimId: 'x', capability: 'x', subjectIds: [1], workUnitBudget: 1 })),
    ).toThrow("subjectIds' must be a string array");
    expect(
      decodeProtocolClaim(encoded({ claimId: 'x', capability: 'x', subjectIds: [], workUnitBudget: 1 })).payload,
    ).toBeNull();
  });

  it('serializes every supported wire value and rejects lossy values', () => {
    expect(protocolWireValue(undefined)).toBeNull();
    expect(protocolWireValue(null)).toBeNull();
    expect(protocolWireValue('value')).toBe('value');
    expect(protocolWireValue(true)).toBe(true);
    expect(protocolWireValue(4)).toBe(4);
    expect(protocolWireValue(new Error('boom'))).toStrictEqual({ name: 'Error', message: 'boom' });
    expect(protocolWireValue(/mount/iu)).toStrictEqual({ type: 'regexp', pattern: 'mount', flags: 'iu' });
    expect(protocolWireValue(new Uint16Array([1, 2]))).toStrictEqual([1, 2]);
    expect(protocolWireValue([1, { keep: true }])).toStrictEqual([1, { keep: true }]);
    expect(protocolWireValue({ keep: 1, drop: undefined })).toStrictEqual({ keep: 1 });
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { value: 1 });
    expect(protocolWireValue(nullPrototype)).toStrictEqual({ value: 1 });

    expect(() => protocolWireValue(Number.NaN)).toThrow(/non-finite/u);
    expect(() => protocolWireValue(() => undefined)).toThrow(/non-wire/u);
    expect(() => protocolWireValue(new Map())).toThrow(/non-plain/u);
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => protocolWireValue(cyclic)).toThrow(/non-wire/u);
  });

  it('hydrates nested protocol values, regexps and retained subject references', async () => {
    const ingested = await ingest(createGeoSpecEngineProtocol('1.0.0'));
    expect(protocolEngineValue([1, { nested: true }])).toStrictEqual([1, { nested: true }]);
    expect(protocolEngineValue({ type: 'regexp', pattern: '^head', flags: 'i' })).toStrictEqual(/^head/i);
    expect(protocolEngineValue({ type: 'subject-reference', subjectId: ingested.subject.subjectId })).toHaveProperty(
      'mesh',
    );
    expect(() => protocolEngineValue({ type: 'subject-reference', subjectId: 'missing' })).toThrow(
      /not been ingested/u,
    );
    const invalidReference = { type: 'subject-reference', subjectId: 7 } as unknown as JSONValue;
    expect(() => protocolEngineValue(invalidReference)).toThrow(TypeError);
  });

  it('reports honest versioned capabilities and release provenance', () => {
    const initialized = createGeoSpecEngineProtocol('7.8.9').initialize({
      protocolVersion: geoSpecEngineProtocolVersion,
      client: { name: 'test-client', version: '1' },
    });

    expect(initialized.engine).toStrictEqual({ name: '@taucad/geospec-engine', version: '7.8.9' });
    expect(initialized.capabilities).toHaveLength(28);
    expect(initialized.capabilities).toContainEqual({
      name: 'analyzeMesh',
      registryVersion: geoSpecMatcherRegistryVersion,
    });
    expect(initialized.capabilities).toContainEqual({ name: 'analyzeBrep', registryVersion: 3 });
    expect(initialized.provenance).toStrictEqual({ license: 'Apache-2.0' });
  });

  it('ingests bytes, evaluates canonical claims, and refuses released references', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const ingested = await ingest(protocol);
    const submitted = await protocol.submitClaims({
      requestId: 'batch-1',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [claimBytes(ingested.subject.subjectId)],
    });

    expect(submitted.results[0]).toMatchObject({ claimId: 'claim-1', status: 'passed', diagnostics: [] });
    expect(protocol.releaseSubject({ requestId: 'release-1', subjectId: ingested.subject.subjectId }).released).toBe(
      true,
    );
    const afterRelease = await protocol.submitClaims({
      requestId: 'batch-2',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [claimBytes(ingested.subject.subjectId, 'claim-2')],
    });
    expect(afterRelease.results[0]).toMatchObject({ status: 'refused' });
  });

  it('honours request and claim cancellation without producing a geometry verdict', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const ingested = await ingest(protocol);
    protocol.cancel({ requestId: 'cancelled-batch' });
    protocol.cancel({ requestId: 'other', claimId: 'cancelled-claim' });

    const request = await protocol.submitClaims({
      requestId: 'cancelled-batch',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [claimBytes(ingested.subject.subjectId)],
    });
    const claim = await protocol.submitClaims({
      requestId: 'live-batch',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [claimBytes(ingested.subject.subjectId, 'cancelled-claim')],
    });
    expect(request.results[0]?.status).toBe('cancelled');
    expect(claim.results[0]?.status).toBe('cancelled');
  });

  it('rejects incompatible protocol and registry versions', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    expect(() => protocol.initialize({ protocolVersion: 99, client: { name: 'future', version: '1' } })).toThrow(
      /incompatible/u,
    );
    expect((): void => {
      void protocol.submitClaims({ requestId: 'bad', registryVersion: 99, execution, claims: [] });
    }).toThrow(/incompatible/u);
  });

  it('rejects malformed resolved execution options', () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    expect((): void => {
      void protocol.submitClaims({
        requestId: 'bad-forensic',
        registryVersion: geoSpecMatcherRegistryVersion,
        execution: { forensic: 'yes' as unknown as boolean, matcherWallBackstop: 1 },
        claims: [],
      });
    }).toThrow(/forensic.*boolean/u);
    expect((): void => {
      void protocol.submitClaims({
        requestId: 'bad-backstop',
        registryVersion: geoSpecMatcherRegistryVersion,
        execution: { forensic: false, matcherWallBackstop: Number.NaN },
        claims: [],
      });
    }).toThrow(/positive finite number/u);
  });

  it('emits run and matcher forensic spans only to active subscribers', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const ingested = await ingest(protocol);
    const events: unknown[] = [];
    const unsubscribe = protocol.on('forensic-span', (event) => events.push(event));
    let progressEvents = 0;
    const unsubscribeProgress = protocol.on('progress', () => {
      progressEvents += 1;
    });
    const original = geoSpecMatcherImplementations.toHaveVolume;
    const instrumented: typeof original = (invocation) => {
      invocation.forensic?.({ name: 'proof.extrema', value: 2, unit: 'count' });
      return [];
    };
    Reflect.set(geoSpecMatcherImplementations, 'toHaveVolume', instrumented);
    try {
      await protocol.submitClaims({
        requestId: 'forensic-batch',
        registryVersion: geoSpecMatcherRegistryVersion,
        execution: { forensic: true, matcherWallBackstop: 1000 },
        claims: [claimBytes(ingested.subject.subjectId)],
      });
    } finally {
      Reflect.set(geoSpecMatcherImplementations, 'toHaveVolume', original);
    }

    expect(events).toHaveLength(2);
    expect(progressEvents).toBe(0);
    unsubscribe();
    unsubscribeProgress();
  });

  it('rejects false content addresses and non-wire ingestion metadata', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const bytes = await glbBytes();
    const request: GeoSpecIngestSubjectRequest = {
      requestId: 'ingest-invalid',
      contentHash: 'sha256:false',
      format: 'glb',
      frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', targetUnit: 'mm' },
      provenance: { source: 'test' },
      options: {},
    };

    await expect(protocol.ingestSubject(request, bytes)).rejects.toThrow(/hash mismatch/u);
    const provenance: Record<string, JSONValue> = {};
    Reflect.set(provenance, 'callback', () => undefined);
    await expect(
      protocol.ingestSubject(
        {
          ...request,
          contentHash: `sha256:${await sha256Bytes(bytes)}`,
          provenance,
        },
        bytes,
      ),
    ).rejects.toThrow(/finite JSON data/u);
  });

  it('ingests STEP aliases and surfaces mesh parse failures', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const step = new Uint8Array(await readFile(stepFixture));
    const contentHash = `sha256:${await sha256Bytes(step)}`;
    await Promise.all(
      (['step', 'stp'] satisfies Array<'step' | 'stp'>).map(async (format) => {
        const ingested = await protocol.ingestSubject(
          {
            requestId: `ingest-${format}`,
            contentHash,
            format,
            frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', targetUnit: 'mm' },
            provenance: {},
            options: {},
          },
          step,
        );
        expect(ingested.subject.subjectId).toContain('sha256:');
      }),
    );

    const invalid = new Uint8Array([1, 2, 3]);
    await expect(
      protocol.ingestSubject(
        {
          requestId: 'ingest-invalid-mesh',
          contentHash: `sha256:${await sha256Bytes(invalid)}`,
          format: 'glb',
          frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', targetUnit: 'mm' },
          provenance: {},
          options: {},
        },
        invalid,
      ),
    ).rejects.toThrow();
  }, 120_000);

  it('evaluates all three operation capabilities and refuses invalid operation requests', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const subject = subjectFromNamedSoups([
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([20, 0, 0], [30, 10, 10]) },
    ]);
    const reference = retainEngineSubject(subject);

    const missingBrep = await protocol.submitClaims({
      requestId: 'operations-1',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [operationClaim('analyzeBrep', [reference.subjectId], { payload: null })],
    });
    expect(missingBrep.results[0]).toMatchObject({ status: 'failed' });

    subject.brep = { validity: { valid: true } };
    const results = await protocol.submitClaims({
      requestId: 'operations-2',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [
        operationClaim('analyzeBrep', [reference.subjectId], { payload: null }),
        operationClaim('inspectGeometry', [reference.subjectId], { payload: { selectors: ['left'] } }),
        operationClaim('analyzeMeshOverlap', [reference.subjectId], { payload: { tolerance: 0.1 } }),
        operationClaim('inspectGeometry', [], { payload: { selectors: [] }, claimId: 'inspect-missing' }),
        operationClaim('inspectGeometry', [reference.subjectId], { payload: null, claimId: 'inspect-payload' }),
        operationClaim('analyzeMeshOverlap', [], { payload: null, claimId: 'overlap-missing' }),
        operationClaim('toString', [], { payload: null, claimId: 'prototype-name' }),
      ],
    });
    expect(results.results.map(({ status }) => status)).toStrictEqual([
      'passed',
      'failed',
      'passed',
      'refused',
      'refused',
      'refused',
      'refused',
    ]);
  });

  it('turns synchronous and asynchronous matcher faults into refused claims', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const ingested = await ingest(protocol);
    const malformed = operationClaim('toHaveVolume', [ingested.subject.subjectId], {
      payload: { kind: 7, arguments: [], expected: {} },
      claimId: 'sync-fault',
    });
    const synchronous = await protocol.submitClaims({
      requestId: 'sync-fault',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [malformed],
    });
    expect(synchronous.results[0]).toMatchObject({ status: 'refused' });

    const volume = geoSpecMatcherImplementations.toHaveVolume;
    Reflect.set(geoSpecMatcherImplementations, 'toHaveVolume', undefined);
    try {
      const missing = await protocol.submitClaims({
        requestId: 'missing-implementation',
        registryVersion: geoSpecMatcherRegistryVersion,
        execution,
        claims: [
          operationClaim('toHaveVolume', [ingested.subject.subjectId], {
            payload: { kind: 'volume', arguments: [], expected: { value: 0 } },
          }),
        ],
      });
      expect(missing.results[0]).toMatchObject({ status: 'refused' });
    } finally {
      Reflect.set(geoSpecMatcherImplementations, 'toHaveVolume', volume);
    }

    const original = geoSpecMatcherImplementations.toHaveNoComponentInterference;
    Reflect.set(geoSpecMatcherImplementations, 'toHaveNoComponentInterference', async () => {
      // oxlint-disable-next-line typescript/only-throw-error -- Contract B must normalize opaque engine rejections.
      throw 'native rejection';
    });
    try {
      const asynchronous = await protocol.submitClaims({
        requestId: 'async-fault',
        registryVersion: geoSpecMatcherRegistryVersion,
        execution,
        claims: [
          operationClaim('toHaveNoComponentInterference', [ingested.subject.subjectId], {
            payload: { kind: 'componentInterference', arguments: [], expected: {} },
          }),
        ],
      });
      expect(asynchronous.results[0]).toMatchObject({ status: 'refused' });
      expect(asynchronous.results[0]?.diagnostics[0]).toMatchObject({ message: 'native rejection' });
    } finally {
      Reflect.set(geoSpecMatcherImplementations, 'toHaveNoComponentInterference', original);
    }
  });

  it('handles matcher payload defaults and a failing synchronous verdict', async () => {
    const protocol = createGeoSpecEngineProtocol('1.0.0');
    const ingested = await ingest(protocol);
    const results = await protocol.submitClaims({
      requestId: 'matcher-shapes',
      registryVersion: geoSpecMatcherRegistryVersion,
      execution,
      claims: [
        operationClaim('toBeWatertight', [ingested.subject.subjectId], {
          payload: { kind: 'watertight' },
          claimId: 'defaults',
        }),
        operationClaim('toHaveVolume', [ingested.subject.subjectId], {
          payload: { kind: 'volume', arguments: [{ value: 42 }], expected: { value: 42 } },
          claimId: 'failed-verdict',
        }),
        operationClaim('toHaveVolume', [], { payload: null, claimId: 'bad-payload' }),
        operationClaim('toHaveVolume', [], { payload: { kind: 'volume' }, claimId: 'missing-subject' }),
        operationClaim('toHaveVolume', [ingested.subject.subjectId], {
          payload: { kind: 'watertight', expected: { value: 0 } },
          claimId: 'wrong-kind',
        }),
      ],
    });
    expect(results.results.map(({ status }) => status)).toStrictEqual([
      'failed',
      'failed',
      'refused',
      'refused',
      'refused',
    ]);
  });
});
