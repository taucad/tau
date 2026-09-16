# build123d — BRepBndLib

1 top-level symbols. Signatures are verbatim python.

// This package provides the bounding boxes for curves and surfaces from BRepAdaptor
BRepBndLib

  // __init__(self
  __init__(self: OCP.OCP.BRepBndLib.BRepBndLib) -> None

  // Add_s(S
  Add_s(S: OCP.OCP.TopoDS.TopoDS_Shape, B: OCP.OCP.Bnd.Bnd_Box, useTriangulation: bool = True) -> None

  // AddClose_s(S
  AddClose_s(S: OCP.OCP.TopoDS.TopoDS_Shape, B: OCP.OCP.Bnd.Bnd_Box) -> None

  // AddOptimal_s(S
  AddOptimal_s(S: OCP.OCP.TopoDS.TopoDS_Shape, B: OCP.OCP.Bnd.Bnd_Box, useTriangulation: bool = True, useShapeTolerance: bool = False) -> None

  // AddOBB_s(theS
  AddOBB_s(theS: OCP.OCP.TopoDS.TopoDS_Shape, theOBB: OCP.OCP.Bnd.Bnd_OBB, theIsTriangulationUsed: bool = True, theIsOptimal: bool = False, theIsShapeToleranceUsed: bool = True) -> None
