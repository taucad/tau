/**
 * Replicad geometry type.
 *
 * This is a type that is used to represent a geometry in Replicad.
 * It is used to represent a 3D geometry, which is a collection of faces and edges.
 *
 * @see https://replicad.dev/docs/api/classes/Shape3D.html
 */
export type GeometryReplicad = {
  type: '3d';
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
  name: string;
};
