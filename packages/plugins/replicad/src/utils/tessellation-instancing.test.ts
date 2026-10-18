// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { transformReplicadGeometryInstance } from '#utils/tessellation-instancing.js';
import type { GeometryReplicad } from '#replicad.types.js';

const prototypeGeometry: GeometryReplicad = {
  format: 'replicad',
  name: 'Prototype',
  faces: {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    triangles: new Uint32Array([0, 1, 2]),
    faceGroups: [{ start: 0, count: 3, faceId: 10 }],
  },
  edges: {
    lines: new Float32Array([0, 0, 0, 1, 0, 0]),
    edgeGroups: [{ start: 0, count: 2, edgeId: 20 }],
  },
  color: '#ff0000',
  opacity: 0.5,
  metalness: 0.2,
  roughness: 0.8,
};

describe('transformReplicadGeometryInstance', () => {
  it('should translate vertices and edge lines while preserving prototype arrays', () => {
    const result = transformReplicadGeometryInstance({
      prototype: prototypeGeometry,
      instance: {
        name: 'Translated',
        locationMatrix: [1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30, 0, 0, 0, 1],
        determinant: 1,
        faceIds: [100],
        edgeIds: [200],
      },
    });

    expect(result.name).toBe('Translated');
    expect(result.faces.vertices).toEqual(new Float32Array([10, 20, 30, 11, 20, 30, 10, 21, 30]));
    expect(result.edges.lines).toEqual(new Float32Array([10, 20, 30, 11, 20, 30]));
    expect(result.faces.faceGroups).toEqual([{ start: 0, count: 3, faceId: 100 }]);
    expect(result.edges.edgeGroups).toEqual([{ start: 0, count: 2, edgeId: 200 }]);
    expect(prototypeGeometry.faces.vertices).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  });

  it('should rotate normals using the inverse transpose normal matrix', () => {
    const result = transformReplicadGeometryInstance({
      prototype: {
        ...prototypeGeometry,
        faces: {
          ...prototypeGeometry.faces,
          normals: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
        },
      },
      instance: {
        name: 'Rotated',
        locationMatrix: [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        determinant: 1,
      },
    });

    expect(result.faces.normals).toEqual(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]));
  });

  it('should flip triangle winding for negative determinant transforms', () => {
    const result = transformReplicadGeometryInstance({
      prototype: prototypeGeometry,
      instance: {
        name: 'Mirrored',
        locationMatrix: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        determinant: -1,
      },
    });

    expect(result.faces.triangles).toEqual(new Uint32Array([0, 2, 1]));
  });

  it('should reject occurrence face IDs whose cardinality differs from the prototype groups', () => {
    expect(() =>
      transformReplicadGeometryInstance({
        prototype: prototypeGeometry,
        instance: {
          name: 'Mismatched faces',
          locationMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          determinant: 1,
          faceIds: [100, 101],
        },
      }),
    ).toThrow('Replicad tessellation instancing face ID count mismatch: expected 1, received 2');
  });

  it('should reject occurrence edge IDs whose cardinality differs from the prototype groups', () => {
    expect(() =>
      transformReplicadGeometryInstance({
        prototype: prototypeGeometry,
        instance: {
          name: 'Mismatched edges',
          locationMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          determinant: 1,
          edgeIds: [],
        },
      }),
    ).toThrow('Replicad tessellation instancing edge ID count mismatch: expected 1, received 0');
  });
});
