# libcascade — BRepLProp

4 top-level symbols. Signatures are verbatim typescript.

BRepLProp: declare class BRepLProp

  // BRepLProp.constructor (constructor)
  constructor();

  // BRepLProp.Continuity (method)
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number, tl: number, ta: number): GeomAbs_Shape;
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number): GeomAbs_Shape;

  // BRepLProp.delete (method)
  delete(): void;

  // BRepLProp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLProp_CLProps: declare class BRepLProp_CLProps

  // BRepLProp_CLProps.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(C: BRepAdaptor_Curve, N: number, Resolution: number);
  constructor(C: BRepAdaptor_Curve, U: number, N: number, Resolution: number);

  // BRepLProp_CLProps.SetParameter (method)
  SetParameter(U: number): void;

  // BRepLProp_CLProps.SetCurve (method)
  SetCurve(C: BRepAdaptor_Curve): void;

  // BRepLProp_CLProps.Value (method)
  Value(): gp_Pnt;

  // BRepLProp_CLProps.D1 (method)
  D1(): gp_Vec;

  // BRepLProp_CLProps.D2 (method)
  D2(): gp_Vec;

  // BRepLProp_CLProps.D3 (method)
  D3(): gp_Vec;

  // BRepLProp_CLProps.IsTangentDefined (method)
  IsTangentDefined(): boolean;

  // BRepLProp_CLProps.Tangent (method)
  Tangent(D: gp_Dir): void;

  // BRepLProp_CLProps.Curvature (method)
  Curvature(): number;

  // BRepLProp_CLProps.Normal (method)
  Normal(N: gp_Dir): void;

  // BRepLProp_CLProps.CentreOfCurvature (method)
  CentreOfCurvature(P: gp_Pnt): void;

  // BRepLProp_CLProps.delete (method)
  delete(): void;

  // BRepLProp_CLProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLProp_SLProps: declare class BRepLProp_SLProps

  // BRepLProp_SLProps.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(S: BRepAdaptor_Surface, N: number, Resolution: number);
  constructor(S: BRepAdaptor_Surface, U: number, V: number, N: number, Resolution: number);

  // BRepLProp_SLProps.SetSurface (method)
  SetSurface(S: BRepAdaptor_Surface): void;

  // BRepLProp_SLProps.SetParameters (method)
  SetParameters(U: number, V: number): void;

  // BRepLProp_SLProps.Value (method)
  Value(): gp_Pnt;

  // BRepLProp_SLProps.D1U (method)
  D1U(): gp_Vec;

  // BRepLProp_SLProps.D1V (method)
  D1V(): gp_Vec;

  // BRepLProp_SLProps.D2U (method)
  D2U(): gp_Vec;

  // BRepLProp_SLProps.D2V (method)
  D2V(): gp_Vec;

  // BRepLProp_SLProps.DUV (method)
  DUV(): gp_Vec;

  // BRepLProp_SLProps.IsTangentUDefined (method)
  IsTangentUDefined(): boolean;

  // BRepLProp_SLProps.TangentU (method)
  TangentU(D: gp_Dir): void;

  // BRepLProp_SLProps.IsTangentVDefined (method)
  IsTangentVDefined(): boolean;

  // BRepLProp_SLProps.TangentV (method)
  TangentV(D: gp_Dir): void;

  // BRepLProp_SLProps.IsNormalDefined (method)
  IsNormalDefined(): boolean;

  // BRepLProp_SLProps.Normal (method)
  Normal(): gp_Dir;

  // BRepLProp_SLProps.IsCurvatureDefined (method)
  IsCurvatureDefined(): boolean;

  // BRepLProp_SLProps.IsUmbilic (method)
  IsUmbilic(): boolean;

  // BRepLProp_SLProps.MaxCurvature (method)
  MaxCurvature(): number;

  // BRepLProp_SLProps.MinCurvature (method)
  MinCurvature(): number;

  // BRepLProp_SLProps.CurvatureDirections (method)
  CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

  // BRepLProp_SLProps.MeanCurvature (method)
  MeanCurvature(): number;

  // BRepLProp_SLProps.GaussianCurvature (method)
  GaussianCurvature(): number;

  // BRepLProp_SLProps.delete (method)
  delete(): void;

  // BRepLProp_SLProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLProp_SurfaceTool: declare class BRepLProp_SurfaceTool

  // BRepLProp_SurfaceTool.constructor (constructor)
  constructor();

  // BRepLProp_SurfaceTool.Value (method)
  static Value(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt): void;

  // BRepLProp_SurfaceTool.D1 (method)
  static D1(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  // BRepLProp_SurfaceTool.D2 (method)
  static D2(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, DUV: gp_Vec): void;

  // BRepLProp_SurfaceTool.DN (method)
  static DN(S: BRepAdaptor_Surface, U: number, V: number, IU: number, IV: number): gp_Vec;

  // BRepLProp_SurfaceTool.Continuity (method)
  static Continuity(S: BRepAdaptor_Surface): number;

  // BRepLProp_SurfaceTool.Bounds (method)
  static Bounds(S: BRepAdaptor_Surface, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  // BRepLProp_SurfaceTool.delete (method)
  delete(): void;

  // BRepLProp_SurfaceTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
