# build123d — three_d

2 top-level symbols. Signatures are verbatim python.

// Category: three_d
// Solid.draft custom exception
DraftAngleError

  // build123d.topology.three_d.DraftAngleError.__init__ (constructor)
  DraftAngleError(message, face = None, problematic_shape = None)

// Category: three_d
// A Solid in build123d represents a three-dimensional solid geometry
// Remarks: in a topological structure. A solid is a closed and bounded volume, enclosing a region in 3D space. It comprises faces, edges, and vertices connected in a well-defined manner. Solid modeling operations, such as Boolean operations (union, intersection, and difference), are often performed on Solid objects to create or modify complex geometries.
Solid

  // Build a solid from an OCCT TopoDS_Shape/TopoDS_Solid
  // build123d.topology.three_d.Solid.__init__ (constructor)
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
  // Remarks: Returns geometry where boundaries contact without interior overlap: - Solid + Solid → Face + Edge + Vertex (all boundary contacts) - Solid + Face/Shell → Face + Edge + Vertex (boundary contacts) - Solid + Edge/Wire → Vertex (edge endpoints on solid boundary) - Solid + Vertex → Vertex if on boundary - Solid + Compound → distributes over compound elements Returns: ShapeList of boundary contact geometry (empty if no contact)
  // build123d.topology.three_d.Solid.touch (method)
  touch(other: Shape, tolerance: float = 1e-06, found_solids: ShapeList | None = None) -> ShapeList[Vertex | Edge | Face]
  //   other: Shape to check boundary contacts with
  //   tolerance: tolerance for contact detection
  //   found_solids: pre-found intersection solids to filter against

  // extrude
  // Remarks: Extrude a Face into a Solid. Returns: Edge: extruded shape
  // Throws: ValueError: Unsupported class
  // Throws: RuntimeError: Generated invalid result
  // build123d.topology.three_d.Solid.extrude (method)
  extrude(obj: Face, direction: VectorLike) -> Solid
  //   direction: direction and magnitude of extrusion

  // Extrude with Rotation
  // Remarks: Creates a 'twisted prism' by extruding, while simultaneously rotating around the extrusion vector. Returns: Solid: extruded object
  // build123d.topology.three_d.Solid.extrude_linear_with_rotation (method)
  extrude_linear_with_rotation(section: Face | Wire, center: VectorLike, normal: VectorLike, angle: float, inner_wires: list[Wire] | None = None) -> Solid
  //   section: cross section
  //   angle: the angle to rotate through while extruding
  //   inner_wires: holes - only used if section is of type Wire

  // Extrude a cross section with a taper
  // Remarks: Extrude a cross section into a prismatic solid in the provided direction. Note that two difference algorithms are used. If direction aligns with the profile normal (which must be positive), the taper is positive and the profile contains no holes the OCP LocOpe_DPrism algorithm is used as it generates the most accurate results. Otherwise, a loft is created between the profile and the profile with a 2D offset set at the appropriate direction. Returns: Solid: extruded cross section
  // build123d.topology.three_d.Solid.extrude_taper (method)
  extrude_taper(profile: Face, direction: VectorLike, taper: float, flip_inner: bool = True) -> Solid
  //   taper: taper angle in degrees
  //   flip_inner: outer and inner geometry have opposite tapers to allow for part extraction when injection molding

  // extrude_until
  // Remarks: Extrude `profile` in the provided `direction` until it encounters a bounding surface on the `target`. The termination surface is chosen according to the `until` option: * ``Until.NEXT`` — Extrude forward until the first intersecting surface. * ``Until.LAST`` — Extrude forward through all intersections, stopping at the farthest surface. * ``Until.PREVIOUS`` — Reverse the extrusion direction and stop at the first intersecting surface behind the profile. * ``Until.FIRST`` — Reverse the direction and stop at the farthest surface behind the profile. When ``Until.PREVIOUS`` or ``Until.FIRST`` are used, the extrusion direction is automatically inverted before execution. Note: The bounding surface on the target must be large enough to completely cover the extruded profile at the contact region. Partial overlaps may yield open or invalid solids. Returns: Solid: The extruded and limited solid.
  // Throws: ValueError: If the provided profile does not intersect the target.
  // build123d.topology.three_d.Solid.extrude_until (method)
  extrude_until(profile: Face, target: Compound | Solid, direction: VectorLike, until: Until = Until.NEXT) -> Solid
  //   profile: The face to extrude
  //   target: The object that limits the extrusion
  //   direction: Extrusion direction
  //   until: Surface selection mode controlling which intersection to stop at

  // A box of the same dimensions and location
  // build123d.topology.three_d.Solid.from_bounding_box (method)
  from_bounding_box(bbox: BoundBox | OrientedBoundBox) -> Solid

  // make box
  // Remarks: Make a box at the origin of plane extending in positive direction of each axis. Returns: Solid: Box
  // build123d.topology.three_d.Solid.make_box (method)
  make_box(length: float, width: float, height: float, plane: Plane = Plane.XY) -> Solid
  //   plane: base plane

  // make cone
  // Remarks: Make a cone with given radii and height Returns: Solid: Full or partial cone
  // build123d.topology.three_d.Solid.make_cone (method)
  make_cone(base_radius: float, top_radius: float, height: float, plane: Plane = Plane.XY, angle: float = 360) -> Solid
  //   plane: base plane
  //   angle: arc size

  // make cylinder
  // Remarks: Make a cylinder with a given radius and height with the base center on plane origin. Returns: Solid: Full or partial cylinder
  // build123d.topology.three_d.Solid.make_cylinder (method)
  make_cylinder(radius: float, height: float, plane: Plane = Plane.XY, angle: float = 360) -> Solid
  //   plane: base plane
  //   angle: arc size

  // make loft
  // Remarks: Makes a loft from a list of wires and vertices. Vertices can appear only at the beginning or end of the list, but cannot appear consecutively within the list nor between wires. Returns: Solid: Lofted object
  // Throws: ValueError: Too few wires
  // build123d.topology.three_d.Solid.make_loft (method)
  make_loft(objs: Iterable[Vertex | Wire], ruled: bool = False) -> Solid
  //   objs: wire perimeters or vertices
  //   ruled: stepped or smooth

  // Sphere
  // Remarks: Make a full or partial sphere - with a given radius center on the origin or plane. Returns: Solid: sphere
  // build123d.topology.three_d.Solid.make_sphere (method)
  make_sphere(radius: float, plane: Plane = Plane.XY, angle1: float = -90, angle2: float = 90, angle3: float = 360) -> Solid
  //   plane: base plane
  //   angle1: Defaults to -90
  //   angle2: Defaults to 90
  //   angle3: Defaults to 360

  // make torus
  // Remarks: Make a torus with a given radii and angles Returns: Solid: Full or partial torus
  // build123d.topology.three_d.Solid.make_torus (method)
  make_torus(major_radius: float, minor_radius: float, plane: Plane = Plane.XY, start_angle: float = 0, end_angle: float = 360, major_angle: float = 360) -> Solid
  //   plane: base plane
  //   start_angle: start major arc
  //   end_angle: end major arc

  // Make a wedge
  // Remarks: Returns: Solid: wedge
  // build123d.topology.three_d.Solid.make_wedge (method)
  make_wedge(delta_x: float, delta_y: float, delta_z: float, min_x: float, min_z: float, max_x: float, max_z: float, plane: Plane = Plane.XY) -> Solid
  //   plane: base plane

  // Revolve
  // Remarks: Revolve a cross section about the given Axis by the given angle. Returns: Solid: the revolved cross section
  // build123d.topology.three_d.Solid.revolve (method)
  revolve(section: Face | Wire, angle: float, axis: Axis, inner_wires: list[Wire] | None = None) -> Solid
  //   section: cross section
  //   angle: the angle to revolve through
  //   axis: rotation Axis
  //   inner_wires: holes - only used if section is of type Wire

  // Sweep
  // Remarks: Sweep the given cross section into a prismatic solid along the provided path The is_frenet parameter controls how the profile orientation changes as it follows along the sweep path. If is_frenet is False, the orientation of the profile is kept consistent from point to point. The resulting shape has the minimum possible twisting. Unintuitively, when a profile is swept along a helix, this results in the orientation of the profile slowly creeping (rotating) as it follows the helix. Setting is_frenet to True prevents this. If is_frenet is True the orientation of the profile is based on the local curvature and tangency vectors of the path. This keeps the orientation of the profile consistent when sweeping along a helix (because the curvature vector of a straight helix always points to its axis). However, when path is not a helix, the resulting shape can have strange looking twists sometimes. For more information, see Frenet Serret formulas http://en.wikipedia.org/wiki/Frenet%E2%80%93Serret_formulas. Returns: Solid: the swept cross section
  // build123d.topology.three_d.Solid.sweep (method)
  sweep(section: Face | Wire, path: Wire | Edge, inner_wires: list[Wire] | None = None, make_solid: bool = True, is_frenet: bool = False, mode: Vector | Wire | Edge | None = None, transition: Transition = Transition.TRANSFORMED) -> Solid
  //   section: cross section to sweep
  //   path: sweep path
  //   inner_wires: holes - only used if section is a wire
  //   make_solid: return Solid or Shell
  //   is_frenet: Frenet mode
  //   mode: additional sweep mode parameters
  //   transition: handling of profile orientation at C1 path discontinuities

  // Multi section sweep
  // Remarks: Sweep through a sequence of profiles following a path. The is_frenet parameter controls how the profile orientation changes as it follows along the sweep path. If is_frenet is False, the orientation of the profile is kept consistent from point to point. The resulting shape has the minimum possible twisting. Unintuitively, when a profile is swept along a helix, this results in the orientation of the profile slowly creeping (rotating) as it follows the helix. Setting is_frenet to True prevents this. If is_frenet is True the orientation of the profile is based on the local curvature and tangency vectors of the path. This keeps the orientation of the profile consistent when sweeping along a helix (because the curvature vector of a straight helix always points to its axis). However, when path is not a helix, the resulting shape can have strange looking twists sometimes. For more information, see Frenet Serret formulas http://en.wikipedia.org/wiki/Frenet%E2%80%93Serret_formulas. Returns: Solid: swept object
  // build123d.topology.three_d.Solid.sweep_multi (method)
  sweep_multi(profiles: Iterable[Wire | Face], path: Wire | Edge, make_solid: bool = True, is_frenet: bool = False, binormal: Vector | Wire | Edge | None = None) -> Solid
  //   profiles: list of profiles
  //   path: The wire to sweep the face resulting from the wires over
  //   make_solid: Solid or Shell
  //   is_frenet: Select frenet mode
  //   binormal: additional sweep mode parameters

  // Thicken Face or Shell
  // Remarks: Create a solid from a potentially non planar face or shell by thickening along the normals. .. image:: thickenFace.png Non-planar faces are thickened both towards and away from the center of the sphere. Returns: Solid: The resulting Solid object
  // Throws: RuntimeError: Opencascade internal failures
  // build123d.topology.three_d.Solid.thicken (method)
  thicken(surface: Face | Shell, depth: float, normal_override: VectorLike | None = None) -> Solid
  //   depth: Amount to thicken face(s), can be positive or negative
  //   normal_override: Face only

  // Apply a draft angle to the given faces of the solid
  // Remarks: Returns: Solid with the specified draft angles applied.
  // Throws: RuntimeError: If draft application fails on any face or during build.
  // build123d.topology.three_d.Solid.draft (method)
  draft(faces: Iterable[Face], neutral_plane: Plane, angle: float) -> Solid
  //   faces: Faces to which the draft should be applied
  //   neutral_plane: Plane defining the neutral direction and position
  //   angle: Draft angle in degrees
