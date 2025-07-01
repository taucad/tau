declare module '@amandaghassaei/stl-parser' {
  export interface STLMesh {
    vertices: Float32Array;
    facesNormals?: Float32Array;
    facesIndices?: Uint32Array;
    mergeVertices?: () => void;
  }

  export function parseSTL(buf: ArrayBuffer | Uint8Array | string): STLMesh;
  export function loadSTL(path: string, cb: (m: STLMesh) => void): void;
  export function loadSTLAsync(path: string): Promise<STLMesh>;
}