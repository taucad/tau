import {
  draw,
  drawCircle,
  drawRoundedRectangle,
  drawPolysides,
  sketchCircle,
  sketchHelix,
  Sketcher,
  makeCylinder,
  makeSphere,
} from 'replicad';
import type { Shape3D, ShapeConfig, Point2D } from 'replicad';
// oxlint-disable-next-line no-restricted-imports -- Materialized projects must resolve this local helper outside the monorepo.
import { toothProfile } from './gear-profile.js';

type Parameters = Readonly<Record<string, number>>;
const dimension = (parameters: Parameters, key: string): number => {
  const result = parameters[key];
  if (result === undefined || !Number.isFinite(result) || result <= 0) {
    throw new RangeError(`${key} must be a finite positive dimension`);
  }
  return result;
};
const profile = (points: Point2D[]) => {
  const first = points[0];
  if (!first) {
    throw new RangeError('A profile needs vertices');
  }
  const pen = draw(first);
  for (const point of points.slice(1)) {
    pen.lineTo(point);
  }
  return pen.close();
};
const turned = (points: Point2D[]): Shape3D => profile(points).sketchOnPlane('XZ').revolve();
const ring = (outer: number, inner: number, height: number): Shape3D =>
  drawCircle(outer / 2)
    .cut(drawCircle(inner / 2))
    .sketchOnPlane('XY')
    .extrude(height);
const plate = (size: { width: number; depth: number; height: number; radius?: number }): Shape3D =>
  drawRoundedRectangle(size.width, size.depth, size.radius ?? 0)
    .sketchOnPlane('XY')
    .extrude(size.height);

const rotary = (parameters: Parameters, design: string): Shape3D => {
  const diameter = dimension(parameters, 'diameter');
  const length = dimension(parameters, 'length');
  const shaftDesign = ['keyed-shaft', 'stepped-shaft', 'd-shaft', 'grooved-shaft'].includes(design);
  const hole = shaftDesign ? diameter * 0.2 : dimension(parameters, 'bore');
  if (hole >= diameter * 0.65) {
    throw new RangeError('bore must be less than 65% of diameter');
  }
  const outer = diameter / 2;
  const inner = hole / 2;
  const edge = Math.min(0.3, (outer - inner) / 8, length / 20);
  if (shaftDesign) {
    let shaft = turned([
      [0, 0],
      [outer - edge, 0],
      [outer, edge],
      [outer, length - edge],
      [outer - edge, length],
      [0, length],
    ]);
    if (design === 'keyed-shaft') {
      shaft = shaft.cut(
        plate({ width: diameter * 0.25, depth: diameter, height: length * 0.7 }).translate(
          0,
          diameter * 0.85,
          length * 0.15,
        ),
      );
    }
    if (design === 'stepped-shaft') {
      shaft = turned([
        [0, 0],
        [outer * 0.7 - edge, 0],
        [outer * 0.7, edge],
        [outer * 0.7, length * 0.3],
        [outer, length * 0.3],
        [outer, length * 0.7],
        [outer * 0.7, length * 0.7],
        [outer * 0.7, length - edge],
        [outer * 0.7 - edge, length],
        [0, length],
      ]);
    }
    if (design === 'grooved-shaft') {
      for (const fraction of [0.1, 0.85]) {
        shaft = shaft.cut(
          turned([
            [outer * 0.85, length * fraction],
            [outer + 1, length * fraction],
            [outer + 1, length * (fraction + 0.05)],
            [outer * 0.85, length * (fraction + 0.05)],
          ]),
        );
      }
    }
    if (design === 'd-shaft') {
      shaft = shaft.cut(
        plate({ width: diameter * 2, depth: diameter, height: length * 0.8 }).translate(
          0,
          diameter * 0.85,
          length * 0.2,
        ),
      );
    }
    return shaft;
  }
  const flanged = ['flanged-bushing', 'flanged-idler'].includes(design);
  let body = turned(
    flanged
      ? [
          [inner + edge, 0],
          [outer - edge, 0],
          [outer, edge],
          [outer, length * 0.16],
          [outer * 0.78, length * 0.16],
          [outer * 0.78, length - edge],
          [outer * 0.78 - edge, length],
          [inner + edge, length],
          [inner, length - edge],
          [inner, edge],
        ]
      : [
          [inner + edge, 0],
          [outer - edge, 0],
          [outer, edge],
          [outer, length - edge],
          [outer - edge, length],
          [inner + edge, length],
          [inner, length - edge],
          [inner, edge],
        ],
  );
  if (design === 'flanged-idler') {
    body = body.fuse(ring(diameter, hole, length * 0.16).translateZ(length * 0.84));
  }
  if (design === 'grooved-bushing') {
    body = body.cut(
      turned([
        [inner - edge, length * 0.4],
        [inner + (outer - inner) * 0.22, length * 0.4],
        [inner + (outer - inner) * 0.22, length * 0.6],
        [inner - edge, length * 0.6],
      ]),
    );
    body = body.cut(makeCylinder(length * 0.06, diameter, [0, 0, length / 2], [1, 0, 0]));
  }
  if (['split-bushing', 'split-collar'].includes(design)) {
    body = body.cut(
      plate({ width: diameter * 0.06, depth: diameter, height: length + 2 }).translate(0, diameter / 2, -1),
    );
  }
  if (['set-screw-collar', 'rigid-coupling'].includes(design)) {
    for (const fraction of design === 'rigid-coupling' ? [0.25, 0.75] : [0.5]) {
      body = body.cut(makeCylinder(diameter * 0.065, diameter, [0, 0, length * fraction], [1, 0, 0]));
    }
  }
  if (design === 'split-collar') {
    body = body.cut(makeCylinder(diameter * 0.055, diameter, [-outer, diameter * 0.34, length / 2], [1, 0, 0]));
  }
  if (design === 'v-belt-pulley') {
    body = turned([
      [inner + edge, 0],
      [outer - edge, 0],
      [outer, edge],
      [outer, length * 0.2],
      [outer * 0.73, length * 0.4],
      [outer * 0.73, length * 0.6],
      [outer, length * 0.8],
      [outer, length - edge],
      [outer - edge, length],
      [inner + edge, length],
      [inner, length - edge],
      [inner, edge],
    ]);
  }
  if (design === 'flat-belt-pulley') {
    body = turned([
      [inner + edge, 0],
      [outer * 0.94, 0],
      [outer, length * 0.45],
      [outer, length * 0.55],
      [outer * 0.94, length],
      [inner + edge, length],
      [inner, length - edge],
      [inner, edge],
    ]);
  }
  return body;
};

const gear = (parameters: Parameters, design: string): Shape3D => {
  const module = dimension(parameters, 'module');
  const teeth = dimension(parameters, 'teeth');
  const width = dimension(parameters, 'width');
  const hole = design === 'ring-gear' || design === 'gear-rack' ? module : dimension(parameters, 'bore');
  if (!Number.isInteger(teeth) || teeth < 20 || teeth > 60 || hole >= module * (teeth - 4)) {
    throw new RangeError('Gears require 20–60 integer teeth and a bore inside the root circle');
  }
  if (design === 'ring-gear') {
    return drawCircle((module * (teeth + 8)) / 2)
      .cut(toothProfile(teeth, module, true))
      .sketchOnPlane('XY')
      .extrude(width);
  }
  if (design === 'gear-rack') {
    const pitch = Math.PI * module;
    const halfTop = pitch / 4 - module * Math.tan(Math.PI / 9);
    const halfRoot = pitch / 4 + 1.25 * module * Math.tan(Math.PI / 9);
    const points: Point2D[] = [
      [0, 0],
      [teeth * pitch, 0],
      [teeth * pitch, 2 * module],
    ];
    for (let index = teeth - 1; index >= 0; index--) {
      const center = (index + 0.5) * pitch;
      points.push(
        [center + halfRoot, 2 * module],
        [center + halfTop, 4.25 * module],
        [center - halfTop, 4.25 * module],
        [center - halfRoot, 2 * module],
      );
    }
    points.push([0, 2 * module]);
    return profile(points).sketchOnPlane('XY').extrude(width);
  }
  const outline = toothProfile(teeth, module, false);
  return outline
    .sketchOnPlane('XY')
    .extrude(width, design === 'helical-gear' ? { twistAngle: 15 } : {})
    .cut(makeCylinder(hole / 2, width));
};

const stock = (parameters: Parameters, design: string): Shape3D => {
  const width = dimension(parameters, 'width');
  const height = ['round-tube', 'hex-bar', 't-slot-extrusion'].includes(design)
    ? width
    : dimension(parameters, 'height');
  const length = dimension(parameters, 'length');
  const wall =
    design === 'hex-bar'
      ? width / 10
      : design === 'square-bar'
        ? dimension(parameters, 'radius') * 3
        : dimension(parameters, 'wall');
  if (wall >= Math.min(width, height) / 4) {
    throw new RangeError('wall must be less than one quarter of profile width and height');
  }
  const radius = wall / 3;
  if (design === 'round-tube') {
    return ring(width, width - 2 * wall, length);
  }
  if (design === 'hex-bar') {
    return drawPolysides(width / Math.sqrt(3), 6)
      .rotate(30)
      .sketchOnPlane('XY')
      .extrude(length);
  }
  if (design === 'square-bar') {
    return drawRoundedRectangle(width, height, radius).sketchOnPlane('XY').extrude(length);
  }
  if (design === 'rectangular-tube') {
    return drawRoundedRectangle(width, height, wall)
      .cut(drawRoundedRectangle(width - 2 * wall, height - 2 * wall, radius))
      .sketchOnPlane('XY')
      .extrude(length);
  }
  if (design === 'angle-profile') {
    return profile([
      [0, 0],
      [width, 0],
      [width, wall],
      [wall, wall],
      [wall, height],
      [0, height],
    ])
      .fillet(radius)
      .sketchOnPlane('XY')
      .extrude(length);
  }
  if (design === 'u-channel') {
    return profile([
      [0, 0],
      [width, 0],
      [width, height],
      [width - wall, height],
      [width - wall, wall],
      [wall, wall],
      [wall, height],
      [0, height],
    ])
      .fillet(radius)
      .sketchOnPlane('XY')
      .extrude(length);
  }
  if (design === 'i-beam') {
    return profile([
      [-width / 2, 0],
      [width / 2, 0],
      [width / 2, wall],
      [wall / 2, wall],
      [wall / 2, height - wall],
      [width / 2, height - wall],
      [width / 2, height],
      [-width / 2, height],
      [-width / 2, height - wall],
      [-wall / 2, height - wall],
      [-wall / 2, wall],
      [-width / 2, wall],
    ])
      .fillet(radius)
      .sketchOnPlane('XY')
      .extrude(length);
  }
  let section = drawRoundedRectangle(width, height, radius).cut(drawCircle(wall));
  const slot = profile([
    [-wall, height / 2 + wall],
    [wall, height / 2 + wall],
    [wall, height / 2 - wall],
    [wall * 2, height / 2 - wall],
    [wall * 2, height / 2 - wall * 2],
    [-wall * 2, height / 2 - wall * 2],
    [-wall * 2, height / 2 - wall],
    [-wall, height / 2 - wall],
  ]);
  for (const angle of [0, 90, 180, 270]) {
    section = section.cut(slot.rotate(angle));
  }
  return section.sketchOnPlane('XY').extrude(length);
};

const bracket = (parameters: Parameters, design: string): Shape3D => {
  const width = dimension(parameters, 'width');
  const depth = dimension(parameters, 'depth');
  const wall = dimension(parameters, 'height');
  const hole = dimension(parameters, 'hole');
  const section =
    design === 'l-bracket'
      ? profile([
          [0, 0],
          [depth, 0],
          [depth, wall],
          [wall, wall],
          [wall, depth],
          [0, depth],
        ])
      : design === 'u-bracket'
        ? profile([
            [0, 0],
            [depth, 0],
            [depth, depth],
            [depth - wall, depth],
            [depth - wall, wall],
            [wall, wall],
            [wall, depth],
            [0, depth],
          ])
        : profile([
            [0, 0],
            [depth, 0],
            [depth, depth - wall],
            [2 * depth, depth - wall],
            [2 * depth, depth],
            [depth - wall, depth],
            [depth - wall, wall],
            [0, wall],
          ]);
  let body = section
    .fillet(wall / 4)
    .sketchOnPlane('YZ')
    .extrude(width)
    .translateX(-width / 2);
  body = body.cut(makeCylinder(hole / 2, depth * 2, [0, depth * 0.6, -1], [0, 0, 1]));
  body = body.cut(makeCylinder(hole / 2, depth * 3, [0, -depth, depth * 0.65], [0, 1, 0]));
  return body;
};

const mounting = (parameters: Parameters, design: string): Shape3D => {
  const width = dimension(parameters, 'width');
  const depth = ['mounting-disc', 'circular-flange'].includes(design) ? width : dimension(parameters, 'depth');
  const height = dimension(parameters, 'height');
  const hole = dimension(parameters, 'hole');
  if (hole >= Math.min(width, depth) / 8 || height >= Math.min(width, depth) / 4) {
    throw new RangeError('Mounting holes and plate thickness must leave continuous load-bearing material');
  }
  const pitchX = width * 0.65;
  const pitchY = depth * 0.65;
  if (design === 'mounting-disc') {
    let outline = drawCircle(width / 2);
    for (const angle of [0, 90, 180, 270]) {
      outline = outline.cut(
        drawCircle(hole / 2).translate(
          width * 0.32 * Math.cos((angle * Math.PI) / 180),
          width * 0.32 * Math.sin((angle * Math.PI) / 180),
        ),
      );
    }
    return outline.sketchOnPlane('XY').extrude(height);
  }
  if (['circular-flange', 'motor-plate'].includes(design)) {
    // Couple the aperture and bolt circle to the same envelope so the four mounting holes remain separate.
    const patternDiameter = Math.min(width, depth);
    let outline = design === 'circular-flange' ? drawCircle(width / 2) : drawRoundedRectangle(width, depth, height);
    outline = outline.cut(drawCircle(patternDiameter * 0.19));
    for (const angle of [0, 90, 180, 270]) {
      const radians = (angle * Math.PI) / 180;
      outline = outline.cut(
        drawCircle(hole / 2).translate(
          patternDiameter * 0.32 * Math.cos(radians),
          patternDiameter * 0.32 * Math.sin(radians),
        ),
      );
    }
    return outline.sketchOnPlane('XY').extrude(height);
  }
  if (design === 'gusset-plate') {
    let outline = profile([
      [0, 0],
      [width, 0],
      [0, depth],
    ]).fillet(height / 3);
    for (const [x, y] of [
      [width * 0.15, depth * 0.15],
      [width * 0.65, depth * 0.15],
      [width * 0.15, depth * 0.65],
    ]) {
      outline = outline.cut(drawCircle(hole / 2).translate(x!, y!));
    }
    return outline.sketchOnPlane('XY').extrude(height);
  }
  if (['l-bracket', 'u-bracket', 'z-bracket'].includes(design)) {
    return bracket(parameters, design);
  }
  let outline =
    design === 'cross-plate'
      ? drawRoundedRectangle(width, depth * 0.45, height / 2).fuse(
          drawRoundedRectangle(width * 0.45, depth, height / 2),
        )
      : drawRoundedRectangle(width, depth, height / 2);
  if (design !== 'cross-plate') {
    for (const x of [-pitchX / 2, pitchX / 2]) {
      for (const y of [-pitchY / 2, pitchY / 2]) {
        const opening =
          design === 'slotted-plate' ? drawRoundedRectangle(width * 0.2, hole, hole / 2) : drawCircle(hole / 2);
        outline = outline.cut(opening.translate(x, y));
      }
    }
  }
  if (design === 'window-plate') {
    outline = outline.cut(drawRoundedRectangle(width * 0.5, depth * 0.5, height));
  }
  if (design === 'cross-plate') {
    for (const angle of [0, 90, 180, 270]) {
      outline = outline.cut(
        drawCircle(hole / 2).translate(
          width * 0.35 * Math.cos((angle * Math.PI) / 180),
          depth * 0.35 * Math.sin((angle * Math.PI) / 180),
        ),
      );
    }
  }
  return outline.sketchOnPlane('XY').extrude(height);
};

const bearing = (parameters: Parameters, design: string): ShapeConfig[] => {
  const diameter = dimension(parameters, 'diameter');
  const hole = dimension(parameters, 'bore');
  const length = dimension(parameters, 'length');
  if (hole >= diameter * 0.65 || length < (diameter - hole) * 0.25) {
    throw new RangeError('Bearing width and radial section cannot contain the rolling elements');
  }
  const middle = (diameter + hole) / 4;
  if (design === 'thrust-bearing') {
    const race = ring(diameter, hole, length * 0.22);
    return [
      { name: 'Lower race', shape: race, color: '#aeb7bf' },
      { name: 'Upper race', shape: race.clone().translateZ(length * 0.78), color: '#aeb7bf' },
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Ball ${index + 1}`,
        color: '#d6dee5',
        shape: makeSphere(length * 0.28).translate(
          middle * Math.cos((index * Math.PI) / 4),
          middle * Math.sin((index * Math.PI) / 4),
          length / 2,
        ),
      })),
    ];
  }
  const ball = Math.min((diameter - hole) * 0.14, length * 0.28);
  const grooveRadius = ball * 1.04;
  const radialOffset = ball * 0.45;
  const grooveHalfHeight = Math.sqrt(grooveRadius ** 2 - radialOffset ** 2);
  const lowerContact = length / 2 - grooveHalfHeight;
  const upperContact = length / 2 + grooveHalfHeight;
  // The circular groove meets each cylindrical race shoulder at these exact
  // section intersections. Revolving the section avoids two torus booleans.
  const outerShoulder = middle + radialOffset;
  const innerShoulder = middle - radialOffset;
  let outer = draw([outerShoulder, 0])
    .lineTo([diameter / 2, 0])
    .lineTo([diameter / 2, length])
    .lineTo([outerShoulder, length])
    .lineTo([outerShoulder, upperContact])
    .threePointsArcTo([outerShoulder, lowerContact], [middle + grooveRadius, length / 2])
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  const inner = draw([hole / 2, 0])
    .lineTo([innerShoulder, 0])
    .lineTo([innerShoulder, lowerContact])
    .threePointsArcTo([innerShoulder, upperContact], [middle - grooveRadius, length / 2])
    .lineTo([innerShoulder, length])
    .lineTo([hole / 2, length])
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  if (design === 'flanged-ball-bearing') {
    outer = outer.fuse(ring(diameter * 1.15, diameter * 0.95, length * 0.2));
  }
  return [
    { name: 'Outer race', shape: outer, color: '#aeb7bf' },
    { name: 'Inner race', shape: inner, color: '#aeb7bf' },
    ...Array.from({ length: 8 }, (_, index) => ({
      name: `Ball ${index + 1}`,
      color: '#d6dee5',
      shape: makeSphere(ball).translate(
        middle * Math.cos((index * Math.PI) / 4),
        middle * Math.sin((index * Math.PI) / 4),
        length / 2,
      ),
    })),
  ];
};

const fitting = (parameters: Parameters, design: string): Shape3D => {
  const diameter = dimension(parameters, 'diameter');
  const hole = ['blind-flange', 'socket-plug'].includes(design) ? diameter * 0.3 : dimension(parameters, 'bore');
  const length = dimension(parameters, 'length');
  if (hole >= diameter * 0.7) {
    throw new RangeError('Fitting bore must leave its wall and barb roots intact');
  }
  const outer = diameter / 2;
  const inner = hole / 2;
  const wall = outer - inner;
  if (design === 'pipe-elbow') {
    const path = () =>
      new Sketcher('XZ')
        .vLine(length * 0.3)
        .tangentArc(length * 0.4, length * 0.4)
        .hLine(length * 0.3)
        .done();
    return path()
      .sweepSketch((plane, origin) => sketchCircle(outer, { plane, origin }))
      .cut(path().sweepSketch((plane, origin) => sketchCircle(inner, { plane, origin })));
  }
  if (design === 'pipe-tee') {
    const run = drawCircle(outer).sketchOnPlane('XY').extrude(length);
    const branch = drawCircle(outer)
      .sketchOnPlane('YZ')
      .extrude(length / 2)
      .translateZ(length / 2);
    return run
      .fuse(branch)
      .cut(makeCylinder(inner, length + 2, [0, 0, -1]))
      .cut(makeCylinder(inner, length, [0, 0, length / 2], [1, 0, 0]));
  }
  if (design === 'hose-barb') {
    const points: Point2D[] = [
      [inner, 0],
      [outer * 0.8, 0],
    ];
    for (let index = 0; index < 4; index++) {
      points.push([outer, ((index + 0.15) * length) / 4], [outer * 0.8, ((index + 0.85) * length) / 4]);
    }
    points.push([outer * 0.8, length], [inner, length]);
    return turned(points);
  }
  if (design === 'concentric-reducer') {
    return turned([
      [inner, 0],
      [outer, 0],
      [outer, length * 0.2],
      [outer * 0.7, length * 0.8],
      [outer * 0.7, length],
      [inner * 0.7, length],
      [inner * 0.7, length * 0.8],
      [inner, length * 0.2],
    ]);
  }
  if (design === 'pipe-flange' || design === 'blind-flange') {
    let body =
      design === 'blind-flange'
        ? drawCircle(outer).sketchOnPlane('XY').extrude(length)
        : turned([
            [inner, 0],
            [outer, 0],
            [outer, length * 0.3],
            [outer * 0.6, length * 0.3],
            [outer * 0.6, length],
            [inner, length],
          ]);
    for (let index = 0; index < 4; index++) {
      body = body.cut(
        makeCylinder(diameter * 0.045, length + 2, [
          outer * 0.8 * Math.cos((index * Math.PI) / 2),
          outer * 0.8 * Math.sin((index * Math.PI) / 2),
          -1,
        ]),
      );
    }
    return body;
  }
  if (design === 'socket-plug') {
    return turned([
      [0, 0],
      [outer * 0.85, 0],
      [outer, length * 0.08],
      [outer, length * 0.8],
      [outer * 0.85, length],
      [0, length],
    ]).cut(
      drawPolysides(diameter * 0.17, 6)
        .sketchOnPlane('XY')
        .extrude(length * 0.5)
        .translateZ(length * 0.6),
    );
  }
  const body = turned([
    [0, 0],
    [outer * 0.8 - wall * 0.1, 0],
    [outer * 0.8, wall * 0.1],
    [outer * 0.8, length - wall * 0.1],
    [outer * 0.8 - wall * 0.1, length],
    [0, length],
  ]).fuse(
    drawPolysides(outer, 6)
      .rotate(30)
      .sketchOnPlane('XY')
      .extrude(length * 0.24)
      .translateZ(length * 0.38),
  );
  // Drill after adding the wrench collar to keep one continuous bore face and its entry chamfers.
  return body.cut(
    turned([
      [0, -1],
      [inner + wall * 0.1, -1],
      [inner + wall * 0.1, 0],
      [inner, wall * 0.1],
      [inner, length - wall * 0.1],
      [inner + wall * 0.1, length],
      [inner + wall * 0.1, length + 1],
      [0, length + 1],
    ]),
  );
};

const handle = (parameters: Parameters, design: string): Shape3D => {
  const diameter = dimension(parameters, 'diameter');
  const hole = design === 'pull-handle' ? diameter * 0.1 : dimension(parameters, 'bore');
  const length = dimension(parameters, 'length');
  if (hole >= diameter * 0.3) {
    throw new RangeError('Handle bore must leave its hub intact');
  }
  if (design === 'star-knob') {
    let outline = drawCircle(diameter * 0.43);
    for (let index = 0; index < 6; index++) {
      outline = outline.fuse(
        drawCircle(diameter * 0.12).translate(
          diameter * 0.38 * Math.cos((index * Math.PI) / 3),
          diameter * 0.38 * Math.sin((index * Math.PI) / 3),
        ),
      );
    }
    return outline
      .cut(drawCircle(hole / 2))
      .sketchOnPlane('XY')
      .extrude(length)
      .fillet(length * 0.12, (edge) => edge.inPlane('XY', length));
  }
  if (design === 'handwheel') {
    const rim = ring(diameter, diameter * 0.78, length);
    let wheel = rim.fuse(ring(diameter * 0.28, hole, length));
    for (let index = 0; index < 4; index++) {
      wheel = wheel.fuse(
        plate({ width: diameter * 0.1, depth: diameter * 0.43, height: length * 0.6 })
          .translateY(diameter * 0.25)
          .translateZ(length * 0.2)
          .rotate(index * 90),
      );
    }
    return wheel.cut(makeCylinder(hole / 2, length + 2, [0, 0, -1]));
  }
  if (design === 'lever-handle') {
    return drawRoundedRectangle(diameter, length, length / 2)
      .cut(drawCircle(hole / 2).translate(-diameter * 0.35, 0))
      .sketchOnPlane('XY')
      .extrude(length * 0.5);
  }
  if (design === 'pull-handle') {
    const wall = length * 0.2;
    const outline = drawRoundedRectangle(diameter, length, length * 0.35).cut(
      drawRoundedRectangle(diameter - wall * 2, length - wall * 2, length * 0.2),
    );
    return outline.sketchOnPlane('XY').extrude(length * 0.5);
  }
  let outline = drawCircle(diameter / 2);
  for (let index = 0; index < 24; index++) {
    outline = outline.cut(
      drawCircle(diameter * 0.025).translate(
        diameter * 0.505 * Math.cos(((index + 0.5) * Math.PI) / 12),
        diameter * 0.505 * Math.sin(((index + 0.5) * Math.PI) / 12),
      ),
    );
  }
  return outline
    .cut(drawCircle(hole / 2))
    .sketchOnPlane('XY')
    .extrude(length);
};

/**
 * Build one parametric mechanical design. Dimensions are millimetres.
 * @internal
 * @param parameters - Numeric dimensions for the selected design.
 * @param design - Catalog design identity.
 * @returns Exact solid or named bearing components.
 */
export default function build(parameters: Parameters, design: string): Shape3D | ShapeConfig[] {
  if (['spur-gear', 'ring-gear', 'helical-gear', 'gear-rack'].includes(design)) {
    return gear(parameters, design);
  }
  if (
    [
      'angle-profile',
      'u-channel',
      'i-beam',
      'rectangular-tube',
      'round-tube',
      'hex-bar',
      'square-bar',
      't-slot-extrusion',
    ].includes(design)
  ) {
    return stock(parameters, design);
  }
  if (
    [
      'perforated-plate',
      'slotted-plate',
      'window-plate',
      'cross-plate',
      'gusset-plate',
      'circular-flange',
      'motor-plate',
      'l-bracket',
      'u-bracket',
      'z-bracket',
      'mounting-disc',
    ].includes(design)
  ) {
    return mounting(parameters, design);
  }
  if (['ball-bearing', 'flanged-ball-bearing', 'thrust-bearing'].includes(design)) {
    return bearing(parameters, design);
  }
  if (
    [
      'hose-barb',
      'pipe-elbow',
      'pipe-tee',
      'concentric-reducer',
      'pipe-flange',
      'blind-flange',
      'socket-plug',
      'pipe-nipple',
    ].includes(design)
  ) {
    return fitting(parameters, design);
  }
  if (['star-knob', 'thumbwheel', 'handwheel', 'lever-handle', 'pull-handle'].includes(design)) {
    return handle(parameters, design);
  }
  if (design === 'compression-spring') {
    const diameter = dimension(parameters, 'diameter');
    const wire = dimension(parameters, 'wire');
    const pitch = dimension(parameters, 'pitch');
    const turns = dimension(parameters, 'turns');
    if (wire >= pitch * 0.8 || wire >= diameter * 0.15 || !Number.isInteger(turns)) {
      throw new RangeError('Spring wire must clear adjacent coils and turns must be an integer');
    }
    // Keep the circular profile's seam aligned with the helix frame for stable tessellation.
    return sketchHelix(pitch, pitch * turns, diameter / 2 - wire / 2).sweepSketch(
      (plane, origin) => sketchCircle(wire / 2, { plane, origin }),
      { frenet: true },
    );
  }
  return rotary(parameters, design);
}
