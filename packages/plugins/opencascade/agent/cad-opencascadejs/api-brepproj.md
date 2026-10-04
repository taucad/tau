# libcascade — BRepProj

1 top-level symbols. Signatures are verbatim typescript.

BRepProj_Projection: declare class BRepProj_Projection

  // BRepProj_Projection.constructor (constructor)
  constructor(Wire: TopoDS_Shape, Shape: TopoDS_Shape, D: gp_Dir);
  constructor(Wire: TopoDS_Shape, Shape: TopoDS_Shape, P: gp_Pnt);

  // BRepProj_Projection.IsDone (method)
  IsDone(): boolean;

  // BRepProj_Projection.Init (method)
  Init(): void;

  // BRepProj_Projection.More (method)
  More(): boolean;

  // BRepProj_Projection.Next (method)
  Next(): void;

  // BRepProj_Projection.Current (method)
  Current(): TopoDS_Wire;

  // BRepProj_Projection.Shape (method)
  Shape(): TopoDS_Compound;

  // BRepProj_Projection.delete (method)
  delete(): void;

  // BRepProj_Projection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
