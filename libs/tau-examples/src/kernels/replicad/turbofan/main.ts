/**
 * Turbofan Engine
 * A two-spool, high-bypass turbofan at CFM56 scale (1560 mm fan): inlet, 22-blade fan, outlet guide
 * vanes, three-stage booster, six-stage HP compressor with variable inlet guide and stage-1 vanes,
 * annular combustor with 20 fuel nozzles, two-stage HP and four-stage LP turbines, turbine rear
 * frame, plug and nozzles, a radial drive to the accessory gearbox, and a translating-sleeve cascade
 * thrust reverser with blocker doors and drag links.
 *
 * `reverserTravel` and `vaneAngle` pose the as-built model; the exported mechanism turns both spools,
 * the radial drive, the variable vanes and the reverser from there.
 *
 * Every blade, vane, door and link is modelled once and placed by clone + rigid transform, so the
 * kernel shares one BRep (and one triangulation) per unique part.
 */
import {
  draw,
  drawCircle,
  makeBox,
  makeCompound,
  makeCylinder,
  makePolygon,
  makeSolid,
  type AnyShape,
  type Drawing,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';
import {
  azimuths,
  bladeRows,
  buildMechanism,
  casingInner,
  casingOuter,
  casingWall,
  coreCowl,
  coreHub,
  coreTip,
  doorHinge,
  doorName,
  doorStowedAngle,
  doors,
  dragLinkAnchor,
  ductOuter,
  fan,
  halfStart,
  leverRadius,
  lerp,
  linkName,
  lugPivot,
  radialDrive,
  reverser,
  reverserState,
  ringName,
  ringRadius,
  rowSpan,
  sleeveName,
  splitterOuter,
  turbineHub,
  variableRows,
  vaneName,
  vsv,
  type BladeRow,
  type Point,
} from './layout.js';

export const defaultParams = {
  /** Sleeve travel aft in mm: 0 stowed, 400 fully deployed. */
  reverserTravel: 0,
  /** Inlet guide vane turn in degrees (−40 closed to +15 open); stage-1 vanes turn 60% as far. */
  vaneAngle: 0,
  component: 'assembly',
};

type Params = typeof defaultParams;

const components = ['assembly', 'fan-blade', 'core-casing', 'sleeve'];

// ---------------------------------------------------------------- sketch helpers

const polygon = (points: readonly Point[]): Drawing => {
  const pen = draw(points[0]);
  for (const point of points.slice(1)) {
    pen.lineTo(point);
  }
  return pen.close();
};
/** An (x, r) profile revolved about the engine axis, fully or over `angle` degrees from θ = 0. */
const revolveX = (profile: Drawing, angle?: number) =>
  profile
    .sketchOnPlane('XY')
    .revolve([1, 0, 0], angle === undefined ? undefined : { angle });
/** A meridional polyline offset by `distance` along its left normal (+r for a line running aft). */
const offsetLine = (line: readonly Point[], distance: number): Point[] =>
  line.map((point, index) => {
    const previous = line[Math.max(0, index - 1)]!;
    const next = line[Math.min(line.length - 1, index + 1)]!;
    const length = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
    return [
      point[0] - ((next[1] - previous[1]) / length) * distance,
      point[1] + ((next[0] - previous[0]) / length) * distance,
    ];
  });
/** A thin wall of revolution on `line`: positive thickness grows outward, negative inward. */
const shellOf = (line: readonly Point[], thickness: number) =>
  revolveX(polygon([...line, ...offsetLine(line, thickness).reverse()]));
/** The part of `points` between x0 and x1, with interpolated end points. */
const slice = (points: readonly Point[], x0: number, x1: number): Point[] => [
  [x0, lerp(points, x0)],
  ...points.filter(([x]) => x > x0 && x < x1),
  [x1, lerp(points, x1)],
];
const star = (tip: number, root: number, teeth: number): Drawing =>
  polygon(
    Array.from({ length: teeth * 2 }, (_, index) => {
      const angle = (index * Math.PI) / teeth;
      const radius = index % 2 === 0 ? tip : root;
      return [radius * Math.cos(angle), radius * Math.sin(angle)] as Point;
    }),
  );
/** A cylinder about the engine axis from x0 to x1. */
const tube = (outer: number, inner: number, x0: number, x1: number) =>
  revolveX(
    polygon([
      [x0, inner],
      [x1, inner],
      [x1, outer],
      [x0, outer],
    ]),
  );
/** A cylinder along the radial direction at the top (θ = 90°) from r0 to r1 at axial station x. */
const radialPin = (radius: number, x: number, r0: number, r1: number, y = 0) =>
  makeCylinder(radius, r1 - r0, [x, y, r0], [0, 0, 1]);
/** Places a part built at the top of the engine (θ = 90°) at azimuth θ. */
const toAzimuth = (shape: Shape3D, theta: number) =>
  shape.rotate(theta - 90, [0, 0, 0], [1, 0, 0]);
/** One instance per azimuth of a part built at θ = 90°; the prototype is consumed. */
const ring = (prototype: Shape3D, thetas: readonly number[]) => {
  const instances = thetas.map((theta) => toAzimuth(prototype.clone(), theta));
  prototype.delete();
  return instances;
};

// ---------------------------------------------------------------- blades

/**
 * Double-circular-arc section (the classic compressor profile) about its mid-chord, chord along +x:
 * suction arc through camber + t/2, pressure arc through camber − t/2, each sampled at `facets`
 * chords. Returned as a closed loop of points.
 */
const arcSection = (
  chord: number,
  thickness: number,
  camber: number,
  facets: number,
): Point[] => {
  const half = chord / 2;
  const arc = (height: number) =>
    Array.from({ length: facets + 1 }, (_, index) => {
      const x = -half + (index * chord) / facets;
      if (Math.abs(height) < 0.05) {
        return [x, 0] as Point;
      }
      // Circle through (±half, 0) and (0, height): centre (0, k), radius |height − k|.
      const k = (height ** 2 - half ** 2) / (2 * height);
      const radius = Math.abs(height - k);
      return [
        x,
        k + Math.sign(height) * Math.sqrt(Math.max(0, radius ** 2 - x ** 2)),
      ] as Point;
    });
  return [
    ...arc(camber + thickness / 2),
    ...arc(camber - thickness / 2)
      .slice(1, -1)
      .reverse(),
  ];
};
type Section = Readonly<{
  r: number;
  chord: number;
  thickness: number;
  camber: number;
  stagger: number;
}>;
const coreFacets = 4;
const fanFacets = 10;
type Vec3 = [number, number, number];

/**
 * A closed polyhedral blade through section loops of equal vertex count (suction side LE→TE, then
 * the pressure side TE→LE): planar triangles between consecutive loops, and caps triangulated as a
 * strip between the suction and pressure points at the same chord station. Every face meshes to its
 * own triangle, so a twisted fan blade costs a few hundred triangles where a lofted surface costs
 * ~13k at the 0.02 mm display tolerance.
 */
const polyhedron = (loops: readonly Vec3[][], facets: number): Shape3D => {
  const cap = (loop: readonly Vec3[], flip: boolean) => {
    const suction = (index: number) => loop[index]!;
    const pressure = (index: number) =>
      loop[(2 * facets - index) % (2 * facets)]!;
    const triangles: Vec3[][] = [];
    for (let index = 0; index < facets; index++) {
      if (index > 0) {
        triangles.push([suction(index), suction(index + 1), pressure(index)]);
      }
      if (index < facets - 1) {
        triangles.push([
          pressure(index),
          suction(index + 1),
          pressure(index + 1),
        ]);
      }
    }
    return triangles.map((triangle) =>
      makePolygon(flip ? [...triangle].reverse() : triangle),
    );
  };
  const faces = [...cap(loops[0]!, true), ...cap(loops.at(-1)!, false)];
  for (let index = 0; index < loops.length - 1; index++) {
    const [lower, upper] = [loops[index]!, loops[index + 1]!];
    for (let vertex = 0; vertex < lower.length; vertex++) {
      const next = (vertex + 1) % lower.length;
      faces.push(
        makePolygon([lower[vertex]!, lower[next]!, upper[next]!]),
        makePolygon([lower[vertex]!, upper[next]!, upper[vertex]!]),
      );
    }
  }
  return makeSolid(faces);
};

/**
 * A blade stacked radially (+Z, θ = 90°) through sections centred on axial station x. Each section
 * lies on its stream cylinder of radius r (tangential offsets wrap round the axis), so the tip keeps
 * its clearance to the casing across the whole chord.
 */
const blade = (
  sections: readonly Section[],
  x: number,
  facets = coreFacets,
): Shape3D =>
  polyhedron(
    sections.map(({ r, chord, thickness, camber, stagger }) => {
      const [cos, sin] = [
        Math.cos((stagger * Math.PI) / 180),
        Math.sin((stagger * Math.PI) / 180),
      ];
      return arcSection(chord, thickness, camber, facets).map(
        ([u, v]): Vec3 => {
          const turn = (u * sin + v * cos) / r;
          return [
            x + u * cos - v * sin,
            r * Math.sin(turn),
            r * Math.cos(turn),
          ];
        },
      );
    }),
    facets,
  );
/** Sections interpolated linearly between the given stations at `count` radii. */
const resample = (stations: readonly Section[], count: number): Section[] =>
  Array.from({ length: count }, (_, index) => {
    const r =
      stations[0]!.r +
      ((stations.at(-1)!.r - stations[0]!.r) * index) / (count - 1);
    const upper = Math.max(
      1,
      stations.findIndex((station) => station.r >= r),
    );
    const [a, b] = [stations[upper - 1]!, stations[upper]!];
    const t = (r - a.r) / (b.r - a.r);
    const mix = (key: 'chord' | 'thickness' | 'camber' | 'stagger') =>
      a[key] + (b[key] - a[key]) * t;
    return {
      r,
      chord: mix('chord'),
      thickness: mix('thickness'),
      camber: mix('camber'),
      stagger: mix('stagger'),
    };
  });
/**
 * Root and tip sections of a row, thinning toward the tip. Core blades are short, so they keep one
 * stagger root to tip (untwisted faces stay near-planar); only the fan is twisted.
 */
const rowBlade = (bladeRow: BladeRow) => {
  const { inner, outer } = rowSpan(bladeRow);
  const hot = bladeRow.x > 1400;
  const twist = 0;
  return blade(
    [
      {
        r: inner,
        chord: bladeRow.chord,
        thickness: bladeRow.chord * (hot ? 0.16 : 0.1),
        camber: bladeRow.chord * 0.08,
        stagger: bladeRow.stagger - twist,
      },
      {
        r: outer,
        chord: bladeRow.chord * 1.08,
        thickness: bladeRow.chord * (hot ? 0.1 : 0.05),
        camber: bladeRow.chord * 0.05,
        stagger: bladeRow.stagger + twist,
      },
    ],
    bladeRow.x,
  );
};
/** A full row of blades, the first at the top. */
const bladeRing = (bladeRow: BladeRow) =>
  ring(rowBlade(bladeRow), azimuths(bladeRow.count));
const rowsOf = (predicate: (bladeRow: BladeRow) => boolean) =>
  bladeRows
    .filter((bladeRow) => predicate(bladeRow))
    .flatMap((bladeRow) => bladeRing(bladeRow));
const fanBlade = () => blade(resample(fan.sections, 8), fan.x, fanFacets);

// ---------------------------------------------------------------- nacelle

/**
 * Tangent-ogive nose from its tip at `tip` to radius `base`, `length` away along x (negative
 * length points the tip aft), closed down to the axis. Eight conical facets: a true arc surface
 * meshes several times heavier at the display tolerance.
 */
const ogive = (tip: number, length: number, base: number): Drawing => {
  const rho = (base ** 2 + length ** 2) / (2 * base);
  const span = Math.abs(length);
  const arc = Array.from({ length: 9 }, (_, index) => {
    const s = (index * span) / 8;
    return [
      tip + Math.sign(length) * s,
      Math.max(0, Math.sqrt(rho ** 2 - (span - s) ** 2) + base - rho),
    ] as Point;
  });
  return polygon([[tip, 0], ...arc.slice(1), [tip + length, 0]]);
};

// ponytail: a solid inlet section (its skins and bulkheads would add faces nobody sees); hollow it if the inlet gets sectioned.
const buildInlet = () => {
  const outer: Point[] = [
    [-600, 890],
    [-540, 920],
    [-420, 945],
    [-250, 958],
    [-60, 962],
  ];
  const inner: Point[] = [
    [-600, 812],
    [-520, 792],
    [-380, 772],
    [-200, 768],
    [-60, 781],
  ];
  // Elliptic lip from the inner surface round the highlight to the outer surface, in six facets.
  const lip = Array.from({ length: 7 }, (_, index) => {
    const angle = Math.PI * 1.5 - (index * Math.PI) / 6;
    return [-600 + 42 * Math.cos(angle), 851 + 39 * Math.sin(angle)] as Point;
  });
  return revolveX(
    polygon([...[...inner].reverse(), ...lip.slice(1, -1), ...outer]),
  );
};

const buildFanCowl = () =>
  shellOf(
    [
      [-60, 962],
      [400, 962],
      [899, 948],
    ],
    -6,
  );

const buildTorqueBox = () =>
  revolveX(
    polygon([
      [850, 826],
      [899, 826],
      [899, 942],
      [850, 942],
    ]).cut(
      polygon([
        [856, 832],
        [893, 832],
        [893, 936],
        [856, 936],
      ]),
    ),
  );

/** Cascade segments behind each door, windowed into turning-vane cells. */
const buildCascades = () => {
  const { front, back, inner, outer } = reverser.cascade;
  const span = reverser.halfSpan / reverser.doorsPerHalf - 3;
  const segment = revolveX(
    polygon([
      [front, inner],
      [back, inner],
      [back, outer],
      [front, outer],
    ]),
    span,
  ).rotate(90 - span / 2, [0, 0, 0], [1, 0, 0]);
  const cells: Shape3D[] = [];
  const rows = 10;
  const pitch = (back - front - 20) / rows;
  for (let index = 0; index < rows; index++) {
    for (const y of [-120, 0, 120]) {
      const x0 = front + 10 + index * pitch + 4;
      cells.push(
        makeBox([x0, y - 52, inner - 20], [x0 + pitch - 8, y + 52, outer + 20]),
      );
    }
  }
  return makeCompound(
    ring(
      segment.cutAll(cells),
      doors.map(({ theta }) => theta),
    ),
  );
};

/**
 * Translating sleeve half: a U section open forward, whose cavity slides over the cascades, with a
 * recess in the inner skin where the blocker doors stow flush with the duct wall.
 */
const sleeveSection = () => {
  const { outer, skin, sleeveFront, cavityEnd, trailingEdge, door } = reverser;
  const duct = (x: number) => lerp(ductOuter, x);
  const at = (x: number) => lerp(outer, x);
  return polygon([
    ...outer,
    [trailingEdge, duct(trailingEdge)],
    [door.back, duct(door.back)],
    [door.back, duct(door.back) + door.recess],
    [door.front, duct(door.front) + door.recess],
    [door.front - door.relief, duct(door.front - door.relief) + door.recess],
    [door.front - door.relief, duct(door.front - door.relief)],
    [cavityEnd, duct(cavityEnd)],
    [sleeveFront, duct(sleeveFront)],
    [sleeveFront, duct(sleeveFront) + skin],
    [cavityEnd, duct(cavityEnd) + skin],
    [cavityEnd, at(cavityEnd) - skin],
    [1100, at(1100) - skin],
    [sleeveFront, at(sleeveFront) - skin],
  ]);
};
const buildSleeve = (half: 'left' | 'right', travel: number) =>
  revolveX(sleeveSection(), reverser.halfSpan)
    .rotate(halfStart[half], [0, 0, 0], [1, 0, 0])
    .translate(travel, 0, 0);

/**
 * Hinge beam (under the pylon, θ = 90°) or latch beam (θ = 270°): the fixed 6° strip between the
 * sleeve halves, whose tracks the sleeves slide on. Its section is the sleeve's, 0.2° clear of each half.
 */
const buildBeam = (theta: number) => {
  const gap = 180 - reverser.halfSpan;
  return revolveX(sleeveSection(), gap - 0.4).rotate(
    theta - gap / 2 + 0.2,
    [0, 0, 0],
    [1, 0, 0],
  );
};

/** Blocker door at the top (θ = 90°), stowed: a curved panel with a trapezoid planform and a lug. */
const buildDoor = () => {
  const { door } = reverser;
  const duct = (x: number) => lerp(ductOuter, x);
  const panel = revolveX(
    polygon([
      [door.front, duct(door.front) + 0.5],
      [door.back, duct(door.back) + 0.5],
      [door.back, duct(door.back) + 0.5 + door.thickness],
      [door.front, duct(door.front) + 0.5 + door.thickness],
    ]),
    40,
  ).rotate(70, [0, 0, 0], [1, 0, 0]);
  const planform = polygon([
    [door.front, -door.hingeWidth / 2],
    [door.back, -door.frontWidth / 2],
    [door.back, door.frontWidth / 2],
    [door.front, door.hingeWidth / 2],
  ])
    .sketchOnPlane('XY', 600)
    .extrude(400);
  const pivot = lugPivot(0, doorStowedAngle);
  const lugBlock = makeBox(
    [pivot[0] - 9, -12, pivot[1] - 7],
    [pivot[0] + 9, 12, lerp(ductOuter, pivot[0]) + 2],
  );
  // Hinge knuckles at the front corners, on the chordal hinge axis just under the panel.
  const knuckles = [-1, 1].map((side) =>
    makeCylinder(
      3.5,
      30,
      [doorHinge[0], side * (door.hingeWidth / 2 - 20) - 15, doorHinge[1]],
      [0, 1, 0],
    ),
  );
  return panel.intersect(planform).fuse(lugBlock).fuseAll(knuckles);
};

/** Drag link at the top from a lug pivot to the core-cowl anchor, with a pin eye at each end. */
const buildDragLink = (lug: Point) => {
  const [ax, ar] = dragLinkAnchor;
  const length = Math.hypot(ax - lug[0], ar - lug[1]);
  const rod = makeCylinder(
    5,
    length,
    [lug[0], 0, lug[1]],
    [(ax - lug[0]) / length, 0, (ar - lug[1]) / length],
  );
  // Eyes on the tangential pin axis, which the door and link joints turn about.
  const eye = ([x, r]: Point) => makeCylinder(8, 16, [x, -8, r], [0, 1, 0]);
  return rod.fuse(eye(lug)).fuse(eye(dragLinkAnchor));
};

/** Core cowl skin with a drag-link fitting under each anchor. */
const buildCoreCowl = () => {
  const [ax, ar] = dragLinkAnchor;
  const fitting = makeBox(
    [ax - 16, -12, lerp(coreCowl, ax) - 3],
    [ax + 16, 12, ar - 9],
  );
  return makeCompound([
    shellOf(coreCowl, -5),
    ...ring(
      fitting,
      doors.map(({ theta }) => theta),
    ),
  ]);
};

// ---------------------------------------------------------------- fan section

const buildSpinner = () => revolveX(ogive(-330, 330, 262));

const buildFanDisk = () =>
  revolveX(
    polygon([
      [0, 262],
      [300, 300],
      [300, 255],
      [250, 215],
      [250, 60],
      [150, 60],
      [150, 215],
      [40, 245],
      [0, 245],
    ]),
  );

const towerBore = () =>
  makeCylinder(
    radialDrive.shaftRadius + 3,
    900,
    [radialDrive.x, 0, -radialDrive.top + 30],
    [0, 0, -1],
  );

const buildFanCase = () =>
  revolveX(
    polygon([
      [-60, 781],
      [330, 781],
      [560, 790],
      [850, 805],
      [850, 825],
      [420, 825],
      [400, 842],
      [-40, 842],
      [-60, 832],
    ]),
  ).cut(towerBore());

/**
 * Fan frame: the splitter (bypass inner skin over the booster case), the transition-duct hub, eight
 * core struts and the 6 o'clock fairing that carries the radial drive across the bypass duct.
 */
const buildFanFrame = () => {
  const tipAt = (x: number) => lerp(coreTip, x);
  const splitter = revolveX(
    polygon([
      [330, 430],
      [330, 437],
      ...splitterOuter.slice(1),
      [700, 484],
      [560, 472],
      [420, 449],
      [360, 441],
      [360, tipAt(360) + 8],
      [620, 416],
      [640, 416],
      [760, 326],
      [760, tipAt(760)],
      [640, 408],
      [620, 408],
    ]),
  );
  const hub = shellOf(slice(coreHub, 625, 765), -8);
  const strut = blade(
    [
      {
        r: lerp(coreHub, 700) - 6,
        chord: 60,
        thickness: 14,
        camber: 0,
        stagger: 0,
      },
      { r: tipAt(700) + 6, chord: 60, thickness: 14, camber: 0, stagger: 0 },
    ],
    700,
  );
  const [bottomStrut, ...struts] = ring(strut, azimuths(8, 270));
  const fairing = toAzimuth(
    blade(
      [
        {
          r: lerp(splitterOuter, radialDrive.x) - 4,
          chord: 130,
          thickness: 36,
          camber: 0,
          stagger: 0,
        },
        {
          r: lerp(ductOuter, radialDrive.x) + 4,
          chord: 130,
          thickness: 36,
          camber: 0,
          stagger: 0,
        },
      ],
      radialDrive.x,
    ),
    radialDrive.theta,
  );
  const bored = [splitter, hub, bottomStrut!, fairing].map((shape) =>
    shape.cut(towerBore()),
  );
  return makeCompound([...bored, ...struts]);
};

const buildOutletGuideVanes = () => {
  const x = 470;
  const vane = blade(
    [
      {
        r: lerp(splitterOuter, x) - 3,
        chord: 80,
        thickness: 8,
        camber: 6,
        stagger: -12,
      },
      {
        r: lerp(ductOuter, x) + 4,
        chord: 80,
        thickness: 8,
        camber: 6,
        stagger: -12,
      },
    ],
    x,
  );
  return makeCompound(ring(vane, azimuths(36)));
};

// ---------------------------------------------------------------- core

const buildBoosterRotor = () =>
  makeCompound([
    revolveX(
      polygon([
        [300, 300],
        [330, 310],
        [620, 335],
        [620, 320],
        [330, 295],
        [300, 285],
      ]),
    ),
    ...rowsOf(({ spool, x }) => spool === 'lp' && x < 700),
  ]);

const buildCoreCasing = () => {
  const wall = revolveX(
    polygon([
      [760, lerp(coreTip, 760)],
      ...casingInner,
      ...offsetLine(
        [[760, lerp(coreTip, 760)], ...casingInner],
        casingWall,
      ).reverse(),
    ]),
  );
  const holes = [
    ...variableRows.flatMap((vaneRow) =>
      azimuths(vaneRow.count).map((theta) =>
        toAzimuth(
          radialPin(
            5.6,
            vaneRow.x,
            lerp(casingInner, vaneRow.x) - 5,
            casingOuter(vaneRow.x) + 5,
          ),
          theta,
        ),
      ),
    ),
    ...azimuths(20).map((theta) =>
      toAzimuth(radialPin(8.5, 1180, 270, 400), theta),
    ),
  ];
  return wall.cutAll(holes);
};

/** A variable vane at the top: aerofoil, spindle through the casing, lever and ring pin. */
const buildVariableVane = (vaneRow: BladeRow, turn: number) => {
  const { outer } = rowSpan(vaneRow);
  const lever = leverRadius(vaneRow);
  const ringInner = ringRadius(vaneRow) - 5;
  const spindle = radialPin(5, vaneRow.x, outer - 3, lever + 2);
  const arm = makeBox(
    [vaneRow.x, -5, lever - 2],
    [vaneRow.x + vsv.lever, 5, lever + 2],
  );
  // The pin stops 2 mm short of the ring: a turned lever carries it off the ring's centreline.
  const pin = radialPin(3, vaneRow.x + vsv.lever, lever + 1, ringInner - 2);
  return rowBlade(vaneRow)
    .fuse(spindle)
    .fuse(arm)
    .fuse(pin)
    .rotate(turn, [vaneRow.x, 0, 0], [0, 0, 1]);
};
// ponytail: the ring is a plain band, so its small turn only shows through the vanes; add pin bosses to see it.
const buildUnisonRing = (vaneRow: BladeRow) => {
  const x = vaneRow.x + vsv.lever;
  const radius = ringRadius(vaneRow);
  return tube(radius + 5, radius - 5, x - 6, x + 6);
};

const buildCombustor = () => {
  const liner = revolveX(
    polygon([
      [1195, 242],
      [1195, 333],
      [1415, 333],
      [1415, 330],
      [1200, 330],
      [1200, 245],
      [1415, 245],
      [1415, 242],
    ]),
  ).cutAll(
    azimuths(20).map((theta) =>
      toAzimuth(makeCylinder(12, 20, [1188, 0, 287], [1, 0, 0]), theta),
    ),
  );
  return makeCompound([liner, tube(220, 215, 1160, 1430)]);
};

const buildFuelNozzles = () => {
  const nozzle = radialPin(6, 1180, 287, 415)
    .fuse(makeBox([1165, -15, 405], [1195, 15, 412]))
    .fuse(makeCylinder(8, 17, [1180, 0, 287], [1, 0, 0]));
  return makeCompound(ring(nozzle, azimuths(20)));
};

const buildHpcRotor = () =>
  makeCompound([
    shellOf(slice(coreHub, 770, 1150), -10),
    ...[830, 956, 1074].map((x) =>
      tube(lerp(coreHub, x) - 8, 100, x - 8, x + 8),
    ),
    ...rowsOf(({ spool, x }) => spool === 'hp' && x < 1200),
  ]);

const buildHpShaft = () =>
  makeCompound([
    tube(100, 80, 600, 1615),
    star(140, 128, radialDrive.hpTeeth)
      .cut(drawCircle(100))
      .sketchOnPlane('YZ', 610)
      .extrude(20),
  ]);

const buildHptRotor = () =>
  makeCompound([
    ...[1500, 1590].map((x) => tube(lerp(turbineHub, x), 100, x - 14, x + 14)),
    ...rowsOf(({ spool, x }) => spool === 'hp' && x > 1400),
  ]);

const buildLptRotor = () =>
  makeCompound([
    shellOf(slice(turbineHub, 1665, 1905), -12),
    revolveX(
      polygon([
        [1640, 60],
        [1660, 60],
        [1680, lerp(turbineHub, 1665) - 12],
        [1665, lerp(turbineHub, 1665) - 12],
      ]),
    ),
    ...rowsOf(({ spool, x }) => spool === 'lp' && x > 1600),
  ]);

const buildTurbineRearFrame = () => {
  const x = 1952;
  const strut = blade(
    [
      {
        r: lerp(turbineHub, x) - 6,
        chord: 55,
        thickness: 12,
        camber: 0,
        stagger: 0,
      },
      {
        r: lerp(casingInner, x) + 4,
        chord: 55,
        thickness: 12,
        camber: 0,
        stagger: 0,
      },
    ],
    x,
  );
  return makeCompound([
    ...ring(strut, azimuths(12)),
    tube(278, 268, 1920, 1985),
    revolveX(
      polygon([
        [1925, 268],
        [1940, 268],
        [1960, 100],
        [1960, 62],
        [1945, 62],
        [1945, 90],
      ]),
    ),
  ]);
};

const buildExhaustPlug = () => revolveX(ogive(2360, -375, 278));

const buildAccessoryGearbox = () => {
  // Between the fan-case containment ring (to x = 420) and the torque box (from x = 850).
  const housing = makeBox([430, -110, -925], [840, 110, -837]);
  return makeCompound([
    housing,
    // Starter (right) and generator (left) pads face outboard, inside the fan cowl.
    makeCylinder(35, 80, [560, 110, -880], [0, 1, 0]),
    makeCylinder(35, 80, [720, -110, -880], [0, -1, 0]),
    makeBox([500, -30, -838], [530, 30, -823]),
    makeBox([780, -30, -838], [810, 30, -823]),
  ]);
};

const buildRadialDrive = () => {
  const { x, top, bottom, shaftRadius, towerTeeth } = radialDrive;
  const gear = star(50, 44, towerTeeth)
    .translate(x, 0)
    .sketchOnPlane('XY', -top - 20)
    .extrude(20);
  return gear.fuse(
    makeCylinder(shaftRadius, bottom - top - 20, [x, 0, -bottom], [0, 0, 1]),
  );
};

// ---------------------------------------------------------------- assembly

const part = (
  name: string,
  shape: AnyShape,
  color: string,
  metalness = 0.7,
  roughness = 0.4,
): ShapeConfig => ({
  name,
  shape,
  color,
  metalness,
  roughness,
});
const nacelle = '#E4E7EB';
const titanium = '#B8BEC6';
const steel = '#8C939B';
const hot = '#8A6E5A';

export default function main(
  params: Partial<Params> = defaultParams,
): ShapeConfig[] {
  const p = { ...defaultParams, ...params };
  if (!components.includes(p.component)) {
    throw new Error(
      `component must be one of ${components.join(', ')}; got "${p.component}".`,
    );
  }
  const travel = Math.max(0, Math.min(reverser.travel, p.reverserTravel));
  const vane = Math.max(
    vsv.vaneLimits.lower,
    Math.min(vsv.vaneLimits.upper, p.vaneAngle),
  );
  switch (p.component) {
    case 'fan-blade': {
      return [part('Fan blade', fanBlade(), titanium)];
    }
    case 'core-casing': {
      return [part('Core casing', buildCoreCasing(), steel)];
    }
    case 'sleeve': {
      return [
        part('Translating sleeve left', buildSleeve('left', 0), nacelle, 0.1),
      ];
    }
  }

  const shapes: ShapeConfig[] = [
    // Nacelle and fan section.
    part('Inlet cowl', buildInlet(), nacelle, 0.1, 0.3),
    part('Fan case', buildFanCase(), '#9AA0A6'),
    part('Fan frame', buildFanFrame(), '#A3A9B0'),
    part('Outlet guide vanes', buildOutletGuideVanes(), '#A3A9B0'),
    part('Fan cowl', buildFanCowl(), nacelle, 0.1, 0.3),
    part('Torque box', buildTorqueBox(), '#7D848C'),
    part('Thrust reverser cascades', buildCascades(), '#5E656D'),
    part('Hinge beam', buildBeam(90), '#B9BEC4', 0.3),
    part('Latch beam', buildBeam(270), '#B9BEC4', 0.3),
    part('Accessory gearbox', buildAccessoryGearbox(), '#6D747C'),
    // Core, front to back.
    part(
      'Booster stators',
      makeCompound(rowsOf(({ id }) => id.startsWith('booster-s'))),
      titanium,
    ),
    part('Core casing', buildCoreCasing(), steel),
    part(
      'HPC stators',
      makeCompound(
        rowsOf(({ id, kind }) => id.startsWith('hpc') && kind === 'stator'),
      ),
      titanium,
    ),
    part('Combustor', buildCombustor(), hot),
    part('Fuel nozzles', buildFuelNozzles(), '#C9A24A'),
    part(
      'HPT nozzle guide vanes',
      makeCompound(rowsOf(({ id }) => id.startsWith('hpt-ngv'))),
      hot,
    ),
    part(
      'LPT stators',
      makeCompound(
        rowsOf(({ id, kind }) => id.startsWith('lpt') && kind === 'stator'),
      ),
      hot,
    ),
    part('Turbine rear frame', buildTurbineRearFrame(), '#6B6F75'),
    part('Exhaust plug', buildExhaustPlug(), '#6B6F75', 0.6, 0.5),
    part(
      'Core nozzle',
      shellOf(
        [
          [1985, 443],
          [2150, 405],
        ],
        -5,
      ),
      '#6B6F75',
    ),
    part('Core cowl', buildCoreCowl(), nacelle, 0.1, 0.3),
    // LP spool.
    part('Spinner', buildSpinner(), '#2E3238', 0.3, 0.3),
    part(
      'Fan rotor',
      makeCompound([buildFanDisk(), ...ring(fanBlade(), azimuths(fan.count))]),
      titanium,
      0.8,
      0.3,
    ),
    part('Booster rotor', buildBoosterRotor(), titanium),
    part('LP shaft', tube(60, 45, 150, 1965), steel),
    part('LPT rotor', buildLptRotor(), hot),
    // HP spool and the radial drive it turns.
    part('HPC rotor', buildHpcRotor(), titanium),
    part('HP shaft', buildHpShaft(), steel),
    part('HPT rotor', buildHptRotor(), hot),
    part('Radial drive shaft', buildRadialDrive(), steel),
  ];

  // Variable stator vanes and their unison rings.
  for (const vaneRow of variableRows) {
    const turn = vaneRow.id === 'hpc-igv' ? vane : vane * vsv.stage1Share;
    const prototype = buildVariableVane(vaneRow, turn);
    for (const [index, theta] of azimuths(vaneRow.count).entries()) {
      shapes.push(
        part(
          vaneName(vaneRow, index),
          toAzimuth(prototype.clone(), theta),
          titanium,
        ),
      );
    }
    prototype.delete();
    shapes.push(part(ringName(vaneRow), buildUnisonRing(vaneRow), '#7D848C'));
  }

  // Thrust reverser: sleeves, then each door turned about its hinge and its drag link to the cowl.
  for (const half of ['left', 'right'] as const) {
    shapes.push(
      part(sleeveName(half), buildSleeve(half, travel), nacelle, 0.1, 0.3),
    );
  }
  const state = reverserState(travel);
  const door = buildDoor()
    .translate(travel, 0, 0)
    .rotate(
      state.door - doorStowedAngle,
      [doorHinge[0] + travel, 0, doorHinge[1]],
      [0, -1, 0],
    );
  const link = buildDragLink(state.lug);
  for (const { number, theta } of doors) {
    shapes.push(
      part(doorName(number), toAzimuth(door.clone(), theta), '#C9CED6', 0.5),
    );
    shapes.push(
      part(linkName(number), toAzimuth(link.clone(), theta), '#555C63'),
    );
  }
  door.delete();
  link.delete();
  return shapes;
}

/** The engine mechanism at the as-built pose; only the full assembly carries one. */
export function mechanism(params: Partial<Params> = defaultParams) {
  const p = { ...defaultParams, ...params };
  if (p.component !== 'assembly') {
    return undefined;
  }
  return buildMechanism(
    Math.max(0, Math.min(reverser.travel, p.reverserTravel)),
    Math.max(vsv.vaneLimits.lower, Math.min(vsv.vaneLimits.upper, p.vaneAngle)),
  );
}
