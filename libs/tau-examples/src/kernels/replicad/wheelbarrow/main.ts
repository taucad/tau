import type { MechanismSource } from '@taucad/kinematics';
import {
  draw,
  drawCircle,
  drawPolysides,
  drawRoundedRectangle,
  makeCylinder,
  makeSphere,
  type Drawing,
  type Shape3D,
  type ShapeConfig,
  type SimplePoint,
  type Sketch,
} from 'replicad';

// Millimetres; front is -X, axle is Y, ground is Z=0.
export const defaultParams = {
  trayWidth: 660,
  trayDepth: 280,
  part: 'assembly',
};

function rod(a: SimplePoint, b: SimplePoint, radius: number): Shape3D {
  const direction: SimplePoint = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return makeCylinder(radius, Math.hypot(...direction), a, direction);
}

function rail(points: SimplePoint[], radius: number): Shape3D {
  const [first, ...rest] = points
    .slice(1)
    .map((b, index) => rod(points[index]!, b, radius));
  if (!first) {
    throw new Error('A rail needs at least two points.');
  }
  const joints = points
    .slice(1, -1)
    .map((p) => makeSphere(radius).translate(p));
  return first.fuseAll([...rest, ...joints]);
}

function revolve(profile: Drawing): Shape3D {
  return profile.sketchOnPlane('XY').revolve([0, 1, 0], { origin: [0, 0, 0] });
}

function resolveParams(params: Partial<typeof defaultParams>) {
  const p = { ...defaultParams, ...params };
  if (
    !Number.isFinite(p.trayWidth) ||
    p.trayWidth < 600 ||
    p.trayWidth > 780 ||
    !Number.isFinite(p.trayDepth) ||
    p.trayDepth < 240 ||
    p.trayDepth > 360
  ) {
    throw new Error('Tray width must be 600–780 mm and tray depth 240–360 mm.');
  }
  return p;
}

export default function main(
  params: Partial<typeof defaultParams> = defaultParams,
): ShapeConfig[] {
  const p = resolveParams(params);
  const parts: ShapeConfig[] = [];
  const add = (
    name: string,
    shape: Shape3D,
    color: string,
    metalness = 0.5,
    roughness = 0.35,
  ) => {
    parts.push({ name, shape, color, metalness, roughness });
  };

  // A tapered, open hopper with a 4 mm floor, 3 mm horizontal wall offset,
  // and a wide reinforced top lip. The cavity extends beyond the top face.
  const section = (
    length: number,
    width: number,
    radius: number,
    x: number,
    z: number,
  ) =>
    drawRoundedRectangle(length, width, radius)
      .translate(x, 0)
      .sketchOnPlane('XY', z) as Sketch;
  const top = 450 + p.trayDepth;
  const outside = section(600, 400, 40, -80, 450).loftWith(
    section(900, p.trayWidth, 70, -130, top),
    { ruled: true },
  );
  const innerSection = (h: number) =>
    section(
      594 + (300 * h) / p.trayDepth,
      394 + ((p.trayWidth - 400) * h) / p.trayDepth,
      37 + (30 * h) / p.trayDepth,
      -80 - (50 * h) / p.trayDepth,
      450 + h,
    );
  const cavity = innerSection(4).loftWith(innerSection(p.trayDepth + 20), {
    ruled: true,
  });
  const lip = drawRoundedRectangle(916, p.trayWidth + 16, 78)
    .cut(drawRoundedRectangle(884, p.trayWidth - 16, 62))
    .translate(-130, 0)
    .sketchOnPlane('XY', top - 6)
    .extrude(12);
  add('Tray', outside.cut(cavity).fuse(lip), '#e96824', 0.35, 0.32);

  const rightRail: SimplePoint[] = [
    [-540, 98, 236],
    [-300, 170, 432],
    [260, 215, 432],
    [880, 275, 662],
  ];
  const left = (s: Shape3D) => s.clone().mirror('XZ');
  // ponytail: closed solid frame members represent the external steel profile;
  // add tube bores and weld details when fabrication or material mass is required.
  const sideRail = rail(rightRail, 18);
  const stand = rail(
    [
      [190, 209.375, 432],
      [280, 230, 18],
      [420, 245, 18],
      [480, 236.29, 513.61],
    ],
    16,
  );
  const foot = drawRoundedRectangle(180, 52, 12)
    .translate(350, 239)
    .sketchOnPlane('XY')
    .extrude(6);
  const eye = makeCylinder(22, 24, [-540, 86, 190], [0, 1, 0]);
  const forkNeck = rod([-540, 98, 206], [-540, 98, 242], 12);
  const chassis = sideRail
    .fuseAll([
      left(sideRail),
      stand,
      left(stand),
      foot,
      left(foot),
      eye,
      left(eye),
      forkNeck,
      left(forkNeck),
      rod([-260, -174, 432], [-260, 174, 432], 18),
      rod([130, -205, 432], [130, 205, 432], 18),
      rod([249.13, -222.925, 160], [249.13, 222.925, 160], 12),
    ])
    .cut(makeCylinder(10.5, 260, [-540, -130, 190], [0, 1, 0]));
  add('Chassis', chassis, '#293e47', 0.6, 0.32);

  const wheelPosition: SimplePoint = [-540, 0, 190];
  const tireProfile = draw([112, -42])
    .lineTo([165, -48])
    .threePointsArcTo([190, -20], [183, -40])
    .lineTo([190, 20])
    .threePointsArcTo([165, 48], [183, 40])
    .lineTo([112, 42])
    .close();
  const grooves = [-27, -9, 9, 27].map((y) =>
    revolve(
      draw([186, y - 2])
        .lineTo([198, y - 2])
        .lineTo([198, y + 2])
        .lineTo([186, y + 2])
        .close(),
    ),
  );
  const tire = revolve(tireProfile).cutAll(grooves).translate(wheelPosition);
  add('Tire', tire, '#23272a', 0, 0.92);

  const rimProfile = draw([10.8, -70])
    .lineTo([25, -70])
    .lineTo([25, -12])
    .lineTo([92, -12])
    .lineTo([105, -42])
    .lineTo([112, -42])
    .lineTo([112, 42])
    .lineTo([105, 42])
    .lineTo([92, 12])
    .lineTo([25, 12])
    .lineTo([25, 70])
    .lineTo([10.8, 70])
    .close();
  const holes = Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return makeCylinder(
      12,
      160,
      [66 * Math.cos(angle), -80, 66 * Math.sin(angle)],
      [0, 1, 0],
    );
  });
  add(
    'Wheel rim',
    revolve(rimProfile).cutAll(holes).translate(wheelPosition),
    '#d4dce0',
    0.8,
    0.26,
  );
  add(
    'Axle',
    makeCylinder(10, 252, [-540, -126, 190], [0, 1, 0]),
    '#a8b2ba',
    0.85,
    0.25,
  );

  const spacer = drawCircle(17)
    .cut(drawCircle(10.5))
    .sketchOnPlane('XY')
    .extrude(16)
    .rotate(-90, [0, 0, 0], [1, 0, 0])
    .translate([-540, 70, 190]);
  const nut = drawPolysides(17, 6)
    .cut(drawCircle(10.5))
    .sketchOnPlane('XY')
    .extrude(12)
    .rotate(-90, [0, 0, 0], [1, 0, 0])
    .translate([-540, 111, 190]);

  const direction: SimplePoint = [620, 60, 230];
  const length = Math.hypot(...direction);
  const end: SimplePoint = [880, 275, 662];
  const pointOnHandle = (offset: number): SimplePoint => [
    end[0] + (direction[0] * offset) / length,
    end[1] + (direction[1] * offset) / length,
    end[2] + (direction[2] * offset) / length,
  ];
  const grip = rod(pointOnHandle(-140), pointOnHandle(8), 22).cut(
    rod(pointOnHandle(-141), pointOnHandle(1), 18.2),
  );
  for (const [name, shape, color, metalness, roughness] of [
    ['spacer', spacer, '#a8b2ba', 0.8, 0.3],
    ['nut', nut, '#a8b2ba', 0.8, 0.3],
    ['grip', grip, '#20292e', 0, 0.88],
  ] as const) {
    add(`Right ${name}`, shape, color, metalness, roughness);
    add(`Left ${name}`, left(shape), color, metalness, roughness);
  }
  if (p.part !== 'assembly' && !parts.some((part) => part.name === p.part)) {
    throw new Error(`Unknown component: ${p.part}`);
  }
  return p.part === 'assembly'
    ? parts
    : parts.filter((part) => part.name === p.part);
}

/** Only the rim and tire roll; the axle, spacers and chassis remain fixed. */
export function mechanism(
  parameters: Partial<typeof defaultParams> = {},
): MechanismSource | undefined {
  const p = resolveParams(parameters);
  if (p.part !== 'assembly') {
    return undefined;
  }
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'frame',
    links: {
      frame: {
        shapes: [
          'Tray',
          'Chassis',
          'Axle',
          'Right spacer',
          'Left spacer',
          'Right nut',
          'Left nut',
          'Right grip',
          'Left grip',
        ],
      },
      wheel: { shapes: ['Tire', 'Wheel rim'] },
    },
    joints: {
      wheel: {
        type: 'revolute',
        name: 'Wheel',
        parent: 'frame',
        child: 'wheel',
        origin: [-540, 0, 190],
        axis: [0, 1, 0],
      },
    },
    animations: [
      {
        id: 'wheel-roll',
        name: 'Roll wheel',
        duration: 4,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { wheel: 0 } },
          { time: 4, coordinates: { wheel: 360 } },
        ],
      },
    ],
  };
}
