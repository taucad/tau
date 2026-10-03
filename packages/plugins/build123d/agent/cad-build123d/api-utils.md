# build123d — utils

6 top-level symbols. Signatures are verbatim python.

// Category: utils
// Compare the OCCT objects of each list and return the differences
// build123d.topology.utils.delta (function)
delta(shapes_one: Iterable[Shape], shapes_two: Iterable[Shape]) -> list[Shape]

// Category: utils
// Return the maximum dimension of one or more shapes
// build123d.topology.utils.find_max_dimension (function)
find_max_dimension(shapes: Shape | Iterable[Shape]) -> float

// Category: utils
// Determine whether two floating point numbers are close in value
// Remarks: Overridden abs_tol default for the math.isclose function.
// build123d.topology.utils.isclose_b (function)
isclose_b(x: float, y: float, rel_tol = 1e-09, abs_tol = 1e-14) -> bool

// Category: utils
// new_edges
// Remarks: Given a sequence of shapes and the combination of those shapes, find the newly added edges Returns: ShapeList[Edge]: new edges
// build123d.topology.utils.new_edges (function)
new_edges(*objects: Shape, combined: Shape) -> ShapeList[Edge]
//   objects: sequence of shapes
//   combined: result of the combination of objects

// Category: utils
// Convert polar coordinates into cartesian coordinates
// build123d.topology.utils.polar (function)
polar(length: float, angle: float) -> tuple[float, float]

// Category: utils
// Create a size tuple
// build123d.topology.utils.tuplify (function)
tuplify(obj: Any, dim: int) -> tuple | None
