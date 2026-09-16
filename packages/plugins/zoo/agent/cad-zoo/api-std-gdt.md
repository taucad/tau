# kcl-std — std.gdt

3 top-level symbols. Signatures are verbatim kcl.

// GD&T datum feature
// EXPERIMENTAL
gdt::datum(
  face: TaggedFace,
  name: string,
  framePosition?: Point2d,
  framePlane?: Plane,
  fontPointSize?: number(_),
  fontScale?: number(_),
): GdtAnnotation
//   face: The face to be annotated
//   name: The name of the datum
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   fontPointSize: The font point size to use for the annotation text rendering
//   fontScale: Scale to use for the annotation text after rendering with the point size

// GD&T annotation specifying how flat faces should be
// EXPERIMENTAL
gdt::flatness(
  faces: [TaggedFace; 1+],
  tolerance: number(Length),
  precision?: number(_),
  framePosition?: Point2d,
  framePlane?: Plane,
  fontPointSize?: number(_),
  fontScale?: number(_),
): [GdtAnnotation; 1+]
//   faces: The faces to be annotated
//   tolerance: The amount of deviation from a perfect plane that is acceptable
//   precision: The number of decimal places to display
//   framePosition: The position of the feature control frame relative to the leader arrow
//   framePlane: The plane in which to display the feature control frame
//   fontPointSize: The font point size to use for the annotation text rendering
//   fontScale: Scale to use for the annotation text after rendering with the point size

// Functions for working with geometric dimensioning and tolerancing (GD&T)
gdt
