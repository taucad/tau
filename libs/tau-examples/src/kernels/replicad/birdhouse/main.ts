/**
 * Parametric Birdhouse
 * A customizable birdhouse with adjustable dimensions and features.
 */
import {
  drawCircle,
  draw,
  makePlane,
} from 'replicad';

export const defaultParams = {
  height: 85, // Overall height of the birdhouse
  width: 120, // Width of the birdhouse
  thickness: 2, // Wall thickness
  holeDiameter: 50, // Diameter of entrance hole
  hookHeight: 10, // Height of the hanging hook
  filletEdges: true, // Whether to add rounded edges
};

export default function main(
  p = defaultParams,
) {
  const length = p.width;
  const width = p.width * 0.9; // 90% of width for the triangular prism

  // Create triangular prism house shape
  let tobleroneShape = draw([
    -width / 2,
    0,
  ])
    .lineTo([0, p.height])
    .lineTo([width / 2, 0])
    .close()
    .sketchOnPlane('XZ', -length / 2)
    .extrude(length)
    .shell(p.thickness, (f) =>
      f.parallelTo('XZ'),
    ); // Shell to create hollow interior

  // Add fillets to edges if requested
  if (p.filletEdges) {
    tobleroneShape =
      tobleroneShape.fillet(
        p.thickness / 2,
        (e) =>
          e
            .inDirection('Y')
            .either([
              (f) => f.inPlane('XY'),
              (f) =>
                f.inPlane(
                  'XY',
                  p.height,
                ),
            ]),
      );
  }

  // Create entrance hole
  const hole = drawCircle(
    p.holeDiameter / 2,
  )
    .sketchOnPlane(
      makePlane('YZ').translate([
        -length / 2,
        0,
        p.height / 3,
      ]),
    )
    .extrude(length);

  // Cut hole from house
  const base = tobleroneShape.cut(hole);
  // Create complete body by duplicating and rotating
  const body = base
    .clone()
    .fuse(base.rotate(90));

  // Create hook for hanging
  const hookWidth = length / 2;
  const hook = draw([
    0,
    p.hookHeight / 2,
  ])
    .smoothSplineTo(
      [p.hookHeight / 2, 0],
      -45,
    )
    .lineTo([hookWidth / 2, 0])
    .line(
      -hookWidth / 4,
      p.hookHeight / 2,
    )
    .smoothSplineTo([0, p.hookHeight], {
      endTangent: 180,
      endFactor: 0.6,
    })
    .closeWithMirror()
    .sketchOnPlane('XZ')
    .extrude(p.thickness)
    .translate([
      0,
      p.thickness / 2,
      p.height - p.thickness / 2,
    ]);

  return body.fuse(hook);
}
