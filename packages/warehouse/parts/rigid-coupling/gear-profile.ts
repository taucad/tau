// Involute profile reused from Tau's planetary gear example (Apache-2.0).
import {
  drawPointsInterpolation,
  drawFaceOutline,
  makeLine,
  makeThreePointArc,
  makeFace,
  assembleWire,
} from 'replicad';
import type { Point2D, Edge, Wire, Sketch, Drawing } from 'replicad';
const rad = Math.PI / 180;
const polar = (r: number, a: number): Point2D => [r * Math.cos(a), r * Math.sin(a)];
const mirrorY = (p: Point2D): Point2D => [p[0], -p[1]];

// One analytical period, replicated as edges into ONE closed profile.
// Each involute flank is a single nine-point B-spline; root and tip blends
// are circular arcs, tangent to both the flank and the root/tip circle.
/**
 * Build an involute profile with rounded root and tip transitions.
 * @internal
 * @param teeth - Integral tooth count.
 * @param module - Transverse module in millimetres.
 * @param internalSpace - Whether the profile cuts an internal ring.
 * @returns Closed planar gear or tooth-space profile.
 */
export function toothProfile(teeth: number, module: number, internalSpace: boolean): Drawing {
  const pitch = (module * teeth) / 2;
  const base = pitch * Math.cos(20 * rad);
  const root = pitch - (internalSpace ? 1 : 1.25) * module;
  const tip = pitch + (internalSpace ? 1.25 : 1) * module;
  const rootBlend = 0.3 * module;
  const tipBlend = (internalSpace ? 0.3 : 0.09) * module;
  const halfAtBase = Math.PI / (2 * teeth) + (internalSpace ? 0.1 : -0.1) / (2 * pitch) + Math.tan(20 * rad) - 20 * rad;
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
    rootCenter = [q[0] + rootBlend * Math.sin(a), q[1] - rootBlend * Math.cos(a)];
    rootContact = q;
  } else {
    let lo = Math.max(root, base),
      hi = root + rootBlend;
    for (let index = 0; index < 45; index++) {
      const r = (lo + hi) / 2;
      const a = Math.acos(base / r);
      const c = Math.sqrt(r * r + rootBlend ** 2 + 2 * r * rootBlend * Math.sin(a));
      if (c > root + rootBlend) {
        hi = r;
      } else {
        lo = r;
      }
    }
    rootJoin = (lo + hi) / 2;
    rootContact = flankPoint(rootJoin);
    const tangent = -halfAngle(rootJoin) + Math.acos(base / rootJoin);
    rootCenter = [rootContact[0] + rootBlend * Math.sin(tangent), rootContact[1] - rootBlend * Math.cos(tangent)];
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
  const edges: Array<Edge | Wire> = [makeThreePointArc(rootFoot, rootMid, rootContact)];
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
  edges.push(makeThreePointArc(mirrorY(tipFoot), mirrorY(tipMid), mirrorY(tipContact)));
  edges.push(
    (
      drawPointsInterpolation(flank.map((point) => mirrorY(point)).reverse(), {
        tolerance: 0.000001,
        degMax: 6,
      }).sketchOnPlane('XY') as Sketch
    ).wires(),
  );
  if (rootJoin < base) {
    edges.push(makeLine(mirrorY(flank[0]!), mirrorY(rootContact)));
  }
  edges.push(makeThreePointArc(mirrorY(rootContact), mirrorY(rootMid), mirrorY(rootFoot)));
  const rootAngle = Math.atan2(rootFoot[1], rootFoot[0]);
  edges.push(
    makeThreePointArc(mirrorY(rootFoot), polar(root, toothPitchAngle / 2), polar(root, toothPitchAngle + rootAngle)),
  );
  const outline = assembleWire(
    Array.from({ length: teeth }, (_, index) =>
      edges.map((edge) => edge.clone().rotate((index * 360) / teeth, [0, 0, 0], [0, 0, 1])),
    ).flat(),
  );
  return drawFaceOutline(makeFace(outline));
}
