// Port of LEAP71_QuasiCrystals QuasiCrystal/QuasiCrystal.cs (Apache-2.0,
// © 2023 LEAP 71). Generations of quasi tiles inflated from an initial tile
// set or a single icosahedral face, de-duplicated per generation by rounded
// tile centre. Session-first: voxGetWireframe takes the PicoGK session, as
// every ported shape does. PreviewGeneration is viewer-bound and dropped.
// The C# List.Contains dedup scan becomes a Set keyed on the rounded centre
// (identical result — the -0/0 case is folded by the rounding helper).

import type { Pico, Voxels } from 'picovoxel';
import { PicoError } from 'picovoxel';
import { frame } from 'picovoxel/numerics';
import type { IcosehedralFace } from './icosahedralFace.ts';
import { type QuasiTile, QuasiTile_01, QuasiTile_04 } from './quasiTile.ts';
import { inflatedFace } from './quasiTileInflation.ts';

export class QuasiCrystal {
  protected readonly tileGenerations: QuasiTile[][];

  /**
   * Quasicrystal with `generations` tile generations: generation 0 is the
   * initial tile set (or the inflation of a single initial face — the two
   * C# constructors), each further generation inflates every face of the
   * previous one and de-duplicates.
   */
  constructor(generations: number, initial: QuasiTile[] | IcosehedralFace) {
    if (!Number.isInteger(generations) || generations < 1) {
      // C# would crash indexing a zero-length generation array.
      throw new PicoError('PICO_INVALID_ARGUMENT', `QuasiCrystal needs at least 1 generation, got ${generations}.`);
    }
    this.tileGenerations = [Array.isArray(initial) ? initial : inflatedFace(initial)];

    // grow generations
    for (let i = 1; i < generations; i += 1) {
      const inflatedSubTiles: QuasiTile[] = [];
      for (const tile of this.tileGenerations[i - 1]!) {
        for (const face of tile.faces()) {
          inflatedSubTiles.push(...inflatedFace(face));
        }
      }
      this.tileGenerations.push(deduplicatedSubTiles(inflatedSubTiles));
    }
  }

  /** The quasi tiles of a generation, or throw (C# `aGetTileGeneration`). */
  tileGeneration(generation: number): QuasiTile[] {
    const tiles = this.tileGenerations[generation];
    if (!tiles) throw new Error('Generation not found.');
    return tiles;
  }

  /**
   * Lattice wireframe of a generation at a constant beam radius, voxelized
   * (C# `voxGetWireframe`).
   */
  voxGetWireframe(pk: Pico, generation: number, beamRadius: number): Voxels {
    const tiles = this.tileGeneration(generation);
    const lattice = pk.createLattice();
    for (const tile of tiles) {
      for (const face of tile.faces()) {
        lattice.addBeam({ start: face.pt1, end: face.pt2, radius: beamRadius });
        lattice.addBeam({ start: face.pt2, end: face.pt3, radius: beamRadius });
        lattice.addBeam({ start: face.pt3, end: face.pt4, radius: beamRadius });
        lattice.addBeam({ start: face.pt4, end: face.pt1, radius: beamRadius });
      }
    }
    return lattice.toVoxels();
  }

  /**
   * Hard-coded initial 20-tile set that can serve as a starting condition
   * (C# `aGetFirstGenerationTiles`).
   */
  static firstGenerationTiles(): QuasiTile[] {
    // first row (frames are immutable value objects — sharing frame.world is safe)
    const tiles: QuasiTile[] = Array.from({ length: 20 }, () => new QuasiTile_01(frame.world));
    tiles[1]!.attachToOtherQuasiTile(0, tiles[0]!, 1);
    tiles[2]!.attachToOtherQuasiTile(0, tiles[1]!, 1);
    tiles[3]!.attachToOtherQuasiTile(0, tiles[2]!, 1);
    tiles[4]!.attachToOtherQuasiTile(1, tiles[0]!, 0);

    // second row
    tiles[5]!.attachToOtherQuasiTile(0, tiles[0]!, 2);
    tiles[6]!.attachToOtherQuasiTile(0, tiles[1]!, 2);
    tiles[7]!.attachToOtherQuasiTile(0, tiles[2]!, 2);
    tiles[8]!.attachToOtherQuasiTile(0, tiles[3]!, 2);
    tiles[9]!.attachToOtherQuasiTile(0, tiles[4]!, 2);

    // third row
    tiles[10]!.attachToOtherQuasiTile(0, tiles[5]!, 1);
    tiles[11]!.attachToOtherQuasiTile(0, tiles[6]!, 1);
    tiles[12]!.attachToOtherQuasiTile(0, tiles[7]!, 1);
    tiles[13]!.attachToOtherQuasiTile(0, tiles[8]!, 1);
    tiles[14]!.attachToOtherQuasiTile(0, tiles[9]!, 1);

    // fourth row
    tiles[15]!.attachToOtherQuasiTile(0, tiles[10]!, 2);
    tiles[16]!.attachToOtherQuasiTile(0, tiles[11]!, 2);
    tiles[17]!.attachToOtherQuasiTile(0, tiles[12]!, 2);
    tiles[18]!.attachToOtherQuasiTile(0, tiles[13]!, 2);
    tiles[19]!.attachToOtherQuasiTile(0, tiles[14]!, 2);
    return tiles;
  }

  /** Hard-coded secondary tile set (C# `aGetSecondGenerationTiles`). */
  static secondGenerationTiles(): QuasiTile[] {
    const first = QuasiCrystal.firstGenerationTiles();
    const tiles: QuasiTile[] = Array.from({ length: 12 }, () => new QuasiTile_04(frame.world));

    tiles[0]!.attachToOtherQuasiTile(1, first[0]!, 4);
    tiles[1]!.attachToOtherQuasiTile(1, first[0]!, 5);
    tiles[2]!.attachToOtherQuasiTile(1, first[1]!, 5);
    tiles[3]!.attachToOtherQuasiTile(1, first[2]!, 5);
    tiles[4]!.attachToOtherQuasiTile(1, first[3]!, 5);
    tiles[5]!.attachToOtherQuasiTile(1, first[4]!, 5);
    tiles[6]!.attachToOtherQuasiTile(1, first[15]!, 5);
    tiles[7]!.attachToOtherQuasiTile(1, first[16]!, 5);
    tiles[8]!.attachToOtherQuasiTile(1, first[17]!, 5);
    tiles[9]!.attachToOtherQuasiTile(1, first[18]!, 5);
    tiles[10]!.attachToOtherQuasiTile(1, first[19]!, 5);
    tiles[11]!.attachToOtherQuasiTile(1, first[19]!, 3);
    return tiles;
  }
}

/** Removes duplicated tiles that occur during inflation (C# `aGetDeduplicatedSubTiles`). */
function deduplicatedSubTiles(subTiles: QuasiTile[]): QuasiTile[] {
  const seenCentres = new Set<string>();
  const deduplicated: QuasiTile[] = [];
  for (const subTile of subTiles) {
    const key = subTile.roundedCentre().join(',');
    if (!seenCentres.has(key)) {
      seenCentres.add(key);
      deduplicated.push(subTile);
    }
  }
  return deduplicated;
}
