# build123d — BRepBuilderAPI

5 top-level symbols. Signatures are verbatim python.

// Provides methods to build faces
BRepBuilderAPI_MakeFace

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, TolDegen: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, UMin: float, UMax: float, VMin: float, VMax: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, UMin: float, UMax: float, VMin: float, VMax: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, UMin: float, UMax: float, VMin: float, VMax: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, UMin: float, UMax: float, VMin: float, VMax: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, UMin: float, UMax: float, VMin: float, VMax: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire, OnlyPlane: bool = False) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None

// Init(*args, \*\*kwargs)
Init(*args, \*\*kwargs)
Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, Bound: bool, TolDegen: float) -> None
Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None

// Add(self
Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None

// IsDone(self
IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> bool

// Error(self
Error(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_FaceError

// Face(self
Face(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> OCP.OCP.TopoDS.TopoDS_Face

// Describes functions to build polygonal wires
BRepBuilderAPI_MakePolygon

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, P4: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, V4: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None

// Add(*args, \*\*kwargs)
Add(*args, \*\*kwargs)
Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P: OCP.OCP.gp.gp_Pnt) -> None
Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None

// Added(self
Added(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> bool

// Close(self
Close(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None

// IsDone(self
IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> bool

// FirstVertex(self
FirstVertex(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Vertex

// LastVertex(self
LastVertex(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Vertex

// Edge(self
Edge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Edge

// Wire(self
Wire(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Wire

// Describes functions to build a solid from shells
BRepBuilderAPI_MakeSolid

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_CompSolid) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell, S3: OCP.OCP.TopoDS.TopoDS_Shell) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None

// Add(self
Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None

// IsDone(self
IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> bool

// IsDeleted(self
IsDeleted(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

// Solid(self
Solid(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> OCP.OCP.TopoDS.TopoDS_Solid

// Provides methods toProvides methods toProvides methods to
BRepBuilderAPI_Sewing

// **init**(self
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, tolerance: float = 1e-06, option1: bool = True, option2: bool = True, option3: bool = True, option4: bool = False) -> None

// Init(self
Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, tolerance: float = 1e-06, option1: bool = True, option2: bool = True, option3: bool = True, option4: bool = False) -> None

// Load(self
Load(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

// Add(self
Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

// Perform(self
Perform(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10eb5e630>) -> None

// SetContext(self
SetContext(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theContext: OCP.OCP.BRepTools.BRepTools_ReShape) -> None

// NbFreeEdges(self
NbFreeEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

// FreeEdge(self
FreeEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

// NbMultipleEdges(self
NbMultipleEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

// MultipleEdge(self
MultipleEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

// NbContigousEdges(self
NbContigousEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

// ContigousEdge(self
ContigousEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

// ContigousEdgeCouple(self
ContigousEdgeCouple(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopTools.TopTools_ListOfShape

// IsSectionBound(self
IsSectionBound(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, section: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

// SectionToBoundary(self
SectionToBoundary(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, section: OCP.OCP.TopoDS.TopoDS_Edge) -> OCP.OCP.TopoDS.TopoDS_Edge

// NbDegeneratedShapes(self
NbDegeneratedShapes(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

// DegeneratedShape(self
DegeneratedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Shape

// IsDegenerated(self
IsDegenerated(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

// IsModified(self
IsModified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

// Modified(self
Modified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// IsModifiedSubShape(self
IsModifiedSubShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

// ModifiedSubShape(self
ModifiedSubShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// Dump(self
Dump(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> None

// NbDeletedFaces(self
NbDeletedFaces(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

// DeletedFace(self
DeletedFace(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Face

// WhichFace(self
WhichFace(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theEdg: OCP.OCP.TopoDS.TopoDS_Edge, index: int = 1) -> OCP.OCP.TopoDS.TopoDS_Face

// SameParameterMode(*args, \*\*kwargs)
SameParameterMode(*args, \*\*kwargs)
SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

// SetSameParameterMode(*args, \*\*kwargs)
SetSameParameterMode(*args, \*\*kwargs)
SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None
SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None

// Tolerance(*args, \*\*kwargs)
Tolerance(*args, \*\*kwargs)
Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

// SetTolerance(*args, \*\*kwargs)
SetTolerance(*args, \*\*kwargs)
SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None
SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None

// MinTolerance(*args, \*\*kwargs)
MinTolerance(*args, \*\*kwargs)
MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

// SetMinTolerance(*args, \*\*kwargs)
SetMinTolerance(*args, \*\*kwargs)
SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None
SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None

// MaxTolerance(*args, \*\*kwargs)
MaxTolerance(*args, \*\*kwargs)
MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

// SetMaxTolerance(*args, \*\*kwargs)
SetMaxTolerance(*args, \*\*kwargs)
SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None
SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None

// FaceMode(*args, \*\*kwargs)
FaceMode(*args, \*\*kwargs)
FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

// SetFaceMode(*args, \*\*kwargs)
SetFaceMode(*args, \*\*kwargs)
SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None
SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None

// FloatingEdgesMode(*args, \*\*kwargs)
FloatingEdgesMode(*args, \*\*kwargs)
FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

// SetFloatingEdgesMode(*args, \*\*kwargs)
SetFloatingEdgesMode(*args, \*\*kwargs)
SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None
SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None

// LocalTolerancesMode(*args, \*\*kwargs)
LocalTolerancesMode(*args, \*\*kwargs)
LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

// SetLocalTolerancesMode(*args, \*\*kwargs)
SetLocalTolerancesMode(*args, \*\*kwargs)
SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None
SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None

// SetNonManifoldMode(*args, \*\*kwargs)
SetNonManifoldMode(*args, \*\*kwargs)
SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None
SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None

// NonManifoldMode(*args, \*\*kwargs)
NonManifoldMode(*args, \*\*kwargs)
NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// SewedShape(self
SewedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.TopoDS.TopoDS_Shape

// GetContext(self
GetContext(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.BRepTools.BRepTools_ReShape

// DynamicType(self
DynamicType(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.Standard.Standard_Type

// Geometric transformation on a shape
BRepBuilderAPI_Transform

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, T: OCP.OCP.gp.gp_Trsf) -> None
**init**(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTrsf: OCP.OCP.gp.gp_Trsf, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None

// Perform(self
Perform(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None

// ModifiedShape(self
ModifiedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// Modified(self
Modified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopTools.TopTools_ListOfShape
