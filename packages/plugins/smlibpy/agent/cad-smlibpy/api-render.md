# smlibpy — render

2 top-level symbols. Signatures are verbatim python.

# Category: render
# Compare two pictures of the same size pixel by pixel
# Remarks: Meaningful for two renders of the same view with a pinned frame (``frame=`` of the first): without it, a changed model is fitted anew and every pixel moves. Returns: An :class:`ImageDiff`: the number, share and bounding box of the changed pixels, and a picture of the difference (changed pixels red on a faded gray of ``b``).
# smlibpy.render.diff_images (function)
diff_images(a: Any, b: Any, tolerance: int = 0) -> ImageDiff
#   a: A picture from :func:`render`, PNG bytes, a PNG file path, or an ``(h, w, 3)`` ``uint8`` array
#   b: The picture to compare with, in any of the same forms
#   tolerance: Largest difference per color channel (0 to 255) that still counts as equal

# Category: render
# Render shapes to a PNG image
# Remarks: The options combine: a sectioned drawing with highlights and markers is fine. Returns: A :class:`Picture`: the PNG file contents as ``bytes``, with ``.pixels`` and ``.frame``.
# smlibpy.render.render (function)
render(*shapes: Any, path: str | os.PathLike[str] | None = None, view: Any = 'iso', size: tuple[int, int] = (800, 600), edges: bool = True, background: Any = 'white', tolerance: float | None = None, zoom: float = 1.0, look_at: Any = None, frame: Any = None, supersample: int = 2, colors: str = 'native', lines: bool = False, drawing: Any = False, sheet: Any = False, section: Any = None, cap: bool = True, highlight: Any = None, highlight_at: Any = None, markers: Any = None, annotate: bool = False, xray: bool = False, xray_alpha: float = 0.42, zebra: Any = False, curvature: Any = None) -> Picture
#   shapes: Parts, sketches, shells, faces, edges, wires, meshes, or lists of them
#   path: Also write the PNG to this file
#   view: The camera, orthographic, Z up
#   size: Width and height in pixels
#   edges: Draw the edges of faces in the shaded view (hidden edges stay hidden)
#   background: Background color
#   tolerance: Tessellation tolerance
#   zoom: Factor on the scale that fits the shapes (2 shows half as much)
#   look_at: A point that lands in the middle of the picture
#   frame: The frame of an earlier render of the same view and size (its ``Picture.frame``, or the picture itself)
#   supersample: Render at this many times the size and average down (1 to 4)
#   colors: ``"native"``
#   lines: Line style instead of shading
#   drawing: A technical drawing
#   sheet: Several shaded views in one picture
#   section: Cut at a plane and leave out what is on the positive side of its normal
#   cap: Fill the cut faces of closed bodies, hatched at 45 degrees (neighbouring bodies alternate the direction)
#   highlight: Shapes drawn in signal colors
#   highlight_at: Points
#   markers: Crosshairs with labels, drawn on top
#   annotate: Measurement overlay
#   xray: Translucent bodies
#   xray_alpha: Opacity of each face in the x-ray view (0 to 1)
#   zebra: Zebra stripes
#   curvature: A curvature map of the exact surfaces
