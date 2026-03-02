declare module 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js' {
  import type { Shape3D } from 'replicad';

  export function addVoronoi(shape: Shape3D, parameters: Record<string, unknown>): Shape3D;
  export function addGrid(shape: Shape3D, parameters: Record<string, unknown>): Shape3D;
  export function addHoneycomb(shape: Shape3D, parameters: Record<string, unknown>): Shape3D;
}
