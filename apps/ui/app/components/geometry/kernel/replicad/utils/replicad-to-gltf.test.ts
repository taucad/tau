import { describe, it, expect } from 'vitest';
import { convertReplicadGeometriesToGltf } from '#components/geometry/kernel/replicad/utils/replicad-to-gltf.js';
import type { GeometryReplicad } from '#components/geometry/kernel/replicad/replicad.types.js';

describe('convertReplicadShapesToGltf', () => {
  it('should convert empty geometries array to valid GLTF data', async () => {
    const result = await convertReplicadGeometriesToGltf([], 'glb');

    expect(result).toBeDefined();
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should convert a simple cube geometry to GLTF', async () => {
    // Mock a simple cube geometry data
    const cubeShape: GeometryReplicad = {
      format: 'replicad',
      name: 'Test Cube',
      color: '#ff0000',
      opacity: 1,
      faces: {
        // Simple triangle vertices (3 vertices per triangle, 3 components per vertex)
        vertices: [
          0,
          0,
          0, // Vertex 0
          1,
          0,
          0, // Vertex 1
          1,
          1,
          0, // Vertex 2
          0,
          1,
          0, // Vertex 3
        ],
        // Two triangles forming a square (indices into vertices array)
        triangles: [
          0,
          1,
          2, // First triangle
          0,
          2,
          3, // Second triangle
        ],
        normals: [
          0,
          0,
          1, // Normal for vertex 0
          0,
          0,
          1, // Normal for vertex 1
          0,
          0,
          1, // Normal for vertex 2
          0,
          0,
          1, // Normal for vertex 3
        ],
        faceGroups: [],
      },
      edges: {
        lines: [],
        edgeGroups: [],
      },
    };

    const result = await convertReplicadGeometriesToGltf([cubeShape], 'glb');

    expect(result).toBeDefined();
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle GLTF JSON format output', async () => {
    const simpleShape: GeometryReplicad = {
      format: 'replicad',
      name: 'Test Geometry',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
      edges: {
        lines: [],
        edgeGroups: [],
      },
    };

    const result = await convertReplicadGeometriesToGltf([simpleShape], 'gltf');

    expect(result).toBeDefined();
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should preserve colors from multiple geometries', async () => {
    const redShape: GeometryReplicad = {
      format: 'replicad',
      name: 'Red Geometry',
      color: '#ff0000',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
      edges: { lines: [], edgeGroups: [] },
    };

    const blueShape: GeometryReplicad = {
      format: 'replicad',
      name: 'Blue Geometry',
      color: '#0000ff',
      faces: {
        vertices: [2, 0, 0, 3, 0, 0, 2, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
      edges: { lines: [], edgeGroups: [] },
    };

    const result = await convertReplicadGeometriesToGltf([redShape, blueShape], 'glb');

    expect(result).toBeDefined();
    expect(result.constructor.name).toBe('Uint8Array');
    expect(result.length).toBeGreaterThan(0);

    // The GLTF should contain both geometries combined
    // We can't easily test the internal structure without parsing the GLTF,
    // but we can verify it's larger than a single geometry would be
    const singleShapeResult = await convertReplicadGeometriesToGltf([redShape], 'glb');
    expect(result.length).toBeGreaterThan(singleShapeResult.length);
  });

  it('should preserve edge lines from Shape3D in GLTF conversion', async () => {
    const shapeWithoutLines: GeometryReplicad = {
      format: 'replicad',
      name: 'Geometry without Lines',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
      edges: {
        lines: [], // No lines
        edgeGroups: [],
      },
    };

    const shapeWithLines: GeometryReplicad = {
      format: 'replicad',
      name: 'Geometry with Lines',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
      edges: {
        lines: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0], // Two line segments
        edgeGroups: [
          { start: 0, count: 6, edgeId: 1 }, // First line segment
          { start: 6, count: 6, edgeId: 2 }, // Second line segment
        ],
      },
    };

    // Convert both geometries
    const resultWithoutLines = await convertReplicadGeometriesToGltf([shapeWithoutLines], 'glb');
    const resultWithLines = await convertReplicadGeometriesToGltf([shapeWithLines], 'glb');

    // Verify both conversions succeed
    expect(resultWithoutLines).toBeDefined();
    expect(resultWithoutLines.constructor.name).toBe('Uint8Array');
    expect(resultWithoutLines.length).toBeGreaterThan(0);

    expect(resultWithLines).toBeDefined();
    expect(resultWithLines.constructor.name).toBe('Uint8Array');
    expect(resultWithLines.length).toBeGreaterThan(0);

    // The geometry with lines should produce a larger GLTF file
    // because it includes additional line data
    expect(resultWithLines.length).toBeGreaterThan(resultWithoutLines.length);

    // Also test GLTF format to ensure both formats work
    const gltfResult = await convertReplicadGeometriesToGltf([shapeWithLines], 'gltf');
    expect(gltfResult).toBeDefined();
    expect(gltfResult.constructor.name).toBe('Uint8Array');
    expect(gltfResult.length).toBeGreaterThan(0);
  });
});
