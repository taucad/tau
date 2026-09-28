import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

// Requirements are independent of implementation constants. All dimensions are mm.
const part = async (name: string, parameters = {}) =>
  loadModel({
    file: 'main.ts',
    format: 'step',
    parameters: { ...parameters, part: name },
  });
const screws: Array<[number, number]> = [
  [-100, -52],
  [-100, 52],
  [-24, -58],
  [-24, 58],
  [60, -52],
  [60, 52],
];
const names = [
  'Housing',
  'Cover',
  'Gasket',
  'Input pinion',
  'Output wheel',
  'Input shaft',
  'Output shaft',
  'Input key',
  'Output key',
  'Input lower bearing',
  'Input upper bearing',
  'Output lower bearing',
  'Output upper bearing',
  ...screws.map((_, index) => `Cover screw ${index + 1}`),
];

describe('3:1 rotary gearbox', () => {
  it('renders the complete default assembly with 19 named parts', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveAssemblyOccurrences({
      occurrences: names.map((name) => ({ name, count: 1 })),
      uniqueNames: true,
    });
    expectGeo(model).toBeWatertight();
    // Nested/intermeshing AABBs form one spatial group. Count the actual solids
    // separately; this matcher does not identify 19 disconnected nested shells.
    expectGeo(model).toHaveConnectedComponents({ count: 1, tolerance: 0.01 });
    expectGeo(
      await loadModel({ file: 'main.ts', format: 'step' }),
    ).toHaveTopologyCounts({ solids: 19 });
    expectGeo(model).toHaveBoundingBox({
      min: [-110, -78, -22],
      max: [70, 78, 66],
      tolerance: 0.05,
    });
  });

  it('has no component interference in the assembled gearbox', async () => {
    expectGeo(
      await loadModel({ file: 'main.ts' }),
    ).toHaveNoComponentInterference({ tolerance: 0.01 });
  });

  for (const name of names) {
    it(`${name} is independently renderable, one closed valid solid`, async () => {
      const model = await part(name);
      expectGeo(model).toBeValidBrep();
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveTopologyCounts({ solids: 1 });
      expectGeo(model).toHaveConnectedComponents({ count: 1 });
      expectGeo(model).toHaveVolume({ value: { greaterThan: 20 } });
    });
  }

  it('housing has a 180 × 128 × 34 body and four through mounting holes', async () => {
    const model = await part('Housing');
    expectGeo(model).toHaveBoundingBox({
      size: { x: 180, y: 156, z: 34 },
      tolerance: 0.05,
    });
    for (const x of [-94, 54]) {
      for (const y of [-70, 70]) {
        // `through` compares with the entire 34 mm housing envelope, although
        // the mounting lug is only 6 mm thick. Prove the actual open path too.
        expectGeo(model).toHaveCircularHole({
          diameter: 7,
          axis: 'z',
          center: { x, y },
          tolerance: 0.03,
        });
        expectGeo(model).toHaveVoidContinuity({
          path: [
            [x, y, -1],
            [x, y, 7],
          ],
          bounds: { min: [x - 4, y - 4, -2], max: [x + 4, y + 4, 8] },
          minCrossSection: 30,
        });
      }
    }
    expectGeo(model).toHaveCylindricalFace({
      radius: 10,
      axis: 'z',
      tolerance: 0.03,
    });
  });

  for (const name of ['Housing', 'Cover']) {
    it(`${name} has two bearing seats and six correctly positioned screw holes`, async () => {
      const model = await part(name);
      for (const [x, diameter] of [
        [-72, 24.3],
        [0, 34.3],
      ] as const) {
        expectGeo(model).toHaveCircularHole({
          diameter,
          axis: 'z',
          center: { x, y: 0 },
          tolerance: 0.03,
        });
      }
      for (const [x, y] of screws) {
        expectGeo(model).toHaveCircularHole({
          diameter: name === 'Housing' ? 4.4 : 4.6,
          axis: 'z',
          center: { x, y },
          tolerance: 0.03,
        });
      }
    });
  }

  it('cover is 6 mm thick and the gasket is 0.3 mm thick', async () => {
    expectGeo(await part('Cover')).toHaveBoundingBox({
      min: { z: 34.5 },
      size: { x: 180, y: 128, z: 6 },
      tolerance: 0.03,
    });
    expectGeo(await part('Gasket')).toHaveBoundingBox({
      min: { z: 34.1 },
      size: { x: 180, y: 128, z: 0.3 },
      tolerance: 0.03,
    });
  });

  it('inspection cover has two open windows and a closed-cover variant', async () => {
    const model = await part('Cover');
    for (const y of [-35, 35]) {
      expectGeo(model).toHaveVoidContinuity({
        path: [
          [0, y, 34],
          [0, y, 41],
        ],
        minCrossSection: 200,
        bounds: { min: [-10, y - 10, 33], max: [10, y + 10, 42] },
      });
    }
    const closed = await part('Cover', { inspectionCover: false });
    expectGeo(closed).toBeValidBrep();
    expectGeo(closed).toHaveVolume({ value: { greaterThan: 125_000 } });
  });

  for (const [name, radius, bore, faces] of [
    ['Input pinion', 20, 6.1, 118],
    ['Output wheel', 56, 10.1, 232],
  ] as const) {
    it(`${name} has the complete involute tooth topology, keyed bore, and 22 mm hub`, async () => {
      const model = await part(name);
      expectGeo(model).toHaveCylindricalFace({
        radius,
        axis: 'z',
        tolerance: 0.03,
      });
      expectGeo(model).toHaveCylindricalFace({
        radius: bore,
        axis: 'z',
        tolerance: 0.03,
      });
      expectGeo(model).toHaveBoundingBox({
        min: { z: 8 },
        size: { z: 22 },
        tolerance: 0.03,
      });
      // Each pinion tooth has 2 spline flanks, 2 root extensions, tip/root arcs.
      // Wheel teeth start above the base circle, so have 4 lateral faces each.
      expectGeo(model).toHaveTopologyCounts({ faces });
    });
  }

  it('output wheel has six Ø15 lightening holes on a Ø68 circle', async () => {
    expectGeo(await part('Output wheel')).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 15,
      boltCircleDiameter: 68,
      center: { x: 0, y: 0 },
      axis: 'z',
      tolerance: 0.03,
    });
  });

  for (const inputAngle of [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 120]) {
    it(`gears remain separate without interference at input angle ${inputAngle}°`, async () => {
      // GLB preserves individual occurrence meshes for pairwise interference.
      const model = await loadModel({
        file: 'main.ts',
        parameters: { part: 'gears', inputAngle },
      });
      expectGeo(model).toHaveConnectedComponents({ count: 1, tolerance: 0.01 });
      expectGeo(model).toHaveNoComponentInterference({
        tolerance: 0.005,
        pairs: [{ left: 'Input pinion', right: 'Output wheel' }],
      });
      expectGeo(model).toHaveAssemblyOccurrences({
        occurrences: [
          {
            name: 'Input pinion',
            count: 1,
            bounds: { center: { x: -72, z: 19 }, tolerance: 0.15 },
          },
          {
            name: 'Output wheel',
            count: 1,
            bounds: { center: { x: 0, z: 19 }, tolerance: 0.15 },
          },
        ],
      });
    });
  }

  it('a 90° input rotation turns the keyed output by −30°', async () => {
    const a = ((180 / 54 - 30) * Math.PI) / 180;
    expectGeo(await part('Input key', { inputAngle: 90 })).toHaveBoundingBox({
      center: { x: -77.9, y: 0, z: 19 },
      tolerance: 0.03,
    });
    expectGeo(await part('Output key', { inputAngle: 90 })).toHaveBoundingBox({
      center: { x: -9.9 * Math.sin(a), y: 9.9 * Math.cos(a), z: 19 },
      tolerance: 0.03,
    });
  });

  for (const [
    name,
    x,
    radius,
    length,
    minZ,
    slotWidth,
    slotBottom,
    slotLength,
  ] of [
    ['Input shaft', -72, 6, 62.3, -22, 4.2, 3.9, 33],
    ['Output shaft', 0, 10, 68, -2, 6.2, 6.9, 37],
  ] as const) {
    it(`${name} has the correct journal, extension and two machined key seats`, async () => {
      const model = await part(name);
      const half = slotWidth / 2;
      const slotArea =
        half * Math.sqrt(radius ** 2 - half ** 2) +
        radius ** 2 * Math.asin(half / radius) -
        slotWidth * slotBottom;
      expectGeo(model).toHaveBoundingBox({
        min: { z: minZ },
        size: { z: length },
        center: { x },
        tolerance: 0.05,
      });
      expectGeo(model).toHaveCylindricalFace({
        radius,
        axis: 'z',
        tolerance: 0.03,
      });
      expectGeo(model).toHaveVolume({
        value: Math.PI * radius ** 2 * length - slotArea * slotLength,
        tolerance: 0.5,
      });
    });
  }

  for (const side of ['Input', 'Output']) {
    for (const level of ['lower', 'upper']) {
      it(`${side} ${level} bearing has the intended bore, diameter and axial position`, async () => {
        const model = await part(`${side} ${level} bearing`);
        const r = side === 'Input' ? 12 : 17,
          bore = side === 'Input' ? 6.15 : 10.15;
        expectGeo(model).toHaveBoundingBox({
          size: { x: 2 * r, y: 2 * r, z: 5.6 },
          center: { x: side === 'Input' ? -72 : 0 },
          min: { z: level === 'lower' ? 0.2 : 34.7 },
          tolerance: 0.03,
        });
        expectGeo(model).toHaveCircularHole({
          diameter: bore * 2,
          through: true,
          axis: 'z',
          tolerance: 0.03,
        });
        expectGeo(model).toHaveVolume({
          value: Math.PI * (r * r - bore * bore) * 5.6,
          tolerance: 0.1,
        });
      });
    }
  }

  for (const [name, width, height] of [
    ['Input key', 3.8, 3.8],
    ['Output key', 5.8, 5.8],
  ] as const) {
    it(`${name} provides a separate torque-transmitting rectangular key`, async () => {
      expectGeo(await part(name)).toHaveVolume({
        value: width * height * 15.6,
        tolerance: 0.01,
      });
    });
  }

  it('six socket-head screws have Ø4 shanks, Ø7.5 heads and hexagonal recesses', async () => {
    const model = await part('Cover screw 1');
    expectGeo(model).toHaveCylindricalFace({
      radius: 2,
      axis: 'z',
      tolerance: 0.03,
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 3.75,
      axis: 'z',
      tolerance: 0.03,
    });
    expectGeo(model).toHaveBoundingBox({ size: { z: 20 }, tolerance: 0.03 });
    const volume =
      Math.PI * 4 * 16 +
      Math.PI * 3.75 ** 2 * 4 -
      ((3 * Math.sqrt(3)) / 2) * 1.8 ** 2 * 2.2;
    expectGeo(model).toHaveVolume({ value: volume, tolerance: 0.2 });
  });

  it('coverLift raises the cover, top bearings and fasteners by 30 mm', async () => {
    expectGeo(await part('Cover', { coverLift: 30 })).toHaveBoundingBox({
      min: { z: 64.5 },
      size: { z: 6 },
      tolerance: 0.03,
    });
    expectGeo(
      await part('Input upper bearing', { coverLift: 30 }),
    ).toHaveBoundingBox({ min: { z: 64.7 }, tolerance: 0.03 });
    expectGeo(await part('Cover screw 1', { coverLift: 30 })).toHaveBoundingBox(
      { min: { z: 54.6 }, tolerance: 0.03 },
    );
  });

  it('faceWidth changes tooth width while retaining the hub and assembly clearance', async () => {
    const parameters = {
      part: 'gears',
      faceWidth: 12,
      backlash: 0.3,
      inputAngle: 7,
    };
    const model = await loadModel({ file: 'main.ts', parameters });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: 0.005,
      pairs: [{ left: 'Input pinion', right: 'Output wheel' }],
    });
    expectGeo(await part('Output wheel', parameters)).toHavePlanarFace({
      normal: [0, 0, 1],
      offset: 25,
      tolerance: 0.03,
    });
  });

  for (const inputAngle of [5, 10]) {
    it(`minimum backlash and maximum face width remain clear at ${inputAngle}°`, async () => {
      const model = await loadModel({
        file: 'main.ts',
        parameters: {
          part: 'gears',
          faceWidth: 18,
          backlash: 0.08,
          inputAngle,
        },
      });
      expectGeo(model).toHaveNoComponentInterference({
        tolerance: 0.005,
        pairs: [{ left: 'Input pinion', right: 'Output wheel' }],
      });
    });
  }

  it('closed-cover and lifted-cover assemblies retain all 19 parts without interference', async () => {
    for (const parameters of [
      { inspectionCover: false, inputAngle: 90 },
      { coverLift: 30 },
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Serial model loads bound peak memory.
      const model = await loadModel({ file: 'main.ts', parameters });
      expectGeo(model).toHaveAssemblyOccurrences({
        occurrences: names.map((name) => ({ name, count: 1 })),
      });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.01 });
    }
  });
});

// Coverage ceiling: sampled static mesh clearance is not a dynamic contact or
// tooth-strength analysis. BRep topology + addendum cylinders proxy tooth count;
// GeoSpec has no dedicated involute/gear-ratio matcher. Bearings are plain bushes,
// and screw threads/root cutter fillets are intentionally not modeled.
