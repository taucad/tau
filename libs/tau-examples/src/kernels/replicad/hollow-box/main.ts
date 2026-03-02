/**
 * Parametric Box with Rounded Corners
 * A customizable box with adjustable dimensions and corner radii.
 */
import { drawRoundedRectangle } from 'replicad';

export const defaultParams = {
  width: 100, // Width of the box in mm
  length: 150, // Length of the box in mm
  height: 50, // Height of the box in mm
  thickness: 2, // Wall thickness in mm
  cornerRadius: 5, // Radius for rounded corners
};

export default function main(
  p = defaultParams,
) {
  // Create outer shape
  const outer = drawRoundedRectangle(
    p.width,
    p.length,
    p.cornerRadius,
  )
    .sketchOnPlane()
    .extrude(p.height);

  // Hollow out the box using the shell function
  const hollowBox = outer.shell(
    p.thickness,
    (f) => f.inPlane('XY', p.height),
  );

  return hollowBox;
}
