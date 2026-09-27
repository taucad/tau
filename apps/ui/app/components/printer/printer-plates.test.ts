import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  defaultPrinterPlate,
  plateForBedType,
  plateModelMatrix,
  x1cPlates,
} from '#components/printer/printer-plates.js';

describe('plateForBedType', () => {
  it('should map Bambu Studio names, its plate_1.json values and Tau ids to the same plate', () => {
    expect(['Textured PEI Plate', 'textured_plate', 'textured-pei'].map((name) => plateForBedType(name)?.id)).toEqual([
      'textured-pei',
      'textured-pei',
      'textured-pei',
    ]);
    expect(['High Temp Plate', 'hot_plate', 'high-temperature'].map((name) => plateForBedType(name)?.id)).toEqual([
      'high-temperature',
      'high-temperature',
      'high-temperature',
    ]);
    expect(plateForBedType('Engineering Plate')?.id).toBe('engineering');
    expect(plateForBedType('eng_plate')?.id).toBe('engineering');
    expect(plateForBedType(' cool plate ')?.id).toBe('cool');
  });

  it('should name no plate for unknown, unspecified or missing bed types', () => {
    expect(plateForBedType('unspecified')).toBeUndefined();
    expect(plateForBedType('supertack_plate')).toBeUndefined();
    expect(plateForBedType('')).toBeUndefined();
    expect(plateForBedType(undefined)).toBeUndefined();
  });

  it('should default to the Textured PEI Plate and list the four X1C plates', () => {
    expect(defaultPrinterPlate.id).toBe('textured-pei');
    expect(x1cPlates.map((plate) => plate.label)).toEqual([
      'Cool Plate',
      'Engineering Plate',
      'High Temp Plate',
      'Textured PEI Plate',
    ]);
  });
});

describe('plateModelMatrix', () => {
  it('should turn glTF Y-up metres into the Z-up millimetre plate frame', () => {
    // 100 mm right, 50 mm back (glTF -Z) and 2 mm up (glTF +Y).
    const point = new Vector3(0.1, 0.002, -0.05).applyMatrix4(plateModelMatrix);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(50, 6);
    expect(point.z).toBeCloseTo(2, 6);
  });
});
