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
  buildVolume: readonly [number, number, number];
  /** Whether the plate descends with the print or the head rises above a fixed plate. */
  motion: 'plate-descends' | 'head-rises';
  /** Plate slab in plate space; its top face is z = 0. */
  plate: PrinterBox;
  /** Usable envelope outline in plate space. */
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
  /** Camera framing for the whole machine including the material unit. */
  camera: Readonly<{ target: readonly [number, number, number]; radius: number }>;
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
  const machineTop = enclosureTop + (materialUnit ? materialUnitHeight : 0);
  const cameraTargetZ = (machineTop + enclosureFloor) / 2;
  return {
    buildVolume: build,
    motion,
    plate: { center: [centerX, centerY, -plateThickness / 2], size: [build[0], build[1], plateThickness] },
    envelope: { center: [centerX, centerY, build[2] / 2], size: build },
    base: {
      center: [centerX, centerY, (chamberFloor + enclosureFloor) / 2],
      size: [outer[0], outer[1], chamberFloor - enclosureFloor],
    },
    enclosure: enclosureBox,
    panels,
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
    camera: {
      target: [centerX, centerY, cameraTargetZ],
      radius: Math.hypot(outer[0], outer[1], machineTop - enclosureFloor) / 2,
    },
  };
};

/** Plate group Z offset in world space for the print height reached so far. */
export const plateOffsetForHeight = (geometry: Pick<PrinterGeometry, 'motion'>, height: number): number =>
  geometry.motion === 'plate-descends' ? -height : 0;

/** Toolhead Z in world space for the print height reached so far. */
export const toolheadLiftForHeight = (geometry: Pick<PrinterGeometry, 'motion'>, height: number): number =>
  geometry.motion === 'head-rises' ? height : 0;

/** Camera position that frames the whole machine from the front-right, above. */
export const framePrinterCamera = (
  geometry: Pick<PrinterGeometry, 'camera'>,
  fovDegrees: number,
): readonly [number, number, number] => {
  const distance = (geometry.camera.radius / Math.sin((fovDegrees * Math.PI) / 360)) * 1.05;
  const direction = [1, -1.25, 0.72] as const;
  const length = Math.hypot(...direction);
  const [x, y, z] = geometry.camera.target;
  return [
    x + (direction[0] / length) * distance,
    y + (direction[1] / length) * distance,
    z + (direction[2] / length) * distance,
  ];
};
