import { Document, Primitive, WebIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

import {
  isClosedTriangleMesh,
  markClosedGlbMeshesSingleSided,
  markClosedMeshesSingleSided,
} from '#utils/closed-mesh.js';
import { readGlbJson, writeGlbJson } from '#utils/gltf-geometry-name-normalizer.js';

// A unit cube, outward counter-clockwise faces, shared corners.
const cubePositions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
const cubeIndices = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
]);

/** The cube as triangle soup, one primitive per face pair, the way a B-rep writer splits faces. */
const cubeSoupByFace = (): Array<{ positions: Float32Array }> => {
  const faces: Array<{ positions: Float32Array }> = [];
  for (let face = 0; face < 6; face++) {
    const positions = new Float32Array(18);
    for (let corner = 0; corner < 6; corner++) {
      positions.set(
        cubePositions.subarray(cubeIndices[face * 6 + corner]! * 3, cubeIndices[face * 6 + corner]! * 3 + 3),
        corner * 3,
      );
    }
    faces.push({ positions });
  }
  return faces;
};

describe('isClosedTriangleMesh', () => {
  it('should accept a closed outward-facing cube, indexed or split into welded soup', () => {
    expect(isClosedTriangleMesh([{ positions: cubePositions, indices: cubeIndices }])).toBe(true);
    expect(isClosedTriangleMesh(cubeSoupByFace())).toBe(true);
  });

  it('should reject an open box, an inside-out cube and one flipped face', () => {
    expect(isClosedTriangleMesh([{ positions: cubePositions, indices: cubeIndices.slice(6) }])).toBe(false);
    const inverted = Uint32Array.from(cubeIndices);
    for (let corner = 0; corner < inverted.length; corner += 3) {
      [inverted[corner + 1], inverted[corner + 2]] = [inverted[corner + 2]!, inverted[corner + 1]!];
    }
    expect(isClosedTriangleMesh([{ positions: cubePositions, indices: inverted }])).toBe(false);
    const flipped = Uint32Array.from(cubeIndices);
    [flipped[1], flipped[2]] = [flipped[2]!, flipped[1]!];
    expect(isClosedTriangleMesh([{ positions: cubePositions, indices: flipped }])).toBe(false);
  });

  it('should reject two cubes sharing an edge, a non-manifold edge', () => {
    const shifted = cubePositions.map((value, index) =>
      index % 3 === 0 ? value + 1 : index % 3 === 1 ? value + 1 : value,
    );
    expect(
      isClosedTriangleMesh([
        { positions: cubePositions, indices: cubeIndices },
        { positions: shifted, indices: cubeIndices },
      ]),
    ).toBe(false);
  });

  it('should ignore degenerate triangles and reject indices past the positions', () => {
    expect(isClosedTriangleMesh([{ positions: cubePositions, indices: [...cubeIndices, 0, 0, 1] }])).toBe(true);
    expect(isClosedTriangleMesh([{ positions: cubePositions, indices: [...cubeIndices, 0, 1, 99] }])).toBe(false);
  });

  it('should reject empty and non-finite meshes', () => {
    expect(isClosedTriangleMesh([])).toBe(false);
    const nan = Float32Array.from(cubePositions);
    nan[0] = Number.NaN;
    expect(isClosedTriangleMesh([{ positions: nan, indices: cubeIndices }])).toBe(false);
  });
});

describe('markClosedMeshesSingleSided', () => {
  it('should give closed meshes a one-sided copy and leave open, blended and line primitives alone', () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (array: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, type: 'VEC3' | 'SCALAR') =>
      document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const shared = document.createMaterial('shared').setDoubleSided(true);
    const blended = document.createMaterial('blended').setDoubleSided(true).setAlphaMode('BLEND');
    const primitive = (indices: Uint32Array<ArrayBuffer>, material = shared, mode = Primitive.Mode['TRIANGLES']!) =>
      document
        .createPrimitive()
        .setMode(mode)
        .setAttribute('POSITION', accessor(cubePositions, 'VEC3'))
        .setIndices(accessor(indices, 'SCALAR'))
        .setMaterial(material);
    const closed = document
      .createMesh()
      .addPrimitive(primitive(cubeIndices))
      .addPrimitive(primitive(new Uint32Array([0, 1]), shared, Primitive.Mode['LINES']));
    const open = document.createMesh().addPrimitive(primitive(cubeIndices.slice(6)));
    const glass = document.createMesh().addPrimitive(primitive(cubeIndices, blended));
    const own = document.createMaterial('own').setDoubleSided(true);
    const solid = document.createMesh().addPrimitive(primitive(cubeIndices, own));
    // No positions, or no material: skipped.
    const unread = document.createMesh().addPrimitive(document.createPrimitive().setMaterial(shared));
    const bare = document.createMesh().addPrimitive(primitive(cubeIndices).setMaterial(null));

    markClosedMeshesSingleSided(document);

    const [surface, lines] = closed.listPrimitives();
    expect(surface!.getMaterial()!.getDoubleSided()).toBe(false);
    expect(surface!.getMaterial()!.getName()).toBe('shared');
    expect(lines!.getMaterial()).toBe(shared);
    expect(open.listPrimitives()[0]!.getMaterial()).toBe(shared);
    expect(shared.getDoubleSided()).toBe(true);
    expect(glass.listPrimitives()[0]!.getMaterial()).toBe(blended);
    expect(unread.listPrimitives()[0]!.getMaterial()).toBe(shared);
    expect(bare.listPrimitives()[0]!.getMaterial()).toBeNull();
    // Used only by a closed surface: changed in place, so material order and names stay as written.
    expect(solid.listPrimitives()[0]!.getMaterial()).toBe(own);
    expect(own.getDoubleSided()).toBe(false);
    expect(
      document
        .getRoot()
        .listMaterials()
        .map((material) => material.getName()),
    ).toEqual(['shared', 'blended', 'own', 'shared']);
  });
});

describe('markClosedGlbMeshesSingleSided', () => {
  const glbOf = async (...meshes: Array<Uint32Array<ArrayBuffer>>): Promise<Uint8Array<ArrayBuffer>> => {
    const document = new Document();
    const buffer = document.createBuffer();
    const material = document.createMaterial().setDoubleSided(true);
    const scene = document.createScene();
    for (const indices of meshes) {
      const primitive = document
        .createPrimitive()
        .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(cubePositions).setBuffer(buffer))
        .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
        .setMaterial(material);
      scene.addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));
    }
    return new WebIO().writeBinary(document);
  };

  it('should rewrite a GLB with a closed mesh and return any other GLB as given', async () => {
    const open = await glbOf(cubeIndices.slice(6));
    expect(await markClosedGlbMeshesSingleSided(open)).toBe(open);
    const marked = await new WebIO().readBinary(await markClosedGlbMeshesSingleSided(await glbOf(cubeIndices)));
    expect(marked.getRoot().listMaterials()[0]!.getDoubleSided()).toBe(false);
    // A material shared with an open surface would need a copy, which the GLB's own JSON has no index for.
    const shared = await glbOf(cubeIndices, cubeIndices.slice(6));
    expect(await markClosedGlbMeshesSingleSided(shared)).toBe(shared);
  });
});

describe('markClosedGlbMeshesSingleSided on an OpenRSCAD solid', () => {
  /**
   * The OpenRSCAD 0.11.0-beta.5 layout of a module-built part: mesh-less module nodes over one solid node whose
   * `EXT_mesh_manifold` mesh holds one primitive per owning module, sharing one `POSITION` accessor. The earlier
   * layout put each module's primitive on its own node and mesh.
   */
  const openrscadGlb = async (layout: 'solid-mesh' | 'module-meshes'): Promise<Uint8Array<ArrayBuffer>> => {
    const document = new Document();
    const buffer = document.createBuffer();
    const material = document.createMaterial('#F5A523FF Material').setDoubleSided(true);
    const positions = document.createAccessor().setType('VEC3').setArray(cubePositions).setBuffer(buffer);
    const primitive = (indices: Uint32Array<ArrayBuffer>, owner: number) =>
      document
        .createPrimitive()
        .setAttribute('POSITION', positions)
        .setIndices(document.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
        .setMaterial(material)
        .setExtras({ openrscad: { displayMode: 'solid', owner } });
    const bore = primitive(cubeIndices.slice(0, 12), 0);
    const block = primitive(cubeIndices.slice(12), 1);
    const cutout = document.createNode('Chamfered Cube Cutout');
    const blockNode = document.createNode('Chamfered Block');
    document.createScene().addChild(cutout.addChild(blockNode));
    if (layout === 'solid-mesh') {
      cutout.addChild(
        document
          .createNode('Chamfered Cube Cutout Solid')
          .setMesh(document.createMesh('Chamfered Cube Cutout Solid').addPrimitive(bore).addPrimitive(block)),
      );
    } else {
      cutout.setMesh(document.createMesh('Chamfered Cube Cutout').addPrimitive(bore));
      blockNode.setMesh(document.createMesh('Chamfered Block').addPrimitive(block));
    }
    const manifoldIndices = document.createAccessor().setType('SCALAR').setArray(cubeIndices).setBuffer(buffer);
    const glb = await new WebIO().writeBinary(document);
    if (layout === 'module-meshes') {
      return glb;
    }
    const json = readGlbJson(glb);
    const accessors = json.accessors ?? [];
    json.extensionsUsed = ['EXT_mesh_manifold'];
    json.meshes![0]!.extensions = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF extension name
      EXT_mesh_manifold: {
        manifoldPrimitive: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantic
          attributes: { POSITION: accessors.findIndex(({ type }) => type === 'VEC3') },
          indices: accessors.findLastIndex(({ count }) => count === manifoldIndices.getCount()),
          mode: 4,
        },
      },
    };
    return writeGlbJson(glb, json);
  };

  it('draws the one-mesh solid one-sided, where no module mesh of the earlier layout was closed alone', async () => {
    const solid = await openrscadGlb('solid-mesh');
    const marked = await markClosedGlbMeshesSingleSided(solid);
    expect(readGlbJson(marked).materials?.map(({ doubleSided }) => doubleSided)).toEqual([false]);
    expect(readGlbJson(marked).meshes?.[0]?.extensions).toEqual(readGlbJson(solid).meshes?.[0]?.extensions);

    const split = await openrscadGlb('module-meshes');
    expect(await markClosedGlbMeshesSingleSided(split)).toBe(split);
  });
});
