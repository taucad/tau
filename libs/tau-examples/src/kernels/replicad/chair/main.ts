/**
 * Parametric Chair Model
 * A customizable chair with adjustable dimensions.
 */
import { drawRectangle } from 'replicad';

export const defaultParams = {
  // Overall dimensions
  seatWidth: 450, // Mm - Width of the seat
  seatDepth: 420, // Mm - Depth of the seat
  seatHeight: 460, // Mm - Height from floor to top of seat

  // Component thicknesses
  seatThickness: 20, // Mm - Thickness of the seat plate
  legThickness: 40, // Mm - Thickness of the square legs
  backrestHeight: 500, // Mm - Height of the backrest from the seat
  backrestThickness: 20, // Mm - Thickness of the backrest

  // Design details
  backrestAngle: 10, // Degrees - Angle of the backrest from vertical (positive leans back)
  filletRadius: 5, // Mm - Radius for filleting edges (0 for sharp edges)
};

export default function main(
  p = defaultParams,
) {
  // Create Seat
  const seat = drawRectangle(
    p.seatWidth,
    p.seatDepth,
  )
    .sketchOnPlane('XY')
    .extrude(p.seatThickness)
    .translateZ(
      p.seatHeight - p.seatThickness,
    ); // Position seat top at seatHeight

  // Create Legs
  const legProfile = drawRectangle(
    p.legThickness,
    p.legThickness,
  ).sketchOnPlane('XY');
  const legHeight =
    p.seatHeight - p.seatThickness;
  const singleLeg =
    legProfile.extrude(legHeight);

  // Calculate leg positions relative to seat center
  const legOffsetX =
    p.seatWidth / 2 -
    p.legThickness / 2;
  const legOffsetY =
    p.seatDepth / 2 -
    p.legThickness / 2;

  // Create four legs by cloning and translating
  const legFL = singleLeg
    .clone()
    .translate([
      -legOffsetX,
      legOffsetY,
      0,
    ]); // Front Left
  const legFR = singleLeg
    .clone()
    .translate([
      legOffsetX,
      legOffsetY,
      0,
    ]); // Front Right
  const legBL = singleLeg
    .clone()
    .translate([
      -legOffsetX,
      -legOffsetY,
      0,
    ]); // Back Left
  const legBR = singleLeg
    .clone()
    .translate([
      legOffsetX,
      -legOffsetY,
      0,
    ]); // Back Right

  // Create Backrest
  const angleRadians =
    (p.backrestAngle * Math.PI) / 180;
  const zOffset =
    p.backrestThickness *
    Math.sin(angleRadians);
  // Create backrest vertically first, starting at the seat top
  const backrestStartZ =
    p.seatHeight +
    p.backrestHeight / 2 -
    zOffset -
    5;
  let backrest = drawRectangle(
    p.seatWidth,
    p.backrestHeight,
  )
    .sketchOnPlane('XZ') // Sketch in XZ plane for vertical orientation
    .extrude(p.backrestThickness)
    // Position it at the back edge of the seat, centered, thickness protruding backwards
    // The Z position is exactly at the seat height (top of seat)
    .translate([
      0,
      -p.seatDepth / 2 +
        p.backrestThickness,
      backrestStartZ,
    ]);

  // Apply backrest angle if specified
  if (p.backrestAngle !== 0) {
    // Rotation axis is along the bottom edge of the backrest at the seat height
    const rotationAxisOrigin: [
      number,
      number,
      number,
    ] = [
      0,
      -p.seatDepth / 2,
      p.seatHeight,
    ];
    const rotationAxisDirection: [
      number,
      number,
      number,
    ] = [1, 0, 0]; // Rotate around X-axis
    backrest = backrest.rotate(
      p.backrestAngle,
      rotationAxisOrigin,
      rotationAxisDirection,
    );
  }

  // Assemble Chair
  let chair = seat
    .fuse(legFL)
    .fuse(legFR)
    .fuse(legBL)
    .fuse(legBR)
    .fuse(backrest);

  // Apply Fillets (Optional)
  if (p.filletRadius > 0) {
    // Example: Fillet top edges of the seat and front/top edges of backrest
    // More specific filtering might be needed for a production model
    try {
      chair = chair.fillet(
        p.filletRadius,
        (e) =>
          e.either([
            (f) =>
              f.inPlane(
                'XY',
                p.seatHeight,
              ), // Top surface edges of seat
            (f) =>
              f.containsPoint([
                0,
                -p.seatDepth / 2,
                p.seatHeight +
                  p.backrestHeight *
                    0.9,
              ]), // Edges near top of backrest
          ]),
      );
    } catch (error) {
      console.warn(
        'Filleting failed, returning shape without fillets:',
        error,
      );
    }
  }

  return chair;
}
