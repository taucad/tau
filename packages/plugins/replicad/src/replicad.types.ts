import type { GlbMaterial } from '@taucad/geometry-core';

/** Float32Array from replicad's mesher; Float64Array only for an instancing prototype before its per-instance transform. */
type MeshFloats = Float32Array | Float64Array;

/**
 * Tessellated 3D geometry produced by the Replicad kernel, containing indexed triangle meshes and optional BRep edge lines.
 */
export type GeometryReplicad = {
  format: 'replicad';
  faces: {
    triangles: Uint32Array;
    vertices: MeshFloats;
    normals: MeshFloats;
    texCoords?: number[];
    tangents?: number[];
    faceGroups: Array<{
      start: number;
      count: number;
      faceId: number;
    }>;
  };
  edges: {
    lines: MeshFloats;
    edgeGroups: Array<{
      start: number;
      count: number;
      edgeId: number;
    }>;
  };
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  material?: GlbMaterial;
  name: string;
};
