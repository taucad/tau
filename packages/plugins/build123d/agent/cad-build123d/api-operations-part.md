# build123d — operations_part

8 top-level symbols. Signatures are verbatim python.

// Part Operation
draft(faces: Face | Iterable[Face], neutral_plane: Plane, angle: float) -> Part
// faces: Faces to which the draft should be applied
// neutral_plane: Plane defining the neutral direction and position
// angle: Draft angle in degrees

// Part Operation
extrude(to_extrude: Face | Sketch | None = None, amount: float | None = None, dir: VectorLike | None = None, until: Until | None = None, target: Compound | Solid | None = None, both: bool = False, taper: float = 0.0, clean: bool = True, mode: Mode = Mode.ADD) -> Part
// to_extrude: object to extrude
// amount: distance to extrude, sign controls direction
// dir: direction
// until: extrude limit
// target: extrude until target
// both: extrude in both directions
// taper: taper angle
// clean: Remove extraneous internal structure
// mode: combination mode

// Part Operation
loft(sections: Face | Sketch | Iterable[Vertex | Face | Sketch] | None = None, ruled: bool = False, clean: bool = True, mode: Mode = Mode.ADD) -> Part
// sections: slices to loft into object
// ruled: discontiguous layer tangents
// clean: Remove extraneous internal structure
// mode: combination mode

// make_brake_formed
make_brake_formed(thickness: float, station_widths: float | Iterable[float], line: Edge | Wire | Curve | None = None, side: Side = Side.LEFT, kind: Kind = Kind.ARC, clean: bool = True, mode: Mode = Mode.ADD) -> Part
// thickness: sheet metal thickness
// station_widths: width of part at each vertex or a single value
// line: outline of part
// side: offset direction
// kind: offset intersection type
// clean: clean the resulting solid
// mode: combination mode

// Part Operation
project_workplane(origin: VectorLike | Vertex, x_dir: VectorLike | Vertex, projection_dir: VectorLike, distance: float) -> Plane
// origin: origin in 3D space
// x_dir: x direction in 3D space
// projection_dir: projection direction
// distance: distance from origin to workplane

// Part Operation
revolve(profiles: Face | Iterable[Face] | None = None, axis: Axis = Axis.Z, revolution_arc: float = 360.0, clean: bool = True, mode: Mode = Mode.ADD) -> Part
// profiles: 2D profile(s) to revolve
// axis: axis of rotation
// revolution_arc: angular size of revolution
// clean: Remove extraneous internal structure
// mode: combination mode

// Part Operation
section(obj: Part | None = None, section_by: Plane | Iterable[Plane] = Plane.XZ, height: float = 0.0, clean: bool = True, mode: Mode = Mode.PRIVATE) -> Sketch
// obj: object to section
// section_by: plane(s) to section object
// height: workplane offset
// clean: Remove extraneous internal structure
// mode: combination mode

// Part Operation
thicken(to_thicken: Face | Sketch | None = None, amount: float | None = None, normal_override: VectorLike | None = None, both: bool = False, clean: bool = True, mode: Mode = Mode.ADD) -> Part
// to_thicken: object to thicken
// amount: distance to extrude, sign controls direction
// normal_override: The normal_override vector can be used to indicate which way is 'up', potentially flipping the face normal direction such that many faces with different normals all go in the same direction (direction need only be +/- 90 degrees from the face normal)
// both: thicken in both directions
// clean: Remove extraneous internal structure
// mode: combination mode
