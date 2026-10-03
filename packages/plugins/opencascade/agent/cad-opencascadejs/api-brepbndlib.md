# libcascade — BRepBndLib

1 top-level symbols. Signatures are verbatim typescript.

BRepBndLib: declare class BRepBndLib

  // BRepBndLib.constructor (constructor)
  constructor();

  // BRepBndLib.Add (method)
  static Add(S: TopoDS_Shape, B: Bnd_Box, useTriangulation: boolean): void;

  // BRepBndLib.AddClose (method)
  static AddClose(S: TopoDS_Shape, B: Bnd_Box): void;

  // BRepBndLib.AddOptimal (method)
  static AddOptimal(S: TopoDS_Shape, B: Bnd_Box, useTriangulation: boolean, useShapeTolerance: boolean): void;

  // BRepBndLib.AddOBB (method)
  static AddOBB(theS: TopoDS_Shape, theOBB: Bnd_OBB, theIsTriangulationUsed: boolean, theIsOptimal: boolean, theIsShapeToleranceUsed: boolean): void;

  // BRepBndLib.delete (method)
  delete(): void;

  // BRepBndLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
