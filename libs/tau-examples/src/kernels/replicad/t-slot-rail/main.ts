/**
 * Parametric T-Slot Rail
 * A T-slotted framing rail, or T-slot extrusion, is a rectangular or square aluminum profile with a "T" shaped slot along one or more sides. These slots allow for easy attachment of various hardware components like brackets, connectors, and fasteners, making it a versatile and customizable framing system.
 */
import {
  draw,
  drawCircle,
} from 'replicad';

export const defaultParams = {
  railHeight: 20,
  railLength: 1200,
  interiorRadius: 0.05,
  scoreDepth: 0.05,
  cornerRadius: 0.2,
  holeRadius: 0.4,
};

export default function main(
  p = defaultParams,
) {
  // Convert to normalized units (rail height = 1.0 in normalized space)
  const ir = p.interiorRadius;
  const sd = p.scoreDepth;
  const cr = p.cornerRadius;

  // Create one quarter of the T-slot profile (one leg)
  const quarterProfile = draw([0, 0])
    .vLine(0.8)
    .hLine(-0.45)
    .tangentArc(-0.25, 0.1) // Arc to begin the leg
    .line(-(0.8 - ir), 0.8 - ir) // Diagonal
    .tangentArc(ir / 2, ir) // 270° turn to begin slot wall
    .hLine(0.7 - ir * 2)
    .tangentArc(ir, ir)
    .vLine(0.3 - ir * 2)
    .tangentArc(-ir, ir)
    .hLine(-(0.15 - ir))
    .hSagittaArc(-sd * 2, sd) // Add the scores
    .hLine(-(0.775 - ir - sd * 4)) // Move across, subtracting the scores
    .hSagittaArc(-sd * 2, sd)
    .hLine(
      -(
        0.35 -
        cr *
          (1 +
            Math.tan(
              (22.5 * Math.PI) / 180,
            ))
      ),
    ) // Subtract the curve radius plus the half-curve distance
    .tangentArc(
      -cr,
      -cr *
        Math.tan(
          (22.5 * Math.PI) / 180,
        ),
    ) // Create a half-curve to mirror on
    .closeWithMirror();

  const mirroredProfile =
    quarterProfile.mirror(
      [-1, 0],
      [0, 0],
      'plane',
    );
  const halfProfile =
    quarterProfile.fuse(
      mirroredProfile,
    );
  const fullProfile = halfProfile.fuse(
    halfProfile.mirror([0, 0]),
  );

  const hole = drawCircle(p.holeRadius);
  const finishedProfile =
    fullProfile.cut(hole);

  // // Extrude the profile
  const tSlotRail = finishedProfile
    .scale(p.railHeight, [0, 0])
    .sketchOnPlane('XZ')
    .extrude(p.railLength);

  return tSlotRail;
}
