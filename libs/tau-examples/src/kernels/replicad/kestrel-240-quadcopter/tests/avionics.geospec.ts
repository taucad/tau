import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

const parts = [
  { name: 'battery', size: { x: 70, y: 32, z: 34 }, minVolume: 70_000 },
  { name: 'esc', size: { x: 25, y: 25, z: 4.6 }, minVolume: 1600 },
  {
    name: 'flight-controller',
    size: { x: 25, y: 25, z: 4.6 },
    minVolume: 1300,
  },
  { name: 'receiver', size: { x: 16, y: 9, z: 3 }, minVolume: 300 },
  { name: 'standoff', size: { x: 4.8, y: 4.8, z: 7.4 }, minVolume: 100 },
  { name: 'board-screw', size: { x: 3.8, y: 3.8, z: 16.6 }, minVolume: 60 },
  { name: 'board-isolator', size: { x: 5, y: 5, z: 1 }, minVolume: 15 },
  { name: 'power-connector', size: { x: 10, y: 10, z: 5 }, minVolume: 300 },
  { name: 'power-wire', size: { y: 2 }, minVolume: 25 },
  { name: 'antenna', size: { x: 41, y: 2.4, z: 2.4 }, minVolume: 150 },
];

describe('avionics discrete parts', () => {
  for (const part of parts) {
    it(`${part.name} is a closed, dimensioned purchased envelope`, async () => {
      const model = await loadModel({ file: `parts/avionics/${part.name}.ts` });
      expectGeo(model).toHaveBoundingBox({ size: part.size, tolerance: 0.025 });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveConnectedComponents({ count: 1 });
      expectGeo(model).toHaveVolume({ value: { greaterThan: part.minVolume } });
    });
    it(`${part.name} retains valid exact manufacturing interfaces`, async () => {
      const model = await loadModel({
        file: `parts/avionics/${part.name}.ts`,
        format: 'step',
      });
      expectGeo(model).toBeValidBrep();
      expectGeo(model).toHaveStepUnits({ unit: 'mm' });
      expectGeo(model).toHaveTopologyCounts({ solids: 1 });
    });
  }

  for (const name of ['esc', 'flight-controller']) {
    it(`${name} has four exact 2.2 mm clearance holes on a 20 mm square`, async () => {
      const model = await loadModel({
        file: `parts/avionics/${name}.ts`,
        format: 'step',
      });
      expectGeo(model).toHaveCircularHolePattern({
        count: 4,
        holeDiameter: 2.2,
        boltCircleDiameter: Math.sqrt(800),
        axis: 'z',
        center: { x: 0, y: 0 },
        tolerance: 0.01,
      });
    });
  }

  it('lower standoff variant preserves the M2 passage and seat height', async () => {
    const model = await loadModel({
      file: 'parts/avionics/standoff.ts',
      parameters: { height: 3.4 },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 4.8, y: 4.8, z: 3.4 },
      tolerance: 0.02,
    });
    expectGeo(model).toBeWatertight();
    const step = await loadModel({
      file: 'parts/avionics/standoff.ts',
      parameters: { height: 3.4 },
      format: 'step',
    });
    expectGeo(step).toHaveCircularHole({
      diameter: 2.2,
      through: true,
      axis: 'z',
      tolerance: 0.01,
    });
  });
});

describe('avionics subsystem', () => {
  it('locates the battery, stacked controllers, receiver, and antenna', async () => {
    const model = await loadModel({ file: 'assemblies/avionics.ts' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        {
          name: 'avionics/battery-6S-envelope',
          count: 1,
          bounds: { center: { x: -27, y: 0, z: 0 }, tolerance: 0.03 },
        },
        {
          name: 'avionics/esc-envelope',
          count: 1,
          bounds: { center: { x: 24, y: 0, z: -6.7 }, tolerance: 0.03 },
        },
        {
          name: 'avionics/flight-controller-envelope',
          count: 1,
          bounds: { center: { x: 24, y: 0, z: 2.3 }, tolerance: 0.03 },
        },
        {
          name: 'avionics/receiver-envelope',
          count: 1,
          bounds: { center: { x: 56, y: 0, z: 0 }, tolerance: 0.03 },
        },
        {
          name: 'avionics/antenna-envelope',
          count: 1,
          bounds: { center: { x: 84.5, y: 0, z: 0 }, tolerance: 0.03 },
        },
      ],
    });
  });

  it('resolves the battery and controller mechanical stack without solid overlaps', async () => {
    const model = await loadModel({
      file: 'assemblies/avionics.ts',
      format: 'step',
    });
    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveTopologyCounts({ solids: 24 });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.001 });
  });

  it('both insulated leads meet their battery and connector seats without embedded solid volume', async () => {
    const model = await loadModel({
      file: 'assemblies/avionics.ts',
      format: 'step',
    });
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: 0.001,
      pairs: ['positive', 'negative'].flatMap((polarity) => [
        {
          left: 'avionics/battery-6S-envelope',
          right: `avionics/power-lead-${polarity}`,
        },
        {
          left: 'avionics/power-connector-envelope',
          right: `avionics/power-lead-${polarity}`,
        },
      ]),
    });
  });
});
