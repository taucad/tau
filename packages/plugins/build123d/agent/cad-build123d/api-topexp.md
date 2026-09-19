# build123d — TopExp

1 top-level symbols. Signatures are verbatim python.

// An Explorer is a Tool to visit a Topological Data Structure form the TopoDS package
TopExp_Explorer

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TopExp.TopExp_Explorer) -> None
  __init__(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None

  // Init(self
  Init(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None

  // More(self
  More(self: OCP.OCP.TopExp.TopExp_Explorer) -> bool

  // Next(self
  Next(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // ReInit(self
  ReInit(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // Depth(self
  Depth(self: OCP.OCP.TopExp.TopExp_Explorer) -> int

  // Clear(self
  Clear(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // Value(self
  Value(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Current(self
  Current(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape

  // ExploredShape(self
  ExploredShape(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape
