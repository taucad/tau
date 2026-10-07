# build123d — utils

3 top-level symbols. Signatures are verbatim python.

# Category: utils
# Compare the OCCT objects of each list and return the differences
# build123d.topology.utils.delta (function)
delta(shapes_one: Iterable[Shape], shapes_two: Iterable[Shape]) -> list[Shape]

# Category: utils
# new_edges
# Remarks: Given a sequence of shapes and the combination of those shapes, find the newly added edges Returns: ShapeList[Edge]: new edges
# build123d.topology.utils.new_edges (function)
new_edges(*objects: Shape, combined: Shape) -> ShapeList[Edge]
#   objects: sequence of shapes
#   combined: result of the combination of objects

# Category: utils
# Convert polar coordinates into cartesian coordinates
# build123d.topology.utils.polar (function)
polar(length: float, angle: float) -> tuple[float, float]
