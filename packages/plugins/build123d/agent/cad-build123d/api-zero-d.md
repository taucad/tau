# build123d — zero_d

2 top-level symbols. Signatures are verbatim python.

// A Vertex in build123d represents a zero-dimensional point in the topological
Vertex

  Vertex()
  Vertex(ocp_vx: TopoDS_Vertex)
  Vertex(X: float, Y: float, Z: float)
  Vertex(v: Iterable[float])

  // volume - the volume of this Vertex, which is always zero
  volume: float

  // Returns the right type of wrapper, given a OCCT object
  cast(obj: TopoDS_Shape) -> Self

  // extrude - invalid operation for Vertex
  extrude(obj: Shape, direction: VectorLike) -> Vertex

  // The center of a vertex is itself!
  center() -> Vector

  // split - not implemented
  split(tool: TrimmingTool, keep: Keep = Keep.TOP)

  // Return vertex as three tuple of floats
  to_tuple() -> tuple[float, float, float]

  // Apply affine transform without changing type
  transform_shape(t_matrix: Matrix) -> Vertex
  //   t_matrix: affine transformation matrix

  // Return the Vertex
  vertex() -> Vertex

  // vertices - all the vertices in this Shape
  vertices() -> ShapeList[Vertex]

// Given two edges, find the common vertex
topo_explore_common_vertex(edge1: Edge | TopoDS_Edge, edge2: Edge | TopoDS_Edge) -> Vertex | None
