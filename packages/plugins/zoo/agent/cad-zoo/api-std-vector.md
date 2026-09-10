# kcl-std — std.vector

9 top-level symbols. Signatures are verbatim kcl.

// Adds every element of u to its corresponding element in v
vector::add(
@u: [number],
v: [number],
): [number]

// Subtracts from every element of u its corresponding element in v
vector::sub(
@u: [number],
v: [number],
): [number]

// Multiplies every element of u by its corresponding element in v
vector::mul(
@u: [number],
v: [number],
): [number]

// Divides every element of u by its corresponding element in v
vector::div(
@u: [number],
v: [number],
): [number]

// Find the cross product of two 3D points or vectors
vector::cross(
@u: Point3d,
v: Point3d,
)
// @u: A point in three dimensional space
// v: A point in three dimensional space

// Find the dot product of two points or vectors of any dimension
vector::dot(
@u: [number],
v: [number],
): number

// Find the Euclidean distance of a vector
vector::magnitude(@v: [number]): number

// Normalize a vector (with any number of dimensions)
vector::normalize(@v: [number]): [number]

vector
