# build123d — operations_sketch

4 top-level symbols. Signatures are verbatim python.

# Category: operations_sketch
# Sketch Operation
# Remarks: Given an edge from a Face/Sketch, modify the face by replacing the given edge with the arc of the Voronoi largest empty circle that will fit within the Face. This "rounds off" the end of the object. Returns: Sketch: the modified shape
# Throws: ValueError: Invalid geometry
# build123d.operations_sketch.full_round (function)
full_round(edge: Edge, invert: bool = False, voronoi_point_count: int = 100, mode: Mode = Mode.REPLACE) -> tuple[Sketch, Vector, float]
#   edge: target Edge to remove
#   invert: make the arc concave instead of convex
#   voronoi_point_count: number of points along each edge used to create the voronoi vertices as potential locations for the center of the largest empty circle
#   mode: combination mode

# Category: operations_sketch
# Sketch Operation
# Remarks: Create a face from the given perimeter edges.
# build123d.operations_sketch.make_face (function)
make_face(edges: Edge | Wire | Curve | Iterable[Edge | Wire | Curve] | None = None, mode: Mode = Mode.ADD) -> Sketch
#   edges: perimeter edges that must combine into a single closed wire
#   mode: combination mode

# Category: operations_sketch
# Sketch Operation
# Remarks: Create a face from the convex hull of the given edges
# build123d.operations_sketch.make_hull (function)
make_hull(edges: Edge | Iterable[Edge] | None = None, mode: Mode = Mode.ADD) -> Sketch
#   edges: sequence of edges to hull
#   mode: combination mode

# Category: operations_sketch
# Sketch Operation
# Remarks: Convert edges, wires or pending edges into faces by sweeping a perpendicular line along them. Returns: Sketch: Traced lines
# Throws: ValueError: No objects to trace
# build123d.operations_sketch.trace (function)
trace(lines: Curve | Edge | Wire | Iterable[Curve | Edge | Wire] | None = None, line_width: float = 1, mode: Mode = Mode.ADD) -> Sketch
#   lines: lines to trace
#   line_width: Defaults to 1
#   mode: combination mode
