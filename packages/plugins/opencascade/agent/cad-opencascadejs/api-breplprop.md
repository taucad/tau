# libcascade — BRepLProp

4 top-level symbols. Signatures are verbatim typescript.

BRepLProp: declare class BRepLProp

  constructor

  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number, tl: number, ta: number): GeomAbs_Shape;
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number): GeomAbs_Shape;
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number, tl: number, ta: number): GeomAbs_Shape;
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number): GeomAbs_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepLProp_CLProps: declare class BRepLProp_CLProps

  constructor

  SetParameter(U: number): void;

  SetCurve(C: BRepAdaptor_Curve): void;

  Value(): gp_Pnt;

  D1(): gp_Vec;

  D2(): gp_Vec;

  D3(): gp_Vec;

  IsTangentDefined(): boolean;

  Tangent(D: gp_Dir): void;

  Curvature(): number;

  Normal(N: gp_Dir): void;

  CentreOfCurvature(P: gp_Pnt): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepLProp_SLProps: declare class BRepLProp_SLProps

  constructor

  SetSurface(S: BRepAdaptor_Surface): void;

  SetParameters(U: number, V: number): void;

  Value(): gp_Pnt;

  D1U(): gp_Vec;

  D1V(): gp_Vec;

  D2U(): gp_Vec;

  D2V(): gp_Vec;

  DUV(): gp_Vec;

  IsTangentUDefined(): boolean;

  TangentU(D: gp_Dir): void;

  IsTangentVDefined(): boolean;

  TangentV(D: gp_Dir): void;

  IsNormalDefined(): boolean;

  Normal(): gp_Dir;

  IsCurvatureDefined(): boolean;

  IsUmbilic(): boolean;

  MaxCurvature(): number;

  MinCurvature(): number;

  CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

  MeanCurvature(): number;

  GaussianCurvature(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepLProp_SurfaceTool: declare class BRepLProp_SurfaceTool

  constructor

  static Value(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt): void;

  static D1(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  static D2(S: BRepAdaptor_Surface, U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, DUV: gp_Vec): void;

  static DN(S: BRepAdaptor_Surface, U: number, V: number, IU: number, IV: number): gp_Vec;

  static Continuity(S: BRepAdaptor_Surface): number;

  static Bounds(S: BRepAdaptor_Surface, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  delete(): void;

  [Symbol.dispose](): void;
