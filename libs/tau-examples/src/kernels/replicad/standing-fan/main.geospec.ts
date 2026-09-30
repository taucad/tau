import {
  describe,
  expectGeo,
  it,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';

const component = async (part: string, parameters = {}) =>
  loadModel({ file: 'main.ts', parameters: { part, ...parameters } });
const exact = async (part: string) =>
  loadModel({ file: 'main.ts', format: 'step', parameters: { part } });
const meshPair = (left: string, right: string) => ({
  left: `${left}#0`,
  right: `${right}#0`,
});

const parts = [
  'base',
  'feet',
  'socket',
  'outer-tube',
  'inner-tube',
  'height-collar',
  'height-knob',
  'neck',
  'tilt-knob',
  'motor-shell',
  'motor-core',
  'shaft',
  'oscillation-knob',
  'front-guard',
  'rear-guard',
  'guard-band',
  'guard-clips',
  'blades',
  'hub',
  'badge',
  'badge-mark',
  'control-body',
  'buttons',
  'control-marks',
  'power-cord',
  'plug',
  'motor-screws',
];

describe('Standing fan — complete assembly', () => {
  it('has a 444 mm head, floor contact and a 1342 mm overall height', async () => {
    expectGeo(await loadModel({ file: 'main.ts' })).toHaveBoundingBox({
      min: { x: -222, z: 0 },
      max: { x: 222, z: 1342 },
      tolerance: 0.6,
    });
  });

  it('contains every named component and the five blades', async () => {
    expectGeo(await loadModel({ file: 'main.ts' })).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        ...parts
          .filter(
            (part) =>
              ![
                'feet',
                'blades',
                'guard-clips',
                'buttons',
                'control-marks',
                'motor-screws',
              ].includes(part),
          )
          .map((name) => ({ name, count: 1 })),
        ...Array.from({ length: 5 }, (_, index) => ({
          name: `blade-${index + 1}`,
          count: 1,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `foot-${index + 1}`,
          count: 1,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `button-${index + 1}`,
          count: 1,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `control-mark-${index + 1}`,
          count: 1,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `guard-clip-${index + 1}`,
          count: 1,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `motor-screw-${index + 1}`,
          count: 1,
        })),
      ],
    });
  });

  it('has watertight geometry throughout the assembly', async () => {
    expectGeo(await loadModel({ file: 'main.ts' })).toBeWatertight();
  });

  it('keeps the rotor clear of both guards, the motor and the shaft', async () => {
    expectGeo(
      await loadModel({ file: 'main.ts' }),
    ).toHaveNoComponentInterference({
      tolerance: 0.05,
      pairs: Array.from(
        { length: 5 },
        (_, index) => `blade-${index + 1}`,
      ).flatMap((left) =>
        ['front-guard', 'rear-guard', 'guard-band', 'motor-shell', 'shaft'].map(
          (right) => meshPair(left, right),
        ),
      ),
    });
  });

  it('keeps adjacent blades and telescoping tubes separate', async () => {
    expectGeo(
      await loadModel({ file: 'main.ts' }),
    ).toHaveNoComponentInterference({
      tolerance: 0.05,
      pairs: [
        meshPair('outer-tube', 'inner-tube'),
        meshPair('socket', 'outer-tube'),
        meshPair('motor-core', 'motor-shell'),
        meshPair('hub', 'shaft'),
        ...Array.from({ length: 5 }, (_, index) =>
          meshPair(`blade-${index + 1}`, `blade-${((index + 1) % 5) + 1}`),
        ),
      ],
    });
  });

  it('has no undeclared component interference anywhere in the assembly', async () => {
    expectGeo(
      await loadModel({ file: 'main.ts' }),
    ).toHaveNoComponentInterference({
      tolerance: 0.05,
      allowances: [
        ...Array.from(
          { length: 5 },
          (_, index): GeoSpecComponentInterferenceAllowance => ({
            kind: 'intentionalInterference',
            ...meshPair(`blade-${index + 1}`, 'hub'),
            maxVolume: 1050,
            reason: 'Blade roots are embedded in the molded hub.',
          }),
        ),
        {
          kind: 'intentionalInterference',
          ...meshPair('front-guard', 'badge'),
          maxVolume: 1200,
          reason: 'Badge overmolds the central guard ring.',
        },
        {
          kind: 'intentionalInterference',
          ...meshPair('power-cord', 'plug'),
          maxVolume: 60,
          reason: 'Cable terminates inside the molded plug.',
        },
      ],
    });
  });

  it('clears a complete rotor revolution inside both guards', async () => {
    const clearance = await loadModel({
      file: 'main.ts',
      format: 'step',
      parameters: { part: 'rotation-clearance' },
    });
    expectGeo(clearance).toHaveAssemblyOccurrences({
      occurrences: [{ name: 'rotor-envelope', count: 1 }],
    });
    const clipped = await exact('enclosed-blades');
    expectGeo(clipped).toHaveTopologyCounts({ solids: 5 });
    expectGeo(clipped).toHaveVolume({ value: 178_407.75, tolerance: 0.1 });
    expectGeo(await exact('blades')).toHaveVolume({
      value: 178_407.75,
      tolerance: 0.1,
    });
    expectGeo(clearance).toHaveNoComponentInterference({
      tolerance: 0.05,
      pairs: ['front-guard', 'rear-guard', 'guard-band'].map((right) => ({
        left: 'rotor-envelope',
        right,
      })),
    });
    expectGeo(clearance).toHaveSpatialRelationships({
      relationships: ['front-guard', 'rear-guard', 'guard-band'].map(
        (path) => ({
          kind: 'clearance',
          subject: { kind: 'occurrence', path: 'rotor-envelope' },
          target: { kind: 'occurrence', path },
          min: 0.2,
        }),
      ),
    });
  });
});

describe('Standing fan — individual components', () => {
  for (const part of parts) {
    it(`${part} consists of closed manifold solids`, async () => {
      expectGeo(await component(part)).toBeWatertight();
    });
  }

  for (const [part, count] of [
    ['base', 1],
    ['feet', 4],
    ['socket', 1],
    ['outer-tube', 1],
    ['inner-tube', 1],
    ['height-collar', 1],
    ['height-knob', 1],
    ['neck', 1],
    ['tilt-knob', 1],
    ['motor-shell', 1],
    ['motor-core', 1],
    ['shaft', 1],
    ['oscillation-knob', 1],
    ['front-guard', 1],
    ['rear-guard', 1],
    ['guard-band', 1],
    ['guard-clips', 4],
    ['hub', 1],
    ['badge', 1],
    ['buttons', 4],
    ['motor-screws', 4],
    ['power-cord', 1],
    ['plug', 1],
  ] as const) {
    it(`${part} has ${count} spatially separate component(s)`, async () => {
      expectGeo(await component(part)).toHaveConnectedComponents({
        count,
        tolerance: 0.05,
      });
    });
  }

  for (const [part, size, center] of [
    ['base', { x: 390, y: 390, z: 30 }, { x: 0, y: 0, z: 21 }],
    ['socket', { x: 70, y: 70, z: 64 }, { x: 0, y: 70, z: 68 }],
    ['outer-tube', { x: 32, y: 32, z: 645 }, { x: 0, y: 70, z: 387.5 }],
    ['inner-tube', { x: 24, y: 24, z: 590 }, { x: 0, y: 70, z: 715 }],
    ['height-collar', { x: 44, y: 44, z: 38 }, { x: 0, y: 70, z: 719 }],
    ['motor-shell', { x: 116, y: 100, z: 116 }, { x: 0, y: 35, z: 1120 }],
    ['motor-core', { x: 62, y: 48, z: 62 }, { x: 0, y: 28, z: 1120 }],
    ['shaft', { x: 10, y: 90, z: 10 }, { x: 0, y: -40, z: 1120 }],
    ['guard-band', { x: 440, y: 6, z: 440 }, { x: 0, y: -60, z: 1120 }],
    ['badge', { x: 64, y: 4, z: 64 }, { x: 0, y: -126, z: 1120 }],
  ] as const) {
    it(`${part} has its specified dimensions and position`, async () => {
      expectGeo(await component(part)).toHaveBoundingBox({
        size,
        center,
        tolerance: 0.35,
      });
    });
  }

  it('sets the blade root at 25 mm and its radial height at 173 mm', async () => {
    expectGeo(await component('blade-1')).toHaveBoundingBox({
      min: { z: 1145 },
      max: { z: 1318 },
      tolerance: 0.2,
    });
  });

  it('has five separate exact blade solids with clearance between neighbors', async () => {
    const rotor = await exact('blades');
    expectGeo(rotor).toHaveTopologyCounts({ solids: 5 });
    expectGeo(rotor).toHaveSpatialRelationships({
      relationships: Array.from({ length: 5 }, (_, index) => ({
        kind: 'clearance',
        subject: { kind: 'occurrence', path: `blade-${index + 1}` },
        target: { kind: 'occurrence', path: `blade-${((index + 1) % 5) + 1}` },
        min: 0.2,
      })),
    });
  });

  it('has a substantial weighted base', async () => {
    expectGeo(await component('base')).toHaveVolume({
      value: { greaterThan: 3_400_000, lessThan: 3_600_000 },
    });
  });

  it('uses a genuinely hollow lower tube with a 3 mm wall', async () => {
    expectGeo(await component('outer-tube')).toHaveVolume({
      value: Math.PI * (16 ** 2 - 13 ** 2) * 645,
      tolerance: 600,
    });
  });

  it('uses a genuinely hollow upper tube with a 2 mm wall', async () => {
    expectGeo(await component('inner-tube')).toHaveVolume({
      value: Math.PI * (12 ** 2 - 10 ** 2) * 590,
      tolerance: 200,
    });
  });
});

describe('Standing fan — exact manufactured features', () => {
  for (const part of [
    'base',
    'socket',
    'outer-tube',
    'inner-tube',
    'motor-shell',
    'hub',
    'front-guard',
    'rear-guard',
  ]) {
    it(`${part} is a valid BRep solid`, async () => {
      expectGeo(await exact(part)).toBeValidBrep();
      expectGeo(await exact(part)).toHaveTopologyCounts({ solids: 1 });
    });
  }

  for (const [part, diameter, axis] of [
    ['socket', 32.6, 'z'],
    ['outer-tube', 26, 'z'],
    ['inner-tube', 20, 'z'],
    ['hub', 10.4, 'y'],
  ] as const) {
    it(`${part} contains the specified through bore`, async () => {
      expectGeo(await exact(part)).toHaveCircularHole({
        diameter,
        axis,
        through: true,
        tolerance: 0.05,
      });
    });
  }

  it('has eight rear ventilation slots cut through the motor casing', async () => {
    const motor = await exact('motor-shell');
    expectGeo(motor).toHaveCylindricalFace({
      radius: 2,
      axis: 'y',
      tolerance: 0.02,
    });
    expectGeo(motor).toHaveVolume({
      value: { greaterThan: 175_000, lessThan: 195_000 },
    });
    expectGeo(motor).toHaveTopologyCounts({ faces: 40 });
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI) / 4;
      const horizontal = 35 * Math.sin(angle);
      const height = 1120 + 35 * Math.cos(angle);
      expectGeo(motor).toHaveVoidContinuity({
        path: [
          [horizontal, 79, height],
          [horizontal, 83, height],
          [horizontal, 87, height],
        ],
        minCrossSection: 6,
        bounds: { min: [-59, 78, 1061], max: [59, 88, 1179] },
      });
    }
  });

  it('has four underside mounting bores in the base', async () => {
    expectGeo(await exact('base')).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 6.4,
      boltCircleDiameter: Math.sqrt(2) * 220,
      axis: 'z',
      tolerance: 0.1,
    });
  });

  it('has clearance bores for the tilt axle and oscillation stem', async () => {
    const neck = await exact('neck');
    for (const horizontal of [-66, 66]) {
      expectGeo(neck).toHaveCircularHole({
        diameter: 10.4,
        axis: 'x',
        center: { x: horizontal, y: 35, z: 1080 },
        tolerance: 0.05,
      });
    }
    expectGeo(neck).toHaveVoidContinuity({
      path: [
        [-75, 35, 1080],
        [-66, 35, 1080],
        [0, 35, 1080],
        [66, 35, 1080],
        [75, 35, 1080],
      ],
      minCrossSection: 70,
      bounds: { min: [-76, 22, 1065], max: [76, 48, 1095] },
    });
    expectGeo(await exact('motor-shell')).toHaveCylindricalFace({
      radius: 5.2,
      axis: 'x',
      tolerance: 0.05,
    });
    expectGeo(await exact('motor-shell')).toHaveCylindricalFace({
      radius: 4.2,
      axis: 'z',
      tolerance: 0.05,
    });
  });
});

describe('Standing fan — adjustments and variants', () => {
  for (const headHeight of [1020, 1320]) {
    it(`supports a ${headHeight} mm head center with a continuous upper tube`, async () => {
      expectGeo(
        await component('inner-tube', { headHeight }),
      ).toHaveBoundingBox({
        min: { z: headHeight - 700 },
        max: { z: headHeight - 110 },
        tolerance: 0.1,
      });
      expectGeo(await component('inner-tube', { headHeight })).toBeWatertight();
      expectGeo(await component('badge', { headHeight })).toHaveBoundingBox({
        center: { z: headHeight },
        tolerance: 0.1,
      });
    });
  }

  for (const bladeCount of [3, 7]) {
    it(`supports ${bladeCount} separate blades without blade interference`, async () => {
      const rotor = await loadModel({
        file: 'main.ts',
        format: 'step',
        parameters: { part: 'blades', bladeCount },
      });
      expectGeo(rotor).toHaveTopologyCounts({ solids: bladeCount });
      expectGeo(rotor).toBeWatertight();
      expectGeo(rotor).toHaveNoComponentInterference({ tolerance: 0.05 });
      expectGeo(rotor).toHaveSpatialRelationships({
        relationships: Array.from({ length: bladeCount }, (_, index) => ({
          kind: 'clearance',
          subject: { kind: 'occurrence', path: `blade-${index + 1}` },
          target: {
            kind: 'occurrence',
            path: `blade-${((index + 1) % bladeCount) + 1}`,
          },
          min: 0.2,
        })),
      });
    });
  }

  for (const [tilt, yaw] of [
    [-15, -45],
    [25, 45],
  ] as const) {
    it(`moves the complete head together at tilt ${tilt} and yaw ${yaw}`, async () => {
      const moved = await loadModel({
        file: 'main.ts',
        parameters: { tilt, yaw },
      });
      expectGeo(moved).toBeWatertight();
      expectGeo(moved).toHaveNoComponentInterference({
        tolerance: 0.05,
        pairs: ['front-guard', 'rear-guard', 'motor-shell'].map((right) =>
          meshPair('blade-1', right),
        ),
      });
      expectGeo(await component('base', { tilt, yaw })).toHaveBoundingBox({
        size: { x: 390, y: 390, z: 30 },
        center: { z: 21 },
        tolerance: 0.35,
      });
      const tiltRadians = (tilt * Math.PI) / 180;
      const yawRadians = (yaw * Math.PI) / 180;
      const depth =
        35 - 161 * Math.cos(tiltRadians) - 40 * Math.sin(tiltRadians);
      expectGeo(await component('badge', { tilt, yaw })).toHaveBoundingBox({
        center: {
          x: -(depth - 70) * Math.sin(yawRadians),
          y: 70 + (depth - 70) * Math.cos(yawRadians),
          z: 1080 - 161 * Math.sin(tiltRadians) + 40 * Math.cos(tiltRadians),
        },
        tolerance: 0.2,
      });
      expectGeo(moved).toHaveNoComponentInterference({
        tolerance: 0.05,
        pairs: [
          meshPair('neck', 'motor-shell'),
          meshPair('neck', 'tilt-knob'),
          meshPair('motor-shell', 'tilt-knob'),
          meshPair('rear-guard', 'inner-tube'),
        ],
      });
    });
  }
});
