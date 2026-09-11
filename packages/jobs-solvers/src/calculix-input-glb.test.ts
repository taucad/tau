import { describe, expect, it } from 'vitest';

import { createCalculixCantileverJobDefinition } from '#calculix-definition.js';
import { createCalculixCantileverInputGlb } from '#calculix-input-glb.js';

const glbMagic = 0x46_54_6c_67;
const jsonChunkType = 0x4e_4f_53_4a;
const binaryChunkType = 0x00_4e_49_42;
const positionAttribute = 'POSITION';

const record = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const array = (value: unknown, name: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array.`);
  }
  return value;
};

describe('CalculiX undeformed input GLB', () => {
  it('encodes a self-contained GLB 2.0 triangle mesh with honest state and physical bounds', () => {
    const definition = createCalculixCantileverJobDefinition({
      input: {
        digest: `sha256:${'0'.repeat(64)}`,
        size: 0,
        mediaType: 'application/vnd.tau.solver-input',
        storageKey: 'test',
      },
      parameters: {
        length: 2,
        width: 0.4,
        height: 0.2,
        elasticModulus: 210e9,
        poissonRatio: 0.3,
        tipLoad: -1000,
      },
    });
    const bytes = createCalculixCantileverInputGlb(definition.options);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint32(0, true)).toBe(glbMagic);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    expect(view.getUint32(16, true)).toBe(jsonChunkType);
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trimEnd());
    const document = record(decoded, 'glTF document');
    const asset = record(document['asset'], 'asset');
    expect(asset['version']).toBe('2.0');
    expect(asset['extras']).toMatchObject({
      geometryState: 'undeformed-input',
      source: 'job-parameters',
      coordinateUnit: 'metre',
      deformationApplied: false,
      resultFieldsIncluded: false,
    });

    const accessors = array(document['accessors'], 'accessors');
    const positions = record(accessors[0], 'POSITION accessor');
    const indices = record(accessors[1], 'index accessor');
    expect(positions).toMatchObject({
      componentType: 5126,
      count: 8,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [2, 0.4, 0.2],
    });
    expect(indices).toMatchObject({ componentType: 5123, count: 36, type: 'SCALAR', min: [0], max: [7] });
    const meshes = array(document['meshes'], 'meshes');
    const mesh = record(meshes[0], 'mesh');
    const primitives = array(mesh['primitives'], 'mesh primitives');
    expect(record(primitives[0], 'mesh primitive')).toMatchObject({
      attributes: { [positionAttribute]: 0 },
      indices: 1,
      material: 0,
      mode: 4,
    });

    const binaryHeaderOffset = 20 + jsonLength;
    const binaryLength = view.getUint32(binaryHeaderOffset, true);
    expect(view.getUint32(binaryHeaderOffset + 4, true)).toBe(binaryChunkType);
    expect(binaryHeaderOffset + 8 + binaryLength).toBe(bytes.byteLength);
    expect(binaryLength).toBeGreaterThan(0);
  });
});
