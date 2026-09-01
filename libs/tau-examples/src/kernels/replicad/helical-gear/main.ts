import {
  assembleWire,
  drawRoundedRectangle,
  makeBezierCurve,
  makeCylinder,
  makeFace,
  makeThreePointArc,
  Sketch,
} from 'replicad';
import type { Edge, ShapeConfig } from 'replicad';

export const defaultParams = {
  toothCount: 24,
  module: 2,
  pressureAngle: 20,
  faceWidth: 18,
  helixAngle: 25,
  helixHand: 'right',
  boreDiameter: 14,
  // Standard ISO/DIN 6885 keyway for a 14 mm shaft:
  // key 5 mm wide × 5 mm tall, t1 (depth into shaft from top) = 3.0 mm,
  // so the slot rises (3.0 - 5/2) = 0.5 mm above the centre line.
  keywayWidth: 5,
  keywayDepth: 3,
  dedendumFactor: 1.25,
  involuteBezierTension: 0.42,
  rootFilletTension: 0.4,
  // Chamfer applied to the top and bottom edges of the bore + keyway cutout.
  boreChamfer: 0.6,
  // Chamfer applied to the top and bottom edges of each gear tooth (along the
  // tooth profile on the top/bottom faces). Set to 0 to disable.
  toothChamfer: 0.6,
};

type GearParameters = typeof defaultParams;
type Point3 = [number, number, number];

const involute = (angle: number) => Math.tan(angle) - angle;

const polarPoint = (radius: number, angle: number): Point3 => [
  radius * Math.cos(angle),
  radius * Math.sin(angle),
  0,
];

const distance = (a: Point3, b: Point3) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const add = (a: Point3, b: Point3): Point3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const subtract = (a: Point3, b: Point3): Point3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const scale = (a: Point3, factor: number): Point3 => [
  a[0] * factor,
  a[1] * factor,
  a[2] * factor,
];

const unit = (a: Point3): Point3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

function buildInvoluteGearWire(p: GearParameters) {
  const pressureAngle = (p.pressureAngle * Math.PI) / 180;
  const toothPeriod = (2 * Math.PI) / p.toothCount;
  const pitchRadius = (p.module * p.toothCount) / 2;
  const baseRadius = pitchRadius * Math.cos(pressureAngle);
  const outerRadius = pitchRadius + p.module;
  const rootRadius = pitchRadius - p.dedendumFactor * p.module;
  const flankStartRadius = Math.max(baseRadius, rootRadius);
  const pitchHalfToothAngle = Math.PI / (2 * p.toothCount);
  const pitchInvolute = involute(pressureAngle);

  const halfToothAngleAt = (radius: number) => {
    const rollAngle = Math.acos(baseRadius / radius);
    return pitchHalfToothAngle + pitchInvolute - involute(rollAngle);
  };

  const involutePoint = (side: -1 | 1, centerAngle: number, radius: number) =>
    polarPoint(radius, centerAngle + side * halfToothAngleAt(radius));

  const involuteTangent = (
    side: -1 | 1,
    centerAngle: number,
    radius: number,
  ) => {
    const flankAngle = centerAngle + side * halfToothAngleAt(radius);
    const rollAngle = Math.acos(baseRadius / radius);
    const dThetaDr = (-side * Math.sin(rollAngle)) / baseRadius;
    return unit([
      Math.cos(flankAngle) - radius * Math.sin(flankAngle) * dThetaDr,
      Math.sin(flankAngle) + radius * Math.cos(flankAngle) * dThetaDr,
      0,
    ]);
  };

  const involuteBezier = (
    side: -1 | 1,
    centerAngle: number,
    startRadius: number,
    endRadius: number,
  ) => {
    const startPoint = involutePoint(side, centerAngle, startRadius);
    const endPoint = involutePoint(side, centerAngle, endRadius);
    const chord = distance(startPoint, endPoint);
    const startTangent = involuteTangent(side, centerAngle, startRadius);
    const endTangent = involuteTangent(side, centerAngle, endRadius);
    const pathSign = Math.sign(endRadius - startRadius) || 1;
    const handleLength = chord * p.involuteBezierTension;

    return makeBezierCurve([
      startPoint,
      add(startPoint, scale(startTangent, handleLength * pathSign)),
      subtract(endPoint, scale(endTangent, handleLength * pathSign)),
      endPoint,
    ]);
  };

  const startHalfAngle = halfToothAngleAt(flankStartRadius);
  const clearanceAngle = (flankStartRadius - rootRadius) / rootRadius;
  const rootHalfAngle =
    startHalfAngle +
    Math.min(
      (toothPeriod / 2 - startHalfAngle) * 0.65,
      Math.max(0.006, clearanceAngle),
    );

  // Smooth tangent cubic-Bezier fillet at the flank↔root corner.
  // Tangent at the flank end matches the involute; tangent at the root end is
  // along the root circle (continuous with the adjacent root arc).
  const filletBezier = (side: -1 | 1, centerAngle: number) => {
    const flankPoint = involutePoint(side, centerAngle, flankStartRadius);
    const flankTangentUp = involuteTangent(side, centerAngle, flankStartRadius);
    const rootAngle = centerAngle + side * rootHalfAngle;
    const rootPoint = polarPoint(rootRadius, rootAngle);
    // +phi (counter-clockwise) tangent at the root circle point.
    const rootTangentCCW: Point3 = [
      -Math.sin(rootAngle),
      Math.cos(rootAngle),
      0,
    ];
    const chord = distance(rootPoint, flankPoint);
    const h = chord * p.rootFilletTension;

    if (side === -1) {
      // Wire direction: rootLeft → leftStart (CCW).
      const p0 = rootPoint;
      const p3 = flankPoint;
      const p1 = add(p0, scale(rootTangentCCW, h));
      const p2 = subtract(p3, scale(flankTangentUp, h));
      return makeBezierCurve([p0, p1, p2, p3]);
    }
    // Wire direction: rightStart → rootRight (CCW). Flank tangent is downward.
    const flankTangentDown = scale(flankTangentUp, -1);
    const p0 = flankPoint;
    const p3 = rootPoint;
    const p1 = add(p0, scale(flankTangentDown, h));
    const p2 = subtract(p3, scale(rootTangentCCW, h));
    return makeBezierCurve([p0, p1, p2, p3]);
  };

  const edges: Edge[] = [];
  const firstRootLeft = polarPoint(rootRadius, -rootHalfAngle);

  for (let toothIndex = 0; toothIndex < p.toothCount; toothIndex += 1) {
    const centerAngle = toothIndex * toothPeriod;
    const nextCenterAngle = (toothIndex + 1) * toothPeriod;

    const rootLeft =
      toothIndex === 0
        ? firstRootLeft
        : polarPoint(rootRadius, centerAngle - rootHalfAngle);
    const outerLeft = involutePoint(-1, centerAngle, outerRadius);
    const outerRight = involutePoint(1, centerAngle, outerRadius);
    const rootRight = polarPoint(rootRadius, centerAngle + rootHalfAngle);
    const nextRootLeft =
      toothIndex === p.toothCount - 1
        ? firstRootLeft
        : polarPoint(rootRadius, nextCenterAngle - rootHalfAngle);

    edges.push(
      filletBezier(-1, centerAngle),
      involuteBezier(-1, centerAngle, flankStartRadius, outerRadius),
      makeThreePointArc(
        outerLeft,
        polarPoint(outerRadius, centerAngle),
        outerRight,
      ),
      involuteBezier(1, centerAngle, outerRadius, flankStartRadius),
      filletBezier(1, centerAngle),
      makeThreePointArc(
        rootRight,
        polarPoint(rootRadius, centerAngle + toothPeriod / 2),
        nextRootLeft,
      ),
    );

    // Silence unused-var lint for endpoints used only for clarity above.
    void rootLeft;
  }

  return assembleWire(edges);
}

export default function main(p = defaultParams): ShapeConfig[] {
  const pitchRadius = (p.module * p.toothCount) / 2;
  const helixTwist =
    ((p.faceWidth * Math.tan((p.helixAngle * Math.PI) / 180)) / pitchRadius) *
    (180 / Math.PI) *
    (p.helixHand === 'right' ? 1 : -1);

  const sketchWire = buildInvoluteGearWire(p);
  const faceWire = buildInvoluteGearWire(p);
  const gearFace = makeFace(faceWire);
  const gearSketch = new Sketch(sketchWire);
  gearSketch.baseFace = gearFace;
  let gear = gearSketch
    .extrude(p.faceWidth, { twistAngle: helixTwist, origin: [0, 0, 0] })
    .translateZ(-p.faceWidth / 2);

  // Straight (un-twisted) through bore.
  const boreOverhang = 1;
  const boreHeight = p.faceWidth + 2 * boreOverhang;
  const bore = makeCylinder(p.boreDiameter / 2, boreHeight).translateZ(
    -p.faceWidth / 2 - boreOverhang,
  );
  gear = gear.cut(bore);

  // Rectangular keyway extending radially outward from the bore wall along +Y.
  // The slot is sharp-cornered (standard ISO/DIN 6885 hub keyway form), keywayWidth
  // wide (tangential, along X) and keywayDepth deep (radial, along Y) measured
  // from the bore wall outward.
  const boreRadius = p.boreDiameter / 2;
  const slotOverlap = 0.5; // Overlap into the bore so the cut welds cleanly
  const slotInnerY = boreRadius - slotOverlap; // Start just inside the bore wall
  const slotOuterY = boreRadius + p.keywayDepth; // End keywayDepth past the bore wall
  const slotHeight = slotOuterY - slotInnerY;
  const slotCenterY = (slotInnerY + slotOuterY) / 2;
  const keywaySlot = drawRoundedRectangle(p.keywayWidth, slotHeight, 0)
    .translate(0, slotCenterY)
    .sketchOnPlane('XY', -p.faceWidth / 2 - boreOverhang)
    .extrude(boreHeight);
  gear = gear.cut(keywaySlot);

  // Chamfer ONLY the circular bore edges on the top and bottom faces.
  // The keyway slot edges (straight lines) are intentionally excluded.
  if (p.boreChamfer > 0) {
    const halfH = p.faceWidth / 2;
    const r = p.boreDiameter / 2;
    for (const z of [halfH, -halfH]) {
      gear = gear.chamfer(p.boreChamfer, (e) =>
        e
          .inPlane('XY', z)
          .ofCurveType('CIRCLE')
          .withinDistance(r + 0.5, [0, 0, z]),
      );
    }
  }

  // Chamfer the top and bottom tooth-tip edges only (the outer arc at the
  // crest of each tooth where it meets the top/bottom face). These are the
  // circular edges at the outer radius — not the root arcs, flanks, or
  // root fillets.
  if (p.toothChamfer > 0) {
    const halfH = p.faceWidth / 2;
    const outerRadius = (p.module * p.toothCount) / 2 + p.module;
    const rootRadius =
      (p.module * p.toothCount) / 2 - p.dedendumFactor * p.module;
    // Only edges whose midpoint sits near the outer (tip) radius — i.e. the
    // tip arc of each tooth. Use a band wider than the tooth tip but well
    // inside the root, so flanks/root arcs are excluded.
    const tipBand = (outerRadius - rootRadius) * 0.25;
    for (const z of [halfH, -halfH]) {
      gear = gear.chamfer(p.toothChamfer, (e) =>
        e.inPlane('XY', z).when(({ element }) => {
          const mid = element.pointAt(0.5);
          const r = Math.hypot(mid.x, mid.y);
          return Math.abs(r - outerRadius) < tipBand;
        }),
      );
    }
  }

  return [
    {
      shape: gear,
      name: 'HelicalGear',
      color: '#8C9BAB',
      metalness: 0.5,
      roughness: 0.25,
    },
  ];
}
