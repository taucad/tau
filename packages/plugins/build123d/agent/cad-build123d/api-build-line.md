# build123d — build_line

1 top-level symbols. Signatures are verbatim python.

# Category: build_line
# BuildLine
# Remarks: The BuildLine class is a subclass of Builder for building lines (objects with length but not area or volume). It has an _obj property that returns the current line being built. The class overrides the faces and solids methods of Builder since they don't apply to lines. BuildLine constructs geometry on local Plane.XY and publishes the completed curve to a single placement. For example: .. code:: with BuildLine(Plane.YZ) as radius_arc: RadiusArc((1, 2), (2, 1), 1) constructs an arc from local points (1, 2, 0) to (2, 1, 0), then publishes it to Plane.YZ.
# build123d.build_line.BuildLine (class)
class BuildLine(Builder)

  # build123d.build_line.BuildLine.__init__ (constructor)
  BuildLine(placement: Face | Plane | Location = Plane.XY, mode: Mode = Mode.ADD)
  #   placement: output placement
  #   mode: combination mode

  # Get the placed line
  line: Curve | None

  # Get the line in the Builder's local construction coordinates
  line_local: Curve | None

  # faces() not implemented
  # build123d.build_line.BuildLine.faces (method)
  faces(*args)

  # face() not implemented
  # build123d.build_line.BuildLine.face (method)
  face(*args)

  # solids() not implemented
  # build123d.build_line.BuildLine.solids (method)
  solids(*args)

  # solid() not implemented
  # build123d.build_line.BuildLine.solid (method)
  solid(*args)
