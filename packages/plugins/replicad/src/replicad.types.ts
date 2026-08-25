/**
 * Tessellated 3D geometry produced by the Replicad kernel, containing indexed triangle meshes and optional BRep edge lines.
 */
export type GeometryReplicad = {
  format: 'replicad';
  faces: {
    triangles: number[];
    vertices: number[];
    normals: number[];
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
  name: string;
};
