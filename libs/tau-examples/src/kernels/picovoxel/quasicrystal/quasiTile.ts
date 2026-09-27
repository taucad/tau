// Port of LEAP71_QuasiCrystals QuasiCrystal/QuasiTile.cs + QuasiTile_01..04.cs
// (Apache-2.0, © 2023 LEAP 71). The abstract tile carries the icosahedral
// faces, the rounded-centre dedup key and the connector-frame attachment; the
// four concrete classes keep their upstream names. Viewer-bound pieces
// (m_clr colors, Preview) are dropped. The C# custom exceptions
// (ThisFaceNotFound/OtherFaceNotFound/ConnectorMismatch) become
// PicoError('PICO_INVALID_ARGUMENT', ...) with the upstream messages.
//
// Rounding note: C# MathF.Round(x, 4) is float banker's rounding; here it is
// double half-away-from-zero. The dedup RESULT is identical for these
// irrational tile coordinates (nothing lands on a .00005 midpoint), and the
// pins are self-referential to this port.

import { PicoError, type Vec3 } from 'picovoxel';
import { type Frame, frame, vec3 } from 'picovoxel/numerics';
import { localFrame, vecOps } from 'picovoxel/shapekernel';
import { IcosehedralFace } from './icosahedralFace.ts';

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4 + 0; // +0 folds -0 into 0

export abstract class QuasiTile {
  protected aFaces: IcosehedralFace[] = [];
  protected roundedCentreCache: Vec3 | null = null;

  /** The icosahedral faces of the tile (C# `aGetFaces`). */
  faces(): IcosehedralFace[] {
    return this.aFaces;
  }

  /** The number of faces that make up the tile (C# `nGetNumberOfFaces`). */
  get faceCount(): number {
    return this.aFaces.length;
  }

  /**
   * Applies the coordinate trafo to each vertex of each face — used to place
   * sub-tiles during inflation (C# `ApplyTrafo`).
   */
  applyTrafo(trafo: (pt: Vec3) => Vec3): void {
    for (const face of this.aFaces) {
      face.pt1 = trafo(face.pt1);
      face.pt2 = trafo(face.pt2);
      face.pt3 = trafo(face.pt3);
      face.pt4 = trafo(face.pt4);
      face.centre = vec3.add(face.pt1, vec3.scale(vec3.sub(face.pt3, face.pt1), 0.5));
      face.longAxis = vec3.normalized(vec3.sub(face.pt3, face.pt1));
      face.shortAxis = vec3.normalized(vec3.sub(face.pt4, face.pt2));
    }
    this.roundedCentreCache = null;
    this.roundedCentre();
  }

  /**
   * Centre of the tile from all unique vertices, rounded to four digits to
   * make comparisons robust (C# `vecGetRoundedCentre`).
   */
  roundedCentre(): Vec3 {
    if (this.roundedCentreCache === null) {
      const unique = new Map<string, Vec3>();
      for (const face of this.aFaces) {
        for (const pt of [face.pt1, face.pt2, face.pt3, face.pt4]) {
          const rounded: Vec3 = [round4(pt[0]), round4(pt[1]), round4(pt[2])];
          unique.set(rounded.join(','), rounded);
        }
      }
      let centre: Vec3 = [0, 0, 0];
      for (const rounded of unique.values()) centre = vec3.add(centre, rounded);
      centre = vec3.scale(centre, 1 / unique.size);
      this.roundedCentreCache = [round4(centre[0]), round4(centre[1]), round4(centre[2])];
    }
    return this.roundedCentreCache;
  }

  /**
   * Connector frame on the centre of the specified face: local Z points out
   * of the tile, local X along the long axis per the connector type
   * (C# `oGetConnectorFrame`).
   */
  connectorFrame(faceIndex: number, index = 0): Frame {
    const face = this.aFaces[faceIndex]!;
    const pos = face.centre;
    let localX = vec3.normalized(vec3.sub(face.pt3, face.pt1));
    const localY = vec3.normalized(vec3.sub(face.pt4, face.pt2));
    let localZ = vec3.cross(localX, localY);
    localZ = vecOps.flipForAlignment(localZ, vec3.sub(pos, this.roundedCentre()));
    if (index !== 0 && face.connector === 'line') {
      localX = vec3.neg(localX);
    }
    return localFrame.createZX(pos, localZ, localX);
  }

  /**
   * Rotates and positions this tile with this face onto the other tile's
   * other face (C# `AttachToOtherQuasiTile`). For LINE connectors the switch
   * toggle changes the reference direction.
   */
  attachToOtherQuasiTile(thisFaceIndex: number, otherTile: QuasiTile, otherFaceIndex: number, switchToggle = false): void {
    if (thisFaceIndex >= this.faceCount) {
      throw new PicoError('PICO_INVALID_ARGUMENT', 'This face index exceeds number of faces on this quasi tile.');
    }
    if (otherFaceIndex >= otherTile.faceCount) {
      throw new PicoError('PICO_INVALID_ARGUMENT', 'Other face index exceeds number of faces on other quasi tile.');
    }
    if (this.aFaces[thisFaceIndex]!.connector !== otherTile.aFaces[otherFaceIndex]!.connector) {
      throw new PicoError('PICO_INVALID_ARGUMENT', 'Connector types do not match.');
    }

    const otherConnectorFrame = otherTile.connectorFrame(otherFaceIndex, switchToggle ? 1 : 0);
    const thisCurrentFaceFrame = localFrame.inverted(this.connectorFrame(thisFaceIndex), true, false);

    // update all coordinates of this quasi tile
    // (C# vecExpressPointInFrame ≙ frame.ptFromWorld; vecTranslatePointOntoFrame ≙ frame.ptToWorld)
    for (const face of this.aFaces) {
      face.pt1 = frame.ptToWorld(otherConnectorFrame, frame.ptFromWorld(thisCurrentFaceFrame, face.pt1));
      face.pt2 = frame.ptToWorld(otherConnectorFrame, frame.ptFromWorld(thisCurrentFaceFrame, face.pt2));
      face.pt3 = frame.ptToWorld(otherConnectorFrame, frame.ptFromWorld(thisCurrentFaceFrame, face.pt3));
      face.pt4 = frame.ptToWorld(otherConnectorFrame, frame.ptFromWorld(thisCurrentFaceFrame, face.pt4));
      face.centre = vec3.add(face.pt1, vec3.scale(vec3.sub(face.pt3, face.pt1), 0.5));
      face.longAxis = vec3.normalized(vec3.sub(face.pt3, face.pt1));
      face.shortAxis = vec3.normalized(vec3.sub(face.pt4, face.pt2));
    }

    this.roundedCentreCache = null;
    this.roundedCentre();
  }
}

/** First type of rhombic 3D quasi-tile (C# `QuasiTile_01`). */
export class QuasiTile_01 extends QuasiTile {
  constructor(frame0c: Frame, faceSide = 20) {
    super();
    const rotAngle = (360 / 3 / 180) * Math.PI;

    const refFace = new IcosehedralFace(frame0c, 'longAxis', 'line', faceSide);
    const longAxis = vec3.length(vec3.sub(refFace.pt3, refFace.pt1));
    const shortAxis = vec3.length(vec3.sub(refFace.pt4, refFace.pt2));
    const domeTriangleSide = shortAxis;
    const domeTriangleHeight = domeTriangleSide / (2 * Math.sqrt(3));
    const tiltAngleRad = Math.asin(domeTriangleHeight / (0.5 * longAxis));
    const tiltAngleDeg = 90 - (tiltAngleRad / Math.PI) * 180;
    const tiltAngle = (-tiltAngleDeg / 180) * Math.PI;

    // lower dome: lower centre faces
    const lowerCentreFaces: IcosehedralFace[] = [];
    for (let i = 0; i < 3; i += 1) {
      let frame1b = localFrame.rotated(frame0c, i * rotAngle, frame0c.lz);
      frame1b = localFrame.rotated(frame1b, tiltAngle, frame1b.ly);
      lowerCentreFaces.push(new IcosehedralFace(frame1b, 'longAxis', 'triangle', faceSide));
    }

    // mirror upper dome
    const lowerZ = frame.ptFromWorld(frame0c, lowerCentreFaces[0]!.pt2)[2];
    const upperZ = frame.ptFromWorld(frame0c, lowerCentreFaces[0]!.pt3)[2];
    const maxZ = lowerZ + upperZ;
    let frame1c = localFrame.translated(frame0c, vec3.scale(frame0c.lz, maxZ));
    frame1c = localFrame.inverted(frame1c, true, true);

    // upper centre faces
    const upperCentreFaces: IcosehedralFace[] = [];
    for (let i = 0; i < 3; i += 1) {
      let frame1t = localFrame.rotated(frame1c, i * rotAngle, frame1c.lz);
      frame1t = localFrame.rotated(frame1t, tiltAngle, frame1t.ly);
      upperCentreFaces.push(new IcosehedralFace(frame1t, 'longAxis', 'line', faceSide));
    }

    // flip lower faces
    for (const face of lowerCentreFaces) {
      face.flipAroundShortAxis();
      face.flipAroundLongAxis();
    }

    this.aFaces = [...lowerCentreFaces, ...upperCentreFaces];
  }
}

/** Second type of rhombic 3D quasi-tile (C# `QuasiTile_02`). */
export class QuasiTile_02 extends QuasiTile {
  constructor(frame0c: Frame, faceSide = 20) {
    super();
    const refFace = new IcosehedralFace(frame0c, 'longAxis', 'line', faceSide);
    const longAxis = vec3.length(vec3.sub(refFace.pt3, refFace.pt1));

    const frame1b = frame0c;
    let frame1t = localFrame.translated(frame0c, vec3.scale(frame0c.lz, longAxis));
    frame1t = localFrame.inverted(frame1t, true, true);

    const face1b = new IcosehedralFace(frame1b, 'centre', 'line', faceSide);
    const face1t = new IcosehedralFace(frame1t, 'centre', 'line', faceSide);

    const sideFaces: IcosehedralFace[] = [];
    const angledFaces: IcosehedralFace[] = [];
    for (const pick of [1, 2] as const) {
      const side1b = pick === 1 ? face1b.pt2 : face1b.pt4;
      const side1t = pick === 1 ? face1t.pt2 : face1t.pt4;
      const long1s = vec3.normalized(vec3.sub(side1t, side1b));
      const short1s = vec3.normalized(vec3.sub(face1b.pt3, face1b.pt1));
      const normal1s = vec3.cross(long1s, short1s);
      const frame1s = localFrame.createZX(side1b, normal1s, long1s);
      const face1s = new IcosehedralFace(frame1s, 'longAxis', 'triangle', faceSide);
      sideFaces.push(face1s);

      {
        const centre2s = vec3.scale(vec3.add(face1b.pt1, face1s.pt2), 0.5);
        const long2s = vec3.normalized(vec3.sub(centre2s, side1b));
        const short2s = vec3.normalized(vec3.sub(centre2s, face1b.pt1));
        const normal2s = vec3.cross(long2s, short2s);
        const frame2s = localFrame.createZX(side1b, normal2s, long2s);
        angledFaces.push(new IcosehedralFace(frame2s, 'longAxis', 'arrow', faceSide));

        const centre3s = vec3.scale(vec3.add(face1b.pt3, face1s.pt4), 0.5);
        const long3s = vec3.normalized(vec3.sub(centre3s, side1b));
        const short3s = vec3.normalized(vec3.sub(centre3s, face1b.pt3));
        const normal3s = vec3.cross(long3s, short3s);
        const frame3s = localFrame.createZX(side1b, normal3s, long3s);
        angledFaces.push(new IcosehedralFace(frame3s, 'longAxis', 'arrow', faceSide));
      }
      {
        const centre2s = vec3.scale(vec3.add(face1t.pt1, face1s.pt4), 0.5);
        const long2s = vec3.normalized(vec3.sub(centre2s, side1t));
        const short2s = vec3.normalized(vec3.sub(centre2s, face1t.pt1));
        const normal2s = vec3.cross(long2s, short2s);
        const frame2s = localFrame.createZX(side1t, normal2s, long2s);
        angledFaces.push(new IcosehedralFace(frame2s, 'longAxis', 'triangle', faceSide));

        const centre3s = vec3.scale(vec3.add(face1t.pt3, face1s.pt2), 0.5);
        const long3s = vec3.normalized(vec3.sub(centre3s, side1t));
        const short3s = vec3.normalized(vec3.sub(centre3s, face1t.pt3));
        const normal3s = vec3.cross(long3s, short3s);
        const frame3s = localFrame.createZX(side1t, normal3s, long3s);
        angledFaces.push(new IcosehedralFace(frame3s, 'longAxis', 'triangle', faceSide));
      }
    }

    // flip lower faces
    for (const face of sideFaces) {
      face.flipAroundShortAxis();
      face.flipAroundLongAxis();
    }

    this.aFaces = [face1b, face1t, ...sideFaces, ...angledFaces];
  }
}

/** Pentagonal-dome geometry shared by QuasiTile_03 and QuasiTile_04. */
function pentagonTilt(refFace: IcosehedralFace): number {
  const longAxis = vec3.length(vec3.sub(refFace.pt3, refFace.pt1));
  const shortAxis = vec3.length(vec3.sub(refFace.pt4, refFace.pt2));
  const domePentagonSide = shortAxis;
  const domePentagonHeight = domePentagonSide / (2 * Math.sqrt(5 - Math.sqrt(20)));
  const tiltAngleRad = Math.asin(domePentagonHeight / (0.5 * longAxis));
  const tiltAngleDeg = 90 - (tiltAngleRad / Math.PI) * 180;
  return (-tiltAngleDeg / 180) * Math.PI;
}

/** Five tilted faces around a centre frame (the C# lower/upper-centre loops). */
function centreFaces(frame0: Frame, tiltAngle: number, connector: 'line' | 'triangle', faceSide: number): IcosehedralFace[] {
  const rotAngle = (360 / 5 / 180) * Math.PI;
  const faces: IcosehedralFace[] = [];
  for (let i = 0; i < 5; i += 1) {
    let frame1 = localFrame.rotated(frame0, i * rotAngle, frame0.lz);
    frame1 = localFrame.rotated(frame1, tiltAngle, frame1.ly);
    faces.push(new IcosehedralFace(frame1, 'longAxis', connector, faceSide));
  }
  return faces;
}

/** Five side faces bridging neighbouring centre-face tips (the C# side loops). */
function sideFaces(centres: IcosehedralFace[], connector: 'line' | 'arrow', faceSide: number): IcosehedralFace[] {
  const faces: IcosehedralFace[] = [];
  for (let i = 0; i < 5; i += 1) {
    const lower = centres[(i + 4) % 5]!;
    const upper = centres[i]!;
    const tip1 = lower.pt3;
    const tip2 = upper.pt3;
    const long1s = vec3.normalized(vec3.sub(tip2, tip1));
    const centre1s = vec3.add(tip1, vec3.scale(vec3.sub(tip2, tip1), 0.5));
    const short1s = vec3.normalized(vec3.sub(lower.pt4, centre1s));
    const normal1s = vec3.cross(long1s, short1s);
    const frame1s = localFrame.createZX(tip1, normal1s, long1s);
    faces.push(new IcosehedralFace(frame1s, 'longAxis', connector, faceSide));
  }
  return faces;
}

/** Third type of rhombic 3D quasi-tile (C# `QuasiTile_03`). */
export class QuasiTile_03 extends QuasiTile {
  constructor(frame0c: Frame, faceSide = 20) {
    super();
    const refFace = new IcosehedralFace(frame0c, 'longAxis', 'line', faceSide);
    const tiltAngle = pentagonTilt(refFace);

    // lower dome
    const lowerCentreFaces = centreFaces(frame0c, tiltAngle, 'triangle', faceSide);
    const lowerSideFaces = sideFaces(lowerCentreFaces, 'arrow', faceSide);

    // mirror upper dome
    const lowerZ = frame.ptFromWorld(frame0c, lowerSideFaces[0]!.pt1)[2];
    const upperZ = frame.ptFromWorld(frame0c, lowerSideFaces[0]!.pt2)[2];
    const maxZ = lowerZ + upperZ;
    let frame1c = localFrame.translated(frame0c, vec3.scale(frame0c.lz, maxZ));
    frame1c = localFrame.inverted(frame1c, true, true);

    const upperCentreFaces = centreFaces(frame1c, tiltAngle, 'line', faceSide);
    const upperSideFaces = sideFaces(upperCentreFaces, 'line', faceSide);

    this.aFaces = [...lowerCentreFaces, ...lowerSideFaces, ...upperSideFaces, ...upperCentreFaces];
  }
}

/** Fourth type of rhombic 3D quasi-tile (C# `QuasiTile_04`). */
export class QuasiTile_04 extends QuasiTile {
  constructor(frame0c: Frame, faceSide = 20) {
    super();
    const refFace = new IcosehedralFace(frame0c, 'longAxis', 'line', faceSide);
    const tileSide = vec3.length(vec3.sub(refFace.pt2, refFace.pt1));
    const tiltAngle = pentagonTilt(refFace);

    // lower dome
    const lowerCentreFaces = centreFaces(frame0c, tiltAngle, 'line', faceSide);
    const lowerSideFaces = sideFaces(lowerCentreFaces, 'line', faceSide);

    // mirror upper dome
    const lowerZ = frame.ptFromWorld(frame0c, lowerSideFaces[0]!.pt1)[2];
    const upperZ = frame.ptFromWorld(frame0c, lowerSideFaces[0]!.pt2)[2];
    const maxZ = lowerZ + upperZ + tileSide;
    let frame1c = localFrame.translated(frame0c, vec3.scale(frame0c.lz, maxZ));
    frame1c = localFrame.inverted(frame1c, true, true);

    const upperCentreFaces = centreFaces(frame1c, tiltAngle, 'line', faceSide);
    const upperSideFaces = sideFaces(upperCentreFaces, 'line', faceSide);

    // middle faces
    const middleFaces: IcosehedralFace[] = [];
    for (let i = 0; i < 5; i += 1) {
      {
        const face1u = upperSideFaces[i]!;
        const face1l = lowerSideFaces[4 - i]!;
        const long1m = vec3.normalized(vec3.sub(face1u.pt1, face1l.pt1));
        const short1m = vec3.normalized(vec3.sub(face1u.pt2, face1l.pt2));
        const normal1m = vec3.cross(short1m, long1m);
        const frame1m = localFrame.createZX(face1l.pt1, normal1m, long1m);
        middleFaces.push(new IcosehedralFace(frame1m, 'longAxis', 'line', faceSide));
      }
      {
        const face1u = upperSideFaces[(i + 1) % 5]!;
        const face1l = lowerSideFaces[4 - i]!;
        const long1m = vec3.normalized(vec3.sub(face1u.pt1, face1l.pt1));

        const face2u = upperSideFaces[i]!;
        const face2l = lowerSideFaces[(4 - i - 1 + 5) % 5]!;
        const short1m = vec3.normalized(vec3.sub(face2u.pt2, face2l.pt2));
        const normal1m = vec3.cross(short1m, long1m);
        const frame1m = localFrame.createZX(face1l.pt1, normal1m, long1m);
        middleFaces.push(new IcosehedralFace(frame1m, 'longAxis', 'line', faceSide));
      }
    }

    this.aFaces = [...lowerCentreFaces, ...lowerSideFaces, ...upperSideFaces, ...upperCentreFaces, ...middleFaces];
  }
}
