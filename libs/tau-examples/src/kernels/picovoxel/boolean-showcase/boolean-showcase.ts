// Tier-0 smoke example (blueprint R2/D4): PicoGK_Examples BooleanShowCase.cs
// (CC0-1.0) on the explicit-session API. Viewer materials/groups are dropped —
// headless output is the combined mesh as binary STL bytes. Imports the BUILT
// package by name (Node self-reference through the exports map), so running
// this doubles as the packaging gate: `npm run build` first.

import type { Mesh, Pico } from 'picovoxel';

export interface BooleanShowcaseResult {
  mesh: Mesh;
  volume: number;
  triangleCount: number;
  stlBytes: Uint8Array;
}

export function booleanShowcase(pk: Pico): BooleanShowcaseResult {
  const sphere = (x: number) => pk.createVoxels({ shape: 'sphere', center: [x, 0, 0], radius: 20 });

  // --- Boolean Add: two overlapping spheres ---
  const union = sphere(-10).union(sphere(10));

  // --- Boolean Subtract ---
  const subtract = sphere(-10 + 90).subtract(sphere(10 + 90));

  // --- Boolean Intersect ---
  const intersect = sphere(-10 + 180).intersect(sphere(10 + 180));

  // --- Combine and export (C#: new Mesh(voxAll) + SaveToStlFile) ---
  const all = union.union(subtract, intersect);
  const mesh = all.toMesh();
  return {
    mesh,
    volume: all.properties().volume,
    triangleCount: mesh.triangleCount,
    stlBytes: mesh.toStl(),
  };
}
