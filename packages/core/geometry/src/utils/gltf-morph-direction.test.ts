import { describe, expect, it } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Accessor, GLTF } from '@gltf-transform/core';
import {
  createCoordinateTransform,
  createReverseCoordinateTransform,
  createScalingTransform,
  embedGltfResources,
  transformGltfExportBytes,
} from '#index.js';

const deltas = {
  position: [0.5, -2, 0, 0, 0, 0, -0.25, 0, 4],
  normal: [0.5, -2, 0, 0, 0, 0, -0.25, 0, 4],
  tangent: [2, 0.125, -0.5, 0, 0, 0, -3, 4, -2],
};
const createFixture = () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (type: 'VEC3' | 'VEC4', values: number[]) =>
    document.createAccessor().setBuffer(buffer).setType(type).setArray(new Float32Array(values));
  const position = accessor('VEC3', [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const normal = accessor('VEC3', [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const tangent = accessor('VEC4', [1, 0, 0, -1, 1, 0, 0, 1, 1, 0, 0, -1]);
  const morphPosition = accessor('VEC3', deltas.position);
  const morphNormal = accessor('VEC3', deltas.normal);
  const morphTangent = accessor('VEC3', deltas.tangent);
  const target = document
    .createPrimitiveTarget()
    .setAttribute('POSITION', morphPosition)
    .setAttribute('NORMAL', morphNormal)
    .setAttribute('TANGENT', morphTangent);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TANGENT', tangent)
    .addTarget(target);
  const second = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TANGENT', tangent)
    .addTarget(target);
  const mesh = document.createMesh().addPrimitive(primitive).addPrimitive(second).setWeights([0.5]);
  document
    .createScene()
    .addChild(document.createNode('first').setMesh(mesh))
    .addChild(document.createNode('second').setMesh(mesh).setTranslation([1, 2, 3]));
  return { document, primitive, target, position, normal, tangent, morphPosition, morphNormal, morphTangent };
};
const mapped = (values: number[], axis: 'forward' | 'reverse' | 'same', scale = 1) => {
  const result: number[] = [];
  for (let offset = 0; offset < values.length; offset += 3) {
    const [x, y, z] = values.slice(offset, offset + 3);
    result.push(
      x! * scale,
      (axis === 'forward' ? -z! : axis === 'reverse' ? z! : y!) * scale,
      (axis === 'forward' ? y! : axis === 'reverse' ? -y! : z!) * scale,
    );
  }
  // Matrix dot products add zero terms; unlike an isolated sign flip, these produce +0.
  return new Float32Array(result.map((value) => (value === 0 ? 0 : value)));
};
const expectDeltas = (
  accessors: { position: Accessor; normal: Accessor; tangent: Accessor },
  axis: 'forward' | 'reverse' | 'same',
  scale: number,
) => {
  expect(accessors.position.getArray()).toEqual(mapped(deltas.position, axis, scale));
  expect(accessors.normal.getArray()).toEqual(mapped(deltas.normal, axis));
  expect(accessors.tangent.getArray()).toEqual(mapped(deltas.tangent, axis));
  expect(accessors.tangent.getType()).toBe('VEC3');
};

describe.each(['same', 'forward', 'reverse'] as const)('%s morph frame', (axis) => {
  it.each([false, true])('should retain displacement magnitude with unit conversion %s', async (scale) => {
    const fixture = createFixture();
    await fixture.document.transform(
      createCoordinateTransform(axis === 'forward'),
      createReverseCoordinateTransform(axis === 'reverse'),
      createScalingTransform(scale),
    );
    expectDeltas(
      { position: fixture.morphPosition, normal: fixture.morphNormal, tangent: fixture.morphTangent },
      axis,
      scale ? 1000 : 1,
    );
    expect([...fixture.tangent.getArray()!].filter((_, index) => index % 4 === 3)).toEqual([-1, 1, -1]);
    expect(fixture.target.getAttribute('TANGENT')).toBe(fixture.morphTangent);
    expect(fixture.primitive.getAttribute('TANGENT')).toBe(fixture.tangent);
  });
});

it('should preserve unit-only dimensionless morph signed-zero bits', async () => {
  const fixture = createFixture();
  fixture.morphNormal.setArray(new Float32Array([-0, 0, -0, 0, -0, 0, -0, -0, -0]));
  fixture.morphTangent.setArray(new Float32Array([-0, 0, -0, 0, -0, 0, -0, -0, -0]));
  const before = new Uint32Array(new Uint32Array(fixture.morphNormal.getArray()!.buffer));
  await fixture.document.transform(createScalingTransform());
  expect(new Uint32Array(fixture.morphNormal.getArray()!.buffer)).toEqual(before);
  expect(new Uint32Array(fixture.morphTangent.getArray()!.buffer)).toEqual(before);
});

it.each(['base-normal', 'cross-delta-role', 'position-normal'] as const)(
  'should reject incompatible shared accessor role %s before any mutation',
  async (collision) => {
    const fixture = createFixture();
    if (collision === 'base-normal') {
      fixture.target.setAttribute('NORMAL', fixture.normal);
    }
    if (collision === 'cross-delta-role') {
      fixture.target.setAttribute('TANGENT', fixture.morphNormal);
    }
    if (collision === 'position-normal') {
      fixture.target.setAttribute('NORMAL', fixture.position);
    }
    const before = fixture.document
      .getRoot()
      .listAccessors()
      .map((accessor) => [...accessor.getArray()!]);
    await expect(fixture.document.transform(createCoordinateTransform())).rejects.toThrow(/incompatible.*role/i);
    expect(
      fixture.document
        .getRoot()
        .listAccessors()
        .map((accessor) => [...accessor.getArray()!]),
    ).toEqual(before);
    expect(fixture.document.getRoot().listNodes()[1]!.getTranslation()).toEqual([1, 2, 3]);
  },
);

it.each(['base', 'target'] as const)('should reject invalid %s tangent layout before mutation', async (owner) => {
  const fixture = createFixture();
  if (owner === 'base') {
    fixture.primitive.setAttribute('TANGENT', fixture.morphTangent);
  } else {
    fixture.target.setAttribute('TANGENT', fixture.tangent);
  }
  const before = new Float32Array(fixture.position.getArray()!);
  await expect(fixture.document.transform(createScalingTransform())).rejects.toThrow(/TANGENT.*VEC/);
  expect(fixture.position.getArray()).toEqual(before);
});

describe.each(['glb', 'gltf'] as const)('%s imported transformed export', (format) => {
  it.each([
    ['y-up', 'meter'],
    ['y-up', 'millimeter'],
    ['z-up', 'meter'],
    ['z-up', 'millimeter'],
  ] as const)('should preserve legal morph deltas for %s %s', async (coordinateSystem, length) => {
    const { document } = createFixture();
    const io = new NodeIO();
    const written = await io.writeJSON(document);
    const bytes =
      format === 'glb'
        ? await io.writeBinary(document)
        : new TextEncoder().encode(
            JSON.stringify(embedGltfResources(written.json as unknown as Record<string, unknown>, written.resources)),
          );
    const transformed = await transformGltfExportBytes(bytes, { format, coordinateSystem, unit: { length } });
    const restored =
      format === 'glb'
        ? await io.readBinary(transformed)
        : await io.readJSON({ json: JSON.parse(new TextDecoder().decode(transformed)) as GLTF.IGLTF, resources: {} });
    const primitive = restored.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    const target = primitive.listTargets()[0]!;
    expectDeltas(
      {
        position: target.getAttribute('POSITION')!,
        normal: target.getAttribute('NORMAL')!,
        tangent: target.getAttribute('TANGENT')!,
      },
      coordinateSystem === 'z-up' ? 'forward' : 'same',
      length === 'millimeter' ? 1000 : 1,
    );
    expect(restored.getRoot().listNodes()[0]!.getMesh()).toBe(restored.getRoot().listNodes()[1]!.getMesh());
    expect(restored.getRoot().listMeshes()[0]!.getWeights()).toEqual([0.5]);
  });
});
