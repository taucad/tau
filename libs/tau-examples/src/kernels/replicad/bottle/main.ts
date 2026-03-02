/**
 * Parametric Bottle
 * A simple bottle with adjustable dimensions and rounded edges.
 */
import type { Sketch } from 'replicad';
import {
  draw,
  makeCylinder,
  makeOffset,
  FaceFinder,
} from 'replicad';

export const defaultParams = {
  width: 50,
  height: 70,
  thickness: 30,
};

export default function main(
  p = defaultParams,
) {
  let shape = draw([-p.width / 2, 0])
    .vLine(-p.thickness / 4)
    .threePointsArc(
      p.width,
      0,
      p.width / 2,
      -p.thickness / 4,
    )
    .vLine(p.thickness / 4)
    .closeWithMirror()
    .sketchOnPlane()
    .extrude(p.height)
    .fillet(p.thickness / 12);

  const myNeckRadius = p.thickness / 4;
  const myNeckHeight = p.height / 10;
  const neck = makeCylinder(
    myNeckRadius,
    myNeckHeight,
    [0, 0, p.height],
    [0, 0, 1],
  );

  shape = shape.fuse(neck);

  shape = shape.shell(
    p.thickness / 50,
    (f) =>
      f.inPlane('XY', [
        0,
        0,
        p.height + myNeckHeight,
      ]),
  );

  const neckFace = new FaceFinder()
    .containsPoint([
      0,
      myNeckRadius,
      p.height,
    ])
    .ofSurfaceType('CYLINDRE')
    .find(shape.clone(), {
      unique: true,
    });

  const bottomThreadFace = makeOffset(
    neckFace,
    -0.01 * myNeckRadius,
  ).faces[0]!;
  const baseThreadSketch = draw([
    0.75, 0.25,
  ])
    .halfEllipse(2, 0.5, 0.1)
    .close()
    .sketchOnFace(
      bottomThreadFace,
      'bounds',
    ) as Sketch;

  const topThreadFace = makeOffset(
    neckFace,
    0.05 * myNeckRadius,
  ).faces[0]!;
  const topThreadSketch = draw([
    0.75, 0.25,
  ])
    .halfEllipse(2, 0.5, 0.05)
    .close()
    .sketchOnFace(
      topThreadFace,
      'bounds',
    ) as Sketch;

  const thread =
    baseThreadSketch.loftWith(
      topThreadSketch,
    );

  return shape.fuse(thread);
}
