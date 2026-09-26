/**
 * Turbofan layout: every dimension, the flowpath, the blade-row table and all kinematics, free of
 * geometry so the GeoSpec suite can check the mechanism without building a model.
 *
 * Frame: the engine axis is +X (the direction of flow), Z is up and the fan face is at x = 0.
 * Lengths are millimetres and angles degrees. A meridional point is (x, r); azimuth θ turns about
 * +X from +Y toward +Z, so the top of the engine is θ = 90° and the left side (−Y, looking forward
 * from behind) is θ = 180°.
 */
import type { MechanismSource } from '@taucad/kinematics';

export type Vec3 = [number, number, number];
/** A meridional point (x, r). */
export type Point = [number, number];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Piecewise-linear r(x) through `points`, held constant beyond the ends. */
export const lerp = (points: readonly Point[], x: number): number => {
  if (x <= points[0]![0]) {
    return points[0]![1];
  }
  for (let index = 1; index < points.length; index++) {
    const [x1, r1] = points[index]!;
    if (x <= x1) {
      const [x0, r0] = points[index - 1]!;
      return r0 + ((r1 - r0) * (x - x0)) / (x1 - x0);
    }
  }
  return points.at(-1)![1];
};

/** Unit radial and tangential directions at azimuth θ (e_t = e_x × e_r). */
export const radial = (theta: number): Vec3 => [
  0,
  Math.cos(toRadians(theta)),
  Math.sin(toRadians(theta)),
];
export const tangential = (theta: number): Vec3 => [
  0,
  -Math.sin(toRadians(theta)),
  Math.cos(toRadians(theta)),
];
/** The world point at meridional (x, r) and azimuth θ. */
export const atAzimuth = ([x, r]: Point, theta: number): Vec3 => {
  const [, y, z] = radial(theta);
  return [x, r * y, r * z];
};
/** `count` azimuths evenly spaced from `start`. */
export const azimuths = (count: number, start = 90) =>
  Array.from({ length: count }, (_, index) => start + (index * 360) / count);

// ---------------------------------------------------------------- flowpath

/** Fan: 1560 mm tip diameter, 22 wide-chord blades, 4 mm tip clearance to the case. */
export const fan = {
  count: 22,
  x: 130,
  tipRadius: 777,
  caseRadius: 781,
  /** Hub (spinner-to-disk) surface under the blades. */
  hub: [
    [0, 262],
    [300, 300],
  ] as Point[],
  /** Radius, chord, thickness, camber height and stagger from the axis at four stations. */
  sections: [
    { r: 250, chord: 190, thickness: 18, camber: 16, stagger: 28 },
    { r: 430, chord: 235, thickness: 12, camber: 13, stagger: 44 },
    { r: 610, chord: 275, thickness: 7, camber: 9, stagger: 55 },
    { r: 777, chord: 300, thickness: 4, camber: 5, stagger: 62 },
  ],
};

/** Core flowpath: hub and tip radius of the gas path from the splitter to the core nozzle. */
export const coreHub: Point[] = [
  [330, 310],
  [620, 335],
  [640, 335],
  [770, 226],
  [1150, 256],
  [1170, 256],
];
export const coreTip: Point[] = [
  [330, 430],
  [620, 408],
  [640, 408],
  [770, 318],
  [1150, 282],
  [1170, 282],
];
export const turbineHub: Point[] = [
  [1430, 250],
  [1610, 252],
  [1630, 255],
  [1910, 278],
  [1985, 278],
];
export const turbineTip: Point[] = [
  [1430, 300],
  [1610, 322],
  [1630, 340],
  [1910, 432],
  [1985, 435],
];
/** The core casing's inner wall: compressor tip line, combustor bulge, turbine tip line. */
export const casingInner: Point[] = [
  [770, 318],
  [1150, 282],
  [1165, 282],
  [1190, 385],
  [1420, 385],
  [1440, 300],
  [1610, 322],
  [1630, 340],
  [1910, 432],
  [1985, 435],
];
export const casingWall = 8;
/** Bypass inner wall: the splitter's outer skin, then the core cowl. */
export const splitterOuter: Point[] = [
  [330, 437],
  [420, 455],
  [560, 478],
  [700, 490],
];
export const coreCowl: Point[] = [
  [700, 490],
  [900, 525],
  [1300, 548],
  [1700, 522],
  [2150, 412],
];
/** Bypass outer wall: fan case, then the reverser sleeve's inner skin. */
export const ductOuter: Point[] = [
  [-60, 781],
  [330, 781],
  [560, 790],
  [850, 805],
  [1330, 790],
  [1560, 760],
];

// ---------------------------------------------------------------- blade rows

export type Spool = 'lp' | 'hp';
export type BladeRow = Readonly<{
  id: string;
  /** A rotor turns with its spool; a stator is fixed, unless it is a variable vane row. */
  kind: 'rotor' | 'stator' | 'variable';
  spool?: Spool;
  x: number;
  chord: number;
  stagger: number;
  count: number;
  hub: readonly Point[];
  tip: readonly Point[];
}>;

const row = (
  id: string,
  kind: BladeRow['kind'],
  x: number,
  chord: number,
  count: number,
  path: 'core' | 'turbine',
  spool?: Spool,
): BladeRow => ({
  id,
  kind,
  x,
  chord,
  count,
  // Rotors and stators turn the flow in opposite senses.
  stagger: kind === 'rotor' ? 40 : -32,
  hub: path === 'core' ? coreHub : turbineHub,
  tip: path === 'core' ? coreTip : turbineTip,
  ...(spool && { spool }),
});

export const bladeRows: BladeRow[] = [
  // Three-stage booster (LP compressor) under the splitter.
  row('booster-r1', 'rotor', 385, 32, 28, 'core', 'lp'),
  row('booster-s1', 'stator', 427, 32, 30, 'core'),
  row('booster-r2', 'rotor', 469, 30, 28, 'core', 'lp'),
  row('booster-s2', 'stator', 511, 30, 30, 'core'),
  row('booster-r3', 'rotor', 553, 28, 28, 'core', 'lp'),
  row('booster-s3', 'stator', 595, 28, 30, 'core'),
  // Six-stage HP compressor: variable inlet guide vanes and stage-1 stators, fixed stators after.
  row('hpc-igv', 'variable', 790, 26, 24, 'core'),
  row('hpc-r1', 'rotor', 830, 24, 24, 'core', 'hp'),
  row('hpc-s1', 'variable', 862, 24, 24, 'core'),
  row('hpc-r2', 'rotor', 894, 22, 26, 'core', 'hp'),
  row('hpc-s2', 'stator', 926, 22, 28, 'core'),
  row('hpc-r3', 'rotor', 956, 20, 28, 'core', 'hp'),
  row('hpc-s3', 'stator', 986, 20, 30, 'core'),
  row('hpc-r4', 'rotor', 1016, 19, 30, 'core', 'hp'),
  row('hpc-s4', 'stator', 1046, 19, 32, 'core'),
  row('hpc-r5', 'rotor', 1074, 18, 32, 'core', 'hp'),
  row('hpc-s5', 'stator', 1102, 18, 34, 'core'),
  row('hpc-r6', 'rotor', 1128, 17, 34, 'core', 'hp'),
  // Two-stage HP turbine.
  row('hpt-ngv1', 'stator', 1455, 30, 22, 'turbine'),
  row('hpt-r1', 'rotor', 1500, 26, 30, 'turbine', 'hp'),
  row('hpt-ngv2', 'stator', 1545, 28, 24, 'turbine'),
  row('hpt-r2', 'rotor', 1590, 24, 32, 'turbine', 'hp'),
  // Four-stage LP turbine.
  ...[0, 1, 2, 3].flatMap((stage) => [
    row(`lpt-s${stage + 1}`, 'stator', 1650 + stage * 68, 28, 34, 'turbine'),
    row(
      `lpt-r${stage + 1}`,
      'rotor',
      1684 + stage * 68,
      28,
      32,
      'turbine',
      'lp',
    ),
  ]),
];

/** Radial clearance between a blade tip and the wall it faces. */
export const tipClearance = 2;
/** Variable vanes run clear of both walls at every turn within their limits. */
export const variableClearance = 2.5;
/** How far a fixed blade or vane root reaches into the wall that carries it. */
export const rootEmbed = 4;

/** Half the axial reach of a row's blades (tip chord 1.08× the root, at the row stagger). */
export const axialHalf = ({ chord, stagger }: BladeRow, turn = 0) => {
  const angle = ((stagger + turn) * Math.PI) / 180;
  return (
    (chord * 1.08 * Math.abs(Math.cos(angle)) +
      chord * 0.1 * Math.abs(Math.sin(angle))) /
    2
  );
};

/**
 * Radial span of a row. Rotors root in the spinning hub and run clear of the casing; fixed stators
 * root in the casing and run clear of the spinning hub; a variable vane turns in the casing on its
 * spindle, so it runs clear at both ends. The walls are conical, so each limit takes the tightest
 * wall radius across the blade's axial reach (a turbine casing flares ~1:3).
 */
export const rowSpan = (
  bladeRow: BladeRow,
): { inner: number; outer: number } => {
  const { kind, x, hub, tip } = bladeRow;
  const reach =
    kind === 'variable'
      ? Math.max(
          axialHalf(bladeRow, vsv.vaneLimits.lower),
          axialHalf(bladeRow, vsv.vaneLimits.upper),
        )
      : axialHalf(bladeRow);
  const across = (points: readonly Point[]) =>
    [x - reach, x, x + reach].map((station) => lerp(points, station));
  const [hubLow, hubHigh] = [
    Math.min(...across(hub)),
    Math.max(...across(hub)),
  ];
  const [tipLow, tipHigh] = [
    Math.min(...across(tip)),
    Math.max(...across(tip)),
  ];
  switch (kind) {
    case 'rotor': {
      return { inner: hubLow - rootEmbed, outer: tipLow - tipClearance };
    }
    case 'stator': {
      return { inner: hubHigh + tipClearance, outer: tipHigh + rootEmbed };
    }
    case 'variable': {
      return {
        inner: hubHigh + variableClearance,
        outer: tipLow - variableClearance,
      };
    }
  }
};

// ---------------------------------------------------------------- spools and radial drive

/** The radial (tower) drive shaft: from the HP spool's bevel gear down to the accessory gearbox. */
export const radialDrive = {
  x: 660,
  top: 150,
  bottom: 833,
  theta: 270,
  shaftRadius: 11,
  hpTeeth: 36,
  towerTeeth: 24,
};
/** Tower shaft turns per HP spool turn, from the bevel pair. */
export const radialDriveRatio = -radialDrive.hpTeeth / radialDrive.towerTeeth;

// ---------------------------------------------------------------- variable stator vanes

/**
 * Each variable vane turns on a radial spindle through the casing; a lever on the spindle reaches
 * `lever` mm aft to a pin on its unison ring. Turning the ring by β moves the lever tip along the
 * tangent by R·β, so the vane turns by −R/lever × β (small-angle).
 */
export const vsv = {
  lever: 40,
  vaneLimits: { lower: -40, upper: 15 },
  /** Stage-1 stators move 60% as far as the inlet guide vanes (the actuator's bellcrank). */
  stage1Share: 0.6,
};
export const variableRows = bladeRows.filter(({ kind }) => kind === 'variable');
/** Outer radius of the casing at x. */
export const casingOuter = (x: number) => lerp(casingInner, x) + casingWall;
/** Radius of a variable row's lever plane (lever centreline) and unison-ring centreline. */
export const leverRadius = (vaneRow: BladeRow) => casingOuter(vaneRow.x) + 8;
export const ringRadius = (vaneRow: BladeRow) =>
  casingOuter(vaneRow.x + vsv.lever) + 20;
/** Vane turn per degree of unison-ring turn. */
export const vanePerRing = (vaneRow: BladeRow) =>
  -ringRadius(vaneRow) / vsv.lever;

// ---------------------------------------------------------------- thrust reverser

/**
 * Translating-sleeve cascade reverser. Each C-duct half slides aft by up to `travel`, uncovering
 * the cascades. Its blocker doors hinge on the sleeve at their forward edge, just aft of the
 * cascades; a drag link from a lug near each door's aft edge to a fitting on the core cowl swings
 * the door into the bypass duct as the sleeve moves, turning the fan flow out through the cascades.
 */
export const reverser = {
  travel: 400,
  sleeveFront: 900,
  cavityEnd: 1320,
  trailingEdge: 1560,
  /** Sleeve outer surface, stowed. */
  outer: [
    [900, 948],
    [1100, 940],
    [1330, 905],
    [1450, 850],
    [1560, 775],
  ] as Point[],
  skin: 6,
  cascade: { front: 899, back: 1300, inner: 815, outer: 890 },
  /**
   * Door panel between `front` (hinge) and `back`, stowed in a recess `recess` deep in the sleeve's
   * inner skin. The curved panel hinges on the straight chord through its front corners, so its
   * bowed middle swings aft and inward as it turns; the recess runs `relief` forward of the hinge
   * for the corners' few millimetres of forward swing.
   */
  door: {
    front: 1340,
    back: 1540,
    thickness: 8,
    recess: 9,
    relief: 10,
    hingeWidth: 350,
    frontWidth: 250,
  },
  /** Distance along the door from its hinge to the drag-link lug, and the lug's reach inward. */
  lug: { along: 190, depth: 12 },
  /**
   * The drag-link fitting on the core cowl: axial station and height above the cowl. Chosen so the
   * door starts to turn at once, turns ~89° at full travel without passing a toggle point, and its
   * aft edge stays ~57 mm off the cowl.
   */
  anchor: { x: 1520, height: 15 },
  doorsPerHalf: 6,
  /** Each half spans 174°, leaving 6° gaps at the pylon (top) and the bottom latch beam. */
  halfSpan: 174,
};

/** The duct wall under the door (a straight segment of `ductOuter`). */
const ductAt = (x: number) => lerp(ductOuter, x);
const doorFrontPoint: Point = [
  reverser.door.front,
  ductAt(reverser.door.front),
];
const doorBackPoint: Point = [reverser.door.back, ductAt(reverser.door.back)];
/** The door's mid-thickness radius at its forward edge, on its centre plane. */
const doorMidRadius = doorFrontPoint[1] + reverser.door.thickness / 2 + 0.5;
/**
 * Hinge axis: the chord through the door's front corners at mid-thickness, `hingeSag` inboard of
 * the panel on its centre plane. In the meridional plane of the door centre it is this point.
 */
export const doorHinge: Point = [
  doorFrontPoint[0],
  Math.sqrt(doorMidRadius ** 2 - (reverser.door.hingeWidth / 2) ** 2),
];
export const hingeSag = doorMidRadius - doorHinge[1];
export const doorLength = Math.hypot(
  doorBackPoint[0] - doorFrontPoint[0],
  doorBackPoint[1] - doorFrontPoint[1],
);
/** Direction from hinge to door aft edge, stowed, in the meridional plane. */
export const doorStowedAngle = toDegrees(
  Math.atan2(
    doorBackPoint[1] - doorFrontPoint[1],
    doorBackPoint[0] - doorFrontPoint[0],
  ),
);
/** The lug pivot seen from the hinge axis: distance and angle offset from the door direction. */
const lugRadius = Math.hypot(reverser.lug.along, hingeSag - reverser.lug.depth);
const lugOffset = toDegrees(
  Math.atan2(hingeSag - reverser.lug.depth, reverser.lug.along),
);
const polar = ([x, r]: Point, length: number, angle: number): Point => [
  x + length * Math.cos(toRadians(angle)),
  r + length * Math.sin(toRadians(angle)),
];
/** Lug pivot for a door at angle φ whose hinge has moved aft by `travel`. */
export const lugPivot = (travel: number, angle: number): Point =>
  polar([doorHinge[0] + travel, doorHinge[1]], lugRadius, angle + lugOffset);
export const dragLinkAnchor: Point = [
  reverser.anchor.x,
  lerp(coreCowl, reverser.anchor.x) + reverser.anchor.height,
];
const stowedLug = lugPivot(0, doorStowedAngle);
export const dragLinkLength = Math.hypot(
  stowedLug[0] - dragLinkAnchor[0],
  stowedLug[1] - dragLinkAnchor[1],
);

const wrap180 = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;
/** Lug-pivot angle about the hinge on one branch of the hinge-circle ∩ anchor-circle solution. */
const lugAngleOn = (travel: number, branch: number) => {
  const dx = dragLinkAnchor[0] - doorHinge[0] - travel;
  const dr = dragLinkAnchor[1] - doorHinge[1];
  const distance = Math.hypot(dx, dr);
  const along =
    (distance ** 2 + lugRadius ** 2 - dragLinkLength ** 2) / (2 * distance);
  return (
    toDegrees(Math.atan2(dr, dx)) +
    branch * toDegrees(Math.acos(Math.max(-1, Math.min(1, along / lugRadius))))
  );
};
/** The branch the stowed pose lies on; the linkage stays on it (it never passes a toggle point). */
const branch =
  Math.abs(wrap180(lugAngleOn(0, 1) - doorStowedAngle - lugOffset)) < 1e-6
    ? 1
    : -1;

/** Door and drag-link angles (meridional, degrees) and the lug pivot with the sleeve `travel` mm aft. */
export const reverserState = (
  travel: number,
): { door: number; link: number; lug: Point } => {
  const lugAngle = lugAngleOn(travel, branch);
  const lug = polar([doorHinge[0] + travel, doorHinge[1]], lugRadius, lugAngle);
  return {
    door: lugAngle - lugOffset,
    link: toDegrees(
      Math.atan2(dragLinkAnchor[1] - lug[1], dragLinkAnchor[0] - lug[0]),
    ),
    lug,
  };
};

export type ReverserHalf = 'left' | 'right';
/** Azimuth where each half starts; halves are centred on θ = 180° (left) and 0° (right). */
export const halfStart: Record<ReverserHalf, number> = {
  left: 90 + (180 - reverser.halfSpan) / 2,
  right: -90 + (180 - reverser.halfSpan) / 2,
};
export const doors = (['left', 'right'] as const).flatMap((half, halfIndex) =>
  Array.from({ length: reverser.doorsPerHalf }, (_, index) => ({
    half,
    number: halfIndex * reverser.doorsPerHalf + index + 1,
    theta:
      halfStart[half] +
      (reverser.halfSpan / reverser.doorsPerHalf) * (index + 0.5),
  })),
);

// ---------------------------------------------------------------- names and mechanism

export const staticNames = [
  'Inlet cowl',
  'Fan case',
  'Fan frame',
  'Outlet guide vanes',
  'Fan cowl',
  'Torque box',
  'Thrust reverser cascades',
  'Hinge beam',
  'Latch beam',
  'Accessory gearbox',
  'Booster stators',
  'Core casing',
  'HPC stators',
  'Combustor',
  'Fuel nozzles',
  'HPT nozzle guide vanes',
  'LPT stators',
  'Turbine rear frame',
  'Exhaust plug',
  'Core nozzle',
  'Core cowl',
];
export const spoolNames: Record<Spool, string[]> = {
  lp: ['Spinner', 'Fan rotor', 'Booster rotor', 'LP shaft', 'LPT rotor'],
  hp: ['HPC rotor', 'HP shaft', 'HPT rotor'],
};
export const vaneName = (vaneRow: BladeRow, index: number) =>
  `${vaneRow.id === 'hpc-igv' ? 'Inlet guide vane' : 'Stage 1 variable vane'} ${index + 1}`;
export const ringName = (vaneRow: BladeRow) =>
  vaneRow.id === 'hpc-igv'
    ? 'Inlet guide vane unison ring'
    : 'Stage 1 unison ring';
export const sleeveName = (half: ReverserHalf) => `Translating sleeve ${half}`;
export const doorName = (number: number) => `Blocker door ${number}`;
export const linkName = (number: number) => `Drag link ${number}`;

/** A curve sampling `value(travel)` over the sleeve's reach from the as-built `travel0`. */
const sleeveCurve = (travel0: number, value: (travel: number) => number) => {
  // One sample per 5 mm over a period longer than the travel: coordinates run from −travel0 to
  // travel − travel0, and negative coordinates wrap to the top of the period.
  const travelPeriod = reverser.travel + 80;
  const samples = travelPeriod / 5;
  const at = (travel: number) =>
    value(Math.max(0, Math.min(reverser.travel, travel)));
  const base = at(travel0);
  return {
    driverPeriod: travelPeriod,
    values: Array.from({ length: samples }, (_, index) => {
      const coordinate = (index * travelPeriod) / samples;
      const unwrapped =
        coordinate > travelPeriod - travel0 - 1e-9
          ? coordinate - travelPeriod
          : coordinate;
      return at(travel0 + unwrapped) - base;
    }),
  };
};

/**
 * The engine mechanism at the as-built pose: `reverserTravel` mm of sleeve travel and the inlet
 * guide vanes turned `vaneAngle` degrees. Coordinates are deltas from that pose.
 */
export function buildMechanism(reverserTravel: number, vaneAngle: number) {
  const links: Record<string, { shapes: string[] }> = {
    engine: { shapes: staticNames },
    'lp-spool': { shapes: spoolNames.lp },
    'hp-spool': { shapes: spoolNames.hp },
    'radial-drive': { shapes: ['Radial drive shaft'] },
  };
  const joints: Record<string, MechanismSource['joints'][string]> = {
    n1: {
      type: 'revolute',
      parent: 'engine',
      child: 'lp-spool',
      origin: [0, 0, 0],
      axis: [1, 0, 0],
    },
    n2: {
      type: 'revolute',
      parent: 'engine',
      child: 'hp-spool',
      origin: [0, 0, 0],
      axis: [1, 0, 0],
    },
    'radial-drive': {
      type: 'revolute',
      parent: 'engine',
      child: 'radial-drive',
      origin: [radialDrive.x, 0, 0],
      axis: radial(radialDrive.theta),
    },
  };
  const couplings: Array<NonNullable<MechanismSource['couplings']>[number]> = [
    { driver: 'n2', follower: 'radial-drive', ratio: radialDriveRatio },
  ];

  // Variable vanes: the inlet guide vane ring is the driver (the actuator moves it); the stage-1 ring
  // follows through the bellcrank and every vane follows its ring.
  const [igv, stage1] = variableRows as [BladeRow, BladeRow];
  const ringTurn = (vaneRow: BladeRow, vane: number) =>
    vane / vanePerRing(vaneRow);
  const vaneOf = (vaneRow: BladeRow) =>
    vaneRow === igv ? vaneAngle : vaneAngle * vsv.stage1Share;
  const ringLimits = (vaneRow: BladeRow) => {
    const [low, high] = [vsv.vaneLimits.lower, vsv.vaneLimits.upper].map(
      (limit) =>
        ringTurn(
          vaneRow,
          (vaneRow === igv ? limit : limit * vsv.stage1Share) - vaneOf(vaneRow),
        ),
    ) as [number, number];
    return { lower: Math.min(low, high), upper: Math.max(low, high) };
  };
  for (const vaneRow of variableRows) {
    const ringId = `${vaneRow.id}-ring`;
    links[ringId] = { shapes: [ringName(vaneRow)] };
    joints[ringId] = {
      type: 'revolute',
      parent: 'engine',
      child: ringId,
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: ringLimits(vaneRow),
    };
    for (const [index, theta] of azimuths(vaneRow.count).entries()) {
      const id = `${vaneRow.id}-${index + 1}`;
      links[id] = { shapes: [vaneName(vaneRow, index)] };
      joints[id] = {
        type: 'revolute',
        parent: 'engine',
        child: id,
        origin: atAzimuth([vaneRow.x, 0], theta),
        axis: radial(theta),
      };
      couplings.push({
        driver: ringId,
        follower: id,
        ratio: vanePerRing(vaneRow),
      });
    }
  }
  couplings.push({
    driver: `${igv.id}-ring`,
    follower: `${stage1.id}-ring`,
    ratio: (vsv.stage1Share * vanePerRing(igv)) / vanePerRing(stage1),
  });

  // Thrust reverser: the left sleeve is the driver, the right sleeve follows it, and each door and
  // drag link follows the sleeve travel through its exact linkage curve.
  for (const half of ['left', 'right'] as const) {
    const id = `sleeve-${half}`;
    links[id] = { shapes: [sleeveName(half)] };
    joints[id] = {
      type: 'prismatic',
      parent: 'engine',
      child: id,
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: {
        lower: -reverserTravel,
        upper: reverser.travel - reverserTravel,
      },
    };
  }
  couplings.push({ driver: 'sleeve-left', follower: 'sleeve-right', ratio: 1 });
  const as = reverserState(reverserTravel);
  const doorCurve = sleeveCurve(
    reverserTravel,
    (travel) => reverserState(travel).door,
  );
  const linkCurve = sleeveCurve(
    reverserTravel,
    (travel) => reverserState(travel).link - reverserState(travel).door,
  );
  for (const { half, number, theta } of doors) {
    const doorId = `door-${number}`;
    const linkId = `drag-link-${number}`;
    links[doorId] = { shapes: [doorName(number)] };
    links[linkId] = { shapes: [linkName(number)] };
    joints[doorId] = {
      type: 'revolute',
      parent: `sleeve-${half}`,
      child: doorId,
      origin: atAzimuth([doorHinge[0] + reverserTravel, doorHinge[1]], theta),
      axis: tangential(theta),
    };
    joints[linkId] = {
      type: 'revolute',
      parent: doorId,
      child: linkId,
      origin: atAzimuth(as.lug, theta),
      axis: tangential(theta),
    };
    couplings.push(
      { driver: 'sleeve-left', follower: doorId, curve: doorCurve },
      { driver: 'sleeve-left', follower: linkId, curve: linkCurve },
    );
  }

  // Loops are seamless: every blade count is even, so 3.5 HP turns land on the same blade pattern.
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'engine',
    links,
    joints,
    couplings,
    animations: [
      {
        id: 'run',
        name: 'Run',
        duration: 2,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { n1: 0, n2: 0 } },
          { time: 2, coordinates: { n1: 720, n2: 1260 } },
        ],
      },
      {
        id: 'thrust-reverser',
        name: 'Thrust reverser',
        duration: 3,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { 'sleeve-left': -reverserTravel } },
          {
            time: 3,
            coordinates: { 'sleeve-left': reverser.travel - reverserTravel },
          },
        ],
      },
      {
        id: 'variable-vanes',
        name: 'Variable vanes',
        duration: 2,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { 'hpc-igv-ring': ringLimits(igv).lower } },
          { time: 2, coordinates: { 'hpc-igv-ring': ringLimits(igv).upper } },
        ],
      },
    ],
  } satisfies MechanismSource;
}
