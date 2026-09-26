/**
 * V8 Engine
 * A 90° pushrod V8 (small-block layout): cross-plane crank with firing order 1-8-4-3-6-5-7-2,
 * a valley camshaft driving flat-tappet lifters, pushrods and stud rockers, and the full
 * accessory dress. `crankAngle` poses the as-built model; the exported mechanism drives every
 * piston, rod and valve from the crank through sampled curve couplings.
 *
 * Every repeated part is modelled once in its bank-local frame and placed by clone + rigid
 * transform, so the kernel shares one BRep (and one triangulation) per unique part.
 */
import {
  draw,
  drawCircle,
  drawRectangle,
  drawRoundedRectangle,
  makeBox,
  makeCompound,
  makeCylinder,
  type AnyShape,
  type Drawing,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';
import {
  bankTilt,
  boreRadius,
  buildMechanism,
  camHeight,
  camS,
  camT,
  chamberRadius,
  compressionHeight,
  crankRadius,
  cylinders,
  deckHeight,
  deckInboard,
  deckOutboard,
  followerAxis,
  followerAxisWorld,
  gasketThickness,
  headBottom,
  headSpan,
  headTop,
  lifterLength,
  lifterRadius,
  lobe,
  lobeAngle,
  mainX,
  partNames,
  pistonState,
  pushrodRadius,
  pushrodTop,
  rockerA,
  rockerB,
  rockerEndRadius,
  rockerP,
  rodLength,
  throwPhase,
  throwX,
  toWorld,
  valveAxisT,
  valveFace,
  valveSeat,
  valveState,
  valveTip,
  valves,
  crankParts,
  camParts,
  type Bank,
} from './layout.js';

export const defaultParams = {
  crankAngle: 0,
  component: 'assembly',
};

type Params = typeof defaultParams;
type Point = [number, number];

const components = [
  'assembly',
  'block',
  'crankshaft',
  'camshaft',
  'piston',
  'rod',
  'head',
];

// Convex hull of two circles: rods, crank webs, cam lobes and the timing cover.
const hull = (a: Point, ra: number, b: Point, rb: number): Drawing => {
  const base = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const spread = Math.acos((ra - rb) / Math.hypot(b[0] - a[0], b[1] - a[1]));
  const on = ([y, z]: Point, r: number, angle: number): Point => [
    y + r * Math.cos(angle),
    z + r * Math.sin(angle),
  ];
  return draw(on(a, ra, base + spread))
    .lineTo(on(b, rb, base + spread))
    .threePointsArcTo(on(b, rb, base - spread), on(b, rb, base))
    .lineTo(on(a, ra, base - spread))
    .threePointsArcTo(on(a, ra, base + spread), on(a, ra, base + Math.PI))
    .close();
};
const polygon = (points: Point[]) => {
  const pen = draw(points[0]);
  for (const point of points.slice(1)) {
    pen.lineTo(point);
  }
  return pen.close();
};
const circleAt = (radius: number, [y, z]: Point) =>
  drawCircle(radius).translate(y, z);
// A (y, z) profile extruded along +X from x0 to x1.
const alongX = (profile: Drawing, x0: number, x1: number) =>
  profile.sketchOnPlane('YZ', [x0, 0, 0]).extrude(x1 - x0);
// An (x, r) profile revolved about the X axis, or an (r, z) profile about the Z axis.
const revolveX = (profile: Point[]) =>
  polygon(profile).sketchOnPlane('XY').revolve([1, 0, 0]);
const revolveZ = (profile: Point[]) =>
  polygon(profile).sketchOnPlane('XZ').revolve();
const cylinderX = (radius: number, x0: number, x1: number, y = 0, z = 0) =>
  makeCylinder(radius, x1 - x0, [x0, y, z], [1, 0, 0]);
const star = (tip: number, root: number, teeth: number): Drawing =>
  polygon(
    Array.from({ length: teeth * 2 }, (_, index) => {
      const angle = (index * Math.PI) / teeth;
      const radius = index % 2 === 0 ? tip : root;
      return [radius * Math.cos(angle), radius * Math.sin(angle)] as Point;
    }),
  );

// Bank-local geometry (x', t, s) → world: the right bank tilts -45° about X, the left is its
// half-turn about Z. Always pass a clone: transforms consume their input.
const place = (shape: Shape3D, bank: Bank) => {
  const tilted = shape.rotate(bankTilt, [0, 0, 0], [1, 0, 0]);
  return bank === 'left' ? tilted.rotate(180, [0, 0, 0], [0, 0, 1]) : tilted;
};
// Local bore positions (identical on both banks) and the valve x' of each bore.
const boreX = cylinders
  .filter((cylinder) => cylinder.bank === 'right')
  .map((cylinder) => cylinder.localX);
const valveX = boreX.flatMap((x) => [x + 23, x - 23]);
const exhaustX = boreX.map((x) => x - 23);
// Angle about X that turns +Z onto the lifter/pushrod axis in the local frame.
const followerTilt =
  (Math.atan2(-followerAxis[0], followerAxis[1]) * 180) / Math.PI;
const onFollower = (shape: Shape3D, x: number, distance: number) =>
  shape
    .rotate(followerTilt, [0, 0, 0], [1, 0, 0])
    .translate(
      x,
      camT + distance * followerAxis[0],
      camS + distance * followerAxis[1],
    );

// ---------------------------------------------------------------- block and bottom end
const valleyZ = 165;
const blockProfile = () => {
  const [, deckOutY, deckOutZ] = toWorld('right', [
    0,
    deckOutboard,
    deckHeight,
  ]);
  const [, deckInY, deckInZ] = toWorld('right', [0, deckInboard, deckHeight]);
  const [, skirtY, skirtZ] = toWorld('right', [0, deckOutboard, 95]);
  const valleyY = deckInY - (deckInZ - valleyZ);
  const right: Point[] = [
    [valleyY, valleyZ],
    [deckInY, deckInZ],
    [deckOutY, deckOutZ],
    [skirtY, skirtZ],
    [115, -10],
  ];
  const left = right.map(([y, z]) => [-y, z] as Point).reverse();
  return polygon([...right, ...left]);
};

// One solid extrusion, then every void in one pass: crankcase bays between the bulkheads, the
// space under the bulkheads (main caps fill it), the main and cam bores, the cylinders and the
// lifter bores. (Fusing bulkheads back into a cut cavity leaves coincident faces that later
// cuts cannot mesh cleanly.)
const buildBlock = () => {
  const cavity = drawCircle(100);
  const bays = mainX
    .slice(0, -1)
    .map((x, index) => alongX(cavity, x + 10, mainX[index + 1]! - 10));
  const underBulkheads = alongX(
    cavity.intersect(drawRectangle(200, 100).translate(0, -50)),
    -234,
    234,
  );
  const boreTool = makeCylinder(boreRadius, 160, [0, 0, 80], [0, 0, 1]);
  const bores = cylinders.map((cylinder) =>
    place(boreTool.clone().translate(cylinder.localX, 0, 0), cylinder.bank),
  );
  boreTool.delete();
  const lifterBores = valves.map((valve) =>
    makeCylinder(
      lifterRadius + 0.2,
      100,
      [valve.x, 0, camHeight],
      followerAxisWorld(valve.cylinder.bank),
    ),
  );
  return alongX(blockProfile(), -250, 250).cutAll([
    ...bays,
    underBulkheads,
    cylinderX(28.3, -260, 260),
    cylinderX(27, -260, 260, 0, camHeight),
    ...bores,
    ...lifterBores,
  ]);
};

const buildMainCap = () =>
  makeBox([-10, -55, -50], [10, 55, 0]).cut(cylinderX(28.3, -20, 20));

const buildOilPan = () =>
  makeBox([-250, -115, -140], [250, 115, -10]).cutAll([
    makeBox([-244, -109, -134], [244, 109, -9]),
    cylinderX(28.3, -260, 260),
  ]);

// Crankshaft at crank angle 0: throw k's pin at phase throwPhase[k] about +X.
const buildCrankshaft = () => {
  const counterweight = draw([0, 0])
    .lineTo([-62.35, -36])
    .threePointsArcTo([62.35, -36], [0, -72])
    .close();
  const web = hull([0, crankRadius], 30, [0, 0], 32).fuse(counterweight);
  const webSolid = alongX(web, 0, 17);
  const parts: Shape3D[] = [];
  for (const [index, x] of throwX.entries()) {
    const phase = throwPhase[index]!;
    for (const offset of [-41.5, 24.5]) {
      parts.push(
        webSolid
          .clone()
          .rotate(phase, [0, 0, 0], [1, 0, 0])
          .translate(x + offset, 0, 0),
      );
    }
    parts.push(
      cylinderX(26, x - 24.5, x + 24.5, 0, crankRadius).rotate(
        phase,
        [0, 0, 0],
        [1, 0, 0],
      ),
    );
  }
  for (const x of mainX.slice(1, -1)) {
    parts.push(cylinderX(28, x - 14.5, x + 14.5));
  }
  // Snout and front main; rear main, seal land and flywheel flange.
  parts.push(
    revolveX([
      [-320, 0],
      [-320, 20],
      [-238.5, 20],
      [-238.5, 28],
      [-209.5, 28],
      [-209.5, 0],
    ]),
    revolveX([
      [209.5, 0],
      [209.5, 28],
      [250, 28],
      [250, 45],
      [258, 45],
      [258, 0],
    ]),
  );
  webSolid.delete();
  const [first, ...rest] = parts;
  return first!.fuseAll(rest);
};

const buildBalancer = () =>
  revolveX([
    [-320, 20],
    [-320, 35],
    [-305, 35],
    [-305, 80],
    [-280, 80],
    [-280, 35],
    [-275, 35],
    [-275, 20],
  ]);
const buildFlywheel = () =>
  revolveX([
    [258, 0],
    [258, 150],
    [278, 150],
    [278, 138],
    [268, 138],
    [268, 0],
  ]);
const buildCrankSprocket = () =>
  alongX(star(28, 24, 20).cut(drawCircle(20)), -261, -253);

// Camshaft at cam angle 0 (crank angle 0), axis on the world X axis; `main` lifts it to camHeight.
const buildCamshaft = () => {
  const core = revolveX([
    [-261, 0],
    [-261, 14],
    [236, 14],
    [236, 0],
  ]);
  const journals = [-228, -112, 0, 112, 228].map((x) =>
    cylinderX(26, x - 7, x + 7),
  );
  const lobeSolid = alongX(
    hull([0, 0], lobe.baseRadius, [0, lobe.noseOffset], lobe.noseRadius),
    0,
    lobe.width,
  );
  const lobes = valves.map((valve) =>
    lobeSolid
      .clone()
      .rotate(lobeAngle(valve, 0), [0, 0, 0], [1, 0, 0])
      .translate(valve.x - lobe.width / 2, 0, 0),
  );
  lobeSolid.delete();
  return core.fuseAll([...journals, ...lobes]);
};
const buildCamSprocket = () =>
  alongX(star(56, 52, 40).cut(drawCircle(14)), -261, -253);

const buildTimingChain = () =>
  alongX(
    hull([0, 0], 33, [0, camHeight], 61).cut(
      hull([0, 0], 28.6, [0, camHeight], 56.6),
    ),
    -262,
    -252,
  );
const buildTimingCover = () =>
  alongX(hull([0, 0], 45, [0, camHeight], 75).cut(drawCircle(21)), -270, -264);

// ---------------------------------------------------------------- reciprocating parts
// Piston: pin centre at the origin, bore axis +Z, pin along X; three ring grooves.
const buildPiston = () => {
  const outer = 49.8;
  const groove = outer - 2;
  const body = revolveZ([
    [0, compressionHeight],
    [outer, compressionHeight],
    [outer, 24],
    [groove, 24],
    [groove, 22],
    [outer, 22],
    [outer, 19],
    [groove, 19],
    [groove, 17],
    [outer, 17],
    [outer, 14],
    [groove, 14],
    [groove, 12],
    [outer, 12],
    [outer, -20],
    [44, -20],
    [44, compressionHeight - 10],
    [0, compressionHeight - 10],
  ]);
  return body
    .fuseAll([cylinderX(17, 12, 46), cylinderX(17, -46, -12)])
    .cut(cylinderX(12.05, -60, 60));
};
const buildWristPin = () => cylinderX(12, -40, 40);

// Rod: small end at the origin, big end at -rodLength along Z, in the YZ plane, 22 wide.
const buildRod = () => {
  const outline = circleAt(17, [0, 0])
    .fuse(circleAt(34, [0, -rodLength]))
    .fuse(hull([0, -20], 9, [0, -rodLength + 25], 14))
    .cut(circleAt(12.1, [0, 0]))
    .cut(circleAt(26.2, [0, -rodLength]));
  return alongX(outline, -11, 11);
};

// ---------------------------------------------------------------- heads and valvetrain (local)
const buildHead = () => {
  const block = makeBox(
    [headSpan[0], deckInboard, headBottom],
    [headSpan[1], deckOutboard, headTop],
  );
  const tools = [
    ...boreX.map((x) =>
      makeCylinder(
        chamberRadius,
        valveSeat - headBottom + 1,
        [x, 0, headBottom - 1],
        [0, 0, 1],
      ),
    ),
    ...valveX.map((x) =>
      makeCylinder(
        4.6,
        headTop - valveSeat + 2,
        [x, valveAxisT, valveSeat - 1],
        [0, 0, 1],
      ),
    ),
    ...valveX.map((x) => onFollower(makeCylinder(6, 120), x, 150)),
    ...boreX.map((x) => makeCylinder(7.2, 40, [x, 30, 240], [0, 1, 0])),
  ];
  return block.cutAll(tools);
};
const buildGasket = () =>
  makeBox(
    [headSpan[0], deckInboard, deckHeight],
    [headSpan[1], deckOutboard, headBottom],
  ).cutAll(
    boreX.map((x) =>
      makeCylinder(
        boreRadius,
        gasketThickness + 2,
        [x, 0, deckHeight - 1],
        [0, 0, 1],
      ),
    ),
  );
// Valve cover: a rounded crown section extruded along the head, hollowed to a 3 mm shell that is
// open at the gasket face.
const coverTop = 390;
const buildValveCover = () => {
  const section = (inset: number, bottom: number) =>
    drawRoundedRectangle(
      deckOutboard - deckInboard - 2 * inset,
      coverTop - inset - bottom,
      12 - inset,
    ).translate(
      (deckInboard + deckOutboard) / 2,
      (coverTop - inset + bottom) / 2,
    );
  // Both sections run 20 mm below the gasket face so only their crown corners are rounded; the
  // overhang is trimmed off in the same cut.
  return alongX(section(0, headTop - 20), headSpan[0], headSpan[1]).cutAll([
    alongX(section(3, headTop - 20), headSpan[0] + 3, headSpan[1] - 3),
    makeBox(
      [headSpan[0] - 1, deckInboard - 1, headTop - 21],
      [headSpan[1] + 1, deckOutboard + 1, headTop],
    ),
  ]);
};
const buildExhaust = () => {
  const flanges = exhaustX.map((x) =>
    makeBox([x - 18, deckOutboard, 260], [x + 18, deckOutboard + 8, 294]),
  );
  const runners = exhaustX.map((x) =>
    makeCylinder(14, 40, [x, deckOutboard + 8, 277], [0, 1, 0]),
  );
  return makeCylinder(20, 380, [-200, 110, 277], [1, 0, 0]).fuseAll([
    ...flanges,
    ...runners,
  ]);
};
// Valve with its spring retainer, built on the valve axis at the local origin in x'.
const buildValve = (headRadius: number) =>
  revolveZ([
    [0, valveFace],
    [headRadius, valveFace],
    [headRadius, valveFace + 1.5],
    [4.3, valveSeat],
    [4.3, 352.5],
    [14, 352.5],
    [14, 355.5],
    [4.3, 355.5],
    [4.3, valveTip],
    [0, valveTip],
  ]);
const buildSpring = () =>
  revolveZ([
    [12, headTop],
    [16, headTop],
    [16, 340],
    [12, 340],
  ]);
const buildStud = () =>
  makeCylinder(
    5,
    rockerP[1] - 8.5 - headTop,
    [0, rockerP[0], headTop],
    [0, 0, 1],
  );
// Rocker: a round pushrod cup at A, a bar raised 2.5 mm above it to the valve pad at B, and the
// pivot boss. Raising the bar keeps it clear of the pushrod when the rocker tilts ~22° at full lift;
// only the cup (whose support along the pushrod the kinematics hold at the lash) meets it.
const buildRocker = () => {
  const length = Math.hypot(rockerB[0] - rockerA[0], rockerB[1] - rockerA[1]);
  const up: Point = [
    -(rockerB[1] - rockerA[1]) / length,
    (rockerB[0] - rockerA[0]) / length,
  ];
  const barStart: Point = [rockerA[0] + 2.5 * up[0], rockerA[1] + 2.5 * up[1]];
  const outline = hull(barStart, 3, rockerB, rockerEndRadius)
    .fuse(circleAt(rockerEndRadius, rockerA))
    .fuse(circleAt(8, rockerP));
  return alongX(outline, -6, 6);
};
const buildLifter = () => makeCylinder(lifterRadius, lifterLength);
const buildPushrod = () =>
  makeCylinder(pushrodRadius, pushrodTop - lobe.baseRadius - lifterLength);
// Spark plug along +Z from its firing tip, turned onto +t by `main`.
const buildPlug = () =>
  revolveZ([
    [0, 32],
    [7, 32],
    [7, 62],
    [10, 62],
    [10, 72],
    [6, 72],
    [6, 92],
    [3, 92],
    [3, 100],
    [0, 100],
  ]);

// ---------------------------------------------------------------- induction
// Wedged between the heads' inboard faces (t = deckInboard), above the pushrods.
const buildIntake = () => {
  const faceY = (z: number) => z + deckInboard * Math.SQRT2;
  const bottom = 265;
  return alongX(
    polygon([
      [-faceY(bottom), bottom],
      [faceY(bottom), bottom],
      [faceY(310), 310],
      [-faceY(310), 310],
    ]),
    -218,
    218,
  );
};
const buildCarburettor = () => makeCylinder(45, 35, [0, 0, 310], [0, 0, 1]);
const buildAirCleaner = () =>
  revolveZ([
    [0, 345],
    [150, 345],
    [150, 352],
    [135, 352],
    [135, 392],
    [150, 392],
    [150, 400],
    [0, 400],
  ]);

// ---------------------------------------------------------------- assembly
const steel = 0.7;
const part = (
  name: string,
  shape: AnyShape,
  color: string,
  metalness = 0.35,
): ShapeConfig => ({
  name,
  shape,
  color,
  metalness,
  roughness: 0.45,
});
const orange = '#D4541C';
const chrome = '#C9CED6';

export default function main(
  params: Partial<Params> = defaultParams,
): ShapeConfig[] {
  const p = { ...defaultParams, ...params };
  if (!components.includes(p.component)) {
    throw new Error(
      `component must be one of ${components.join(', ')}; got "${p.component}".`,
    );
  }
  // Standalone parts in their own frames, for part-level checks.
  switch (p.component) {
    case 'block': {
      return [part('Block', buildBlock(), orange)];
    }
    case 'crankshaft': {
      return [part('Crankshaft', buildCrankshaft(), '#8C939B', steel)];
    }
    case 'camshaft': {
      return [part('Camshaft', buildCamshaft(), '#7A8087', steel)];
    }
    case 'piston': {
      return [part('Piston', buildPiston(), '#C4C8CC', 0.5)];
    }
    case 'rod': {
      return [part('Connecting rod', buildRod(), '#7D858E', steel)];
    }
    case 'head': {
      return [part('Cylinder head', buildHead(), orange)];
    }
  }

  const crank = p.crankAngle;
  const shapes: ShapeConfig[] = [];
  const crankTurn = (shape: Shape3D) =>
    shape.rotate(crank, [0, 0, 0], [1, 0, 0]);
  const camTurn = (shape: Shape3D) =>
    shape.rotate(crank / 2, [0, 0, 0], [1, 0, 0]).translate(0, 0, camHeight);

  // Static: block, bottom end covers, and one head stack per bank.
  shapes.push(part('Block', buildBlock(), orange));
  const cap = buildMainCap();
  for (const [index, x] of mainX.entries()) {
    shapes.push(
      part(`Main cap ${index + 1}`, cap.clone().translate(x, 0, 0), '#6E747B'),
    );
  }
  cap.delete();
  shapes.push(part('Oil pan', buildOilPan(), orange));
  shapes.push(part('Timing chain', buildTimingChain(), '#3F4449', steel));
  shapes.push(part('Timing cover', buildTimingCover(), chrome, 0.9));

  const bankParts: Array<[string, Shape3D, string, number?]> = [
    ['Head gasket', buildGasket(), '#8A7F6A'],
    ['Cylinder head', buildHead(), orange],
    ['Valve cover', buildValveCover(), chrome, 0.9],
    ['Exhaust manifold', buildExhaust(), '#4A4A4A', 0.5],
  ];
  const spring = buildSpring();
  const stud = buildStud();
  const plug = buildPlug();
  for (const bank of ['left', 'right'] as const) {
    for (const [name, shape, color, metal] of bankParts) {
      shapes.push(
        part(`${name} ${bank}`, place(shape.clone(), bank), color, metal),
      );
    }
    shapes.push(
      part(
        `Valve springs ${bank}`,
        makeCompound(
          valveX.map((x) =>
            place(spring.clone().translate(x, valveAxisT, 0), bank),
          ),
        ),
        '#3B6FA8',
        steel,
      ),
      part(
        `Rocker studs ${bank}`,
        makeCompound(
          valveX.map((x) => place(stud.clone().translate(x, 0, 0), bank)),
        ),
        '#9AA1A9',
        steel,
      ),
      part(
        `Spark plugs ${bank}`,
        makeCompound(
          boreX.map((x) =>
            place(
              plug
                .clone()
                .rotate(-90, [0, 0, 0], [1, 0, 0])
                .translate(x, 0, 240),
              bank,
            ),
          ),
        ),
        '#F2F2EE',
        0.1,
      ),
    );
  }
  for (const shape of [
    ...bankParts.map(([, shape]) => shape),
    spring,
    stud,
    plug,
  ]) {
    shape.delete();
  }
  shapes.push(part('Intake manifold', buildIntake(), '#A9B0B8', 0.6));
  shapes.push(part('Carburettor', buildCarburettor(), '#B5A58A', 0.6));
  shapes.push(part('Air cleaner', buildAirCleaner(), chrome, 0.9));

  // Rotating: crank and cam groups.
  const [crankName, sprocketName, balancerName, flywheelName] = crankParts;
  shapes.push(part(crankName!, crankTurn(buildCrankshaft()), '#8C939B', steel));
  shapes.push(
    part(sprocketName!, crankTurn(buildCrankSprocket()), '#7A8087', steel),
  );
  shapes.push(part(balancerName!, crankTurn(buildBalancer()), '#2B2B2B', 0.2));
  shapes.push(
    part(flywheelName!, crankTurn(buildFlywheel()), '#6B7075', steel),
  );
  const [camName, camSprocketName] = camParts;
  shapes.push(part(camName!, camTurn(buildCamshaft()), '#7A8087', steel));
  shapes.push(
    part(camSprocketName!, camTurn(buildCamSprocket()), '#7A8087', steel),
  );

  // Reciprocating: one piston, pin and rod per cylinder, placed from the exact crank-train state.
  const piston = buildPiston();
  const pin = buildWristPin();
  const rod = buildRod();
  for (const cylinder of cylinders) {
    const { pistonS, rodAngle } = pistonState(cylinder, crank);
    const at = (shape: Shape3D) =>
      place(shape.translate(cylinder.localX, 0, pistonS), cylinder.bank);
    const [pistonName, pinName] = partNames.piston(cylinder);
    shapes.push(part(pistonName!, at(piston.clone()), '#C4C8CC', 0.5));
    shapes.push(part(pinName!, at(pin.clone()), '#B0B6BD', steel));
    shapes.push(
      part(
        partNames.rod(cylinder)[0]!,
        at(rod.clone().rotate(rodAngle, [0, 0, 0], [1, 0, 0])),
        '#7D858E',
        steel,
      ),
    );
  }
  piston.delete();
  pin.delete();
  rod.delete();

  // Valvetrain: lifter, pushrod, rocker and valve per valve, from the exact cam state.
  const lifter = buildLifter();
  const pushrod = buildPushrod();
  const rocker = buildRocker();
  const intakeValve = buildValve(24);
  const exhaustValve = buildValve(20);
  for (const valve of valves) {
    const { lift, rocker: rockerTurn, opening } = valveState(valve, crank);
    const { bank } = valve.cylinder;
    const [lifterName, pushrodName] = partNames.lifter(valve);
    shapes.push(
      part(
        lifterName!,
        place(
          onFollower(lifter.clone(), valve.localX, lobe.baseRadius + lift),
          bank,
        ),
        '#555C63',
        steel,
      ),
      part(
        pushrodName!,
        place(
          onFollower(
            pushrod.clone(),
            valve.localX,
            lobe.baseRadius + lifterLength + lift,
          ),
          bank,
        ),
        '#6D747C',
        steel,
      ),
      part(
        partNames.rocker(valve)[0]!,
        place(
          rocker
            .clone()
            .rotate(rockerTurn, [0, ...rockerP], [1, 0, 0])
            .translate(valve.localX, 0, 0),
          bank,
        ),
        '#9AA1A9',
        steel,
      ),
      part(
        partNames.valve(valve)[0]!,
        place(
          (valve.kind === 'intake' ? intakeValve : exhaustValve)
            .clone()
            .translate(valve.localX, valveAxisT, -opening),
          bank,
        ),
        '#B0B6BD',
        steel,
      ),
    );
  }
  for (const shape of [lifter, pushrod, rocker, intakeValve, exhaustValve]) {
    shape.delete();
  }
  return shapes;
}

/** The engine mechanism at the as-built `crankAngle`; only the full assembly carries one. */
export function mechanism(params: Partial<Params> = defaultParams) {
  const p = { ...defaultParams, ...params };
  if (p.component !== 'assembly') {
    return undefined;
  }
  return buildMechanism(p.crankAngle, staticNames);
}

const staticNames = [
  'Block',
  ...mainX.map((_, index) => `Main cap ${index + 1}`),
  'Oil pan',
  'Timing chain',
  'Timing cover',
  ...(['left', 'right'] as const).flatMap((bank) => [
    `Head gasket ${bank}`,
    `Cylinder head ${bank}`,
    `Valve cover ${bank}`,
    `Exhaust manifold ${bank}`,
    `Valve springs ${bank}`,
    `Rocker studs ${bank}`,
    `Spark plugs ${bank}`,
  ]),
  'Intake manifold',
  'Carburettor',
  'Air cleaner',
];
