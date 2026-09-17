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

describe('prepareSolid', () => {
  it.each(['escher-star', 'stella-octangula'] as const)(
    'should pair every %s spike side with its crease twin',
    (id) => {
      const star = prepareSolid(metalMorphShapeDefinitions[id]);
      const spikes = star.spikes ?? [];
      const creases = star.creases ?? [];

      expect(spikes.length).toBeGreaterThan(0);
      expect(creases).toHaveLength(spikes.length);
      for (const [faceIndex, sides] of spikes.entries()) {
        for (const [sideIndex, side] of sides.entries()) {
          const twin = creases[faceIndex]![sideIndex]!;
          expect(sides).not.toContain(twin);
          expect(spikes.flat()).toContain(twin);
          const edge = [side.vertices[0], side.vertices[1]].map((vertex) => vertex!.map((c) => c.toFixed(6)).join(','));
          const twinEdge = [twin.vertices[0], twin.vertices[1]].map((vertex) =>
            vertex!.map((c) => c.toFixed(6)).join(','),
          );
          expect(twinEdge.sort()).toEqual(edge.sort());
        }
      }
    },
  );

  it('should carry the definition temperature without spikes for plain solids', () => {
    const cube = prepareSolid(metalMorphShapeDefinitions.cube);

    expect(cube.roundness).toBe(metalMorphShapeDefinitions.cube.roundness);
    expect(cube.spikes).toBeUndefined();
    expect(cube.creases).toBeUndefined();
  });
});

describe('sampleRadial', () => {
  it('should measure a cube face at its inradius and a corner at its circumradius', () => {
    const cube = prepareSolid(metalMorphShapeDefinitions.cube);
    const { scale, roundness } = metalMorphShapeDefinitions.cube;

    const face = sampleRadial(cube, [1, 0, 0]);
    expect(face.radius).toBeCloseTo(scale, 9);
    expect(face.normal[0]).toBeCloseTo(1, 9);
    expect(face.normal[1]).toBeCloseTo(0, 9);
    expect(face.normal[2]).toBeCloseTo(0, 9);

    // Three faces tie at a corner, so the fillet sits one temperature times ln 3 inside the circumradius.
    const corner = sampleRadial(cube, normalise([1, 1, 1]));
    expect(corner.radius).toBeCloseTo(scale * Math.sqrt(3) - roundness * Math.log(3), 9);
    expect(corner.normal[0]).toBeCloseTo(1 / Math.sqrt(3), 9);
    expect(corner.normal[1]).toBeCloseTo(1 / Math.sqrt(3), 9);
    expect(corner.normal[2]).toBeCloseTo(1 / Math.sqrt(3), 9);
  });

  it('should fillet an edge over a band that scales with the temperature', () => {
    const { cube: definition } = metalMorphShapeDefinitions;
    const sharp = prepareSolid({ ...definition, roundness: 1e-4 });
    const soft = prepareSolid(definition);
    const softer = prepareSolid({ ...definition, roundness: definition.roundness * 2 });
    const edge = normalise([1, 1, 0]);

    // The cold reference still loses its own temperature times ln 2 where the two faces tie.
    expect(sampleRadial(sharp, edge).radius).toBeCloseTo(definition.scale * Math.sqrt(2), 3);
    expect(sampleRadial(soft, edge).radius).toBeCloseTo(
      definition.scale * Math.sqrt(2) - definition.roundness * Math.log(2),
      9,
    );
    expect(sampleRadial(softer, edge).radius).toBeLessThan(sampleRadial(soft, edge).radius);

    // Off the edge the fillet fades back onto the face, sooner at the cooler temperature.
    const nearEdge = normalise([1, 0.8, 0]);
    const sharpRadius = sampleRadial(sharp, nearEdge).radius;
    expect(sampleRadial(soft, nearEdge).radius).toBeLessThan(sharpRadius);
    expect(sharpRadius - sampleRadial(soft, nearEdge).radius).toBeLessThan(
      sharpRadius - sampleRadial(softer, nearEdge).radius,
    );
    expect(sampleRadial(soft, nearEdge).normal[1] / sampleRadial(soft, nearEdge).normal[0]).toBeGreaterThan(0);
    expect(sampleRadial(soft, nearEdge).normal[1] / sampleRadial(soft, nearEdge).normal[0]).toBeLessThan(1);
  });

  it('should blunt the spike tip and fill the valleys of a stellated solid', () => {
    const definition = metalMorphShapeDefinitions['stella-octangula'];
    const star = prepareSolid(definition);
    const sharp = prepareSolid({ ...definition, roundness: 1e-4 });

    // Three side planes tie at the apex; the neighbouring spikes' planes are too far below to add to it.
    const apex = sampleRadial(star, normalise([1, 1, 1]));
    expect(sampleRadial(sharp, normalise([1, 1, 1])).radius).toBeCloseTo(1, 3);
    expect(apex.radius).toBeCloseTo(1 - definition.roundness * Math.log(3), 4);
    expect(apex.normal[0]).toBeCloseTo(1 / Math.sqrt(3), 6);

    // The core vertex sits at the bottom of four valleys; the crease fill lifts it by less than one temperature.
    const valley = sampleRadial(star, [1, 0, 0]);
    expect(sampleRadial(sharp, [1, 0, 0]).radius).toBeCloseTo(definition.scale, 3);
    expect(valley.radius).toBeGreaterThan(definition.scale);
    expect(valley.radius).toBeLessThan(definition.scale + definition.roundness);
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
  it('should flatten the stellated shapes into contiguous core and side planes with crease twins', () => {
    const table = getMetalMorphPlaneTable();

    expect(table.descriptors).toHaveLength(metalMorphShapeIds.length);
    expect(table.planes).toHaveLength(92);
    expect(table.twins).toHaveLength(92);
    expect(table.descriptors).toEqual([
      [0, 12, 12, 4],
      [60, 8, 68, 3],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(table.roundness).toEqual(metalMorphShapeIds.map((id) => metalMorphShapeDefinitions[id].roundness));
    for (const [index, plane] of table.planes.entries()) {
      expect(Math.hypot(plane[0], plane[1], plane[2])).toBeCloseTo(1, 9);
      expect(plane[3]).toBeGreaterThan(0);
      const twin = table.twins[index]!;
      const isSidePlane = table.descriptors.some(
        (descriptor) =>
          descriptor[3] > 0 && index >= descriptor[2] && index < descriptor[2] + descriptor[1] * descriptor[3],
      );
      if (isSidePlane) {
        expect(Math.hypot(twin[0], twin[1], twin[2])).toBeCloseTo(1, 9);
        expect(twin).not.toEqual(plane);
        expect(table.planes).toContainEqual(twin);
      } else {
        expect(twin).toEqual([0, 0, 0, 0]);
      }
    }
    expect(getMetalMorphPlaneTable()).toBe(table);
  });

  it('should reproduce the radial sampler through the shader lookup order for every stellated shape', () => {
    const table = getMetalMorphPlaneTable();
    for (const [shapeIndex, id] of metalMorphShapeIds.entries()) {
      const solid = prepareSolid(metalMorphShapeDefinitions[id]);
      if (solid.spikes === undefined) {
        expect(() => sampleFromPlaneTable(table, shapeIndex, [1, 0, 0])).toThrow(/not stellated/u);
        continue;
      }
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
