# build123d — zero_d

2 top-level symbols. Signatures are verbatim python.

// Category: zero_d
// A Vertex in build123d represents a zero-dimensional point in the topological
// Remarks: data structure. It marks the endpoints of edges within a 3D model, defining precise locations in space. Vertices play a crucial role in defining the geometry of objects and the connectivity between edges, facilitating accurate representation and manipulation of 3D shapes. They hold coordinate information and are essential for constructing complex structures like wires, faces, and solids.
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
  // Remarks: Transforms a copy of this Vertex by the provided 3D affine transformation matrix. Note that not all transformation are supported - primarily designed for translation and rotation. See :transform_geometry: for more comprehensive transformations. Returns: Vertex: copy of transformed shape with all objects keeping their type
  transform_shape(t_matrix: Matrix) -> Vertex
  //   t_matrix: affine transformation matrix

  // Return the Vertex
  vertex() -> Vertex

  // vertices - all the vertices in this Shape
  vertices() -> ShapeList[Vertex]

// Category: zero_d
// Given two edges, find the common vertex
topo_explore_common_vertex(edge1: Edge | TopoDS_Edge, edge2: Edge | TopoDS_Edge) -> Vertex | None
