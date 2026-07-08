/**
 * Piston group (spec 3.3): piston, wrist pin, circlips, rings, oil pack.
 *
 * Piston local frame: z = bore axis (crown top at z = +compHeight), x = pin
 * axis, +y = outboard (bank a-direction) for a bank-R install. Rings and the
 * pin share the piston frame. All features derive from `params`.
 */
import { draw, drawCircle, makeBaseBox, makeCylinder } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/runtime/kernels/replicad/annotations';
import { axisNear, faceNear, groupNear } from './annotate.js';
import { Placement } from './frame.js';
import { piston as pp, valve } from './params.js';

export type BuiltPart = { shape: Shape3D; interfaces: InterfaceDeclarations };

export const crown = 32.5;
export const skirtR = pp.skirtDia / 2;
const topLandR = pp.topLandDia / 2;
const rootR = pp.grooveRootDia / 2;
const boreR = 22.02 / 2;

// Groove flank z-positions (piston local; crown top at z = crown).
export const grooveZ = {
  topTop: crown - pp.topLandH,
  topBottom: crown - pp.topLandH - 1.52,
  secondTop: crown - pp.topLandH - 1.52 - pp.land2H,
  secondBottom: crown - pp.topLandH - 1.52 - pp.land2H - 1.52,
  oilTop: crown - pp.topLandH - 1.52 - pp.land2H - 1.52 - pp.land3H,
  oilBottom: crown - pp.topLandH - 1.52 - pp.land2H - 1.52 - pp.land3H - 3.05,
} as const;

const skirtBottom = -28;

/** One revolved cutting tool: pin bore + clip grooves + entry chamfers. */
const pinBoreTool = (): Shape3D => {
  const g0 = pp.clipGrooveOuter - pp.clipGrooveW;
  const g1 = pp.clipGrooveOuter;
  const clipR = pp.clipGrooveDia / 2;
  const bo = pp.bossOuter;
  const profile = draw([-bo - 2, 0])
    .lineTo([-bo - 2, boreR + 1])
    .lineTo([-bo, boreR + 1])
    .lineTo([-bo + 1, boreR])
    .lineTo([-g1, boreR])
    .lineTo([-g1, clipR])
    .lineTo([-g0, clipR])
    .lineTo([-g0, boreR])
    .lineTo([g0, boreR])
    .lineTo([g0, clipR])
    .lineTo([g1, clipR])
    .lineTo([g1, boreR])
    .lineTo([bo - 1, boreR])
    .lineTo([bo, boreR + 1])
    .lineTo([bo + 2, boreR + 1])
    .lineTo([bo + 2, 0])
    .close()
    .sketchOnPlane('XZ');
  return profile.revolve([1, 0, 0]);
};

/**
 * Piston (REVOLVE primary form + local cuts). `flip180` rotates the part
 * about its bore axis for the L bank so valve reliefs stay valley-correct.
 */
export const buildPiston = (place: Placement, flip180 = false): BuiltPart => {
  const p = flip180 ? Placement.rotate('z', 180).compose(place) : place;
  const cavityR = 40;
  const underCrown = crown - pp.crownT;
  // Primary revolve: crown, ring belt, skirt, cored underside in one profile.
  const body = draw([0, crown])
    .lineTo([topLandR, crown])
    .lineTo([topLandR, grooveZ.topTop])
    .lineTo([rootR, grooveZ.topTop])
    .lineTo([rootR, grooveZ.topBottom])
    .lineTo([topLandR, grooveZ.topBottom])
    .lineTo([topLandR, grooveZ.secondTop])
    .lineTo([rootR, grooveZ.secondTop])
    .lineTo([rootR, grooveZ.secondBottom])
    .lineTo([topLandR, grooveZ.secondBottom])
    .lineTo([topLandR, grooveZ.oilTop])
    .lineTo([rootR, grooveZ.oilTop])
    .lineTo([rootR, grooveZ.oilBottom])
    .lineTo([skirtR, grooveZ.oilBottom])
    .lineTo([skirtR, skirtBottom])
    .lineTo([cavityR, skirtBottom])
    .lineTo([cavityR, underCrown])
    .lineTo([0, underCrown])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);

  // Pin bosses: cylinders about the pin axis + support webs to the crown.
  const bossR = 17;
  const boss = (side: 1 | -1): Shape3D =>
    makeCylinder(
      bossR,
      pp.bossOuter + 2 - pp.bossInner,
      [side * pp.bossInner, 0, 0],
      [side, 0, 0],
    );
  const web = (side: 1 | -1): Shape3D =>
    makeBaseBox(pp.bossOuter + 2 - pp.bossInner, 16, underCrown - 12).translate(
      [side * (pp.bossInner + (pp.bossOuter + 2 - pp.bossInner) / 2), 0, 12],
    );

  // Slipper-skirt relief flats at the pin-axis sides (= boss outer faces).
  // The cut ceiling lands exactly on the oil-groove bottom flank plane so no
  // thin land is left between them.
  const flatCut = (side: 1 | -1): Shape3D =>
    makeBaseBox(20, 120, grooveZ.oilBottom - skirtBottom + 1).translate([
      side * (pp.bossOuter + 10),
      0,
      skirtBottom - 1,
    ]);
  // Valve reliefs in the crown (flat-bottom pockets at the valve stations).
  const reliefIn = makeCylinder(
    pp.reliefInDia / 2,
    5,
    [0, valve.inSeatA, crown - pp.reliefInDepth],
    [0, 0, 1],
  );
  const reliefEx = makeCylinder(
    pp.reliefExDia / 2,
    5,
    [0, valve.exSeatA, crown - pp.reliefExDepth],
    [0, 0, 1],
  );
  // 8x Ø2.5 oil drains through the groove floor shelf, 20 deg from the bore
  // axis tilted inward (single clean face each, one z pattern bucket).
  const drains: Shape3D[] = [];
  const shelfR = (rootR + skirtR) / 2;
  // Drains sit in the thrust arcs (the shelf is relieved at the pin sides).
  const drainAngles = [50, 75, 105, 130, 230, 255, 285, 310];
  for (let index = 0; index < 8; index++) {
    const theta = (drainAngles[index]! * Math.PI) / 180;
    const radial: [number, number, number] = [
      Math.cos(theta),
      Math.sin(theta),
      0,
    ];
    const tilt = (20 * Math.PI) / 180;
    const dir: [number, number, number] = [
      -radial[0] * Math.sin(tilt),
      -radial[1] * Math.sin(tilt),
      -Math.cos(tilt),
    ];
    const start: [number, number, number] = [
      radial[0] * shelfR - dir[0] * 2,
      radial[1] * shelfR - dir[1] * 2,
      grooveZ.oilBottom - dir[2] * 2,
    ];
    drains.push(makeCylinder(pp.drainHoleDia / 2, 18, start, dir));
  }

  const shape = p.shape(
    body
      .fuse(boss(1))
      .fuse(boss(-1))
      .fuse(web(1))
      .fuse(web(-1))
      .cut(flatCut(1))
      .cut(flatCut(-1))
      .cut(pinBoreTool())
      .cut(reliefIn)
      .cut(reliefEx)
      .cutAll(drains),
  );

  const g0 = pp.clipGrooveOuter - pp.clipGrooveW;
  const g1 = pp.clipGrooveOuter;
  const clipR = pp.clipGrooveDia / 2;
  const interfaces: InterfaceDeclarations = {
    clipGroove: groupNear(
      p,
      [
        [-(g0 + g1) / 2, 0, -clipR],
        [(g0 + g1) / 2, 0, -clipR],
      ],
      'CYLINDRE',
      0.15,
    ),
    clipGrooveFlank: groupNear(
      p,
      [
        [-g1, 0, -(boreR + clipR) / 2],
        [g1, 0, -(boreR + clipR) / 2],
      ],
      'PLANE',
      0.15,
    ),
    oilGroove: faceNear(p, [rootR + 0.7, 0, grooveZ.oilTop], 'PLANE', 0.15),
    pinBore: axisNear(
      p,
      [(pp.bossInner + g0) / 2, 0, -boreR],
      'CYLINDRE',
      0.15,
    ),
    pinBoss: groupNear(
      p,
      [
        [-pp.bossOuter, 14, 0],
        [pp.bossOuter, 14, 0],
      ],
      'PLANE',
      0.15,
    ),
    secondGroove: faceNear(
      p,
      [rootR + 0.7, 0, grooveZ.secondTop],
      'PLANE',
      0.15,
    ),
    skirt: faceNear(p, [0, skirtR, -12], 'CYLINDRE'),
    topGroove: faceNear(p, [rootR + 0.7, 0, grooveZ.topTop], 'PLANE', 0.15),
  };
  return { shape, interfaces };
};

/** Wrist pin: one revolved profile (bore, ends, 1.0x45 chamfers). */
export const buildWristPin = (place: Placement): BuiltPart => {
  const half = pp.pinLen / 2;
  const outerR = 11;
  const innerR = pp.pinBoreDia / 2;
  const ch = 1;
  const shape = place.shape(
    draw([-half, innerR])
      .lineTo([-half, outerR - ch])
      .lineTo([-half + ch, outerR])
      .lineTo([half - ch, outerR])
      .lineTo([half, outerR - ch])
      .lineTo([half, innerR])
      .close()
      .sketchOnPlane('XZ')
      .revolve([1, 0, 0]),
  );
  const interfaces: InterfaceDeclarations = {
    endFace: groupNear(
      place,
      [
        [-half, 0, (innerR + outerR - ch) / 2],
        [half, 0, (innerR + outerR - ch) / 2],
      ],
      'PLANE',
      0.15,
    ),
    outer: axisNear(place, [0, 0, outerR], 'CYLINDRE'),
  };
  return { shape, interfaces };
};

/**
 * Pin circlip: round-wire ring (wire Ø1.2) seated in its groove, butted
 * against the outer flank, with a 6.0 gap opening. `side` -1 = local front.
 */
export const buildCirclip = (place: Placement, side: 1 | -1): BuiltPart => {
  const wireR = 0.6;
  const centerX = side * (pp.clipGrooveOuter - wireR);
  const ringCenterR = pp.clipGrooveDia / 2 - wireR;
  const torus = drawCircle(wireR)
    .translate(centerX, ringCenterR)
    .sketchOnPlane('XZ')
    .revolve([1, 0, 0]);
  const gap = makeBaseBox(4, 6, 4).translate([centerX, 0, -ringCenterR - 2]);
  const shape = place.shape(torus.cut(gap));
  const interfaces: InterfaceDeclarations = {
    // 90-deg point: the revolve seam sits at +z and the gap at -z.
    wire: faceNear(place, [centerX, ringCenterR + wireR, 0], 'TORUS', 0.15),
  };
  return { shape, interfaces };
};

type RingSpec = {
  height: number;
  innerR: number;
  gapWidth: number;
  gapAngleDeg: number;
  bottomZ: number;
};

/** Split ring: revolved rectangular section minus a parallel-face end gap. */
const buildSplitRing = (
  place: Placement,
  spec: RingSpec,
  topFaceInterface: boolean,
  sides: boolean,
): BuiltPart => {
  const outerR = 47; // Installed OD = bore Ø94 (contact with the wall).
  const ring = draw([spec.innerR, spec.bottomZ])
    .lineTo([outerR, spec.bottomZ])
    .lineTo([outerR, spec.bottomZ + spec.height])
    .lineTo([spec.innerR, spec.bottomZ + spec.height])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const theta = (spec.gapAngleDeg * Math.PI) / 180;
  const midR = (spec.innerR + outerR) / 2;
  const gapCut = makeBaseBox(spec.gapWidth, 12, spec.height + 2)
    .rotate(spec.gapAngleDeg + 90, [0, 0, 0], [0, 0, 1])
    .translate([
      Math.cos(theta) * midR,
      Math.sin(theta) * midR,
      spec.bottomZ - 1,
    ]);
  const shape = place.shape(ring.cut(gapCut));
  const midZ = spec.bottomZ + spec.height / 2;
  const gapHalf = spec.gapWidth / 2;
  const gapProbe = (offset: number): [number, number, number] => [
    Math.cos(theta) * midR - Math.sin(theta) * offset,
    Math.sin(theta) * midR + Math.cos(theta) * offset,
    midZ,
  ];
  const away = theta + Math.PI;
  const probeTol = Math.min(0.15, spec.gapWidth / 2.5);
  const interfaces: InterfaceDeclarations = {
    face: faceNear(
      place,
      [Math.cos(away) * outerR, Math.sin(away) * outerR, midZ],
      'CYLINDRE',
      0.15,
    ),
    gapFaceA: faceNear(place, gapProbe(-gapHalf), 'PLANE', probeTol),
    gapFaceB: faceNear(place, gapProbe(gapHalf), 'PLANE', probeTol),
    ...(sides
      ? {
          sides: faceNear(
            place,
            [
              Math.cos(away) * (spec.innerR + 1.5),
              Math.sin(away) * (spec.innerR + 1.5),
              spec.bottomZ + spec.height,
            ],
            'PLANE',
            0.12,
          ),
        }
      : {}),
    ...(topFaceInterface
      ? {
          topFace: faceNear(
            place,
            [
              Math.cos(away) * (spec.innerR + 1.5),
              Math.sin(away) * (spec.innerR + 1.5),
              spec.bottomZ + spec.height,
            ],
            'PLANE',
            0.12,
          ),
        }
      : {}),
  };
  return { shape, interfaces };
};

export const buildTopRing = (place: Placement): BuiltPart =>
  buildSplitRing(
    place,
    {
      height: 1.475,
      innerR: 43.4,
      gapWidth: 0.4,
      gapAngleDeg: 15,
      bottomZ: grooveZ.topBottom,
    },
    false,
    true,
  );

export const buildSecondRing = (place: Placement): BuiltPart =>
  buildSplitRing(
    place,
    {
      height: 1.475,
      innerR: 43.4,
      gapWidth: 0.5,
      gapAngleDeg: 195,
      bottomZ: grooveZ.secondBottom,
    },
    false,
    true,
  );

export const buildOilRail = (
  place: Placement,
  which: 'upper' | 'lower',
): BuiltPart =>
  buildSplitRing(
    place,
    {
      height: 0.5,
      innerR: 44,
      gapWidth: 0.9,
      gapAngleDeg: which === 'upper' ? 105 : 285,
      bottomZ:
        which === 'lower' ? grooveZ.oilBottom : grooveZ.oilBottom + 0.5 + 2.005,
    },
    which === 'upper',
    false,
  );

/** Oil ring expander: annular crimped spacer between the rails (split). */
export const buildOilExpander = (place: Placement): BuiltPart => {
  const bottomZ = grooveZ.oilBottom + 0.5;
  const height = 2.005;
  const innerR = 43.2;
  const outerR = 46.2;
  const gapAngleDeg = 330;
  const gapWidth = 0.9;
  const ring = draw([innerR, bottomZ])
    .lineTo([outerR, bottomZ])
    .lineTo([outerR, bottomZ + height])
    .lineTo([innerR, bottomZ + height])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const theta = (gapAngleDeg * Math.PI) / 180;
  const midR = (innerR + outerR) / 2;
  const gapCut = makeBaseBox(gapWidth, 12, height + 2)
    .rotate(gapAngleDeg + 90, [0, 0, 0], [0, 0, 1])
    .translate([Math.cos(theta) * midR, Math.sin(theta) * midR, bottomZ - 1]);
  const shape = place.shape(ring.cut(gapCut));
  const gapProbe = (offset: number): [number, number, number] => [
    Math.cos(theta) * midR - Math.sin(theta) * offset,
    Math.sin(theta) * midR + Math.cos(theta) * offset,
    bottomZ + height / 2,
  ];
  const interfaces: InterfaceDeclarations = {
    face: faceNear(
      place,
      [
        Math.cos(theta + Math.PI) * outerR,
        Math.sin(theta + Math.PI) * outerR,
        bottomZ + height / 2,
      ],
      'CYLINDRE',
      0.15,
    ),
    gapFaceA: faceNear(place, gapProbe(-gapWidth / 2), 'PLANE', 0.15),
    gapFaceB: faceNear(place, gapProbe(gapWidth / 2), 'PLANE', 0.15),
  };
  return { shape, interfaces };
};
