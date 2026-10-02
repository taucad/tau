# kcl-std — std.vector

9 top-level symbols. Signatures are verbatim kcl.

// Category: std.vector
// Adds every element of u to its corresponding element in v
vector::add(
  @u: [number],
  v: [number],
): [number]

// Category: std.vector
// Subtracts from every element of u its corresponding element in v
vector::sub(
  @u: [number],
  v: [number],
): [number]

// Category: std.vector
// Multiplies every element of u by its corresponding element in v
vector::mul(
  @u: [number],
  v: [number],
): [number]

// Category: std.vector
// Divides every element of u by its corresponding element in v
vector::div(
  @u: [number],
  v: [number],
): [number]

// Category: std.vector
// Find the cross product of two 3D points or vectors
vector::cross(
  @u: Point3d,
  v: Point3d,
)
//   @u: A point in three dimensional space
//   v: A point in three dimensional space

// Category: std.vector
// Find the dot product of two points or vectors of any dimension
vector::dot(
  @u: [number],
  v: [number],
): number

// Category: std.vector
// Find the Euclidean distance of a vector
vector::magnitude(@v: [number]): number

// Category: std.vector
// Normalize a vector (with any number of dimensions)
vector::normalize(@v: [number]): [number]

// Category: std.vector
vector
