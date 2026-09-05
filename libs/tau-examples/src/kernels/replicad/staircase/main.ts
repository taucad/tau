/**
 * Parametric Staircase Model
 * A customizable staircase with adjustable dimensions, stringers, handrails, and balusters.
 */
import type { Point2D, Shape3D, ShapeConfig } from 'replicad';
import { draw, drawRoundedRectangle, drawCircle } from 'replicad';

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

function createBaluster(
  position: {
    x: number;
    y: number;
    z: number;
  },
  p = defaultParams,
): Shape3D {
  return drawCircle(p.balusterDiameter / 2)
    .sketchOnPlane('XY')
    .extrude(p.handrailHeight)
    .translate([position.x, position.y, position.z]);
}

function createHandrailSegment(
  start: {
    x: number;
    y: number;
    z: number;
  },
  end: {
    x: number;
    y: number;
    z: number;
  },
  p = defaultParams,
): Shape3D {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz);

  const segment = drawCircle(p.handrailDiameter / 2)
    .sketchOnPlane('XY')
    .extrude(length);

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return segment.translate([start.x, start.y, start.z]);
  }

  const angleX = 90 - Math.atan2(dz, Math.hypot(dx, dy)) * (180 / Math.PI);

  return segment
    .rotate(angleX, [0, 1, 0], [0, 1, 0])
    .translate([start.x, start.y, start.z]);
}

function createSteps(
  stepRun: number,
  stepRise: number,
  p = defaultParams,
): Shape3D | null {
  let staircase: Shape3D | null = null;

  for (let index = 0; index < p.stepCount; index++) {
    const x = index * stepRun;
    const z = index * stepRise;

    let step;
    if (p.roundedStep) {
      step = drawRoundedRectangle(
        stepRun + p.stepNosing,
        p.staircaseWidth,
        p.stepCornerRadius,
      )
        .sketchOnPlane('XY')
        .extrude(p.stepThickness)
        .translate([x - p.stepNosing, 0, z]);
    } else {
      step = draw([x - p.stepNosing, -p.staircaseWidth / 2])
        .hLine(stepRun + p.stepNosing)
        .vLine(p.staircaseWidth)
        .hLine(-(stepRun + p.stepNosing))
        .close()
        .sketchOnPlane('XY')
        .extrude(p.stepThickness)
        .translate([-p.stepNosing, 0, z]);
    }

    staircase = staircase === null ? step : staircase.fuse(step);
  }

  return staircase;
}

function createStringers(
  stepRun: number,
  stepRise: number,
  p = defaultParams,
): Shape3D {
  const leftStringerProfile: Point2D[] = [];

  leftStringerProfile.push(
    [0, 0],
    [p.staircaseRun, 0],
    [p.staircaseRun, p.staircaseHeight],
    [p.staircaseRun - stepRun, p.staircaseHeight],
  );

  for (let index = p.stepCount - 1; index >= 0; index--) {
    leftStringerProfile.push([
      index * stepRun,
      index * stepRise + p.stepThickness,
    ]);
    if (index > 0) {
      leftStringerProfile.push([index * stepRun, index * stepRise]);
    }
  }

  let leftStringerPen = draw(leftStringerProfile[0]);
  for (let index = 1; index < leftStringerProfile.length; index++) {
    leftStringerPen = leftStringerPen.lineTo(leftStringerProfile[index]!);
  }

  const leftStringerSketch = leftStringerPen.close().sketchOnPlane('XZ');
  const leftStringer = leftStringerSketch
    .extrude(p.stringerWidth)
    .translate([0, -p.staircaseWidth / 2 + p.stringerWidth, 0]);

  const rightStringer = leftStringer
    .clone()
    .translate([0, p.staircaseWidth - p.stringerWidth, 0]);

  return leftStringer.fuse(rightStringer);
}

function addIntermediateBalusters(
  staircase: Shape3D,
  config: {
    x1: number;
    z1: number;
    stepRun: number;
    stepRise: number;
    leftY: number;
    rightY: number;
  },
  p = defaultParams,
): Shape3D {
  const count = Math.floor(config.stepRun / p.balusterSpacing) - 1;
  let result = staircase;

  for (let index = 1; index <= count; index++) {
    const balusterX = config.x1 + (index * config.stepRun) / (count + 1);
    const balusterZ = config.z1 + (index * config.stepRise) / (count + 1);

    const leftBaluster = createBaluster(
      {
        x: balusterX,
        y: config.leftY,
        z: balusterZ,
      },
      p,
    );
    const rightBaluster = createBaluster(
      {
        x: balusterX,
        y: config.rightY,
        z: balusterZ,
      },
      p,
    );

    result = result.fuse(leftBaluster).fuse(rightBaluster);
  }

  return result;
}

function createHandrails(staircase: Shape3D, p = defaultParams): Shape3D {
  const stepRun = p.staircaseRun / p.stepCount;
  const stepRise = p.staircaseHeight / p.stepCount;

  let result = staircase;
  let leftHandrail: Shape3D | null = null;
  let rightHandrail: Shape3D | null = null;

  const leftY = -p.staircaseWidth / 2 + p.stringerWidth / 2;
  const rightY = p.staircaseWidth / 2 - p.stringerWidth / 2;

  for (let index = 0; index < p.stepCount; index++) {
    const x1 = index * stepRun;
    const z1 = index * stepRise;
    const x2 = (index + 1) * stepRun;
    const z2 = (index + 1) * stepRise;

    const leftSegment = createHandrailSegment(
      {
        x: x1,
        y: leftY,
        z: z1 + p.handrailHeight,
      },
      {
        x: x2,
        y: leftY,
        z: z2 + p.handrailHeight,
      },
      p,
    );
    const rightSegment = createHandrailSegment(
      {
        x: x1,
        y: rightY,
        z: z1 + p.handrailHeight,
      },
      {
        x: x2,
        y: rightY,
        z: z2 + p.handrailHeight,
      },
      p,
    );

    leftHandrail =
      leftHandrail === null ? leftSegment : leftHandrail.fuse(leftSegment);
    rightHandrail =
      rightHandrail === null ? rightSegment : rightHandrail.fuse(rightSegment);

    if (p.includeBaluster) {
      const leftBaluster = createBaluster({ x: x1, y: leftY, z: z1 }, p);
      const rightBaluster = createBaluster({ x: x1, y: rightY, z: z1 }, p);
      result = result.fuse(leftBaluster).fuse(rightBaluster);

      if (stepRun > p.balusterSpacing * 1.5) {
        result = addIntermediateBalusters(
          result,
          {
            x1,
            z1,
            stepRun,
            stepRise,
            leftY,
            rightY,
          },
          p,
        );
      }
    }
  }

  if (p.includeBaluster) {
    const topLeftBaluster = createBaluster(
      {
        x: p.staircaseRun,
        y: leftY,
        z: p.staircaseHeight,
      },
      p,
    );
    const topRightBaluster = createBaluster(
      {
        x: p.staircaseRun,
        y: rightY,
        z: p.staircaseHeight,
      },
      p,
    );
    result = result.fuse(topLeftBaluster).fuse(topRightBaluster);
  }

  if (leftHandrail && rightHandrail) {
    result = result.fuse(leftHandrail).fuse(rightHandrail);
  }

  return result;
}

export default function main(
  p = defaultParams,
): Shape3D | ShapeConfig[] | null {
  const stepRise = p.staircaseHeight / p.stepCount;
  const stepRun = p.staircaseRun / p.stepCount;

  if (stepRise < 150 || stepRise > 220) {
    console.warn(
      `Warning: Step rise (${stepRise.toFixed(1)}mm) outside recommended range (150-220mm)`,
    );
  }

  if (stepRun < 240) {
    console.warn(
      `Warning: Step run (${stepRun.toFixed(1)}mm) below recommended minimum (240mm)`,
    );
  }

  const walkingFormula = 2 * stepRise + stepRun;
  if (walkingFormula < 550 || walkingFormula > 700) {
    console.warn(
      `Warning: Walking formula (2R + T = ${walkingFormula.toFixed(1)}mm) outside recommended range (550-700mm)`,
    );
  }

  let staircase = createSteps(stepRun, stepRise, p);
  let stringers: Shape3D | undefined;

  if (p.includeStringer && staircase) {
    stringers = createStringers(stepRun, stepRise, p);
  }

  if (p.includeHandrail && staircase) {
    staircase = createHandrails(staircase, p);
  }

  return staircase && stringers
    ? [
        { shape: staircase, name: 'Steps and handrails' },
        { shape: stringers, name: 'Stringers' },
      ]
    : staircase;
}
