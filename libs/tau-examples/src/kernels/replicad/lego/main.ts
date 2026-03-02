/**
 * Parametric LEGO Brick
 * A simplified and more robust version with standard LEGO dimensions.
 * Features hollow bottom for connecting to other bricks.
 */
import {
  drawCircle,
  drawRectangle,
} from 'replicad';

export const defaultParams = {
  // Basic brick dimensions in LEGO units
  width: 2, // Number of studs wide
  length: 4, // Number of studs long
  height: 1, // Height (1 = standard brick, 1/3 = plate)

  // Standard LEGO dimensions in mm
  studDiameter: 4.8,
  studHeight: 1.8,
  wallThickness: 1.5, // Increased for better stability
  baseThickness: 1.2, // Slightly thicker base

  // Tube dimensions
  tubeOuterDiameter: 6.5,
  tubeInnerDiameter: 4.8,
  tubeHeight: 8 - 1.2, // Full height minus base thickness

  // Base unit (1 LEGO unit = 8mm)
  unit: 8,

  // Features
  enableTubes: true, // Include bottom tubes
  rounded: false, // Simplified version without rounds
};

/**
 * Creates a single stud
 * @param p Parameters object
 * @returns The stud shape
 */
function createStud(p = defaultParams) {
  return drawCircle(p.studDiameter / 2)
    .sketchOnPlane()
    .extrude(p.studHeight);
}

/**
 * Creates a bottom tube (hollow cylinder)
 * @param p Parameters object
 * @returns The tube shape
 */
function createBottomTube(
  p = defaultParams,
) {
  const outer = drawCircle(
    p.tubeOuterDiameter / 2,
  )
    .sketchOnPlane()
    .extrude(p.tubeHeight);

  const inner = drawCircle(
    p.tubeInnerDiameter / 2,
  )
    .sketchOnPlane()
    .extrude(p.tubeHeight);

  return outer.cut(inner);
}

/**
 * Determines tube positions for any brick size
 * @param width Number of studs wide
 * @param length Number of studs long
 * @returns Array of [x,y] positions for tubes
 */
function calculateTubePositions(
  width: number,
  length: number,
) {
  const positions: Array<
    [number, number]
  > = [];

  if (width === 1) {
    // 1-wide bricks don't have tubes
    return positions;
  }

  // For wider bricks, create appropriate grid of tubes
  // Skip outer edges, place tubes in interior
  // For wider bricks, place tubes at intersection of 4 studs
  for (let x = 0; x < width - 1; x++) {
    for (
      let y = 0;
      y < length - 1;
      y++
    ) {
      // Convert to centered coordinates and offset by 0.5 to place between studs
      const xPos = x - (width - 2) / 2;
      const yPos = y - (length - 2) / 2;
      positions.push([xPos, yPos]);
    }
  }

  return positions;
}

export default function main(
  p = defaultParams,
) {
  // Calculate dimensions
  const totalWidth = p.width * p.unit;
  const totalLength = p.length * p.unit;
  const totalHeight = p.height * p.unit;

  // Create main body
  const brickBody = drawRectangle(
    totalWidth,
    totalLength,
  )
    .sketchOnPlane()
    .extrude(totalHeight);

  // Create bottom hollow
  const hollowWidth =
    totalWidth - 2 * p.wallThickness;
  const hollowLength =
    totalLength - 2 * p.wallThickness;
  const hollowHeight =
    totalHeight - p.baseThickness;

  const bottomHollow = drawRectangle(
    hollowWidth,
    hollowLength,
  )
    .sketchOnPlane()
    .extrude(hollowHeight);

  // Start building the brick
  let brick = brickBody;

  // Add studs
  for (let x = 0; x < p.width; x++) {
    for (let y = 0; y < p.length; y++) {
      const xPos =
        (x - (p.width - 1) / 2) *
        p.unit;
      const yPos =
        (y - (p.length - 1) / 2) *
        p.unit;

      const stud = createStud(
        p,
      ).translate([
        xPos,
        yPos,
        totalHeight,
      ]);
      brick = brick.fuse(stud);
    }
  }

  // Cut out the bottom hollow
  brick = brick.cut(
    bottomHollow.translate([0, 0, 0]),
  );

  // Add bottom tubes
  if (p.enableTubes) {
    const tubePositions =
      calculateTubePositions(
        p.width,
        p.length,
      );

    for (const [
      x,
      y,
    ] of tubePositions) {
      const xPos = x * p.unit;
      const yPos = y * p.unit;

      const tube = createBottomTube(
        p,
      ).translate([xPos, yPos, 0]);
      brick = brick.fuse(tube);
    }
  }

  return brick;
}
