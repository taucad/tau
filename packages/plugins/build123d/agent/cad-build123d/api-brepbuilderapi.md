# build123d — BRepBuilderAPI

3 top-level symbols. Signatures are verbatim python.

// Category: BRepBuilderAPI
// Provides methods to build faces
BRepBuilderAPI_MakeFace

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> None 2. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None 3. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln) -> None 4. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder) -> None 5. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone) -> None 6. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere) -> None 7. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus) -> None 8. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, TolDegen: float) -> None 9. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, UMin: float, UMax: float, VMin: float, VMax: float) -> None 10. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, UMin: float, UMax: float, VMin: float, VMax: float) -> None 11. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, UMin: float, UMax: float, VMin: float, VMax: float) -> None 12. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, UMin: float, UMax: float, VMin: float, VMax: float) -> None 13. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, UMin: float, UMax: float, VMin: float, VMax: float) -> None 14. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None 15. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire, OnlyPlane: bool = False) -> None 16. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None 17. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None 18. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None 19. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None 20. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None 21. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None 22. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, TolDegen: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire, OnlyPlane: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None

  // Init(*args, **kwargs)
  // Remarks: Overloaded function. 1. Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None Initializes (or reinitializes) the construction of a face by creating a new object which is a copy of the face F, in order to add wires to it, using the function Add. Note: this complete copy of the geometry is only required if you want to work on the geometries of the two faces independently. 2. Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, Bound: bool, TolDegen: float) -> None Initializes (or reinitializes) the construction of a face on the surface S. If Bound is true, a wire is automatically created from the natural bounds of the surface S and added to the face in order to bound it. If Bound is false, no wire is added. This option is used when real bounds are known. These will be added to the face after this initialization, using the function Add. TolDegen parameter is used for resolution of degenerated edges if calculation of natural bounds is turned on. 3. Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None Initializes (or reinitializes) the construction of a face on the surface S, limited in the u parametric direction by the two parameter values UMin and UMax and in the v parametric direction by the two parameter values VMin and VMax. Warning Error returns: - BRepBuilderAPI_ParametersOutOfRange when the parameters given are outside the bounds of the surface or the basis surface of a trimmed surface. TolDegen parameter is used for resolution of degenerated edges.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Init (method)
  Init(*args, **kwargs)
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, Bound: bool, TolDegen: float) -> None
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None

  // Add(self
  // Remarks: Adds the wire W to the constructed face as a hole. Warning W must not cross the other bounds of the face, and all the bounds must define only one area on the surface. (Be careful, however, as this is not checked.) Example // a cylinder gp_Cylinder C = ..; // a wire TopoDS_Wire W = ...; BRepBuilderAPI_MakeFace MF(C); MF.Add(W); TopoDS_Face F = MF;
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Add (method)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None

  // IsDone(self
  // Remarks: Returns true if this algorithm has a valid face.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.IsDone (method)
  IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> bool

  // Error(self
  // Remarks: Returns the construction status BRepBuilderAPI_FaceDone if the face is built, or - another value of the BRepBuilderAPI_FaceError enumeration indicating why the construction failed, in particular when the given parameters are outside the bounds of the surface.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Error (method)
  Error(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_FaceError

  // Face(self
  // Remarks: Returns the constructed face. Exceptions StdFail_NotDone if no face is built.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Face (method)
  Face(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> OCP.OCP.TopoDS.TopoDS_Face

// Category: BRepBuilderAPI
// Describes functions to build polygonal wires
BRepBuilderAPI_MakePolygon

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None 2. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt) -> None 3. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None 4. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, P4: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None 5. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex) -> None 6. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None 7. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, V4: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, P4: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, V4: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None

  // Add(*args, **kwargs)
  // Remarks: Overloaded function. 1. Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P: OCP.OCP.gp.gp_Pnt) -> None 2. Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None Adds the point P or the vertex V at the end of the polygonal wire under construction. A vertex is automatically created on the point P. Warning - When P or V is coincident to the previous vertex, no edge is built. The method Added can be used to test for this. Neither P nor V is checked to verify that it is coincident with another vertex than the last one, of the polygonal wire under construction. It is also possible to add vertices on a closed polygon (built for example by using a constructor which declares the polygon closed, or after the use of the Close function). Consequently, be careful using this function: you might create: - a polygonal wire with two consecutive coincident edges, or - a non manifold polygonal wire. - P or V is not checked to verify if it is coincident with another vertex but the last one, of the polygonal wire under construction. It is also possible to add vertices on a closed polygon (built for example by using a constructor which declares the polygon closed, or after the use of the Close function). Consequently, be careful when using this function: you might create: - a polygonal wire with two consecutive coincident edges, or - a non-manifold polygonal wire.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P: OCP.OCP.gp.gp_Pnt) -> None
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None

  // Added(self
  // Remarks: Returns true if the last vertex added to the constructed polygonal wire is not coincident with the previous one.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Added (method)
  Added(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> bool

  // Close(self
  // Remarks: Closes the polygonal wire under construction. Note - this is equivalent to adding the first vertex to the polygonal wire under construction.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Close (method)
  Close(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None

  // IsDone(self
  // Remarks: Returns true if this algorithm contains a valid polygonal wire (i.e. if there is at least one edge). IsDone returns false if fewer than two vertices have been chained together by this construction algorithm.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.IsDone (method)
  IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> bool

  // FirstVertex(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.FirstVertex (method)
  FirstVertex(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Vertex

  // LastVertex(self
  // Remarks: Returns the first or the last vertex of the polygonal wire under construction. If the constructed polygonal wire is closed, the first and the last vertices are identical.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.LastVertex (method)
  LastVertex(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Vertex

  // Edge(self
  // Remarks: Returns the edge built between the last two points or vertices added to the constructed polygonal wire under construction. Warning If there is only one vertex in the polygonal wire, the result is a null edge.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Edge (method)
  Edge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Edge

  // Wire(self
  // Remarks: Returns the constructed polygonal wire, or the already built part of the polygonal wire under construction. Exceptions StdFail_NotDone if the wire is not built, i.e. if fewer than two vertices have been chained together by this construction algorithm.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Wire (method)
  Wire(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Wire

// Category: BRepBuilderAPI
// Describes functions to build a solid from shells
BRepBuilderAPI_MakeSolid

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> None 2. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_CompSolid) -> None 3. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None 4. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell) -> None 5. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell, S3: OCP.OCP.TopoDS.TopoDS_Shell) -> None 6. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid) -> None 7. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_CompSolid) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell, S3: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None

  // Add(self
  // Remarks: Adds the shell to the current solid. Warning No check is done to verify the conditions of coherence of the resulting solid. In particular, S must not intersect other shells of the solid under construction. Besides, after all shells have been added, one of these shells should constitute the outside skin of the solid. It may be closed (a finite solid) or open (an infinite solid). Other shells form hollows (cavities) in these previous ones. Each must bound a closed volume.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.Add (method)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None

  // IsDone(self
  // Remarks: Returns true if the solid is built. For this class, a solid under construction is always valid. If no shell has been added, it could be a whole-space solid. However, no check was done to verify the conditions of coherence of the resulting solid.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.IsDone (method)
  IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> bool

  // IsDeleted(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.IsDeleted (method)
  IsDeleted(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Solid(self
  // Remarks: Returns the new Solid.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.Solid (method)
  Solid(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> OCP.OCP.TopoDS.TopoDS_Solid
