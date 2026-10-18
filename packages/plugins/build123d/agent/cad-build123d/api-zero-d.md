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

  # mass - the mass of this Vertex, which is always zero
  # build123d.topology.zero_d.Vertex.mass (method)
  mass(mass_unit: Unit = Unit.G, length_unit: Unit = Unit.MM) -> float

  # How the shape this vertex was selected from sits around it
  # Remarks: Selected through a face, as ``face.vertices()`` or ``face.edges()[0].vertices()`` does, the vertex is a corner of that face: ``CONVEX`` at the corner of a plate, ``CONCAVE`` at the corner of a slot or the step in an L, ``SMOOTH`` where two edges meet in line. The corner is read in the face's own parameters, so a corner on a curved face classifies the same way as one on a flat face. Selected straight off a solid or shell, the vertex is classified by the edges meeting there: ``CONVEX`` where every crease is convex, as at the corner of a box, ``CONCAVE`` where every crease is concave, as at the bottom corner of a pocket, and ``SADDLE`` where both kinds meet, as at the inner corner of a step. Smooth edges do not count. See :class:`~build_enums.Convexity`.
  # Throws: ValueError: the vertex has no ``topo_parent``, or its face or edges
  # Throws: cannot be classified - a seam vertex has no single corner in
  # Throws: its face's parameters, for instance
  convexity: Convexity

  # The X coordinate of this Vertex, including its current Location
  X: float

  # The Y coordinate of this Vertex, including its current Location
  Y: float

  # The Z coordinate of this Vertex, including its current Location
  Z: float

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
  vertices(select: Select = Select.ALL) -> ShapeList[Vertex]

# Category: zero_d
# Given two edges, find the common vertex
# build123d.topology.zero_d.topo_explore_common_vertex (function)
topo_explore_common_vertex(edge1: Edge | TopoDS_Edge, edge2: Edge | TopoDS_Edge) -> Vertex | None
