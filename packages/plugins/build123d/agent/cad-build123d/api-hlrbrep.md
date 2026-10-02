# build123d — HLRBRep

2 top-level symbols. Signatures are verbatim python.

// Category: HLRBRep
// Inherited from InternalAlgo to provide methods with Shape from TopoDS
HLRBRep_Algo

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

2. __init__(self: OCP.OCP.HLRBRep.HLRBRep_Algo, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None
  __init__(self: OCP.OCP.HLRBRep.HLRBRep_Algo, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

  // Add(*args, **kwargs)
  // Remarks: Overloaded function.

1. Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, SData: OCP.OCP.Standard.Standard_Transient, nbIso: int = 0) -> None

add the Shape <S>.

2. Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, nbIso: int = 0) -> None

Adds the shape S to this framework, and specifies the number of isoparameters nbiso desired in visualizing S. You may add as many shapes as you wish. Use the function Add once for each shape.
  Add(*args, **kwargs)
  Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, SData: OCP.OCP.Standard.Standard_Transient, nbIso: int = 0) -> None
  Add(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape, nbIso: int = 0) -> None

  // Index(self
  // Remarks: return the index of the Shape <S> and return 0 if the Shape <S> is not found.
  Index(self: OCP.OCP.HLRBRep.HLRBRep_Algo, S: OCP.OCP.TopoDS.TopoDS_Shape) -> int

  // OutLinedShapeNullify(self
  // Remarks: nullify all the results of OutLiner from HLRTopoBRep.
  OutLinedShapeNullify(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.HLRBRep.HLRBRep_Algo) -> OCP.OCP.Standard.Standard_Type

// Category: HLRBRep
// A framework for filtering the computation results of an HLRBRep_Algo algorithm by extraction
HLRBRep_HLRToShape

  // __init__(self
  __init__(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, A: OCP.OCP.HLRBRep.HLRBRep_Algo) -> None

  // VCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(*args, **kwargs)
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  VCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Rg1LineVCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(*args, **kwargs)
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // RgNLineVCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(*args, **kwargs)
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // OutLineVCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(*args, **kwargs)
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // OutLineVCompound3d(*args, **kwargs)
  // Remarks: Overloaded function.

1. OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound3d(*args, **kwargs)
  OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineVCompound3d(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsoLineVCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(*args, **kwargs)
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineVCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // HCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(*args, **kwargs)
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  HCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Rg1LineHCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(*args, **kwargs)
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  Rg1LineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // RgNLineHCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(*args, **kwargs)
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  RgNLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // OutLineHCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(*args, **kwargs)
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  OutLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsoLineHCompound(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

2. IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

3. IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape

4. IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(*args, **kwargs)
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape) -> OCP.OCP.TopoDS.TopoDS_Shape
  IsoLineHCompound(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // CompoundOfEdges(*args, **kwargs)
  // Remarks: Overloaded function.

1. CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape

Returns compound of resulting edges of required type and visibility, taking into account the kind of space (2d or 3d)

2. CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape

For specified shape returns compound of resulting edges of required type and visibility, taking into account the kind of space (2d or 3d)

3. CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape

Returns compound of resulting edges of required type and visibility, taking into account the kind of space (2d or 3d)

4. CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape

For specified shape returns compound of resulting edges of required type and visibility, taking into account the kind of space (2d or 3d)
  CompoundOfEdges(*args, **kwargs)
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
  CompoundOfEdges(self: OCP.OCP.HLRBRep.HLRBRep_HLRToShape, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.HLRBRep.HLRBRep_TypeOfResultingEdge, visible: bool, In3d: bool) -> OCP.OCP.TopoDS.TopoDS_Shape
