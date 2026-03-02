/**
 * Parametric Storage Tray/Drawer Organizer
 * A customizable storage solution with adjustable compartments.
 * Designed for reliable 3D printing with proper tolerances.
 */
import { drawRoundedRectangle } from 'replicad';

export const defaultParams = {
  // Overall dimensions
  width: 200, // Mm - total width of the tray
  length: 300, // Mm - total height of the tray
  height: 50, // Mm - total depth of the tray

  // Compartment configuration
  numRows: 4, // Number of rows
  numCols: 3, // Number of columns

  // Construction parameters
  wallThickness: 2, // Mm - thickness of walls (minimum 1.2mm recommended)
  baseThickness: 1.5, // Mm - thickness of the base
  cornerRadius: 4, // Mm - radius for outer corners

  // Features
  includeFillet: true, // Whether to fillet edges
  filletRadius: 0.8, // Mm - radius for fillets (keep small for stability)
};

export default function main(
  p = defaultParams,
) {
  try {
    // Validate parameters
    if (
      p.width < 20 ||
      p.length < 20 ||
      p.height < 10
    ) {
      throw new Error(
        'Dimensions too small - minimum size is 20x20x10mm',
      );
    }

    if (p.wallThickness < 1.2) {
      throw new Error(
        'Wall thickness too small - minimum 1.2mm recommended',
      );
    }

    if (
      p.numRows < 1 ||
      p.numCols < 1
    ) {
      throw new Error(
        'Must have at least 1 row and 1 column',
      );
    }

    // Calculate internal dimensions
    const innerWidth =
      p.width - 2 * p.wallThickness;
    const innerLength =
      p.length - 2 * p.wallThickness;

    // Create base outer shell
    let tray = drawRoundedRectangle(
      p.width,
      p.length,
      p.cornerRadius,
    )
      .sketchOnPlane()
      .extrude(p.height);

    // Create inner cavity
    const innerShell =
      drawRoundedRectangle(
        innerWidth,
        innerLength,
        Math.max(
          p.cornerRadius -
            p.wallThickness,
          1,
        ),
      )
        .sketchOnPlane()
        .extrude(
          p.height - p.baseThickness,
        )
        .translate([
          0,
          0,
          p.baseThickness,
        ]);

    // Cut inner cavity from outer shell
    tray = tray.cut(innerShell);

    // Calculate compartment sizes
    const compartmentWidth =
      innerWidth / p.numCols;
    const compartmentLength =
      innerLength / p.numRows;

    // Create dividers as separate shapes then combine
    let dividers = null;

    // Vertical dividers (columns)
    for (
      let i = 1;
      i < p.numCols;
      i++
    ) {
      const x =
        i * compartmentWidth -
        innerWidth / 2;
      const divider =
        drawRoundedRectangle(
          p.wallThickness,
          innerLength,
          0,
        )
          .sketchOnPlane()
          .extrude(
            p.height - p.baseThickness,
          )
          .translate([
            x,
            0,
            p.baseThickness,
          ]);

      dividers = dividers
        ? dividers.fuse(divider)
        : divider;
    }

    // Horizontal dividers (rows)
    for (
      let i = 1;
      i < p.numRows;
      i++
    ) {
      const y =
        i * compartmentLength -
        innerLength / 2;
      const divider =
        drawRoundedRectangle(
          innerWidth,
          p.wallThickness,
          0,
        )
          .sketchOnPlane()
          .extrude(
            p.height - p.baseThickness,
          )
          .translate([
            0,
            y,
            p.baseThickness,
          ]);

      dividers = dividers
        ? dividers.fuse(divider)
        : divider;
    }

    // Add dividers to main tray
    if (dividers) {
      tray = tray.fuse(dividers);
    }

    // Add fillets if requested
    if (
      p.includeFillet &&
      p.filletRadius > 0
    ) {
      try {
        // Only fillet the top edges
        tray = tray.fillet(
          p.filletRadius,
          (e) =>
            e.inBox(
              [
                -p.width,
                -p.length,
                p.height - 0.1,
              ],
              [
                p.width,
                p.length,
                p.height + 0.1,
              ],
            ),
        );
      } catch {
        console.warn(
          'Failed to create fillets - continuing without them',
        );
      }
    }

    return tray;
  } catch (error) {
    console.error(
      'Error creating tray:',
      (error as Error).message,
    );
    // Return a simple cube as fallback
    return drawRoundedRectangle(
      50,
      50,
      2,
    )
      .sketchOnPlane()
      .extrude(20);
  }
}
