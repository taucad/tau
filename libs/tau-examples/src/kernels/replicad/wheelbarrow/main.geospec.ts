import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

// Dimensions are millimetres. x: front to handles, y: axle, z: ground up.
const cache = new Map();
function model(
  part = 'assembly',
  format: 'glb' | 'step' = 'glb',
  parameters: Record<string, number> = {},
) {
  const options = {
    file: 'main.ts',
    format,
    ...(part !== 'assembly' || Object.keys(parameters).length > 0
      ? { parameters: { part, ...parameters } }
      : {}),
  };
  const key = JSON.stringify(options);
  if (!cache.has(key)) {
    cache.set(key, loadModel(options));
  }
  return cache.get(key);
}

const parts = [
  'Tray',
  'Chassis',
  'Tire',
  'Wheel rim',
  'Axle',
  'Left spacer',
  'Right spacer',
  'Left nut',
  'Right nut',
  'Left grip',
  'Right grip',
];

describe('Wheelbarrow assembly', () => {
  it('fits its 1626 × 676 × 736 mm working envelope', async () => {
    expectGeo(await model()).toHaveBoundingBox({
      min: { x: -730, y: -338, z: 0 },
      max: { x: 896, y: 338, z: 736 },
      tolerance: 1,
    });
  });
  it('contains every named part once', async () => {
    expectGeo(await model()).toHaveAssemblyOccurrences({
      occurrences: parts.map((name) => ({ name, count: 1 })),
      uniqueNames: true,
    });
  });
  it('has closed manifold surfaces', async () =>
    expectGeo(await model()).toBeWatertight());
  it('has no unintended component overlap', async () => {
    expectGeo(await model()).toHaveNoComponentInterference({ tolerance: 0.1 });
  });
  it('is centred laterally', async () => {
    expectGeo(await model()).toHaveCenterOfMass({
      point: { y: 0 },
      tolerance: 0.1,
    });
  });
  it('has valid exact BRep geometry', async () =>
    expectGeo(await model('assembly', 'step')).toBeValidBrep());
  it('uses millimetres', async () =>
    expectGeo(await model('assembly', 'step')).toHaveStepUnits({ unit: 'mm' }));
  it('contains eleven physical solids', async () => {
    expectGeo(await model('assembly', 'step')).toHaveTopologyCounts({
      solids: 11,
    });
  });
  it('keeps the tire clear of the tray and chassis', async () => {
    expectGeo(await model('assembly', 'step')).toHaveSpatialRelationships({
      relationships: [
        { kind: 'clearance', subject: 'Tire', target: 'Tray', min: 60 },
        { kind: 'clearance', subject: 'Tire', target: 'Chassis', min: 20 },
      ],
    });
  });
  it('leaves the wheel bore free to turn around the axle', async () => {
    expectGeo(await model('assembly', 'step')).toHaveSpatialRelationships({
      relationships: [
        {
          kind: 'clearance',
          subject: 'Axle',
          target: { kind: 'occurrence', name: 'Wheel rim' },
          min: 0.79,
          max: 0.81,
        },
        {
          kind: 'clearance',
          subject: 'Axle',
          target: 'Chassis',
          min: 0.49,
          max: 0.51,
        },
      ],
    });
  });
});

for (const part of parts) {
  describe(part, () => {
    it('is a closed solid', async () =>
      expectGeo(await model(part)).toBeWatertight());
    it('is one connected component', async () => {
      expectGeo(await model(part)).toHaveConnectedComponents({ count: 1 });
    });
    it('has positive material volume', async () => {
      expectGeo(await model(part)).toHaveVolume({
        value: { greaterThan: 1000 },
      });
    });
  });
}

describe('Tray details', () => {
  it('has a 916 × 676 mm reinforced lip and 286 mm overall depth', async () => {
    expectGeo(await model('Tray')).toHaveBoundingBox({
      min: [-588, -338, 450],
      max: [328, 338, 736],
      tolerance: 0.2,
    });
  });
  it('has a flat 4 mm floor', async () => {
    expectGeo(await model('Tray', 'step')).toHavePlanarFace({
      normal: [0, 0, 1],
      offset: 454,
      area: { greaterThan: 200_000 },
      tolerance: 0.1,
    });
  });
  it('is open from the load space through the top', async () => {
    expectGeo(await model('Tray', 'step')).toHaveVoidContinuity({
      path: [
        [-80, 0, 465],
        [-100, 0, 600],
        [-130, 0, 750],
      ],
      minCrossSection: 150_000,
      bounds: { min: [-600, -350, 445], max: [340, 350, 760] },
    });
  });
  it('contains shell material rather than a filled hopper', async () => {
    expectGeo(await model('Tray')).toHaveVolume({
      value: { greaterThan: 2_500_000, lessThan: 5_500_000 },
    });
  });
});

describe('Wheel and axle details', () => {
  it('has a 380 mm tire centred on the ground-contact plane', async () => {
    expectGeo(await model('Tire')).toHaveBoundingBox({
      min: [-730, -48, 0],
      max: [-350, 48, 380],
      tolerance: 0.5,
    });
  });
  it('has recessed circumferential tread grooves', async () => {
    expectGeo(await model('Tire', 'step')).toHaveCylindricalFace({
      radius: 186,
      axis: 'y',
      tolerance: 0.1,
    });
  });
  it('has a 224 mm rim with a 140 mm hub', async () => {
    expectGeo(await model('Wheel rim')).toHaveBoundingBox({
      size: { x: 224, y: 140, z: 224 },
      center: { x: -540, y: 0, z: 190 },
      tolerance: 0.2,
    });
  });
  it('has a 21.6 mm through bore', async () => {
    expectGeo(await model('Wheel rim', 'step')).toHaveCircularHole({
      diameter: 21.6,
      through: true,
      axis: 'y',
      center: { x: -540, z: 190 },
      tolerance: 0.1,
    });
  });
  it('has six 24 mm lightening holes on a 132 mm bolt circle', async () => {
    expectGeo(await model('Wheel rim', 'step')).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 24,
      boltCircleDiameter: 132,
      axis: 'y',
      center: { x: -540, z: 190 },
      tolerance: 0.1,
    });
  });
  it('has a 20 × 252 mm axle', async () => {
    expectGeo(await model('Axle')).toHaveBoundingBox({
      size: { x: 20, y: 252, z: 20 },
      center: { x: -540, y: 0, z: 190 },
      tolerance: 0.1,
    });
  });
  for (const side of ['Left', 'Right']) {
    it(`${side} spacer keeps the hub 16 mm from the fork`, async () => {
      expectGeo(await model(`${side} spacer`)).toHaveBoundingBox({
        size: { x: 34, y: 16, z: 34 },
        center: { x: -540, y: side === 'Left' ? -78 : 78, z: 190 },
        tolerance: 0.1,
      });
    });
    it(`${side} nut has a through bore`, async () => {
      expectGeo(await model(`${side} nut`, 'step')).toHaveCircularHole({
        diameter: 21,
        through: true,
        axis: 'y',
        tolerance: 0.1,
      });
    });
    it(`${side} spacer has a through bore`, async () => {
      expectGeo(await model(`${side} spacer`, 'step')).toHaveCircularHole({
        diameter: 21,
        through: true,
        axis: 'y',
        tolerance: 0.1,
      });
    });
  }
});

describe('Frame and grips', () => {
  it('rests both stands on the ground', async () => {
    expectGeo(await model('Chassis', 'step')).toHavePlanarFace({
      normal: [0, 0, -1],
      offset: 0,
      area: { greaterThan: 8000 },
      tolerance: 0.1,
    });
  });
  it('has 21 mm axle holes in the fork', async () => {
    // The feature classifier marks these separated coaxial bores non-through.
    // Check their exact diameter here; prove the entire passage below.
    expectGeo(await model('Chassis', 'step')).toHaveCircularHole({
      diameter: 21,
      axis: 'y',
      center: { x: -540, z: 190 },
      tolerance: 0.1,
    });
  });
  it('has an unobstructed axle passage through both fork eyes', async () => {
    expectGeo(await model('Chassis', 'step')).toHaveVoidContinuity({
      path: [
        [-540, -120, 190],
        [-540, -98, 190],
        [-540, 0, 190],
        [-540, 98, 190],
        [-540, 120, 190],
      ],
      minCrossSection: 300,
      bounds: { min: [-551, -125, 179], max: [-529, 125, 201] },
    });
  });
  it('keeps the two grips symmetrical', async () => {
    expectGeo(await model()).toHaveAssemblyOccurrences({
      occurrences: [
        // Midpoint of the 148 mm sleeve along the 620:60:230 handle direction.
        {
          name: 'Left grip',
          bounds: { center: { y: -269.04 }, tolerance: 0.1 },
        },
        {
          name: 'Right grip',
          bounds: { center: { y: 269.04 }, tolerance: 0.1 },
        },
      ],
    });
  });
  it('keeps the grip sleeves clear of the steel handle ends', async () => {
    expectGeo(await model('assembly', 'step')).toHaveSpatialRelationships({
      relationships: [
        {
          kind: 'clearance',
          subject: { kind: 'occurrence', name: 'Left grip' },
          target: 'Chassis',
          min: 0.19,
          max: 0.21,
        },
        {
          kind: 'clearance',
          subject: { kind: 'occurrence', name: 'Right grip' },
          target: 'Chassis',
          min: 0.19,
          max: 0.21,
        },
      ],
    });
  });
});

describe('Wider, deeper tray variant', () => {
  const parameters = { trayWidth: 720, trayDepth: 320 };
  it('changes the tray width and depth', async () => {
    expectGeo(await model('Tray', 'glb', parameters)).toHaveBoundingBox({
      size: { x: 916, y: 736, z: 326 },
      min: { z: 450 },
      tolerance: 0.2,
    });
  });
  it('remains watertight', async () =>
    expectGeo(await model('assembly', 'glb', parameters)).toBeWatertight());
  it('remains free of unintended interference', async () => {
    expectGeo(
      await model('assembly', 'glb', parameters),
    ).toHaveNoComponentInterference({ tolerance: 0.1 });
  });
});

// Scope: static geometry. These checks do not establish strength, tire compliance,
// bearing friction, or threaded-fastener performance. Threads are simplified bores.
