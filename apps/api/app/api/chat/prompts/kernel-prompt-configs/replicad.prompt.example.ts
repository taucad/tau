/**
 * Parametric Watering Can
 * A simple watering can with adjustable dimensions.
 */
import { makePlane, makeCylinder, draw, drawCircle, type Shape3D, type SketchInterface } from 'replicad';

export const defaultParams = {
  // Body dimensions
  baseWidth: 20, // Width at the base in mm
  bodyHeight: 100, // Height of the main body in mm

  // Filler dimensions
  topFillerRadius: 12, // Radius of top filler opening in mm
  fillerAngle: 20, // Angle of filler from vertical in degrees

  // Spout dimensions
  spoutRadius: 5, // Radius of the spout in mm
  spoutLength: 70, // Length of the spout in mm
  spoutAngle: 45, // Angle of spout from vertical in degrees
  spoutOpeningFilletRadius: 0.4, // Fillet radius at spout opening in mm

  // Construction
  wallThickness: 1, // Wall thickness for hollow body in mm
  filletRadius: 30, // Fillet radius for smooth transitions in mm
};

export default function main(p = defaultParams): Shape3D {
  // Building the body
  const profile = draw().hLine(p.baseWidth).line(10, 5).vLine(3).lineTo([8, p.bodyHeight]).hLine(-8).close();

  const body = profile.sketchOnPlane('XZ').revolve([0, 0, 1]);

  // Building the filler
  const topPlane = makePlane().pivot(-p.fillerAngle, 'Y').translate([-35, 0, 135]);
  const topCircle = drawCircle(p.topFillerRadius).sketchOnPlane(topPlane) as SketchInterface;

  const middleCircle = drawCircle(8).sketchOnPlane('XY', p.bodyHeight);

  const bottomPlane = makePlane().pivot(p.fillerAngle, 'Y').translateZ(80);
  const bottomCircle = drawCircle(9).sketchOnPlane(bottomPlane);

  const filler = topCircle.loftWith([middleCircle, bottomCircle] as SketchInterface[], {
    ruled: false,
  });

  // Building the spout
  const spout = makeCylinder(p.spoutRadius, p.spoutLength)
    .translateZ(p.bodyHeight)
    .rotate(p.spoutAngle, [0, 0, p.bodyHeight], [0, 1, 0]);

  let wateringCan = body
    .fuseAll([filler, spout])
    .fillet(p.filletRadius, (edgeFinder) => edgeFinder.inPlane('XY', p.bodyHeight))
    .fillet(10, (edgeFinder) => edgeFinder.inBox([20, 20, p.bodyHeight], [-20, -20, 120]));

  const spoutOpening = [
    Math.cos((p.spoutAngle * Math.PI) / 180) * p.spoutLength,
    0,
    p.bodyHeight + Math.sin((p.spoutAngle * Math.PI) / 180) * p.spoutLength,
  ] as [number, number, number];

  wateringCan = wateringCan.shell(-p.wallThickness, (face) =>
    face.either([(f) => f.containsPoint(spoutOpening), (pointFinder) => pointFinder.inPlane(topPlane)]),
  );

  // Add fillet to the spout opening
  wateringCan = wateringCan.fillet(p.spoutOpeningFilletRadius, (edgeFinder) =>
    edgeFinder.withinDistance(p.spoutRadius + 1, spoutOpening).ofCurveType('CIRCLE'),
  );

  // Add fillet to the filler opening
  const fillerOpeningCenter = [-35, 0, 135] as [number, number, number];
  wateringCan = wateringCan.fillet(p.spoutOpeningFilletRadius, (edgeFinder) =>
    edgeFinder
      .withinDistance(p.topFillerRadius + p.wallThickness + 1, fillerOpeningCenter)
      .not((f) => f.ofCurveType('LINE')),
  );

  return wateringCan;
}
