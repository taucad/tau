# kcl-std — std.vector

9 top-level symbols. Signatures are verbatim kcl.

// Category: std.vector
// Adds every element of u to its corresponding element in v
// std.vector.vector::add (function)
vector::add(
  @u: [number],
  v: [number],
): [number]
// Example:
//   u = [1, 2, 3]
//   v = [10, 10, 10]
//   v2 = vector::add(u, v)
//   assert(v2[0], isEqualTo = 11)
//   assert(v2[1], isEqualTo = 12)
//   assert(v2[2], isEqualTo = 13)

// Category: std.vector
// Subtracts from every element of u its corresponding element in v
// std.vector.vector::sub (function)
vector::sub(
  @u: [number],
  v: [number],
): [number]
// Example:
//   u = [10, 10, 10]
//   v = [1, 2, 3]
//   v2 = vector::sub(u, v)
//   assert(v2[0], isEqualTo = 9)
//   assert(v2[1], isEqualTo = 8)
//   assert(v2[2], isEqualTo = 7)

// Category: std.vector
// Multiplies every element of u by its corresponding element in v
// std.vector.vector::mul (function)
vector::mul(
  @u: [number],
  v: [number],
): [number]
// Example:
//   u = [10, 10, 10]
//   v = [1, 2, 3]
//   v2 = vector::mul(u, v)
//   assert(v2[0], isEqualTo = 10)
//   assert(v2[1], isEqualTo = 20)
//   assert(v2[2], isEqualTo = 30)

// Category: std.vector
// Divides every element of u by its corresponding element in v
// std.vector.vector::div (function)
vector::div(
  @u: [number],
  v: [number],
): [number]
// Example:
//   u = [10, 10, 10]
//   v = [1, 2, 3]
//   v2 = vector::div(u, v)
//   assert(v2[0], isEqualTo = 10)
//   assert(v2[1], isEqualTo = 5)
//   assert(v2[2], isEqualTo = 3.333, tolerance = 0.01)

// Category: std.vector
// Find the cross product of two 3D points or vectors
// std.vector.vector::cross (function)
vector::cross(
  @u: Point3d,
  v: Point3d,
)
//   @u: A point in three dimensional space
//   v: A point in three dimensional space
// Example:
//   vx = [1, 0, 0]
//   vy = [0, 1, 0]
//   vz = vector::cross(vx, v = vy)
//   assert(vz[0], isEqualTo = 0)
//   assert(vz[1], isEqualTo = 0)
//   assert(vz[2], isEqualTo = 1)

// Category: std.vector
// Find the dot product of two points or vectors of any dimension
// std.vector.vector::dot (function)
vector::dot(
  @u: [number],
  v: [number],
): number
// Example:
//   u = [1, 2, 3]
//   v = [4, -5, 6]
//   dotprod = vector::dot(u, v)
//   assert(dotprod, isEqualTo = 12)

// Category: std.vector
// Find the Euclidean distance of a vector
// std.vector.vector::magnitude (function)
vector::magnitude(@v: [number]): number
// Example:
//   v = [3, 4]
//   m = vector::magnitude(v)
//   assert(m, isEqualTo = 5)

// Category: std.vector
// Normalize a vector (with any number of dimensions)
// std.vector.vector::normalize (function)
vector::normalize(@v: [number]): [number]
// Example:
//   v = [3, 4]
//   normed = vector::normalize(v)
//   assert(normed[0], isEqualTo = 0.6)
//   assert(normed[1], isEqualTo = 0.8)

// Category: std.vector
vector
