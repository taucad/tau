# smlibpy — drawing

4 top-level symbols. Signatures are verbatim python.

# Category: drawing
# One view of a drawing (see :func:`drawing_views`)
# Remarks: Attributes: name: ``"front"``, ``"back"``, ``"top"``, ``"bottom"``, ``"left"`` or ``"right"``. direction: Where the view looks from: the direction from the part towards the viewer. visible: The visible lines, standalone edges in the drawing's plane (world XY). hidden: The hidden lines (drawn dashed), likewise.
# smlibpy.drawing.DrawingView (class)
class DrawingView(tuple)

  # The box around the view's lines
  # smlibpy.drawing.DrawingView.bbox (method)
  bbox() -> BoundBox

# Category: drawing
# The views of a part for a 2D drawing, laid out in the world XY plane
# smlibpy.drawing.drawing_views (function)
drawing_views(part: Any, views: Sequence[str] = ('front', 'top', 'left'), *, projection: Literal['first-angle', 'third-angle'] = 'first-angle', hidden: bool = True, tangent_edges: bool = False, gap: float | None = None) -> list[DrawingView]

# Category: drawing
# Write :func:`to_svg` of the shapes to a file
# smlibpy.drawing.export_svg (function)
export_svg(shapes: Any, path: str | os.PathLike[str], *, margin: float | None = None, stroke: float | None = None) -> None

# Category: drawing
# An SVG drawing of drawing views (dashed hidden lines), edges, wires and the edges of
# Remarks: faces and sketches, seen from +Z (their x and y; the SVG's y runs down). Lines and circular arcs are exact, other curves polylines. Lengths are in millimeters: the drawing prints at its true size.
# smlibpy.drawing.to_svg (function)
to_svg(shapes: Any, *, margin: float | None = None, stroke: float | None = None) -> str
#   shapes: :class:`DrawingView`, ``Edge``, ``Wire``, ``Face``, ``Sketch`` or a list of them
#   margin: Space around the lines
#   stroke: Width of the visible lines (the hidden ones are 0.7 of it, dashed)
