# smlibpy — mesh

2 top-level symbols. Signatures are verbatim python.

# Category: mesh
# An indexed triangle mesh
# Remarks: Attributes: vertices: ``(n, 3)`` float array of positions. triangles: ``(m, 3)`` int array of vertex indices (counterclockwise seen from outside). normals: optional ``(m, 3, 3)`` corner normals (one per triangle corner), used for shading crisp CAD edges.
# smlibpy.mesh.Mesh (class)
class Mesh

  # smlibpy.mesh.Mesh.__init__ (constructor)
  Mesh(vertices: Any, triangles: Any, normals: Any = None, _poly: PolyHandle | None = None)

  triangle_normals: np.ndarray

  area: float

  # Enclosed volume (meaningful for closed meshes)
  volume: float

  # smlibpy.mesh.Mesh.bbox (method)
  bbox() -> BoundBox

  # smlibpy.mesh.Mesh.center (method)
  center() -> Vector

  # Where a ray meets the mesh's triangles, nearest first (``Hit``
  # Remarks: the start, the triangle's normal and its index ``triangle``). As :meth:`Part.raycast`, on the triangles instead of the exact faces.
  # smlibpy.mesh.Mesh.raycast (method)
  raycast(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> list[Hit]

  # True if every edge of the mesh is shared by exactly two triangles (a watertight mesh)
  # smlibpy.mesh.Mesh.is_closed (method)
  is_closed() -> bool

  # smlibpy.mesh.Mesh.__add__ (method)
  __add__(other: Mesh) -> Mesh  # Mesh + other

  # smlibpy.mesh.Mesh.__sub__ (method)
  __sub__(other: Mesh) -> Mesh  # Mesh - other

  # smlibpy.mesh.Mesh.__and__ (method)
  __and__(other: Mesh) -> Mesh  # Mesh & other

  # smlibpy.mesh.Mesh.export (method)
  export(path: str, **kwargs: Any) -> None

# Category: mesh
# Triangulate a shape
# smlibpy.mesh.tessellate (function)
tessellate(shape: 'Shape', tolerance: float | None = None, angle: float = 15.0) -> Mesh
