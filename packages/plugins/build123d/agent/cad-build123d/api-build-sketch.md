# build123d — build_sketch

1 top-level symbols. Signatures are verbatim python.

# Category: build_sketch
# BuildSketch
# Remarks: The BuildSketch class is a subclass of Builder for building planar 2D sketches (objects with area but not volume) from faces or lines. It has an _obj property that returns the current sketch being built. The sketch property consists of the sketch(es) applied to the input workplanes while the sketch_local attribute is the sketch constructed on Plane.XY. The class overrides the solids method of Builder since they don't apply to lines. Note that all sketch construction is done within sketch_local on Plane.XY. When objects are added to the sketch they must be coplanar to Plane.XY, usually handled automatically but may need user input for Edges and Wires since their construction plane isn't always able to be determined.
# build123d.build_sketch.BuildSketch (class)
class BuildSketch(Builder)

  # build123d.build_sketch.BuildSketch.__init__ (constructor)
  BuildSketch(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  #   workplanes: objects converted to plane(s) to place the sketch on
  #   mode: combination mode

  # Get the builder's object
  sketch_local: Sketch | None

  # The global version of the sketch - may contain multiple sketches
  sketch

  # solids() not implemented
  # build123d.build_sketch.BuildSketch.solids (method)
  solids(*args)

  # solid() not implemented
  # build123d.build_sketch.BuildSketch.solid (method)
  solid(*args)

  # Unify pending edges into one or more Wires
  # build123d.build_sketch.BuildSketch.consolidate_edges (method)
  consolidate_edges() -> Wire | list[Wire]
