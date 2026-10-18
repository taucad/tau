import type { GlbMaterial } from '@taucad/geometry-core';

/**
 * Tessellated 3D geometry produced by the SMLib kernel: an indexed triangle mesh grouped by B-rep
 * face and optional B-rep edge polylines grouped by edge.
 */
export type GeometrySmlib = {
  format: 'smlib';
  faces: {
    triangles: number[];
    vertices: number[];
    normals: number[];
    texCoords?: number[];
    tangents?: number[];
    /** Index ranges (`start`, `count` in indices) of each B-rep face, in `shape.faces()` order. */
    faceGroups: Array<{
      start: number;
      count: number;
      faceId: number;
    }>;
  };
  edges: {
    /** De-indexed line segments, six scalars per segment. */
    lines: number[];
    /** Scalar ranges (`start`, `count`) of each B-rep edge, in `shape.edges()` order. */
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
