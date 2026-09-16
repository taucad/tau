// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildIcosphere,
  extractConvexFaces,
  getMetalMorphGeometryData,
  getMetalMorphPlaneTable,
  icosphereVertexCount,
  metalMorphShapeDefinitions,
  metalMorphShapeIds,
  prepareSolid,
  sampleFromPlaneTable,
  sampleRadial,
} from '#components/geometry/loader/metal-morph-shapes.js';
import type { Vector3Tuple } from '#components/geometry/loader/metal-morph-shapes.js';

const normalise = (vector: Vector3Tuple): Vector3Tuple => {
  const magnitude = Math.hypot(...vector);
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
};

describe('extractConvexFaces', () => {
  it.each([
    { name: 'cube', vertices: metalMorphShapeDefinitions.cube.vertices, faceCount: 6, polygonSize: 4 },
    { name: 'dodecahedron', vertices: metalMorphShapeDefinitions.dodecahedron.vertices, faceCount: 12, polygonSize: 5 },
    { name: 'icosahedron', vertices: metalMorphShapeDefinitions.icosahedron.vertices, faceCount: 20, polygonSize: 3 },
    {
      name: 'octahedron',
      vertices: metalMorphShapeDefinitions['stella-octangula'].vertices,
      faceCount: 8,
      polygonSize: 3,
    },
    {
      name: 'rhombic dodecahedron',
      vertices: metalMorphShapeDefinitions['escher-star'].vertices,
      faceCount: 12,
      polygonSize: 4,
    },
  ])('should recover the $name faces with their polygon size', ({ vertices, faceCount, polygonSize }) => {
    const faces = extractConvexFaces(vertices);

    expect(faces).toHaveLength(faceCount);
    for (const face of faces) {
      expect(face.vertices).toHaveLength(polygonSize);
      expect(Math.hypot(...face.normal)).toBeCloseTo(1, 9);
      expect(face.offset).toBeGreaterThan(0);
      for (const vertex of face.vertices) {
        expect(face.normal[0] * vertex[0] + face.normal[1] * vertex[1] + face.normal[2] * vertex[2]).toBeCloseTo(
          face.offset,
          9,
        );
      }
    }
  });

  it('should order every polygon counter-clockwise when viewed from outside', () => {
    for (const face of extractConvexFaces(metalMorphShapeDefinitions.dodecahedron.vertices)) {
      const [a, b, c] = face.vertices;
      const edgeA: Vector3Tuple = [b![0] - a![0], b![1] - a![1], b![2] - a![2]];
      const edgeB: Vector3Tuple = [c![0] - a![0], c![1] - a![1], c![2] - a![2]];
      const winding: Vector3Tuple = [
        edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
        edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
        edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
      ];
      expect(winding[0] * face.normal[0] + winding[1] * face.normal[1] + winding[2] * face.normal[2]).toBeGreaterThan(
        0,
      );
    }
  });
});

describe('sampleRadial', () => {
  it('should measure a cube face at its inradius and a corner at its circumradius', () => {
    const cube = prepareSolid(metalMorphShapeDefinitions.cube);
    const { scale } = metalMorphShapeDefinitions.cube;

    const face = sampleRadial(cube, [1, 0, 0]);
    expect(face.radius).toBeCloseTo(scale, 9);
    expect(face.normal[0]).toBeCloseTo(1, 9);
    expect(face.normal[1]).toBeCloseTo(0, 9);
    expect(face.normal[2]).toBeCloseTo(0, 9);

    const corner = sampleRadial(cube, normalise([1, 1, 1]));
    expect(corner.radius).toBeCloseTo(scale * Math.sqrt(3), 9);
  });

  it('should reach the spike apex of a stellated solid along its face normal', () => {
    const star = prepareSolid(metalMorphShapeDefinitions['stella-octangula']);

    const apex = sampleRadial(star, normalise([1, 1, 1]));
    expect(apex.radius).toBeCloseTo(1, 6);

    const valley = sampleRadial(star, [1, 0, 0]);
    expect(valley.radius).toBeCloseTo(metalMorphShapeDefinitions['stella-octangula'].scale, 9);
    expect(valley.normal[0]).toBeGreaterThan(0);
  });

  it('should keep every spike normal facing outward along its own ray', () => {
    const star = prepareSolid(metalMorphShapeDefinitions['escher-star']);
    for (let sample = 0; sample < 500; sample += 1) {
      const theta = (sample / 500) * Math.PI * 2 * 7.31;
      const z = 1 - (2 * (sample + 0.5)) / 500;
      const ring = Math.sqrt(1 - z * z);
      const direction: Vector3Tuple = [ring * Math.cos(theta), ring * Math.sin(theta), z];
      const { radius, normal } = sampleRadial(star, direction);
      expect(radius).toBeGreaterThan(0.3);
      expect(radius).toBeLessThanOrEqual(1 + 1e-9);
      expect(normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2]).toBeGreaterThan(0);
    }
  });
});

describe('buildIcosphere', () => {
  it.each([0, 1, 3])('should produce the closed-form vertex count at detail %i', (detail) => {
    const { positions, index } = buildIcosphere(detail);

    expect(positions.length / 3).toBe(icosphereVertexCount(detail));
    expect(index.length / 3).toBe(20 * 4 ** detail);
    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      expect(Math.hypot(positions[vertex]!, positions[vertex + 1]!, positions[vertex + 2]!)).toBeCloseTo(1, 6);
    }
  });
});

describe('getMetalMorphGeometryData', () => {
  it('should pack finite outward samples for every shape and share the cached instance', () => {
    const data = getMetalMorphGeometryData(2);

    expect(data.vertexCount).toBe(icosphereVertexCount(2));
    expect(Object.keys(data.shapes).sort()).toEqual([...metalMorphShapeIds].sort());
    for (const id of metalMorphShapeIds) {
      const packed = data.shapes[id];
      expect(packed).toHaveLength(data.vertexCount * 4);
      for (let vertex = 0; vertex < data.vertexCount; vertex += 1) {
        const radius = packed[vertex * 4 + 3]!;
        const dot =
          packed[vertex * 4]! * data.directions[vertex * 3]! +
          packed[vertex * 4 + 1]! * data.directions[vertex * 3 + 1]! +
          packed[vertex * 4 + 2]! * data.directions[vertex * 3 + 2]!;
        expect(Number.isFinite(radius)).toBe(true);
        expect(radius).toBeGreaterThan(0.25);
        expect(radius).toBeLessThanOrEqual(1.1);
        expect(dot).toBeGreaterThan(0);
      }
    }
    expect(getMetalMorphGeometryData(2)).toBe(data);
  });
});

describe('getMetalMorphPlaneTable', () => {
  it('should flatten every shape into contiguous core and side planes', () => {
    const table = getMetalMorphPlaneTable();

    expect(table.descriptors).toHaveLength(metalMorphShapeIds.length);
    expect(table.planes).toHaveLength(130);
    expect(table.descriptors).toEqual([
      [0, 12, 12, 4],
      [60, 8, 68, 3],
      [92, 6, 98, 0],
      [98, 12, 110, 0],
      [110, 20, 130, 0],
    ]);
    for (const plane of table.planes) {
      expect(Math.hypot(plane[0], plane[1], plane[2])).toBeCloseTo(1, 9);
      expect(plane[3]).toBeGreaterThan(0);
    }
    expect(getMetalMorphPlaneTable()).toBe(table);
  });

  it('should reproduce the radial sampler through the shader lookup order for every shape', () => {
    const table = getMetalMorphPlaneTable();
    for (const [shapeIndex, id] of metalMorphShapeIds.entries()) {
      const solid = prepareSolid(metalMorphShapeDefinitions[id]);
      for (let sample = 0; sample < 300; sample += 1) {
        const theta = (sample / 300) * Math.PI * 2 * 5.17;
        const z = 1 - (2 * (sample + 0.5)) / 300;
        const ring = Math.sqrt(1 - z * z);
        const direction: Vector3Tuple = [ring * Math.cos(theta), ring * Math.sin(theta), z];
        const expected = sampleRadial(solid, direction);
        const actual = sampleFromPlaneTable(table, shapeIndex, direction);
        expect(actual.radius).toBeCloseTo(expected.radius, 9);
        expect(actual.normal[0]).toBeCloseTo(expected.normal[0], 9);
        expect(actual.normal[1]).toBeCloseTo(expected.normal[1], 9);
        expect(actual.normal[2]).toBeCloseTo(expected.normal[2], 9);
      }
    }
  });
});
