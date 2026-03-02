/**
 * Parametric Wavy Vase
 * A vase with adjustable dimensions and wavy edges.
 */
import {
  drawCircle,
  drawPolysides,
  polysideInnerRadius,
} from 'replicad';

export const defaultParams = {
  height: 150,
  radius: 40,
  sidesCount: 12,
  sideRadius: -2,
  sideTwist: 6,
  endFactor: 1.5,
  topFillet: 0,
  bottomFillet: 5,
  holeMode: 1,
  wallThickness: 2,
};

export default function main(
  p = defaultParams,
) {
  const extrusionProfile = p.endFactor
    ? Object.freeze({
        profile: 's-curve',
        endFactor: p.endFactor,
      })
    : undefined;
  const twistAngle =
    (360 / p.sidesCount) * p.sideTwist;

  let shape = drawPolysides(
    p.radius,
    p.sidesCount,
    -p.sideRadius,
  )
    .sketchOnPlane()
    .extrude(p.height, {
      twistAngle,
      extrusionProfile,
    });

  if (p.bottomFillet) {
    shape = shape.fillet(
      p.bottomFillet,
      (e) => e.inPlane('XY'),
    );
  }

  if (
    p.holeMode === 1 ||
    p.holeMode === 2
  ) {
    const holeHeight =
      p.height - p.wallThickness;

    let hole;
    if (p.holeMode === 1) {
      const insideRadius =
        polysideInnerRadius(
          p.radius,
          p.sidesCount,
          p.sideRadius,
        ) - p.wallThickness;

      hole = drawCircle(insideRadius)
        .sketchOnPlane()
        .extrude(holeHeight, {
          extrusionProfile,
        });

      shape = shape.cut(
        hole
          .fillet(
            Math.max(
              p.wallThickness / 3,
              p.bottomFillet -
                p.wallThickness,
            ),
            (e) => e.inPlane('XY'),
          )
          .translate([
            0,
            0,
            p.wallThickness,
          ]),
      );
    } else {
      shape = shape.shell(
        p.wallThickness,
        (f) =>
          f.inPlane('XY', p.height),
      );
    }
  }

  if (p.topFillet) {
    shape = shape.fillet(
      p.topFillet,
      (e) => e.inPlane('XY', p.height),
    );
  }

  return shape;
}
