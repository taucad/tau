# build123d — TopExp

1 top-level symbols. Signatures are verbatim python.

// An Explorer is a Tool to visit a Topological Data Structure form the TopoDS package
TopExp_Explorer

  // __init__(*args, **kwargs)
  // OCP.OCP.TopExp.TopExp_Explorer.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TopExp.TopExp_Explorer) -> None
  __init__(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None

  // Init(self
  // OCP.OCP.TopExp.TopExp_Explorer.Init (method)
  Init(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None

  // More(self
  // OCP.OCP.TopExp.TopExp_Explorer.More (method)
  More(self: OCP.OCP.TopExp.TopExp_Explorer) -> bool

  // Next(self
  // OCP.OCP.TopExp.TopExp_Explorer.Next (method)
  Next(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // ReInit(self
  // OCP.OCP.TopExp.TopExp_Explorer.ReInit (method)
  ReInit(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // Depth(self
  // OCP.OCP.TopExp.TopExp_Explorer.Depth (method)
  Depth(self: OCP.OCP.TopExp.TopExp_Explorer) -> int

  // Clear(self
  // OCP.OCP.TopExp.TopExp_Explorer.Clear (method)
  Clear(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // Value(self
  // OCP.OCP.TopExp.TopExp_Explorer.Value (method)
  Value(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Current(self
  // OCP.OCP.TopExp.TopExp_Explorer.Current (method)
  Current(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape

  // ExploredShape(self
  // OCP.OCP.TopExp.TopExp_Explorer.ExploredShape (method)
  ExploredShape(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape
