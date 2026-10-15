import { describe, expect, it } from 'vitest';
import { parseGcode } from '@taucad/slicer/toolpath';
import {
  derivePrinterGeometry,
  framedPartBox,
  framedPrintBox,
  framePrinterCamera,
  partBounds,
  partFramingFill,
  plateOffsetForHeight,
  plateOffsetForY,
  printerCameraFov,
  toolheadLiftForHeight,
} from '#components/printer/printer-geometry.js';
import type { PrinterBounds, PrinterCameraPose, PrinterGeometry } from '#components/printer/printer-geometry.js';
import { fixtureProgram } from '#components/printer/testing/toolpath-fixture.js';
import {
  printerManifestOf,
  resolvePrinterManifest,
  x1cReferenceGeometry,
} from '#components/printer/printer-manifest.fixture.js';
import type { PrinterManifest } from '#components/printer/printer-manifest.fixture.js';
import { a1MiniManifest, routerManifest, x1cManifest } from '#components/print/testing/machines.fixture.js';

const a1MiniScene = resolvePrinterManifest(a1MiniManifest);

const bedSlinger: PrinterManifest = {
  identity: { displayName: 'Open bed slinger' },
  geometry: {
    unit: 'mm',
    buildVolume: { x: 220, y: 220, z: 250 },
    enclosure: { outer: { x: 440, y: 440, z: 470 }, enclosed: false, doors: [] },
    kinematics: 'cartesian-bedslinger',
    bedMotion: 'y',
    origin: 'front-left',
    toolheadHome: { x: 1, y: 1, z: 1 },
    materialSystemMount: 'none',
  },
  chamber: { enclosed: false, light: false, fans: [] },
  materialSystem: { units: 0, slotsPerUnit: 0, externalSpool: true },
};

const delta: PrinterManifest = {
  ...bedSlinger,
  identity: { displayName: 'Delta' },
  geometry: { ...bedSlinger.geometry, kinematics: 'delta', bedMotion: 'none' },
};

describe('derivePrinterGeometry', () => {
  const x1c = derivePrinterGeometry(x1cReferenceGeometry);

  it('should size the X1C enclosure, plate and envelope from the manifest', () => {
    expect(x1c.buildVolume).toEqual([256, 256, 256]);
    expect(x1c.motion).toBe('plate-descends');
    expect(x1c.enclosure.size).toEqual([389, 389, 457]);
    expect(x1c.enclosure.center[0]).toBe(128);
    expect(x1c.enclosure.center[1]).toBe(128);
    expect(x1c.plate).toEqual({ center: [128, 128, -0.325], size: [256, 256, 0.65] });
    // The plate descends through the envelope, so it sits below the nozzle plane in world space.
    expect(x1c.envelope).toEqual({ center: [128, 128, -128], size: [256, 256, 256] });
  });

  it('should use Mini dimensions and moving-bed geometry without X1C-specific model assets', () => {
    const mini = derivePrinterGeometry(a1MiniScene);
    expect(mini.model).toBe('a1-mini');
    expect(mini.buildVolume).toEqual([180, 180, 180]);
    expect(mini.motion).toBe('head-rises');
    expect(mini.plate.size).toEqual([180, 180, 0.55]);
    expect(mini.light).toBeUndefined();
    expect(mini.panels).toHaveLength(0);
    expect(mini.gantry.rails).toEqual([{ center: [210, 90, 103], size: [12, 12, 206] }]);
  });

  it('should keep the nozzle plane at z = 0 with headroom above and the base below', () => {
    const top = x1c.enclosure.center[2] + x1c.enclosure.size[2] / 2;
    const floor = x1c.enclosure.center[2] - x1c.enclosure.size[2] / 2;
    expect(top).toBeCloseTo(80.4, 6);
    expect(floor).toBeCloseTo(-376.6, 6);
    expect(x1c.base.center[2] + x1c.base.size[2] / 2).toBeCloseTo(-268, 6);
    expect(x1c.light?.center[2]).toBeCloseTo(70.4, 6);
  });

  it('should mark the front and top panels as doors', () => {
    expect(x1c.panels.map(({ face, isDoor }) => `${face}:${String(isDoor)}`)).toEqual([
      'front:true',
      'back:false',
      'left:false',
      'right:false',
      'top:true',
    ]);
    expect(x1c.panels[0]!.box.center[1]).toBeCloseTo(128 - 194.5, 6);
  });

  it('should place two CoreXY rails outside the plate and a four-spool unit on top', () => {
    expect(x1c.gantry.kind).toBe('corexy');
    expect(x1c.gantry.rails.map((rail) => rail.center[0])).toEqual([-30, 286]);
    expect(x1c.gantry.rails[0]!.size).toEqual([12, 316, 12]);
    expect(x1c.gantry.beamSize[0]).toBe(328);
    expect(x1c.materialUnit?.spools).toHaveLength(4);
    expect(x1c.materialUnit?.box.center[2]).toBeCloseTo(135.4, 6);
    // Four spools spread across a 350.1 mm unit centred on the plate: pitch 87.525 mm.
    expect(x1c.materialUnit?.spools.map(([x]) => x)).toEqual([
      expect.closeTo(-3.2875, 3),
      expect.closeTo(84.2375, 3),
      expect.closeTo(171.7625, 3),
      expect.closeTo(259.2875, 3),
    ]);
    expect(x1c.toolhead.home).toEqual([128, 256, 0]);
  });

  it('should lower the plate on X1C and raise the head on a bed slinger', () => {
    expect(plateOffsetForHeight(x1c, 12.4)).toBe(-12.4);
    expect(toolheadLiftForHeight(x1c, 12.4)).toBe(0);
    const slinger = derivePrinterGeometry(bedSlinger);
    expect(slinger.motion).toBe('head-rises');
    expect(plateOffsetForHeight(slinger, 12.4)).toBe(0);
    expect(toolheadLiftForHeight(slinger, 12.4)).toBe(12.4);
    expect(slinger.materialUnit).toBeUndefined();
    expect(slinger.light).toBeUndefined();
    expect(slinger.panels.every(({ isDoor }) => !isDoor)).toBe(true);
    expect(slinger.toolhead.home).toEqual([1, 1, 1]);
    expect(slinger.envelope.center[2]).toBe(125);
  });

  it('should move Mini’s bed oppositely to toolpath Y while the head stays centred', () => {
    const mini = derivePrinterGeometry(a1MiniScene);
    for (const y of [0, 90, 180]) {
      expect(plateOffsetForY(mini, y)).toBe(90 - y);
      expect(y + plateOffsetForY(mini, y)).toBe(90);
      expect(plateOffsetForY(x1c, y)).toBe(0);
    }
  });

  it('should give a delta three posts and no beam', () => {
    const geometry = derivePrinterGeometry(delta);
    expect(geometry.gantry.kind).toBe('delta');
    expect(geometry.gantry.rails).toHaveLength(3);
    expect(geometry.gantry.rails.every((rail) => rail.size[2] > 250)).toBe(true);
  });

  it('should resolve the X1C reference until a manifest arrives', () => {
    expect(resolvePrinterManifest(undefined)).toBe(x1cReferenceGeometry);
    expect(resolvePrinterManifest(x1cManifest).identity).toEqual({ displayName: 'X1 Carbon', model: 'x1c' });
  });

  it('should read the scene facts from the FFF process and the light, fan and material-system components', () => {
    expect(printerManifestOf(x1cManifest)).toMatchObject({
      geometry: x1cReferenceGeometry.geometry,
      chamber: {
        enclosed: true,
        light: true,
        fans: [
          { id: 'part-fan', label: 'Part fan' },
          { id: 'aux-fan', label: 'Auxiliary fan' },
          { id: 'chamber-fan', label: 'Chamber fan' },
        ],
      },
      materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true },
    });
    expect(printerManifestOf(a1MiniManifest)?.chamber).toEqual({
      enclosed: false,
      light: false,
      fans: [{ id: 'part-fan', label: 'Part fan' }],
    });
  });

  it('should draw a milling machine as its open work area, with no material unit or light', () => {
    const router = derivePrinterGeometry(resolvePrinterManifest(routerManifest));
    expect(router.model).toBe('longmill-mk2-30');
    expect(router.buildVolume).toEqual([810, 855, 120]);
    expect(router.panels).toHaveLength(0);
    expect(router.materialUnit).toBeUndefined();
    expect(router.light).toBeUndefined();
  });
});

/** Where each corner of a box lands on screen for a pose, in normalised device coordinates. */
const project = (pose: PrinterCameraPose, box: PrinterBounds, aspect: number): Array<readonly [number, number]> => {
  const forward = pose.target.map((value, axis) => value - pose.position[axis]!);
  const length = Math.hypot(...forward);
  const [fx, fy, fz] = forward.map((value) => value / length) as [number, number, number];
  const across = Math.hypot(fy, fx);
  const right = [fy / across, -fx / across, 0];
  const up = [right[1]! * fz, -right[0]! * fz, right[0]! * fy - right[1]! * fx];
  const tanVertical = Math.tan((printerCameraFov * Math.PI) / 360);
  const corners = [box.min[0], box.max[0]].flatMap((x) =>
    [box.min[1], box.max[1]].flatMap((y) => [box.min[2], box.max[2]].map((z) => [x, y, z])),
  );
  return corners.map((corner) => {
    const offset = corner.map((value, axis) => value - pose.position[axis]!);
    const depth = offset[0]! * fx + offset[1]! * fy + offset[2]! * fz;
    const x = offset[0]! * right[0]! + offset[1]! * right[1]!;
    const y = offset[0]! * up[0]! + offset[1]! * up[1]! + offset[2]! * up[2]!;
    return [x / (depth * tanVertical * aspect), y / (depth * tanVertical)] as const;
  });
};

/** How far the projected corners sit off the viewport's centre on one axis, as a share of the viewport. */
const offCentre = (corners: ReadonlyArray<readonly [number, number]>, axis: 0 | 1): number => {
  const values = corners.map((corner) => corner[axis]);
  // Normalised device coordinates span two units across the viewport.
  return Math.abs(Math.max(...values) + Math.min(...values)) / 4;
};

const isOutside = (geometry: PrinterGeometry, point: readonly number[]): boolean =>
  point.some(
    (value, axis) => Math.abs(value - geometry.enclosure.center[axis]!) > geometry.enclosure.size[axis]! / 2 + 19.999,
  );

describe('framing the print', () => {
  const x1c = derivePrinterGeometry(x1cReferenceGeometry);
  const part: PrinterBounds = { min: [108, 108, 0], max: [158, 158, 24] };

  it('should frame the whole plate with the part on it, from the finished plate to just above the nozzle', () => {
    const box = framedPrintBox(x1c, part);
    expect([box.min[0], box.min[1], box.max[0], box.max[1]]).toEqual([0, 0, 256, 256]);
    // X1C: the plate descends 24 mm below the nozzle plane, 4 mm thick; 12 mm above the nozzle stays in frame.
    expect(box.min[2]).toBe(-28);
    expect(box.max[2]).toBe(12);
    const slinger = framedPrintBox(derivePrinterGeometry(bedSlinger), { min: [90, 90, 0], max: [130, 130, 30] });
    expect([slinger.min[2], slinger.max[2]]).toEqual([-4, 42]);
    // A toolpath that wanders off the plate never widens the framing past it.
    const wide = framedPrintBox(x1c, { min: [-40, 0, 0], max: [300, 265, 10] });
    expect([wide.min[0], wide.max[0], wide.max[1]]).toEqual([0, 256, 256]);
  });

  it('should keep the whole box in view from the front right at every pane shape, outside the enclosure', () => {
    const box = framedPrintBox(x1c, part);
    for (const aspect of [0.59, 0.8, 1, 1.78, 2.4]) {
      const pose = framePrinterCamera(x1c, box, aspect);
      expect(pose.position[0]).toBeGreaterThan(pose.target[0]);
      expect(pose.position[1]).toBeLessThan(pose.target[1]);
      expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
      expect(isOutside(x1c, pose.position)).toBe(true);
      const corners = project(pose, box, aspect);
      expect(Math.max(...corners.flat().map((value) => Math.abs(value)))).toBeLessThanOrEqual(0.88 + 1e-9);
      // Centred on both axes: the left and right extremes balance, and so do the top and bottom.
      expect(offCentre(corners, 0), `across at ${aspect}`).toBeLessThan(0.005);
      expect(offCentre(corners, 1), `down at ${aspect}`).toBeLessThan(0.005);
    }
  });

  it('should fill a narrow pane edge to edge and step back rather than enter the enclosure', () => {
    const box = framedPrintBox(x1c, part);
    const narrow = project(framePrinterCamera(x1c, box, 0.59), box, 0.59);
    expect(Math.max(...narrow.map(([x]) => Math.abs(x)))).toBeCloseTo(0.88, 6);
    // A box this small in a wide pane would pull the eye inside the chamber; it stays outside and frames looser.
    const tiny: PrinterBounds = { min: [126, 126, 0], max: [130, 130, 2] };
    const pose = framePrinterCamera(x1c, tiny, 2.4);
    expect(isOutside(x1c, pose.position)).toBe(true);
    const corners = project(pose, tiny, 2.4);
    expect(Math.max(...corners.flat().map((value) => Math.abs(value)))).toBeLessThan(0.88);
    // Backed out, the box stays centred at the new distance.
    expect(offCentre(corners, 0)).toBeLessThan(0.005);
    expect(offCentre(corners, 1)).toBeLessThan(0.005);
  });
});

describe('partBounds', () => {
  it('should measure walls and infill from the plate, leaving out the purge line, home moves and end lift', () => {
    const program = fixtureProgram({ layers: 5, size: 30 });
    // The whole toolpath runs from home through the front purge line to the 50 mm end lift.
    expect(program.bounds).toEqual({ min: [0, 0, 0], max: [138, 138, 50] });
    expect(partBounds(program)).toEqual({ min: [108, 108, 0], max: [138, 138, 1] });
  });

  it('should report no part when the G-code labels no walls, infill or support', () => {
    const program = parseGcode('M104 S200\nG28\nG90\nM83\nG1 X10 Y10 Z0.2 F3000\nG1 X20 Y10 E1\n');
    expect(program.segmentCount).toBe(2);
    expect(partBounds(program)).toBeUndefined();
  });
});

describe('framing the plate', () => {
  const x1c = derivePrinterGeometry(x1cReferenceGeometry);

  it('should frame the finished part standing on the plate, or the whole plate without one', () => {
    const part: PrinterBounds = { min: [108, 108, 0.2], max: [138, 138, 24] };
    expect(framedPartBox(x1c, part)).toEqual({ min: [108, 108, 0], max: [138, 138, 24] });
    expect(framedPartBox(x1c, undefined)).toEqual({ min: [0, 0, -4], max: [256, 256, 12] });
  });

  it('should centre the part on both screen axes and fill the pane as the CAD viewer does, from the front right', () => {
    const boxes = {
      part: framedPartBox(x1c, { min: [108, 108, 0], max: [133, 133, 25] }),
      plate: framedPartBox(x1c, undefined),
      tall: framedPartBox(x1c, { min: [120, 120, 0], max: [136, 136, 180] }),
    };
    for (const [name, box] of Object.entries(boxes)) {
      for (const aspect of [0.5, 0.59, 1, 16 / 9, 3]) {
        const pose = framePrinterCamera(undefined, box, aspect);
        expect(pose.position[0]).toBeGreaterThan(pose.target[0]);
        expect(pose.position[1]).toBeLessThan(pose.target[1]);
        const corners = project(pose, box, aspect);
        // The binding axis meets the fill margin on both sides; the free axis keeps even slack under perspective.
        expect(Math.max(...corners.flat().map((value) => Math.abs(value)))).toBeCloseTo(partFramingFill, 6);
        expect(offCentre(corners, 0), `${name} across at ${aspect}`).toBeLessThan(0.005);
        expect(offCentre(corners, 1), `${name} down at ${aspect}`).toBeLessThan(0.005);
      }
    }
  });
});
