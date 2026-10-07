# build123d — build_line

1 top-level symbols. Signatures are verbatim python.

# Category: build_line
# BuildLine
# Remarks: The BuildLine class is a subclass of Builder for building lines (objects with length but not area or volume). It has an _obj property that returns the current line being built. The class overrides the faces and solids methods of Builder since they don't apply to lines. BuildLine only works with a single workplane which is used to convert tuples as inputs to global coordinates. For example: .. code:: with BuildLine(Plane.YZ) as radius_arc: RadiusArc((1, 2), (2, 1), 1) creates an arc from global points (0, 1, 2) to (0, 2, 1). Note that points entered as Vector(x, y, z) are considered global and are not localized. The workplane is also used to define planes parallel to the workplane that arcs are created on.
# build123d.build_line.BuildLine (class)
class BuildLine(Builder)

  # build123d.build_line.BuildLine.__init__ (constructor)
  BuildLine(workplane: Face | Plane | Location = Plane.XY, mode: Mode = Mode.ADD)
  #   workplane: plane used when local coordinates are used and when creating arcs
  #   mode: combination mode

  # Get the current line
  line: Curve | None

  # Upon exiting restore context and send object to parent
  # build123d.build_line.BuildLine.__exit__ (method)
  __exit__(exception_type, exception_value, traceback)

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
