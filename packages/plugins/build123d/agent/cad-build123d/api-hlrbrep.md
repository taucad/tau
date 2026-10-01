# build123d — HLRBRep

2 top-level symbols. Signatures are verbatim python.

// Inherited from InternalAlgo to provide methods with Shape from TopoDS
HLRBRep_Algo

  // __init__(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_Algo.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None
  __init__(self: OCP.OCP.HLRBRep.HLRBRep_Algo, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

  // Add(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_Algo.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, SData: OCP.OCP.Standard.Standard_Transient, nbIso: int = 0) -> None
  Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, nbIso: int = 0) -> None

  // Index(self
  // OCP.OCP.HLRBRep.HLRBRep_Algo.Index (method)
  Index(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape) -> int

  // OutLinedShapeNullify(self
  // OCP.OCP.HLRBRep.HLRBRep_Algo.OutLinedShapeNullify (method)
  OutLinedShapeNullify(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

  // get_type_name_s() -> str
  // OCP.OCP.HLRBRep.HLRBRep_Algo.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.HLRBRep.HLRBRep_Algo.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.HLRBRep.HLRBRep_Algo.DynamicType (method)
  DynamicType(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> OCP.OCP.Standard.Standard_Type

// A framework for filtering the computation results of an HLRBRep_Algo algorithm by extraction
HLRBRep_HLRToShape

  // __init__(self
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.__init__ (constructor)
  __init__(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

  // VCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.VCompound (method)
  VCompound(*args, **kwargs)
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Rg1LineVCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.Rg1LineVCompound (method)
  Rg1LineVCompound(*args, **kwargs)
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // RgNLineVCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.RgNLineVCompound (method)
  RgNLineVCompound(*args, **kwargs)
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // OutLineVCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.OutLineVCompound (method)
  OutLineVCompound(*args, **kwargs)
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // OutLineVCompound3d(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.OutLineVCompound3d (method)
  OutLineVCompound3d(*args, **kwargs)
  OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsoLineVCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.IsoLineVCompound (method)
  IsoLineVCompound(*args, **kwargs)
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // HCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.HCompound (method)
  HCompound(*args, **kwargs)
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Rg1LineHCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.Rg1LineHCompound (method)
  Rg1LineHCompound(*args, **kwargs)
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // RgNLineHCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.RgNLineHCompound (method)
  RgNLineHCompound(*args, **kwargs)
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // OutLineHCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.OutLineHCompound (method)
  OutLineHCompound(*args, **kwargs)
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsoLineHCompound(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.IsoLineHCompound (method)
  IsoLineHCompound(*args, **kwargs)
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // CompoundOfEdges(*args, **kwargs)
  // OCP.OCP.HLRBRep.HLRBRep_HLRToShape.CompoundOfEdges (method)
  CompoundOfEdges(*args, **kwargs)
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
