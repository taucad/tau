import {
  draw,
  drawCircle,
  drawPolysides,
  drawPointsInterpolation,
  drawFaceOutline,
  makeCylinder,
  makeBox,
  makeLine,
  makeThreePointArc,
  makeFace,
  assembleWire,
  type Point2D,
  type Edge,
  type Wire,
  type Sketch,
  type ShapeConfig,
} from 'replicad';
import type { MechanismSource } from '@taucad/kinematics';

export const defaultParams = {
  module: 2,
  faceWidth: 14,
  inputAngle: 0,
};

const rad = Math.PI / 180;
const polar = (r: number, a: number): Point2D => [
  r * Math.cos(a),
  r * Math.sin(a),
];
const mirrorY = (p: Point2D): Point2D => [p[0], -p[1]];

function capsule(length: number, width: number) {
  const c = (length - width) / 2,
    r = width / 2;
  return draw([-c, -r])
    .lineTo([c, -r])
    .threePointsArcTo([c, r], [c + r, 0])
    .lineTo([-c, r])
    .threePointsArcTo([-c, -r], [-c - r, 0])
    .done();
}

// One analytical period, replicated as edges into ONE closed profile.
// Each involute flank is a single nine-point B-spline; root and tip blends
// are circular arcs, tangent to both the flank and the root/tip circle.
function toothProfile(teeth: number, module: number, internalSpace: boolean) {
  const pitch = (module * teeth) / 2;
  const base = pitch * Math.cos(20 * rad);
  const root = pitch - (internalSpace ? 1 : 1.25) * module;
  const tip = pitch + (internalSpace ? 1.25 : 1) * module;
  const rootBlend = 0.3 * module;
  const tipBlend = (internalSpace ? 0.3 : 0.09) * module;
  const halfAtBase =
    Math.PI / (2 * teeth) +
    (internalSpace ? 0.1 : -0.1) / (2 * pitch) +
    Math.tan(20 * rad) -
    20 * rad;
  const halfAngle = (r: number) => {
    const t = Math.sqrt(Math.max(0, (r / base) ** 2 - 1));
    return halfAtBase - t + Math.atan(t);
  };
  const flankPoint = (r: number) => polar(r, -halfAngle(r));
  const toothPitchAngle = (2 * Math.PI) / teeth;

  let rootJoin: number;
  let rootCenter: Point2D;
  let rootContact: Point2D;
  if (root + rootBlend < base) {
    rootJoin = Math.sqrt((root + rootBlend) ** 2 - rootBlend ** 2);
    const a = -halfAtBase;
    const q = polar(rootJoin, a);
    rootCenter = [
      q[0] + rootBlend * Math.sin(a),
      q[1] - rootBlend * Math.cos(a),
    ];
    rootContact = q;
  } else {
    let lo = Math.max(root, base),
      hi = root + rootBlend;
    for (let index = 0; index < 45; index++) {
      const r = (lo + hi) / 2;
      const a = Math.acos(base / r);
      const c = Math.sqrt(
        r * r + rootBlend ** 2 + 2 * r * rootBlend * Math.sin(a),
      );
      if (c > root + rootBlend) {
        hi = r;
      } else {
        lo = r;
      }
    }
    rootJoin = (lo + hi) / 2;
    rootContact = flankPoint(rootJoin);
    const tangent = -halfAngle(rootJoin) + Math.acos(base / rootJoin);
    rootCenter = [
      rootContact[0] + rootBlend * Math.sin(tangent),
      rootContact[1] - rootBlend * Math.cos(tangent),
    ];
  }
  const rootFoot = polar(root, Math.atan2(rootCenter[1], rootCenter[0]));

  let lo = Math.max(base, tip - 2 * tipBlend),
    hi = tip;
  for (let index = 0; index < 45; index++) {
    const r = (lo + hi) / 2;
    const a = Math.acos(base / r);
    const c = Math.sqrt(r * r + tipBlend ** 2 - 2 * r * tipBlend * Math.sin(a));
    if (c > tip - tipBlend) {
      hi = r;
    } else {
      lo = r;
    }
  }
  const tipJoin = (lo + hi) / 2;
  const tipContact = flankPoint(tipJoin);
  const tangent = -halfAngle(tipJoin) + Math.acos(base / tipJoin);
  const tipCenter: Point2D = [
    tipContact[0] - tipBlend * Math.sin(tangent),
    tipContact[1] + tipBlend * Math.cos(tangent),
  ];
  const tipFoot = polar(tip, Math.atan2(tipCenter[1], tipCenter[0]));

  // Midpoint of the minor circular arc, without sampled segment chains.
  const arcMiddle = (a: Point2D, b: Point2D, c: Point2D): Point2D => {
    const dx = a[0] + b[0] - 2 * c[0],
      dy = a[1] + b[1] - 2 * c[1];
    const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const d = Math.hypot(dx, dy);
    return [c[0] + (r * dx) / d, c[1] + (r * dy) / d];
  };
  const rootMid = arcMiddle(rootFoot, rootContact, rootCenter);
  const tipMid = arcMiddle(tipContact, tipFoot, tipCenter);
  const startRadius = Math.max(base, rootJoin);
  const t0 = Math.sqrt(Math.max(0, (startRadius / base) ** 2 - 1));
  const t1 = Math.sqrt((tipJoin / base) ** 2 - 1);
  const flank: Point2D[] = Array.from({ length: 9 }, (_, index) => {
    const t = t0 + ((t1 - t0) * index) / 8;
    return polar(base * Math.sqrt(1 + t * t), -halfAtBase + t - Math.atan(t));
  });
  const edges: Array<Edge | Wire> = [
    makeThreePointArc(rootFoot, rootMid, rootContact),
  ];
  if (rootJoin < base) {
    edges.push(makeLine(rootContact, flank[0]!));
  }
  edges.push(
    (
      drawPointsInterpolation(flank, {
        tolerance: 0.000001,
        degMax: 6,
      }).sketchOnPlane('XY') as Sketch
    ).wires(),
  );
  edges.push(makeThreePointArc(tipContact, tipMid, tipFoot));
  edges.push(makeThreePointArc(tipFoot, [tip, 0], mirrorY(tipFoot)));
  edges.push(
    makeThreePointArc(mirrorY(tipFoot), mirrorY(tipMid), mirrorY(tipContact)),
  );
  edges.push(
    (
      drawPointsInterpolation(flank.map(mirrorY).reverse(), {
        tolerance: 0.000001,
        degMax: 6,
      }).sketchOnPlane('XY') as Sketch
    ).wires(),
  );
  if (rootJoin < base) {
    edges.push(makeLine(mirrorY(flank[0]!), mirrorY(rootContact)));
  }
  edges.push(
    makeThreePointArc(
      mirrorY(rootContact),
      mirrorY(rootMid),
      mirrorY(rootFoot),
    ),
  );
  const rootAngle = Math.atan2(rootFoot[1], rootFoot[0]);
  edges.push(
    makeThreePointArc(
      mirrorY(rootFoot),
      polar(root, toothPitchAngle / 2),
      polar(root, toothPitchAngle + rootAngle),
    ),
  );
  const outline = assembleWire(
    Array.from({ length: teeth }, (_, index) =>
      edges.map((e) =>
        e.clone().rotate((index * 360) / teeth, [0, 0, 0], [0, 0, 1]),
      ),
    ).flat(),
  );
  return drawFaceOutline(makeFace(outline));
}

export default function main(p = defaultParams): ShapeConfig[] {
  const f = p.faceWidth;
  const a = 24 * p.module;
  const ringPitchRadius = 36 * p.module;
  const ringRadius = ringPitchRadius + 15;
  const carrierAngle = p.inputAngle / 4;
  const planetAngle = 7.5 - p.inputAngle / 2;

  const gearBlank = toothProfile(24, p.module, false)
    .sketchOnPlane('XY')
    .extrude(f);
  const planet = gearBlank.clone().cut(makeCylinder(7.015, f + 2, [0, 0, -1]));
  const shaft = makeCylinder(8, f + 30, [0, 0, -28]).chamfer(0.5);
  const lowerHub = makeCylinder(12, 2, [0, 0, -2]).chamfer(0.25);
  const upperHub = makeCylinder(12, 2, [0, 0, f]).chamfer(0.25);
  const keyseat = capsule(16, 5)
    .rotate(90)
    .sketchOnPlane('XZ', [0, 5, -18])
    .extrude(-5);
  const sun = gearBlank
    .clone()
    .fuseAll([shaft, lowerHub, upperHub])
    .cutAll([keyseat, makeCylinder(2.5, 9.1, [0, 0, -28.1])])
    .rotate(p.inputAngle, [0, 0, 0], [0, 0, 1]);

  const ringVoid = toothProfile(72, p.module, true)
    .rotate(2.5)
    .sketchOnPlane('XY', -2)
    .extrude(f + 4);
  const mountingHoles = Array.from({ length: 6 }, (_, index) => {
    const q = polar(ringPitchRadius + 9, (30 + 60 * index) * rad);
    return [
      makeCylinder(2.75, f + 4, [q[0], q[1], -2]),
      makeCylinder(4.75, 3.2, [q[0], q[1], f - 2]),
    ];
  }).flat();
  const ring = makeCylinder(ringRadius, f + 2, [0, 0, -1])
    .chamfer(0.6)
    .cutAll([ringVoid, ...mountingHoles]);

  let spider = drawCircle(18);
  for (let index = 0; index < 3; index++) {
    spider = spider.fuse(
      capsule(a + 16, 16)
        .translate(a / 2, 0)
        .rotate(index * 120),
    );
  }
  // Fillet the six concave arm-to-hub corners only: the arm ends and the hub seam
  // are tangent joins, where replicad would warn that it cannot fillet.
  const hubCorner = Math.sqrt(18 ** 2 - 8 ** 2);
  const armCorners = [0, 120, 240].flatMap((angle) =>
    [8, -8].map((y): Point2D => {
      const [c, s] = [Math.cos(angle * rad), Math.sin(angle * rad)];
      return [hubCorner * c - y * s, hubCorner * s + y * c];
    }),
  );
  spider = spider.fillet(3, (corners) => corners.inList(armCorners));
  for (let index = 0; index < 3; index++) {
    spider = spider.cut(
      drawCircle(4.01)
        .translate(a, 0)
        .rotate(index * 120),
    );
    spider = spider.cut(
      capsule(a - 26, 5.5)
        .translate((a + 14) / 2, 0)
        .rotate(index * 120),
    );
  }
  const plate = spider
    .sketchOnPlane('XY')
    .extrude(5)
    .chamfer(0.35, (e) => e.inPlane('XY', 0))
    .chamfer(0.35, (e) => e.inPlane('XY', 5));
  const rear = plate
    .clone()
    .cut(makeCylinder(9, 7, [0, 0, -1]))
    .translate([0, 0, -8])
    .rotate(carrierAngle, [0, 0, 0], [0, 0, 1]);
  const outputHub = makeCylinder(15, 18, [0, 0, f + 8]).chamfer(0.6, (e) =>
    e.inPlane('XY', f + 26),
  );
  const front = plate
    .clone()
    .translate([0, 0, f + 3])
    .fuse(outputHub)
    .fillet(1, (e) => e.inPlane('XY', f + 8).ofLength(2 * Math.PI * 15))
    .cutAll([
      makeCylinder(6, 25, [0, 0, f + 2]),
      makeBox([-2, 0, f + 2], [2, 7.8, f + 27]),
      makeCylinder(2, 11, [15.1, 0, f + 18], [-1, 0, 0]),
    ])
    .rotate(carrierAngle, [0, 0, 0], [0, 0, 1]);

  // The full-diameter pin spans between the carrier faces. Reduced ends locate
  // in reamed carrier bores; every bushing/spacer can slide over an end.
  const pin = draw([0, -7.9])
    .lineTo([3.745, -7.9])
    .lineTo([3.995, -7.65])
    .lineTo([3.995, -3])
    .customCorner(0.15)
    .lineTo([5, -3])
    .lineTo([5, f + 3])
    .lineTo([3.995, f + 3])
    .customCorner(0.15)
    .lineTo([3.995, f + 7.65])
    .lineTo([3.745, f + 7.9])
    .lineTo([0, f + 7.9])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1])
    .cutAll([
      makeCylinder(2.525, 13.1, [0, 0, -8.1]),
      makeCylinder(2.525, 13.1, [0, 0, f - 5]),
    ]);
  const bushing = makeCylinder(7, f)
    .fuse(makeCylinder(9, 1.5, [0, 0, f]))
    .cut(makeCylinder(5.02, f + 3, [0, 0, -0.5]))
    .chamfer(0.12, (e) => e.inPlane('XY', 0))
    .chamfer(0.2, (e) => e.inPlane('XY', f + 1.5));
  const oilSlots = Array.from({ length: 3 }, (_, index) =>
    capsule(4.5, 0.7)
      .translate(7.1, 0)
      .rotate(index * 120)
      .sketchOnPlane('XY', -0.2)
      .extrude(0.4),
  );
  const washer = drawCircle(9)
    .cut(drawCircle(5.05))
    .sketchOnPlane('XY', -1.5)
    .extrude(1.5)
    .chamfer(0.12)
    .cutAll(oilSlots);
  const thrustSpacer = drawCircle(7)
    .cut(drawCircle(5.02))
    .sketchOnPlane('XY')
    .extrude(1.3)
    .chamfer(0.1);
  const screwWasher = drawCircle(5)
    .cut(drawCircle(2.65))
    .sketchOnPlane('XY')
    .extrude(1)
    .chamfer(0.1);

  // Purchased M5 x 12 screw: smooth nominal thread envelope, full socket geometry.
  const screwHead = makeCylinder(4.25, 5)
    .fillet(0.35, (e) => e.inPlane('XY', 5))
    .chamfer(0.15, (e) => e.inPlane('XY', 0));
  const screw = screwHead
    .fuse(
      makeCylinder(2.48, 12, [0, 0, -12]).chamfer(0.25, (e) =>
        e.inPlane('XY', -12),
      ),
    )
    .cut(
      drawPolysides(4 / Math.sqrt(3), 6)
        .rotate(30)
        .sketchOnPlane('XY', 2.5)
        .extrude(3),
    );

  const result: ShapeConfig[] = [
    {
      name: 'Internal Ring Gear',
      shape: ring,
      color: '#718293',
      metalness: 0.8,
      roughness: 0.29,
    },
    {
      name: 'Sun Gear And Input Shaft',
      shape: sun,
      color: '#D0D6DD',
      metalness: 0.85,
      roughness: 0.24,
    },
    {
      name: 'Carrier Rear',
      shape: rear,
      color: '#285E88',
      metalness: 0.65,
      roughness: 0.32,
    },
    {
      name: 'Carrier Front And Output Hub',
      shape: front,
      color: '#285E88',
      metalness: 0.65,
      roughness: 0.32,
    },
  ];
  for (let index = 0; index < 3; index++) {
    const q = polar(a, (index * 120 + carrierAngle) * rad);
    const position: [number, number, number] = [q[0], q[1], 0];
    result.push(
      {
        name: `Planet Gear ${index + 1}`,
        shape: planet
          .clone()
          .rotate(planetAngle, [0, 0, 0], [0, 0, 1])
          .translate(position),
        color: '#B7C1CA',
        metalness: 0.85,
        roughness: 0.27,
      },
      {
        name: `Planet Pin ${index + 1}`,
        shape: pin.clone().translate(position),
        color: '#8C9AA7',
        metalness: 0.85,
        roughness: 0.24,
      },
      {
        name: `Flanged Bushing ${index + 1}`,
        shape: bushing.clone().translate(position),
        color: '#BE974E',
        metalness: 0.75,
        roughness: 0.3,
      },
      {
        name: `Thrust Washer ${index + 1}`,
        shape: washer.clone().translate(position),
        color: '#BE974E',
        metalness: 0.75,
        roughness: 0.3,
      },
      {
        name: `Front Thrust Spacer ${index + 1}`,
        shape: thrustSpacer.clone().translate([q[0], q[1], f + 1.7]),
        color: '#8C9AA7',
        metalness: 0.8,
        roughness: 0.3,
      },
      {
        name: `Rear Thrust Spacer ${index + 1}`,
        shape: thrustSpacer.clone().translate([q[0], q[1], -3]),
        color: '#8C9AA7',
        metalness: 0.8,
        roughness: 0.3,
      },
      {
        name: `Front Screw Washer ${index + 1}`,
        shape: screwWasher.clone().translate([q[0], q[1], f + 8]),
        color: '#8C9AA7',
        metalness: 0.8,
        roughness: 0.3,
      },
      {
        name: `Rear Screw Washer ${index + 1}`,
        shape: screwWasher.clone().translate([q[0], q[1], -9]),
        color: '#8C9AA7',
        metalness: 0.8,
        roughness: 0.3,
      },
      {
        name: `Front Socket Screw ${index + 1}`,
        shape: screw.clone().translate([q[0], q[1], f + 9]),
        color: '#313B46',
        metalness: 0.7,
        roughness: 0.28,
      },
      {
        name: `Rear Socket Screw ${index + 1}`,
        shape: screw
          .clone()
          .rotate(180, [0, 0, 0], [1, 0, 0])
          .translate([q[0], q[1], -9]),
        color: '#313B46',
        metalness: 0.7,
        roughness: 0.28,
      },
    );
  }
  return result;
}

// Mechanism: every origin and axis is in the as-built model frame (mm, deg) that `main`
// produces for the given parameters; `inputAngle` stays the as-built reference and the
// kinematic coordinates are deltas on top of it.
// - ring: root link, grounded through its six mounting holes.
// - sun, carrier: revolute about +Z through the origin, the common gear axis.
// - planet-i: revolute about +Z through its pin centre polar(a, (i - 1) * 120deg + carrierAngle),
//   a = (Zs + Zp) * m / 2 = 24 * module and carrierAngle = inputAngle / 4, exactly where
//   `main` places the pin; the carrier carries the pin, so the joint's parent is carrier.
// Couplings from Willis' equation with the ring grounded (Zs = Zp = 24, Zr = 72):
//   Zs(ts - tc) + Zr(tr - tc) = const, tr = 0  =>  tc = ts * Zs / (Zs + Zr) = ts / 4.
//   Sun-planet mesh relative to the carrier: Zp(tp - tc) = -Zs(ts - tc)
//     =>  tp,rel = -(Zs / Zp)(ts - ts / 4) = -3 ts / 4.
//   World planet angle tc + tp,rel = -ts / 2, matching main's planetAngle = 7.5 - inputAngle / 2.
// The flanged bushings are retained in the planet bores (DESIGN.md), so they turn with the
// planets; pins, spacers, thrust washers, screws and screw washers stay with the carrier.
// Four sun turns return every link to its as-built pose: the carrier turns once and each
// planet -3 turns relative to the carrier (-2 in the world).
export function mechanism(p = defaultParams) {
  const a = 24 * p.module;
  const carrierAngle = p.inputAngle / 4;
  const planets = [1, 2, 3];
  const planetJoint = (index: number): MechanismSource['joints'][string] => {
    const q = polar(a, ((index - 1) * 120 + carrierAngle) * rad);
    return {
      type: 'revolute',
      parent: 'carrier',
      child: `planet-${index}`,
      origin: [q[0], q[1], 0],
      axis: [0, 0, 1],
    };
  };
  const carrierHardware = planets.flatMap((index) => [
    `Planet Pin ${index}`,
    `Thrust Washer ${index}`,
    `Front Thrust Spacer ${index}`,
    `Rear Thrust Spacer ${index}`,
    `Front Screw Washer ${index}`,
    `Rear Screw Washer ${index}`,
    `Front Socket Screw ${index}`,
    `Rear Socket Screw ${index}`,
  ]);
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'ring',
    links: {
      ring: { shapes: ['Internal Ring Gear'] },
      sun: { shapes: ['Sun Gear And Input Shaft'] },
      carrier: {
        shapes: [
          'Carrier Rear',
          'Carrier Front And Output Hub',
          ...carrierHardware,
        ],
      },
      ...Object.fromEntries(
        planets.map((index) => [
          `planet-${index}`,
          { shapes: [`Planet Gear ${index}`, `Flanged Bushing ${index}`] },
        ]),
      ),
    },
    joints: {
      sun: {
        type: 'revolute',
        parent: 'ring',
        child: 'sun',
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
      carrier: {
        type: 'revolute',
        parent: 'ring',
        child: 'carrier',
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
      ...Object.fromEntries(
        planets.map((index) => [`planet-${index}`, planetJoint(index)]),
      ),
    },
    couplings: [
      { driver: 'sun', follower: 'carrier', ratio: 1 / 4 },
      ...planets.map((index) => ({
        driver: 'sun',
        follower: `planet-${index}`,
        ratio: -3 / 4,
      })),
    ],
    animations: [
      {
        id: 'four-sun-turns',
        name: 'Four sun turns',
        duration: 8,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { sun: 0 } },
          { time: 8, coordinates: { sun: 1440 } },
        ],
      },
    ],
  } satisfies MechanismSource;
}
