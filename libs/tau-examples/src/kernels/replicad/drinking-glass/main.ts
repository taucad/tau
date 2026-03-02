/**
 * Parametric Drinking Glass
 * A customizable glass with adjustable dimensions for height, radii, and thickness.
 */
import { draw } from 'replicad';

export const defaultParams = {
  height: 140, // Overall height of the glass in mm
  topRadius: 45, // Radius of the top opening in mm
  baseRadius: 80, // Radius of the base in mm
  wallThickness: 1, // Thickness of the glass walls and base in mm

  filletRim: true, // Whether to add a fillet to the rim
  rimFilletRadius: 1, // Radius for the rim fillet
  filletBase: true, // Whether to add a fillet to the outer base edge
  baseFilletRadius: 40, // Radius for the base fillet
};

export default function main(
  p = defaultParams,
) {
  // Validate parameters to prevent common issues
  if (p.topRadius <= 0) {
    console.warn(
      'topRadius should be greater than 0 for a valid opening.',
    );
    // Fallback to a minimum radius if invalid to avoid errors
    p.topRadius = Math.max(
      p.topRadius,
      p.wallThickness * 1.1,
    );
  }

  if (p.topRadius < p.wallThickness) {
    console.warn(
      'topRadius is less than wallThickness, shelling may fail or produce unexpected results.',
    );
  }

  if (p.baseRadius < 0) {
    console.warn(
      'baseRadius cannot be negative. Setting to 0.',
    );
    p.baseRadius = 0;
  }

  if (
    p.baseRadius < p.wallThickness &&
    p.baseRadius > 0
  ) {
    console.warn(
      'baseRadius is less than wallThickness, shelling may produce unexpected results for the base.',
    );
  }

  if (p.height <= 0) {
    console.warn(
      'Height must be positive.',
    );
    p.height = 10; // Fallback height
  }

  if (p.wallThickness <= 0) {
    console.warn(
      'Wall thickness must be positive.',
    );
    p.wallThickness = 0.5; // Fallback thickness
  }

  // Create the 2D profile for revolution.
  // The sketch is on the XZ plane, so points are [x, z].
  // The glass will be revolved around the Z-axis.
  const profile = draw([0, 0]) // Start at the center of the base
    .lineTo([p.baseRadius, 0]) // Outer edge of the base
    .lineTo([p.topRadius, p.height]) // Outer edge of the top rim
    .lineTo([0, p.height]) // Center of the top (this line forms the top surface to be removed by shell)
    .close(); // Close the profile by connecting back to [0,0]

  // Revolve the profile to create a solid shape.
  let glassSolid = profile
    .sketchOnPlane('XZ')
    .revolve();

  // Hollow out the glass using the shell operation.
  // We remove the top face to create the opening.
  try {
    glassSolid = glassSolid.shell(
      p.wallThickness,
      (f) => f.inPlane('XY', p.height), // Find faces in the XY plane at the specified height
    );
  } catch (error) {
    console.error(
      'Shell operation failed. This might be due to thickness or geometry constraints.',
      error,
    );
    // Return the solid un-shelled shape if shelling fails
    return glassSolid;
  }

  // Apply fillet to the rim if enabled
  if (
    p.filletRim &&
    p.rimFilletRadius > 0
  ) {
    try {
      glassSolid = glassSolid.fillet(
        p.rimFilletRadius,
        (e) =>
          e.inPlane('XY', p.height), // Select edges on the top plane (inner and outer rim)
      );
    } catch (error) {
      console.warn(
        'Rim fillet operation failed.',
        error,
      );
    }
  }

  // Apply fillet to the base if enabled and baseRadius is positive
  if (
    p.baseRadius > 0 &&
    p.filletBase &&
    p.baseFilletRadius > 0
  ) {
    try {
      glassSolid = glassSolid
        .fillet(
          p.baseFilletRadius,
          (e) =>
            e.inPlane(
              'XY',
              p.wallThickness,
            ), // Select edges on the bottom plane
        )
        .fillet(
          p.baseFilletRadius,
          (e) => e.inPlane('XY', 0), // Select edges on the bottom plane
        );
    } catch (error) {
      console.warn(
        'Base fillet operation failed.',
        error,
      );
    }
  }

  return {
    shape: glassSolid,
    color: '#7598a321',
  };
}
