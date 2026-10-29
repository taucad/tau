# smlibpy — mesh

3 top-level symbols. Signatures are verbatim python.

# Category: mesh
# An indexed triangle mesh
# Remarks: Attributes: vertices: ``(n, 3)`` float array of positions. triangles: ``(m, 3)`` int array of vertex indices (counterclockwise seen from outside). normals: optional ``(m, 3, 3)`` corner normals (one per triangle corner), used for shading crisp CAD edges. A mesh is its arrays: the kernel's mesh it came from is freed once they are copied out, and mesh Booleans build one from the arrays when they need it. :meth:`dispose` frees what a mesh still holds in the kernel at once. The arrays can be changed in place (``m.vertices += (10, 0, 0)``); :meth:`translate`, :meth:`rotate`, :meth:`mirror`, :meth:`scale` and :meth:`moved` return moved copies, as for shapes. Meshes of scans and STL files: :meth:`section` and :meth:`slices` cut them, :meth:`decimate` thins them out, :meth:`fill_holes` and :meth:`repaired` close them, :meth:`mass_properties` measures what they enclose and :meth:`to_part` makes a faceted part of them.
# smlibpy.mesh.Mesh (class)
class Mesh

  # smlibpy.mesh.Mesh.__init__ (constructor)
  Mesh(vertices: Any, triangles: Any, normals: Any = None, _poly: PolyHandle | None = None)

  # The normal (length 1) of every triangle, an (n, 3) array
  # Remarks: of the triangle's corners.
  triangle_normals: np.ndarray

  # The total area of the triangles
  area: float

  # Enclosed volume (meaningful for closed meshes)
  volume: float

  # The box along the axes around the mesh's points
  # smlibpy.mesh.Mesh.bbox (method)
  bbox() -> BoundBox

  # The middle of the bounding box (:attr:`centroid` is the center of mass)
  # smlibpy.mesh.Mesh.center (method)
  center() -> Vector

  # The center of mass of the volume a closed mesh encloses (uniform density)
  # Remarks: :meth:`mass_properties`.
  centroid: Vector

  # Mass, center of mass and inertia tensor of the volume a closed mesh encloses, for a
  # Remarks: uniform ``density`` (as :meth:`Part.mass_properties`, a :class:`MassProperties`). Exact for the triangles: each spans a tetrahedron with a point, and their integrals add up (the divergence theorem). The mesh must be closed and face outward (``ModelingError`` otherwise: close it with :meth:`fill_holes` or :meth:`repaired`); an empty mesh raises ``ValueError``.
  # smlibpy.mesh.Mesh.mass_properties (method)
  mass_properties(density: float = 1.0) -> MassProperties

  # Free the kernel's copy of the mesh now, if it holds one (an internal tessellation can
  # Remarks: keep it). The arrays stay, and the mesh stays usable: a mesh Boolean builds the kernel's mesh from them again.
  # smlibpy.mesh.Mesh.dispose (method)
  dispose() -> None

  # A copy placed by ``location``
  # smlibpy.mesh.Mesh.moved (method)
  moved(location: Location) -> Mesh

  # A copy moved by ``(x, y, z)``
  # smlibpy.mesh.Mesh.translate (method)
  translate(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> Mesh

  # A copy rotated by ``angle`` degrees about ``axis``
  # smlibpy.mesh.Mesh.rotate (method)
  rotate(axis: Axis = Z, angle: float = 0.0) -> Mesh

  # A mirrored copy (reflection in ``plane``, a plane or a planar face
  # Remarks: plane, which flips Y). The triangles keep facing outward.
  # smlibpy.mesh.Mesh.mirror (method)
  mirror(plane: Plane | Face = Plane.XZ) -> Mesh

  # A scaled copy
  # Remarks: them zero (``ValueError``).
  # smlibpy.mesh.Mesh.scale (method)
  scale(factor: float | VectorLike, center: VectorLike = (0, 0, 0)) -> Mesh

  # Where a ray meets the mesh's triangles, nearest first (``Hit``
  # Remarks: the start, the triangle's normal and its index ``triangle``). As :meth:`Part.raycast`, on the triangles instead of the exact faces.
  # smlibpy.mesh.Mesh.raycast (method)
  raycast(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> list[Hit]

  # The first hit of each of many rays, one per ray (``Hit`` or ``None``), not
  # Remarks: :meth:`raycast` many times (which gives every hit of a ray): for each origin, the ``Hit`` that :meth:`raycast` gives first (the point, the distance, the triangle's normal and its index ``triangle``), ``None`` where the ray misses. ``origins`` is an ``(n, 3)`` array or a sequence of points; ``directions`` one direction (a vector or an axis) for all of them, or one each. The kernel's ray tracer sorts the triangles into a grid once per call (0.8 s for 250 000 triangles) and then takes about 0.01 ms a ray, where :meth:`raycast` tests every triangle (36 ms a ray there): give all the rays in one call.
  # smlibpy.mesh.Mesh.raycast_many (method)
  raycast_many(origins: Any, directions: Any) -> list[Hit | None]

  # True if every edge of the mesh is shared by exactly two triangles (a watertight mesh)
  # smlibpy.mesh.Mesh.is_closed (method)
  is_closed() -> bool

  # Where the plane cuts the mesh
  # Remarks: where its triangles cross the plane, chained into loops, the longest first. Of a closed mesh every loop is closed, outer loops counterclockwise seen from the plane's normal and holes clockwise (as the faces of :meth:`Part.section`); an open mesh can give open polylines too. ``make_face(loop)`` makes a face of a closed loop. Points where the cut runs straight on are left out. A plane through a flat part of the mesh (the top face of a box's mesh) cuts it just beside that, on the side where the cut encloses more. Empty where the plane misses the mesh.
  # smlibpy.mesh.Mesh.section (method)
  section(plane: Plane | Face = Plane.XY) -> ShapeList[Wire]

  # Sections (:meth:`section`) across ``axis``, ``step`` apart
  # Remarks: thickness ``step`` from its lowest point along the axis up, each cut in its middle (at ``step / 2``, ``3 * step / 2``, ... above the lowest point; the contours of a printer's layers). Layers whose plane cuts nothing are left out.
  # smlibpy.mesh.Mesh.slices (method)
  slices(step: float, axis: Axis | VectorLike = Z) -> list[ShapeList[Wire]]

  # A mesh with fewer triangles, as near to this one as the kernel's quadric decimation
  # Remarks: (SmPolyDecimate) keeps it: it collapses the edges whose removal changes the shape least first, keeps a closed mesh closed and keeps the border of an open one. Give one of: - ``fraction``: the share of the triangles to remove (``0.9`` leaves a tenth). - ``triangles``: about how many triangles to leave. - ``tolerance``: how far the result may be from this mesh at most. The mesh is decimated step by step while the distance stays within it (measured at the points of both meshes and the middles of their triangles), so this takes a few decimations (seconds for 100 000 triangles). ``feature_angle`` (degrees, 0 to 180): edges where the triangles turn by more than it are features, which the decimation keeps longest, and stay sharp in the result's normals (at each corner the average of the triangles around it, except across such edges). Triangles the decimation leaves folded over (slivers facing against their neighbours) are taken out. ``ModelingError`` if a closed mesh comes back open, or an open mesh with another border (a mesh whose points all lie on its border, such as a tube of long triangles, cannot keep it), and where the kernel collapses the mesh far below the count asked (it does with the long thin triangles of a coarse mesh of a cone: mesh such a part with a larger tolerance instead). The kernel orders equal choices by memory, so the count can differ by a few triangles from run to run.
  # smlibpy.mesh.Mesh.decimate (method)
  decimate(fraction: float | None = None, *, triangles: int | None = None, tolerance: float | None = None, feature_angle: float = 30.0) -> Mesh

  # A copy with every hole closed
  # Remarks: closes on itself, is filled with triangles (the kernel's triangulation of the polygon, also of one that is not flat). The triangles of the mesh stay as they are; the new ones face as the triangles beside them do. See :meth:`repaired`, which also merges points that lie on each other and turns triangles that face the wrong way first.
  # smlibpy.mesh.Mesh.fill_holes (method)
  fill_holes() -> Mesh

  # A repaired copy and what was done
  # Remarks: largest coordinate) are merged, triangles left without an area and repeated ones are left out, triangles are turned to face the way their neighbours face (a closed piece outward), and holes are filled (as :meth:`fill_holes`). Returns ``(mesh, report)``, a :class:`RepairReport` that counts ``merged_vertices``, ``removed_triangles``, ``flipped_triangles``, ``filled_holes``, ``open_holes`` (borders that do not close on themselves, left open) and ``open_edges`` (edges of the result not shared by two triangles: 0 for a closed mesh).
  # smlibpy.mesh.Mesh.repaired (method)
  repaired() -> tuple[Mesh, RepairReport]

  # A faceted part of a closed mesh
  # Remarks: triangles that lie in one plane (the faces of a CAD part's mesh) make one face. Exact Booleans with other parts, sections and STEP files work on it; its faces stay flat (no fillets of curved faces). Booleans get slow as faces add up (a sphere of 14 080 triangles took 40 s to cut by a box), so a mesh that would give more than ``max_faces`` faces raises ``ModelingError``: decimate it first (``mesh.decimate(triangles=2000).to_part()``), or give a larger ``max_faces`` (``0``: no limit). An open mesh raises ``ModelingError`` too (close it with :meth:`fill_holes` or :meth:`repaired`), and so does one whose part is not a valid solid or does not enclose the mesh's volume.
  # smlibpy.mesh.Mesh.to_part (method)
  to_part(max_faces: int = 5000) -> Part

  # smlibpy.mesh.Mesh.__add__ (method)
  __add__(other: Mesh) -> Mesh  # Mesh + other

  # smlibpy.mesh.Mesh.__sub__ (method)
  __sub__(other: Mesh) -> Mesh  # Mesh - other

  # smlibpy.mesh.Mesh.__and__ (method)
  __and__(other: Mesh) -> Mesh  # Mesh & other

  # Write the mesh to a file
  # smlibpy.mesh.Mesh.export (method)
  export(path: str, **kwargs: Any) -> None

# Category: mesh
# What :meth:`Mesh.repaired` did
# Remarks: Attributes: merged_vertices: Points that lay on each other (to 1e-9 of the largest coordinate), merged. removed_triangles: Triangles without an area, and repeated ones, left out. flipped_triangles: Triangles turned to face the way their neighbours face (a closed piece outward). filled_holes: Holes filled (as :meth:`Mesh.fill_holes`). open_holes: Borders that do not close on themselves, left open. open_edges: Edges of the result not shared by two triangles: 0 for a closed mesh.
# smlibpy.mesh.RepairReport (class)
class RepairReport(tuple)

# Category: mesh
# Triangulate a shape
# smlibpy.mesh.tessellate (function)
tessellate(shape: 'Shape', tolerance: float | None = None, angle: float = 15.0, *, max_edge: float | None = None) -> Mesh
