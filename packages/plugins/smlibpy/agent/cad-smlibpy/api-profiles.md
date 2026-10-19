# smlibpy — profiles

1 top-level symbols. Signatures are verbatim python.

# Category: profiles
# A pen that draws an outline in the XY plane, segment by segment
# Remarks: Start it at a point with a heading (degrees counterclockwise from +X), then move:: section = (Profile((0, 0)) .line_to(12, 0).line_to(y=4).fillet(1.5) .line_to(x=6).line_to(y=20).chamfer(1) .line_to(x=0) .close()) # a Sketch: extrude or revolve it Moves: ``line_to`` (to a point, or to an x or y), ``line_by`` (by an offset), ``forward`` (along the heading, or until x or y reaches a value), ``arc`` (tangent, by radius and angle; a positive angle turns left), ``arc_to`` (tangent to an end point, or through a point). ``turn``/``turn_to`` change the heading without drawing. ``fillet`` and ``chamfer`` round or bevel the corner at the pen, between the segment before and the segment after. ``mirror(axis)`` adds the mirror image of the path drawn so far. ``close()`` makes the region, ``wire()`` the open path. Each call returns a new Profile; ``point`` and ``heading`` tell where the pen is. Errors name the segment (the call that drew it) and the numbers that do not fit.
# smlibpy.profiles.Profile (class)
class Profile

  # smlibpy.profiles.Profile.__init__ (constructor)
  Profile(start: VectorLike = (0, 0), *, heading: float = 0.0)

  # Where the pen is
  point: Vector

  # Where the drawing started
  start: Vector

  # The direction the pen moves in, degrees counterclockwise from +X (-180 to 180)
  heading: float

  # A straight line to a point
  # Remarks: coordinate, keeping the other one: ``line_to(x=30)`` (horizontal), ``line_to(y=5)`` (vertical).
  # smlibpy.profiles.Profile.line_to (method)
  line_to(*point: float | VectorLike, x: float | None = None, y: float | None = None) -> Profile

  # A straight line by an offset from the pen
  # smlibpy.profiles.Profile.line_by (method)
  line_by(dx: float | VectorLike = 0.0, dy: float = 0.0) -> Profile

  # A straight line along the heading
  # Remarks: reaches ``y``).
  # smlibpy.profiles.Profile.forward (method)
  forward(length: float | None = None, *, x: float | None = None, y: float | None = None) -> Profile

  # Turn the heading by ``angle`` degrees (positive
  # Remarks: segment starts at a corner.
  # smlibpy.profiles.Profile.turn (method)
  turn(angle: float) -> Profile

  # Set the heading (degrees counterclockwise from +X) without drawing
  # smlibpy.profiles.Profile.turn_to (method)
  turn_to(heading: float) -> Profile

  # A tangent arc of ``radius`` that turns the heading by ``angle`` degrees
  # Remarks: turns left (counterclockwise), negative right. ``arc(5, 180)`` is a U-turn.
  # smlibpy.profiles.Profile.arc (method)
  arc(radius: float, angle: float) -> Profile

  # An arc to an end point
  # Remarks: point (``arc_to(20, 10, through=(15, 12))``, which need not be tangent).
  # smlibpy.profiles.Profile.arc_to (method)
  arc_to(*point: float | VectorLike, through: VectorLike | None = None) -> Profile

  # Round the corner at the pen with a tangent arc of ``radius``
  # Remarks: segment just drawn and the next one (at the start point: between the closing segment and the first one).
  # smlibpy.profiles.Profile.fillet (method)
  fillet(radius: float) -> Profile

  # Bevel the corner at the pen
  # Remarks: segment after (measured along them) and join the two points with a line.
  # smlibpy.profiles.Profile.chamfer (method)
  chamfer(length: float) -> Profile

  # Continue with the mirror image of the path drawn so far, so that the whole outline
  # Remarks: is symmetric about ``axis`` (an axis in the XY plane: ``X``, ``Y`` or ``Axis((x, y), direction)``). Draw half the outline from the axis back to the axis; an end that is off the axis is joined straight across to its mirror image. Corners rounded on the half are rounded on the mirrored half too.
  # smlibpy.profiles.Profile.mirror (method)
  mirror(axis: Axis) -> Profile

  # The region inside the outline, as a Sketch on XY
  # Remarks: start if the pen is not there. ``align`` moves the result (``None`` leaves the outline where it was drawn).
  # smlibpy.profiles.Profile.close (method)
  close(*, align: AlignLike = None) -> Sketch

  # The path as drawn, as an open Wire of exact lines and arcs (a sweep path, or a
  # Remarks: centerline for Stroke).
  # smlibpy.profiles.Profile.wire (method)
  wire() -> Wire
