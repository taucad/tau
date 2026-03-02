/**
 * Parametric Vase
 * A vase with adjustable dimensions and rounded edges.
 */
import { draw } from 'replicad';

export const defaultParams = {
  height: 100,
  baseWidth: 20,
  wallThickness: 5,
  lowerCircleRadius: 1.5,
  lowerCirclePosition: 0.25,
  higherCircleRadius: 0.75,
  higherCirclePosition: 0.75,
  topRadius: 0.9,
  topFillet: true,
  bottomHeavy: true,
};

export default function main(
  p = defaultParams,
) {
  const splinesConfig = [
    {
      position: p.lowerCirclePosition,
      radius: p.lowerCircleRadius,
    },
    {
      position: p.higherCirclePosition,
      radius: p.higherCircleRadius,
      startFactor: p.bottomHeavy
        ? 3
        : 1,
    },
    {
      position: 1,
      radius: p.topRadius,
      startFactor: p.bottomHeavy
        ? 3
        : 1,
    },
  ];

  const sketchVaseProfile =
    draw().hLine(p.baseWidth);

  for (const config of splinesConfig) {
    sketchVaseProfile.smoothSplineTo(
      [
        p.baseWidth * config.radius,
        p.height * config.position,
      ],
      {
        endTangent: [0, 1],
        startFactor: config.startFactor,
        // @ts-expect-error - endFactor is not defined in the type
        endFactor: config.endFactor,
      },
    );
  }

  let vase = sketchVaseProfile
    .lineTo([0, p.height])
    .close()
    .sketchOnPlane('XZ')
    .revolve();

  if (p.wallThickness) {
    vase = vase.shell(
      p.wallThickness,
      (f) =>
        f.containsPoint([
          0,
          0,
          p.height,
        ]),
    );
  }

  if (p.topFillet) {
    vase = vase.fillet(
      p.wallThickness / 3,
      (e) => e.inPlane('XY', p.height),
    );
  }

  return vase;
}
