/* eslint-disable @typescript-eslint/naming-convention -- glTF extension keys are standardized. */
import { describe, expect, it } from 'vitest';
import type { Accessor, Primitive } from '@gltf-transform/core';
import { createNodeIo } from '@taucad/geometry-core';
import type { GeometryOutputTransformOptions, GlbMaterial } from '@taucad/geometry-core';
import { glbToDocument } from '@taucad/runtime-testing';
import { picovoxelToGlb, picovoxelToGltf } from '#picovoxel.geometry.js';
import type { PicovoxelShapeSnapshot } from '#picovoxel.geometry.js';
import { projectSurfaceCoordinates } from '#picovoxel.surface-coordinates.js';

const anisotropic: GlbMaterial = {
  name: 'Brushed',
  extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8, anisotropyRotation: 0.3 } },
};
const box = (): PicovoxelShapeSnapshot => ({
  name: '蓋 / Mesh 🧩',
  lane: 'exact',
  vertices: new Float32Array([3, -2, 5, 13, -2, 5, 13, 18, 5, 3, 18, 5, 3, -2, 35, 13, -2, 35, 13, 18, 35, 3, 18, 35]),
  triangles: new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]),
});
const primitive = async (shape: PicovoxelShapeSnapshot, options: GeometryOutputTransformOptions = {}) => {
  const document = await glbToDocument(picovoxelToGlb({ shapes: [shape] }, options));
  expect(
    document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
  ).toEqual([shape.name]);
  expect(
    document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
  ).toEqual([shape.name]);
  const primitives = document.getRoot().listMeshes()[0]!.listPrimitives();
  expect(primitives).toHaveLength(1);
  expect(primitives[0]!.getMode()).toBe(4);
  return primitives[0]!;
};
const expanded = (surface: Primitive, name: string) => {
  const attribute = surface.getAttribute(name)!;
  return new Float32Array([...surface.getIndices()!.getArray()!].flatMap((index) => attribute.getElement(index, [])));
};
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const subtract = (a: readonly number[], b: readonly number[]) => a.map((value, index) => value - b[index]!);
const normalized = (value: readonly number[]) => value.map((component) => component / Math.hypot(...value));
const element = (attribute: Accessor, index: number) => attribute.getElement(index, []);
const assertFrames = (surface: Primitive) => {
  const position = surface.getAttribute('POSITION')!;
  const normals = surface.getAttribute('NORMAL')!;
  const coordinates = surface.getAttribute('TEXCOORD_0')!;
  const tangents = surface.getAttribute('TANGENT')!;
  expect(coordinates.getCount()).toBe(position.getCount());
  expect(tangents.getCount()).toBe(position.getCount());
  for (const attribute of [position, normals, coordinates, tangents]) {
    expect([...attribute.getArray()!].every((value) => Number.isFinite(value))).toBe(true);
  }
  for (let index = 0; index < position.getCount(); index++) {
    const tangent = element(tangents, index);
    expect(Math.hypot(...tangent.slice(0, 3))).toBeCloseTo(1, 5);
    expect(dot(tangent, element(normals, index))).toBeCloseTo(0, 5);
    expect(Math.abs(tangent[3]!)).toBe(1);
  }
};

/** An independent derivative oracle in the emitted frame, for a single tilted triangle. */
const assertTriangleDerivative = (surface: Primitive) => {
  const indices = [...surface.getIndices()!.getArray()!];
  const positions = surface.getAttribute('POSITION')!;
  const uv = surface.getAttribute('TEXCOORD_0')!;
  const normals = surface.getAttribute('NORMAL')!;
  const tangents = surface.getAttribute('TANGENT')!;
  const [a, b, c] = indices.map((index) => element(positions, index));
  const [ta, tb, tc] = indices.map((index) => element(uv, index));
  const edge1 = subtract(b!, a!);
  const edge2 = subtract(c!, a!);
  const u1 = tb![0]! - ta![0]!;
  const v1 = tb![1]! - ta![1]!;
  const u2 = tc![0]! - ta![0]!;
  const v2 = tc![1]! - ta![1]!;
  const determinant = u1 * v2 - u2 * v1;
  expect(Math.abs(determinant)).toBeGreaterThan(0);
  const du = edge1.map((value, axis) => (value * v2 - edge2[axis]! * v1) / determinant);
  const dv = edge2.map((value, axis) => (value * u1 - edge1[axis]! * u2) / determinant);
  for (const index of indices) {
    const normal = element(normals, index);
    const expected = normalized(du.map((value, axis) => value - normal[axis]! * dot(normal, du)));
    const actual = element(tangents, index);
    for (let axis = 0; axis < 3; axis++) {
      expect(actual[axis]).toBeCloseTo(expected[axis]!, 5);
    }
    expect(actual[3]).toBe(dot(cross(normal, expected), dv) < 0 ? -1 : 1);
  }
};

describe('PicoVoxel material charts and tangent geometry', () => {
  it.each([
    {},
    { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
  ] satisfies GeometryOutputTransformOptions[])(
    'should preserve every ordered position and smooth normal byte while splitting all six box charts (%j)',
    async (options) => {
      const shape = box();
      const original = structuredClone(shape);
      const plain = await primitive(shape, options);
      const mapped = await primitive({ ...shape, material: anisotropic }, options);
      expect(expanded(mapped, 'POSITION')).toEqual(expanded(plain, 'POSITION'));
      expect(expanded(mapped, 'NORMAL')).toEqual(expanded(plain, 'NORMAL'));
      expect(mapped.getIndices()!.getCount()).toBe(shape.triangles.length);
      expect(mapped.getAttribute('POSITION')!.getCount()).toBe(24);
      expect(shape).toEqual(original);
      assertFrames(mapped);
      const uv = expanded(mapped, 'TEXCOORD_0');
      for (let offset = 0; offset < uv.length; offset += 6) {
        const determinant =
          (uv[offset + 2]! - uv[offset]!) * (uv[offset + 5]! - uv[offset + 1]!) -
          (uv[offset + 4]! - uv[offset]!) * (uv[offset + 3]! - uv[offset + 1]!);
        expect(Math.abs(determinant)).toBe(1);
      }
      expect(picovoxelToGlb({ shapes: [{ ...shape, material: anisotropic }] }, options)).toEqual(
        picovoxelToGlb({ shapes: [{ ...shape, material: anisotropic }] }, options),
      );
    },
  );

  it('should retain welded geometry and omit UV/tangents when a material uses only core factors', async () => {
    const shape = box();
    const plain = await primitive(shape);
    const authored = {
      name: 'Texture',
      extras: { note: 'Texture', normalTexture: { index: 99 }, nested: { text: 'Texture' } },
      pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.25 },
      doubleSided: false,
    } satisfies GlbMaterial;
    const factors = await primitive({ ...shape, material: authored });
    for (const name of ['POSITION', 'NORMAL']) {
      expect(factors.getAttribute(name)!.getArray()).toEqual(plain.getAttribute(name)!.getArray());
    }
    expect(factors.getIndices()!.getArray()).toEqual(shape.triangles);
    expect(factors.getAttribute('TEXCOORD_0')).toBeNull();
    expect(factors.getAttribute('TANGENT')).toBeNull();
    const io = await createNodeIo();
    const { json } = await io.binaryToJSON(picovoxelToGlb({ shapes: [{ ...shape, material: authored }] }));
    expect(json.materials).toEqual([authored]);
  });

  it('should retain exact CAD defaults when omitted and standard defaults when an empty material is authored', async () => {
    const shape = box();
    const io = await createNodeIo();
    const omitted = picovoxelToGlb({ shapes: [shape] });
    const explicitUndefined = picovoxelToGlb({ shapes: [{ ...shape, material: undefined }] });
    expect(explicitUndefined).toEqual(omitted);
    const authoredEmpty = picovoxelToGlb({ shapes: [{ ...shape, material: {} }] });
    const emptyJson = await io.binaryToJSON(authoredEmpty);
    expect(emptyJson.json.materials).toEqual([{}]);
    const plain = await primitive(shape);
    const empty = await primitive({ ...shape, material: {} });
    expect(expanded(empty, 'POSITION')).toEqual(expanded(plain, 'POSITION'));
    expect(expanded(empty, 'NORMAL')).toEqual(expanded(plain, 'NORMAL'));
    await Promise.all(
      (['OPAQUE', 'MASK', 'BLEND'] as const).map(async (alphaMode) => {
        const material = { alphaMode, alphaCutoff: 0.4, doubleSided: false };
        const { json } = await io.binaryToJSON(picovoxelToGlb({ shapes: [{ ...shape, material }] }));
        expect(json.materials).toEqual([material]);
      }),
    );
  });

  it('should retain the same smooth shared-edge normal in every chart duplicate', async () => {
    const shape: PicovoxelShapeSnapshot = {
      name: 'Smooth fan',
      lane: 'exact',
      vertices: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 3]),
      triangles: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const plain = await primitive(shape, { coordinateSystem: 'z-up' });
    const mapped = await primitive({ ...shape, material: anisotropic }, { coordinateSystem: 'z-up' });
    expect(expanded(mapped, 'POSITION')).toEqual(expanded(plain, 'POSITION'));
    expect(expanded(mapped, 'NORMAL')).toEqual(expanded(plain, 'NORMAL'));
    const positions = mapped.getAttribute('POSITION')!;
    const normals = mapped.getAttribute('NORMAL')!;
    const copies = Array.from({ length: positions.getCount() }, (_, index) => index).filter((index) =>
      element(positions, index).every((value) => value === 0),
    );
    expect(copies).toHaveLength(2);
    const shared = element(plain.getAttribute('NORMAL')!, 0);
    expect(shared[0]).toBeGreaterThan(0);
    expect(shared[2]).toBeGreaterThan(0);
    for (const index of copies) {
      expect(element(normals, index)).toEqual(shared);
    }
    assertFrames(mapped);
  });

  it.each([false, true])(
    'should derive actual UV tangents and handedness on tilted geometry (mirrored=%s)',
    async (mirrored) => {
      const shape: PicovoxelShapeSnapshot = {
        name: 'Tilted derivative',
        lane: 'exact',
        material: anisotropic,
        vertices: new Float32Array(
          [3, -2, 5, 7, -1, 7, 4, 3, 8].map((value, index) => (mirrored && index % 3 === 0 ? -value : value)),
        ),
        triangles: new Uint32Array([0, 1, 2]),
      };
      await Promise.all(
        (
          [{}, { coordinateSystem: 'z-up', unit: { length: 'millimeter' } }] satisfies GeometryOutputTransformOptions[]
        ).map(async (options) => {
          const surface = await primitive(shape, options);
          assertFrames(surface);
          assertTriangleDerivative(surface);
        }),
      );
    },
  );

  it('should preserve chart phase and transform tangent directions once between metre/Y-up and millimetre/Z-up exports', async () => {
    const shape = { ...box(), material: anisotropic };
    const yUp = await primitive(shape);
    const zUp = await primitive(shape, { coordinateSystem: 'z-up', unit: { length: 'millimeter' } });
    expect(zUp.getAttribute('TEXCOORD_0')!.getArray()).toEqual(yUp.getAttribute('TEXCOORD_0')!.getArray());
    const positions = zUp.getAttribute('POSITION')!;
    for (let index = 0; index < positions.getCount(); index++) {
      const z = element(positions, index);
      const y = element(yUp.getAttribute('POSITION')!, index);
      expect(y).toEqual([
        expect.closeTo(z[0]! / 1000, 7),
        expect.closeTo(z[2]! / 1000, 7),
        expect.closeTo(-z[1]! / 1000, 7),
      ]);
      const tz = element(zUp.getAttribute('TANGENT')!, index);
      const ty = element(yUp.getAttribute('TANGENT')!, index);
      expect(ty).toEqual([tz[0], tz[2], -tz[1]!, tz[3]]);
    }
  });

  it.each([
    { vertices: [0, 0, 4, 5, 0, 4, 0, 6, 4, 2, 2, 4] },
    { vertices: [0, 0, 0, 5, 0, 0, 0, 2 ** -20, 2 ** -20, 2, 2, 4] },
  ])('should keep planar and thin triangles finite while ignoring unreferenced vertices (%j)', async ({ vertices }) => {
    const shape: PicovoxelShapeSnapshot = {
      name: 'Thin',
      lane: 'exact',
      material: anisotropic,
      vertices: new Float32Array(vertices),
      triangles: new Uint32Array([0, 1, 2]),
    };
    const surface = await primitive(shape);
    expect(surface.getAttribute('POSITION')!.getCount()).toBe(3);
    assertFrames(surface);
    assertTriangleDerivative(surface);
  });

  it.each([
    { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normal: [1, 0, 0] },
    { positions: [0, 0, 0, 1, 0, 0, 2, 0, 0], normal: [0, 1, 0] },
    { positions: [0, 0, 0, 1, 0, 0, 2, 0, 0], normal: [0, 0, 0] },
  ])(
    'should keep the internal mapping fallback finite for collapsed charts and parallel normals (%j)',
    ({ positions, normal }) => {
      // Direct math admission: production snapshot validation removes zero-area triangles before rendering.
      const mapped = projectSurfaceCoordinates({
        positions: new Float32Array(positions),
        normals: new Float32Array([...normal, ...normal, ...normal]),
        indices: new Uint32Array([0, 1, 2]),
      });
      expect(mapped.positions).toEqual(new Float32Array(positions));
      expect(mapped.normals).toEqual(new Float32Array([...normal, ...normal, ...normal]));
      expect([...mapped.texCoords, ...mapped.tangents].every((value) => Number.isFinite(value))).toBe(true);
      for (let offset = 0; offset < mapped.tangents.length; offset += 4) {
        const tangent = [...mapped.tangents.subarray(offset, offset + 4)];
        expect(Math.hypot(...tangent.slice(0, 3))).toBeCloseTo(1, 5);
        expect(dot(tangent, normal)).toBeCloseTo(0, 5);
        expect(Math.abs(tangent[3]!)).toBe(1);
      }
    },
  );

  it('should orient the reconstructed bitangent to UV derivatives when supplied normals oppose the winding', () => {
    const vertices = [
      [3, -2, 5],
      [7, -1, 7],
      [4, 3, 8],
    ];
    const edge1 = subtract(vertices[1]!, vertices[0]!);
    const edge2 = subtract(vertices[2]!, vertices[0]!);
    const normal = normalized(cross(edge1, edge2)).map((value) => -value);
    const mapped = projectSurfaceCoordinates({
      positions: new Float32Array(vertices.flat()),
      normals: new Float32Array([...normal, ...normal, ...normal]),
      indices: new Uint32Array([0, 1, 2]),
    });
    const [ua, va, ub, vb, uc, vc] = mapped.texCoords;
    const du1 = ub! - ua!;
    const dv1 = vb! - va!;
    const du2 = uc! - ua!;
    const dv2 = vc! - va!;
    const determinant = du1 * dv2 - du2 * dv1;
    const du = edge1.map((value, axis) => (value * dv2 - edge2[axis]! * dv1) / determinant);
    const dv = edge2.map((value, axis) => (value * du1 - edge1[axis]! * du2) / determinant);
    for (let offset = 0; offset < mapped.tangents.length; offset += 4) {
      const tangent = [...mapped.tangents.subarray(offset, offset + 3)];
      const expected = normalized(du.map((value, axis) => value - normal[axis]! * dot(normal, du)));
      for (let axis = 0; axis < 3; axis++) {
        expect(tangent[axis]).toBeCloseTo(expected[axis]!, 5);
      }
      const orientation = dot(cross(normal, tangent), dv);
      expect(orientation).toBeLessThan(0);
      const handedness = mapped.tangents[offset + 3]!;
      expect(handedness).toBe(Math.sign(orientation));
      expect(
        dot(
          cross(normal, tangent).map((value) => value * handedness),
          dv,
        ),
      ).toBeGreaterThan(0);
    }
  });

  it.each([{}, { thicknessFactor: 0.003 }, { attenuationDistance: 0.2 }])(
    'should scale only authored volume distances and preserve omitted fields (%j)',
    async (volume) => {
      const material: GlbMaterial = { extensions: { KHR_materials_volume: volume } };
      const io = await createNodeIo();
      const { json } = await io.binaryToJSON(
        picovoxelToGlb({ shapes: [{ ...box(), material }] }, { unit: { length: 'millimeter' } }),
      );
      const expected = Object.fromEntries(Object.entries(volume).map(([key, value]) => [key, value * 1000]));
      expect(json.materials).toEqual([{ extensions: { KHR_materials_volume: expected } }]);
    },
  );

  it('should preserve material volume units in standalone embedded glTF and keep the captured material unchanged', async () => {
    const material: GlbMaterial = {
      name: 'Volume',
      extensions: {
        KHR_materials_volume: { thicknessFactor: 0.003, attenuationDistance: 0.2 },
        KHR_materials_iridescence: { iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 360 },
        KHR_materials_anisotropy: { anisotropyStrength: 0.7, anisotropyRotation: 0.3 },
      },
    };
    const before = structuredClone(material);
    const handle = { shapes: [{ ...box(), material }] };
    const io = await createNodeIo();
    const json = JSON.parse(
      new TextDecoder().decode(picovoxelToGltf(handle, { coordinateSystem: 'z-up', unit: { length: 'millimeter' } })),
    ) as Awaited<ReturnType<typeof io.writeJSON>>['json'];
    expect(json.materials?.[0]).toEqual({
      ...material,
      extensions: { ...material.extensions, KHR_materials_volume: { thicknessFactor: 3, attenuationDistance: 200 } },
    });
    expect(json.buffers?.[0]?.uri).toMatch(/^data:/u);
    const restored = await io.readJSON({ json, resources: {} });
    expect(restored.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('TANGENT')).not.toBeNull();
    expect(material).toEqual(before);
  });
});
