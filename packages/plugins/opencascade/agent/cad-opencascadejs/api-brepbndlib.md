# libcascade — BRepBndLib

1 top-level symbols. Signatures are verbatim typescript.

BRepBndLib: declare class BRepBndLib

  constructor

  static Add(S: TopoDS_Shape, B: Bnd_Box, useTriangulation: boolean): void;

  static AddClose(S: TopoDS_Shape, B: Bnd_Box): void;

  static AddOptimal(S: TopoDS_Shape, B: Bnd_Box, useTriangulation: boolean, useShapeTolerance: boolean): void;

  static AddOBB(theS: TopoDS_Shape, theOBB: Bnd_OBB, theIsTriangulationUsed: boolean, theIsOptimal: boolean, theIsShapeToleranceUsed: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;
