# build123d — build_part

1 top-level symbols. Signatures are verbatim python.

// BuildPart
BuildPart

  BuildPart(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  //   workplanes: initial plane to work on
  //   mode: combination mode

  // Get the current part
  part: Part | None

  // Return a wire representation of the pending edges
  pending_edges_as_wire: Wire

  // Builder's location
  location: Location | None
