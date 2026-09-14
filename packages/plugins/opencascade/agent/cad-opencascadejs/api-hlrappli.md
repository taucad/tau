# libcascade — HLRAppli

1 top-level symbols. Signatures are verbatim typescript.

HLRAppli_ReflectLines: declare class HLRAppli_ReflectLines

  constructor

  SetAxes(Nx: number, Ny: number, Nz: number, XAt: number, YAt: number, ZAt: number, XUp: number, YUp: number, ZUp: number): void;

  Perform(): void;

  GetResult(): TopoDS_Shape;

  GetCompoundOf3dEdges(type_: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;
