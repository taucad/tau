import { describe, expect, it } from 'vitest';

import { validateExport } from '#runtime/export-validation.js';

type Point = readonly [number, number, number];

const tetrahedron: readonly Point[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const closedFaces = [
  [0, 2, 1],
  [0, 1, 3],
  [1, 2, 3],
  [0, 3, 2],
] as const;

const bytesOf = (array: ArrayBufferView): Uint8Array<ArrayBuffer> =>
  new Uint8Array(array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength) as ArrayBuffer);

/**
 * A GLB with one mesh per entry; each entry is one or more primitives of triangle corners.
 *
 * @param meshes - Per mesh, per primitive, the corner positions, three per triangle (de-indexed, as faces drawn apart).
 * @returns The GLB bytes.
 */
const glbOf = (meshes: ReadonlyArray<ReadonlyArray<readonly Point[]>>): Uint8Array<ArrayBuffer> => {
  const accessors: Array<Record<string, unknown>> = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const chunks: number[] = [];
  const gltfMeshes = meshes.map((primitives) => ({
    primitives: primitives.map((corners) => {
      bufferViews.push({
        buffer: 0,
        byteOffset: chunks.length * 4,
        byteLength: corners.length * 12,
      });
      accessors.push({
        bufferView: bufferViews.length - 1,
        componentType: 5126,
        count: corners.length,
        type: 'VEC3',
      });
      chunks.push(...corners.flat());
      // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
      return { attributes: { POSITION: accessors.length - 1 } };
    }),
  }));
  const bin = bytesOf(new Float32Array(chunks));
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      meshes: gltfMeshes,
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.byteLength }],
    }),
  );
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + bin.byteLength;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(json, 20);
  view.setUint32(20 + jsonLength, bin.byteLength, true);
  view.setUint32(24 + jsonLength, 0x00_4e_49_42, true);
  glb.set(bin, 28 + jsonLength);
  return glb;
};

const cornersOf = (faces: ReadonlyArray<readonly [number, number, number]>): Point[] =>
  faces.flatMap((face) => face.map((index) => tetrahedron[index]!));

const binaryStlOf = (corners: readonly Point[]): Uint8Array<ArrayBuffer> => {
  const count = corners.length / 3;
  const bytes = new Uint8Array(84 + count * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);
  for (const [index, [x, y, z]] of corners.entries()) {
    const at = 84 + Math.floor(index / 3) * 50 + 12 + (index % 3) * 12;
    view.setFloat32(at, x, true);
    view.setFloat32(at + 4, y, true);
    view.setFloat32(at + 8, z, true);
  }
  return bytes;
};

const text = (value: string): Uint8Array<ArrayBuffer> => bytesOf(new TextEncoder().encode(value));

describe('validateExport', () => {
  it('should report a closed GLB mesh as watertight even when its faces are drawn as separate primitives', () => {
    const split = closedFaces.map((face) => cornersOf([face]));

    expect(validateExport([{ name: 'model.glb', bytes: glbOf([split]) }])).toEqual({
      units: 'm',
      triangles: 4,
      watertight: true,
    });
  });

  it('should report a GLB with an open mesh as not watertight', () => {
    const closed = cornersOf(closedFaces);
    const open = cornersOf(closedFaces.slice(1));

    expect(validateExport([{ name: 'model.glb', bytes: glbOf([[closed], [open]]) }])).toEqual({
      units: 'm',
      triangles: 7,
      watertight: false,
    });
  });

  it('should keep only the unit of a GLB whose geometry it cannot read', () => {
    expect(validateExport([{ name: 'model.glb', bytes: text('not a glb') }])).toEqual({ units: 'm' });
  });

  it('should read binary and ASCII STL meshes, every part file of an export', () => {
    const ascii = `solid t\n${cornersOf(closedFaces.slice(1))
      .map(([x, y, z]) => `vertex ${String(x)} ${String(y)} ${String(z)}`)
      .join('\n')}\nendsolid t\n`;

    expect(validateExport([{ name: 'part.stl', bytes: binaryStlOf(cornersOf(closedFaces)) }])).toEqual({
      triangles: 4,
      watertight: true,
    });
    expect(validateExport([{ name: 'part.stl', bytes: text(ascii) }])).toEqual({
      triangles: 3,
      watertight: false,
    });
    expect(
      validateExport([
        { name: 'a.stl', bytes: binaryStlOf(cornersOf(closedFaces)) },
        { name: 'b.stl', bytes: text(ascii) },
      ]),
    ).toEqual({ triangles: 7, watertight: false });
  });

  it('should count the solids and read the length unit of a STEP file', () => {
    const step = [
      'ISO-10303-21;',
      "#10=MANIFOLD_SOLID_BREP('',#11);",
      "#20=BREP_WITH_VOIDS('',#21,(#22));",
      '#30=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );',
      '#31=( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) );',
    ].join('\n');
    const inches = "#40=( CONVERSION_BASED_UNIT('INCH',#41) LENGTH_UNIT() NAMED_UNIT(#42) );";

    expect(validateExport([{ name: 'assembly.step', bytes: text(step) }])).toEqual({ units: 'mm', solids: 2 });
    expect(validateExport([{ name: 'a.stp', bytes: text(inches) }])).toEqual({
      units: 'in',
      solids: 0,
    });
  });

  it('should leave formats it does not read unvalidated', () => {
    expect(validateExport([{ name: 'model.3mf', bytes: text('PK') }])).toBeUndefined();
    expect(validateExport([])).toBeUndefined();
  });
});
