// Port of LEAP71_QuasiCrystals Examples/Ex_QuasiCrystalShowCase.cs
// (Apache-2.0, © 2023 LEAP 71), headless. The `generations` parameter is the
// tile-generation INDEX to voxelize (0 = the initial tiles, each step is one
// inflation); upstream warns against going beyond 2. IntroduceQuasiTilesTask
// is preview-only and not ported; CrystalFromFace/CrystalFromTile preview tile
// meshes upstream — here they return the wireframe voxelization of the same
// last generation. The PenrosePattern 2D subsystem is preview-bound (viewer
// line drawings only) — N/A, not ported.

import type { Pico, Voxels } from 'picovoxel';
import { frame } from 'picovoxel/numerics';
import { IcosehedralFace } from './icosahedralFace.ts';
import { QuasiTile_02, QuasiTile_04 } from './quasiTile.ts';
import { QuasiCrystal } from './quasiCrystal.ts';

export interface WireframeResult {
  voxels: Voxels;
  /** Tiles in the voxelized generation (after dedup). */
  tileCount: number;
  /** Lattice beams in the wireframe (4 per face). */
  beamCount: number;
}

/** C# `WireframeFromCrystalTask` — QuasiTile_02 seed, beam radius 1. */
export function wireframeFromCrystalTask(pk: Pico, generations: number): WireframeResult {
  const initialTile = new QuasiTile_02(frame.world, 50);
  const crystal = new QuasiCrystal(generations + 1, [initialTile]);
  const tiles = crystal.tileGeneration(generations);
  const beamCount = tiles.reduce((count, tile) => count + tile.faceCount * 4, 0);
  return { voxels: crystal.voxGetWireframe(pk, generations, 1), tileCount: tiles.length, beamCount };
}

/** C# `CrystalFromFaceTask` — a single LINE icosahedral face, inflated twice. */
export function crystalFromFaceTask(pk: Pico): Voxels {
  const initialFace = new IcosehedralFace(frame.world, 'centre', 'line', 200);
  const generations = 2; // C# nGenerations — "choose 1 or 2, not higher!"
  const crystal = new QuasiCrystal(generations, initialFace);
  return crystal.voxGetWireframe(pk, generations - 1, 1);
}

/** C# `CrystalFromTileTask` — a single QuasiTile_04 seed, inflated once. */
export function crystalFromTileTask(pk: Pico): Voxels {
  const initialTile = new QuasiTile_04(frame.world, 50);
  const generations = 2; // C# nGenerations — "choose 1 or 3 [sic], not higher!"
  const crystal = new QuasiCrystal(generations, [initialTile]);
  return crystal.voxGetWireframe(pk, generations - 1, 1);
}
