# libcascade — HLRAppli

1 top-level symbols. Signatures are verbatim typescript.

HLRAppli_ReflectLines: declare class HLRAppli_ReflectLines

  // HLRAppli_ReflectLines.constructor (constructor)
  constructor(aShape: TopoDS_Shape);

  // HLRAppli_ReflectLines.SetAxes (method)
  SetAxes(Nx: number, Ny: number, Nz: number, XAt: number, YAt: number, ZAt: number, XUp: number, YUp: number, ZUp: number): void;

  // HLRAppli_ReflectLines.Perform (method)
  Perform(): void;

  // HLRAppli_ReflectLines.GetResult (method)
  GetResult(): TopoDS_Shape;

  // HLRAppli_ReflectLines.GetCompoundOf3dEdges (method)
  GetCompoundOf3dEdges(type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;

  // HLRAppli_ReflectLines.delete (method)
  delete(): void;

  // HLRAppli_ReflectLines.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
