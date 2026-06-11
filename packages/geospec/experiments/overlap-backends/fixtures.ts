import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { loadMesh } from '../../src/mesh/load-mesh.js';
import type { GeometrySubject } from '../../src/mesh/types.js';
import type { OverlapFixture } from './types.js';

type BoxSpec = {
  name: string;
  min: [number, number, number];
  size: [number, number, number];
};

type TriangleMeshSpec = {
  name: string;
  positions: number[];
  indices?: number[];
};

const boxIndices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
] as const;

const boxMesh = (spec: BoxSpec): TriangleMeshSpec => {
  const [x, y, z] = spec.min;
  const [sx, sy, sz] = spec.size;
  return {
    name: spec.name,
    positions: [
      x,
      y,
      z,
      x + sx,
      y,
      z,
      x + sx,
      y + sy,
      z,
      x,
      y + sy,
      z,
      x,
      y,
      z + sz,
      x + sx,
      y,
      z + sz,
      x + sx,
      y + sy,
      z + sz,
      x,
      y + sy,
      z + sz,
    ],
    indices: [...boxIndices],
  };
};

const openSquareMesh = (name: string): TriangleMeshSpec => ({
  name,
  positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0],
  indices: [0, 1, 2, 0, 2, 3],
});

const cylinderMesh = (options: {
  name: string;
  radius: number;
  height: number;
  segments: number;
  center: [number, number, number];
}): TriangleMeshSpec => {
  const positions: number[] = [];
  const indices: number[] = [];
  const [cx, cy, cz] = options.center;
  const bottomCenter = 0;
  const topCenter = 1;
  positions.push(cx, cy, cz - options.height / 2, cx, cy, cz + options.height / 2);
  for (let index = 0; index < options.segments; index++) {
    const angle = (Math.PI * 2 * index) / options.segments;
    const x = cx + Math.cos(angle) * options.radius;
    const y = cy + Math.sin(angle) * options.radius;
    positions.push(x, y, cz - options.height / 2, x, y, cz + options.height / 2);
  }
  for (let index = 0; index < options.segments; index++) {
    const next = (index + 1) % options.segments;
    const bottom = 2 + index * 2;
    const top = bottom + 1;
    const nextBottom = 2 + next * 2;
    const nextTop = nextBottom + 1;
    indices.push(
      bottomCenter,
      nextBottom,
      bottom,
      topCenter,
      top,
      nextTop,
      bottom,
      nextBottom,
      nextTop,
      bottom,
      nextTop,
      top,
    );
  }
  return { name: options.name, positions, indices };
};

const createSubjectFromMeshes = async (options: {
  id: string;
  description: string;
  meshes: TriangleMeshSpec[];
}): Promise<GeometrySubject> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene(options.id);
  for (const meshSpec of options.meshes) {
    const positions = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setBuffer(buffer)
      .setArray(new Float32Array(meshSpec.positions));
    const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions);
    if (meshSpec.indices) {
      primitive.setIndices(
        document
          .createAccessor()
          .setType(Accessor.Type['SCALAR']!)
          .setBuffer(buffer)
          .setArray(new Uint32Array(meshSpec.indices)),
      );
    }
    const mesh = document.createMesh(meshSpec.name).addPrimitive(primitive);
    scene.addChild(document.createNode(meshSpec.name).setMesh(mesh));
  }

  const bytes = await new WebIO().writeBinary(document);
  const result = await loadMesh({
    source: bytes,
    path: `/fixtures/${options.id}.glb`,
    sourceUnit: 'mm',
    unit: 'mm',
    parameters: { fixture: options.id, description: options.description },
  });
  if (!result.success) {
    throw new Error(`Failed to load overlap fixture ${options.id}: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.subject;
};

const fixture = (options: {
  id: string;
  description: string;
  meshes: () => TriangleMeshSpec[];
  expected: OverlapFixture['expected'];
}): OverlapFixture => ({
  id: options.id,
  description: options.description,
  expected: options.expected,
  loadSubject: () =>
    createSubjectFromMeshes({
      id: options.id,
      description: options.description,
      meshes: options.meshes(),
    }),
});

export const disjointBoxesFixture = fixture({
  id: 'disjoint-boxes',
  description: 'Two closed boxes with separated AABBs.',
  meshes: () => [
    boxMesh({ name: 'left-box', min: [0, 0, 0], size: [10, 20, 30] }),
    boxMesh({ name: 'right-box', min: [15, 0, 0], size: [10, 20, 30] }),
  ],
  expected: { overlaps: [] },
});

export const tangentBoxesFixture = fixture({
  id: 'tangent-boxes',
  description: 'Two closed boxes sharing one face with zero positive volume.',
  meshes: () => [
    boxMesh({ name: 'left-box', min: [0, 0, 0], size: [10, 20, 30] }),
    boxMesh({ name: 'right-box', min: [10, 0, 0], size: [10, 20, 30] }),
  ],
  expected: { overlaps: [] },
});

export const overlappingBoxesFixture = fixture({
  id: 'overlapping-boxes',
  description: 'Two closed boxes with a 1 x 20 x 30 mm positive-volume intersection.',
  meshes: () => [
    boxMesh({ name: 'left-box', min: [0, 0, 0], size: [10, 20, 30] }),
    boxMesh({ name: 'right-box', min: [9, 0, 0], size: [10, 20, 30] }),
  ],
  expected: {
    overlaps: [{ leftLabel: 'left-box#0', rightLabel: 'right-box#0', volume: 600, tolerance: 1e-6 }],
  },
});

export const containedBoxFixture = fixture({
  id: 'contained-box',
  description: 'A small closed box fully contained inside a larger closed box.',
  meshes: () => [
    boxMesh({ name: 'outer-box', min: [0, 0, 0], size: [10, 20, 30] }),
    boxMesh({ name: 'inner-box', min: [1, 1, 1], size: [2, 2, 2] }),
  ],
  expected: {
    overlaps: [{ leftLabel: 'outer-box#0', rightLabel: 'inner-box#0', volume: 8, tolerance: 1e-6 }],
  },
});

export const vertexContactBoxesFixture = fixture({
  id: 'vertex-contact-boxes',
  description: 'Two closed boxes touching at one vertex with zero positive volume.',
  meshes: () => [
    boxMesh({ name: 'left-box', min: [0, 0, 0], size: [10, 20, 30] }),
    boxMesh({ name: 'corner-box', min: [10, 20, 30], size: [5, 5, 5] }),
  ],
  expected: { overlaps: [] },
});

export const manyPartSparseGridFixture = (count = 100): OverlapFixture =>
  fixture({
    id: `many-part-sparse-grid-${count}`,
    description: `${count} small boxes separated by wide gaps.`,
    meshes: () =>
      Array.from({ length: count }, (_, index) => {
        const x = (index % 10) * 20;
        const y = Math.floor(index / 10) * 20;
        return boxMesh({ name: `grid-box-${index}`, min: [x, y, 0], size: [5, 5, 5] });
      }),
    expected: { overlaps: [] },
  });

export const highTriangleCylindersFixture = fixture({
  id: 'high-triangle-cylinders',
  description: 'Two high-segment cylinders separated by a narrow clearance.',
  meshes: () => [
    cylinderMesh({ name: 'left-cylinder', radius: 10, height: 30, segments: 128, center: [0, 0, 15] }),
    cylinderMesh({ name: 'right-cylinder', radius: 10, height: 30, segments: 128, center: [21, 0, 15] }),
  ],
  expected: { overlaps: [] },
});

export const openBoundaryFixture = fixture({
  id: 'open-boundary',
  description: 'One open square and one closed box, used to verify manifoldness diagnostics.',
  meshes: () => [openSquareMesh('open-square'), boxMesh({ name: 'closed-box', min: [20, 0, 0], size: [5, 5, 5] })],
  expected: { overlaps: [] },
});

export const overlapExperimentFixtures = [
  disjointBoxesFixture,
  tangentBoxesFixture,
  overlappingBoxesFixture,
  containedBoxFixture,
  vertexContactBoxesFixture,
  manyPartSparseGridFixture(),
  highTriangleCylindersFixture,
  openBoundaryFixture,
] as const;
