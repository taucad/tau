/**
 * Printer scene dimensions derived from a machine manifest.
 *
 * Everything is in millimetres in the plate frame: the plate's front-left
 * corner at layer zero is the origin, +X runs right, +Y runs toward the back
 * and +Z is up. World Z = 0 is the nozzle plane; a plate that travels on Z
 * descends below it as layers grow, while a bed-slinger or gantry machine
 * keeps the plate still and lifts the head instead.
 *
 * @module
 */

import { toolpathSegmentKinds } from '@taucad/slicer/toolpath';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import type { PrinterManifest } from '#components/printer/printer-manifest.fixture.js';

/** Axis-aligned box: centre and full size, millimetres. */
export type PrinterBox = Readonly<{
  center: readonly [number, number, number];
  size: readonly [number, number, number];
}>;

/** One enclosure face; a door renders with a visible frame and hinge line. */
export type PrinterPanel = Readonly<{
  face: 'front' | 'back' | 'left' | 'right' | 'top';
  box: PrinterBox;
  isDoor: boolean;
}>;

/** Scene dimensions for one machine. */
export type PrinterGeometry = Readonly<{
  /** Model identity selects only matching pre-rendered hardware assets. */
  model: string | undefined;
  buildVolume: readonly [number, number, number];
  /** Whether the plate descends with the print or the head rises above a fixed plate. */
  motion: 'plate-descends' | 'head-rises';
  /** Plate slab in plate space; its top face is z = 0. */
  plate: PrinterBox;
  /**
   * Usable envelope outline in world space: below the nozzle plane when the plate descends through
   * it, above the plate when the head rises.
   */
  envelope: PrinterBox;
  /** Opaque housing under the lowest plate position. */
  base: PrinterBox;
  /** Whole enclosure in world space; its edges draw the frame. */
  enclosure: PrinterBox;
  panels: readonly PrinterPanel[];
  gantry: Readonly<{
    kind: PrinterManifest['geometry']['kinematics'];
    /** Millimetres above the nozzle plane. */
    beamZ: number;
    rails: readonly PrinterBox[];
    beamSize: readonly [number, number, number];
    carriageSize: readonly [number, number, number];
  }>;
  toolhead: Readonly<{
    home: readonly [number, number, number];
    /** Nozzle tip to carriage bottom. */
    nozzleLength: number;
  }>;
  materialUnit:
    | Readonly<{
        box: PrinterBox;
        spoolRadius: number;
        spoolWidth: number;
        spools: ReadonlyArray<readonly [number, number, number]>;
      }>
    | undefined;
  purgeChute: PrinterBox;
  /** Chamber light strip; absent when the manifest declares no light. */
  light: PrinterBox | undefined;
}>;

const plateThickness = 4;
const panelThickness = 2;
const railSize = 12;
const railInset = 30;
const beamZ = 26;
const materialUnitHeight = 110;
const chuteSize = [30, 24, 40] as const;

/** Derive every scene dimension from the manifest geometry. */
export const derivePrinterGeometry = (manifest: PrinterManifest): PrinterGeometry => {
  const { buildVolume, enclosure, kinematics, bedMotion, toolheadHome, materialSystemMount } = manifest.geometry;
  const build = [buildVolume.x, buildVolume.y, buildVolume.z] as const;
  const outer = [enclosure.outer.x, enclosure.outer.y, enclosure.outer.z] as const;
  const motion = bedMotion === 'z' ? 'plate-descends' : 'head-rises';
  const extraHeight = Math.max(0, outer[2] - build[2]);
  // ponytail: split the non-build height 40/60 between gantry headroom and the base housing; a
  // manifest field replaces this guess when a vendor manifest declares it.
  const headroom = extraHeight * 0.4;
  const enclosureTop = motion === 'plate-descends' ? headroom : build[2] + headroom;
  const enclosureFloor = enclosureTop - outer[2];
  const chamberFloor = Math.max(
    enclosureFloor + 1,
    motion === 'plate-descends' ? -build[2] - plateThickness - 8 : -plateThickness - 8,
  );
  const centerX = build[0] / 2;
  const centerY = build[1] / 2;
  const enclosureCenterZ = (enclosureTop + enclosureFloor) / 2;
  const enclosureBox: PrinterBox = {
    center: [centerX, centerY, enclosureCenterZ],
    size: [outer[0], outer[1], enclosureTop - enclosureFloor],
  };
  const chamberHeight = enclosureTop - chamberFloor;
  const chamberCenterZ = (enclosureTop + chamberFloor) / 2;
  const doors = new Set(enclosure.doors);
  const halfX = outer[0] / 2;
  const halfY = outer[1] / 2;
  const panels: PrinterPanel[] = [
    {
      face: 'front',
      box: { center: [centerX, centerY - halfY, chamberCenterZ], size: [outer[0], panelThickness, chamberHeight] },
      isDoor: doors.has('front'),
    },
    {
      face: 'back',
      box: { center: [centerX, centerY + halfY, chamberCenterZ], size: [outer[0], panelThickness, chamberHeight] },
      isDoor: false,
    },
    {
      face: 'left',
      box: { center: [centerX - halfX, centerY, chamberCenterZ], size: [panelThickness, outer[1], chamberHeight] },
      isDoor: doors.has('side'),
    },
    {
      face: 'right',
      box: { center: [centerX + halfX, centerY, chamberCenterZ], size: [panelThickness, outer[1], chamberHeight] },
      isDoor: doors.has('side'),
    },
    {
      face: 'top',
      box: { center: [centerX, centerY, enclosureTop], size: [outer[0], outer[1], panelThickness] },
      isDoor: doors.has('top'),
    },
  ];
  const railLength = build[1] + railInset * 2;
  const rails: PrinterBox[] =
    kinematics === 'delta'
      ? [0, 1, 2].map((index) => {
          const angle = (index / 3) * Math.PI * 2;
          return {
            center: [centerX + Math.cos(angle) * (halfX - railSize), centerY + Math.sin(angle) * (halfY - railSize), 0],
            size: [railSize, railSize, chamberHeight],
          };
        })
      : [
          { center: [-railInset, centerY, beamZ], size: [railSize, railLength, railSize] },
          { center: [build[0] + railInset, centerY, beamZ], size: [railSize, railLength, railSize] },
        ];
  const materialUnit =
    materialSystemMount === 'top' && manifest.materialSystem.slotsPerUnit > 0
      ? ((): NonNullable<PrinterGeometry['materialUnit']> => {
          const size = [outer[0] * 0.9, outer[1] * 0.66, materialUnitHeight] as const;
          const unitCenterY = centerY - outer[1] * 0.08;
          const slotCount = manifest.materialSystem.slotsPerUnit;
          const spoolRadius = Math.min(36, (size[0] / slotCount) * 0.4);
          const spools = Array.from({ length: slotCount }, (_, index): readonly [number, number, number] => [
            centerX - size[0] / 2 + (size[0] / slotCount) * (index + 0.5),
            unitCenterY,
            enclosureTop + materialUnitHeight * 0.45,
          ]);
          return {
            box: { center: [centerX, unitCenterY, enclosureTop + materialUnitHeight / 2], size },
            spoolRadius,
            spoolWidth: Math.min(56, size[1] * 0.35),
            spools,
          };
        })()
      : undefined;
  return {
    model: manifest.identity.model,
    buildVolume: build,
    motion,
    plate: { center: [centerX, centerY, -plateThickness / 2], size: [build[0], build[1], plateThickness] },
    envelope: {
      center: [centerX, centerY, motion === 'plate-descends' ? -build[2] / 2 : build[2] / 2],
      size: build,
    },
    base: {
      center: [centerX, centerY, (chamberFloor + enclosureFloor) / 2],
      size: [outer[0], outer[1], chamberFloor - enclosureFloor],
    },
    enclosure: enclosureBox,
    panels: manifest.geometry.enclosure.enclosed ? panels : [],
    gantry: {
      kind: kinematics,
      beamZ,
      rails,
      beamSize: [build[0] + railInset * 2 + railSize, 10, 16],
      carriageSize: [36, 32, 36],
    },
    toolhead: {
      home: [
        Math.min(toolheadHome.x, build[0]),
        Math.min(toolheadHome.y, build[1]),
        motion === 'plate-descends' ? 0 : Math.min(toolheadHome.z, build[2]),
      ],
      nozzleLength: beamZ - 18,
    },
    materialUnit,
    purgeChute: {
      center: [-railInset - chuteSize[0] / 2 - 2, build[1] - 20, chuteSize[2] / 2 - 30],
      size: chuteSize,
    },
    light: manifest.chamber.light
      ? { center: [centerX, centerY - halfY + 10, enclosureTop - 10], size: [build[0] * 0.8, 6, 3] }
      : undefined,
  };
};

/** Axis-aligned bounds in millimetres, plate frame. */
export type PrinterBounds = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

/** Segment kinds that lay down the part itself; purge lines, skirts, brims and moves are not the part. */
const partKinds: ReadonlySet<number> = new Set(
  (['outer-wall', 'inner-wall', 'infill', 'support'] as const).map((kind) => toolpathSegmentKinds.indexOf(kind)),
);

/**
 * The part's own extent: every wall, infill and support segment, measured on
 * the extrusion centrelines, standing on the plate (Z starts at 0).
 *
 * The toolpath's `bounds` also hold the purge line, the moves from home and the
 * end lift, so they overstate the part; they remain the right input for the
 * fits-the-plate check.
 *
 * @param program - The parsed toolpath.
 * @returns The part's bounds, or `undefined` when the G-code labels no walls, infill or support.
 */
export const partBounds = (
  program: Pick<ToolpathProgram, 'segmentCount' | 'kinds' | 'positions'>,
): PrinterBounds | undefined => {
  const min = [Infinity, Infinity, 0];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    if (!partKinds.has(program.kinds[segment]!)) {
      continue;
    }
    for (let offset = segment * 6; offset < segment * 6 + 6; offset += 1) {
      const axis = offset % 3;
      const value = program.positions[offset]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return Number.isFinite(max[2]!) ? { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] } : undefined;
};

/**
 * The box the camera frames when only the plate is drawn: the finished part,
 * standing on the plate, as the CAD viewer frames a model. It is the same for
 * the whole run, so the camera stays still while the part prints; a G-code that
 * labels no part frames the whole plate.
 *
 * @param geometry - The machine, for the plate's size when there is no part.
 * @param part - The part's bounds from {@link partBounds}.
 * @returns The box in the plate frame, which is world space in this view.
 */
export const framedPartBox = (
  geometry: Pick<PrinterGeometry, 'buildVolume'>,
  part: PrinterBounds | undefined,
): PrinterBounds => {
  if (!part) {
    const [width, depth] = geometry.buildVolume;
    return { min: [0, 0, -plateThickness], max: [width, depth, nozzleContext] };
  }
  return { min: [part.min[0], part.min[1], 0], max: [part.max[0], part.max[1], Math.max(part.max[2], 1)] };
};

/** Plate group Z offset in world space for the print height reached so far. */
export const plateOffsetForHeight = (geometry: Pick<PrinterGeometry, 'motion'>, height: number): number =>
  geometry.motion === 'plate-descends' ? -height : 0;

/** Toolhead Z in world space for the print height reached so far. */
export const toolheadLiftForHeight = (geometry: Pick<PrinterGeometry, 'motion'>, height: number): number =>
  geometry.motion === 'head-rises' ? height : 0;

/** Vertical field of view of the scene camera, degrees: a slightly long lens keeps the machine calm around the print. */
export const printerCameraFov = 30;

/** Where the eye sits and the point it orbits, millimetres in world space. */
export type PrinterCameraPose = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}>;

/** The eye looks from the front right, above the plate: degrees round from the front, and up from level. */
const viewAzimuth = 32;
const viewElevation = 30;
/** Share of the view the framed box fills on its binding axis. */
const framingFill = 0.88;
/** The share a part alone fills: the CAD viewer's framing, a tenth of the view kept clear on each side. */
export const partFramingFill = 0.8;
/** Millimetres kept in frame above the nozzle plane, so the nozzle tip shows over the part. */
const nozzleContext = 12;
/** Millimetres the eye keeps outside the enclosure, so no near wall or door frame sits on the lens. */
const enclosureClearance = 20;

const corners = (box: PrinterBounds): Array<readonly [number, number, number]> =>
  [box.min[0], box.max[0]].flatMap((x) =>
    [box.min[1], box.max[1]].flatMap((y) => [box.min[2], box.max[2]].map((z) => [x, y, z] as const)),
  );

/**
 * The box the camera frames: the whole build plate with the part on it, from the plate at the
 * finished height up to just above the nozzle. The model and the plate are the subject; the
 * enclosure, gantry and material unit stay around them as context.
 *
 * @param geometry - The machine.
 * @param part - The part's bounds in the plate frame, or the whole toolpath's when the G-code labels no part.
 * @returns The box in world space.
 */
export const framedPrintBox = (
  geometry: Pick<PrinterGeometry, 'buildVolume' | 'motion'>,
  part: PrinterBounds,
): PrinterBounds => {
  const [width, depth] = geometry.buildVolume;
  // ponytail: frames the finished part, not the end-of-print plate drop; a slicer that lowers the plate far
  // after the last layer takes the part below the frame for that final move.
  const height = Math.max(0, part.max[2]);
  const [bottom, top] =
    geometry.motion === 'plate-descends'
      ? [-height - plateThickness, nozzleContext]
      : [-plateThickness, height + nozzleContext];
  // The whole plate, whatever the toolpath's home, purge or park moves reach.
  return { min: [0, 0, bottom], max: [width, depth, top] };
};

/**
 * Where the eye sits along one screen axis so the box projects centred on that axis: the furthest any
 * corner reaches each way from the view axis, as a slope from the eye, is the same.
 *
 * @param points - Each corner's offset from the box centre along the screen axis and along the view.
 * @param eyeDepth - The eye's offset from the box centre along the view; negative, behind the box.
 * @returns The eye's offset along the screen axis.
 */
const centredOffset = (points: ReadonlyArray<readonly [number, number]>, eyeDepth: number): number =>
  // Moving the eye toward one side shrinks the reach past it and grows the reach past the other, so the
  // two meet once. Corners i and j reach equally, one each way, at (x_i w_j + x_j w_i) / (w_i + w_j), with
  // w a corner's depth in front of the eye; the sides meet at the largest over i of the smallest over j.
  Math.max(
    ...points.map(([along, depth]) =>
      Math.min(
        ...points.map(([otherAlong, otherDepth]) => {
          const [reach, otherReach] = [depth - eyeDepth, otherDepth - eyeDepth];
          return (along * otherReach + otherAlong * reach) / (reach + otherReach);
        }),
      ),
    ),
  );

/**
 * Place the camera so a box fills the view from the front right for one
 * canvas aspect: the binding axis meets the fill margin exactly, the box is
 * centred on both screen axes under perspective, and the eye stays outside
 * the enclosure.
 *
 * @param geometry - The machine whose enclosure the eye keeps clear of; `undefined` when only the plate is drawn.
 * @param box - The world-space box to frame, from {@link framedPrintBox}.
 * Without a machine the part alone is the subject, and it fills {@link partFramingFill} as the CAD
 * viewer frames a model; with one, the plate and machine fill a little more.
 *
 * @param aspect - Canvas width over height.
 * @returns The camera pose; the target is on the view axis at the box's depth.
 */
export const framePrinterCamera = (
  geometry: Pick<PrinterGeometry, 'enclosure'> | undefined,
  box: PrinterBounds,
  aspect: number,
): PrinterCameraPose => {
  const fill = geometry ? framingFill : partFramingFill;
  const azimuth = (viewAzimuth * Math.PI) / 180;
  const elevation = (viewElevation * Math.PI) / 180;
  const forward = [
    -Math.sin(azimuth) * Math.cos(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
    -Math.sin(elevation),
  ] as const;
  const right = [Math.cos(azimuth), Math.sin(azimuth), 0] as const;
  const up = [-Math.sin(azimuth) * Math.sin(elevation), Math.cos(azimuth) * Math.sin(elevation), Math.cos(elevation)];
  const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const center = [0, 1, 2].map((axis) => (box.min[axis]! + box.max[axis]!) / 2);
  const tanVertical = Math.tan((printerCameraFov * Math.PI) / 360) * fill;
  const tanHorizontal = tanVertical * Math.max(0.05, aspect);
  // Each corner's offset from the centre along the screen's right and up and along the view.
  const local = corners(box).map((corner) => {
    const offset = corner.map((value, axis) => value - center[axis]!);
    return [dot(offset, right), dot(offset, up), dot(offset, forward)] as const;
  });
  // For each frustum side, the furthest a corner reaches past it; opposite sides meet at the tightest eye.
  let pastRight = -Infinity;
  let pastLeft = -Infinity;
  let pastTop = -Infinity;
  let pastBottom = -Infinity;
  for (const [x, y, z] of local) {
    pastRight = Math.max(pastRight, x - z * tanHorizontal);
    pastLeft = Math.max(pastLeft, -x - z * tanHorizontal);
    pastTop = Math.max(pastTop, y - z * tanVertical);
    pastBottom = Math.max(pastBottom, -y - z * tanVertical);
  }
  // The binding axis sets the depth, meeting the fill margin on both sides; the other axis stands further
  // back than it needs, and is centred as the eye sees it, since near corners project wider than far ones.
  const depth = Math.min(-(pastRight + pastLeft) / (2 * tanHorizontal), -(pastTop + pastBottom) / (2 * tanVertical));
  const acrossPoints = local.map(([x, , z]) => [x, z] as const);
  const upPoints = local.map(([, y, z]) => [y, z] as const);
  const place = (eyeDepth: number): number[] => {
    const across = centredOffset(acrossPoints, eyeDepth);
    const lift = centredOffset(upPoints, eyeDepth);
    return [0, 1, 2].map(
      (axis) => center[axis]! + right[axis]! * across + up[axis]! * lift + forward[axis]! * eyeDepth,
    );
  };
  const fitted = place(depth);
  const { center: middle, size } = geometry?.enclosure ?? { center: [0, 0, 0], size: [0, 0, 0] };
  const half = size.map((value) => value / 2 + enclosureClearance);
  const isInside =
    geometry !== undefined && fitted.every((value, axis) => Math.abs(value - middle[axis]!) < half[axis]!);
  // Back straight out along the view axis, then centre again at that distance: the framing only grows smaller.
  const backOut = isInside
    ? Math.min(
        ...forward.map((component, axis) =>
          component === 0
            ? Infinity
            : (half[axis]! + Math.sign(component) * (fitted[axis]! - middle[axis]!)) / Math.abs(component),
        ),
      )
    : 0;
  // ponytail: centring again moves the backed-out eye sideways a few millimetres, which the 20 mm clearance
  // absorbs; iterate back-out and centring if an enclosure ever needs the clearance exact.
  const eye = backOut > 0 ? place(depth - backOut) : fitted;
  const reach = dot(
    center.map((value, axis) => value - eye[axis]!),
    forward,
  );
  return {
    position: [eye[0]!, eye[1]!, eye[2]!],
    target: [eye[0]! + forward[0] * reach, eye[1]! + forward[1] * reach, eye[2]! + forward[2] * reach],
  };
};
