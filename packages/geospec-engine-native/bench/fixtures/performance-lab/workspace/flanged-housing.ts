import {
  draw, drawCircle, drawRoundedRectangle, makeCylinder, makeBox,
  makeHelix, genericSweep, type Shape3D,
} from 'replicad';

export const defaultParams = {
  lugDiameter: 30,
  inspectionEnabled: false,
  inspectionBox: [[0, 0, 0], [0, 0, 0]] as [[number, number, number], [number, number, number]],
  inspectionVoid: false,
  inspectionRing: [0, 0, 0, 0, 0, 0],
};

type Params = typeof defaultParams & {
  inspectionBox?: [[number, number, number], [number, number, number]];
  inspectionVoid?: boolean;
};

// The raster does not dimension lug OD. Ø30 is inferred from its orthographic
// views. All other nominal dimensions below are the labelled drawing values.
const outline = (radius: number, halfWidth: number, corner: number) =>
  drawCircle(radius).intersect(drawRoundedRectangle(220, 2 * halfWidth)).fillet(corner);

// Analytical revolved profile; coordinates are [radius, elevation].
function revolved(points: [number, number][]) {
  const pen = draw(points[0]);
  for (const point of points.slice(1)) pen.lineTo(point);
  return pen.close().sketchOnPlane('XZ').revolve([0, 0, 1]);
}

export default function main(params: Partial<Params> = defaultParams): Shape3D {
  const p = { ...defaultParams, ...params };
  if (!Number.isFinite(p.lugDiameter) || p.lugDiameter < 29 || p.lugDiameter > 34)
    throw new Error('Lug diameter must be between 29 and 34 mm.');

  // R18/R12 centres are (±sqrt(82²−42²), ±42) = (±70.398864, ±42).
  let body = outline(100, 60, 18).sketchOnPlane('XY').extrude(30)
    .fillet(10, e => e.inPlane('XY', 30));
  const cavity = outline(94, 54, 12).sketchOnPlane('XY', -1).extrude(25)
    .fillet(4, e => e.inPlane('XY', 24));
  body = body.cut(cavity);

  const mounts: [number, number][] = [[-57, -60], [-57, 60], [57, -60], [57, 60]];
  const lug = makeCylinder(p.lugDiameter / 2, 35);
  body = body.fuseAll(mounts.map(([x, y]) => lug.clone().translate([x, y, 0])));
  // Four continuous lug/wall blends, selected at the outboard vertical seams.
  body = body.fillet(e => {
    const a = e.startPoint.toTuple(), b = e.endPoint.toTuple();
    return e.geomType === 'LINE' && Math.abs(Math.abs(a[2] - b[2]) - 20) < 1e-6 &&
      Math.abs(a[0] - b[0]) < 1e-6 &&
      Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[0]) > 70 &&
      Math.abs(a[0]) < 80 && Math.abs(a[1]) > 58 ? 2.5 : null;
  });
  body = body.fillet(2, e => e.inPlane('XY', 35));

  // Common z45 two-lobed flange, with R10 concave plan blends and R3 roots.
  const flange = drawCircle(41).translate([40, 0])
    .fuse(drawCircle(30).translate([-20, 15])).fillet(10)
    .sketchOnPlane('XY', 30).extrude(15);
  // Round the flange on a flat construction pad before joining nearby lug
  // blends; this also keeps the larger-lug variant's fillets well-defined.
  const rootedFlange = makeBox([-110, -80, 24], [110, 80, 30]).fuse(flange)
    .fillet(3, e => e.inPlane('XY', 30).ofCurveType('CIRCLE'))
    .intersect(makeBox([-110, -80, 30], [110, 80, 46]));
  body = body.fuse(rootedFlange);
  body = body.fuseAll([
    makeCylinder(25, 6, [40, 0, 19]),
    makeCylinder(19, 6, [-20, 15, 19]),
  ]);

  const mountHole = revolved([
    [0, -1], [7.5, -1], [7.5, 0], [6, 1.5],
    [6, 33.5], [7.5, 35], [7.5, 36], [0, 36],
  ]);
  const cuts = [
    makeCylinder(20, 47, [40, 0, -1]),
    makeCylinder(14, 47, [-20, 15, -1]),
    makeCylinder(17.5, 6, [-20, 15, 40]),
    ...mounts.map(([x, y]) => mountHole.clone().translate([x, y, 0])),
  ];

  // ISO basic internal M12×1.75 profile: D1 = D − 1.0825317547 P.
  // 6H is the drawing's manufacturing tolerance class, not a tessellation setting.
  const pitch = 1.75;
  const minor = 6 - 5 * Math.sqrt(3) * pitch / 16;
  const start = 30 - pitch;
  const profile = draw([4.5, start - 3 * pitch / 8])
    .lineTo([4.5, start + 3 * pitch / 8])
    .lineTo([minor, start + 3 * pitch / 8])
    .lineTo([6, start + pitch / 16]).lineTo([6, start - pitch / 16])
    .lineTo([minor, start - 3 * pitch / 8])
    .close().sketchOnPlane('XZ');
  // Extend the cutter inside the pilot bore for a robust overlapping union;
  // the actual thread flank still starts at the exact ISO minor diameter.
  const groove = genericSweep(profile.wire, makeHelix(pitch, 15 + 2 * pitch, 6, [0, 0, start]), {
    frenet: true,
  }).intersect(makeCylinder(6.1, 15, [0, 0, 30]));
  const tap = makeCylinder(minor, 15, [0, 0, 30]).fuseAll([groove,
    revolved([[0, 45 - (6 - minor)], [minor, 45 - (6 - minor)], [6, 45], [6, 46], [0, 46]]),
  ]);
  for (let i = 0; i < 6; i++) {
    const angle = (90 + i * 60) * Math.PI / 180;
    cuts.push(tap.clone().translate([40 + 30.5 * Math.cos(angle), 30.5 * Math.sin(angle), 0]));
  }
  body = body.cutAll(cuts);

  // GeoSpec probes intersect the FINISHED solid, so local checks cannot pass
  // against disconnected construction tools or stale intermediate geometry.
  if (p.inspectionEnabled && p.inspectionBox) {
    const [x, y, inner, outer, low, high] = p.inspectionRing;
    let box = outer > 0
      ? makeCylinder(outer, high - low, [x, y, low]).cut(makeCylinder(inner, high - low, [x, y, low]))
      : makeBox(p.inspectionBox[0], p.inspectionBox[1]);
    if (outer > 0 && p.inspectionBox[1].every((v, i) => v > p.inspectionBox[0][i]))
      box = box.intersect(makeBox(p.inspectionBox[0], p.inspectionBox[1]));
    return p.inspectionVoid ? box.cut(body) : body.intersect(box);
  }
  return body;
}
