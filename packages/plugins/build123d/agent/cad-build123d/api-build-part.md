# build123d — build_part

1 top-level symbols. Signatures are verbatim python.

# Category: build_part
# BuildPart
# Remarks: The BuildPart class is another subclass of Builder for building parts (objects with the property of volume) from sketches or 3D objects. It has an _obj property that returns the current part being built, and several pending lists for storing faces, edges, and planes that will be integrated into the final part later. The class overrides the _add_to_pending method of Builder.
# build123d.build_part.BuildPart (class)
class BuildPart(Builder)

  # build123d.build_part.BuildPart.__init__ (constructor)
  BuildPart(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  #   workplanes: initial plane to work on
  #   mode: combination mode

  # Get the current part
  part: Part | None

  # Return a wire representation of the pending edges
  pending_edges_as_wire: Wire

  # Builder's location
  location: Location | None
