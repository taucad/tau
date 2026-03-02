/**
 * Parametric Staircase Model
 * A customizable staircase with adjustable dimensions, stringers, handrails, and balusters.
 */
import type { Point2D } from 'replicad';
import {
  draw,
  drawRoundedRectangle,
  drawCircle,
} from 'replicad';

export const defaultParams = {
  // Main staircase dimensions
  staircaseHeight: 2700, // Mm - typical floor-to-floor height
  staircaseRun: 3600, // Mm - horizontal length of staircase
  staircaseWidth: 1200, // Mm - width of stairs
  stepCount: 15, // Number of steps

  // Step customization
  stepThickness: 50, // Mm - thickness of each step
  stepNosing: 25, // Mm - step overhang
  roundedStep: true, // Whether to use rounded corners on steps
  stepCornerRadius: 10, // Mm - radius for rounded corners on steps

  // Stringer options
  includeStringer: true, // Whether to include side stringers
  stringerWidth: 50, // Mm - width of stringer boards
  stringerThickness: 25, // Mm - thickness of stringer boards

  // Handrail options
  includeHandrail: true, // Whether to include handrails
  handrailHeight: 900, // Mm - height from step to top of handrail
  handrailDiameter: 60, // Mm - diameter of handrail
  includeBaluster: true, // Whether to include vertical balusters
  balusterSpacing: 200, // Mm - spacing between balusters
  balusterDiameter: 20, // Mm - diameter of balusters
};

/**
 * Creates a single baluster at the specified position
 * @param x X coordinate of baluster
 * @param y Y coordinate of baluster
 * @param z Z coordinate of baluster
 * @param p Parameters object containing dimensions
 * @returns The baluster 3D shape
 */
function createBaluster(
  x: number,
  y: number,
  z: number,
  p = defaultParams,
) {
  return drawCircle(
    p.balusterDiameter / 2,
  )
    .sketchOnPlane('XY')
    .extrude(p.handrailHeight)
    .translate([x, y, z]);
}

/**
 * Creates a handrail segment between two points
 * @param x1 Start X coordinate
 * @param y1 Start Y coordinate
 * @param z1 Start Z coordinate
 * @param x2 End X coordinate
 * @param y2 End Y coordinate
 * @param z2 End Z coordinate
 * @param p Parameters object containing dimensions
 * @returns The handrail segment 3D shape
 */
function createHandrailSegment(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  p = defaultParams,
) {
  // Calculate segment length and angles
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dy, dz);

  // Create basic cylinder
  const segment = drawCircle(
    p.handrailDiameter / 2,
  )
    .sketchOnPlane('XY')
    .extrude(length);

  // If the segment is perfectly vertical, no rotation needed
  if (
    Math.abs(dx) < 0.001 &&
    Math.abs(dy) < 0.001
  ) {
    return segment.translate([
      x1,
      y1,
      z1,
    ]);
  }

  // Otherwise we need to rotate to align with the segment direction
  const angleX =
    90 -
    Math.atan2(dz, Math.hypot(dx, dy)) *
      (180 / Math.PI);

  return segment
    .rotate(
      angleX,
      [0, 1, 0],
      [0, 1, 0],
    ) // Rotate around Y axis for X-Z angle
    .translate([x1, y1, z1]); // Move to start position
}

export default function main(
  p = defaultParams,
) {
  // Calculate derived dimensions
  const stepRise =
    p.staircaseHeight / p.stepCount; // Height of each step
  const stepRun =
    p.staircaseRun / p.stepCount; // Depth of each step

  // Validation of dimensions against typical building codes
  // Most codes require:
  // - Rise: 150-220mm (5.9-8.7")
  // - Run: minimum 240mm (9.5")
  // - 2R + T = 550-700mm (where R=rise, T=tread)
  if (
    stepRise < 150 ||
    stepRise > 220
  ) {
    console.warn(
      `Warning: Step rise (${stepRise.toFixed(1)}mm) outside recommended range (150-220mm)`,
    );
  }

  if (stepRun < 240) {
    console.warn(
      `Warning: Step run (${stepRun.toFixed(1)}mm) below recommended minimum (240mm)`,
    );
  }

  const walkingFormula =
    2 * stepRise + stepRun;
  if (
    walkingFormula < 550 ||
    walkingFormula > 700
  ) {
    console.warn(
      `Warning: Walking formula (2R + T = ${walkingFormula.toFixed(1)}mm) outside recommended range (550-700mm)`,
    );
  }

  // Build individual steps
  let staircase = null;

  for (
    let i = 0;
    i < p.stepCount;
    i++
  ) {
    // Calculate step position
    const x = i * stepRun;
    const z = i * stepRise;

    // Create basic step shape
    let step;
    if (p.roundedStep) {
      // For rounded rectangle, we need width, height, and corner radius
      step = drawRoundedRectangle(
        stepRun + p.stepNosing,
        p.staircaseWidth,
        p.stepCornerRadius,
      )
        .sketchOnPlane('XY') // Steps are in XY plane
        .extrude(p.stepThickness) // Extrude to create 3D step
        .translate([
          x - p.stepNosing,
          0,
          z,
        ]); // Position step
    } else {
      // For regular rectangle using draw
      step = draw([
        x - p.stepNosing,
        -p.staircaseWidth / 2,
      ])
        .hLine(stepRun + p.stepNosing) // Horizontal line to the right
        .vLine(p.staircaseWidth) // Vertical line up
        .hLine(
          -(stepRun + p.stepNosing),
        ) // Horizontal line to the left
        .close()
        .sketchOnPlane('XY')
        .extrude(p.stepThickness)
        .translate([
          -p.stepNosing,
          0,
          z,
        ]);
    }

    // Add step to staircase
    staircase =
      staircase === null
        ? step
        : staircase.fuse(step);
  }

  // Add stringers if requested
  if (p.includeStringer) {
    // Create left stringer shape
    // First create the profile in XZ plane
    const leftStringerProfile: Point2D[] =
      [];

    // Add points for the stringer profile
    leftStringerProfile.push(
      [-p.stepNosing, 0],
      [p.staircaseRun, 0],
      [
        p.staircaseRun,
        p.staircaseHeight,
      ],
      [
        p.staircaseRun - stepRun,
        p.staircaseHeight,
      ],
    ); // Top step

    // Add sawtooth pattern for steps
    for (
      let i = p.stepCount - 1;
      i >= 0;
      i--
    ) {
      leftStringerProfile.push(
        [
          i * stepRun,
          i * stepRise +
            p.stepThickness,
        ],
        [i * stepRun, i * stepRise],
      );
    }

    // Create the stringer profile using these points
    let leftStringerPen = draw(
      leftStringerProfile[0],
    );
    for (
      let i = 1;
      i < leftStringerProfile.length;
      i++
    ) {
      leftStringerPen =
        leftStringerPen.lineTo(
          leftStringerProfile[i]!,
        );
    }

    // Create left stringer
    const leftStringerSketch =
      leftStringerPen
        .close()
        .sketchOnPlane('XZ');
    const leftStringer =
      leftStringerSketch
        .extrude(p.stringerWidth)
        .translate([
          0,
          -p.staircaseWidth / 2 +
            p.stringerWidth,
          0,
        ]);

    // Create right stringer
    const rightStringer = leftStringer
      .clone()
      .translate([
        0,
        p.staircaseWidth -
          p.stringerWidth,
        0,
      ]);

    // Add stringers to staircase
    staircase &&= staircase
      .fuse(leftStringer)
      .fuse(rightStringer);
  }

  // Add handrails if requested
  if (p.includeHandrail) {
    // Create handrails on both sides

    // Create left and right handrails
    let leftHandrail = null;
    let rightHandrail = null;

    // Left and right Y positions
    const leftY =
      -p.staircaseWidth / 2 +
      p.stringerWidth / 2;
    const rightY =
      p.staircaseWidth / 2 -
      p.stringerWidth / 2;

    // Create segments for each step section
    for (
      let i = 0;
      i < p.stepCount;
      i++
    ) {
      const x1 = i * stepRun;
      const z1 = i * stepRise;
      const x2 = (i + 1) * stepRun;
      const z2 = (i + 1) * stepRise;

      // Create handrail segments with proper height offset
      const leftSegment =
        createHandrailSegment(
          x1,
          leftY,
          z1 + p.handrailHeight,
          x2,
          leftY,
          z2 + p.handrailHeight,
          p,
        );

      const rightSegment =
        createHandrailSegment(
          x1,
          rightY,
          z1 + p.handrailHeight,
          x2,
          rightY,
          z2 + p.handrailHeight,
          p,
        );

      // Add segments to respective handrails
      leftHandrail =
        leftHandrail === null
          ? leftSegment
          : leftHandrail.fuse(
              leftSegment,
            );

      rightHandrail =
        rightHandrail === null
          ? rightSegment
          : rightHandrail.fuse(
              rightSegment,
            );

      // Add balusters if requested
      if (
        p.includeBaluster &&
        staircase
      ) {
        // Place balusters at start of each step
        const leftBaluster =
          createBaluster(
            x1,
            leftY,
            z1,
            p,
          );
        const rightBaluster =
          createBaluster(
            x1,
            rightY,
            z1,
            p,
          );

        staircase = staircase
          .fuse(leftBaluster)
          .fuse(rightBaluster);

        // Add intermediate balusters if step is wide enough
        if (
          stepRun >
          p.balusterSpacing * 1.5
        ) {
          const numberIntermediateBalusters =
            Math.floor(
              stepRun /
                p.balusterSpacing,
            ) - 1;

          for (
            let j = 1;
            j <=
            numberIntermediateBalusters;
            j++
          ) {
            const balusterX =
              x1 +
              (j * stepRun) /
                (numberIntermediateBalusters +
                  1);
            const balusterZ =
              z1 +
              (j * stepRise) /
                (numberIntermediateBalusters +
                  1);

            const intermediateLeftBaluster =
              createBaluster(
                balusterX,
                leftY,
                balusterZ,
                p,
              );
            const intermediateRightBaluster =
              createBaluster(
                balusterX,
                rightY,
                balusterZ,
                p,
              );

            staircase = staircase
              .fuse(
                intermediateLeftBaluster,
              )
              .fuse(
                intermediateRightBaluster,
              );
          }
        }
      }
    }

    // Add final balusters at the top
    if (
      p.includeBaluster &&
      staircase
    ) {
      const topLeftBaluster =
        createBaluster(
          p.staircaseRun,
          leftY,
          p.staircaseHeight,
          p,
        );
      const topRightBaluster =
        createBaluster(
          p.staircaseRun,
          rightY,
          p.staircaseHeight,
          p,
        );
      staircase = staircase
        .fuse(topLeftBaluster)
        .fuse(topRightBaluster);
    }

    // Add handrails to staircase
    if (
      staircase &&
      leftHandrail &&
      rightHandrail
    ) {
      staircase = staircase
        .fuse(leftHandrail)
        .fuse(rightHandrail);
    }
  }

  return staircase;
}
