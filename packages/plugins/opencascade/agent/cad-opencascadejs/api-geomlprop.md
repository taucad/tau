# libcascade — GeomLProp

5 top-level symbols. Signatures are verbatim typescript.

GeomLProp: declare class GeomLProp

  // GeomLProp.constructor (constructor)
  constructor();

  // GeomLProp.Continuity (method)
  static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean, tl: number, ta: number): GeomAbs_Shape;
  static Continuity(C1: Geom_Curve, C2: Geom_Curve, u1: number, u2: number, r1: boolean, r2: boolean): GeomAbs_Shape;

  // GeomLProp.delete (method)
  delete(): void;

  // GeomLProp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLProp_CLProps: declare class GeomLProp_CLProps

  // GeomLProp_CLProps.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(C: Geom_Curve, N: number, Resolution: number);
  constructor(C: Geom_Curve, U: number, N: number, Resolution: number);

  // GeomLProp_CLProps.SetParameter (method)
  SetParameter(U: number): void;

  // GeomLProp_CLProps.SetCurve (method)
  SetCurve(C: Geom_Curve): void;

  // GeomLProp_CLProps.Value (method)
  Value(): gp_Pnt;

  // GeomLProp_CLProps.D1 (method)
  D1(): gp_Vec;

  // GeomLProp_CLProps.D2 (method)
  D2(): gp_Vec;

  // GeomLProp_CLProps.D3 (method)
  D3(): gp_Vec;

  // GeomLProp_CLProps.IsTangentDefined (method)
  IsTangentDefined(): boolean;

  // GeomLProp_CLProps.Tangent (method)
  Tangent(D: gp_Dir): void;

  // GeomLProp_CLProps.Curvature (method)
  Curvature(): number;

  // GeomLProp_CLProps.Normal (method)
  Normal(N: gp_Dir): void;

  // GeomLProp_CLProps.CentreOfCurvature (method)
  CentreOfCurvature(P: gp_Pnt): void;

  // GeomLProp_CLProps.delete (method)
  delete(): void;

  // GeomLProp_CLProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLProp_CLProps2d: declare class GeomLProp_CLProps2d

  // GeomLProp_CLProps2d.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(C: Geom2d_Curve, N: number, Resolution: number);
  constructor(C: Geom2d_Curve, U: number, N: number, Resolution: number);

  // GeomLProp_CLProps2d.SetParameter (method)
  SetParameter(U: number): void;

  // GeomLProp_CLProps2d.SetCurve (method)
  SetCurve(C: Geom2d_Curve): void;

  // GeomLProp_CLProps2d.Value (method)
  Value(): gp_Pnt2d;

  // GeomLProp_CLProps2d.D1 (method)
  D1(): gp_Vec2d;

  // GeomLProp_CLProps2d.D2 (method)
  D2(): gp_Vec2d;

  // GeomLProp_CLProps2d.D3 (method)
  D3(): gp_Vec2d;

  // GeomLProp_CLProps2d.IsTangentDefined (method)
  IsTangentDefined(): boolean;

  // GeomLProp_CLProps2d.Tangent (method)
  Tangent(D: gp_Dir2d): void;

  // GeomLProp_CLProps2d.Curvature (method)
  Curvature(): number;

  // GeomLProp_CLProps2d.Normal (method)
  Normal(N: gp_Dir2d): void;

  // GeomLProp_CLProps2d.CentreOfCurvature (method)
  CentreOfCurvature(P: gp_Pnt2d): void;

  // GeomLProp_CLProps2d.delete (method)
  delete(): void;

  // GeomLProp_CLProps2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLProp_CurAndInf2d: declare class GeomLProp_CurAndInf2d extends LProp_CurAndInf

  // GeomLProp_CurAndInf2d.constructor (constructor)
  constructor();

  // GeomLProp_CurAndInf2d.Perform (method)
  Perform(C: Geom2d_Curve): void;

  // GeomLProp_CurAndInf2d.PerformCurExt (method)
  PerformCurExt(C: Geom2d_Curve): void;

  // GeomLProp_CurAndInf2d.PerformInf (method)
  PerformInf(C: Geom2d_Curve): void;

  // GeomLProp_CurAndInf2d.IsDone (method)
  IsDone(): boolean;

  // GeomLProp_CurAndInf2d.delete (method)
  delete(): void;

  // GeomLProp_CurAndInf2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLProp_SLProps: declare class GeomLProp_SLProps

  // GeomLProp_SLProps.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(S: Geom_Surface, N: number, Resolution: number);
  constructor(S: Geom_Surface, U: number, V: number, N: number, Resolution: number);

  // GeomLProp_SLProps.SetSurface (method)
  SetSurface(S: Geom_Surface): void;

  // GeomLProp_SLProps.SetParameters (method)
  SetParameters(U: number, V: number): void;

  // GeomLProp_SLProps.Value (method)
  Value(): gp_Pnt;

  // GeomLProp_SLProps.D1U (method)
  D1U(): gp_Vec;

  // GeomLProp_SLProps.D1V (method)
  D1V(): gp_Vec;

  // GeomLProp_SLProps.D2U (method)
  D2U(): gp_Vec;

  // GeomLProp_SLProps.D2V (method)
  D2V(): gp_Vec;

  // GeomLProp_SLProps.DUV (method)
  DUV(): gp_Vec;

  // GeomLProp_SLProps.IsTangentUDefined (method)
  IsTangentUDefined(): boolean;

  // GeomLProp_SLProps.TangentU (method)
  TangentU(D: gp_Dir): void;

  // GeomLProp_SLProps.IsTangentVDefined (method)
  IsTangentVDefined(): boolean;

  // GeomLProp_SLProps.TangentV (method)
  TangentV(D: gp_Dir): void;

  // GeomLProp_SLProps.IsNormalDefined (method)
  IsNormalDefined(): boolean;

  // GeomLProp_SLProps.Normal (method)
  Normal(): gp_Dir;

  // GeomLProp_SLProps.IsCurvatureDefined (method)
  IsCurvatureDefined(): boolean;

  // GeomLProp_SLProps.IsUmbilic (method)
  IsUmbilic(): boolean;

  // GeomLProp_SLProps.MaxCurvature (method)
  MaxCurvature(): number;

  // GeomLProp_SLProps.MinCurvature (method)
  MinCurvature(): number;

  // GeomLProp_SLProps.CurvatureDirections (method)
  CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

  // GeomLProp_SLProps.MeanCurvature (method)
  MeanCurvature(): number;

  // GeomLProp_SLProps.GaussianCurvature (method)
  GaussianCurvature(): number;

  // GeomLProp_SLProps.delete (method)
  delete(): void;

  // GeomLProp_SLProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
