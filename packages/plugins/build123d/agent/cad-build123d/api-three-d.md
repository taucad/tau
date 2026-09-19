# build123d — three_d

2 top-level symbols. Signatures are verbatim python.

// Solid.draft custom exception
DraftAngleError

  DraftAngleError(message, face = None, problematic_shape = None)

// A Solid in build123d represents a three-dimensional solid geometry
Solid

  // Build a solid from an OCCT TopoDS_Shape/TopoDS_Solid
  Solid(obj: TopoDS_Solid | Shell | None = None, label: str = '', color: Color | None = None, material: str = '', joints: dict[str, Joint] | None = None, parent: Compound | None = None)
  //   obj: OCCT Solid or Shell
  //   label: Defaults to ''
  //   color: Defaults to None
  //   material: tag for external tools
  //   joints: names joints
  //   parent: assembly parent

  // volume - the volume of this Solid
  volume: float

  // Find where this Solid's boundary contacts another shape
  touch(other: Shape, tolerance: float = 1e-06, found_solids: ShapeList | None = None) -> ShapeList[Vertex | Edge | Face]
  //   other: Shape to check boundary contacts with
  //   tolerance: tolerance for contact detection
  //   found_solids: pre-found intersection solids to filter against

  // extrude
  extrude(obj: Face, direction: VectorLike) -> Solid
  //   direction: direction and magnitude of extrusion

  // Extrude with Rotation
  extrude_linear_with_rotation(section: Face | Wire, center: VectorLike, normal: VectorLike, angle: float, inner_wires: list[Wire] | None = None) -> Solid
  //   section: cross section
  //   angle: the angle to rotate through while extruding
  //   inner_wires: holes - only used if section is of type Wire

  // Extrude a cross section with a taper
  extrude_taper(profile: Face, direction: VectorLike, taper: float, flip_inner: bool = True) -> Solid
  //   taper: taper angle in degrees
  //   flip_inner: outer and inner geometry have opposite tapers to allow for part extraction when injection molding

  // extrude_until
  extrude_until(profile: Face, target: Compound | Solid, direction: VectorLike, until: Until = Until.NEXT) -> Solid
  //   profile: The face to extrude
  //   target: The object that limits the extrusion
  //   direction: Extrusion direction
  //   until: Surface selection mode controlling which intersection to stop at

  // A box of the same dimensions and location
  from_bounding_box(bbox: BoundBox | OrientedBoundBox) -> Solid

  // make box
  make_box(length: float, width: float, height: float, plane: Plane = Plane.XY) -> Solid
  //   plane: base plane

  // make cone
  make_cone(base_radius: float, top_radius: float, height: float, plane: Plane = Plane.XY, angle: float = 360) -> Solid
  //   plane: base plane
  //   angle: arc size

  // make cylinder
  make_cylinder(radius: float, height: float, plane: Plane = Plane.XY, angle: float = 360) -> Solid
  //   plane: base plane
  //   angle: arc size

  // make loft
  make_loft(objs: Iterable[Vertex | Wire], ruled: bool = False) -> Solid
  //   objs: wire perimeters or vertices
  //   ruled: stepped or smooth

  // Sphere
  make_sphere(radius: float, plane: Plane = Plane.XY, angle1: float = -90, angle2: float = 90, angle3: float = 360) -> Solid
  //   plane: base plane
  //   angle1: Defaults to -90
  //   angle2: Defaults to 90
  //   angle3: Defaults to 360

  // make torus
  make_torus(major_radius: float, minor_radius: float, plane: Plane = Plane.XY, start_angle: float = 0, end_angle: float = 360, major_angle: float = 360) -> Solid
  //   plane: base plane
  //   start_angle: start major arc
  //   end_angle: end major arc

  // Make a wedge
  make_wedge(delta_x: float, delta_y: float, delta_z: float, min_x: float, min_z: float, max_x: float, max_z: float, plane: Plane = Plane.XY) -> Solid
  //   plane: base plane

  // Revolve
  revolve(section: Face | Wire, angle: float, axis: Axis, inner_wires: list[Wire] | None = None) -> Solid
  //   section: cross section
  //   angle: the angle to revolve through
  //   axis: rotation Axis
  //   inner_wires: holes - only used if section is of type Wire

  // Sweep
  sweep(section: Face | Wire, path: Wire | Edge, inner_wires: list[Wire] | None = None, make_solid: bool = True, is_frenet: bool = False, mode: Vector | Wire | Edge | None = None, transition: Transition = Transition.TRANSFORMED) -> Solid
  //   section: cross section to sweep
  //   path: sweep path
  //   inner_wires: holes - only used if section is a wire
  //   make_solid: return Solid or Shell
  //   is_frenet: Frenet mode
  //   mode: additional sweep mode parameters
  //   transition: handling of profile orientation at C1 path discontinuities

  // Multi section sweep
  sweep_multi(profiles: Iterable[Wire | Face], path: Wire | Edge, make_solid: bool = True, is_frenet: bool = False, binormal: Vector | Wire | Edge | None = None) -> Solid
  //   profiles: list of profiles
  //   path: The wire to sweep the face resulting from the wires over
  //   make_solid: Solid or Shell
  //   is_frenet: Select frenet mode
  //   binormal: additional sweep mode parameters

  // Thicken Face or Shell
  thicken(surface: Face | Shell, depth: float, normal_override: VectorLike | None = None) -> Solid
  //   depth: Amount to thicken face(s), can be positive or negative
  //   normal_override: Face only

  // Apply a draft angle to the given faces of the solid
  draft(faces: Iterable[Face], neutral_plane: Plane, angle: float) -> Solid
  //   faces: Faces to which the draft should be applied
  //   neutral_plane: Plane defining the neutral direction and position
  //   angle: Draft angle in degrees
