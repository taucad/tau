import type { GlbMaterial, TauCadPhysical } from '@taucad/geometry-core';

/**
 * Tessellated 3D geometry produced by the Replicad kernel, containing indexed triangle meshes and optional BRep edge lines.
 */
export type GeometryReplicad = {
  format: 'replicad';
  /** Identity minted with the native entry and forwarded to display; absent on legacy snapshots. */
  sourceComponentId?: string;
  /** Imported triangle geometry has no native BRep topology or exact export capability. */
  meshOnly?: true;
  faces: {
    triangles: number[];
    vertices: number[];
    normals: number[];
    texCoords?: number[];
    tangents?: number[];
    faceGroups: Array<{
      start: number;
      count: number;
      faceId: number;
    }>;
  };
  edges: {
    lines: number[];
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
  physical?: TauCadPhysical;
  name: string;
};
