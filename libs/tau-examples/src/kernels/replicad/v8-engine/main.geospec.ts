import {
  describe,
  it,
  expectGeo,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';
import {
  buildMechanism,
  compressionHeight,
  crankPin,
  cylinders,
  firingOrder,
  lobe,
  maxLift,
  pistonState,
  rodLength,
  rotateX,
  toLocal,
  toWorld,
  valveFace,
  valves,
  valveState,
  wrap360,
  followerAxisWorld,
  camHeight,
  lifterLength,
  type Vec3,
} from './layout.js';

// Pure invariants report through a thrown error; geometry goes through expectGeo.
const check = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};
const angles = Array.from({ length: 721 }, (_, index) => index);
const round = (value: number) => Math.round(value * 1000) / 1000;
const along = (origin: Vec3, axis: Vec3, distance: number): Vec3 => [
  origin[0] + axis[0] * distance,
  origin[1] + axis[1] * distance,
  origin[2] + axis[2] * distance,
];
const point = ([x, y, z]: Vec3) => ({ x: round(x), y: round(y), z: round(z) });

// Components whose world pose is predicted by the layout kinematics at a crank angle:
// wrist pins (point-symmetric about the wrist) and lifters (point-symmetric about their middle).
const predicted = (crankAngle: number) => [
  ...cylinders.map((cylinder) => ({
    name: `Wrist pin ${cylinder.number}`,
    bounds: {
      center: point(
        toWorld(cylinder.bank, [
          cylinder.localX,
          0,
          pistonState(cylinder, crankAngle).pistonS,
        ]),
      ),
      tolerance: 0.05,
    },
  })),
  ...valves.map((valve) => ({
    name: `${valve.kind === 'intake' ? 'Intake' : 'Exhaust'} lifter ${valve.cylinder.number}`,
    bounds: {
      center: point(
        along(
          [valve.x, 0, camHeight],
          followerAxisWorld(valve.cylinder.bank),
          lobe.baseRadius +
            valveState(valve, crankAngle).lift +
            lifterLength / 2,
        ),
      ),
      tolerance: 0.05,
    },
  })),
];

// Touching faces overlap by tessellation chords only; each allowance names why the faces touch.
const allowances: GeoSpecComponentInterferenceAllowance[] = [
  {
    kind: 'intentionalInterference',
    left: /Block|Head gasket|Cylinder head|Valve cover/,
    right:
      /Head gasket|Cylinder head|Valve cover|Exhaust manifold|Valve springs|Rocker studs|Spark plugs|Intake manifold/,
    maxVolume: 0.5,
    reason: 'Clamped and seated joints on coincident nominal faces.',
  },
  {
    kind: 'intentionalInterference',
    left: /^Crankshaft/,
    right: /Crank sprocket|Harmonic balancer|Flywheel/,
    maxVolume: 2,
    reason:
      'Hubs pressed on the snout and bolted to the flange (line-to-line fits).',
  },
  {
    kind: 'intentionalInterference',
    left: /lifter/,
    right: /pushrod/,
    maxVolume: 0.01,
    reason: 'Each pushrod is seated in its lifter.',
  },
];

const staticNames = [
  'Block',
  'Oil pan',
  'Timing chain',
  'Timing cover',
  'Intake manifold',
  'Carburettor',
  'Air cleaner',
  ...[1, 2, 3, 4, 5].map((index) => `Main cap ${index}`),
  ...['left', 'right'].flatMap((bank) =>
    [
      'Head gasket',
      'Cylinder head',
      'Valve cover',
      'Exhaust manifold',
      'Valve springs',
      'Rocker studs',
      'Spark plugs',
    ].map((name) => `${name} ${bank}`),
  ),
];
const movingNames = [
  'Crankshaft',
  'Crank sprocket',
  'Harmonic balancer',
  'Flywheel',
  'Camshaft',
  'Cam sprocket',
  ...cylinders.flatMap(({ number }) => [
    `Piston ${number}`,
    `Wrist pin ${number}`,
    `Connecting rod ${number}`,
  ]),
  ...valves.flatMap(({ kind, cylinder }) =>
    ['lifter', 'pushrod', 'rocker', 'valve'].map(
      (part) =>
        `${kind === 'intake' ? 'Intake' : 'Exhaust'} ${part} ${cylinder.number}`,
    ),
  ),
];

describe('V8 crank train and valvetrain kinematics', () => {
  it('fires 1-8-4-3-6-5-7-2 at 90° intervals, each at its own piston TDC', () => {
    for (const cylinder of cylinders) {
      let top = 0;
      for (const angle of angles) {
        if (
          pistonState(cylinder, angle).pistonS >
          pistonState(cylinder, top).pistonS
        ) {
          top = angle;
        }
      }
      check(
        wrap360(top - cylinder.firing) % 360 === 0,
        `cylinder ${cylinder.number} tops out at ${top}°, fires at ${cylinder.firing}°`,
      );
    }
    const order = [...cylinders]
      .sort((a, b) => a.firing - b.firing)
      .map(({ number }) => number);
    check(
      order.join('-') === firingOrder.join('-'),
      `firing order ${order.join('-')}`,
    );
  });

  it('keeps every rod exactly rod length between wrist pin and crank pin', () => {
    for (const cylinder of cylinders) {
      for (const angle of angles) {
        const { pistonS, rodAngle } = pistonState(cylinder, angle);
        const bigEnd = rotateX([0, 0, -rodLength], rodAngle);
        const [, t, s] = toLocal(
          cylinder.bank,
          crankPin(cylinder.throwIndex, angle),
        );
        const miss = Math.hypot(bigEnd[1] - t, pistonS + bigEnd[2] - s);
        check(
          miss < 1e-9,
          `rod ${cylinder.number} misses its pin by ${miss} at ${angle}°`,
        );
      }
    }
  });

  it('opens each valve once per cycle and never lets it reach its piston', () => {
    for (const valve of valves) {
      let minimumGap = Infinity;
      let openings = 0;
      let wasOpen = valveState(valve, 0).lift > 0;
      for (const angle of angles) {
        const { lift, opening } = valveState(valve, angle);
        check(lift >= 0 && lift <= maxLift + 1e-9, `lift ${lift} out of range`);
        const crown =
          pistonState(valve.cylinder, angle).pistonS + compressionHeight;
        minimumGap = Math.min(minimumGap, valveFace - opening - crown);
        if (lift > 0 && !wasOpen) {
          openings++;
        }
        wasOpen = lift > 0;
      }
      check(
        openings <= 1,
        `${valve.kind} ${valve.cylinder.number} opens ${openings} times`,
      );
      check(
        minimumGap > 2,
        `${valve.kind} ${valve.cylinder.number} comes within ${minimumGap} mm of its piston`,
      );
    }
  });

  it('samples every curve coupling densely enough to track the exact motion', () => {
    const crankAngle = 37;
    const mechanism = buildMechanism(crankAngle, ['Block']);
    check(
      Object.keys(mechanism.joints).length === 2 + 8 * 2 + 16 * 3,
      'joint count',
    );
    check(mechanism.couplings.length === 1 + 8 * 2 + 16 * 3, 'coupling count');
    const interpolate = (
      values: readonly number[],
      driverPeriod: number,
      driver: number,
    ) => {
      const position =
        ((((driver % driverPeriod) + driverPeriod) % driverPeriod) *
          values.length) /
        driverPeriod;
      const index = Math.floor(position) % values.length;
      const next = values[(index + 1) % values.length]!;
      return (
        values[index]! +
        (next - values[index]!) * (position - Math.floor(position))
      );
    };
    const curve = (follower: string) => {
      const coupling = mechanism.couplings.find(
        (entry) => entry.follower === follower,
      );
      if (coupling === undefined || !('curve' in coupling)) {
        throw new Error(`${follower} has no curve coupling`);
      }
      return coupling.curve;
    };
    for (const cylinder of cylinders) {
      const travel = curve(`piston-${cylinder.number}`);
      check(travel.values[0] === 0, 'as-built piston offset is zero');
      for (let driver = 1; driver < 360; driver += 7.3) {
        const exact =
          pistonState(cylinder, crankAngle + driver).pistonS -
          pistonState(cylinder, crankAngle).pistonS;
        const error = Math.abs(
          interpolate(travel.values, travel.driverPeriod, driver) - exact,
        );
        check(
          error < 0.02,
          `piston ${cylinder.number} interpolation error ${error} mm at +${driver}°`,
        );
      }
    }
    for (const valve of valves) {
      const id = `${valve.kind}-${valve.cylinder.number}`;
      const open = curve(`valve-${id}`);
      for (let driver = 1; driver < 720; driver += 7.3) {
        const exact =
          valveState(valve, crankAngle).opening -
          valveState(valve, crankAngle + driver).opening;
        const error = Math.abs(
          interpolate(open.values, open.driverPeriod, driver) - exact,
        );
        check(
          error < 0.1,
          `valve ${id} interpolation error ${error} mm at +${driver}°`,
        );
      }
    }
  });
});

describe('V8 engine assembly', () => {
  it('has the dressed-engine envelope and every named component once', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoDiagnostics();
    expectGeo(model).toBeWatertight();
    // Balancer nose to flywheel face, valve-cover outboard crown radii (r12 about local t 50,
    // s 378), flywheel rim to air cleaner.
    const coverCorner = (50 + 378) * Math.SQRT1_2 + 12;
    expectGeo(model).toHaveBoundingBox({
      min: { x: -320, y: -coverCorner, z: -150 },
      max: { x: 278, y: coverCorner, z: 400 },
      tolerance: 0.1,
    });
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [...staticNames, ...movingNames].map((name) => ({
        name,
        count: 1,
      })),
    });
  });

  // Intake lobes peak at 63° (mod 90) and exhaust lobes at 23° (mod 90): 63° and 293° put an
  // intake and an exhaust rocker at full lift, the tightest pushrod and valve-tip pose.
  for (const crankAngle of [0, 63, 135, 293, 455, 610]) {
    it(`runs clear of itself with parts where the kinematics put them at ${crankAngle}°`, async () => {
      const model = await loadModel({
        file: 'main.ts',
        parameters: { crankAngle },
      });
      expectGeo(model).toHaveAssemblyOccurrences({
        occurrences: predicted(crankAngle),
      });
      expectGeo(model).toHaveNoComponentInterference({
        tolerance: 0.05,
        allowances,
      });
    });
  }
});

describe('V8 engine parts', () => {
  const part = async (component: string, format?: 'step') =>
    loadModel({
      file: 'main.ts',
      parameters: { component },
      ...(format && { format }),
    });

  it('bores the block for the crank, cam, eight cylinders and sixteen lifters', async () => {
    expectGeo(await part('block')).toBeWatertight();
    const block = await part('block', 'step');
    expectGeo(block).toBeValidBrep();
    expectGeo(block).toHaveConnectedComponents({ count: 1 });
    // The cam tunnel runs the full length; the main saddles are half bores the caps complete.
    expectGeo(block).toHaveCircularHole({
      diameter: 54,
      through: true,
      axis: 'x',
      center: { y: 0 },
      tolerance: 0.02,
    });
    expectGeo(block).toHaveCylindricalFace({
      radius: 28.3,
      axis: 'x',
      tolerance: 0.01,
    });
    expectGeo(block).toHaveCircularHole({ diameter: 100, tolerance: 0.02 });
    expectGeo(block).toHaveCircularHole({ diameter: 25.4, tolerance: 0.02 });
  });

  it('forges one crankshaft and grinds one camshaft', async () => {
    for (const shaft of await Promise.all([
      part('crankshaft', 'step'),
      part('camshaft', 'step'),
    ])) {
      expectGeo(shaft).toBeValidBrep();
      expectGeo(shaft).toHaveConnectedComponents({ count: 1 });
    }
  });

  it('bores the piston for its wrist pin and the rod at both ends', async () => {
    const piston = await part('piston', 'step');
    expectGeo(piston).toBeValidBrep();
    // The pin bore runs through both bosses and opens into the skirt cavity between them.
    expectGeo(piston).toHaveCircularHole({
      diameter: 24.1,
      axis: 'x',
      center: { y: 0, z: 0 },
      tolerance: 0.05,
    });
    const rod = await part('rod', 'step');
    expectGeo(rod).toBeValidBrep();
    // Each rod eye is two half-cylinder faces; the detector centres a hole on its face, so only y is fixed.
    expectGeo(rod).toHaveCircularHole({
      diameter: 24.2,
      through: true,
      axis: 'x',
      center: { y: 0 },
      tolerance: 0.02,
    });
    expectGeo(rod).toHaveCircularHole({
      diameter: 52.4,
      through: true,
      axis: 'x',
      center: { y: 0 },
      tolerance: 0.02,
    });
  });

  it('guides every valve stem through the head', async () => {
    const head = await part('head', 'step');
    expectGeo(head).toBeValidBrep();
    expectGeo(head).toHaveConnectedComponents({ count: 1 });
    for (const valve of valves.filter(
      ({ cylinder }) => cylinder.bank === 'right',
    )) {
      expectGeo(head).toHaveCircularHole({
        // Guides open into the combustion chamber, so they are not through the head's envelope.
        diameter: 9.2,
        axis: 'z',
        center: { x: valve.localX, y: 4 },
        tolerance: 0.02,
      });
    }
  });
});
