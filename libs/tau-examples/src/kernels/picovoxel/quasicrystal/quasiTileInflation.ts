// Port of LEAP71_QuasiCrystals QuasiCrystal/QuasiTileInflation.cs
// (Apache-2.0, © 2023 LEAP 71). Subdivides / inflates an icosahedral face
// based on its connector type, following the substitution rules for
// icosahedral quasicrystals (researchgate.net/publication/269776178).
// The C# static target/current-frame temps + vecTrafo become a closure here —
// identical math, no module-level mutable state. The dead first assignment of
// m_oCurrentFrame (2-arg LocalFrame, overwritten 5 lines later) is not ported.

import type { Vec3 } from 'picovoxel';
import { frame, vec3 } from 'picovoxel/numerics';
import { localFrame, vecOps } from 'picovoxel/shapekernel';
import type { IcosehedralFace } from './icosahedralFace.ts';
import { type QuasiTile, QuasiTile_01, QuasiTile_03, QuasiTile_04 } from './quasiTile.ts';

/** C# `aGetInflatedFace` — sub-tiles for one face, by connector type. */
export function inflatedFace(face: IcosehedralFace): QuasiTile[] {
  const faceNormal = vec3.cross(face.longAxis, face.shortAxis);
  const oFrame = localFrame.createZX(face.centre, faceNormal, face.longAxis);

  if (face.connector === 'line') {
    return [
      ...inflatedBlackLine(face.pt1, face.pt2, oFrame.lz, (0 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt1, face.pt4, oFrame.lz, (1 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt3, face.pt2, oFrame.lz, (1 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt3, face.pt4, oFrame.lz, (0 * Math.PI) / 5),
    ];
  }
  if (face.connector === 'triangle') {
    return [
      ...inflatedPurpleLine(face.pt3, face.pt4, oFrame.lz, (1 * Math.PI) / 5),
      ...inflatedPurpleLine(face.pt3, face.pt2, oFrame.lz, (2 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt1, face.pt4, oFrame.lz, (1 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt1, face.pt2, oFrame.lz, (0 * Math.PI) / 5),
    ];
  }
  if (face.connector === 'arrow') {
    return [
      ...inflatedPurpleLine(face.pt3, face.pt4, oFrame.lz, (1 * Math.PI) / 5),
      ...inflatedPurpleLine(face.pt1, face.pt4, oFrame.lz, (2 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt3, face.pt2, oFrame.lz, (1 * Math.PI) / 5),
      ...inflatedBlackLine(face.pt1, face.pt2, oFrame.lz, (0 * Math.PI) / 5),
    ];
  }
  throw new Error('Unknown face connector type. Face cannot get inflated.');
}

/** Maps the constructed sub-tile line onto the target edge (C# `vecTrafo`). */
function lineTrafo(
  tiles: QuasiTile[],
  start: Vec3,
  end: Vec3,
  faceNormal: Vec3,
  customAngle: number,
  currentStart: Vec3,
  currentEnd: Vec3,
  ref1: Vec3,
  ref2: Vec3,
): QuasiTile[] {
  // target line arrangement
  const targetLength = vec3.length(vec3.sub(end, start));
  const targetFrame = localFrame.createZX(start, vec3.normalized(vec3.sub(end, start)), faceNormal);

  // current line arrangement
  const currentLength = vec3.length(vec3.sub(currentEnd, currentStart));
  const currentLocalZ = vec3.normalized(vec3.sub(currentEnd, currentStart));
  const cross = vec3.cross(currentLocalZ, vec3.normalized(vec3.sub(ref1, ref2)));
  let currentLocalX = vec3.cross(cross, currentLocalZ);
  currentLocalX = vecOps.rotateAroundAxis(currentLocalX, customAngle + Math.PI / 10, currentLocalZ);
  const currentFrame = localFrame.createZX(currentStart, currentLocalZ, currentLocalX);

  // transform onto target line
  const scale = targetLength / currentLength;
  for (const tile of tiles) {
    tile.applyTrafo((pt) => frame.ptToWorld(targetFrame, vec3.scale(frame.ptFromWorld(currentFrame, pt), scale)));
  }
  return tiles;
}

/** C# `aGetInflatedBlackLine` — 11 sub-tiles along an edge. */
function inflatedBlackLine(start: Vec3, end: Vec3, faceNormal: Vec3, customAngle: number): QuasiTile[] {
  // construct sub-tiles
  const subTile000 = new QuasiTile_01(localFrame.identity);
  const subTile001 = new QuasiTile_01(localFrame.identity);
  const subTile002 = new QuasiTile_01(localFrame.identity);
  const subTile003 = new QuasiTile_01(localFrame.identity);
  const subTile004 = new QuasiTile_01(localFrame.identity);

  subTile001.attachToOtherQuasiTile(0, subTile000, 1);
  subTile002.attachToOtherQuasiTile(0, subTile001, 1);
  subTile003.attachToOtherQuasiTile(0, subTile002, 1);
  subTile004.attachToOtherQuasiTile(1, subTile000, 0);

  const subTileMid = new QuasiTile_03(localFrame.identity);
  subTileMid.attachToOtherQuasiTile(17, subTile001, 4, true);

  const subTile005 = new QuasiTile_01(localFrame.identity);
  const subTile006 = new QuasiTile_01(localFrame.identity);
  const subTile007 = new QuasiTile_01(localFrame.identity);
  const subTile008 = new QuasiTile_01(localFrame.identity);
  const subTile009 = new QuasiTile_01(localFrame.identity);

  subTile005.attachToOtherQuasiTile(2, subTileMid, 0);
  subTile006.attachToOtherQuasiTile(2, subTileMid, 1);
  subTile007.attachToOtherQuasiTile(2, subTileMid, 2);
  subTile008.attachToOtherQuasiTile(2, subTileMid, 3);
  subTile009.attachToOtherQuasiTile(2, subTileMid, 4);

  const tiles = [
    subTile000,
    subTile001,
    subTile002,
    subTile003,
    subTile004,
    subTileMid,
    subTile005,
    subTile006,
    subTile007,
    subTile008,
    subTile009,
  ];

  const midFaces = subTileMid.faces();
  return lineTrafo(
    tiles,
    start,
    end,
    faceNormal,
    customAngle,
    subTile000.faces()[2]!.pt3,
    subTile009.faces()[4]!.pt1,
    midFaces[midFaces.length - 1]!.pt2, // C# aGetFaces()[^1]
    midFaces[midFaces.length - 1]!.pt1,
  );
}

/** C# `aGetInflatedPurpleLine` — 6 sub-tiles along an edge. */
function inflatedPurpleLine(start: Vec3, end: Vec3, faceNormal: Vec3, customAngle: number): QuasiTile[] {
  // construct sub-tiles
  const subTile000 = new QuasiTile_01(localFrame.identity);
  const subTile001 = new QuasiTile_01(localFrame.identity);
  const subTile002 = new QuasiTile_01(localFrame.identity);
  const subTile003 = new QuasiTile_01(localFrame.identity);
  const subTile004 = new QuasiTile_01(localFrame.identity);

  subTile001.attachToOtherQuasiTile(0, subTile000, 1);
  subTile002.attachToOtherQuasiTile(0, subTile001, 1);
  subTile003.attachToOtherQuasiTile(0, subTile002, 1);
  subTile004.attachToOtherQuasiTile(1, subTile000, 0);

  const subTileMid = new QuasiTile_04(localFrame.identity);
  subTileMid.attachToOtherQuasiTile(17, subTile001, 4, true);

  const tiles = [subTile000, subTile001, subTile002, subTile003, subTile004, subTileMid];

  return lineTrafo(
    tiles,
    start,
    end,
    faceNormal,
    customAngle,
    subTile000.faces()[2]!.pt3,
    subTileMid.faces()[4]!.pt1,
    subTileMid.faces()[2]!.pt2,
    subTileMid.faces()[2]!.pt1,
  );
}
