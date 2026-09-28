import {
  assembleWire,
  cast,
  getOC,
  makeCircle,
  makeCylinder,
  Sketch,
  type Edge,
  type Shape3D,
} from 'replicad';

export const defaultParams = { tubeRadius: 1.8 };
export function buildPitchYoke(p = defaultParams): Shape3D {
  if (p.tubeRadius < 1.8 || p.tubeRadius > 2.4) {
    throw new Error('Yoke tube radius must be 1.8..2.4 mm.');
  }
  // A true toroidal half-ring: the flow-facing bridge has no polygonal or flat facets.
  // Rational conversion preserves the exact circle while avoiding a torus p-curve singularity.
  const oc = getOC();
  const circle = makeCircle(p.tubeRadius, [5, 19, 0], [1, 0, 0]);
  const adaptor = new oc.BRepAdaptor_Curve(circle.wrapped);
  // oxlint-disable-next-line eslint/new-cap -- OCCT binding methods keep their PascalCase C++ names.
  const circularCurve = adaptor.GeomCurve();
  // oxlint-disable-next-line eslint/new-cap -- OCCT binding methods keep their PascalCase C++ names.
  const rationalCircle = oc.GeomConvert.CurveToBSplineCurve(circularCurve);
  const edgeBuilder = new oc.BRepBuilderAPI_MakeEdge(rationalCircle);
  // oxlint-disable-next-line eslint/new-cap -- OCCT binding methods keep their PascalCase C++ names.
  const section = assembleWire([cast(edgeBuilder.Edge()) as Edge]);
  const bridge = new Sketch(section, {
    defaultOrigin: [5, 19, 0],
    defaultDirection: [1, 0, 0],
  }).revolve([0, 0, -1], { origin: [5, 0, 0], angle: 180 });
  circle.delete();
  adaptor.delete();
  circularCurve.delete();
  rationalCircle.delete();
  edgeBuilder.delete();
  return bridge
    .fuseAll([
      makeCylinder(5.8, 4.8, [5, 18, 0], [0, 1, 0]),
      makeCylinder(5.8, 4.8, [5, -18, 0], [0, -1, 0]),
      makeCylinder(5.5, 6, [24, 0, -2], [0, 0, 1]),
    ])
    .cutAll([
      makeCylinder(4.15, 8, [5, 16, 0], [0, 1, 0]),
      makeCylinder(4.55, 8, [5, -16, 0], [0, -1, 0]),
      makeCylinder(4.15, 8, [24, 0, -3], [0, 0, 1]),
    ]);
}
export default function main(p = defaultParams) {
  return buildPitchYoke(p);
}
