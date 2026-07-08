/**
 * Connecting rod group (spec 3.4): rod, cap, rod bolts, bearing shells,
 * small-end bushing.
 *
 * Rod local frame: big-end axis = X through the origin, rod runs +z to the
 * small end (z = 152), cap below (z < 0). Parting plane z = 0.
 */
import {
  draw,
  drawRoundedRectangle,
  makeBaseBox,
  makeCylinder,
} from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisNear, faceNear, groupNear } from './annotate.js';
import { Placement } from './frame.js';
import { press, rod as rp, tapHoleDia } from './params.js';
import { buildRodBolt } from './fasteners.js';
import type { BuiltPart } from './piston-group.js';

const bigOdR = 42;
const boreR = rp.bigEndBore / 2;
const halfW = rp.bigEndWidth / 2;
export const rodBoltY = 34.5;
const eyeR = rp.smallEndEye / 2;
const smallOdR = 17;
const capBottom = -36;
/** Rod bolt head seating plane (cap spot-face floor). */
export const rodBoltSeatZ = -25;

/** Tang notch groove: r4 about an X-parallel axis at (y=30, z=0). */
const notchR = 4;
const notchY = 30;
/** Upper (rod) notch centred at x=-6; lower (cap) notch at x=+6. */
export const notchX = { upper: -6, lower: 6 } as const;

const notchTool = (x: number): Shape3D =>
  makeCylinder(notchR, 6, [x - 3, notchY, 0], [1, 0, 0]);

export const buildConnectingRod = (place: Placement): BuiltPart => {
  // Big-end upper half: extruded profile along X (width 21.8).
  const bigProfile = draw([-bigOdR, 0])
    .lineTo([-bigOdR, 18])
    .threePointsArcTo([bigOdR, 18], [0, 46])
    .lineTo([bigOdR, 0])
    .close()
    .sketchOnPlane('YZ')
    .extrude(rp.bigEndWidth)
    .translate([-halfW, 0, 0]) as Shape3D;
  // I-beam between the eyes: profile in XY, filleted corners R3, extruded +z.
  const pocketW = (rp.beamFlangeW - rp.beamWebT) / 2;
  const pocketH = rp.beamDepth - 2 * rp.beamFlangeT;
  const pocketX = rp.beamWebT / 2 + pocketW / 2;
  const beam = drawRoundedRectangle(rp.beamFlangeW, rp.beamDepth, 3)
    .cut(drawRoundedRectangle(pocketW, pocketH, 2.5).translate(pocketX, 0))
    .cut(drawRoundedRectangle(pocketW, pocketH, 2.5).translate(-pocketX, 0))
    .sketchOnPlane('XY', 20)
    .extrude(rp.length - 20 - 14);
  // Small end boss about X at z = 152.
  const small = makeCylinder(
    smallOdR,
    rp.smallEndWidth,
    [-rp.smallEndWidth / 2, 0, rp.length],
    [1, 0, 0],
  );

  const rodTapR = tapHoleDia(rp.boltTapDia) / 2;
  const tapCut = (y: number): Shape3D =>
    makeCylinder(rodTapR, 17, [0, y, -0.5], [0, 0, 1]);

  const shape = place.shape(
    bigProfile
      .fuse(beam)
      .fuse(small)
      .cut(
        makeCylinder(boreR, rp.bigEndWidth + 2, [-halfW - 1, 0, 0], [1, 0, 0]),
      )
      .cut(
        makeCylinder(
          eyeR,
          rp.smallEndWidth + 2,
          [-rp.smallEndWidth / 2 - 1, 0, rp.length],
          [1, 0, 0],
        ),
      )
      .cut(tapCut(rodBoltY))
      .cut(tapCut(-rodBoltY))
      .cut(notchTool(notchX.upper)),
  );

  const interfaces: InterfaceDeclarations = {
    bigEndBore: axisNear(place, [0, 0, boreR], 'CYLINDRE', 0.15),
    boltTap: groupNear(
      place,
      [
        [0, -rodBoltY + rodTapR, 8],
        [0, rodBoltY - rodTapR, 8],
      ],
      'CYLINDRE',
      0.1,
    ),
    partingFaces: faceNear(place, [0, -40, 0], 'PLANE', 0.12),
    sideFaces: faceNear(
      place,
      [-halfW, 0, (boreR + bigOdR) / 2 + 2],
      'PLANE',
      0.12,
    ),
    smallEndEye: axisNear(place, [0, 0, rp.length - eyeR], 'CYLINDRE', 0.15),
    tangNotch: faceNear(
      place,
      [notchX.upper, notchY, notchR],
      'CYLINDRE',
      0.15,
    ),
  };
  return { shape, interfaces };
};

export const buildRodCap = (place: Placement): BuiltPart => {
  const profile = draw([-bigOdR, 0])
    .lineTo([bigOdR, 0])
    .lineTo([bigOdR, capBottom + 6])
    .lineTo([bigOdR - 6, capBottom])
    .lineTo([-bigOdR + 6, capBottom])
    .lineTo([-bigOdR, capBottom + 6])
    .close()
    .sketchOnPlane('YZ')
    .extrude(rp.bigEndWidth)
    .translate([-halfW, 0, 0]) as Shape3D;
  // Pilot bore Ø9.0 (parting side) + Ø9.5 clearance + spot face Ø15.
  const boltHole = (y: number): Shape3D =>
    draw([0, capBottom - 1])
      .lineTo([4.75, capBottom - 1])
      .lineTo([4.75, -10])
      .lineTo([4.5, -10])
      .lineTo([4.5, 1])
      .lineTo([0, 1])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1])
      .translate([0, y, 0]) as Shape3D;

  const shape = place.shape(
    profile
      .cut(
        makeCylinder(boreR, rp.bigEndWidth + 2, [-halfW - 1, 0, 0], [1, 0, 0]),
      )
      .cut(boltHole(rodBoltY))
      .cut(boltHole(-rodBoltY))
      .cut(makeCylinder(8.6, 12.2, [0, rodBoltY, -37.2], [0, 0, 1]))
      .cut(makeCylinder(8.6, 12.2, [0, -rodBoltY, -37.2], [0, 0, 1]))
      .cut(notchTool(notchX.lower)),
  );

  const interfaces: InterfaceDeclarations = {
    boltSeat: groupNear(
      place,
      [
        [6.1, -rodBoltY, rodBoltSeatZ],
        [6.1, rodBoltY, rodBoltSeatZ],
      ],
      'PLANE',
      0.12,
    ),
    halfBore: axisNear(place, [0, 0, -boreR], 'CYLINDRE', 0.15),
    partingFaces: faceNear(place, [0, -40, 0], 'PLANE', 0.12),
    pilotBore: groupNear(
      place,
      [
        [0, -rodBoltY + 4.5, -5],
        [0, rodBoltY - 4.5, -5],
      ],
      'CYLINDRE',
      0.1,
    ),
    tangNotch: faceNear(
      place,
      [notchX.lower, notchY, -notchR],
      'CYLINDRE',
      0.15,
    ),
  };
  return { shape, interfaces };
};

export const rodBoltPart = (place: Placement): BuiltPart =>
  buildRodBolt(place, 8.98, {
    d: 9,
    length: 47,
    threadLength: 19,
    af: 14,
    headHeight: 8,
  });

type ShellSpec = {
  idR: number;
  odR: number;
  width: number;
  /** Upper = the half occupying z >= 0. */
  half: 'upper' | 'lower';
  oilHole?: boolean;
  flanged?: boolean;
  tangX: number;
  /** Tang lug centre height (defaults to the rod notch height). */
  lugY?: number;
};

/**
 * Bearing half shell: 180-deg revolve about X (true planar seam faces at
 * z = 0), with a half-cylindrical tang lug at the +y seam end.
 */
export const buildShell = (place: Placement, spec: ShellSpec): BuiltPart => {
  const half = spec.width / 2;
  const sketch = draw([-half, spec.idR])
    .lineTo([half, spec.idR])
    .lineTo([half, spec.odR])
    .lineTo([-half, spec.odR])
    .close()
    .sketchOnPlane('XZ');
  // Revolve 180 about X sweeps +z over +y to -z; rotate -90 so the seam
  // plane lands on z = 0 with the shell occupying z >= 0 (upper).
  let shell = sketch
    .revolve([1, 0, 0], { angle: 180 })
    .rotate(-90, [0, 0, 0], [1, 0, 0]);
  if (spec.half === 'lower') {
    shell = shell.mirror('XY');
  }
  const zSign = spec.half === 'upper' ? 1 : -1;
  // Flanged thrust variant (#3 mains): half flange washers both ends.
  if (spec.flanged) {
    const flangeSpan = 27.95;
    const flangeT = 2.5;
    for (const x0 of [-flangeSpan / 2, flangeSpan / 2 - flangeT]) {
      const ring = makeCylinder(41, flangeT, [x0, 0, 0], [1, 0, 0])
        .cut(makeCylinder(spec.idR + 1, flangeT + 2, [x0 - 1, 0, 0], [1, 0, 0]))
        .intersect(
          makeBaseBox(flangeT + 8, 100, 50).translate([
            x0 + flangeT / 2,
            0,
            zSign > 0 ? 0 : -50,
          ]),
        );
      shell = shell.fuse(ring);
    }
  }
  // Tang lug: half cylinder r3.8 x 6 about X at the +y seam edge, kept on
  // this shell's own side of the parting plane.
  const lugY = spec.lugY ?? notchY;
  const lug = makeCylinder(
    3.8,
    6,
    [spec.tangX - 3, lugY, 0],
    [1, 0, 0],
  ).intersect(
    makeBaseBox(8, 12, 5).translate([spec.tangX, lugY, zSign > 0 ? 0 : -5]),
  );
  shell = shell.fuse(lug);
  if (spec.oilHole) {
    shell = shell.cut(
      makeCylinder(
        4,
        spec.odR - spec.idR + 2,
        [0, 0, zSign * (spec.idR - 1)],
        [0, 0, zSign],
      ),
    );
  }
  const shape = place.shape(shell);
  const interfaces: InterfaceDeclarations = {
    // Probes at x = 6 stay clear of the oil hole drilled at x = 0.
    bore: axisNear(place, [6, 0, zSign * spec.idR], 'CYLINDRE', 0.15),
    crush: axisNear(place, [6, 0.3, zSign * spec.odR], 'CYLINDRE', 0.15),
    seamFaces: faceNear(place, [0, (spec.idR + spec.odR) / 2, 0], 'PLANE', 0.1),
    tang: faceNear(place, [spec.tangX, lugY, zSign * 3.8], 'CYLINDRE', 0.15),
    ...(spec.oilHole
      ? {
          oilHole: axisNear(
            place,
            [0, 4, zSign * (spec.idR + 0.5)],
            'CYLINDRE',
            0.15,
          ),
        }
      : {}),
    ...(spec.flanged
      ? {
          flangeFaces: faceNear(
            place,
            [-27.95 / 2, 0, zSign * ((spec.odR + 41) / 2)],
            'PLANE',
            0.1,
          ),
        }
      : {}),
  };
  return { shape, interfaces };
};

export const buildRodShell = (
  place: Placement,
  half: 'upper' | 'lower',
): BuiltPart =>
  buildShell(place, {
    idR: 54.043 / 2,
    odR: 57 / 2 + press.shellCrush,
    width: rp.bigEndWidth,
    half,
    tangX: half === 'upper' ? notchX.upper : notchX.lower,
  });

export const buildSmallEndBushing = (place: Placement): BuiltPart => {
  const odR = rp.smallEndEye / 2 + press.smallEndBush;
  const idR = 22.026 / 2;
  const shape = place.shape(
    makeCylinder(
      odR,
      rp.smallEndWidth,
      [-rp.smallEndWidth / 2, 0, 0],
      [1, 0, 0],
    ).cut(
      makeCylinder(
        idR,
        rp.smallEndWidth + 2,
        [-rp.smallEndWidth / 2 - 1, 0, 0],
        [1, 0, 0],
      ),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    bore: axisNear(place, [0, 0, idR], 'CYLINDRE', 0.12),
    press: axisNear(place, [0, 0, -odR], 'CYLINDRE', 0.12),
  };
  return { shape, interfaces };
};

export { Placement };
