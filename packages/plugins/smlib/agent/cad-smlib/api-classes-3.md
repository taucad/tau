# @classcad/smlibwasm — Classes (3)

5 top-level symbols. Signatures are verbatim typescript.

// A point of a STEP file that belongs to no body, at its place in the assembly
StepPoint: export declare class StepPoint

  readonly name: string

  readonly point: Vector

  readonly product: string

  // [r, g, b] from 0 to 1, or null
  readonly color: readonly number[] | null

  // StepPoint.constructor (constructor)
  constructor(name: string, point: Vector, product?: string, color?: readonly number[] | null);

  // StepPoint.equals (method)
  equals(other: unknown): boolean;

  // StepPoint.toString (method)
  toString(): string;

  // StepPoint.[inspect] (method)
  [inspect](): string;

// The result of `diffImages`
// Remarks: - `changed`: number of pixels that differ. - `total`: number of pixels. - `fraction`: `changed / total`. - `bbox`: `[x0, y0, x1, y1]` of the changed pixels (inclusive), or `null`. - `picture`: a `Picture` of the difference: changed pixels red on a faded gray of the second picture.
ImageDiff: export declare class ImageDiff

  readonly changed: number

  readonly total: number

  readonly fraction: number

  readonly bbox: [number, number, number, number] | null

  readonly picture: Picture

  // ImageDiff.constructor (constructor)
  constructor(changed: number, total: number, fraction: number, bbox: [number, number, number, number] | null, picture: Picture);

  // Write the picture of the difference as a PNG file (Node)
  // ImageDiff.save (method)
  save(path: string): void;

  // ImageDiff.toString (method)
  toString(): string;

  // ImageDiff.[inspect] (method)
  [inspect](): string;

// A render
// Remarks: - `data`: the PNG file contents. - `pixels`: the picture, `width * height` pixels row by row from the top left, three bytes (red, green, blue) each. - `frame`: the frame of a single view, `{ scale, midX, midY }`: output pixels per model unit, and the projected point in the middle of the picture. Pass it as the `frame` option to a later render of the same view and size to get pictures that compare pixel by pixel. `null` for sheets and drawings.
Picture: export declare class Picture

  readonly data: Uint8Array

  readonly pixels: Uint8Array

  readonly width: number

  readonly height: number

  readonly frame: Frame | null

  // Picture.constructor (constructor)
  constructor(data: Uint8Array, image?: _RGBImage | null, frame?: Frame | null);

  // Write the PNG file (Node)
  // Picture.save (method)
  save(path: string): void;

  // Picture.toString (method)
  toString(): string;

  // Picture.[inspect] (method)
  [inspect](): string;

// An SMLib operation failed
// Remarks: `operation` names the smlibwasm call, `status` the kernel status code (e.g. `SM_ERR_INVALID_INPUT`) and `hint` a suggestion when one is known.
KernelError: export declare class KernelError extends ModelingError

  readonly operation: string

  readonly status: string | null

  readonly detail: string

  readonly hint: string | null

  // KernelError.constructor (constructor)
  constructor(operation: string, detail: string, status?: string | null, hint?: string | null);

// A modeling operation cannot be done (for example a fillet radius that does not fit)
ModelingError: export declare class ModelingError extends Error

  // ModelingError.constructor (constructor)
  constructor(message: string);
