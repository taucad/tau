# smlibpy — sheetmetal

9 top-level symbols. Signatures are verbatim python.

# Category: sheetmetal
# One bend of a sheet metal part
# Remarks: ``angle`` in degrees, ``radius`` the inside radius, ``length`` the bend's extent along its axis. From :func:`bends`, ``axis`` is the axis of the bend's cylinders. In a :class:`FlatPattern`, ``line`` is the bend line (the middle of the bend's strip, at z = 0) and ``direction`` ``"up"`` or ``"down"``: where the sheet beyond the line folds to, seen from above (+Z).
# smlibpy.sheetmetal.Bend (class)
class Bend

  # The bend allowance (the width of the bend's strip in the flat)
  allowance: float

  # smlibpy.sheetmetal.Bend.__init__ (constructor)
  Bend(angle: float, radius: float, thickness: float, k_factor: float, length: float, axis: Axis | None = None, line: Edge | None = None, direction: str | None = None) -> NoneType

# Category: sheetmetal
# The unfolded part, laid on the XY plane
# Remarks: the longer side of the smallest rectangle around it along X and its bounding box starting at the origin. ``outline`` is the cut contour (outer boundary and holes) as a sketch at z = 0; ``bends`` carry the bend lines (at z = 0) with angle, radius, direction and allowance.
# smlibpy.sheetmetal.FlatPattern (class)
class FlatPattern

  # The bend lines (middle of each bend's strip), at z = 0
  bend_lines: ShapeList[Edge]

  # Size of the blank
  size: Vector

  # smlibpy.sheetmetal.FlatPattern.__init__ (constructor)
  FlatPattern(part: Part, outline: Sketch, bends: list[Bend], thickness: float, k_factor: float) -> NoneType

# Category: sheetmetal
# Length of the flat strip that a bend takes
# Remarks: ``angle`` is the bend angle in degrees (90 for an L), ``radius`` the inside radius.
# smlibpy.sheetmetal.bend_allowance (function)
bend_allowance(angle: float, *, radius: float, thickness: float, k_factor: float = K_FACTOR) -> float

# Category: sheetmetal
# What a bend takes off the sum of the outside leg lengths
# Remarks: tan(angle / 2) - bend_allowance``. The outside lengths run to the virtual sharp, where the outer faces of the two legs meet (below 180 degrees).
# smlibpy.sheetmetal.bend_deduction (function)
bend_deduction(angle: float, *, radius: float, thickness: float, k_factor: float = K_FACTOR) -> float

# Category: sheetmetal
# Length of the flat blank for a strip bent into ``legs``
# Remarks: The legs are outside lengths: from the free end, or from the virtual sharp where the outer faces of two legs meet, to the next virtual sharp (the dimensions on a drawing of the part). ``angle`` is the angle of every bend, or one angle per bend (``len(legs) - 1`` of them). The result is ``sum(legs) - sum(bend deductions)``.
# smlibpy.sheetmetal.developed_length (function)
developed_length(*legs: float, angle: float | Sequence[float] = 90.0, radius: float, thickness: float, k_factor: float = K_FACTOR) -> float

# Category: sheetmetal
# Add a flange along a straight edge of a sheet
# Remarks: The sheet is extended beyond the edge and bent there: the bend starts at the edge (the sheet keeps its size), its inside radius is ``radius``.
# smlibpy.sheetmetal.flange (function)
flange(part: Part, edge: Edge | ShapeList[Edge], length: float, *, angle: float = 90.0, radius: float, k_factor: float = K_FACTOR) -> Part
#   part: A sheet (a plate, or a part with bends or flanges)
#   edge: A straight edge where a top or bottom face of the sheet meets a side face (an outer edge, such as ``plate.edges().filter_by(Y).top().right()``)
#   length: Outside length of the flange
#   angle: Bend angle in degrees, below 180
#   radius: Inside bend radius
#   k_factor: Position of the neutral fiber, 0 (inside) to 1 (outside)

# Category: sheetmetal
# The flat pattern of a sheet metal part, laid on the XY plane (see :class:`FlatPattern`)
# Remarks: The part is unfolded with ``fixed`` (default: the largest planar face) staying in place; that face is the bottom of the flat (z = 0) and bends are ``"up"`` when the far side of the sheet folds towards +Z. The longer side of the smallest rectangle around the blank runs along X, and the bounding box starts at the origin.
# smlibpy.sheetmetal.flat_pattern (function)
flat_pattern(part: Part, *, k_factor: float = K_FACTOR, fixed: Face | None = None) -> FlatPattern

# Category: sheetmetal
# Fold a sheet along a line
# Remarks: Returns: The bent part: the bend faces are exact cylinders of ``radius`` and ``radius + thickness``.
# smlibpy.sheetmetal.fold (function)
fold(part: Part, line: Axis | Edge, angle: float, *, radius: float, k_factor: float = K_FACTOR, fixed: VectorLike | Shape | None = None, partial: bool = False) -> Part
#   part: A sheet
#   line: The bend line, an :class:`Axis` or a straight :class:`Edge` lying on the top or bottom face of the sheet
#   angle: Bend angle in degrees, up to 180
#   radius: Inside bend radius
#   k_factor: Position of the neutral fiber, 0 (inside) to 1 (outside)
#   fixed: A point (or a face, edge or vertex) on the side of the line that stays in place
#   partial: Bend only along the segment ``line`` (an Edge), not across the whole sheet

# Category: sheetmetal
# Unfold a sheet metal part
# Remarks: The face ``fixed`` (default: the largest planar face) stays where it is; the rest of the sheet unfolds into its plane. With the K-factor the part was bent with, the result is the blank it was bent from. For the flat pattern on the XY plane, with outline and bend lines, use :func:`flat_pattern`.
# smlibpy.sheetmetal.unfold (function)
unfold(part: Part, *, k_factor: float = K_FACTOR, fixed: Face | None = None) -> Part
