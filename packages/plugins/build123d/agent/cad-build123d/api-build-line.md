# build123d — build_line

1 top-level symbols. Signatures are verbatim python.

// BuildLine
BuildLine

  // build123d.build_line.BuildLine.__init__ (constructor)
  BuildLine(workplane: Face | Plane | Location = Plane.XY, mode: Mode = Mode.ADD)
  //   workplane: plane used when local coordinates are used and when creating arcs
  //   mode: combination mode

  // Get the current line
  line: Curve | None

  // faces() not implemented
  // build123d.build_line.BuildLine.faces (method)
  faces(*args)

  // face() not implemented
  // build123d.build_line.BuildLine.face (method)
  face(*args)

  // solids() not implemented
  // build123d.build_line.BuildLine.solids (method)
  solids(*args)

  // solid() not implemented
  // build123d.build_line.BuildLine.solid (method)
  solid(*args)
