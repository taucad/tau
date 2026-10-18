# @classcad/smlibwasm — Types

2 top-level symbols. Signatures are verbatim typescript.

// A point or direction
VectorLike: Vector | ArrayLike<number>

// One alignment for all axes, or one per axis (null leaves an axis alone)
AlignLike: Align | string | null | readonly (Align | string | null)[]
