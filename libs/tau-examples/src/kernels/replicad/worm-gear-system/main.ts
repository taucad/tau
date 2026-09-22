import {
  draw,
  drawCircle,
  drawRoundedRectangle,
  drawPolysides,
  makeCylinder,
  makeBox,
  makeHelix,
  genericSweep,
  makeBSplineApproximation,
  makeLine,
  makeThreePointArc,
  assembleWire,
  loft,
  measureVolume,
  makeVertex,
  makeCompound,
  measureDistanceBetween,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';
import {
  gearDimensions,
  gapFlank,
  envelopePoint,
  type Point3,
} from './tooth-profile.js';

export const defaultParams = {
  module: 2,
  wheelTeeth: 30,
  wheelWidth: 14,
  backlash: 0.16,
  axialPressureAngle: 20,
  inputAngle: 0,
  component: 'assembly',
};

export default function main(
  params: Partial<typeof defaultParams> & {
    verifyProfiles?: boolean;
  } = defaultParams,
): ShapeConfig[] {
  const p = { ...defaultParams, ...params };
  if (
    !Number.isFinite(p.module) ||
    p.module < 1.8 ||
    p.module > 2.2 ||
    !Number.isInteger(p.wheelTeeth) ||
    p.wheelTeeth < 28 ||
    p.wheelTeeth > 36 ||
    !Number.isFinite(p.wheelWidth) ||
    p.wheelWidth < 10 ||
    p.wheelWidth > 16 ||
    !Number.isFinite(p.backlash) ||
    p.backlash < 0.05 ||
    p.backlash > 0.7 ||
    !Number.isFinite(p.axialPressureAngle) ||
    p.axialPressureAngle < 17.5 ||
    p.axialPressureAngle > 25 ||
    !Number.isFinite(p.inputAngle)
  ) {
    throw new Error(
      'Use module 1.8–2.2 mm, 28–36 teeth, width 10–16 mm, backlash 0.05–0.7 mm, axial pressure angle 17.5–25 degrees, and a finite input angle.',
    );
  }
  const groups = [
    'assembly',
    'gears',
    'wheel',
    'worm',
    'worm-cutter',
    'base',
    'supports',
    'bearings',
    'shaft',
    'hardware',
  ];
  if (!groups.includes(p.component))
    throw new Error(`Component must be one of: ${groups.join(', ')}`);
  const parts: ShapeConfig[] = [];
  const add = (name: string, shape: Shape3D, color: string, metalness = 0.7) =>
    parts.push({ name, shape, color, metalness, roughness: 0.32 });
  const show = (group: string) =>
    p.component === 'assembly' ||
    p.component === group ||
    (p.component === 'gears' && ['worm', 'wheel'].includes(group));
  const m = p.module;
  const dimensions = gearDimensions(
    m,
    p.wheelTeeth,
    p.axialPressureAngle,
    p.backlash,
  );
  const pitchRadius = dimensions.wheelRadius;
  const wheelZ = pitchRadius + 19;
  const wormRadius = 5 * m;
  const wormZ = wheelZ + pitchRadius + wormRadius;
  const lead = Math.PI * m;
  const steel = '#B7C6D5';
  const bronze = '#CD942F';
  const frame = '#244957';
  const dark = '#35414D';
  const auditSurface = (shape: Shape3D, points: Point3[], name: string) => {
    const surface = makeCompound(shape.faces);
    let maximum = 0;
    for (const point of points) {
      const vertex = makeVertex(point);
      maximum = Math.max(maximum, measureDistanceBetween(vertex, surface));
      vertex.delete();
    }
    surface.delete();
    if (!Number.isFinite(maximum) || maximum > 0.005) {
      throw new Error(
        `${name} deviates ${maximum} mm from the analytical tooth surface; limit 0.005 mm.`,
      );
    }
  };

  if (show('base')) {
    const holes: Shape3D[] = [];
    for (const x of [-64, 64])
      for (const y of [-39, 39]) {
        holes.push(makeCylinder(3.5, 10, [x, y, -1]));
        holes.push(makeCylinder(6, 2.5, [x, y, 5.5]));
      }
    for (const x of [-48, 48, -23, 23])
      for (const y of [-27, 27]) {
        holes.push(makeCylinder(2.4, 10, [x, y, -1]));
      }
    const base = drawRoundedRectangle(150, 100, 8)
      .sketchOnPlane('XY')
      .extrude(8)
      .cutAll(holes);
    add('Mounting base', base, frame, 0.35);
  }

  if (show('worm') || p.component === 'worm-cutter') {
    const root = wormRadius - 1.25 * m;
    const crest = wormRadius + m;
    const alpha = dimensions.alpha;
    const halfGap = (r: number) =>
      lead / 4 + (r - wormRadius) * Math.tan(alpha);
    const f = 0.15 * m;
    const rootCenter =
      halfGap(root) - f * (1 / Math.cos(alpha) - Math.tan(alpha));
    const tangentR = root + f - f * Math.sin(alpha);
    const arcAngle = (3 * Math.PI) / 4 + alpha / 2;
    const start = -4.5 * lead;
    const profile = draw([root, start - rootCenter])
      .threePointsArcTo(
        [tangentR, start - halfGap(tangentR)],
        [
          root + f + f * Math.cos(arcAngle),
          start - rootCenter - f * Math.sin(arcAngle),
        ],
      )
      .lineTo([crest - 0.15, start - halfGap(crest - 0.15)])
      .lineTo([crest, start - halfGap(crest) - 0.15])
      .lineTo([crest + 0.5, start - halfGap(crest) - 0.15])
      .lineTo([crest + 0.5, start + halfGap(crest) + 0.15])
      .lineTo([crest, start + halfGap(crest) + 0.15])
      .lineTo([crest - 0.15, start + halfGap(crest - 0.15)])
      .lineTo([tangentR, start + halfGap(tangentR)])
      .threePointsArcTo(
        [root, start + rootCenter],
        [
          root + f + f * Math.cos(arcAngle),
          start + rootCenter + f * Math.sin(arcAngle),
        ],
      )
      .close()
      .sketchOnPlane('XZ');
    const spine = makeHelix(lead, 9 * lead, (root + crest) / 2, [0, 0, start]);
    const cutter = genericSweep(profile.wire, spine, { frenet: true });
    if (p.component === 'worm-cutter')
      return [{ name: 'ZA threading tool sweep', shape: cutter, color: steel }];
    const runout = draw([0, -25])
      .lineTo([root, -25])
      .lineTo([crest, -23.5])
      .lineTo([crest, 23.5])
      .lineTo([root, 25])
      .lineTo([0, 25])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1]);
    const threadedBody = runout.cut(cutter);
    if (measureVolume(threadedBody) < Math.PI * root ** 2 * 50 + 100) {
      throw new Error(
        'Worm thread construction lost material during the groove cut.',
      );
    }
    if (params.verifyProfiles) {
      const samples: Point3[] = [];
      for (let i = 0; i < 17; i++)
        for (const r of [8, 9, 10, 11, 11.7])
          for (const side of [-1, 1]) {
            const angle = -Math.PI + ((i + 0.37) * 2 * Math.PI) / 17;
            samples.push([
              r * Math.cos(angle),
              r * Math.sin(angle),
              dimensions.h * angle +
                side * (lead / 4 - (r - wormRadius) * Math.tan(alpha)),
            ]);
          }
      auditSurface(threadedBody, samples, 'Worm');
    }
    const worm = makeCylinder(5, 132, [0, 0, -66])
      .fuse(threadedBody)
      .rotate(p.inputAngle, [0, 0, 0], [0, 0, 1])
      .rotate(90, [0, 0, 0], [0, 1, 0])
      .translate([0, 0, wormZ]);
    add('Single-start worm', worm, steel);
  }

  if (show('wheel')) {
    const outside = pitchRadius + 1.5 * m;
    const throatRadius = wormRadius - m;
    const throatEnd = Math.sqrt(
      throatRadius ** 2 - (dimensions.centerDistance - outside) ** 2,
    );
    // Turned blank with an analytical circular throat and 0.25 mm rim breaks.
    const blank = draw([6.15, -12])
      .lineTo([12.5, -12])
      .lineTo([12.5, -p.wheelWidth / 2])
      .lineTo([outside - 0.25, -p.wheelWidth / 2])
      .lineTo([outside, -p.wheelWidth / 2 + 0.25])
      .lineTo([outside, -throatEnd])
      .threePointsArcTo([outside, throatEnd], [pitchRadius + m, 0])
      .lineTo([outside, p.wheelWidth / 2 - 0.25])
      .lineTo([outside - 0.25, p.wheelWidth / 2])
      .lineTo([12.5, p.wheelWidth / 2])
      .lineTo([12.5, 12])
      .lineTo([6.15, 12])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1]);
    const sections = Array.from({ length: 29 }, (_, i) => {
      const z = -p.wheelWidth / 2 - 0.02 + ((p.wheelWidth + 0.04) * i) / 28;
      const left = gapFlank(dimensions, z, -1, outside + 1);
      const right = gapFlank(dimensions, z, 1, outside + 1);
      const rootR =
        dimensions.centerDistance - Math.sqrt(dimensions.hobTip ** 2 - z ** 2);
      const rootAngle = Math.asin(z / dimensions.hobTip) / p.wheelTeeth;
      const rootMid: [number, number, number] = [
        -rootR * Math.sin(rootAngle),
        rootR * Math.cos(rootAngle),
        z,
      ];
      const spline = (points: [number, number, number][]) =>
        makeBSplineApproximation(points, { tolerance: 0.00001, degMax: 6 });
      return assembleWire([
        spline(left.fillet),
        spline(left.flank),
        makeLine(left.flank.at(-1)!, right.flank.at(-1)!),
        spline([...right.flank].reverse()),
        spline([...right.fillet].reverse()),
        makeThreePointArc(right.fillet[0], rootMid, left.fillet[0]),
      ]);
    });
    const gap = loft(sections, { ruled: false });
    if (params.verifyProfiles) {
      const samples: Point3[] = [];
      for (let i = 0; i < 17; i++)
        for (const r of [9, 10, 11, 12, 12.3, 12.45, 12.49])
          for (const side of [-1, 1]) {
            const z = -p.wheelWidth / 2 + ((i + 0.5) * p.wheelWidth) / 17;
            samples.push(envelopePoint(dimensions, r, z, side).point);
          }
      auditSurface(gap, samples, 'Wheel generating envelope');
    }
    const gaps = Array.from({ length: p.wheelTeeth }, (_, i) =>
      gap.clone().rotate((i * 360) / p.wheelTeeth),
    );
    const wheel = blank.cutAll(gaps);
    const holes = [makeCylinder(6.15, 26, [0, 0, -13])];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      holes.push(
        makeCylinder(4, p.wheelWidth + 2, [
          pitchRadius * 0.65 * Math.cos(a),
          pitchRadius * 0.65 * Math.sin(a),
          -p.wheelWidth / 2 - 1,
        ]),
      );
    }
    add(
      `Bronze wheel - ${p.wheelTeeth} teeth`,
      wheel
        .cutAll(holes)
        .rotate(p.inputAngle / p.wheelTeeth)
        .rotate(90, [0, 0, 0], [1, 0, 0])
        .translate([0, 0, wheelZ]),
      bronze,
    );
  }

  if (show('shaft')) {
    const shaft = makeCylinder(6, 94, [0, -47, wheelZ], [0, 1, 0]).cut(
      makeBox([-2, -47, wheelZ + 4], [2, -35, wheelZ + 7]),
    );
    add('Output shaft', shaft, steel);
  }

  if (show('supports')) {
    const towerDrawing = draw([-22, 8])
      .lineTo([22, 8])
      .lineTo([14, wormZ])
      .threePointsArcTo([-14, wormZ], [0, wormZ + 14])
      .close();
    const tower = towerDrawing
      .sketchOnPlane('YZ', [42, 0, 0])
      .extrude(12)
      .fuse(
        drawRoundedRectangle(24, 66, 4)
          .sketchOnPlane('XY', [48, 0, 8])
          .extrude(4),
      )
      .cutAll([
        makeCylinder(8.15, 14, [41, 0, wormZ], [1, 0, 0]),
        drawRoundedRectangle(15, wormZ - 43, 6)
          .sketchOnPlane('YZ', [41, 0, (wormZ + 1) / 2])
          .extrude(14),
        makeCylinder(2.4, 6, [48, -27, 7]),
        makeCylinder(2.4, 6, [48, 27, 7]),
      ]);
    add('Worm support right', tower, frame, 0.35);
    add('Worm support left', tower.clone().translate([-96, 0, 0]), frame, 0.35);
    const pedestal = draw([-18, 8])
      .lineTo([18, 8])
      .lineTo([14, wheelZ])
      .threePointsArcTo([-14, wheelZ], [0, wheelZ + 14])
      .close()
      .sketchOnPlane('XZ', [0, -21, 0])
      .extrude(12)
      .fuse(
        drawRoundedRectangle(60, 20, 3)
          .sketchOnPlane('XY', [0, -27, 8])
          .extrude(4),
      )
      .cutAll([
        makeCylinder(10.15, 14, [0, -34, wheelZ], [0, 1, 0]),
        makeCylinder(2.4, 6, [-23, -27, 7]),
        makeCylinder(2.4, 6, [23, -27, 7]),
      ]);
    add('Output support front', pedestal, frame, 0.35);
    add(
      'Output support rear',
      pedestal.clone().translate([0, 54, 0]),
      frame,
      0.35,
    );
  }

  if (show('bearings')) {
    const wormBush = drawCircle(8)
      .cut(drawCircle(5.15))
      .sketchOnPlane('YZ', [41.5, 0, wormZ])
      .extrude(13);
    add('Input bush right', wormBush, bronze);
    add('Input bush left', wormBush.clone().translate([-96, 0, 0]), bronze);
    const outputBush = drawCircle(10)
      .cut(drawCircle(6.15))
      .sketchOnPlane('XZ', [0, -20.5, wheelZ])
      .extrude(13);
    add('Output bush front', outputBush, bronze);
    add('Output bush rear', outputBush.clone().translate([0, 54, 0]), bronze);
    const collar = drawCircle(9)
      .cut(drawCircle(6.1))
      .sketchOnPlane('XZ', [0, -15.5, wheelZ])
      .extrude(3);
    add('Shaft collar front', collar, dark);
    add('Shaft collar rear', collar.clone().translate([0, 34, 0]), dark);
  }

  if (show('hardware')) {
    const head = drawPolysides(3.5, 6)
      .sketchOnPlane('XY', 12)
      .extrude(3)
      .fuse(makeCylinder(2.2, 11.5, [0, 0, 1]));
    for (const x of [-48, 48])
      for (const y of [-27, 27]) {
        add(
          `Input support bolt ${x} ${y}`,
          head.clone().translate([x, y, 0]),
          steel,
        );
      }
    for (const x of [-23, 23])
      for (const y of [-27, 27]) {
        add(
          `Output support bolt ${x} ${y}`,
          head.clone().translate([x, y, 0]),
          steel,
        );
      }
    const coupling = drawCircle(9)
      .cut(drawCircle(5.15))
      .sketchOnPlane('YZ', [58, 0, wormZ])
      .extrude(10)
      .cut(makeCylinder(1.6, 6, [63, 5, wormZ], [0, 1, 0]));
    add('Input coupling', coupling, dark);
  }
  return parts;
}
