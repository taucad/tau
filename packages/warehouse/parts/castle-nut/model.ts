import {
  draw,
  drawCircle,
  drawPolysides,
  drawRoundedRectangle,
  makeCylinder,
  sketchRectangle,
  sketchHelix,
  genericSweep,
} from 'replicad';
import type { Point2D, Shape3D } from 'replicad';

/** Millimetre dimensions for the selected hardware design. @internal */
export type Parameters = {
  diameter?: number;
  length?: number;
  width?: number;
  depth?: number;
  height?: number;
  bore?: number;
  thickness?: number;
  headDiameter?: number;
  headHeight?: number;
  socket?: number;
  socketDepth?: number;
  flangeDiameter?: number;
  flangeHeight?: number;
  gap?: number;
  count?: number;
  pitch?: number;
  wall?: number;
  hole?: number;
};

const dimension = (parameters: Parameters, key: keyof Parameters): number => {
  const value = parameters[key];
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Hardware dimension ${key} must be a finite positive number.`);
  }
  return value;
};

const revolve = (points: Point2D[]): Shape3D => {
  const first = points[0];
  if (!first) {
    throw new Error('A revolved section needs a starting point.');
  }
  const pen = draw(first);
  for (const point of points.slice(1)) {
    pen.lineTo(point);
  }
  return pen.close().sketchOnPlane('XZ').revolve();
};

const annulus = (outer: number, inner: number, height: number): Shape3D => {
  if (inner >= outer) {
    throw new Error('Bore must be smaller than outside diameter.');
  }
  return drawCircle(outer / 2)
    .cut(drawCircle(inner / 2))
    .sketchOnPlane('XY')
    .extrude(height);
};

const hex = (width: number, height: number): Shape3D =>
  drawPolysides(width / Math.sqrt(3), 6)
    .rotate(30)
    .sketchOnPlane('XY')
    .extrude(height);

const blank = (diameter: number, length: number): Shape3D => {
  const chamfer = Math.min(diameter * 0.08, length * 0.08);
  return revolve([
    [0, 0],
    [diameter / 2 - chamfer, 0],
    [diameter / 2, chamfer],
    [diameter / 2, length],
    [0, length],
  ]);
};

const socketCut = (shape: Shape3D, options: { width: number; top: number; depth?: number }): Shape3D => {
  const depth = options.depth ?? options.width * 0.65;
  return shape.cut(hex(options.width, depth + 0.1).translateZ(options.top - depth));
};

const roundedHead = (
  radius: number,
  base: number,
  options: { height: number; landRatio: number; flatRatio: number },
): Shape3D => {
  const topRadius = radius * options.flatRatio;
  const shoulder = base + options.height * options.landRatio;
  const top = base + options.height;
  const centerZ = (radius ** 2 - topRadius ** 2 + shoulder ** 2 - top ** 2) / (2 * (shoulder - top));
  const sphereRadius = Math.hypot(radius, shoulder - centerZ);
  const midpointX = radius + topRadius;
  const midpointZ = shoulder + top - 2 * centerZ;
  const scale = sphereRadius / Math.hypot(midpointX, midpointZ);
  return draw([0, base])
    .hLine(radius)
    .vLineTo(shoulder)
    .threePointsArcTo([topRadius, top], [midpointX * scale, centerZ + midpointZ * scale])
    .hLineTo(0)
    .close()
    .sketchOnPlane('XZ')
    .revolve();
};

const headedScrew = (p: Parameters, design: string): Shape3D => {
  const diameter = dimension(p, 'diameter');
  const length = dimension(p, 'length');
  const headDiameter = dimension(p, 'headDiameter');
  const headHeight = dimension(p, 'headHeight');
  const socket = p.socket ?? 0;
  if (headDiameter <= diameter || socket >= headDiameter * 0.8) {
    throw new Error('Head and drive dimensions do not leave a wall.');
  }
  const r = diameter / 2;
  const radius = headDiameter / 2;
  const tip = diameter * 0.08;
  if (design === 'countersunk-socket-screw') {
    if (headHeight >= length) {
      throw new Error('Countersunk head must be shorter than overall length.');
    }
    return socketCut(
      revolve([
        [0, 0],
        [r - tip, 0],
        [r, tip],
        [r, length - headHeight],
        [radius, length],
        [0, length],
      ]),
      { width: socket, top: length, depth: p.socketDepth },
    );
  }
  if (design === 'hex-head-bolt') {
    return blank(diameter, length).fuse(hex(headDiameter, headHeight).translateZ(length));
  }
  if (design === 'carriage-bolt') {
    const neck = drawRoundedRectangle(diameter, diameter, diameter * 0.04)
      .sketchOnPlane('XY', length)
      .extrude(headHeight * 0.45);
    const dome = roundedHead(radius, length + headHeight * 0.3, {
      height: headHeight * 0.7,
      landRatio: 0.15 / 0.7,
      flatRatio: 0.35,
    });
    return blank(diameter, length).fuse(neck).fuse(dome);
  }
  const isButton = design === 'button-head-socket-screw';
  const head = isButton
    ? roundedHead(radius, length, { height: headHeight, landRatio: 0.2, flatRatio: 0.55 })
    : revolve([
        [0, length],
        [radius, length],
        [radius, length + headHeight * 0.85],
        [radius - headHeight * 0.15, length + headHeight],
        [0, length + headHeight],
      ]);
  const shape = blank(diameter, length).fuse(head);
  if (design === 'pan-head-machine-screw') {
    return shape.cut(
      drawRoundedRectangle(headDiameter * 1.2, socket * 0.35, 0)
        .sketchOnPlane('XY', length + headHeight * 0.55)
        .extrude(headHeight),
    );
  }
  if (design === 'knurled-thumbscrew') {
    const tools = Array.from({ length: 24 }, (_, index) => {
      const angle = (index * Math.PI) / 12;
      return makeCylinder(headDiameter * 0.025, headHeight + 0.2, [
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        length - 0.1,
      ]);
    });
    return socketCut(shape.cutAll(tools), { width: socket, top: length + headHeight, depth: p.socketDepth });
  }
  return socketCut(shape, { width: socket, top: length + headHeight, depth: p.socketDepth });
};

const nut = (p: Parameters, design: string): Shape3D => {
  const width = dimension(p, 'width');
  const height = dimension(p, 'height');
  const bore = dimension(p, 'bore');
  if (bore >= width * 0.8) {
    throw new Error('Nut bore leaves insufficient body wall.');
  }
  const hole = makeCylinder(bore / 2, height + width, [0, 0, -0.1]);
  if (design === 'cap-nut') {
    const body = hex(width, height * 0.55);
    const crown = draw([0, height * 0.5])
      .hLine(width * 0.45)
      .vLineTo(height - width * 0.45)
      .threePointsArcTo(
        [0, height],
        [(width * 0.45) / Math.sqrt(2), height - width * 0.45 + (width * 0.45) / Math.sqrt(2)],
      )
      .close()
      .sketchOnPlane('XZ')
      .revolve();
    return body.fuse(crown).cut(makeCylinder(bore / 2, height * 0.72, [0, 0, -0.1]));
  }
  if (design === 'wing-nut') {
    const wing = draw([width * 0.3, 0])
      .lineTo([width * 1.2, height * 0.5])
      .lineTo([width * 1.3, height])
      .lineTo([width * 0.65, height])
      .lineTo([width * 0.3, height * 0.5])
      .close()
      .sketchOnPlane('XZ')
      .extrude(width * 0.25)
      .translateY(width * 0.125);
    return blank(width, height * 0.7)
      .fuse(wing)
      .fuse(wing.clone().mirror('YZ'))
      .cut(hole);
  }
  if (design === 't-slot-nut') {
    const flangeWidth = dimension(p, 'flangeDiameter');
    const base = drawRoundedRectangle(flangeWidth, width, 0.5)
      .sketchOnPlane('XY')
      .extrude(height * 0.5);
    return base
      .fuse(
        drawRoundedRectangle(flangeWidth, width * 0.6, 0.4)
          .sketchOnPlane('XY', height * 0.4)
          .extrude(height * 0.6),
      )
      .cut(hole);
  }
  const body = hex(width, design === 'nylon-insert-locknut' ? height * 0.68 : height);
  if (design === 'castle-nut') {
    const slots = [0, 60, 120].map((angle) =>
      drawRoundedRectangle(width * 1.5, width * 0.2, 0)
        .rotate(angle)
        .sketchOnPlane('XY', height * 0.65)
        .extrude(height),
    );
    return body.cut(hole).cutAll(slots);
  }
  if (design === 'hex-flange-nut') {
    return body
      .fuse(
        drawCircle(dimension(p, 'flangeDiameter') / 2)
          .sketchOnPlane('XY')
          .extrude(dimension(p, 'flangeHeight')),
      )
      .cut(hole);
  }
  if (design === 'nylon-insert-locknut') {
    const crown = annulus(width * 0.95, bore, height * 0.4).translateZ(height * 0.6);
    return body.fuse(crown).cut(hole);
  }
  return body.cut(hole);
};

const insert = (p: Parameters, design: string): Shape3D => {
  const diameter = dimension(p, 'diameter');
  const length = dimension(p, 'length');
  const bore = dimension(p, 'bore');
  const radius = diameter / 2;
  if (bore >= diameter * 0.8) {
    throw new Error('Insert bore leaves insufficient wall.');
  }
  if (design === 'heat-set-insert') {
    const section: Point2D[] = [
      [bore / 2, 0],
      [radius * 0.85, 0],
      [radius, length * 0.12],
      [radius, length * 0.38],
      [radius * 0.86, length * 0.45],
      [radius * 0.86, length * 0.55],
      [radius, length * 0.62],
      [radius, length * 0.88],
      [radius * 0.85, length],
      [bore / 2, length],
    ];
    const cuts = Array.from({ length: 16 }, (_, index) => {
      const angle = (index * Math.PI) / 8;
      return makeCylinder(diameter * 0.045, length + 0.2, [radius * Math.cos(angle), radius * Math.sin(angle), -0.1]);
    });
    return revolve(section).cutAll(cuts);
  }
  const flange = dimension(p, 'flangeDiameter') / 2;
  const flangeHeight = dimension(p, 'flangeHeight');
  return revolve([
    [bore / 2, 0],
    [radius * 0.85, 0],
    [radius, length * 0.1],
    [radius, length - flangeHeight],
    [flange, length - flangeHeight],
    [flange, length],
    [bore / 2, length],
  ]);
};

const washer = (p: Parameters, design: string): Shape3D => {
  const diameter = dimension(p, 'diameter');
  const bore = dimension(p, 'bore');
  const thickness = dimension(p, 'thickness');
  if (bore >= diameter) {
    throw new Error('Washer bore must leave an annular wall.');
  }
  if (design === 'belleville-washer') {
    const height = dimension(p, 'height');
    if (height <= thickness) {
      throw new Error('Cone height must exceed material thickness.');
    }
    return revolve([
      [bore / 2, height - thickness],
      [diameter / 2, 0],
      [diameter / 2, thickness],
      [bore / 2, height],
    ]);
  }
  if (design === 'split-lock-washer') {
    const gap = dimension(p, 'gap');
    const height = dimension(p, 'height');
    const radialWidth = (diameter - bore) / 2;
    const activeTurn = (360 - gap) / 360;
    const radius = (diameter + bore) / 4;
    const spine = sketchHelix(height / activeTurn, height, radius);
    const section = sketchRectangle(radialWidth, thickness, { plane: 'XZ', origin: [radius, 0, thickness / 2] });
    return genericSweep(section.wire, spine.wire, { frenet: true, forceProfileSpineOthogonality: false });
  }
  if (design === 'square-washer') {
    return drawRoundedRectangle(diameter, diameter, thickness * 0.2)
      .cut(drawCircle(bore / 2))
      .sketchOnPlane('XY')
      .extrude(thickness);
  }
  if (design === 'tab-washer') {
    return drawCircle(diameter / 2)
      .fuse(drawRoundedRectangle(diameter * 0.45, diameter * 0.5, 0).translate(0, diameter * 0.5))
      .cut(drawCircle(bore / 2))
      .sketchOnPlane('XY')
      .extrude(thickness);
  }
  if (design === 'internal-tooth-lock-washer') {
    let profile = drawCircle(diameter / 2).cut(drawCircle(bore / 2));
    for (let index = 0; index < 12; index++) {
      profile = profile.cut(
        drawRoundedRectangle(diameter * 0.055, (diameter - bore) * 0.32, 0)
          .translate(0, bore / 2)
          .rotate(index * 30),
      );
    }
    return profile.sketchOnPlane('XY').extrude(thickness);
  }
  if (design === 'slotted-shim') {
    return drawCircle(diameter / 2)
      .cut(drawCircle(bore / 2))
      .cut(drawRoundedRectangle(bore, diameter, 0).translate(0, diameter / 2))
      .sketchOnPlane('XY')
      .extrude(thickness);
  }
  return annulus(diameter, bore, thickness);
};

const pin = (p: Parameters, design: string): Shape3D => {
  const diameter = dimension(p, 'diameter');
  const length = dimension(p, 'length');
  if (design === 'clevis-pin') {
    const headDiameter = dimension(p, 'headDiameter');
    const headHeight = dimension(p, 'headHeight');
    return blank(diameter, length)
      .fuse(
        drawCircle(headDiameter / 2)
          .sketchOnPlane('XY', length)
          .extrude(headHeight),
      )
      .cut(makeCylinder(dimension(p, 'hole') / 2, diameter + 1, [-diameter / 2 - 0.5, 0, diameter * 0.7], [1, 0, 0]));
  }
  if (design === 'slotted-spring-pin') {
    const bore = dimension(p, 'bore');
    return annulus(diameter, bore, length).cut(
      drawRoundedRectangle(dimension(p, 'gap'), diameter, 0)
        .translate(0, diameter / 2)
        .sketchOnPlane('XY', -0.1)
        .extrude(length + 0.2),
    );
  }
  return blank(diameter, length);
};

const enclosure = (p: Parameters, design: string): Shape3D => {
  const width = dimension(p, 'width');
  const depth = dimension(p, 'depth');
  const height = dimension(p, 'height');
  const wall = dimension(p, 'wall');
  if (wall * 4 >= Math.min(width, depth) || wall >= height) {
    throw new Error('Enclosure dimensions do not leave a cavity.');
  }
  const outer = drawRoundedRectangle(width, depth, wall * 2)
    .sketchOnPlane('XY')
    .extrude(height);
  if (design === 'enclosure-base') {
    return outer.shell(wall, (face) => face.inPlane('XY', height));
  }
  return outer.shell(wall, (face) => face.inPlane('XY', 0));
};

const accessory = (p: Parameters, design: string): Shape3D => {
  if (design === 'o-ring') {
    const diameter = dimension(p, 'diameter');
    const thickness = dimension(p, 'thickness');
    return drawCircle(thickness / 2)
      .translate((diameter + thickness) / 2, thickness / 2)
      .sketchOnPlane('XZ')
      .revolve();
  }
  if (design === 'flat-gasket' || design === 'fan-guard') {
    const width = dimension(p, 'width');
    const depth = dimension(p, 'depth');
    const thickness = dimension(p, 'thickness');
    const hole = dimension(p, 'hole');
    let profile = drawRoundedRectangle(width, depth, 2);
    const inset = Math.max(hole * 1.5, 4);
    for (const x of [-width / 2 + inset, width / 2 - inset]) {
      for (const y of [-depth / 2 + inset, depth / 2 - inset]) {
        profile = profile.cut(drawCircle(hole / 2).translate(x, y));
      }
    }
    if (design === 'flat-gasket') {
      return profile
        .cut(drawRoundedRectangle(width - 4 * inset, depth - 4 * inset, 1))
        .sketchOnPlane('XY')
        .extrude(thickness);
    }
    const bore = dimension(p, 'bore');
    profile = profile.cut(drawCircle(bore / 2));
    const rim = profile.sketchOnPlane('XY').extrude(thickness);
    const bars = [-1, 0, 1].map((index) =>
      drawRoundedRectangle(2, bore + 3, 0)
        .sketchOnPlane('XY')
        .extrude(thickness)
        .translateX(index * bore * 0.25),
    );
    return rim.fuseAll(bars).fuse(drawCircle(4).sketchOnPlane('XY').extrude(thickness));
  }
  if (design === 'cable-gland' || design === 'cable-grommet' || design === 'panel-blanking-plug') {
    const diameter = dimension(p, 'diameter');
    const height = dimension(p, 'height');
    const flange = dimension(p, 'flangeDiameter');
    const wall = dimension(p, 'thickness');
    const bore = design === 'panel-blanking-plug' ? 0 : dimension(p, 'bore') / 2;
    const profile: Point2D[] = [
      [bore, 0],
      [diameter / 2, 0],
      [diameter / 2, height * 0.35],
      [flange / 2, height * 0.35],
      [flange / 2, height * 0.35 + wall],
      [diameter / 2, height * 0.35 + wall],
      [diameter / 2, height - wall],
      [flange / 2, height - wall],
      [flange / 2, height],
      [bore, height],
    ];
    const body = revolve(profile);
    return design === 'cable-gland'
      ? body
          .fuse(hex(flange * 0.9, height * 0.3).translateZ(height * 0.4))
          .cut(makeCylinder(bore, height + 1, [0, 0, -0.5]))
      : body;
  }
  if (design === 'cable-clip') {
    const diameter = dimension(p, 'diameter');
    const width = dimension(p, 'width');
    const wall = dimension(p, 'wall');
    const ring = drawCircle(diameter / 2 + wall)
      .cut(drawCircle(diameter / 2))
      .cut(drawRoundedRectangle(diameter * 0.65, diameter, 0).translate(0, diameter * 0.6));
    return ring
      .fuse(drawRoundedRectangle(diameter + wall * 2, wall * 2, wall * 0.25).translate(0, -diameter / 2 - wall * 0.5))
      .sketchOnPlane('XY')
      .extrude(width);
  }
  if (design === 'din-rail-clip') {
    const width = dimension(p, 'width');
    const depth = dimension(p, 'depth');
    const height = dimension(p, 'height');
    const wall = dimension(p, 'wall');
    const section = draw([-width / 2, 0])
      .hLine(width)
      .vLine(height)
      .hLine(-wall * 2)
      .vLine(-wall)
      .hLine(wall)
      .vLineTo(wall)
      .hLineTo(-width / 2 + wall)
      .vLineTo(height - wall)
      .hLine(wall)
      .vLine(wall)
      .hLine(-wall * 2)
      .close();
    return section.sketchOnPlane('XZ').extrude(depth);
  }
  throw new Error(`Unknown hardware accessory: ${design}`);
};

// Selected supplier dimension facts, checked 2026-09-30. Threads stay symbolic.
// Socket dk max, k max, s min and t min: Fastenal M.SHCS.4762.A4-80 REV-03.
// https://www.fastenal.com/content/product_specifications/M.SHCS.4762.A4-80.03.pdf
// Hex bolt s nominal/k nominal: Fuller DIN 933 technical table.
// https://fullerfasteners.com/tech/din-933-specifications-hex-head-screws-fully-threaded/
// Nut s max/m max: Aspen Metric_DIN_934_spec.pdf (supplier table, not ISO certification).
// https://www.aspenfasteners.com/content/pdf/Metric_DIN_934_spec.pdf
// Washer ID/OD/t: Woodstock Industrial DIN 125A table.
// https://www.woodstockindustrial.com/specs/din-125a
const metricSizes = [
  {
    diameter: 3,
    cap: 5.68,
    key: 2.52,
    engagement: 1.3,
    hex: 5.5,
    boltHeight: 2,
    nut: 5.5,
    nutHeight: 2.4,
    washerBore: 3.2,
    washer: 7,
    washerHeight: 0.5,
  },
  {
    diameter: 4,
    cap: 7.22,
    key: 3.02,
    engagement: 2,
    hex: 7,
    boltHeight: 2.8,
    nut: 7,
    nutHeight: 3.2,
    washerBore: 4.3,
    washer: 9,
    washerHeight: 0.8,
  },
  {
    diameter: 5,
    cap: 8.72,
    key: 4.02,
    engagement: 2.5,
    hex: 8,
    boltHeight: 3.5,
    nut: 8,
    nutHeight: 4.7,
    washerBore: 5.3,
    washer: 10,
    washerHeight: 1,
  },
  {
    diameter: 6,
    cap: 10.22,
    key: 5.02,
    engagement: 3,
    hex: 10,
    boltHeight: 4,
    nut: 10,
    nutHeight: 5.2,
    washerBore: 6.4,
    washer: 12,
    washerHeight: 1.6,
  },
  {
    diameter: 8,
    cap: 13.27,
    key: 6.02,
    engagement: 4,
    hex: 13,
    boltHeight: 5.3,
    nut: 13,
    nutHeight: 6.8,
    washerBore: 8.4,
    washer: 16,
    washerHeight: 1.6,
  },
  {
    diameter: 10,
    cap: 16.27,
    key: 8.025,
    engagement: 5,
    hex: 17,
    boltHeight: 6.4,
    nut: 16,
    nutHeight: 8.4,
    washerBore: 10.5,
    washer: 20,
    washerHeight: 2,
  },
];

const metricParameters = (input: Parameters, design: string): Parameters => {
  let p = input;
  if (['socket-head-cap-screw', 'hex-head-bolt', 'hex-nut', 'flat-washer'].includes(design)) {
    const size = metricSizes.find((entry) => entry.diameter === input.diameter);
    if (!size) {
      throw new Error('Supported metric diameters are 3, 4, 5, 6, 8 and 10 mm.');
    }
    if (design === 'flat-washer') {
      p = { diameter: size.washer, bore: size.washerBore, thickness: size.washerHeight };
    } else if (design === 'hex-nut') {
      p = { width: size.nut, height: size.nutHeight, bore: size.diameter };
    } else {
      p = {
        diameter: size.diameter,
        length: dimension(input, 'length'),
        headDiameter: design === 'hex-head-bolt' ? size.hex : size.cap,
        headHeight: design === 'hex-head-bolt' ? size.boltHeight : size.diameter,
        socket: size.key,
        socketDepth: size.engagement,
      };
    }
  }
  return p;
};

/**
 * Build one selected hardware family in its local millimetre frame.
 * @internal
 * @param input - Admitted dimensions or one discrete metric diameter and length.
 * @param design - Stable family identifier.
 * @returns One exact BRep solid.
 */
export default function build(input: Parameters, design: string): Shape3D {
  const p = metricParameters(input, design);
  if (
    [
      'socket-head-cap-screw',
      'hex-head-bolt',
      'button-head-socket-screw',
      'countersunk-socket-screw',
      'pan-head-machine-screw',
      'carriage-bolt',
      'knurled-thumbscrew',
    ].includes(design)
  ) {
    return headedScrew(p, design);
  }
  if (
    ['hex-nut', 'castle-nut', 'hex-flange-nut', 'nylon-insert-locknut', 'cap-nut', 'wing-nut', 't-slot-nut'].includes(
      design,
    )
  ) {
    return nut(p, design);
  }
  if (['heat-set-insert', 'rivet-nut'].includes(design)) {
    return insert(p, design);
  }
  if (
    [
      'flat-washer',
      'split-lock-washer',
      'belleville-washer',
      'internal-tooth-lock-washer',
      'slotted-shim',
      'square-washer',
      'tab-washer',
    ].includes(design)
  ) {
    return washer(p, design);
  }
  if (['dowel-pin', 'clevis-pin', 'slotted-spring-pin'].includes(design)) {
    return pin(p, design);
  }
  if (['enclosure-base', 'enclosure-lid'].includes(design)) {
    return enclosure(p, design);
  }
  if (
    [
      'fan-guard',
      'cable-gland',
      'cable-grommet',
      'cable-clip',
      'din-rail-clip',
      'panel-blanking-plug',
      'o-ring',
      'flat-gasket',
    ].includes(design)
  ) {
    return accessory(p, design);
  }
  const { diameter } = p;
  if (design === 'socket-set-screw') {
    return socketCut(blank(dimension(p, 'diameter'), dimension(p, 'length')), {
      width: dimension(p, 'socket'),
      top: dimension(p, 'length'),
    });
  }
  if (design === 'threaded-stud') {
    const d = dimension(p, 'diameter');
    const length = dimension(p, 'length');
    return blank(d, length).cut(
      drawRoundedRectangle(d * 1.2, d * 0.16, 0)
        .sketchOnPlane('XY', length - d * 0.18)
        .extrude(d * 0.3),
    );
  }
  if (design === 'shoulder-screw') {
    const d = dimension(p, 'diameter');
    const length = dimension(p, 'length');
    const head = dimension(p, 'headDiameter');
    const headHeight = dimension(p, 'headHeight');
    const shoulder = dimension(p, 'width');
    const section = revolve([
      [0, 0],
      [d * 0.42, 0],
      [d / 2, d * 0.08],
      [d / 2, length * 0.3],
      [shoulder / 2, length * 0.3],
      [shoulder / 2, length],
      [head / 2, length],
      [head / 2, length + headHeight * 0.9],
      [head * 0.48, length + headHeight],
      [0, length + headHeight],
    ]);
    return socketCut(section, { width: dimension(p, 'socket'), top: length + headHeight });
  }
  if (design === 'eye-bolt') {
    const d = dimension(p, 'diameter');
    const length = dimension(p, 'length');
    const head = dimension(p, 'headDiameter');
    const eye = annulus(head, dimension(p, 'bore'), d)
      .rotate(90, [0, 0, 0], [1, 0, 0])
      .translate([0, d / 2, length + head * 0.3]);
    // Relocate the round shaft's seam before fusion to preserve validity through STEP roundtrips.
    // Clear any shaft intrusion before fusion, avoiding a coincident recut of the ring's bore.
    return blank(d, length)
      .rotate(90, [0, 0, 0], [0, 0, 1])
      .cut(makeCylinder(dimension(p, 'bore') / 2, d + 0.2, [0, -d / 2 - 0.1, length + head * 0.3], [0, 1, 0]))
      .fuse(eye);
  }
  if (design === 'blind-rivet') {
    const d = dimension(p, 'diameter');
    const length = dimension(p, 'length');
    const head = dimension(p, 'headDiameter');
    const headHeight = dimension(p, 'headHeight');
    return revolve([
      [0, 0],
      [d / 2, 0],
      [d / 2, length],
      [head / 2, length],
      [head / 2, length + headHeight],
      [d * 0.18, length + headHeight],
      [d * 0.18, length * 1.6 + headHeight],
      [0, length * 1.6 + headHeight],
    ]);
  }
  if (design === 'tubular-spacer') {
    return annulus(dimension(p, 'diameter'), dimension(p, 'bore'), dimension(p, 'length'));
  }
  if (design === 'hex-standoff') {
    return hex(dimension(p, 'width'), dimension(p, 'length')).cut(
      makeCylinder(dimension(p, 'bore') / 2, dimension(p, 'length') + 1, [0, 0, -0.5]),
    );
  }
  if (design === 'external-retaining-ring') {
    const d = dimension(p, 'diameter');
    const bore = dimension(p, 'bore');
    const thickness = dimension(p, 'thickness');
    const profile = drawCircle(d / 2)
      .cut(drawCircle(bore / 2))
      .cut(drawRoundedRectangle(d * 0.35, d, 0).translate(0, d * 0.5));
    return profile.sketchOnPlane('XY').extrude(thickness);
  }
  if (design === 'parallel-key') {
    const width = dimension(p, 'width');
    const length = dimension(p, 'length');
    if (length <= width) {
      throw new Error('Key length must exceed width.');
    }
    return draw([-width / 2, -length / 2 + width / 2])
      .vLine(length - width)
      .threePointsArcTo([width / 2, length / 2 - width / 2], [0, length / 2])
      .vLine(-(length - width))
      .threePointsArcTo([-width / 2, -length / 2 + width / 2], [0, -length / 2])
      .close()
      .sketchOnPlane('XY')
      .extrude(dimension(p, 'height'));
  }
  if (design === 'woodruff-key') {
    const d = dimension(p, 'diameter');
    return draw([-d / 2, 0])
      .threePointsArcTo([d / 2, 0], [0, -d / 2])
      .close()
      .sketchOnPlane('XZ')
      .extrude(dimension(p, 'width'));
  }
  throw new Error(`Unknown hardware family: ${design}; diameter=${diameter ?? 'unset'}`);
}
