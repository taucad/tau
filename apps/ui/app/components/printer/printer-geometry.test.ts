import { describe, expect, it } from 'vitest';
import {
  derivePrinterGeometry,
  framePrinterCamera,
  plateOffsetForHeight,
  toolheadLiftForHeight,
} from '#components/printer/printer-geometry.js';
import { resolvePrinterManifest, x1cReferenceGeometry } from '#components/printer/printer-manifest.fixture.js';
import type { PrinterManifest } from '#components/printer/printer-manifest.fixture.js';

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
    expect(x1c.plate).toEqual({ center: [128, 128, -2], size: [256, 256, 4] });
    expect(x1c.envelope).toEqual({ center: [128, 128, 128], size: [256, 256, 256] });
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
  });

  it('should give a delta three posts and no beam', () => {
    const geometry = derivePrinterGeometry(delta);
    expect(geometry.gantry.kind).toBe('delta');
    expect(geometry.gantry.rails).toHaveLength(3);
    expect(geometry.gantry.rails.every((rail) => rail.size[2] > 250)).toBe(true);
  });

  it('should frame the whole machine from the front right', () => {
    const position = framePrinterCamera(x1c, 38);
    expect(position[0]).toBeGreaterThan(x1c.camera.target[0]);
    expect(position[1]).toBeLessThan(x1c.camera.target[1]);
    expect(position[2]).toBeGreaterThan(x1c.camera.target[2]);
    const distance = Math.hypot(...position.map((value, index) => value - x1c.camera.target[index]!));
    expect(distance).toBeCloseTo((x1c.camera.radius / Math.sin((38 * Math.PI) / 360)) * 1.05, 6);
  });

  it('should resolve the X1C reference until a manifest arrives', () => {
    expect(resolvePrinterManifest(undefined)).toBe(x1cReferenceGeometry);
    expect(resolvePrinterManifest(bedSlinger)).toBe(bedSlinger);
  });
});
