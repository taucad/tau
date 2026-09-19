# build123d — build_sketch

1 top-level symbols. Signatures are verbatim python.

// BuildSketch
BuildSketch

  BuildSketch(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  //   workplanes: objects converted to plane(s) to place the sketch on
  //   mode: combination mode

  // Get the builder's object
  sketch_local: Sketch | None

  // The global version of the sketch - may contain multiple sketches
  sketch

  // solids() not implemented
  solids(*args)

  // solid() not implemented
  solid(*args)

  // Unify pending edges into one or more Wires
  consolidate_edges() -> Wire | list[Wire]
