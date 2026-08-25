/**
 * Cranktrain dressing (spec 3.2): key, damper stack, flywheel, ring gear,
 * pilot bushing, reluctor. Local frames noted per part; most are revolved
 * about +x and installed on the crank axis.
 */
import { draw, drawCircle, makeBaseBox, makeCylinder } from 'replicad';
import type { Shape3D } from 'replicad';
import type { InterfaceDeclarations } from '@taucad/replicad/annotations';
import {
  axisNear,
  datumAt,
  faceNear,
  groupNear,
  axisGroupNear,
} from './annotate.js';
import { Placement } from './frame.js';
import type { Vec3 } from './frame.js';
import { crank as ckp, press, tapHoleDia } from './params.js';
import type { BuiltPart } from './piston-group.js';

/** Crank key: DIN 6885 A capsule 10x8x35.8, built in crank-local coords. */
export const buildCrankKey = (place: Placement): BuiltPart => {
  const kw = ckp.keyway;
  const x0 = kw.frontX + 0.1;
  const length = kw.len - 0.2;
  const capsule = drawCircle(4.99)
    .translate(x0 + 4.99, 0)
    .fuse(drawCircle(4.99).translate(x0 + length - 4.99, 0))
    .fuse(
      draw([x0 + 4.99, -4.99])
        .lineTo([x0 + length - 4.99, -4.99])
        .lineTo([x0 + length - 4.99, 4.99])
        .lineTo([x0 + 4.99, 4.99])
        .close(),
    );
  const key = capsule.sketchOnPlane('XY', 14).extrude(8);
  const shape = place.shape(key);
  const interfaces: InterfaceDeclarations = {
    // 135-deg point on the front end arc; y = 0 sits on the OCC seam that
    // splits the arc into two faces.
    body: faceNear(
      place,
      [x0 + 4.99 - 4.99 * Math.SQRT1_2, 4.99 * Math.SQRT1_2, 18],
      'CYLINDRE',
      0.15,
    ),
  };
  return { shape, interfaces };
};

/** Damper hub: bore on the snout, seal journal Ø48, elastomer rim Ø80. */
export const buildDamperHub = (place: Placement): BuiltPart => {
  const boreR = ckp.snoutDia / 2 - press.damperHub;
  // Local: x = 0 at the hub rear face (seats the snout shoulder at -36).
  const profile = draw([boreR, 0])
    .lineTo([40, 0])
    .lineTo([40, -22])
    .lineTo([24, -22])
    .lineTo([24, -14])
    .lineTo([boreR, -14])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1])
    .rotate(90, [0, 0, 0], [0, 1, 0]) as Shape3D;
  // Rotate so the revolve axis (+z) lands on +x: local x = axial.
  const sealBand = makeCylinder(24, 8, [-22, 0, 0], [-1, 0, 0]);
  let hub = profile.fuse(sealBand);
  // Key slot: blind broach with a round end r5 near the front.
  hub = hub.cut(
    drawCircle(5.01)
      .translate(-19, 0)
      .fuse(
        draw([-19, -5.01])
          .lineTo([2, -5.01])
          .lineTo([2, 5.01])
          .lineTo([-19, 5.01])
          .close(),
      )
      .sketchOnPlane('XY', boreR - 3)
      .extrude(8),
  );
  const shape = place.shape(hub);
  const interfaces: InterfaceDeclarations = {
    // Bottom of the bore; the key slot broach removes the top.
    bore: axisNear(place, [-7, 0, -boreR], 'CYLINDRE', 0.1),
    keySlot: faceNear(place, [-24, 0, boreR + 2], 'CYLINDRE', 0.15),
    // Front ring face at x = -22 (r 24..40); the seal band tube continues to -30.
    noseFace: faceNear(place, [-22, 0, 32], 'PLANE', 0.3),
    rim: axisNear(place, [-11, 0, -40], 'CYLINDRE', 0.1),
    sealJournal: axisNear(place, [-26, 0, 24], 'CYLINDRE', 0.1),
    shoulderFace: faceNear(place, [0, 0, 32], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Damper elastomer: compressed ring between hub rim and inertia ring. */
export const buildDamperElastomer = (place: Placement): BuiltPart => {
  const ring = makeCylinder(44, 20, [-21, 0, 0], [1, 0, 0]).cut(
    makeCylinder(40, 22, [-22, 0, 0], [1, 0, 0]),
  );
  const shape = place.shape(ring);
  const interfaces: InterfaceDeclarations = {
    hubBond: axisNear(place, [-11, 0, -40], 'CYLINDRE', 0.1),
    ringBond: axisNear(place, [-11, 0, 44], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Damper inertia ring: OD Ø170 x 40 with the accessory belt groove. */
export const buildInertiaRing = (place: Placement): BuiltPart => {
  let ring = makeCylinder(85, 40, [-31, 0, 0], [1, 0, 0]).cut(
    makeCylinder(44, 42, [-32, 0, 0], [1, 0, 0]),
  );
  // Belt groove band mid-plane at local x = -11 (the accessory datum).
  ring = ring.cut(
    makeCylinder(86, 10, [-16, 0, 0], [1, 0, 0]).cut(
      makeCylinder(78, 12, [-17, 0, 0], [1, 0, 0]),
    ),
  );
  const shape = place.shape(ring);
  const interfaces: InterfaceDeclarations = {
    beltPlane: datumAt(place, [-11, 0, 0], [0, 0, 1], [1, 0, 0]),
    bore: axisNear(place, [-11, 0, 44], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export const buildDamperWasher = (place: Placement): BuiltPart => {
  const shape = place.shape(
    makeCylinder(19, 5, [0, 0, 0], [-1, 0, 0]).cut(
      makeCylinder(8.5, 7, [1, 0, 0], [-1, 0, 0]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    clampFace: faceNear(place, [0, 0, 14], 'PLANE', 0.12),
  };
  return { shape, interfaces };
};

/** Flywheel: rim-biased disc with spigot recess, bolt holes, gear seat. */
export const buildFlywheel = (place: Placement): BuiltPart => {
  // Local: x = 0 at the crank-flange contact face; body extends +x.
  const profile = draw([35.01, 0])
    .lineTo([120, 0])
    .lineTo([120, 12])
    .lineTo([148, 12])
    .lineTo([148, 30])
    .lineTo([159, 30])
    .lineTo([159, 42])
    .lineTo([35.01, 42])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1])
    .rotate(90, [0, 0, 0], [0, 1, 0]) as Shape3D;
  let flywheel = profile;
  // Spigot recess Ø70.04 x 9 at the front face.
  flywheel = flywheel.fuse(makeCylinder(60, 42, [0, 0, 0], [1, 0, 0]));
  flywheel = flywheel.cut(makeCylinder(35.02, 9, [-0.01, 0, 0], [1, 0, 0]));
  flywheel = flywheel.cut(makeCylinder(20, 44, [-1, 0, 0], [1, 0, 0]));
  // 8x Ø10.5 bolt holes + spot faces (BC 100).
  const tools: Shape3D[] = [];
  const boltSeatPts: Vec3[] = [];
  for (let index = 0; index < 8; index++) {
    const t = (index * 45 * Math.PI) / 180;
    const y = 50 * Math.sin(t);
    const z = 50 * Math.cos(t);
    tools.push(makeCylinder(5.25, 46, [-1, y, z], [1, 0, 0]));
    tools.push(makeCylinder(9.5, 30, [14, y, z], [1, 0, 0]));
    boltSeatPts.push([14, y + 6.8, z]);
  }
  // 6x M8 pressure plate taps (BC 270).
  for (let index = 0; index < 6; index++) {
    const t = ((index * 60 + 30) * Math.PI) / 180;
    tools.push(
      makeCylinder(
        tapHoleDia(8) / 2,
        16,
        [42.01, 135 * Math.sin(t), 135 * Math.cos(t)],
        [-1, 0, 0],
      ),
    );
  }
  flywheel = flywheel.cutAll(tools);
  const shape = place.shape(flywheel);
  const interfaces: InterfaceDeclarations = {
    boltSeat: groupNear(place, boltSeatPts, 'PLANE', 0.12),
    ringGearSeat: axisNear(place, [21, 0, -148], 'CYLINDRE', 0.1),
    spigotRecess: axisNear(place, [4, 0, 35.02], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export const buildRingGear = (place: Placement): BuiltPart => {
  const idR = 148 - press.ringGear;
  const shape = place.shape(
    makeCylinder(162.5, 16, [13, 0, 0], [1, 0, 0]).cut(
      makeCylinder(idR, 18, [12, 0, 0], [1, 0, 0]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    shrink: axisNear(place, [21, 0, idR], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

export const buildPilotBushing = (place: Placement): BuiltPart => {
  const odR = ckp.pilotBoreDia / 2 + press.pilotBushing;
  const shape = place.shape(
    makeCylinder(odR, 24, [0, 0, 0], [-1, 0, 0]).cut(
      makeCylinder(7.5, 26, [1, 0, 0], [-1, 0, 0]),
    ),
  );
  const interfaces: InterfaceDeclarations = {
    press: axisNear(place, [-12, 0, odR], 'CYLINDRE', 0.05),
  };
  return { shape, interfaces };
};

/** Reluctor: 36-2 wheel; the tooth band is the plain OD face (callout). */
export const buildReluctor = (place: Placement): BuiltPart => {
  const idR = ckp.reluctorSeatDia / 2 - press.reluctor;
  let wheel = makeCylinder(70, 8, [1, 0, 0], [1, 0, 0]).cut(
    makeCylinder(62, 10, [0, 0, 0], [1, 0, 0]),
  );
  wheel = wheel.fuse(
    makeCylinder(62.5, 10, [0, 0, 0], [1, 0, 0]).cut(
      makeCylinder(idR, 12, [-1, 0, 0], [1, 0, 0]),
    ),
  );
  const shape = place.shape(wheel);
  const interfaces: InterfaceDeclarations = {
    press: axisNear(place, [5, 0, idR], 'CYLINDRE', 0.05),
    teeth: axisNear(place, [5, 0, -70], 'CYLINDRE', 0.1),
  };
  return { shape, interfaces };
};

/** Core plug: drawn cup Ø36.1 x 8. */
export const buildCorePlug = (place: Placement): BuiltPart => {
  const odR = 18 + press.corePlug - 0.05 + 0.05;
  const cup = draw([0, 0])
    .lineTo([odR, 0])
    .lineTo([odR, -8])
    .lineTo([odR - 1.5, -8])
    .lineTo([odR - 1.5, -1.5])
    .lineTo([0, -1.5])
    .close()
    .sketchOnPlane('XZ')
    .revolve([0, 0, 1]);
  const shape = place.shape(cup);
  const interfaces: InterfaceDeclarations = {
    press: axisNear(place, [odR, 0, -4], 'CYLINDRE', 0.05),
  };
  return { shape, interfaces };
};

/** Dowel pin Ø12 x 24 with end chamfers. */
export const buildDowel = (place: Placement): BuiltPart => {
  const shape = place.shape(
    draw([0, 0])
      .lineTo([5.2, 0])
      .lineTo([6, 0.8])
      // Press band Ø12 (block bore Ø11.96, P04); slip band Ø11.95 (head
      // bore Ø12.0). The step also keeps the two interface faces distinct.
      .lineTo([6, 12])
      .lineTo([5.975, 12])
      .lineTo([5.975, 23.2])
      .lineTo([5.2, 24])
      .lineTo([0, 24])
      .close()
      .sketchOnPlane('XZ')
      .revolve([0, 0, 1]),
  );
  const interfaces: InterfaceDeclarations = {
    press: axisNear(place, [6, 0, 6], 'CYLINDRE', 0.02),
    slip: axisNear(place, [5.975, 0, 18], 'CYLINDRE', 0.02),
  };
  return { shape, interfaces };
};

/** Camshaft tunnel bearing: full ring, pressed at a block land. */
export const buildCamBearing = (place: Placement): BuiltPart => {
  const odR = 55 / 2 + press.camBearing;
  const idR = 52 / 2 + 0.032;
  let ring = makeCylinder(odR, 18, [-9, 0, 0], [1, 0, 0]).cut(
    makeCylinder(idR, 20, [-10, 0, 0], [1, 0, 0]),
  );
  ring = ring.cut(makeCylinder(3, odR + 2, [0, 0, 0], [0, 0, 1]));
  const shape = place.shape(ring);
  const interfaces: InterfaceDeclarations = {
    bore: axisNear(place, [0, 0, -idR], 'CYLINDRE', 0.05),
    press: axisNear(place, [0, 5, -Math.sqrt(odR ** 2 - 25)], 'CYLINDRE', 0.05),
  };
  return { shape, interfaces };
};

/** Oil gallery plug (M16 rear main + M12 lifter gallery). */
export { buildPlug } from './fasteners.js';
export { Placement, makeBaseBox, axisGroupNear };
