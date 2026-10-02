# build123d — TopExp

1 top-level symbols. Signatures are verbatim python.

// Category: TopExp
// An Explorer is a Tool to visit a Topological Data Structure form the TopoDS package
TopExp_Explorer

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.TopExp.TopExp_Explorer) -> None 2. __init__(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.TopExp.TopExp_Explorer) -> None
  __init__(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None

  // Init(self
  // Remarks: Resets this explorer on the shape S. It is initialized to search the shape S, for shapes of type ToFind, that are not part of a shape ToAvoid. If the shape ToAvoid is equal to TopAbs_SHAPE, or if it is the same as, or less complex than, the shape ToFind it has no effect on the search.
  Init(self: OCP.OCP.TopExp.TopExp_Explorer, S: OCP.OCP.TopoDS.TopoDS_Shape, ToFind: OCP.OCP.TopAbs.TopAbs_ShapeEnum, ToAvoid: OCP.OCP.TopAbs.TopAbs_ShapeEnum = <TopAbs_ShapeEnum.TopAbs_SHAPE: 8>) -> None

  // More(self
  // Remarks: Returns True if there are more shapes in the exploration.
  More(self: OCP.OCP.TopExp.TopExp_Explorer) -> bool

  // Next(self
  // Remarks: Moves to the next Shape in the exploration. Exceptions Standard_NoMoreObject if there are no more shapes to explore.
  Next(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // ReInit(self
  // Remarks: Reinitialize the exploration with the original arguments.
  ReInit(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // Depth(self
  // Remarks: Returns the current depth of the exploration. 0 is the shape to explore itself.
  Depth(self: OCP.OCP.TopExp.TopExp_Explorer) -> int

  // Clear(self
  // Remarks: Clears the content of the explorer. It will return False on More().
  Clear(self: OCP.OCP.TopExp.TopExp_Explorer) -> None

  // Value(self
  // Remarks: Returns the current shape in the exploration. Exceptions Standard_NoSuchObject if this explorer has no more shapes to explore.
  Value(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Current(self
  // Remarks: Returns the current shape in the exploration. Exceptions Standard_NoSuchObject if this explorer has no more shapes to explore.
  Current(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape

  // ExploredShape(self
  // Remarks: Return explored shape.
  ExploredShape(self: OCP.OCP.TopExp.TopExp_Explorer) -> OCP.OCP.TopoDS.TopoDS_Shape
