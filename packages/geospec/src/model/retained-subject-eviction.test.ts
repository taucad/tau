import { Engine } from 'geospec-engine/node';
import { afterEach, describe, expect, it } from 'vitest';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';

/**
 * A one-tetrahedron GLB whose apex height makes each subject's bytes, and so its identity, distinct.
 * @param apex - Apex height in metres.
 * @returns Exact GLB bytes.
 */
const tetrahedronGlb = (apex: number): Uint8Array<ArrayBuffer> => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, apex]);
  const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]);
  const binary = new Uint8Array(positions.byteLength + indices.byteLength);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34_962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34_963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [1, 1, apex] },
      { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
    ],
  });
  const pad = (length: number): number => (4 - (length % 4)) % 4;
  const jsonBytes = new TextEncoder().encode(json + ' '.repeat(pad(json.length)));
  const binLength = binary.byteLength + pad(binary.byteLength);
  const total = 12 + 8 + jsonBytes.byteLength + 8 + binLength;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  glb.set(jsonBytes, 20);
  const binOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binOffset, binLength, true);
  view.setUint32(binOffset + 4, 0x00_4e_49_42, true);
  glb.set(binary, binOffset + 8);
  return glb;
};

const engines: Engine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.close();
  }
});

describe('retained subject eviction against the real engine', () => {
  // The loader recognizes the engine's retained-subject refusal by its protocol code and exact
  // message, because the engine carries no structured detail for it. This test admits more
  // subjects than the engine retains, so an engine rewording fails here instead of in a run.
  it('should evict and re-admit when a scope admits more subjects than the engine retains', async () => {
    const engine = new Engine();
    engines.push(engine);
    const loader = createGeoSpecNativeModelLoader({ engine: engine as unknown as GeoSpecNativeModelEngine });
    const retainedLimit = 32;
    const subjects = [];
    try {
      for (let index = 0; index <= retainedLimit; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- Admission order decides which subject is evicted.
        subjects.push(await loader({ source: tetrahedronGlb(1 + index / 8), format: 'glb' }));
      }
      expect(new Set(subjects.map((subject) => subject.subjectHash)).size).toBe(retainedLimit + 1);
    } finally {
      await loader.releaseAll();
    }
  });

  it('should refuse past the retained count with the exact protocol code and message the loader keys on', () => {
    const engine = new Engine();
    engines.push(engine);
    const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
    const header = { protocolVersion: 3, registryVersion: 5, canonicalProfile: 'geospec-jcs-v1' };
    const ingest = (index: number): Uint8Array<ArrayBuffer> => {
      const primary = tetrahedronGlb(1 + index / 8);
      return engine.ingestSubject(
        encode({
          ...header,
          method: 'ingestSubject',
          requestId: `ingest-${index}`,
          format: 'glb',
          frame: { coordinateSystem: 'z-up', sourceUnit: 'm', outputUnit: 'mm' },
          ingestOptions: {},
          primaryByteLength: primary.byteLength,
          resources: [],
        }),
        primary,
        [],
      );
    };
    for (let index = 0; index < 32; index += 1) {
      ingest(index);
    }
    expect(() => ingest(32)).toThrow(
      expect.objectContaining({
        code: 'limit-exceeded',
        message: 'Engine exceeds the configured retained subject count.',
      }),
    );
  });
});
