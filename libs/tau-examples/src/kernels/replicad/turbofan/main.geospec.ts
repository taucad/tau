import {
  describe,
  it,
  expectGeo,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';
import {
  axialHalf,
  bladeRows,
  buildMechanism,
  coreCowl,
  doorHinge,
  doorLength,
  doorName,
  doorStowedAngle,
  doors,
  dragLinkAnchor,
  dragLinkLength,
  fan,
  lerp,
  linkName,
  radialDrive,
  radialDriveRatio,
  reverser,
  reverserState,
  ringName,
  rowSpan,
  sleeveName,
  spoolNames,
  staticNames,
  variableRows,
  vaneName,
  vanePerRing,
  vsv,
} from './layout.js';

// Pure invariants report through a thrown error; geometry goes through expectGeo.
const check = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};
const travels = Array.from(
  { length: reverser.travel + 1 },
  (_, index) => index,
);
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
    values[index]! + (next - values[index]!) * (position - Math.floor(position))
  );
};

const movingNames = [
  ...spoolNames.lp,
  ...spoolNames.hp,
  'Radial drive shaft',
  ...variableRows.flatMap((vaneRow) => [
    ringName(vaneRow),
    ...Array.from({ length: vaneRow.count }, (_, index) =>
      vaneName(vaneRow, index),
    ),
  ]),
  sleeveName('left'),
  sleeveName('right'),
  ...doors.flatMap(({ number }) => [doorName(number), linkName(number)]),
];
// Occurrence labels carry an instance suffix (`Fan case#0`).
const pattern = (names: readonly string[]) =>
  new RegExp(
    `^(${names.map((name) => name.replaceAll(/[()]/g, String.raw`\$&`)).join('|')})(#\\d+)?$`,
  );

// Every allowance names why the parts touch; moving parts against the static structure get none.
const allowances: GeoSpecComponentInterferenceAllowance[] = [
  {
    kind: 'intentionalInterference',
    left: pattern(staticNames),
    right: pattern(staticNames),
    maxVolume: 80_000,
    reason:
      'Fixed vanes and struts root into the casings that carry them; cases, frames and cowls meet at flanges.',
  },
  {
    kind: 'intentionalInterference',
    left: pattern(spoolNames.lp),
    right: pattern(spoolNames.lp),
    maxVolume: 50,
    reason:
      'The LP spool: spinner, fan disk, booster drum and LPT cone are splined and bolted line-to-line.',
  },
  {
    kind: 'intentionalInterference',
    left: pattern(spoolNames.hp),
    right: pattern(spoolNames.hp),
    maxVolume: 50,
    reason:
      'The HP spool: compressor and turbine disks seat line-to-line on the HP shaft.',
  },
  {
    kind: 'intentionalInterference',
    left: /^(Blocker door|Drag link)/,
    right: /^(Blocker door|Drag link)/,
    maxVolume: 8000,
    reason: 'Each drag-link eye is pinned in its door lug.',
  },
];

describe('Turbofan mechanism', () => {
  it('keeps every drag link rigid and swings each door steadily into the duct', () => {
    let previous = reverserState(0).door;
    for (const travel of travels) {
      const { door, lug } = reverserState(travel);
      const length = Math.hypot(
        lug[0] - dragLinkAnchor[0],
        lug[1] - dragLinkAnchor[1],
      );
      check(
        Math.abs(length - dragLinkLength) < 1e-9,
        `drag link stretches to ${length} mm at ${travel} mm`,
      );
      check(
        travel === 0 || door < previous,
        `door stops turning inward at ${travel} mm`,
      );
      previous = door;
    }
    const deployed = reverserState(reverser.travel).door - doorStowedAngle;
    check(
      deployed < -85 && deployed > -95,
      `door turns ${deployed}° at full travel`,
    );
    // The door's aft edge stays well off the core cowl when it blocks the duct.
    const angle = (reverserState(reverser.travel).door * Math.PI) / 180;
    const tip = [
      doorHinge[0] + reverser.travel + doorLength * Math.cos(angle),
      doorHinge[1] + doorLength * Math.sin(angle),
    ];
    check(
      tip[1]! - lerp(coreCowl, tip[0]!) > 50,
      `deployed door comes within ${tip[1]! - lerp(coreCowl, tip[0]!)} mm of the cowl`,
    );
  });

  it('samples each door and drag-link curve closely enough to track the exact linkage', () => {
    for (const reverserTravel of [0, 150, 400]) {
      const mechanism = buildMechanism(reverserTravel, 0);
      const curve = (follower: string) => {
        const coupling = mechanism.couplings.find(
          (entry) => entry.follower === follower,
        );
        if (coupling === undefined || !('curve' in coupling)) {
          throw new Error(`${follower} has no curve coupling`);
        }
        return coupling.curve;
      };
      const [door, link] = [curve('door-1'), curve('drag-link-1')];
      const base = reverserState(reverserTravel);
      for (
        let coordinate = -reverserTravel;
        coordinate <= reverser.travel - reverserTravel;
        coordinate += 3.7
      ) {
        const exact = reverserState(reverserTravel + coordinate);
        const doorError = Math.abs(
          interpolate(door.values, door.driverPeriod, coordinate) -
            (exact.door - base.door),
        );
        const linkError = Math.abs(
          interpolate(link.values, link.driverPeriod, coordinate) -
            (exact.link - exact.door - (base.link - base.door)),
        );
        check(
          doorError < 0.05 && linkError < 0.05,
          `curve error ${doorError}°/${linkError}° at ${reverserTravel}+${coordinate} mm`,
        );
      }
    }
  });

  it('drives the vanes from their unison rings within the vane limits', () => {
    const [igv, stage1] = variableRows as [
      (typeof variableRows)[number],
      (typeof variableRows)[number],
    ];
    const mechanism = buildMechanism(0, 0);
    const ring = mechanism.joints['hpc-igv-ring'];
    check(
      ring?.type === 'revolute' && ring.limits !== undefined,
      'the IGV ring is a limited revolute driver',
    );
    if (ring?.type !== 'revolute' || ring.limits === undefined) {
      return;
    }
    const vaneAt = (ringTurn: number) => ringTurn * vanePerRing(igv);
    const reach = [vaneAt(ring.limits.lower), vaneAt(ring.limits.upper)].sort(
      (a, b) => a - b,
    );
    check(
      Math.abs(reach[0]! - vsv.vaneLimits.lower) < 1e-9 &&
        Math.abs(reach[1]! - vsv.vaneLimits.upper) < 1e-9,
      `IGV reach ${reach.join(' to ')}`,
    );
    const bellcrank = mechanism.couplings.find(
      (coupling) => coupling.follower === 'hpc-s1-ring',
    );
    check(
      bellcrank !== undefined && 'ratio' in bellcrank,
      'the stage-1 ring follows the IGV ring',
    );
    if (bellcrank !== undefined && 'ratio' in bellcrank) {
      const share = (bellcrank.ratio * vanePerRing(stage1)) / vanePerRing(igv);
      check(
        Math.abs(share - vsv.stage1Share) < 1e-9,
        `stage-1 vanes move ${share} of the IGVs`,
      );
    }
    check(
      mechanism.couplings.length === 1 + 2 * 24 + 1 + 1 + 2 * doors.length,
      'coupling count',
    );
  });

  it('loops the Run animation seamlessly for every blade row and gear', () => {
    const run = buildMechanism(0, 0).animations.find(({ id }) => id === 'run')!;
    const end = run.keyframes.at(-1)!.coordinates as Record<string, number>;
    for (const bladeRow of bladeRows.filter(({ kind }) => kind === 'rotor')) {
      const turn = bladeRow.spool === 'lp' ? end['n1']! : end['n2']!;
      const pitches = (turn * bladeRow.count) / 360;
      check(
        Math.abs(pitches - Math.round(pitches)) < 1e-9,
        `${bladeRow.id} ends ${pitches} pitches round`,
      );
    }
    const fanPitches = (end['n1']! * fan.count) / 360;
    check(Number.isInteger(fanPitches), `fan ends ${fanPitches} pitches round`);
    const teeth =
      (end['n2']! * Math.abs(radialDriveRatio) * radialDrive.towerTeeth) / 360;
    check(
      Math.abs(teeth - Math.round(teeth)) < 1e-9,
      `radial drive ends ${teeth} teeth round`,
    );
  });

  it('keeps an axial gap between neighbouring rows, with the variable vanes at either limit', () => {
    const ordered = [...bladeRows].sort((a, b) => a.x - b.x);
    const reach = (bladeRow: (typeof bladeRows)[number]) =>
      bladeRow.kind === 'variable'
        ? Math.max(
            ...[vsv.vaneLimits.lower, 0, vsv.vaneLimits.upper].map((turn) =>
              axialHalf(bladeRow, turn),
            ),
          )
        : axialHalf(bladeRow);
    for (let index = 1; index < ordered.length; index++) {
      const [front, back] = [ordered[index - 1]!, ordered[index]!];
      const gap = back.x - reach(back) - (front.x + reach(front));
      check(gap > 4, `${front.id} → ${back.id} gap ${gap} mm`);
      check(rowSpan(back).outer > rowSpan(back).inner, `${back.id} has span`);
    }
  });
});

describe('Turbofan assembly', () => {
  it('has the nacelle envelope and every named component once', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoDiagnostics();
    expectGeo(model).toBeWatertight();
    // Inlet highlight to plug tip; the fan cowl's 962 mm radius bounds the section.
    expectGeo(model).toHaveBoundingBox({
      min: { x: -642, y: -962, z: -962 },
      max: { x: 2360, y: 962, z: 962 },
      tolerance: 0.5,
    });
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [...staticNames, ...movingNames].map((name) => ({
        name,
        count: 1,
      })),
    });
  });

  for (const [reverserTravel, vaneAngle] of [
    [0, 0],
    [200, vsv.vaneLimits.lower],
    [reverser.travel, vsv.vaneLimits.upper],
  ] as const) {
    it(`runs clear of itself with the sleeves ${reverserTravel} mm aft and the vanes at ${vaneAngle}°`, async () => {
      const model = await loadModel({
        file: 'main.ts',
        parameters: { reverserTravel, vaneAngle },
      });
      expectGeo(model).toHaveNoComponentInterference({
        tolerance: 0.05,
        allowances,
      });
    });
  }
});

describe('Turbofan parts', () => {
  const part = async (component: string) =>
    loadModel({ file: 'main.ts', parameters: { component }, format: 'step' });

  it('sews each fan blade into one valid solid', async () => {
    const blade = await part('fan-blade');
    expectGeo(blade).toBeValidBrep();
    expectGeo(blade).toHaveConnectedComponents({ count: 1 });
  });

  it('bores the core casing for every variable-vane spindle and fuel nozzle', async () => {
    const casing = await part('core-casing');
    expectGeo(casing).toBeValidBrep();
    expectGeo(casing).toHaveConnectedComponents({ count: 1 });
    expectGeo(casing).toHaveCircularHole({ diameter: 11.2, tolerance: 0.02 });
    expectGeo(casing).toHaveCircularHole({ diameter: 17, tolerance: 0.02 });
  });

  it('builds each sleeve half as one valid solid', async () => {
    const sleeve = await part('sleeve');
    expectGeo(sleeve).toBeValidBrep();
    expectGeo(sleeve).toHaveConnectedComponents({ count: 1 });
  });
});
