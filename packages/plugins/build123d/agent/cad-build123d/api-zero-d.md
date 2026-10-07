# build123d — zero_d

2 top-level symbols. Signatures are verbatim python.

# Category: zero_d
# A Vertex in build123d represents a zero-dimensional point in the topological
# Remarks: data structure. It marks the endpoints of edges within a 3D model, defining precise locations in space. Vertices play a crucial role in defining the geometry of objects and the connectivity between edges, facilitating accurate representation and manipulation of 3D shapes. They hold coordinate information and are essential for constructing complex structures like wires, faces, and solids.
# build123d.topology.zero_d.Vertex (class)
class Vertex(Shape)

  # build123d.topology.zero_d.Vertex.__init__ (constructor)
  Vertex()
  Vertex(ocp_vx: TopoDS_Vertex)
  Vertex(X: float, Y: float, Z: float)
  Vertex(v: Iterable[float])

  # volume - the volume of this Vertex, which is always zero
  volume: float

  # Returns the right type of wrapper, given a OCCT object
  # build123d.topology.zero_d.Vertex.cast (method)
  cast(obj: TopoDS_Shape) -> Self

  # extrude - invalid operation for Vertex
  # build123d.topology.zero_d.Vertex.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Vertex

  # Add
  # Remarks: Add to a Vertex with a Vertex, Vector or Tuple Returns: Result Example: part.faces(">z").vertices("<y and <x").val() + (0, 0, 15) which creates a new Vertex 15 above one extracted from a part. One can add or subtract a `Vertex` , `Vector` or `tuple` of float values to a Vertex.
  # Throws: TypeError: other not in [Tuple,Vector,Vertex]
  # build123d.topology.zero_d.Vertex.__add__ (method)
  __add__(other: Vertex | Vector | tuple[float, float, float]) -> Vertex  # Vertex + other
  #   other: Value to add

  # intersect operator +
  # build123d.topology.zero_d.Vertex.__and__ (method)
  __and__(*args, **kwargs)  # Vertex & args

  # Subtract
  # Remarks: Subtract a Vertex with a Vertex, Vector or Tuple from self Returns: Result Example: part.faces(">z").vertices("<y and <x").val() - Vector(10, 0, 0)
  # Throws: TypeError: other not in [Tuple,Vector,Vertex]
  # build123d.topology.zero_d.Vertex.__sub__ (method)
  __sub__(other: Vertex | Vector | tuple) -> Vertex  # Vertex - other
  #   other: Value to add

  # The center of a vertex is itself!
  # build123d.topology.zero_d.Vertex.center (method)
  center() -> Vector

  # split - not implemented
  # build123d.topology.zero_d.Vertex.split (method)
  split(tool: TrimmingTool, keep: Keep = Keep.TOP)

  # Return vertex as three tuple of floats
  # build123d.topology.zero_d.Vertex.to_tuple (method)
  to_tuple() -> tuple[float, float, float]

  # Apply affine transform without changing type
  # Remarks: Transforms a copy of this Vertex by the provided 3D affine transformation matrix. Note that not all transformation are supported - primarily designed for translation and rotation. See :transform_geometry: for more comprehensive transformations. Returns: Vertex: copy of transformed shape with all objects keeping their type
  # build123d.topology.zero_d.Vertex.transform_shape (method)
  transform_shape(t_matrix: Matrix) -> Vertex
  #   t_matrix: affine transformation matrix

  # Return the Vertex
  # build123d.topology.zero_d.Vertex.vertex (method)
  vertex() -> Vertex

  # vertices - all the vertices in this Shape
  # build123d.topology.zero_d.Vertex.vertices (method)
  vertices() -> ShapeList[Vertex]

# Category: zero_d
# Given two edges, find the common vertex
# build123d.topology.zero_d.topo_explore_common_vertex (function)
topo_explore_common_vertex(edge1: Edge | TopoDS_Edge, edge2: Edge | TopoDS_Edge) -> Vertex | None
