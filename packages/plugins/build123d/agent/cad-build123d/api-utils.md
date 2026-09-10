# build123d — utils

6 top-level symbols. Signatures are verbatim python.

// Compare the OCCT objects of each list and return the differences
delta(shapes_one: Iterable[Shape], shapes_two: Iterable[Shape]) -> list[Shape]

// Return the maximum dimension of one or more shapes
find_max_dimension(shapes: Shape | Iterable[Shape]) -> float

// Determine whether two floating point numbers are close in value
isclose_b(x: float, y: float, rel_tol = 1e-09, abs_tol = 1e-14) -> bool

// new_edges
new_edges(\*objects: Shape, combined: Shape) -> ShapeList[Edge]
// objects: sequence of shapes
// combined: result of the combination of objects

// Convert polar coordinates into cartesian coordinates
polar(length: float, angle: float) -> tuple[float, float]

// Create a size tuple
tuplify(obj: Any, dim: int) -> tuple | None
