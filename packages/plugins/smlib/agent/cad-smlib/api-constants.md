# @classcad/smlibwasm — Constants

9 top-level symbols. Signatures are verbatim typescript.

version: "0.3.4"

// Geometric tolerance used for comparisons (model units)
TOLERANCE: 0.000001

X: Axis

Y: Axis

Z: Axis

// How a new shape sits relative to the origin along an axis
// Remarks: `MIN` puts the shape's lower bound at the origin, `CENTER` centers it, `MAX` puts its upper bound at the origin. Constructors take one value for all axes or one per axis: `Box(10, 10, 2, { align: [Align.CENTER, Align.CENTER, Align.MIN] })` stands the box on the XY plane.
Align: {
    readonly MIN: "min";
    readonly CENTER: "center";
    readonly MAX: "max";
}

  readonly MIN: "min"

  readonly CENTER: "center"

  readonly MAX: "max"

// Relative accuracy of areas, volumes, centers and inertia
ACCURACY: 1e-7

// The font `Text` uses unless told otherwise
DEFAULT_FONT: Uint8Array

// Named views
VIEWS: Readonly<Record<string, readonly [number, number, number]>>
