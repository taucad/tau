# smlibpy — operations

13 top-level symbols. Signatures are verbatim python.

# Category: operations
# Bevel edges of the part they belong to (see :meth:`Part.chamfer`), or corners of the
# Remarks: sketch they belong to (see :meth:`Sketch.chamfer`).
# smlibpy.operations.chamfer (function)
chamfer(edges: Any, length: float) -> Part | Sketch

# Category: operations
# Extrude a sketch, a planar face or a closed wire into a solid (see :meth:`Sketch.extrude`)
# Remarks: An open curve extrudes into a surface (a :class:`Shell`), along ``direction`` (an axis or a vector) or the normal of the curve's plane.
# smlibpy.operations.extrude (function)
extrude(profile: Sketch | Face | Wire | Edge, amount: float, *, both: bool = False, taper: float = 0.0, direction: Axis | VectorLike | None = None) -> Part | Shell

# Category: operations
# Round edges of the part they belong to (see :meth:`Part.fillet`), or corners of the
# Remarks: sketch they belong to: ``fillet(s.vertices().concave(), 2)`` (see :meth:`Sketch.fillet`).
# smlibpy.operations.fillet (function)
fillet(edges: Any, radius: float | tuple[float, float] | Sequence[float], **kwargs: Any) -> Part | Sketch

# Category: operations
# A solid through a sequence of cross sections, or a surface through open curves
# smlibpy.operations.loft (function)
loft(sections: Sequence[Sketch | Face | Wire | Edge], *, ruled: bool = False, smooth: bool = True) -> Part | Shell
#   sections: Two or more sections in order
#   ruled: Straight transitions between neighbouring sections
#   smooth: With four or more sections, pass through them with a cubic surface (``False``

# Category: operations
# Parts as one part made of cells
# Remarks: their faces (see :meth:`Part.merge`; ``cells()`` gives them as parts).
# smlibpy.operations.merge (function)
merge(*parts: Part | Sequence[Part]) -> Part

# Category: operations
# A mirrored copy of a shape
# smlibpy.operations.mirror (function)
mirror(shape: Shape, plane: Plane = Plane.XZ) -> Any

# Category: operations
# Grow or shrink a part or a sketch by ``distance`` (for a sketch also
# Remarks: ``corners="round" | "sharp" | "chamfer"``, see :meth:`Sketch.offset`).
# smlibpy.operations.offset (function)
offset(shape: Part | Sketch, distance: float, **kwargs: Any) -> Any

# Category: operations
# Revolve a sketch about an axis into a solid (see :meth:`Sketch.revolve`)
# Remarks: An open curve revolves into a surface of revolution (a :class:`Shell`).
# smlibpy.operations.revolve (function)
revolve(profile: Sketch | Face | Wire | Edge, axis: Axis | None = None, angle: float = 360.0) -> Part | Shell

# Category: operations
# Cross-section of a part (see :meth:`Part.section`)
# smlibpy.operations.section (function)
section(part: Part, plane: Plane | Face = Plane.XY) -> Sketch

# Category: operations
# Hollow out a part (see :meth:`Part.shell`)
# smlibpy.operations.shell (function)
shell(part: Part, thickness: float, openings: Any = None, *, outward: bool = False) -> Part

# Category: operations
# Cut a part with a plane (see :meth:`Part.split`)
# smlibpy.operations.split (function)
split(part: Part, plane: Plane | Face, keep: str = 'above') -> Any

# Category: operations
# Sweep a profile along a path
# Remarks: The profile is moved so that its center sits at the start of the path and (with ``orient``) turned to face along the path, so profiles can be drawn anywhere, usually in the XY plane:: tube = sweep(Circle(2), Spline((0, 0, 0), (0, 10, 20), (30, 10, 40))) rail = sweep(Rectangle(4, 2), Helix(pitch=10, height=40, radius=20))
# smlibpy.operations.sweep (function)
sweep(profile: Sketch | Face | Wire, path: Edge | Wire, *, orient: bool = True, translational: bool = False, sharp_corners: bool | None = None) -> Part
#   profile: A sketch (holes allowed), a planar face or a closed wire
#   path: An edge, or a wire of connected edges
#   orient: Turn the profile to be perpendicular to the path at its start
#   translational: Keep the profile's orientation fixed instead of turning it with the path
#   sharp_corners: For paths of several edges

# Category: operations
# Turn a face or sheet into a solid of ``thickness``
# smlibpy.operations.thicken (function)
thicken(surface: Shell | Face, thickness: float) -> Part
