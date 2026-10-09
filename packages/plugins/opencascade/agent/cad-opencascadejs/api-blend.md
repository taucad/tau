# libcascade — Blend

12 top-level symbols. Signatures are verbatim typescript.

Blend_AppFunction: declare class Blend_AppFunction extends math_FunctionSetWithDerivatives

  // Blend_AppFunction.NbVariables (method)
  NbVariables(): number;

  // Blend_AppFunction.NbEquations (method)
  NbEquations(): number;

  // Blend_AppFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_AppFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_AppFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_AppFunction.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  // Blend_AppFunction.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // Blend_AppFunction.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_AppFunction.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_AppFunction.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // Blend_AppFunction.Pnt1 (method)
  Pnt1(): gp_Pnt;

  // Blend_AppFunction.Pnt2 (method)
  Pnt2(): gp_Pnt;

  // Blend_AppFunction.IsRational (method)
  IsRational(): boolean;

  // Blend_AppFunction.GetSectionSize (method)
  GetSectionSize(): number;

  // Blend_AppFunction.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // Blend_AppFunction.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Blend_AppFunction.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Blend_AppFunction.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // Blend_AppFunction.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // Blend_AppFunction.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // Blend_AppFunction.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // Blend_AppFunction.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // Blend_AppFunction.Parameter (method)
  Parameter(P: Blend_Point): number;

  // Blend_AppFunction.delete (method)
  delete(): void;

  // Blend_AppFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_CSFunction: declare class Blend_CSFunction extends Blend_AppFunction

  // Blend_CSFunction.NbVariables (method)
  NbVariables(): number;

  // Blend_CSFunction.NbEquations (method)
  NbEquations(): number;

  // Blend_CSFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_CSFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_CSFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_CSFunction.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  // Blend_CSFunction.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // Blend_CSFunction.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_CSFunction.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_CSFunction.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // Blend_CSFunction.Pnt1 (method)
  Pnt1(): gp_Pnt;

  // Blend_CSFunction.Pnt2 (method)
  Pnt2(): gp_Pnt;

  // Blend_CSFunction.PointOnS (method)
  PointOnS(): gp_Pnt;

  // Blend_CSFunction.PointOnC (method)
  PointOnC(): gp_Pnt;

  // Blend_CSFunction.Pnt2d (method)
  Pnt2d(): gp_Pnt2d;

  // Blend_CSFunction.ParameterOnC (method)
  ParameterOnC(): number;

  // Blend_CSFunction.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // Blend_CSFunction.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // Blend_CSFunction.Tangent2d (method)
  Tangent2d(): gp_Vec2d;

  // Blend_CSFunction.TangentOnC (method)
  TangentOnC(): gp_Vec;

  // Blend_CSFunction.Tangent (method)
  Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;

  // Blend_CSFunction.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // Blend_CSFunction.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // Blend_CSFunction.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // Blend_CSFunction.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // Blend_CSFunction.delete (method)
  delete(): void;

  // Blend_CSFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_CurvPointFuncInv: declare class Blend_CurvPointFuncInv extends math_FunctionSetWithDerivatives

  // Blend_CurvPointFuncInv.NbVariables (method)
  NbVariables(): number;

  // Blend_CurvPointFuncInv.NbEquations (method)
  NbEquations(): number;

  // Blend_CurvPointFuncInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_CurvPointFuncInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_CurvPointFuncInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_CurvPointFuncInv.Set (method)
  Set(P: gp_Pnt): void;

  // Blend_CurvPointFuncInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // Blend_CurvPointFuncInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_CurvPointFuncInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_CurvPointFuncInv.delete (method)
  delete(): void;

  // Blend_CurvPointFuncInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_DecrochStatus: typeof Blend_DecrochStatus[keyof typeof Blend_DecrochStatus]

  readonly Blend_NoDecroch: 'Blend_NoDecroch'

  readonly Blend_DecrochRst1: 'Blend_DecrochRst1'

  readonly Blend_DecrochRst2: 'Blend_DecrochRst2'

  readonly Blend_DecrochBoth: 'Blend_DecrochBoth'

Blend_FuncInv: declare class Blend_FuncInv extends math_FunctionSetWithDerivatives

  // Blend_FuncInv.NbVariables (method)
  NbVariables(): number;

  // Blend_FuncInv.NbEquations (method)
  NbEquations(): number;

  // Blend_FuncInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_FuncInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_FuncInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_FuncInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;

  // Blend_FuncInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // Blend_FuncInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_FuncInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_FuncInv.delete (method)
  delete(): void;

  // Blend_FuncInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_Function: declare class Blend_Function extends Blend_AppFunction

  // Blend_Function.NbVariables (method)
  NbVariables(): number;

  // Blend_Function.Pnt1 (method)
  Pnt1(): gp_Pnt;

  // Blend_Function.Pnt2 (method)
  Pnt2(): gp_Pnt;

  // Blend_Function.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // Blend_Function.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // Blend_Function.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // Blend_Function.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // Blend_Function.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // Blend_Function.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // Blend_Function.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // Blend_Function.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // Blend_Function.TwistOnS1 (method)
  TwistOnS1(): boolean;

  // Blend_Function.TwistOnS2 (method)
  TwistOnS2(): boolean;

  // Blend_Function.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // Blend_Function.delete (method)
  delete(): void;

  // Blend_Function.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_Point: declare class Blend_Point

  // Blend_Point.constructor (constructor)
  constructor();
  constructor(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number);
  constructor(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number);
  constructor(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number);
  constructor(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d);
  constructor(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number);
  constructor(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d);
  constructor(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d);
  constructor(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d);

  // Blend_Point.SetValue (method)
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
  SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
  SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;

  // Blend_Point.SetParameter (method)
  SetParameter(Param: number): void;

  // Blend_Point.Parameter (method)
  Parameter(): number;

  // Blend_Point.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // Blend_Point.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // Blend_Point.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // Blend_Point.ParametersOnS1 (method)
  ParametersOnS1(U?: number, V?: number): { U: number; V: number };

  // Blend_Point.ParametersOnS2 (method)
  ParametersOnS2(U?: number, V?: number): { U: number; V: number };

  // Blend_Point.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // Blend_Point.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // Blend_Point.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // Blend_Point.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // Blend_Point.PointOnS (method)
  PointOnS(): gp_Pnt;

  // Blend_Point.PointOnC (method)
  PointOnC(): gp_Pnt;

  // Blend_Point.ParametersOnS (method)
  ParametersOnS(U?: number, V?: number): { U: number; V: number };

  // Blend_Point.ParameterOnC (method)
  ParameterOnC(): number;

  // Blend_Point.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // Blend_Point.TangentOnC (method)
  TangentOnC(): gp_Vec;

  // Blend_Point.Tangent2d (method)
  Tangent2d(): gp_Vec2d;

  // Blend_Point.PointOnC1 (method)
  PointOnC1(): gp_Pnt;

  // Blend_Point.PointOnC2 (method)
  PointOnC2(): gp_Pnt;

  // Blend_Point.ParameterOnC1 (method)
  ParameterOnC1(): number;

  // Blend_Point.ParameterOnC2 (method)
  ParameterOnC2(): number;

  // Blend_Point.TangentOnC1 (method)
  TangentOnC1(): gp_Vec;

  // Blend_Point.TangentOnC2 (method)
  TangentOnC2(): gp_Vec;

  // Blend_Point.delete (method)
  delete(): void;

  // Blend_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_RstRstFunction: declare class Blend_RstRstFunction extends Blend_AppFunction

  // Blend_RstRstFunction.NbVariables (method)
  NbVariables(): number;

  // Blend_RstRstFunction.NbEquations (method)
  NbEquations(): number;

  // Blend_RstRstFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_RstRstFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_RstRstFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_RstRstFunction.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  // Blend_RstRstFunction.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // Blend_RstRstFunction.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_RstRstFunction.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_RstRstFunction.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // Blend_RstRstFunction.Pnt1 (method)
  Pnt1(): gp_Pnt;

  // Blend_RstRstFunction.Pnt2 (method)
  Pnt2(): gp_Pnt;

  // Blend_RstRstFunction.PointOnRst1 (method)
  PointOnRst1(): gp_Pnt;

  // Blend_RstRstFunction.PointOnRst2 (method)
  PointOnRst2(): gp_Pnt;

  // Blend_RstRstFunction.Pnt2dOnRst1 (method)
  Pnt2dOnRst1(): gp_Pnt2d;

  // Blend_RstRstFunction.Pnt2dOnRst2 (method)
  Pnt2dOnRst2(): gp_Pnt2d;

  // Blend_RstRstFunction.ParameterOnRst1 (method)
  ParameterOnRst1(): number;

  // Blend_RstRstFunction.ParameterOnRst2 (method)
  ParameterOnRst2(): number;

  // Blend_RstRstFunction.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // Blend_RstRstFunction.TangentOnRst1 (method)
  TangentOnRst1(): gp_Vec;

  // Blend_RstRstFunction.Tangent2dOnRst1 (method)
  Tangent2dOnRst1(): gp_Vec2d;

  // Blend_RstRstFunction.TangentOnRst2 (method)
  TangentOnRst2(): gp_Vec;

  // Blend_RstRstFunction.Tangent2dOnRst2 (method)
  Tangent2dOnRst2(): gp_Vec2d;

  // Blend_RstRstFunction.Decroch (method)
  Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;

  // Blend_RstRstFunction.IsRational (method)
  IsRational(): boolean;

  // Blend_RstRstFunction.GetSectionSize (method)
  GetSectionSize(): number;

  // Blend_RstRstFunction.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // Blend_RstRstFunction.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Blend_RstRstFunction.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Blend_RstRstFunction.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // Blend_RstRstFunction.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // Blend_RstRstFunction.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // Blend_RstRstFunction.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // Blend_RstRstFunction.delete (method)
  delete(): void;

  // Blend_RstRstFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_Status: typeof Blend_Status[keyof typeof Blend_Status]

  readonly Blend_StepTooLarge: 'Blend_StepTooLarge'

  readonly Blend_StepTooSmall: 'Blend_StepTooSmall'

  readonly Blend_Backward: 'Blend_Backward'

  readonly Blend_SamePoints: 'Blend_SamePoints'

  readonly Blend_OnRst1: 'Blend_OnRst1'

  readonly Blend_OnRst2: 'Blend_OnRst2'

  readonly Blend_OnRst12: 'Blend_OnRst12'

  readonly Blend_OK: 'Blend_OK'

Blend_SurfCurvFuncInv: declare class Blend_SurfCurvFuncInv extends math_FunctionSetWithDerivatives

  // Blend_SurfCurvFuncInv.NbVariables (method)
  NbVariables(): number;

  // Blend_SurfCurvFuncInv.NbEquations (method)
  NbEquations(): number;

  // Blend_SurfCurvFuncInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_SurfCurvFuncInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_SurfCurvFuncInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_SurfCurvFuncInv.Set (method)
  Set(Rst: Adaptor2d_Curve2d): void;

  // Blend_SurfCurvFuncInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // Blend_SurfCurvFuncInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_SurfCurvFuncInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_SurfCurvFuncInv.delete (method)
  delete(): void;

  // Blend_SurfCurvFuncInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_SurfPointFuncInv: declare class Blend_SurfPointFuncInv extends math_FunctionSetWithDerivatives

  // Blend_SurfPointFuncInv.NbVariables (method)
  NbVariables(): number;

  // Blend_SurfPointFuncInv.NbEquations (method)
  NbEquations(): number;

  // Blend_SurfPointFuncInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_SurfPointFuncInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_SurfPointFuncInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_SurfPointFuncInv.Set (method)
  Set(P: gp_Pnt): void;

  // Blend_SurfPointFuncInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // Blend_SurfPointFuncInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_SurfPointFuncInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_SurfPointFuncInv.delete (method)
  delete(): void;

  // Blend_SurfPointFuncInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Blend_SurfRstFunction: declare class Blend_SurfRstFunction extends Blend_AppFunction

  // Blend_SurfRstFunction.NbVariables (method)
  NbVariables(): number;

  // Blend_SurfRstFunction.NbEquations (method)
  NbEquations(): number;

  // Blend_SurfRstFunction.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Blend_SurfRstFunction.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_SurfRstFunction.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Blend_SurfRstFunction.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  // Blend_SurfRstFunction.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // Blend_SurfRstFunction.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // Blend_SurfRstFunction.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // Blend_SurfRstFunction.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // Blend_SurfRstFunction.Pnt1 (method)
  Pnt1(): gp_Pnt;

  // Blend_SurfRstFunction.Pnt2 (method)
  Pnt2(): gp_Pnt;

  // Blend_SurfRstFunction.PointOnS (method)
  PointOnS(): gp_Pnt;

  // Blend_SurfRstFunction.PointOnRst (method)
  PointOnRst(): gp_Pnt;

  // Blend_SurfRstFunction.Pnt2dOnS (method)
  Pnt2dOnS(): gp_Pnt2d;

  // Blend_SurfRstFunction.Pnt2dOnRst (method)
  Pnt2dOnRst(): gp_Pnt2d;

  // Blend_SurfRstFunction.ParameterOnRst (method)
  ParameterOnRst(): number;

  // Blend_SurfRstFunction.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // Blend_SurfRstFunction.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // Blend_SurfRstFunction.Tangent2dOnS (method)
  Tangent2dOnS(): gp_Vec2d;

  // Blend_SurfRstFunction.TangentOnRst (method)
  TangentOnRst(): gp_Vec;

  // Blend_SurfRstFunction.Tangent2dOnRst (method)
  Tangent2dOnRst(): gp_Vec2d;

  // Blend_SurfRstFunction.Decroch (method)
  Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;

  // Blend_SurfRstFunction.IsRational (method)
  IsRational(): boolean;

  // Blend_SurfRstFunction.GetSectionSize (method)
  GetSectionSize(): number;

  // Blend_SurfRstFunction.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // Blend_SurfRstFunction.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Blend_SurfRstFunction.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Blend_SurfRstFunction.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // Blend_SurfRstFunction.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // Blend_SurfRstFunction.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // Blend_SurfRstFunction.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  // Blend_SurfRstFunction.delete (method)
  delete(): void;

  // Blend_SurfRstFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
