import {
  describe,
  expectGeo,
  it,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';

// Requirements and acceptance values are independent of implementation constants.
const components = [
  ['Frame', [-90, -88, 0], [55, 88, 112]],
  ['Carriage', [61, -62.5, 20], [97, 62.5, 112]],
  ['Fixed jaw', [-6, -62.5, 82], [0, 62.5, 112]],
  ['Moving jaw', [55, -62.5, 82], [61, 62.5, 112]],
  ['Guide left', [-122, -56, 37], [91, -30, 63]],
  ['Guide right', [-122, 30, 37], [91, 56, 63]],
  ['Bush left', [-67, -58, 35], [-6, -28, 65]],
  ['Bush right', [-67, 28, 35], [-6, 58, 65]],
  ['Spindle', [-116, -17, 33], [117, 17, 67]],
  ['Drive nut', [-71, -26, 24], [-18, 26, 76]],
  ['Rear thrust washer', [58, -17, 33], [61, 17, 67]],
  ['Front thrust washer', [97, -17, 33], [100, 17, 67]],
  ['Handle hub', [100, -16, 34], [134, 16, 66]],
  ['Hub pin', [110.99, -16, 47.99], [115.01, 16, 52.01]],
  ['Tommy bar', [114, -106, 40], [134, 106, 60]],
  ['Fixed jaw screw left', [-18, -40, 92], [-0.2, -30, 102]],
  ['Fixed jaw screw right', [-18, 30, 92], [-0.2, 40, 102]],
  ['Moving jaw screw left', [55.2, -40, 92], [73, -30, 102]],
  ['Moving jaw screw right', [55.2, 30, 92], [73, 40, 102]],
  ['Nut screw lower', [-77, -5, 24], [-53, 5, 34]],
  ['Nut screw upper', [-77, -5, 66], [-53, 5, 76]],
] as const;

const cache = new Map<string, ReturnType<typeof loadModel>>();
async function model(
  parameters?: Record<string, unknown>,
  format: 'step' | 'glb' = 'step',
) {
  const key = JSON.stringify([parameters, format]);
  if (!cache.has(key)) {
    cache.set(
      key,
      loadModel({
        file: 'main.ts',
        format,
        ...(parameters ? { parameters } : {}),
      }),
    );
  }
  return cache.get(key)!;
}

describe('BV-125 SysML geometry verification', () => {
  it('R01 named 21-part product structure', async () => {
    expectGeo(await model()).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: components.map(([name]) => ({ name, count: 1 })),
    });
    expectGeo(await model()).toHaveTopologyCounts({ solids: 21 });
    expectGeo(await model()).toHaveStepUnits({ unit: 'mm' });
    // One assembled spatial cluster; this does not claim that the 21 parts fuse.
    expectGeo(await model()).toHaveConnectedComponents({
      count: 1,
      toleranceMm: 0.01,
    });
  });

  for (const [name, min, max] of components) {
    it(`R10 ${name}: valid single closed solid`, async () => {
      const part = await model({ component: name });
      expectGeo(part).toBeValidBrep();
      expectGeo(part).toHaveTopologyCounts({ solids: 1 });
      expectGeo(part).toBeWatertight();
      expectGeo(part).toHaveConnectedComponents({ count: 1 });
      expectGeo(part).toHaveVolume({
        value: { greaterThan: 100, lessThan: 1_500_000 },
      });
      if (name === 'Tommy bar') {
        expectGeo(part).toHaveCylindricalFace({
          radius: 6,
          axis: 'y',
          tolerance: 0.01,
        });
        expectGeo(part).toHaveCylindricalFace({
          radius: 10,
          axis: 'y',
          tolerance: 0.01,
        });
      }
    });
    it(`R01 ${name}: component envelope and position`, async () => {
      // OCCT's BRep bounds conservatively pad the long helical B-spline.
      // Measure the rendered spindle envelope; its validity/topology stay exact.
      expectGeo(
        await model({ component: name }, name === 'Spindle' ? 'glb' : 'step'),
      ).toHaveBoundingBox({ min: [...min], max: [...max], tolerance: 0.025 });
    });
  }

  for (const x of [-72, 35]) {
    for (const y of [-70, 70]) {
      it(`R02 mounting through hole ${x},${y}`, async () => {
        const frame = await model({ component: 'Frame' });
        // The hole classifier compares against the whole 112 mm frame height.
        // Prove passage across the local 16 mm foot with bounded void evidence.
        expectGeo(frame).toHaveCircularHole({
          diameter: 11,
          axis: 'z',
          center: { x, y },
          tolerance: 0.01,
        });
        expectGeo(frame).toHaveCircularHole({
          diameter: 20,
          axis: 'z',
          center: { x, y },
          tolerance: 0.01,
        });
        expectGeo(frame).toHavePlanarFace({
          normal: [0, 0, 1],
          offset: 5,
          area: { greaterThan: 200 },
          tolerance: 0.01,
        });
        expectGeo(frame).toHaveVoidContinuity({
          path: [
            [x, y, -1],
            [x, y, 8],
            [x, y, 17],
          ],
          material: ['Frame'],
          bounds: { min: [x - 6, y - 6, -2], max: [x + 6, y + 6, 18] },
          minCrossSection: 70,
        });
      });
    }
  }
  it('R02 flat bench interface', async () => {
    expectGeo(await model({ component: 'Frame' })).toHavePlanarFace({
      normal: [0, 0, -1],
      offset: 0,
      area: { greaterThan: 24_000 },
      tolerance: 0.01,
    });
    expectGeo(await model({ component: 'Frame' })).toHaveCylindricalFace({
      radius: 12,
      axis: 'z',
      tolerance: 0.01,
    });
  });

  for (const side of ['Fixed', 'Moving']) {
    it(`R03 ${side} jaw has serrations and recessed fastener bores`, async () => {
      const jaw = await model({ component: `${side} jaw` });
      expectGeo(jaw).toHaveCircularHole({
        diameter: 6.4,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(jaw).toHaveCylindricalFace({
        radius: 5.5,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(jaw).toHaveTopologyCounts({ faces: { greaterThan: 65 } });
      expectGeo(jaw).toHaveVolume({
        value: { greaterThan: 20_000, lessThan: 22_000 },
      });
    });
  }
  for (const side of ['left', 'right']) {
    it(`R05 ${side} bronze bushing has running bore and flange`, async () => {
      const bush = await model({ component: `Bush ${side}` });
      expectGeo(bush).toHaveCircularHole({
        diameter: 20.2,
        through: true,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(bush).toHaveCylindricalFace({
        radius: 13,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(bush).toHaveCylindricalFace({
        radius: 15,
        axis: 'x',
        tolerance: 0.01,
      });
    });
    it(`R05 ${side} guide is ground diameter 20 with diameter 26 stop`, async () => {
      const guide = await model({ component: `Guide ${side}` });
      expectGeo(guide).toHaveCylindricalFace({
        radius: 10,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(guide).toHaveCylindricalFace({
        radius: 13,
        axis: 'x',
        tolerance: 0.01,
      });
    });
  }
  it('R06 spindle includes material beyond its cylindrical root', async () => {
    // Independent root + 62 mm neck + shoulder calculation. The helical
    // ridge must add 8–11 cm³ net, including the cross-drilled pin hole.
    const turnedBlank =
      Math.PI * (8 ** 2 * 171 + 10 ** 2 * 62 + (17 ** 2 - 10 ** 2) * 3);
    expectGeo(await model({ component: 'Spindle' })).toHaveVolume({
      value: {
        greaterThan: turnedBlank + 8000,
        lessThan: turnedBlank + 11_000,
      },
    });
    expectGeo(await model({ component: 'Spindle' })).toHaveTopologyCounts({
      faces: { greaterThan: 12 },
    });
  });

  it('R06 spindle remains a valid solid at an 80mm jaw opening', async () => {
    expectGeo(await model({ component: 'Spindle', opening: 80 })).toBeValidBrep(
      { maxTolerance: 0.01 },
    );
  });
  it('R06 threaded bronze nut has flange attachment holes', async () => {
    const nut = await model({ component: 'Drive nut' });
    expectGeo(nut).toHaveCircularHole({
      diameter: 6.4,
      axis: 'x',
      center: { y: 0, z: 29 },
      tolerance: 0.01,
    });
    expectGeo(nut).toHaveCircularHole({
      diameter: 6.4,
      axis: 'x',
      center: { y: 0, z: 71 },
      tolerance: 0.01,
    });
    expectGeo(nut).toHaveVolume({
      value: { greaterThan: 29_000, lessThan: 34_000 },
    });
    expectGeo(nut).toHaveTopologyCounts({ faces: { greaterThan: 12 } });
  });
  for (const name of ['Rear thrust washer', 'Front thrust washer']) {
    it(`R07 ${name} exact annular volume and bore`, async () => {
      const washer = await model({ component: name });
      expectGeo(washer).toHaveVolume({
        value: Math.PI * (17 ** 2 - 10.3 ** 2) * 3,
        tolerance: 0.01,
      });
      expectGeo(washer).toHaveCircularHole({
        diameter: 20.6,
        through: true,
        axis: 'x',
        tolerance: 0.01,
      });
    });
  }
  it('R07 R08 hub has spindle socket, cross pin and sliding bar bores', async () => {
    const hub = await model({ component: 'Handle hub' });
    for (const [radius, axis] of [
      [10.1, 'x'],
      [2, 'y'],
      [6.15, 'y'],
    ] as const) {
      expectGeo(hub).toHaveCylindricalFace({ radius, axis, tolerance: 0.01 });
    }
  });
  for (const name of components
    .map((c) => c[0])
    .filter((n) => n.includes('screw'))) {
    it(`R09 ${name} socket head and shaft`, async () => {
      const screw = await model({ component: name });
      expectGeo(screw).toHaveCylindricalFace({
        radius: 3,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(screw).toHaveCylindricalFace({
        radius: 5,
        axis: 'x',
        tolerance: 0.01,
      });
      expectGeo(screw).toHaveTopologyCounts({
        faces: { greaterThanOrEqual: 10 },
      });
    });
  }

  for (const opening of [0, 25, 55, 100]) {
    it(`R04 R11 opening ${opening}: fit, jaw positions and travel`, async () => {
      const assembly = await model({ opening });
      expectGeo(assembly).toHaveAssemblyOccurrences({
        occurrences: [
          {
            name: 'Fixed jaw',
            bounds: { min: { x: -6 }, max: { x: 0 }, tolerance: 0.01 },
          },
          {
            name: 'Moving jaw',
            bounds: {
              min: { x: opening },
              max: { x: opening + 6 },
              tolerance: 0.01,
            },
          },
          {
            name: 'Guide left',
            bounds: {
              min: { x: opening - 177 },
              max: { x: opening + 36 },
              tolerance: 0.01,
            },
          },
        ],
      });
      expectGeo(assembly).toHaveNoComponentInterference({
        tolerance: 0.01,
        allowances: [
          ...['Guide left', 'Guide right'].map(
            (left): GeoSpecComponentInterferenceAllowance => ({
              kind: 'intentionalInterference',
              left,
              right: 'Carriage',
              maxVolume: 40,
              reason: 'R05: 0.02 mm radial press fit over 30 mm socket.',
            }),
          ),
          {
            kind: 'intentionalInterference',
            left: 'Hub pin',
            right: 'Handle hub',
            maxVolume: 2,
            reason:
              'R07: 4.02 mm retention pin pressed into the 4.00 mm hub hole.',
          },
        ],
      });
    });
  }
  for (const jawWidth of [100, 150]) {
    it(`R12 jaw width ${jawWidth}`, async () => {
      expectGeo(
        await model({ component: 'Moving jaw', jawWidth }),
      ).toHaveBoundingBox({
        size: { x: 6, y: jawWidth, z: 30 },
        tolerance: 0.01,
      });
    });
  }
  for (const guideClearance of [0.05, 0.25]) {
    it(`R12 running clearance ${guideClearance}`, async () => {
      expectGeo(
        await model({ component: 'Bush left', guideClearance }),
      ).toHaveCircularHole({
        diameter: 20 + 2 * guideClearance,
        through: true,
        axis: 'x',
        tolerance: 0.01,
      });
    });
  }
  for (const handleOffset of [-60, 60]) {
    it(`R08 R12 captive handle offset ${handleOffset}`, async () => {
      expectGeo(
        await model({ component: 'Tommy bar', handleOffset }),
      ).toHaveBoundingBox({
        min: { y: handleOffset - 106, z: 40 },
        max: { y: handleOffset + 106, z: 60 },
        tolerance: 0.025,
      });
      expectGeo(await model({ handleOffset })).toHaveNoComponentInterference({
        pairs: [
          { left: 'Tommy bar', right: 'Handle hub' },
          { left: 'Tommy bar', right: 'Frame' },
        ],
        tolerance: 0.01,
      });
    });
  }
  for (const opening of [0.5, 1, 1.5, 2]) {
    it(`R08 rotating handle clears the frame at opening ${opening}`, async () => {
      const assembly = await model({ opening });
      expectGeo(assembly).toHaveAssemblyOccurrences({
        occurrences: [
          {
            name: 'Tommy bar',
            bounds: {
              min: { x: opening + 59 },
              max: { x: opening + 79 },
              tolerance: 0.025,
            },
          },
          { name: 'Frame', bounds: { max: { x: 55 }, tolerance: 0.01 } },
        ],
      });
      expectGeo(assembly).toHaveNoComponentInterference({
        pairs: [
          { left: 'Tommy bar', right: 'Frame' },
          { left: 'Tommy bar', right: 'Spindle' },
          { left: 'Tommy bar', right: 'Handle hub' },
        ],
        tolerance: 0.01,
      });
    });
  }
  it('R04 guide shoulders contact the bush flanges at full travel', async () => {
    expectGeo(await model({ opening: 100 })).toHaveSpatialRelationships({
      relationships: [
        {
          kind: 'contact',
          subject: { kind: 'occurrence', name: 'Guide left' },
          target: { kind: 'occurrence', name: 'Bush left' },
          tolerance: 0.01,
        },
        {
          kind: 'contact',
          subject: { kind: 'occurrence', name: 'Guide right' },
          target: { kind: 'occurrence', name: 'Bush right' },
          tolerance: 0.01,
        },
      ],
    });
  });
  for (const parameters of [
    { opening: -1 },
    { opening: 101 },
    { opening: '55' },
    { opening: Number.NaN },
    { jawWidth: 99 },
    { jawWidth: 151 },
    { guideClearance: 0.04 },
    { guideClearance: 0.26 },
    { handleOffset: -61 },
    { handleOffset: 61 },
    { component: 'Missing part' },
  ]) {
    it(`R12 rejects invalid input ${JSON.stringify(parameters)}`, async () => {
      let message = '';
      try {
        await loadModel({ file: 'main.ts', parameters });
      } catch (error) {
        message = String(error);
      }
      if (!/must be finite|Unknown component|INVALID_SCHEMA/.test(message)) {
        throw new Error(
          `Expected parameter validation error, received: ${message || 'successful geometry'}`,
        );
      }
    });
  }
});
