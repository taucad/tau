# smlibpy — operations

39 top-level symbols. Signatures are verbatim python.

# Category: operations
# Bevel edges of the part they belong to (see :meth:`Part.chamfer`), or corners of the
# Remarks: sketch they belong to (see :meth:`Sketch.chamfer`).
# smlibpy.operations.chamfer (function)
chamfer(edges: Vertex | Sequence[Vertex], length: float) -> Sketch
chamfer(edges: Any, length: float, **kwargs: Any) -> Part

# Category: operations
# A body less others, ``a - b`` (see :meth:`Part.cut`, :meth:`Shell.cut`, :meth:`Sketch.cut`)
# smlibpy.operations.cut (function)
cut(shape: Sketch, *others: Sketch | Sequence[Sketch]) -> Sketch
cut(shape: Shell, *others: Part | Sequence[Part]) -> Shell
cut(shape: Part, *others: Part | Sequence[Part]) -> Part

# Category: operations
# Tilt faces by a draft angle about a neutral plane (see :meth:`Part.draft`)
# smlibpy.operations.draft (function)
draft(part: Part, faces: Any, angle: float, neutral_plane: Plane | Face) -> Part

# Category: operations
# Extend a sheet or a face past its edges (``sides``, ``continuity``
# Remarks: :meth:`Face.extend`), or an edge past an end (``end``, ``continuity``: see :meth:`Edge.extend`).
# smlibpy.operations.extend (function)
extend(shape: Edge, distance: float, *, end: Literal['start', 'end', 'both'] = ..., continuity: Literal['G1', 'G2', 'natural'] = ...) -> Edge
extend(shape: Shell | Face, distance: float, *, sides: Edge | Sequence[Edge] | None = ..., continuity: Literal['natural', 'G1', 'G2'] = ...) -> Shell

# Category: operations
# Extrude a sketch, a planar face or a closed wire into a solid (see :meth:`Sketch.extrude`)
# Remarks: An open curve extrudes into a surface (a :class:`Shell`), along ``direction`` (an axis or a vector) or the normal of the curve's plane; it takes no ``taper`` (``ValueError``).
# smlibpy.operations.extrude (function)
extrude(profile: Sketch | Face, amount: float, *, both: bool = ..., taper: float = ..., direction: Axis | VectorLike | None = ..., corners: Literal['sharp', 'round'] = ...) -> Part
extrude(profile: Sketch | Face | Wire | Edge, amount: float, *, both: bool = ..., taper: float = ..., direction: Axis | VectorLike | None = ..., corners: Literal['sharp', 'round'] = ...) -> Part | Shell

# Category: operations
# Round edges of the part they belong to (see :meth:`Part.fillet`), or corners of the
# Remarks: sketch they belong to: ``fillet(s.vertices().concave(), 2)`` (see :meth:`Sketch.fillet`).
# smlibpy.operations.fillet (function)
fillet(edges: Vertex | Sequence[Vertex], radius: float) -> Sketch
fillet(edges: Any, radius: float | tuple[float, float] | Sequence[float] | dict[float, float], **kwargs: Any) -> Part

# Category: operations
# The surfaces of a fillet's rounds as untrimmed sheets, the part unchanged (see
# Remarks: :meth:`Part.fillet_preview`); takes the edges, as :func:`fillet` does.
# smlibpy.operations.fillet_preview (function)
fillet_preview(edges: Any, radius: float, *, propagate: bool = True) -> ShapeList[Shell]

# Category: operations
# Press a region of a face onto a plane (see :meth:`Part.flatten`, :meth:`Shell.flatten`)
# smlibpy.operations.flatten (function)
flatten(shape: Part, face: Face, region: Any, plane: Plane | Face, *, continuity: Literal['crease', 'G1', 'G2'] = ...) -> Part
flatten(shape: Shell, face: Face, region: Any, plane: Plane | Face, *, continuity: Literal['crease', 'G1', 'G2'] = ...) -> Shell

# Category: operations
# Union of bodies, ``a + b`` (see :meth:`Part.fuse`, :meth:`Shell.fuse`, :meth:`Sketch.fuse`)
# smlibpy.operations.fuse (function)
fuse(shape: Sketch, *others: Sketch | Sequence[Sketch]) -> Sketch
fuse(shape: Shell, *others: Shell | Part | Face | Sequence[Shell | Part | Face]) -> Shell
fuse(shape: Part, *others: Part | Sequence[Part]) -> Part

# Category: operations
# The part's faces split where a tool crosses them (see :meth:`Part.imprint`)
# smlibpy.operations.imprint (function)
imprint(part: Part, tool: Part | Shell | Face | Sketch | Edge | Wire | Sequence[Edge | Wire], direction: Axis | VectorLike | None = None, *, nearest: bool = True) -> Part

# Category: operations
# What bodies share, ``a & b`` (see :meth:`Part.intersect`, :meth:`Shell.intersect`,
# Remarks: :meth:`Sketch.intersect`).
# smlibpy.operations.intersect (function)
intersect(shape: Sketch, *others: Sketch | Sequence[Sketch]) -> Sketch
intersect(shape: Shell, *others: Part | Sequence[Part]) -> Shell
intersect(shape: Part, *others: Any) -> Part | Shell

# Category: operations
# The curves where a body meets another, a face or a plane (see :meth:`Part.intersection_curves`)
# smlibpy.operations.intersection_curves (function)
intersection_curves(shape: Part | Shell, other: Part | Shell | Face | Plane) -> ShapeList[Edge]

# Category: operations
# A solid through a sequence of cross sections, or a surface through open curves
# Remarks: ``start_tangent`` and ``end_tangent`` set the direction the loft leaves its first section in and reaches its last in, so that it meets the bodies there smoothly; a face there (one that ends at the section) makes the loft continue it:: neck = loft([Circle(10), Circle(4).moved(Location((0, 0, 30)))], start_tangent=Z, end_tangent=Z) cap = loft([top_rim, Circle(4).moved(Location((0, 0, 30)))], start_tangent=can.faces().cylinders()[0]) ``rails`` are curves a loft of open sections runs along from its first section to its last, through every section (guide curves): the surface passes through them as through the sections:: panel = loft([s0, s1, s2], rails=[keel, chine])
# smlibpy.operations.loft (function)
loft(sections: Sequence[Sketch | Face], *, ruled: bool = ..., smooth: bool = ..., start_tangent: Axis | VectorLike | Face | None = ..., end_tangent: Axis | VectorLike | Face | None = ..., closed: bool = ..., rails: Edge | Wire | Sequence[Edge | Wire] | None = ...) -> Part
loft(sections: Sequence[Sketch | Face | Wire | Edge], *, ruled: bool = ..., smooth: bool = ..., start_tangent: Axis | VectorLike | Face | None = ..., end_tangent: Axis | VectorLike | Face | None = ..., closed: bool = ..., rails: Edge | Wire | Sequence[Edge | Wire] | None = ...) -> Part | Shell
#   sections: Two or more sections in order
#   ruled: Straight transitions between neighbouring sections
#   smooth: With four or more sections, pass through them with a cubic surface (``False``
#   start_tangent: The direction (an axis or a vector) the loft leaves the first section in
#   end_tangent: The direction the loft reaches the last section in, or a face that ends at the last section, which the loft runs into tangentially
#   closed: Run on from the last section through the first again, smoothly (three sections or more)
#   rails: A curve (an edge or a wire) or a list of them that run from the first section to the last and cross every section once, for open sections (a surface)

# Category: operations
# An edge of a sheet moved onto a curve (see :meth:`Shell.match_edge`)
# smlibpy.operations.match_edge (function)
match_edge(sheet: Shell, edge: Edge, target: Edge | Wire, *, extent: float = 0.25) -> Shell

# Category: operations
# Parts as one part made of cells
# Remarks: their faces (see :meth:`Part.merge`; ``cells()`` gives them as parts).
# smlibpy.operations.merge (function)
merge(*parts: Part | Sequence[Part]) -> Part

# Category: operations
# Two faces of a sheet that share a side made one (see :meth:`Shell.merge_faces`)
# smlibpy.operations.merge_faces (function)
merge_faces(sheet: Shell, a: Face, b: Face) -> Shell

# Category: operations
# A mirrored copy of a shape (see :meth:`Shape.mirror`
# Remarks: plane, :meth:`Sketch.mirror`).
# smlibpy.operations.mirror (function)
mirror(shape: _S, plane: Plane | Face | Axis = Plane.XZ) -> _S

# Category: operations
# Move faces by a vector or a location, the part rebuilt around them (see :meth:`Part.move_faces`)
# smlibpy.operations.move_faces (function)
move_faces(part: Part, faces: Any, by: Location | VectorLike) -> Part

# Category: operations
# Grow or shrink a part or a sketch by ``distance`` (also ``corners``
# Remarks: ``"sharp" | "round"``, see :meth:`Part.offset`; for a sketch ``"round" | "sharp" | "chamfer"``, see :meth:`Sketch.offset`), move a sheet or a face along its normals (:meth:`Shell.offset`, :meth:`Face.offset`: a sheet), or move a wire or an edge sideways (:meth:`Wire.offset`, :meth:`Edge.offset`).
# smlibpy.operations.offset (function)
offset(shape: Sketch, distance: float, **kwargs: Any) -> Sketch
offset(shape: Part, distance: float, **kwargs: Any) -> Part
offset(shape: Shell | Face, distance: float, **kwargs: Any) -> Shell
offset(shape: Wire, distance: float, **kwargs: Any) -> Wire
offset(shape: Edge, distance: float, **kwargs: Any) -> Edge

# Category: operations
# Offset faces along their normals, the part rebuilt around them (see :meth:`Part.offset_faces`)
# smlibpy.operations.offset_faces (function)
offset_faces(part: Part, faces: Any, distance: float) -> Part

# Category: operations
# The lines of a view of a body, also its hidden ones (see :meth:`Part.outline`)
# smlibpy.operations.outline (function)
outline(shape: Part | Shell, plane: Plane = Plane.XY, *, hidden: bool = False, tangent_edges: bool = False) -> ShapeList[Edge] | tuple[ShapeList[Edge], ShapeList[Edge]]

# Category: operations
# The parting lines of a part for a pull direction (see :meth:`Part.parting_line`)
# smlibpy.operations.parting_line (function)
parting_line(part: Part, direction: Axis | VectorLike) -> ShapeList[Wire]

# Category: operations
# A curve projected onto a body along a direction (see :meth:`Part.project`), or onto a face
# Remarks: along its normals (see :meth:`Face.project`).
# smlibpy.operations.project (function)
project(shape: Face, curve: Edge | Wire) -> ShapeList[Edge]
project(shape: Part | Shell, curve: Edge | Wire, direction: Axis | VectorLike = ..., *, nearest: bool = ...) -> ShapeList[Edge]

# Category: operations
# A smooth dent or bump in a face at a point (see :meth:`Part.push`, :meth:`Shell.push`)
# smlibpy.operations.push (function)
push(shape: Part, face: Face, at: VectorLike, *, by: float | VectorLike | None = ..., to: VectorLike | None = ..., normal: VectorLike | None = ..., radius: float | None = ..., continuity: Literal['G0', 'G1', 'G2'] = ...) -> Part
push(shape: Shell, face: Face, at: VectorLike, *, by: float | VectorLike | None = ..., to: VectorLike | None = ..., normal: VectorLike | None = ..., radius: float | None = ..., continuity: Literal['G0', 'G1', 'G2'] = ...) -> Shell

# Category: operations
# The part with a hole, a boss or a pocket taken out (see :meth:`Part.remove_faces`)
# smlibpy.operations.remove_faces (function)
remove_faces(part: Part, faces: Any, *, partial: bool = False) -> Part

# Category: operations
# The part with fillets taken out and their edges sharp again (see :meth:`Part.remove_fillets`)
# smlibpy.operations.remove_fillets (function)
remove_fillets(part: Part, faces: Any = None, *, max_radius: float | None = None, partial: bool = False) -> Part

# Category: operations
# Revolve a sketch about an axis into a solid (see :meth:`Sketch.revolve`)
# Remarks: An open curve revolves into a surface of revolution (a :class:`Shell`).
# smlibpy.operations.revolve (function)
revolve(profile: Sketch | Face, axis: Axis | None = ..., angle: float = ...) -> Part
revolve(profile: Sketch | Face | Wire | Edge, axis: Axis | None = ..., angle: float = ...) -> Part | Shell

# Category: operations
# A scaled copy of a shape or a mesh, about ``center`` (see :meth:`Shape.scale`)
# smlibpy.operations.scale (function)
scale(shape: Mesh, factor: float | VectorLike, center: VectorLike = ...) -> Mesh
scale(shape: _S, factor: float | VectorLike, center: VectorLike = ...) -> _S

# Category: operations
# Cross-section of a part (see :meth:`Part.section`
# smlibpy.operations.section (function)
section(part: Part, plane: Plane | Face = Plane.XY) -> Sketch

# Category: operations
# Hollow out a part (see :meth:`Part.shell`)
# smlibpy.operations.shell (function)
shell(part: Part, thickness: float, openings: Any = None, *, outward: bool = False, corners: Literal['round', 'sharp'] | None = None, walls: Any = None) -> Part

# Category: operations
# The contour of a body seen along a direction (see :meth:`Part.silhouette`)
# smlibpy.operations.silhouette (function)
silhouette(shape: Part | Shell, direction: Axis | VectorLike = (0, 0, 1)) -> ShapeList[Edge]

# Category: operations
# Sections of a part (sketches) or a mesh (wires) every ``step`` along an axis (see
# Remarks: :meth:`Part.slices`, :meth:`smlibpy.Mesh.slices`).
# smlibpy.operations.slices (function)
slices(shape: Any, step: float, axis: Axis | VectorLike = Axis.Z) -> Any

# Category: operations
# Cut a part with a plane or along a sheet (see :meth:`Part.split`)
# Remarks: parameters or points with their own :meth:`Edge.split`.
# smlibpy.operations.split (function)
split(part: Part, plane: Plane | Face | Shell, keep: Literal['both']) -> tuple[Part, Part]
split(part: Part, plane: Plane | Face | Shell, keep: Literal['above', 'below'] = ...) -> Part

# Category: operations
# Sweep a profile along a path
# Remarks: The profile is moved so that the center of its box (along the axes of its plane) sits at the start of the path and (with ``orient``) turned to face along the path, so profiles can be drawn anywhere, usually in the XY plane:: tube = sweep(Circle(2), Spline((0, 0, 0), (0, 10, 20), (30, 10, 40))) rail = sweep(Rectangle(4, 2), Helix(pitch=10, height=40, radius=20)) ``anchor`` puts another point of the profile on the path: ``"origin"`` (the origin of the sketch's plane) or a point of the profile's plane:: lip = sweep(Rectangle(4, 2, align=(Align.MIN, Align.MIN)), rim, anchor=(0, 0)) # its corner Edges of a path that meet tangentially are swept as one; at a corner of a path that is not planar, the profile goes on turned by the smallest rotation from one tangent to the next. Where the kernel cannot sweep an open path of several edges so, each edge is swept on its own, turned to its own start, and the pieces are fused (with a ``RuntimeWarning`` unless the profile is round: it turns where the edges meet). A closed path it cannot sweep so (the fuse where the halves of a loop closed with a kink cross) is swept in pieces, each turned from the path's start to its own, where that puts the profile on the path. Faces without area that a fuse leaves are taken out (or the sweep raises ``ModelingError``). The corners of a planar path of several edges are mitered, the profile placed as on any other path; where they cannot be (arcs that meet at a corner), the path is swept piece by piece, with a ``RuntimeWarning``. Along the path the profile turns as little as it can (a rotation-minimizing frame: on a planar path it keeps its attitude to the plane), except along a helix (also a conical one), where it keeps its attitude to the helix's axis, as a thread or a flat spring wire does. ``up`` and ``twist`` set the attitude instead:: rail = sweep(Rectangle(4, 2), path, up=Z) # stays upright: its angle to Z kept bar = sweep(Rectangle(10, 2), Line((0, 0, 0), (0, 0, 100)), twist=180) # a half turn ``scale`` grows or shrinks the profile along the path, about the point that sits on it:: horn = sweep(Circle(2), Spline((0, 0, 0), (0, 10, 20), (30, 10, 40)), scale=(1, 3)) spring = sweep(Circle(1), Helix(pitch=8, height=40, radius=15), scale=[(0, 1), (0.5, 1.5), (1, 1)]) A single line or arc is swept as an extrusion or a revolve (planes, cylinders, cones, spheres and tori, not B-spline surfaces); a profile that reaches across the axis of an arc raises ``ModelingError`` (it would sweep through itself).
# smlibpy.operations.sweep (function)
sweep(profile: Sketch | Face, path: Edge | Wire, *, orient: bool = ..., translational: bool = ..., sharp_corners: bool | None = ..., up: Axis | VectorLike | str | None = ..., twist: float | Callable[[float], float] = ..., scale: tuple[float, float] | Sequence[tuple[float, float]] | Callable[[float], float] | None = ..., anchor: Literal['center', 'origin'] | VectorLike | Vertex = ..., rails: Edge | Wire | None = ...) -> Part
sweep(profile: Sketch | Face | Wire | Edge, path: Edge | Wire, *, orient: bool = ..., translational: bool = ..., sharp_corners: bool | None = ..., up: Axis | VectorLike | str | None = ..., twist: float | Callable[[float], float] = ..., scale: tuple[float, float] | Sequence[tuple[float, float]] | Callable[[float], float] | None = ..., anchor: Literal['center', 'origin'] | VectorLike | Vertex = ..., rails: Edge | Wire | None = ...) -> Part | Shell
#   profile: A sketch (holes allowed), a planar face or a closed wire
#   path: An edge, or a wire of connected edges
#   orient: Turn the profile to be perpendicular to the path at its start
#   translational: Keep the profile's orientation fixed instead of turning it with the path
#   sharp_corners: For paths of several edges
#   up: An axis or a direction the profile keeps its attitude to
#   twist: Degrees the profile turns about the path on top of that, spread evenly along its length
#   scale: The profile's scale along the path, about the point of it that sits on the path
#   anchor: The point of the profile that goes on the path (and that ``scale`` scales about)
#   rails: A second rail (an edge or a wire

# Category: operations
# Swing a profile around an outline
# smlibpy.operations.swing (function)
swing(profile: Sketch | Face, outline: Sketch | Face | Wire | Edge) -> Part
swing(profile: Sketch | Face | Wire | Edge, outline: Sketch | Face | Wire | Edge) -> Part | Shell

# Category: operations
# Turn a face or sheet into a solid of ``thickness`` (``both``
# Remarks: :meth:`Shell.thicken`).
# smlibpy.operations.thicken (function)
thicken(surface: Shell | Face, thickness: float, *, both: bool = False) -> Part

# Category: operations
# Trim a sheet with curves on it, keeping a side (``trim(sheet, curves, keep)``
# Remarks: :meth:`Shell.trim`), or an edge or a wire to a stretch of it (``trim(edge, start, end)``: see :meth:`Edge.trim`, :meth:`Wire.trim`).
# smlibpy.operations.trim (function)
trim(shape: Shell, curves: Edge | Wire | Sequence[Edge | Wire], keep: VectorLike | str) -> Shell
trim(shape: Edge, start: float | VectorLike | Vertex, end: float | VectorLike | Vertex) -> Edge
trim(shape: Wire, start: float | VectorLike | Vertex, end: float | VectorLike | Vertex) -> Wire

# Category: operations
# Raise or sink a region of a face (see :meth:`Part.warp`, :meth:`Shell.warp`)
# smlibpy.operations.warp (function)
warp(shape: Part, face: Face, region: Any, by: float | VectorLike, *, continuity: Literal['crease', 'G1', 'G2'] = ...) -> Part
warp(shape: Shell, face: Face, region: Any, by: float | VectorLike, *, continuity: Literal['crease', 'G1', 'G2'] = ...) -> Shell

# Category: operations
# The region in exactly one of the sketches, ``a ^ b`` (see :meth:`Sketch.xor`)
# smlibpy.operations.xor (function)
xor(sketch: Sketch, *others: Sketch | Sequence[Sketch]) -> Sketch
