# build123d — operations_sketch

4 top-level symbols. Signatures are verbatim python.

// Sketch Operation
full_round(edge: Edge, invert: bool = False, voronoi_point_count: int = 100, mode: Mode = Mode.REPLACE) -> tuple[Sketch, Vector, float]
// edge: target Edge to remove
// invert: make the arc concave instead of convex
// voronoi_point_count: number of points along each edge used to create the voronoi vertices as potential locations for the center of the largest empty circle
// mode: combination mode

// Sketch Operation
make_face(edges: Edge | Wire | Curve | Iterable[Edge | Wire | Curve] | None = None, mode: Mode = Mode.ADD) -> Sketch
// edges: perimeter edges that must combine into a single closed wire
// mode: combination mode

// Sketch Operation
make_hull(edges: Edge | Iterable[Edge] | None = None, mode: Mode = Mode.ADD) -> Sketch
// edges: sequence of edges to hull
// mode: combination mode

// Sketch Operation
trace(lines: Curve | Edge | Wire | Iterable[Curve | Edge | Wire] | None = None, line_width: float = 1, mode: Mode = Mode.ADD) -> Sketch
// lines: lines to trace
// line_width: Defaults to 1
// mode: combination mode
