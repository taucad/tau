/**
 * Wire shapes shared by the offline engine and its bridge.
 *
 * Command payloads come from kcl-lib as `serde_json` text, so a command is typed loosely here and each handler
 * narrows the fields it reads. Response payloads go back as `OkModelingCmdResponse` (`{ type, data }`).
 */

/** One `ModelingCmd` as kcl-lib serialises it: a `type` tag plus the variant's snake_case fields. */
export type ModelingCommand = { type: string } & Record<string, unknown>;

/** One `OkModelingCmdResponse` as kcl-lib deserialises it. */
export type ModelingResponse = { type: string; data?: Record<string, unknown> };

/** Point on the wire: three lengths (mm) or a unitless direction. */
export type WirePoint3d = { x: number; y: number; z: number };

/** Two-dimensional point on the wire, in the sketch plane's local frame. */
export type WirePoint2d = { x: number; y: number };

/** Angle on the wire. */
export type WireAngle = { unit: 'degrees' | 'radians'; value: number };

/**
 * A failure the engine reports back to kcl-lib with an engine error code.
 *
 * @public
 */
export class OfflineEngineError extends Error {
  public readonly code: string;

  public constructor(message: string, code = 'internal_engine') {
    super(message);
    this.name = 'OfflineEngineError';
    this.code = code;
  }
}

/**
 * Converts a wire angle to radians.
 *
 * @param angle - wire angle
 * @returns the angle in radians
 */
export function toRadians(angle: WireAngle | undefined): number {
  if (!angle) {
    return 0;
  }

  return angle.unit === 'degrees' ? (angle.value * Math.PI) / 180 : angle.value;
}
