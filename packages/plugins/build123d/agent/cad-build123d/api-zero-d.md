# build123d — zero_d

2 top-level symbols. Signatures are verbatim python.

// A Vertex in build123d represents a zero-dimensional point in the topological
Vertex

  // build123d.topology.zero_d.Vertex.__init__ (constructor)
  Vertex()
  Vertex(ocp_vx: TopoDS_Vertex)
  Vertex(X: float, Y: float, Z: float)
  Vertex(v: Iterable[float])

  // volume - the volume of this Vertex, which is always zero
  volume: float

  // Returns the right type of wrapper, given a OCCT object
  // build123d.topology.zero_d.Vertex.cast (method)
  cast(obj: TopoDS_Shape) -> Self

  // extrude - invalid operation for Vertex
  // build123d.topology.zero_d.Vertex.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Vertex

  // The center of a vertex is itself!
  // build123d.topology.zero_d.Vertex.center (method)
  center() -> Vector

  // split - not implemented
  // build123d.topology.zero_d.Vertex.split (method)
  split(tool: TrimmingTool, keep: Keep = Keep.TOP)

  // Return vertex as three tuple of floats
  // build123d.topology.zero_d.Vertex.to_tuple (method)
  to_tuple() -> tuple[float, float, float]

  // Apply affine transform without changing type
  // build123d.topology.zero_d.Vertex.transform_shape (method)
  transform_shape(t_matrix: Matrix) -> Vertex
  //   t_matrix: affine transformation matrix

  // Return the Vertex
  // build123d.topology.zero_d.Vertex.vertex (method)
  vertex() -> Vertex

  // vertices - all the vertices in this Shape
  // build123d.topology.zero_d.Vertex.vertices (method)
  vertices() -> ShapeList[Vertex]

// Given two edges, find the common vertex
// build123d.topology.zero_d.topo_explore_common_vertex (function)
topo_explore_common_vertex(edge1: Edge | TopoDS_Edge, edge2: Edge | TopoDS_Edge) -> Vertex | None
