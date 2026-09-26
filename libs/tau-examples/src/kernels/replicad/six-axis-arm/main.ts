/**
 * Six-Axis Arm
 * A compact six-revolute industrial arm (yaw, pitch, pitch, roll, pitch, roll) with a
 * spherical wrist and a parallel gripper. The joint angles are parameters that pose the
 * as-built model; the exported mechanism moves it from there.
 */
import {
  draw,
  makeBox,
  makeCylinder,
  type Drawing,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';
import type { MechanismSource } from '@taucad/kinematics';

export const defaultParams = {
  height: 300,
  reach: 560,
  j1: 0,
  j2: 0,
  j3: 0,
  j4: 0,
  j5: 0,
  j6: 0,
};

type Params = typeof defaultParams;
type Vec = [number, number, number];
type JointId = 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6';

// Absolute joint travel in degrees; one table drives parameter checks and mechanism limits.
const limits: Record<JointId, [number, number]> = {
  j1: [-170, 170],
  j2: [-90, 120],
  j3: [-150, 150],
  j4: [-180, 180],
  j5: [-120, 120],
  j6: [-360, 360],
};

// Wrist centre to tool-flange face along the flange axis.
const flangeOffset = 70;

// Every returned shape and the link that carries it.
const linkOf: Record<string, string> = {
  'Base pedestal': 'base',
  Turret: 'turret',
  'Shoulder motor': 'turret',
  'Upper arm': 'upper-arm',
  'Elbow motor': 'upper-arm',
  Forearm: 'forearm',
  'Wrist housing': 'wrist',
  'Wrist pitch body': 'hand',
  'Tool flange': 'tool',
  Gripper: 'tool',
};

// Joints in the home configuration (all angles zero): upper arm vertical, forearm and tool
// pointing along +X. Positive j2/j3/j5 pitch the arm forward and down (right-hand rule about +Y).
const homeJoints = (p: Params) => {
  const shoulderZ = p.height;
  const elbowZ = p.height + p.reach / 2;
  const wristX = p.reach / 2;
  const joint = (
    id: JointId,
    parent: string,
    child: string,
    origin: Vec,
    axis: Vec,
  ) => ({
    id,
    parent,
    child,
    origin,
    axis,
  });
  return [
    joint('j1', 'base', 'turret', [0, 0, 0], [0, 0, 1]),
    joint('j2', 'turret', 'upper-arm', [0, 0, shoulderZ], [0, 1, 0]),
    joint('j3', 'upper-arm', 'forearm', [0, 0, elbowZ], [0, 1, 0]),
    joint('j4', 'forearm', 'wrist', [0, 0, elbowZ], [1, 0, 0]),
    joint('j5', 'wrist', 'hand', [wristX, 0, elbowZ], [0, 1, 0]),
    joint('j6', 'hand', 'tool', [wristX + flangeOffset, 0, elbowZ], [1, 0, 0]),
  ];
};

// Rodrigues rotation of `v` by `deg` about the unit `axis` through `origin`.
const turn = (v: Vec, axis: Vec, deg: number, origin: Vec = [0, 0, 0]): Vec => {
  const t = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const [x, y, z] = [v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]];
  const [u, w, n] = axis;
  const dot = (u * x + w * y + n * z) * (1 - c);
  return [
    origin[0] + x * c + (w * z - n * y) * s + u * dot,
    origin[1] + y * c + (n * x - u * z) * s + w * dot,
    origin[2] + z * c + (u * y - w * x) * s + n * dot,
  ];
};

const checkParams = (p: Params) => {
  if (
    !(p.height >= 200 && p.height <= 400) ||
    !(p.reach >= 480 && p.reach <= 720)
  ) {
    throw new Error(
      'Use a shoulder height of 200–400 mm and a reach of 480–720 mm.',
    );
  }
  for (const [id, [lower, upper]] of Object.entries(limits)) {
    const value = p[id as JointId];
    if (!(value >= lower && value <= upper)) {
      throw new Error(
        `${id} must lie within ${lower}…${upper} degrees; received ${value}.`,
      );
    }
  }
};

// Turned drum along +Z (0 → length) with a chamfered far edge, turned onto `axis` and moved to `at`.
const drum = (
  radius: number,
  length: number,
  at: Vec,
  axis: 'x' | 'y' | 'z',
) => {
  const c = Math.min(2, radius / 10, length / 4);
  const blank = draw([0, 0])
    .hLineTo(radius)
    .vLineTo(length - c)
    .lineTo([radius - c, length])
    .hLineTo(0)
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  const oriented =
    axis === 'x'
      ? blank.rotate(90, [0, 0, 0], [0, 1, 0])
      : axis === 'y'
        ? blank.rotate(-90, [0, 0, 0], [1, 0, 0])
        : blank;
  return oriented.translate(at);
};

// Profile drawn in world (x, z) and extruded across y0 → y1 (the XZ sketch plane extrudes toward -Y).
const plate = (profile: Drawing, y0: number, y1: number) =>
  profile
    .sketchOnPlane('XZ')
    .extrude(y1 - y0)
    .translate([0, y1, 0]);

export default function main(
  params: Partial<Params> = defaultParams,
): ShapeConfig[] {
  const p = { ...defaultParams, ...params };
  checkParams(p);
  const h = p.height;
  const armLength = p.reach / 2;
  const elbowZ = h + armLength;
  const wristX = armLength;
  const home = homeJoints(p);

  // Base: one revolved pedestal section with a cable bore and four M12 anchor holes (Ø13.5, PCD 196).
  const anchorHoles = [45, 135, 225, 315].map((a) =>
    makeCylinder(6.75, 20, [
      98 * Math.cos((a * Math.PI) / 180),
      98 * Math.sin((a * Math.PI) / 180),
      -2,
    ]),
  );
  const pedestal = draw([30, 0])
    .hLineTo(110)
    .vLineTo(16)
    .hLineTo(90)
    .lineTo([80, 26])
    .vLineTo(108)
    .lineTo([78, 110])
    .hLineTo(30)
    .close()
    .sketchOnPlane('XZ')
    .revolve()
    .cutAll(anchorHoles);

  // Turret: revolved turntable hub carrying a clevis whose cheeks straddle the shoulder hub.
  const turntable = draw([30, 111])
    .hLineTo(90)
    .vLineTo(146)
    .lineTo([86, 150])
    .hLineTo(30)
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  const cheek = () =>
    draw([-45, 146])
      .lineTo([45, 146])
      .lineTo([50, h])
      .threePointsArcTo([-50, h], [0, h + 50])
      .close();
  const turret = turntable
    .fuse(plate(cheek(), 56, 76))
    .fuse(plate(cheek(), -76, -56));
  const shoulderMotor = drum(40, 50, [0, 76, h], 'y');

  // Upper arm: shoulder hub and two tapered side plates with a lightening window.
  const sidePlate = () =>
    draw([50, h])
      .lineTo([40, elbowZ])
      .threePointsArcTo([-40, elbowZ], [0, elbowZ + 40])
      .lineTo([-50, h])
      .threePointsArcTo([50, h], [0, h - 50])
      .close();
  const lightening = draw([-18, h + 90])
    .lineTo([18, h + 90])
    .lineTo([18, elbowZ - 90])
    .threePointsArcTo([-18, elbowZ - 90], [0, elbowZ - 72])
    .close();
  const upperArm = drum(55, 108, [0, -54, h], 'y')
    .fuse(plate(sidePlate(), 32, 52))
    .fuse(plate(sidePlate(), -52, -32))
    .cut(plate(lightening, -60, 60));
  const elbowMotor = drum(32, 36, [0, 52, elbowZ], 'y');

  // Forearm: elbow boss between the upper-arm plates and the fixed half of the roll tube.
  const rollSplit = armLength / 2;
  const forearm = drum(40, 60, [0, -30, elbowZ], 'y').fuse(
    drum(28, rollSplit, [0, 0, elbowZ], 'x'),
  );

  // Wrist: rolling half of the tube, a roll collar and the wrist clevis around the wrist centre.
  const wristCheek = () =>
    draw([wristX - 34, elbowZ - 22])
      .hLineTo(wristX)
      .threePointsArcTo([wristX, elbowZ + 22], [wristX + 22, elbowZ])
      .hLineTo(wristX - 34)
      .close();
  const wrist = drum(32, 10, [rollSplit + 1, 0, elbowZ], 'x')
    .fuse(
      drum(28, wristX - 30 - rollSplit - 1, [rollSplit + 1, 0, elbowZ], 'x'),
    )
    .fuse(plate(wristCheek(), 16, 26))
    .fuse(plate(wristCheek(), -26, -16));

  // Hand: wrist-pitch hub between the clevis cheeks and a stepped nose to the tool flange.
  const hand = drum(20, 28, [wristX, -14, elbowZ], 'y')
    .fuse(drum(14, 31, [wristX, 0, elbowZ], 'x'))
    .fuse(drum(22, 30, [wristX + 30, 0, elbowZ], 'x'));

  // Tool: flange disc and a parallel gripper body with two fingers.
  const flangeX = wristX + flangeOffset;
  const flange = drum(30, 10, [flangeX - 9, 0, elbowZ], 'x');
  const gripper = makeBox(
    [flangeX + 1, -30, elbowZ - 16],
    [flangeX + 29, 30, elbowZ + 16],
  )
    .fuse(
      makeBox([flangeX + 27, 8, elbowZ - 10], [flangeX + 61, 18, elbowZ + 10]),
    )
    .fuse(
      makeBox(
        [flangeX + 27, -18, elbowZ - 10],
        [flangeX + 61, -8, elbowZ + 10],
      ),
    );

  // Pose each link: rotate by its own joint first, then by every ancestor joint (home frame).
  const pose = (name: string, shape: Shape3D) => {
    let posed = shape;
    for (
      let index = home.findIndex((joint) => joint.child === linkOf[name]);
      index >= 0;
      index--
    ) {
      const joint = home[index]!;
      posed = posed.rotate(p[joint.id], joint.origin, joint.axis);
    }
    return posed;
  };
  const part = (
    name: string,
    shape: Shape3D,
    color: string,
    metalness = 0.35,
  ): ShapeConfig => ({
    name,
    shape: pose(name, shape),
    color,
    metalness,
    roughness: 0.4,
  });

  return [
    part('Base pedestal', pedestal, '#3B4048'),
    part('Turret', turret, '#E8702A'),
    part('Shoulder motor', shoulderMotor, '#2C3137', 0.6),
    part('Upper arm', upperArm, '#F2A53A'),
    part('Elbow motor', elbowMotor, '#2C3137', 0.6),
    part('Forearm', forearm, '#2F8F83'),
    part('Wrist housing', wrist, '#3F6FB5'),
    part('Wrist pitch body', hand, '#8A5CC2'),
    part('Tool flange', flange, '#B8C2CC', 0.8),
    part('Gripper', gripper, '#D0463C'),
  ];
}

// Mechanism: every origin and axis is in the as-built model frame (mm, deg), i.e. the frame
// `main` produces for the parameter angles j1..j6. Joint i's home origin and axis are carried
// through its ancestors' as-built rotations: origin_i = R1(j1)·…·R(i-1)(j(i-1))·home_i, the
// same composition `main` applies to the geometry, so each link's reference pose is identity.
// Chain: base (root) -j1 yaw about +Z-> turret -j2 shoulder pitch-> upper-arm -j3 elbow pitch->
// forearm -j4 roll about the forearm axis-> wrist -j5 wrist pitch-> hand -j6 flange roll-> tool.
// j4, j5 and j6 intersect at the wrist centre (spherical wrist). Coordinates are deltas from the
// as-built angles, so each limit is the absolute travel minus the as-built parameter angle;
// with the default zero angles the pane shows absolute joint angles.
export function mechanism(params: Partial<Params> = defaultParams) {
  const p = { ...defaultParams, ...params };
  const home = homeJoints(p);
  const joints = home.map((joint, index) => {
    let { origin, axis } = joint;
    for (let ancestor = index - 1; ancestor >= 0; ancestor--) {
      const parent = home[ancestor]!;
      origin = turn(origin, parent.axis, p[parent.id], parent.origin);
      axis = turn(axis, parent.axis, p[parent.id]);
    }
    return { ...joint, origin, axis };
  });
  const revolute = ({
    id,
    parent,
    child,
    origin,
    axis,
  }: (typeof joints)[number]): MechanismSource['joints'][string] => ({
    type: 'revolute',
    parent,
    child,
    origin,
    axis,
    limits: { lower: limits[id][0] - p[id], upper: limits[id][1] - p[id] },
  });
  const links: Record<string, { shapes: string[] }> = {};
  for (const [name, link] of Object.entries(linkOf)) {
    (links[link] ??= { shapes: [] }).shapes.push(name);
  }
  // Wave: rise (j2, j3) out of the as-built pose, then swing the turret and flick the wrist.
  const wave = (side: number) => ({
    j1: 35 * side,
    j2: side === 0 ? 0 : -15,
    j3: side === 0 ? 0 : -45,
    j4: 0,
    j5: 40 * side,
    j6: 90 * side,
  });
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'base',
    links,
    joints: Object.fromEntries(
      joints.map((joint) => [joint.id, revolute(joint)]),
    ),
    animations: [
      {
        id: 'wave',
        name: 'Wave',
        duration: 3,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: wave(0) },
          { time: 1.5, coordinates: wave(1) },
          { time: 3, coordinates: wave(-1) },
        ],
      },
    ],
  } satisfies MechanismSource;
}
