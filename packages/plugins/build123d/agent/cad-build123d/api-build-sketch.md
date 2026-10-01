# build123d — build_sketch

1 top-level symbols. Signatures are verbatim python.

// BuildSketch
BuildSketch

  // build123d.build_sketch.BuildSketch.__init__ (constructor)
  BuildSketch(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  //   workplanes: objects converted to plane(s) to place the sketch on
  //   mode: combination mode

  // Get the builder's object
  sketch_local: Sketch | None

  // The global version of the sketch - may contain multiple sketches
  sketch

  // solids() not implemented
  // build123d.build_sketch.BuildSketch.solids (method)
  solids(*args)

  // solid() not implemented
  // build123d.build_sketch.BuildSketch.solid (method)
  solid(*args)

  // Unify pending edges into one or more Wires
  // build123d.build_sketch.BuildSketch.consolidate_edges (method)
  consolidate_edges() -> Wire | list[Wire]
