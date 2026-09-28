import {
  describe,
  it,
  expectGeo,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';

describe('AIRFRAME / manufactured leaf parts', () => {
  for (const [file, volumeMin, volumeMax] of [
    ['parts/airframe/upper-shell.ts', 6000, 50_000],
    ['parts/airframe/lower-shell.ts', 6000, 50_000],
    ['parts/airframe/arm.ts', 8000, 40_000],
    ['parts/airframe/spar.ts', 1000, 10_000],
    ['parts/airframe/root-clamp.ts', 500, 8000],
    ['parts/airframe/motor-pad.ts', 2000, 14_000],
    ['parts/airframe/battery-saddle.ts', 500, 12_000],
    ['parts/airframe/shell-screw.ts', 20, 400],
    ['parts/airframe/heat-set-insert.ts', 10, 200],
    ['parts/airframe/battery-strap.ts', 800, 4000],
  ] as const) {
    it(`${file} / closed printable or purchased solid`, async () => {
      const m = await loadModel({ file });
      expectGeo(m).toBeWatertight();
      expectGeo(m).toHaveConnectedComponents({ count: 1 });
      expectGeo(m).toHaveVolume({
        value: { greaterThan: volumeMin, lessThan: volumeMax },
      });
    });
    it(`${file} / valid exact BRep`, async () => {
      const m = await loadModel({ file, format: 'step' });
      expectGeo(m).toBeValidBrep();
      expectGeo(m).toHaveTopologyCounts({ solids: 1 });
      expectGeo(m).toHaveStepUnits({ unit: 'mm' });
    });
  }
  it('M3 motor mounting pattern and shaft bore', async () => {
    const m = await loadModel({
      file: 'parts/airframe/motor-pad.ts',
      format: 'step',
    });
    expectGeo(
      await loadModel({ file: 'parts/airframe/motor-pad.ts' }),
    ).toHaveBoundingBox({ size: { x: 32, y: 32, z: 12 }, tolerance: 0.05 });
    expectGeo(m).toHaveCircularHole({
      diameter: 8.4,
      axis: 'z',
      through: true,
      tolerance: 0.05,
    });
    expectGeo(m).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 3.3,
      boltCircleDiameter: Math.sqrt(512),
      axis: 'z',
      tolerance: 0.05,
    });
    expectGeo(m).toHaveCylindricalFace({
      radius: 2.9,
      axis: 'z',
      tolerance: 0.01,
    });
    expectGeo(m).toHavePlanarFace({
      normal: [0, 0, -1],
      offset: -3,
      tolerance: 0.01,
    });
  });
  it('spar / 8 mm OD and 5 mm ID', async () => {
    const m = await loadModel({
      file: 'parts/airframe/spar.ts',
      format: 'step',
    });
    expectGeo(
      await loadModel({ file: 'parts/airframe/spar.ts' }),
    ).toHaveBoundingBox({ size: { x: 8, y: 64, z: 8 }, tolerance: 0.05 });
    expectGeo(m).toHaveCircularHole({
      diameter: 5,
      axis: 'y',
      through: true,
      tolerance: 0.05,
    });
  });
  it('root clamp / spar socket', async () => {
    const m = await loadModel({
      file: 'parts/airframe/root-clamp.ts',
      format: 'step',
    });
    expectGeo(m).toHaveCircularHole({
      diameter: 8.3,
      axis: 'y',
      through: true,
      tolerance: 0.05,
    });
  });
  it('shell screw / M2.5 envelope', async () => {
    expectGeo(
      await loadModel({ file: 'parts/airframe/shell-screw.ts' }),
    ).toHaveBoundingBox({ size: { x: 4.5, y: 4.5, z: 10 }, tolerance: 0.05 });
  });
  it('webbing strap / battery clearance envelope', async () => {
    expectGeo(
      await loadModel({ file: 'parts/airframe/battery-strap.ts' }),
    ).toHaveBoundingBox({ size: { x: 10, y: 35.4, z: 37.4 }, tolerance: 0.05 });
  });
});

describe('AIRFRAME / assembly', () => {
  it('all 29 installed parts / complete pairwise interference', async () => {
    const m = await loadModel({
      file: 'assemblies/airframe.ts',
      format: 'step',
    });
    expectGeo(m).toBeValidBrep();
    expectGeo(m).toHaveTopologyCounts({ solids: 29 });
    expectGeo(m).toHaveNoComponentInterference({
      tolerance: 0.001,
      allowances: [1, 2, 3, 4].map(
        (index): GeoSpecComponentInterferenceAllowance => ({
          kind: 'intentionalInterference',
          left: `AF-008 Shell screw ${index}`,
          right: `AF-009 Insert ${index}`,
          maxVolume: 6.5,
          reason:
            'Nominal M2.5 shank and insert tap bore represent mating helical threads; 4 mm engagement.',
        }),
      ),
    });
  });
  it('named shell halves, arms, four motor pads and four spars', async () => {
    const m = await loadModel({ file: 'assemblies/airframe.ts' });
    expectGeo(m).toBeWatertight();
    expectGeo(m).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        { name: 'AF-001 Upper shell', count: 1 },
        { name: 'AF-002 Lower shell', count: 1 },
        { name: /^AF-003 Arm [FR][LR]$/, count: 4 },
        { name: /^AF-004 Spar [FR][LR]$/, count: 4 },
        { name: /^AF-006 Motor pad [FR][LR]$/, count: 4 },
      ],
    });
    expectGeo(m).toHaveBoundingBox({
      min: { x: -101, y: -101 },
      max: { x: 115.1898, y: 101 },
      tolerance: 0.15,
    });
  });
  it('shell halves have a service seam without overlap', async () => {
    const m = await loadModel({
      file: 'assemblies/airframe.ts',
      format: 'step',
    });
    expectGeo(m).toHaveNoComponentInterference({
      pairs: [{ left: 'AF-001 Upper shell', right: 'AF-002 Lower shell' }],
      tolerance: 0.03,
    });
  });
});
