import type { MechanismSource } from '@taucad/kinematics';
import {
  draw,
  drawCircle,
  drawPointsInterpolation,
  drawRoundedRectangle,
  makeBox,
  makeCylinder,
  measureVolume,
  type Plane,
  type Shape3D,
  type ShapeConfig,
  type Sketch,
} from 'replicad';

export const defaultParams = {
  headHeight: 1120,
  tilt: 0,
  yaw: 0,
  bladeCount: 5,
  part: 'all',
};

const colors = {
  ivory: '#E8E3D5',
  teal: '#173F48',
  blade: '#437F85',
  steel: '#B6C5C8',
  brass: '#CB9E56',
  rubber: '#252B2D',
  dark: '#303E43',
};

function tube(outer: number, inner: number, height: number): Shape3D {
  return drawCircle(outer)
    .cut(drawCircle(inner))
    .sketchOnPlane('XY')
    .extrude(height);
}

function ring(radius: number, wire: number, depth: number): Shape3D {
  return drawCircle(wire)
    .translate([radius, depth])
    .sketchOnPlane('XY')
    .revolve([0, 1, 0], { origin: [0, 0, 0] });
}

function guard(front: boolean): Shape3D {
  type Point = [number, number];
  const start: Point = front ? [30, 64] : [59, 49];
  const first: Point = front ? [112, 67] : [122, 50];
  const second: Point = front ? [187, 45] : [192, 42];
  const end: Point = [216, 5];
  const spoke = draw([start[0], start[1] - 0.85])
    .bezierCurveTo(
      [end[0], end[1] - 0.85],
      [
        [first[0], first[1] - 0.85],
        [second[0], second[1] - 0.85],
      ],
    )
    .lineTo([end[0], end[1] + 0.85])
    .bezierCurveTo(
      [start[0], start[1] + 0.85],
      [
        [second[0], second[1] + 0.85],
        [first[0], first[1] + 0.85],
      ],
    )
    .close()
    .sketchOnPlane('XY', -0.8)
    .extrude(1.6);
  const spokes: Shape3D[] = Array.from({ length: 36 }, (_, index) =>
    spoke.clone().rotate(index * 10, [0, 0, 0], [0, 1, 0]),
  );
  const members: Shape3D[] = [];
  for (const fraction of [0.25, 0.5, 0.75]) {
    // Cubic Bézier point at `fraction` along the spoke centreline.
    const weights = [
      (1 - fraction) ** 3,
      3 * (1 - fraction) ** 2 * fraction,
      3 * (1 - fraction) * fraction ** 2,
      fraction ** 3,
    ];
    const points = [start, first, second, end];
    const radius = points.reduce(
      (total, point, index) => total + point[0] * (weights[index] ?? 0),
      0,
    );
    const depth = points.reduce(
      (total, point, index) => total + point[1] * (weights[index] ?? 0),
      0,
    );
    members.push(
      tube(radius + 1.2, radius - 1.2, 2.4)
        .rotate(90, [0, 0, 0], [1, 0, 0])
        .translate([0, depth + 1.2, 0]),
    );
  }
  members.push(
    tube(219, 214, 4)
      .rotate(90, [0, 0, 0], [1, 0, 0])
      .translate([0, end[1] + 2, 0]),
  );
  const lattice = tube(start[0] + 2, start[0] - 2, 3)
    .rotate(90, [0, 0, 0], [1, 0, 0])
    .translate([0, start[1] + 1.5, 0])
    .fuseAll(spokes);
  if (measureVolume(lattice) < 1) {
    throw new Error(
      `Guard lattice is empty; spoke volume ${measureVolume(spoke)}`,
    );
  }
  let complete = lattice;
  for (const [index, member] of members.entries()) {
    complete = complete.fuse(member);
    if (measureVolume(complete) < 1) {
      throw new Error(
        `Guard ring ${index} union is empty; ring volume ${measureVolume(member)}`,
      );
    }
  }
  return complete.rotate(front ? 180 : 0, [0, 0, 0], [0, 0, 1]);
}

function resolveParams(parameters: Partial<typeof defaultParams>) {
  const params = { ...defaultParams, ...parameters };
  if (
    !Number.isFinite(params.headHeight) ||
    params.headHeight < 1020 ||
    params.headHeight > 1320
  ) {
    throw new Error('headHeight must be between 1020 and 1320 mm');
  }
  if (!Number.isFinite(params.tilt) || params.tilt < -15 || params.tilt > 25) {
    throw new Error('tilt must be between -15 and 25 degrees');
  }
  if (!Number.isFinite(params.yaw) || params.yaw < -45 || params.yaw > 45) {
    throw new Error('yaw must be between -45 and 45 degrees');
  }
  if (
    !Number.isInteger(params.bladeCount) ||
    params.bladeCount < 3 ||
    params.bladeCount > 7
  ) {
    throw new Error('bladeCount must be an integer from 3 to 7');
  }

  return params;
}

export default function main(
  parameters: Partial<typeof defaultParams> = defaultParams,
): ShapeConfig[] {
  const params = resolveParams(parameters);
  const shapes: ShapeConfig[] = [];
  const centerHeight = params.headHeight;
  const pivot: [number, number, number] = [0, 35, centerHeight - 40];
  const wanted = (group: string, name = group) =>
    params.part === 'all' ||
    params.part === group ||
    params.part === name ||
    (params.part === 'enclosed-blades' && group === 'blades') ||
    (params.part === 'rotation-clearance' &&
      [
        'front-guard',
        'rear-guard',
        'guard-band',
        'blades',
        'rotor-envelope',
      ].includes(group));
  const add = (
    group: string,
    name: string,
    build: () => Shape3D,
    color: string,
    moving: 'head' | 'neck' | false = false,
  ) => {
    if (!wanted(group, name)) {
      return;
    }
    let shape = build();
    if (moving === 'head') {
      shape = shape
        .translate([0, -60, centerHeight])
        .rotate(params.tilt, pivot, [1, 0, 0]);
    }
    if (moving) {
      shape = shape.rotate(params.yaw, [0, 70, 0], [0, 0, 1]);
    }
    shapes.push({
      shape,
      color,
      name,
      metalness: color === colors.steel || color === colors.brass ? 0.65 : 0.12,
      roughness: 0.38,
    });
  };

  add(
    'base',
    'base',
    () =>
      makeCylinder(195, 30, [0, 0, 6])
        .fillet(6)
        .cutAll(
          [-110, 110].flatMap((horizontal) =>
            [-110, 110].map((depth) =>
              makeCylinder(3.2, 20, [horizontal, depth, 5]),
            ),
          ),
        ),
    colors.ivory,
  );
  for (let index = 0; index < 4; index++) {
    const horizontal = index % 2 ? 110 : -110;
    const depth = index < 2 ? -110 : 110;
    add(
      'feet',
      `foot-${index + 1}`,
      () =>
        makeCylinder(15, 6, [horizontal, depth, 0]).fuse(
          makeCylinder(3, 17, [horizontal, depth, 5]),
        ),
      colors.rubber,
    );
  }
  add(
    'socket',
    'socket',
    () => tube(35, 16.3, 64).translate([0, 70, 36]),
    colors.teal,
  );
  add(
    'outer-tube',
    'outer-tube',
    () => tube(16, 13, 645).translate([0, 70, 65]),
    colors.teal,
  );
  add(
    'inner-tube',
    'inner-tube',
    () => tube(12, 10, 590).translate([0, 70, centerHeight - 700]),
    colors.steel,
  );
  add(
    'height-collar',
    'height-collar',
    () =>
      tube(22, 16.3, 38)
        .translate([0, 70, 700])
        .cut(makeCylinder(4.2, 16, [12, 70, 725], [1, 0, 0])),
    colors.teal,
  );
  add(
    'height-knob',
    'height-knob',
    () =>
      makeCylinder(4, 23, [12, 70, 725], [1, 0, 0]).fuse(
        makeCylinder(12, 12, [32, 70, 725], [1, 0, 0]),
      ),
    colors.brass,
  );
  add(
    'neck',
    'neck',
    () =>
      drawRoundedRectangle(32, 50, 8)
        .sketchOnPlane('XY')
        .extrude(19)
        .translate([0, 70, centerHeight - 110])
        .fuseAll([
          makeBox([-70, 22, centerHeight - 98], [-62, 48, centerHeight - 40]),
          makeBox([62, 22, centerHeight - 98], [70, 48, centerHeight - 40]),
          makeBox([-70, 22, centerHeight - 98], [70, 70, centerHeight - 90]),
          makeCylinder(13, 8, [-70, 35, centerHeight - 40], [1, 0, 0]),
          makeCylinder(13, 8, [62, 35, centerHeight - 40], [1, 0, 0]),
        ])
        .cut(makeCylinder(5.2, 150, [-75, 35, centerHeight - 40], [1, 0, 0])),
    colors.teal,
    'neck',
  );
  add(
    'tilt-knob',
    'tilt-knob',
    () =>
      makeCylinder(5, 150, [-75, 35, centerHeight - 40], [1, 0, 0]).fuse(
        makeCylinder(16, 14, [70.3, 35, centerHeight - 40], [1, 0, 0]),
      ),
    colors.brass,
    'neck',
  );

  add(
    'motor-shell',
    'motor-shell',
    () => {
      const slot = draw([-2, -9])
        .lineTo([-2, 9])
        .threePointsArcTo([2, 9], [0, 11])
        .lineTo([2, -9])
        .threePointsArcTo([-2, -9], [0, -11])
        .close()
        .translate([0, 35])
        .sketchOnPlane('XZ', -147)
        .extrude(9);
      return makeCylinder(58, 100, [0, 45, 0], [0, 1, 0]).cutAll([
        makeCylinder(54, 96.5, [0, 44, 0], [0, 1, 0]),
        makeCylinder(5.2, 150, [-75, 95, -40], [1, 0, 0]),
        makeCylinder(4.2, 20, [0, 124, 52]),
        ...Array.from({ length: 8 }, (_, index) =>
          slot.clone().rotate(index * 45, [0, 0, 0], [0, 1, 0]),
        ),
      ]);
    },
    colors.ivory,
    'head',
  );
  add(
    'motor-core',
    'motor-core',
    () =>
      makeCylinder(31, 48, [0, 64, 0], [0, 1, 0]).cut(
        makeCylinder(5.2, 50, [0, 63, 0], [0, 1, 0]),
      ),
    colors.dark,
    'head',
  );
  add(
    'shaft',
    'shaft',
    () => makeCylinder(5, 90, [0, -25, 0], [0, 1, 0]),
    colors.steel,
    'head',
  );
  add(
    'oscillation-knob',
    'oscillation-knob',
    () =>
      makeCylinder(4, 18, [0, 124, 57]).fuse(makeCylinder(10, 7, [0, 124, 72])),
    colors.brass,
    'head',
  );

  add('front-guard', 'front-guard', () => guard(true), colors.steel, 'head');
  add(
    'rear-guard',
    'rear-guard',
    () =>
      guard(false)
        .fuse(
          tube(61, 8, 6).rotate(90, [0, 0, 0], [1, 0, 0]).translate([0, 49, 0]),
        )
        .cut(
          tube(58.2, 53.8, 7)
            .rotate(90, [0, 0, 0], [1, 0, 0])
            .translate([0, 51, 0]),
        ),
    colors.teal,
    'head',
  );
  add(
    'guard-band',
    'guard-band',
    () =>
      tube(220, 214, 6).rotate(90, [0, 0, 0], [1, 0, 0]).translate([0, 3, 0]),
    colors.teal,
    'head',
  );
  for (let index = 0; index < 4; index++) {
    add(
      'guard-clips',
      `guard-clip-${index + 1}`,
      () =>
        makeBox([218, -10, -6], [222, 10, 6])
          .fuseAll([
            makeBox([215.5, -10, -6], [221, -7, 6]),
            makeBox([215.5, 7, -6], [221, 10, 6]),
          ])
          .cut(makeCylinder(220.15, 14.2, [0, -7.1, 0], [0, 1, 0]))
          .rotate(index * 90, [0, 0, 0], [0, 1, 0]),
      colors.brass,
      'head',
    );
    add(
      'motor-screws',
      `motor-screw-${index + 1}`,
      () =>
        makeCylinder(3.5, 3, [42, 40, 0], [0, 1, 0])
          .cut(makeBox([41.3, 39, -3], [42.7, 41, 3]))
          .rotate(45 + index * 90, [0, 0, 0], [0, 1, 0]),
      colors.brass,
      'head',
    );
  }

  if (wanted('blades') || /^blade-[1-7]$/.test(params.part)) {
    let blade = draw([-14, 25])
      .bezierCurveTo(
        [24, 181],
        [
          [-25, 86],
          [-13, 165],
        ],
      )
      .bezierCurveTo(
        [72, 183],
        [
          [39, 200],
          [67, 206],
        ],
      )
      .bezierCurveTo(
        [22, 30],
        [
          [96, 145],
          [63, 67],
        ],
      )
      .close()
      .sketchOnPlane('XZ')
      .extrude(3)
      .rotate(14, [0, 0, 0], [0, 0, 1])
      .translate([0, -6, 0]);
    if (params.part === 'enclosed-blades') {
      blade = blade.intersect(makeCylinder(206, 28, [0, -14, 0], [0, 1, 0]));
    }
    for (let index = 0; index < params.bladeCount; index++) {
      add(
        'blades',
        `blade-${index + 1}`,
        () =>
          blade
            .clone()
            .rotate((index * 360) / params.bladeCount, [0, 0, 0], [0, 1, 0]),
        colors.blade,
        'head',
      );
    }
  }
  add(
    'hub',
    'hub',
    () =>
      tube(38, 5.2, 32).rotate(90, [0, 0, 0], [1, 0, 0]).translate([0, 2, 0]),
    colors.brass,
    'head',
  );
  if (params.part === 'rotation-clearance') {
    add(
      'rotor-envelope',
      'rotor-envelope',
      () => makeCylinder(206, 28, [0, -14, 0], [0, 1, 0]),
      colors.brass,
      'head',
    );
  }
  add(
    'badge',
    'badge',
    () => makeCylinder(32, 4, [0, -68, 0], [0, 1, 0]),
    colors.teal,
    'head',
  );
  add(
    'badge-mark',
    'badge-mark',
    () =>
      ring(18, 0.8, -68.8).fuseAll([
        makeBox([-10, -69.5, -1], [10, -68.1, 1]),
        makeBox([-1, -69.5, -10], [1, -68.1, 10]),
      ]),
    colors.brass,
    'head',
  );

  add(
    'control-body',
    'control-body',
    () =>
      drawRoundedRectangle(48, 126, 13)
        .sketchOnPlane('XZ')
        .extrude(25)
        .translate([0, 64, 518])
        .cut(makeCylinder(16.25, 130, [0, 70, 453])),
    colors.ivory,
  );
  for (let index = 0; index < 4; index++) {
    const height = 560 - index * 28;
    add(
      'buttons',
      `button-${index + 1}`,
      () => makeCylinder(8, 4, [0, 35, height], [0, 1, 0]),
      index === 0 ? colors.brass : colors.teal,
    );
    add(
      'control-marks',
      `control-mark-${index + 1}`,
      () =>
        index === 0
          ? tube(3.2, 2.3, 0.7)
              .rotate(90, [0, 0, 0], [1, 0, 0])
              .translate([0, 35, height])
          : makeBox([-0.6, 34.3, height - 3], [0.6, 35, height + 3]).fuseAll(
              Array.from({ length: index - 1 }, (_, mark) =>
                makeBox(
                  [2 + mark * 2.5, 34.3, height - 3],
                  [3.2 + mark * 2.5, 35, height + 3],
                ),
              ),
            ),
      colors.ivory,
    );
  }
  add(
    'power-cord',
    'power-cord',
    () =>
      (
        drawPointsInterpolation([
          [60, 456],
          [90, 390],
          [96, 240],
          [126, 95],
          [175, 45],
          [202, 42],
          [224, 25],
          [257, 12],
        ]).sketchOnPlane('YZ') as Sketch
      )
        .sweepSketch(
          (plane: Plane) => drawCircle(2.5).sketchOnPlane(plane) as Sketch,
        )
        .translate([20, 0, 0]),
    colors.rubber,
  );
  add(
    'plug',
    'plug',
    () =>
      drawRoundedRectangle(26, 30, 7)
        .sketchOnPlane('XY')
        .extrude(18)
        .translate([20, 270, 0])
        .fuseAll([
          makeCylinder(2.3, 20, [14, 283, 9], [0, 1, 0]),
          makeCylinder(2.3, 20, [26, 283, 9], [0, 1, 0]),
        ]),
    colors.rubber,
  );

  if (shapes.length === 0) {
    throw new Error(`Unknown component: ${params.part}`);
  }
  return shapes;
}

/** Height, oscillation, tilt and rotor spin in the same as-built frame as the geometry. */
export function mechanism(
  parameters: Partial<typeof defaultParams> = {},
): MechanismSource | undefined {
  const p = resolveParams(parameters);
  if (p.part !== 'all') {
    return undefined;
  }
  const yaw = (p.yaw * Math.PI) / 180;
  const tilt = (p.tilt * Math.PI) / 180;
  const rotateYaw = ([x, y, z]: [number, number, number]): [
    number,
    number,
    number,
  ] => [
    x * Math.cos(yaw) - (y - 70) * Math.sin(yaw),
    70 + x * Math.sin(yaw) + (y - 70) * Math.cos(yaw),
    z,
  ];
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'base',
    links: {
      base: {
        shapes: [
          'base',
          ...[1, 2, 3, 4].map((index) => `foot-${index}`),
          'socket',
          'outer-tube',
          'height-collar',
          'height-knob',
          'control-body',
          ...[1, 2, 3, 4].flatMap((index) => [
            `button-${index}`,
            `control-mark-${index}`,
          ]),
          'power-cord',
          'plug',
        ],
      },
      column: { shapes: ['inner-tube'] },
      yoke: { shapes: ['neck', 'tilt-knob'] },
      head: {
        shapes: [
          'motor-shell',
          'motor-core',
          'oscillation-knob',
          'front-guard',
          'rear-guard',
          'guard-band',
          ...[1, 2, 3, 4].flatMap((index) => [
            `guard-clip-${index}`,
            `motor-screw-${index}`,
          ]),
          'badge',
          'badge-mark',
        ],
      },
      rotor: {
        shapes: [
          'shaft',
          'hub',
          ...Array.from(
            { length: p.bladeCount },
            (_, index) => `blade-${index + 1}`,
          ),
        ],
      },
    },
    joints: {
      height: {
        type: 'prismatic',
        name: 'Head height',
        parent: 'base',
        child: 'column',
        origin: [0, 70, p.headHeight - 110],
        axis: [0, 0, 1],
        limits: { lower: 1020 - p.headHeight, upper: 1320 - p.headHeight },
      },
      yaw: {
        type: 'revolute',
        name: 'Oscillation',
        parent: 'column',
        child: 'yoke',
        origin: [0, 70, p.headHeight - 110],
        axis: [0, 0, 1],
        limits: { lower: -45 - p.yaw, upper: 45 - p.yaw },
      },
      tilt: {
        type: 'revolute',
        name: 'Head tilt',
        parent: 'yoke',
        child: 'head',
        origin: rotateYaw([0, 35, p.headHeight - 40]),
        axis: [Math.cos(yaw), Math.sin(yaw), 0],
        limits: { lower: -15 - p.tilt, upper: 25 - p.tilt },
      },
      rotor: {
        type: 'revolute',
        name: 'Rotor',
        parent: 'head',
        child: 'rotor',
        origin: rotateYaw([
          0,
          35 - 95 * Math.cos(tilt) - 40 * Math.sin(tilt),
          p.headHeight - 40 - 95 * Math.sin(tilt) + 40 * Math.cos(tilt),
        ]),
        axis: [
          -Math.cos(tilt) * Math.sin(yaw),
          Math.cos(tilt) * Math.cos(yaw),
          Math.sin(tilt),
        ],
      },
    },
    animations: [
      {
        id: 'spin',
        name: 'Spin rotor',
        duration: 3,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { rotor: 0 } },
          { time: 3, coordinates: { rotor: 720 } },
        ],
      },
      {
        id: 'oscillate',
        name: 'Oscillate head',
        duration: 6,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { yaw: -45 - p.yaw } },
          { time: 6, coordinates: { yaw: 45 - p.yaw } },
        ],
      },
      {
        id: 'tilt',
        name: 'Tilt head',
        duration: 4,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { tilt: -15 - p.tilt } },
          { time: 4, coordinates: { tilt: 25 - p.tilt } },
        ],
      },
      {
        id: 'height',
        name: 'Extend column',
        duration: 4,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { height: 1020 - p.headHeight } },
          { time: 4, coordinates: { height: 1320 - p.headHeight } },
        ],
      },
    ],
  };
}
