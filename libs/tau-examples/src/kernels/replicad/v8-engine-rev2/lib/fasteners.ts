/**
 * Fastener family (spec 3.11): revolved bolt blanks with hex heads, studs,
 * nuts, washers, plugs, and the shared tap-hole cutting tool.
 *
 * Convention (params): tapped holes are modeled at 6H internal major
 * diameter (nominal + 0.05); bolt/stud thread bands at nominal - 0.1.
 * Insertion is proven in the tap void; nothing overlaps.
 *
 * Bolt local frame: axis +z, tip at z = -length, head seating plane at z = 0.
 */
import { draw, drawPolysides, makeCylinder } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/replicad/annotations';
import { axisNear, faceNear } from './annotate.js';
import type { Placement } from './frame.js';
import { tapHoleDia, threadBandDia } from './params.js';
import type { BuiltPart } from './piston-group.js';

export type BoltSpec = {
  /** Thread nominal diameter (e.g. 6, 8, 11). */
  d: number;
  /** Grip + thread length below the head seating plane. */
  length: number;
  /** Threaded band length from the tip. */
  threadLength: number;
  /** Hex across-flats. */
  af: number;
  headHeight: number;
  /** Washer-face diameter (annular pad under the head). */
  washerFace?: number;
};

/** Standard hex head across-flats per nominal. */
export const hexAf = (d: number): number =>
  ({ 3: 5.5, 6: 10, 8: 13, 9: 14, 10: 16, 11: 17, 12: 18, 14: 22, 16: 24 })[
    d
  ] ?? d * 1.6;

/**
 * Bolt blank: revolve (thread band, shank, washer face, point chamfer) plus
 * a hex head prism. Interfaces: shank, thread, headFace.
 */
export const buildBolt = (place: Placement, spec: BoltSpec): BuiltPart => {
  const threadR = threadBandDia(spec.d) / 2;
  const shankR = spec.d / 2;
  const wfR = (spec.washerFace ?? spec.af * 1.15) / 2;
  const tipZ = -spec.length;
  const threadTop = tipZ + spec.threadLength;
  const ch = Math.min(0.8, threadR / 2);
  const profile = draw([0, tipZ])
    .lineTo([threadR - ch, tipZ])
    .lineTo([threadR, tipZ + ch])
    .lineTo([threadR, threadTop])
    .lineTo([shankR, threadTop + 0.4])
    .lineTo([shankR, -0.5])
    .lineTo([wfR, -0.5])
    .lineTo([wfR, 0])
    .lineTo([0, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const head = drawPolysides(spec.af / Math.sqrt(3), 6)
    .sketchOnPlane('XY')
    .extrude(spec.headHeight);
  const shape = place.shape(profile.fuse(head));
  const interfaces: InterfaceDeclarations = {
    headFace: faceNear(place, [(shankR + wfR) / 2, 0, -0.5], 'PLANE', 0.12),
    shank: axisNear(
      place,
      [0, shankR, (threadTop + 0.4 - 0.5) / 2],
      'CYLINDRE',
      0.1,
    ),
    thread: axisNear(
      place,
      [0, threadR, (tipZ + threadTop) / 2],
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};

/** Rod bolt: reduced shank + fitted pilot band under the head (F21). */
export const buildRodBolt = (
  place: Placement,
  pilotDia: number,
  spec: BoltSpec,
): BuiltPart => {
  const threadR = threadBandDia(spec.d) / 2;
  const pilotR = pilotDia / 2;
  const neckR = threadR - 0.25;
  const wfR = (spec.washerFace ?? spec.af * 1.15) / 2;
  const tipZ = -spec.length;
  const threadTop = tipZ + spec.threadLength;
  const pilotTop = -0.5;
  const pilotBottom = -9.5;
  const ch = 0.6;
  const profile = draw([0, tipZ])
    .lineTo([threadR - ch, tipZ])
    .lineTo([threadR, tipZ + ch])
    .lineTo([threadR, threadTop])
    .lineTo([neckR, threadTop + 0.3])
    .lineTo([neckR, pilotBottom - 0.3])
    .lineTo([pilotR, pilotBottom])
    .lineTo([pilotR, pilotTop])
    .lineTo([wfR, pilotTop])
    .lineTo([wfR, 0])
    .lineTo([0, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const head = drawPolysides(spec.af / Math.sqrt(3), 6)
    .sketchOnPlane('XY')
    .extrude(spec.headHeight);
  const shape = place.shape(profile.fuse(head));
  const interfaces: InterfaceDeclarations = {
    headFace: faceNear(place, [(pilotR + wfR) / 2, 0, pilotTop], 'PLANE', 0.12),
    pilotBand: axisNear(
      place,
      [0, pilotR, (pilotTop + pilotBottom) / 2],
      'CYLINDRE',
      0.1,
    ),
    shank: axisNear(
      place,
      [0, neckR, (threadTop + pilotBottom) / 2],
      'CYLINDRE',
      0.1,
    ),
    thread: axisNear(
      place,
      [0, threadR, (tipZ + threadTop) / 2],
      'CYLINDRE',
      0.1,
    ),
  };
  return { shape, interfaces };
};

/** Stud: lower thread band (into the tap), plain middle, upper thread band. */
export const buildStud = (
  place: Placement,
  options: {
    d: number;
    length: number;
    lowerThread: number;
    upperThread: number;
  },
): BuiltPart => {
  const r = threadBandDia(options.d) / 2;
  const midR = options.d / 2 - 0.02;
  const ch = 0.6;
  const profile = draw([0, 0])
    .lineTo([r - ch, 0])
    .lineTo([r, ch])
    .lineTo([r, options.lowerThread])
    .lineTo([midR, options.lowerThread + 0.3])
    .lineTo([midR, options.length - options.upperThread - 0.3])
    .lineTo([r, options.length - options.upperThread])
    .lineTo([r, options.length - ch])
    .lineTo([r - ch, options.length])
    .lineTo([0, options.length])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(profile);
  const interfaces: InterfaceDeclarations = {
    headThread: axisNear(
      place,
      [0, r, options.lowerThread / 2],
      'CYLINDRE',
      0.1,
    ),
    shank: axisNear(place, [0, midR, options.length / 2], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Hex nut with a washer-style clamp face at z = 0 (clamps downward). */
export const buildNut = (
  place: Placement,
  options: { d: number; height?: number; af?: number },
): BuiltPart => {
  const af = options.af ?? hexAf(options.d);
  const height = options.height ?? options.d * 0.8;
  const boreR = tapHoleDia(options.d) / 2;
  const hex = drawPolysides(af / Math.sqrt(3), 6)
    .sketchOnPlane('XY')
    .extrude(height);
  const shape = place.shape(
    hex.cut(makeCylinder(boreR, height + 2, [0, 0, -1], [0, 0, 1])),
  );
  const interfaces: InterfaceDeclarations = {
    clampFace: faceNear(place, [(boreR + af / 2) / 2, 0, 0], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Plain washer, clamp face at z = 0 (underside). */
export const buildWasher = (
  place: Placement,
  options: { id: number; od: number; t: number },
): BuiltPart => {
  const shape = place.shape(
    makeCylinder(options.od / 2, options.t, [0, 0, 0], [0, 0, 1]).cut(
      makeCylinder(options.id / 2, options.t + 2, [0, 0, -1], [0, 0, 1]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    clampFace: faceNear(
      place,
      [(options.id + options.od) / 4, 0, 0],
      'PLANE',
      0.12,
    ),
  };
  return { shape, interfaces };
};

/**
 * Screw-in plug (gallery/drain/relief): thread band + hex flange head.
 * Interfaces: thread (+ body alias when a sensor-style part needs it).
 */
export const buildPlug = (
  place: Placement,
  options: { d: number; length: number; headAf?: number; tip?: boolean },
): BuiltPart => {
  const r = threadBandDia(options.d) / 2;
  const af = options.headAf ?? hexAf(options.d);
  const body = draw([0, -options.length])
    .lineTo([r - 0.5, -options.length])
    .lineTo([r, -options.length + 0.5])
    .lineTo([r, 0])
    .lineTo([0, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const head = drawPolysides(af / Math.sqrt(3), 6)
    .sketchOnPlane('XY')
    .extrude(options.d * 0.45);
  const shape = place.shape(body.fuse(head));
  const interfaces: InterfaceDeclarations = {
    thread: axisNear(place, [0, r, -options.length / 2], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/**
 * Tap-hole cutting tool: drill body at 6H major diameter with a 118deg
 * point and a 0.8x45 entry chamfer cone. Cut at each tapped position.
 * Local frame: axis +z, entry plane at z = 0, drilled downward.
 */
export const tapTool = (nominal: number, depth: number): Shape3D => {
  const r = tapHoleDia(nominal) / 2;
  const point = r / Math.tan((59 * Math.PI) / 180);
  return draw([0, -depth - point])
    .lineTo([r, -depth])
    .lineTo([r, -0.001])
    .lineTo([r + 0.8, 0.799])
    .lineTo([r + 0.8, 2])
    .lineTo([0, 2])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
};

/** Clearance + spot-face tool: through hole with a flat counterbore pad. */
export const clearanceSpotTool = (
  holeDia: number,
  throughLength: number,
  spotDia: number,
  spotDepth = 1,
): Shape3D => {
  const r = holeDia / 2;
  return draw([0, -throughLength])
    .lineTo([r, -throughLength])
    .lineTo([r, -spotDepth])
    .lineTo([spotDia / 2, -spotDepth])
    .lineTo([spotDia / 2, 2])
    .lineTo([0, 2])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
};
