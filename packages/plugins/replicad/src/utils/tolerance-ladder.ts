/**
 * Quantized tolerance ladder with hysteresis (catalogue E8, audit Q11).
 *
 * A preset's linear tolerance scales with the scene's bounding-box diagonal, so every pose frame that moves a part
 * changes it a little and every part is meshed again. The ladder snaps the tolerance to rungs a quarter octave apart
 * (2^(k/4) mm) and keeps the previous rung until the raw value moves three quarters of a rung away from it, so a drag
 * stays on one rung and unchanged parts keep their meshes.
 *
 * It changes the tolerance a reuse-off render meshes at, and so the delivered bytes: the kernel applies it only when
 * the `tessellationLadder` option is on (default off).
 *
 * @internal
 */
import { occtPresetLinearToleranceRange } from '@taucad/occt-core';

/** Rungs per doubling of the linear tolerance. */
const rungsPerOctave = 4;
/** How far, in rungs, the raw value may move from the current rung before the rung changes. */
const holdRungs = 0.75;

/** A ladder that remembers the last rung per request. @internal */
export type ToleranceLadder = {
  /**
   * The rung for a raw linear tolerance.
   * @param request - What the rung is remembered under, such as the preset name.
   * @param linearTolerance - The raw tolerance in millimetres.
   * @returns The rung's tolerance in millimetres, inside the preset range.
   */
  quantize(request: string, linearTolerance: number): number;
};

/**
 * Creates a tolerance ladder.
 * @returns The ladder.
 * @internal
 */
export function createToleranceLadder(): ToleranceLadder {
  const rungs = new Map<string, number>();
  return {
    quantize(request, linearTolerance) {
      if (!Number.isFinite(linearTolerance) || linearTolerance <= 0) {
        return linearTolerance;
      }
      const position = rungsPerOctave * Math.log2(linearTolerance);
      const previous = rungs.get(request);
      const rung =
        previous !== undefined && Math.abs(position - previous) <= holdRungs ? previous : Math.round(position);
      rungs.set(request, rung);
      return Math.min(
        occtPresetLinearToleranceRange.max,
        Math.max(occtPresetLinearToleranceRange.min, 2 ** (rung / rungsPerOctave)),
      );
    },
  };
}
