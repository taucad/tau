# @classcad/smlibwasm — Classes (6)

12 top-level symbols. Signatures are verbatim typescript.

// Everything `readStep` reads from a STEP file
StepModel: export declare class StepModel

  readonly bodies: ShapeList<Part | Shell>

  readonly frames: StepFrame[]

  readonly curves: StepCurve[]

  readonly points: StepPoint[]

  readonly skipped: string[]

  // StepModel.constructor (constructor)
  constructor(bodies: ShapeList<Part | Shell>, frames?: StepFrame[], curves?: StepCurve[], points?: StepPoint[], skipped?: string[]);

  // The coordinate system called `name` as a `Plane`
  // StepModel.frame (method)
  frame(name: string, product?: string | null): Plane;

  // StepModel.equals (method)
  equals(other: unknown): boolean;

  // StepModel.toString (method)
  toString(): string;

  // StepModel.[inspect] (method)
  [inspect](): string;

// A curve of a STEP file that belongs to no body (wireframe geometry, contours), at its place in the assembly
StepCurve: export declare class StepCurve

  readonly name: string

  readonly shape: Edge | Wire

  readonly product: string

  // [r, g, b] from 0 to 1, or null
  readonly color: readonly number[] | null

  // StepCurve.constructor (constructor)
  constructor(name: string, shape: Edge | Wire, product?: string, color?: readonly number[] | null);

  // StepCurve.equals (method)
  equals(other: unknown): boolean;

  // StepCurve.toString (method)
  toString(): string;

  // StepCurve.[inspect] (method)
  [inspect](): string;

// A coordinate system of a STEP file (a named `AXIS2_PLACEMENT_3D`) at its place in the assembly
StepFrame: export declare class StepFrame

  readonly name: string

  readonly plane: Plane

  readonly product: string

  // [r, g, b] from 0 to 1, or null
  readonly color: readonly number[] | null

  // StepFrame.constructor (constructor)
  constructor(name: string, plane: Plane, product?: string, color?: readonly number[] | null);

  // The placement that moves the world origin onto this coordinate system
  readonly location: Location

  // StepFrame.equals (method)
  equals(other: unknown): boolean;

  // StepFrame.toString (method)
  toString(): string;

  // StepFrame.[inspect] (method)
  [inspect](): string;

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

// One view of a drawing (see `drawingViews`)
DrawingView: export declare class DrawingView

  readonly name: string

  readonly direction: Vector

  readonly visible: ShapeList<Edge>

  readonly hidden: ShapeList<Edge>

  // DrawingView.constructor (constructor)
  constructor(name: string, direction: Vector, visible: ShapeList<Edge>, hidden: ShapeList<Edge>);

  // The box around the view's lines
  // DrawingView.bbox (method)
  bbox(): BoundBox;

  // DrawingView.toString (method)
  toString(): string;

  // DrawingView.[inspect] (method)
  [inspect](): string;

// The result of `diffImages`
// Remarks: - `changed`: number of pixels that differ. - `total`: number of pixels. - `fraction`: `changed / total`. - `bbox`: `[x0, y0, x1, y1]` of the changed pixels (inclusive), or `null`. - `picture`: a `Picture` of the difference: changed pixels red on a faded gray of the second picture.
ImageDiff: export declare class ImageDiff

  readonly changed: number

  readonly total: number

  readonly fraction: number

  readonly bbox: [
          number,
          number,
          number,
          number
      ] | null

  readonly picture: Picture

  // ImageDiff.constructor (constructor)
  constructor(changed: number, total: number, fraction: number, bbox: [
          number,
          number,
          number,
          number
      ] | null, picture: Picture);

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
// Remarks: `operation` names the smlibwasm call, `status` the kernel status code (e.g. `SM_ERR_INVALID_INPUT`) and `hint` a suggestion when one is known. `trace` says where the kernel gave up: the failures it reported during the call, oldest first, at most the last 48, as `"SM_ERR at SmFilletExecutive.cpp:1603 (DoFillet)"`. It ends with the chain from the deepest function that failed to the kernel's API function; what comes before are errors the kernel recovered from. Empty where the error did not come from a kernel function (or the kernel crashed). For bug reports: the sites change with the kernel.
KernelError: export declare class KernelError extends ModelingError

  readonly operation: string

  readonly status: string | null

  readonly detail: string

  readonly hint: string | null

  // Where the kernel gave up (see the class)
  readonly trace: readonly string[]

  // KernelError.constructor (constructor)
  constructor(operation: string, detail: string, status?: string | null, hint?: string | null);

// A modeling operation cannot be done (for example a fillet radius that does not fit)
ModelingError: export declare class ModelingError extends Error

  // ModelingError.constructor (constructor)
  constructor(message: string);

// Kerning of two neighbouring glyphs in font units
PairAdjustment: export declare class PairAdjustment

  readonly advance1: number

  readonly placement1: number

  readonly advance2: number

  readonly placement2: number

  // PairAdjustment.constructor (constructor)
  constructor(advance1?: number, placement1?: number, advance2?: number, placement2?: number);

  // PairAdjustment.toString (method)
  toString(): string;

// The draft of every face of a part for one pull direction
// Remarks: The faces fall into four groups, each a ShapeList of faces of the part (usable as a selection, for example for highlighting): - `positive`: at least `minAngle` of draft everywhere; the face releases. - `insufficient`: no negative draft, but less than `minAngle` somewhere. - `vertical`: parallel to the pull direction everywhere (0 degrees). - `undercut`: turns away from the pull direction somewhere (negative draft). `faces` holds one `FaceDraft` per face with its least and greatest angle.
DraftAnalysis: export declare class DraftAnalysis

  readonly direction: Vector

  readonly minAngle: number

  readonly faces: readonly FaceDraft[]

  // DraftAnalysis.constructor (constructor)
  constructor(direction: Vector, minAngle: number, faces: readonly FaceDraft[]);

  // Faces with at least `minAngle` of draft everywhere
  readonly positive: ShapeList<Face>

  // Faces with less than `minAngle` of draft somewhere, but nowhere negative
  readonly insufficient: ShapeList<Face>

  // Faces parallel to the pull direction (no draft)
  readonly vertical: ShapeList<Face>

  // Faces that turn away from the pull direction somewhere (negative draft)
  readonly undercut: ShapeList<Face>

  // True if every face has at least `minAngle` of draft
  readonly ok: boolean

  // The least and the greatest draft angle of a face of the part (degrees)
  // DraftAnalysis.angles (method)
  angles(face: Face): [
          number,
          number
      ];

  // DraftAnalysis.[Symbol.iterator] (method)
  [Symbol.iterator](): IterableIterator<FaceDraft>;

  // The number of faces (Python's `len`)
  readonly length: number

  // DraftAnalysis.toString (method)
  toString(): string;

  // DraftAnalysis.[inspect] (method)
  [inspect](): string;

// The draft of one face
FaceDraft: export declare class FaceDraft

  readonly face: Face

  readonly minAngle: number

  readonly maxAngle: number

  readonly kind: string

  // FaceDraft.constructor (constructor)
  constructor(face: Face, minAngle: number, maxAngle: number, kind: string);

  // FaceDraft.equals (method)
  equals(other: unknown): boolean;

  // FaceDraft.toString (method)
  toString(): string;

  // FaceDraft.[inspect] (method)
  [inspect](): string;
