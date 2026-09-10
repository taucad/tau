# build123d — HLRBRep

2 top-level symbols. Signatures are verbatim python.

// Inherited from InternalAlgo to provide methods with Shape from TopoDS
HLRBRep_Algo

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None
**init**(self: OCP.OCP.HLRBRep.HLRBRep_Algo, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

// Add(*args, \*\*kwargs)
Add(*args, \*\*kwargs)
Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, SData: OCP.OCP.Standard.Standard_Transient, nbIso: int = 0) -> None
Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, nbIso: int = 0) -> None

// Index(self
Index(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape) -> int

// OutLinedShapeNullify(self
OutLinedShapeNullify(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// DynamicType(self
DynamicType(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> OCP.OCP.Standard.Standard_Type

// A framework for filtering the computation results of an HLRBRep_Algo algorithm by extraction
HLRBRep_HLRToShape

// **init**(self
**init**(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

// VCompound(*args, \*\*kwargs)
VCompound(*args, \*\*kwargs)
VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// Rg1LineVCompound(*args, \*\*kwargs)
Rg1LineVCompound(*args, \*\*kwargs)
Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// RgNLineVCompound(*args, \*\*kwargs)
RgNLineVCompound(*args, \*\*kwargs)
RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// OutLineVCompound(*args, \*\*kwargs)
OutLineVCompound(*args, \*\*kwargs)
OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// OutLineVCompound3d(*args, \*\*kwargs)
OutLineVCompound3d(*args, \*\*kwargs)
OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

// IsoLineVCompound(*args, \*\*kwargs)
IsoLineVCompound(*args, \*\*kwargs)
IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// HCompound(*args, \*\*kwargs)
HCompound(*args, \*\*kwargs)
HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// Rg1LineHCompound(*args, \*\*kwargs)
Rg1LineHCompound(*args, \*\*kwargs)
Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// RgNLineHCompound(*args, \*\*kwargs)
RgNLineHCompound(*args, \*\*kwargs)
RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// OutLineHCompound(*args, \*\*kwargs)
OutLineHCompound(*args, \*\*kwargs)
OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// IsoLineHCompound(*args, \*\*kwargs)
IsoLineHCompound(*args, \*\*kwargs)
IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

// CompoundOfEdges(*args, \*\*kwargs)
CompoundOfEdges(*args, \*\*kwargs)
CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
