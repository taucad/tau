import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Planetary Gear System', () => {
  it('has the specified 174 mm rim and 68 mm axial envelope', async () => {
    const m = await loadModel({ file: 'main.ts' });
    expectGeo(m).toHaveBoundingBox({
      min: { x: -87, y: -87, z: -28 },
      max: { x: 87, y: 87, z: 40 },
      tolerance: 0.05,
    });
  });

  it('contains closed manufactured solids', async () => {
    expectGeo(await loadModel({ file: 'main.ts' })).toBeWatertight();
  });

  it('contains the gears, two carriers and all support hardware', async () => {
    const m = await loadModel({ file: 'main.ts' });
    expectGeo(m).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        { name: 'Internal Ring Gear', count: 1 },
        {
          name: 'Sun Gear And Input Shaft',
          count: 1,
          bounds: { min: { z: -28 }, max: { z: 16 }, tolerance: 0.05 },
        },
        {
          name: 'Carrier Rear',
          count: 1,
          bounds: { min: { z: -8 }, max: { z: -3 }, tolerance: 0.05 },
        },
        {
          name: 'Carrier Front And Output Hub',
          count: 1,
          bounds: { min: { z: 17 }, max: { z: 40 }, tolerance: 0.05 },
        },
        ...[1, 2, 3].flatMap((index) => [
          {
            name: `Planet Gear ${index}`,
            count: 1,
            bounds: { min: { z: 0 }, max: { z: 14 }, tolerance: 0.05 },
          },
          { name: `Planet Pin ${index}`, count: 1 },
          { name: `Flanged Bushing ${index}`, count: 1 },
          { name: `Thrust Washer ${index}`, count: 1 },
          { name: `Front Thrust Spacer ${index}`, count: 1 },
          { name: `Rear Thrust Spacer ${index}`, count: 1 },
          { name: `Front Screw Washer ${index}`, count: 1 },
          { name: `Rear Screw Washer ${index}`, count: 1 },
          { name: `Front Socket Screw ${index}`, count: 1 },
          { name: `Rear Socket Screw ${index}`, count: 1 },
        ]),
      ],
    });
  });

  it('places the three planet axes on a 96 mm pitch circle', async () => {
    const m = await loadModel({ file: 'main.ts' });
    expectGeo(m).toHaveAssemblyOccurrences({
      occurrences: [
        {
          name: 'Planet Gear 1',
          bounds: { center: { x: 48, y: 0, z: 7 }, tolerance: 0.05 },
        },
        {
          name: 'Planet Gear 2',
          bounds: { center: { x: -24, y: 41.569219, z: 7 }, tolerance: 0.05 },
        },
        {
          name: 'Planet Gear 3',
          bounds: { center: { x: -24, y: -41.569219, z: 7 }, tolerance: 0.05 },
        },
      ],
    });
  });

  it('has no gear or hardware interference', async () => {
    expectGeo(
      await loadModel({ file: 'main.ts' }),
    ).toHaveNoComponentInterference({ tolerance: 0.015 });
  });

  it('preserves clearance with a wider face and advanced input angle', async () => {
    const m = await loadModel({
      file: 'main.ts',
      parameters: { module: 2, faceWidth: 18, inputAngle: 30 },
    });
    expectGeo(m).toHaveBoundingBox({
      size: { x: 174, y: 174, z: 72 },
      min: { z: -28 },
      max: { z: 44 },
      tolerance: 0.05,
    });
    expectGeo(m).toHaveNoComponentInterference({ tolerance: 0.015 });
    expectGeo(m).toHaveAssemblyOccurrences({
      occurrences: [
        {
          name: 'Planet Gear 1',
          bounds: {
            center: { x: 47.589354, y: 6.265257, z: 9 },
            tolerance: 0.05,
          },
        },
      ],
    });
  });

  it('dimensions the removable bearing and thrust hardware', async () => {
    const m = await loadModel({ file: 'main.ts' });
    expectGeo(m).toHaveAssemblyOccurrences({
      occurrences: [
        {
          name: 'Planet Pin 1',
          bounds: {
            min: { x: 43, y: -5, z: -7.9 },
            max: { x: 53, y: 5, z: 21.9 },
            tolerance: 0.03,
          },
        },
        {
          name: 'Flanged Bushing 1',
          bounds: {
            min: { x: 39, y: -9, z: 0 },
            max: { x: 57, y: 9, z: 15.5 },
            tolerance: 0.03,
          },
        },
        {
          name: 'Front Thrust Spacer 1',
          bounds: { min: { z: 15.7 }, max: { z: 17 }, tolerance: 0.03 },
        },
        {
          name: 'Rear Thrust Spacer 1',
          bounds: { min: { z: -3 }, max: { z: -1.7 }, tolerance: 0.03 },
        },
        {
          name: 'Front Screw Washer 1',
          bounds: { min: { z: 22 }, max: { z: 23 }, tolerance: 0.03 },
        },
        {
          name: 'Rear Screw Washer 1',
          bounds: { min: { z: -9 }, max: { z: -8 }, tolerance: 0.03 },
        },
      ],
    });
    // Clearance is a relationship claim, answered from exact STEP BRep evidence;
    // cloned parts share STEP products, so select each occurrence by its path.
    const brep = await loadModel({ file: 'main.ts', format: 'step' });
    expectGeo(brep).toHaveSpatialRelationships({
      relationships: [
        {
          kind: 'clearance',
          subject: { kind: 'occurrence', path: 'Front Thrust Spacer 1' },
          target: { kind: 'occurrence', path: 'Flanged Bushing 1' },
          min: 0.18,
          max: 0.22,
        },
        {
          kind: 'clearance',
          subject: { kind: 'occurrence', path: 'Rear Thrust Spacer 1' },
          target: { kind: 'occurrence', path: 'Thrust Washer 1' },
          min: 0.18,
          max: 0.22,
        },
      ],
    });
  });

  it('clears intermediate tooth contact phases', async () => {
    for (const inputAngle of [5, 10, 15]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Phases load serially through one model runtime.
      const m = await loadModel({
        file: 'main.ts',
        parameters: { module: 2, faceWidth: 14, inputAngle },
      });
      expectGeo(m).toHaveNoComponentInterference({ tolerance: 0.015 });
    }
  });

  // Retain these exact-feature checks even if the local STEP inspection backend
  // is unavailable; mesh bounds and clearance are proxies, not BRep certification.
  it('provides valid millimetre BRep solids', async () => {
    const m = await loadModel({ file: 'main.ts', format: 'step' });
    expectGeo(m).toBeValidBrep();
    expectGeo(m).toHaveStepUnits({ unit: 'mm' });
    expectGeo(m).toHaveTopologyCounts({ solids: 34 });
  });

  it('has the mounting pattern and cylindrical shaft and bearing interfaces', async () => {
    const m = await loadModel({ file: 'main.ts', format: 'step' });
    // The capsule-slot ends of both carrier spiders are also 5.5 mm cylinders, so the
    // pattern matcher groups them with the ring's clearance holes. Assert the six
    // counterbores as a pattern and each 5.5 mm clearance hole at its PCD 162 position.
    expectGeo(m).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 9.5,
      boltCircleDiameter: 162,
      axis: 'z',
      center: { x: 0, y: 0 },
      tolerance: 0.03,
    });
    for (let index = 0; index < 6; index++) {
      const angle = ((30 + 60 * index) * Math.PI) / 180;
      expectGeo(m).toHaveCircularHole({
        diameter: 5.5,
        axis: 'z',
        center: { x: 81 * Math.cos(angle), y: 81 * Math.sin(angle) },
        tolerance: 0.03,
      });
    }
    expectGeo(m).toHaveCylindricalFace({
      radius: 8,
      axis: 'z',
      tolerance: 0.01,
    });
    expectGeo(m).toHaveCylindricalFace({
      radius: 7.015,
      axis: 'z',
      tolerance: 0.01,
    });
    expectGeo(m).toHaveCylindricalFace({
      radius: 5.02,
      axis: 'z',
      tolerance: 0.01,
    });
    expectGeo(m).toHaveCylindricalFace({
      radius: 5,
      axis: 'z',
      tolerance: 0.01,
    });
    expectGeo(m).toHaveCylindricalFace({
      radius: 3.995,
      axis: 'z',
      tolerance: 0.002,
    });
    expectGeo(m).toHaveCylindricalFace({
      radius: 4.01,
      axis: 'z',
      tolerance: 0.002,
    });
  });
});
