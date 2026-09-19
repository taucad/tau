# libcascade — Blend

7 top-level symbols. Signatures are verbatim typescript.

Blend_AppFunction: declare class Blend_AppFunction extends math_FunctionSetWithDerivatives

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  Pnt1(): gp_Pnt;

  Pnt2(): gp_Pnt;

  IsRational(): boolean;

  GetSectionSize(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  Parameter(P: Blend_Point): number;

  delete(): void;

  [Symbol.dispose](): void;

Blend_CSFunction: declare class Blend_CSFunction extends Blend_AppFunction

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  Pnt1(): gp_Pnt;

  Pnt2(): gp_Pnt;

  PointOnS(): gp_Pnt;

  PointOnC(): gp_Pnt;

  Pnt2d(): gp_Pnt2d;

  ParameterOnC(): number;

  IsTangencyPoint(): boolean;

  TangentOnS(): gp_Vec;

  Tangent2d(): gp_Vec2d;

  TangentOnC(): gp_Vec;

  Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Blend_CurvPointFuncInv: declare class Blend_CurvPointFuncInv extends math_FunctionSetWithDerivatives

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(P: gp_Pnt): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Blend_DecrochStatus: typeof Blend_DecrochStatus[keyof typeof Blend_DecrochStatus]

Blend_FuncInv: declare class Blend_FuncInv extends math_FunctionSetWithDerivatives

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Blend_Function: declare class Blend_Function extends Blend_AppFunction

  NbVariables(): number;

  Pnt1(): gp_Pnt;

  Pnt2(): gp_Pnt;

  PointOnS1(): gp_Pnt;

  PointOnS2(): gp_Pnt;

  IsTangencyPoint(): boolean;

  TangentOnS1(): gp_Vec;

  Tangent2dOnS1(): gp_Vec2d;

  TangentOnS2(): gp_Vec;

  Tangent2dOnS2(): gp_Vec2d;

  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  TwistOnS1(): boolean;

  TwistOnS2(): boolean;

  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Blend_Point: declare class Blend_Point

  constructor

  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;

  SetParameter(Param: number): void;

  Parameter(): number;

  IsTangencyPoint(): boolean;

  PointOnS1(): gp_Pnt;

  PointOnS2(): gp_Pnt;

  ParametersOnS1(U?: number, V?: number): { U: number; V: number };

  ParametersOnS2(U?: number, V?: number): { U: number; V: number };

  TangentOnS1(): gp_Vec;

  TangentOnS2(): gp_Vec;

  Tangent2dOnS1(): gp_Vec2d;

  Tangent2dOnS2(): gp_Vec2d;

  PointOnS(): gp_Pnt;

  PointOnC(): gp_Pnt;

  ParametersOnS(U?: number, V?: number): { U: number; V: number };

  ParameterOnC(): number;

  TangentOnS(): gp_Vec;

  TangentOnC(): gp_Vec;

  Tangent2d(): gp_Vec2d;

  PointOnC1(): gp_Pnt;

  PointOnC2(): gp_Pnt;

  ParameterOnC1(): number;

  ParameterOnC2(): number;

  TangentOnC1(): gp_Vec;

  TangentOnC2(): gp_Vec;

  delete(): void;

  [Symbol.dispose](): void;
