import { describe, it, expect } from 'vitest';
import { convertReplicadGeometriesToGltf } from '#components/geometry/kernel/replicad/utils/replicad-to-gltf.js';
import type { GeometryReplicad } from '#components/geometry/kernel/replicad/replicad.types.js';

describe('convertReplicadShapesToGltf', () => {
  it('should convert empty geometries array to valid GLTF blob', async () => {
    const result = await convertReplicadGeometriesToGltf([], 'glb');

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('model/gltf-binary');
    expect(result.size).toBeGreaterThan(0);
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

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('model/gltf-binary');
    expect(result.size).toBeGreaterThan(0);
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

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('model/gltf+json');
    expect(result.size).toBeGreaterThan(0);
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

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeGreaterThan(0);

    // The GLTF should contain both geometries combined
    // We can't easily test the internal structure without parsing the GLTF,
    // but we can verify it's larger than a single geometry would be
    const singleShapeResult = await convertReplicadGeometriesToGltf([redShape], 'glb');
    expect(result.size).toBeGreaterThan(singleShapeResult.size);
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
    expect(resultWithoutLines).toBeInstanceOf(Blob);
    expect(resultWithoutLines.type).toBe('model/gltf-binary');
    expect(resultWithoutLines.size).toBeGreaterThan(0);

    expect(resultWithLines).toBeInstanceOf(Blob);
    expect(resultWithLines.type).toBe('model/gltf-binary');
    expect(resultWithLines.size).toBeGreaterThan(0);

    // The geometry with lines should produce a larger GLTF file
    // because it includes additional line data
    expect(resultWithLines.size).toBeGreaterThan(resultWithoutLines.size);

    // Also test GLTF format to ensure both formats work
    const gltfResult = await convertReplicadGeometriesToGltf([shapeWithLines], 'gltf');
    expect(gltfResult).toBeInstanceOf(Blob);
    expect(gltfResult.type).toBe('model/gltf+json');
    expect(gltfResult.size).toBeGreaterThan(0);
  });
});
