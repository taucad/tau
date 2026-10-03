# build123d — BRepBuilderAPI (2)

2 top-level symbols. Signatures are verbatim python.

// Category: BRepBuilderAPI
// Provides methods toProvides methods toProvides methods to
BRepBuilderAPI_Sewing

  // __init__(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.__init__ (constructor)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, tolerance: float = 1e-06, option1: bool = True, option2: bool = True, option3: bool = True, option4: bool = False) -> None

  // Init(self
  // Remarks: initialize the parameters if necessary
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Init (method)
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, tolerance: float = 1e-06, option1: bool = True, option2: bool = True, option3: bool = True, option4: bool = False) -> None

  // Load(self
  // Remarks: Loads the context shape.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Load (method)
  Load(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Add(self
  // Remarks: Defines the shapes to be sewed or controlled
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Add (method)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Perform(self
  // Remarks: Computing theProgress - progress indicator of algorithm
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Perform (method)
  Perform(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10eb5e630>) -> None

  // SetContext(self
  // Remarks: set context
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetContext (method)
  SetContext(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theContext: OCP.OCP.BRepTools.BRepTools_ReShape) -> None

  // NbFreeEdges(self
  // Remarks: Gives the number of free edges (edge shared by one face)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbFreeEdges (method)
  NbFreeEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // FreeEdge(self
  // Remarks: Gives each free edge
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.FreeEdge (method)
  FreeEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

  // NbMultipleEdges(self
  // Remarks: Gives the number of multiple edges (edge shared by more than two faces)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbMultipleEdges (method)
  NbMultipleEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // MultipleEdge(self
  // Remarks: Gives each multiple edge
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.MultipleEdge (method)
  MultipleEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

  // NbContigousEdges(self
  // Remarks: Gives the number of contiguous edges (edge shared by two faces)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbContigousEdges (method)
  NbContigousEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // ContigousEdge(self
  // Remarks: Gives each contiguous edge
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.ContigousEdge (method)
  ContigousEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

  // ContigousEdgeCouple(self
  // Remarks: Gives the sections (edge) belonging to a contiguous edge
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.ContigousEdgeCouple (method)
  ContigousEdgeCouple(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopTools.TopTools_ListOfShape

  // IsSectionBound(self
  // Remarks: Indicates if a section is bound (before use SectionToBoundary)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsSectionBound (method)
  IsSectionBound(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, section: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // SectionToBoundary(self
  // Remarks: Gives the original edge (free boundary) which becomes the the section. Remember that sections constitute common edges. This information is important for control because with original edge we can find the surface to which the section is attached.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SectionToBoundary (method)
  SectionToBoundary(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, section: OCP.OCP.TopoDS.TopoDS_Edge) -> OCP.OCP.TopoDS.TopoDS_Edge

  // NbDegeneratedShapes(self
  // Remarks: Gives the number of degenerated shapes
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbDegeneratedShapes (method)
  NbDegeneratedShapes(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // DegeneratedShape(self
  // Remarks: Gives each degenerated shape
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.DegeneratedShape (method)
  DegeneratedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsDegenerated(self
  // Remarks: Indicates if a input shape is degenerated
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsDegenerated (method)
  IsDegenerated(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsModified(self
  // Remarks: Indicates if a input shape has been modified
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsModified (method)
  IsModified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Modified(self
  // Remarks: Gives a modifieded shape
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Modified (method)
  Modified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsModifiedSubShape(self
  // Remarks: Indicates if a input subshape has been modified
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsModifiedSubShape (method)
  IsModifiedSubShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // ModifiedSubShape(self
  // Remarks: Gives a modifieded subshape
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.ModifiedSubShape (method)
  ModifiedSubShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Dump(self
  // Remarks: print the information
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Dump (method)
  Dump(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> None

  // NbDeletedFaces(self
  // Remarks: Gives the number of deleted faces (faces smallest than tolerance)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbDeletedFaces (method)
  NbDeletedFaces(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // DeletedFace(self
  // Remarks: Gives each deleted face
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.DeletedFace (method)
  DeletedFace(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Face

  // WhichFace(self
  // Remarks: Gives a modified shape
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.WhichFace (method)
  WhichFace(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theEdg: OCP.OCP.TopoDS.TopoDS_Edge, index: int = 1) -> OCP.OCP.TopoDS.TopoDS_Face

  // SameParameterMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Gets same parameter mode. 2. SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Gets same parameter mode.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SameParameterMode (method)
  SameParameterMode(*args, **kwargs)
  SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetSameParameterMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None Sets same parameter mode. 2. SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None Sets same parameter mode.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetSameParameterMode (method)
  SetSameParameterMode(*args, **kwargs)
  SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None
  SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None

  // Tolerance(*args, **kwargs)
  // Remarks: Overloaded function. 1. Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float Gives set tolerance. 2. Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float Gives set tolerance.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Tolerance (method)
  Tolerance(*args, **kwargs)
  Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
  Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

  // SetTolerance(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None Sets tolerance 2. SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None Sets tolerance
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetTolerance (method)
  SetTolerance(*args, **kwargs)
  SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None
  SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None

  // MinTolerance(*args, **kwargs)
  // Remarks: Overloaded function. 1. MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float Gives set min tolerance. 2. MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float Gives set min tolerance.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.MinTolerance (method)
  MinTolerance(*args, **kwargs)
  MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
  MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

  // SetMinTolerance(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None Sets min tolerance 2. SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None Sets min tolerance
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetMinTolerance (method)
  SetMinTolerance(*args, **kwargs)
  SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None
  SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None

  // MaxTolerance(*args, **kwargs)
  // Remarks: Overloaded function. 1. MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float Gives set max tolerance 2. MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float Gives set max tolerance
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.MaxTolerance (method)
  MaxTolerance(*args, **kwargs)
  MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
  MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

  // SetMaxTolerance(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None Sets max tolerance. 2. SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None Sets max tolerance.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetMaxTolerance (method)
  SetMaxTolerance(*args, **kwargs)
  SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None
  SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None

  // FaceMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Returns mode for sewing faces By default - true. 2. FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Returns mode for sewing faces By default - true.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.FaceMode (method)
  FaceMode(*args, **kwargs)
  FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetFaceMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None Sets mode for sewing faces By default - true. 2. SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None Sets mode for sewing faces By default - true.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetFaceMode (method)
  SetFaceMode(*args, **kwargs)
  SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None
  SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None

  // FloatingEdgesMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Returns mode for sewing floating edges By default - false. 2. FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Returns mode for sewing floating edges By default - false.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.FloatingEdgesMode (method)
  FloatingEdgesMode(*args, **kwargs)
  FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetFloatingEdgesMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None Sets mode for sewing floating edges By default - false. Returns mode for cutting floating edges By default - false. Sets mode for cutting floating edges By default - false. 2. SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None Sets mode for sewing floating edges By default - false. Returns mode for cutting floating edges By default - false. Sets mode for cutting floating edges By default - false.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetFloatingEdgesMode (method)
  SetFloatingEdgesMode(*args, **kwargs)
  SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None
  SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None

  // LocalTolerancesMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Returns mode for accounting of local tolerances of edges and vertices during of merging. 2. LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Returns mode for accounting of local tolerances of edges and vertices during of merging.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.LocalTolerancesMode (method)
  LocalTolerancesMode(*args, **kwargs)
  LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetLocalTolerancesMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None Sets mode for accounting of local tolerances of edges and vertices during of merging in this case WorkTolerance = myTolerance + tolEdge1+ tolEdg2; 2. SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None Sets mode for accounting of local tolerances of edges and vertices during of merging in this case WorkTolerance = myTolerance + tolEdge1+ tolEdg2;
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetLocalTolerancesMode (method)
  SetLocalTolerancesMode(*args, **kwargs)
  SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None
  SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None

  // SetNonManifoldMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None Sets mode for non-manifold sewing. 2. SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None Sets mode for non-manifold sewing.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetNonManifoldMode (method)
  SetNonManifoldMode(*args, **kwargs)
  SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None
  SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None

  // NonManifoldMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Gets mode for non-manifold sewing. 2. NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool Gets mode for non-manifold sewing.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NonManifoldMode (method)
  NonManifoldMode(*args, **kwargs)
  NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // get_type_name_s() -> str
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // SewedShape(self
  // Remarks: Gives the sewed shape a null shape if nothing constructed may be a face, a shell, a solid or a compound
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SewedShape (method)
  SewedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.TopoDS.TopoDS_Shape

  // GetContext(self
  // Remarks: return context
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.GetContext (method)
  GetContext(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.BRepTools.BRepTools_ReShape

  // DynamicType(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.DynamicType (method)
  DynamicType(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.Standard.Standard_Type

// Category: BRepBuilderAPI
// Geometric transformation on a shape
BRepBuilderAPI_Transform

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, T: OCP.OCP.gp.gp_Trsf) -> None 2. __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTrsf: OCP.OCP.gp.gp_Trsf, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, T: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTrsf: OCP.OCP.gp.gp_Trsf, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None

  // Perform(self
  // Remarks: Applies the geometric transformation defined at the time of construction of this framework to the shape S. - If the transformation T is direct and isometric, in other words, if the determinant of the vectorial part of T is equal to 1., and if theCopyGeom equals false (the default value), the resulting shape is the same as the original but with a new location assigned to it. - In all other cases, the transformation is applied to a duplicate of theShape. - If theCopyMesh is true, the triangulation will be copied, and the copy will be assigned to the result shape. Use the function Shape to access the result. Note: this framework can be reused to apply the same geometric transformation to other shapes. You only need to specify them by calling the function Perform again.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.Perform (method)
  Perform(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None

  // ModifiedShape(self
  // Remarks: Returns the modified shape corresponding to <S>.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.ModifiedShape (method)
  ModifiedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Modified(self
  // Remarks: Returns the list of shapes modified from the shape <S>.
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.Modified (method)
  Modified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopTools.TopTools_ListOfShape
