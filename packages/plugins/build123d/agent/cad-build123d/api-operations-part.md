# build123d — operations_part

8 top-level symbols. Signatures are verbatim python.

# Category: operations_part
# Part Operation
# Remarks: Apply a draft angle to the given faces of the part
# build123d.operations_part.draft (function)
draft(faces: Face | Iterable[Face], neutral_plane: Plane, angle: float) -> Part
#   faces: Faces to which the draft should be applied
#   neutral_plane: Plane defining the neutral direction and position
#   angle: Draft angle in degrees

# Category: operations_part
# Part Operation
# Remarks: Extrude a sketch or face by an amount or until another object. Returns: Part: extruded object
# Throws: ValueError: No object to extrude
# Throws: ValueError: No target object
# build123d.operations_part.extrude (function)
extrude(to_extrude: Face | Sketch | None = None, amount: float | None = None, dir: VectorLike | None = None, until: Until | None = None, target: Compound | Solid | None = None, both: bool = False, taper: float = 0.0, clean: bool = True, mode: Mode = Mode.ADD) -> Part
#   to_extrude: object to extrude
#   amount: distance to extrude, sign controls direction
#   dir: direction
#   until: extrude limit
#   target: extrude until target
#   both: extrude in both directions
#   taper: taper angle
#   clean: Remove extraneous internal structure
#   mode: combination mode

# Category: operations_part
# Part Operation
# Remarks: Loft the pending sketches/faces, across all workplanes, into a solid.
# build123d.operations_part.loft (function)
loft(sections: Face | Sketch | Iterable[Vertex | Face | Sketch] | None = None, ruled: bool = False, clean: bool = True, mode: Mode = Mode.ADD) -> Part
#   sections: slices to loft into object
#   ruled: discontiguous layer tangents
#   clean: Remove extraneous internal structure
#   mode: combination mode

# Category: operations_part
# make_brake_formed
# Remarks: Create a part typically formed with a sheet metal brake from a single outline. The line parameter describes how the material is to be bent. Either a single width value or a width value at each vertex or station is provided to control the width of the end part. Note that if multiple values are provided there must be one for each vertex and that the resulting part is composed of linear segments. Returns: Part: sheet metal part
# Throws: ValueError: invalid line type
# Throws: ValueError: not line provided
# Throws: ValueError: line not suitable
# Throws: ValueError: incorrect # of width values
# build123d.operations_part.make_brake_formed (function)
make_brake_formed(thickness: float, station_widths: float | Iterable[float], line: Edge | Wire | Curve | None = None, side: Side = Side.LEFT, kind: Kind = Kind.ARC, clean: bool = True, mode: Mode = Mode.ADD) -> Part
#   thickness: sheet metal thickness
#   station_widths: width of part at each vertex or a single value
#   line: outline of part
#   side: offset direction
#   kind: offset intersection type
#   clean: clean the resulting solid
#   mode: combination mode

# Category: operations_part
# Part Operation
# Remarks: Return a plane to be used as a BuildSketch or BuildLine workplane with a known origin and x direction. The plane's origin will be the projection of the provided origin (in 3D space). The plane's x direction will be the projection of the provided x_dir (in 3D space). Returns: Plane: workplane aligned for projection
# Throws: RuntimeError: Not suitable for BuildLine or BuildSketch
# Throws: ValueError: x_dir perpendicular to projection_dir
# build123d.operations_part.project_workplane (function)
project_workplane(origin: VectorLike | Vertex, x_dir: VectorLike | Vertex, projection_dir: VectorLike, distance: float) -> Plane
#   origin: origin in 3D space
#   x_dir: x direction in 3D space
#   projection_dir: projection direction
#   distance: distance from origin to workplane

# Category: operations_part
# Part Operation
# Remarks: Revolve the profile or pending sketches/face about the given axis. Note that the most common use case is when the axis is in the same plane as the face to be revolved but this isn't required.
# Throws: ValueError: Invalid axis of revolution
# build123d.operations_part.revolve (function)
revolve(profiles: Face | Iterable[Face] | None = None, axis: Axis = Axis.Z, revolution_arc: float = 360.0, clean: bool = True, mode: Mode = Mode.ADD) -> Part
#   profiles: 2D profile(s) to revolve
#   axis: axis of rotation
#   revolution_arc: angular size of revolution
#   clean: Remove extraneous internal structure
#   mode: combination mode

# Category: operations_part
# Part Operation
# Remarks: Slices current part at the given height by section_by or current workplane(s).
# build123d.operations_part.section (function)
section(obj: Part | None = None, section_by: Plane | Iterable[Plane] = Plane.XZ, height: float = 0.0, clean: bool = True, mode: Mode = Mode.PRIVATE) -> Sketch
#   obj: object to section
#   section_by: plane(s) to section object
#   height: workplane offset
#   clean: Remove extraneous internal structure
#   mode: combination mode

# Category: operations_part
# Part Operation
# Remarks: Create a solid(s) from a potentially non planar face(s) by thickening along the normals. Returns: Part: extruded object
# Throws: ValueError: No object to extrude
# Throws: ValueError: No target object
# build123d.operations_part.thicken (function)
thicken(to_thicken: Face | Sketch | None = None, amount: float | None = None, normal_override: VectorLike | None = None, both: bool = False, clean: bool = True, mode: Mode = Mode.ADD) -> Part
#   to_thicken: object to thicken
#   amount: distance to extrude, sign controls direction
#   normal_override: The normal_override vector can be used to indicate which way is 'up', potentially flipping the face normal direction such that many faces with different normals all go in the same direction (direction need only be +/- 90 degrees from the face normal)
#   both: thicken in both directions
#   clean: Remove extraneous internal structure
#   mode: combination mode
