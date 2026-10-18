# smlibpy — sketches

13 top-level symbols. Signatures are verbatim python.

# Category: sketches
# A slot along an arc around the origin
# Remarks: counterclockwise over ``angle`` degrees from the X axis (turned by ``rotation``); it is ``width`` wide with round ends. The arc's center stays on the origin unless ``align`` is given.
# smlibpy.sketches.ArcSlot (function)
ArcSlot(radius: float, width: float, angle: float, *, rotation: float = 0.0, align: AlignLike = None) -> Sketch

# Category: sketches
# A disk of ``radius``
# smlibpy.sketches.Circle (function)
Circle(radius: float, *, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# An ellipse with semi-axes ``x_radius`` and ``y_radius``, turned by ``rotation``
# Remarks: degrees about its center.
# smlibpy.sketches.Ellipse (function)
Ellipse(x_radius: float, y_radius: float, *, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# The convex hull of points and shapes
# Remarks: string were pulled tight around them. Around circles and arcs the outline follows the arcs exactly, joined by tangent lines. ``items``: points (tuples, Vectors, Vertices), edges, wires, sketches or faces, or lists of them. ``Hull(Circle(10), Pos(60, 0) * Circle(6))`` is a lever outline.
# smlibpy.sketches.Hull (function)
Hull(*items: Any) -> Sketch

# Category: sketches
# The polygon through the points (closed automatically)
# Remarks: unless ``align`` is given. ``fillet`` rounds every corner with that radius, ``chamfer`` bevels every corner by that length.
# smlibpy.sketches.Polygon (function)
Polygon(*points: VectorLike, fillet: float = 0.0, chamfer: float = 0.0, align: AlignLike = None) -> Sketch

# Category: sketches
# A ``width`` (X) by ``height`` (Y) rectangle
# Remarks: ``fillet`` rounds the four corners with that radius, ``chamfer`` bevels them by that length (at most half the shorter side). ``rotation`` turns it about its center (degrees counterclockwise); ``align`` then works on the turned outline.
# smlibpy.sketches.Rectangle (function)
Rectangle(width: float, height: float, *, fillet: float = 0.0, chamfer: float = 0.0, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# A regular polygon with ``sides`` corners
# Remarks: ``radius`` is the distance to the corners, or to the middle of the sides when ``inscribed`` is true (handy for hexagons measured across flats: ``radius = flats / 2``). ``fillet`` and ``chamfer`` round or bevel every corner.
# smlibpy.sketches.RegularPolygon (function)
RegularPolygon(radius: float, sides: int, *, inscribed: bool = False, fillet: float = 0.0, chamfer: float = 0.0, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# A rectangle with rounded corners
# smlibpy.sketches.RoundedRectangle (function)
RoundedRectangle(width: float, height: float, radius: float, *, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# An obround slot ``length`` long overall (round ends included) and ``width`` wide, along
# Remarks: X. For a slot between two centers use ``Stroke(Line(a, b), width)``; for one along an arc, :func:`ArcSlot`.
# smlibpy.sketches.Slot (function)
Slot(length: float, width: float, *, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# The region a pen ``width`` wide covers along a path of lines and arcs
# Remarks: two centers (``Stroke(Line(a, b), 6)``), a slot along an arc, a rib from its centerline. ``ends``: ``"round"`` (half circles, the default) or ``"flat"`` (cut square at the end points). ``corners``: how the outside of a bend is shaped, ``"round"``, ``"sharp"`` or ``"chamfer"``. A closed path makes a ring. The path stays where it is (in its plane).
# smlibpy.sketches.Stroke (function)
Stroke(path: Edge | Wire, width: float, *, ends: str = 'round', corners: str = 'round') -> Sketch

# Category: sketches
# A trapezoid with a base of ``width``
# Remarks: corners (``right_angle`` defaults to ``left_angle``). ``fillet`` and ``chamfer`` round or bevel the four corners.
# smlibpy.sketches.Trapezoid (function)
Trapezoid(width: float, height: float, left_angle: float, right_angle: float | None = None, *, fillet: float = 0.0, chamfer: float = 0.0, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# A triangle with a base of ``width`` along X and its top corner ``height`` above it
# Remarks: ``apex`` is the x position of the top corner measured from the left end of the base: the middle by default (an isosceles triangle), ``0`` for a right angle at the left end, ``width`` for one at the right end. The triangle is centered on its bounding box; ``fillet`` and ``chamfer`` round or bevel the three corners.
# smlibpy.sketches.Triangle (function)
Triangle(width: float, height: float, *, apex: float | None = None, fillet: float = 0.0, chamfer: float = 0.0, rotation: float = 0.0, align: AlignLike = Align.CENTER) -> Sketch

# Category: sketches
# The planar region inside a closed wire, minus the regions inside ``holes``
# smlibpy.sketches.make_face (function)
make_face(outer: Wire | Edge, *holes: Wire | Edge) -> Sketch
