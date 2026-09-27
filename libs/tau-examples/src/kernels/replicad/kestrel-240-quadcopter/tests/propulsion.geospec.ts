import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

// Interface requirements are written before the corresponding geometry.
const parts = [
  { name: 'motor-base', size: { x: 28, y: 28, z: 24 }, minVolume: 1900 },
  { name: 'motor-stator', size: { x: 22, y: 22, z: 16.6 }, minVolume: 4500 },
  { name: 'motor-bell', size: { x: 28, y: 28, z: 22.7 }, minVolume: 3300 },
  { name: 'motor-shaft', size: { x: 5, y: 5, z: 33 }, minVolume: 640 },
  { name: 'motor-bearing', size: { x: 9, y: 9, z: 3 }, minVolume: 130 },
  { name: 'motor-screw', size: { x: 5.4, y: 5.4, z: 9 }, minVolume: 85 },
  { name: 'prop-nut', size: { z: 4.5 }, minVolume: 145 },
];

describe('propulsion discrete parts', () => {
  for (const part of parts) {
    it(`${part.name} preserves its closed mechanical envelope`, async () => {
      const model = await loadModel({
        file: `parts/propulsion/${part.name}.ts`,
      });
      expectGeo(model).toHaveBoundingBox({ size: part.size, tolerance: 0.025 });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveConnectedComponents({ count: 1 });
      expectGeo(model).toHaveVolume({ value: { greaterThan: part.minVolume } });
    });
    it(`${part.name} is a valid millimetre exact solid`, async () => {
      const model = await loadModel({
        file: `parts/propulsion/${part.name}.ts`,
        format: 'step',
      });
      expectGeo(model).toBeValidBrep();
      expectGeo(model).toHaveStepUnits({ unit: 'mm' });
      expectGeo(model).toHaveTopologyCounts({ solids: 1 });
    });
  }

  it('motor base accepts four M3 screws on the 16 mm square', async () => {
    const model = await loadModel({
      file: 'parts/propulsion/motor-base.ts',
      format: 'step',
    });
    expectGeo(model).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 3,
      boltCircleDiameter: Math.sqrt(512),
      axis: 'z',
      center: { x: 0, y: 0 },
      tolerance: 0.01,
    });
    expectGeo(model).toHaveCircularHole({
      diameter: 9.1,
      axis: 'z',
      center: { x: 0, y: 0 },
      tolerance: 0.01,
    });
  });

  it('bearing retains exact 5 mm shaft and 9 mm housing interfaces', async () => {
    const model = await loadModel({
      file: 'parts/propulsion/motor-bearing.ts',
      format: 'step',
    });
    expectGeo(model).toHaveCircularHole({
      diameter: 5,
      through: true,
      axis: 'z',
      tolerance: 0.01,
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 4.5,
      axis: 'z',
      tolerance: 0.01,
    });
  });

  for (const handedness of ['CW', 'CCW']) {
    it(`${handedness} supplier propeller is one closed three-blade BRep with a 5.2 mm bore`, async () => {
      const model = await loadModel({
        file: 'parts/propulsion/propeller.ts',
        parameters: { handedness },
      });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveConnectedComponents({ count: 1 });
      expectGeo(model).toHaveBoundingBox({ max: { x: 63.5 }, tolerance: 0.04 });
      expectGeo(model).toHaveVolume({
        value: { greaterThan: 2000, lessThan: 6000 },
      });
      const step = await loadModel({
        file: 'parts/propulsion/propeller.ts',
        parameters: { handedness },
        format: 'step',
      });
      expectGeo(step).toBeValidBrep();
      expectGeo(step).toHaveTopologyCounts({ solids: 1 });
      // The feature extractor classifies through-holes against the entire blade envelope.
      // Prove the local hub passage directly as well as its exact cylindrical diameter.
      expectGeo(step).toHaveCircularHole({
        diameter: 5.2,
        axis: 'z',
        tolerance: 0.01,
      });
      expectGeo(step).toHaveVoidContinuity({
        path: [
          [0, 0, -4],
          [0, 0, 4],
        ],
        minCrossSection: 19,
        bounds: { min: [-4, -4, -5], max: [4, 4, 5] },
      });
    });
  }
});

describe('propulsion subsystem', () => {
  for (const handedness of ['CW', 'CCW']) {
    it(`${handedness} blade roots clear the motor bell at the unchanged 38 mm rotor datum`, async () => {
      const model = await loadModel({
        file: 'assemblies/motor-module.ts',
        parameters: { handedness },
        format: 'step',
      });
      expectGeo(model).toBeValidBrep();
      expectGeo(model).toHaveTopologyCounts({ solids: 12 });
      expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.001 });
      expectGeo(model).toHaveNoComponentInterference({
        tolerance: 0.001,
        pairs: [
          {
            left: 'motor-module/motor-bell-envelope',
            right: `motor-module/propeller-${handedness}`,
          },
          {
            left: 'motor-module/prop-nut',
            right: `motor-module/propeller-${handedness}`,
          },
          {
            left: 'motor-module/motor-shaft',
            right: `motor-module/propeller-${handedness}`,
          },
        ],
      });
    });
  }

  it('builds one independently renderable motor module with twelve named mechanical occurrences', async () => {
    const model = await loadModel({ file: 'assemblies/motor-module.ts' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        { name: 'motor-module/motor-base', count: 1 },
        { name: 'motor-module/motor-stator-envelope', count: 1 },
        { name: 'motor-module/motor-bell-envelope', count: 1 },
        { name: 'motor-module/motor-shaft', count: 1 },
        { name: 'motor-module/motor-bearing-1', count: 1 },
        { name: 'motor-module/motor-bearing-2', count: 1 },
        { name: 'motor-module/propeller-CW', count: 1 },
        { name: 'motor-module/prop-nut', count: 1 },
        ...[1, 2, 3, 4].map((n) => ({
          name: `motor-module/motor-screw-${n}`,
          count: 1,
        })),
      ],
    });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.001 });
  });

  it('contains four positioned motor stacks with spar-aligned bolt patterns and correct rotor handedness', async () => {
    const model = await loadModel({ file: 'assemblies/propulsion.ts' });
    const stations = [
      ['front-left', -85, -85, 'CW'],
      ['front-right', -85, 85, 'CCW'],
      ['rear-left', 85, -85, 'CCW'],
      ['rear-right', 85, 85, 'CW'],
    ] as const;
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: stations.flatMap(([name, x, y, hand]) => {
        const length = Math.hypot(33, 75);
        const cosine = (Math.sign(y) * 75) / length,
          sine = (-Math.sign(x) * 33) / length;
        return [
          {
            name: `${name}/motor-base`,
            count: 1,
            bounds: { center: { x, y, z: 19 }, tolerance: 0.03 },
          },
          {
            name: `${name}/motor-shaft`,
            count: 1,
            bounds: { center: { x, y, z: 26.5 }, tolerance: 0.03 },
          },
          { name: `${name}/propeller-${hand}`, count: 1 },
          {
            name: `${name}/prop-nut`,
            count: 1,
            bounds: { center: { x, y, z: 42.75 }, tolerance: 0.03 },
          },
          ...[-8, 8].flatMap((dx, index) =>
            [-8, 8].map((dy, index_) => ({
              name: `${name}/motor-screw-${index * 2 + index_ + 1}`,
              count: 1,
              bounds: {
                center: {
                  x: x + dx * cosine - dy * sine,
                  y: y + dx * sine + dy * cosine,
                  z: 5.5,
                },
                tolerance: 0.03,
              },
            })),
          ),
        ];
      }),
    });
  });

  it('has no unintended motor, shaft, propeller, or fastener overlaps', async () => {
    const model = await loadModel({
      file: 'assemblies/propulsion.ts',
      format: 'step',
    });
    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.001 });
  });
});
