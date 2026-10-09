# libcascade — BlendFunc (2)

5 top-level symbols. Signatures are verbatim typescript.

BlendFunc_GenChamfer: declare class BlendFunc_GenChamfer extends Blend_Function

  // BlendFunc_GenChamfer.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_GenChamfer.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_GenChamfer.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  // BlendFunc_GenChamfer.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_GenChamfer.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_GenChamfer.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BlendFunc_GenChamfer.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_GenChamfer.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_GenChamfer.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_GenChamfer.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_GenChamfer.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_GenChamfer.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_GenChamfer.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_GenChamfer.Section (method)
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  // BlendFunc_GenChamfer.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_GenChamfer.delete (method)
  delete(): void;

  // BlendFunc_GenChamfer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_Ruled: declare class BlendFunc_Ruled extends Blend_Function

  // BlendFunc_Ruled.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_Ruled.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_Ruled.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_Ruled.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_Ruled.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_Ruled.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;

  // BlendFunc_Ruled.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_Ruled.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_Ruled.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_Ruled.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BlendFunc_Ruled.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // BlendFunc_Ruled.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // BlendFunc_Ruled.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_Ruled.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_Ruled.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_Ruled.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_Ruled.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_Ruled.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // BlendFunc_Ruled.GetSection (method)
  GetSection(Param: number, U1: number, V1: number, U2: number, V2: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

  // BlendFunc_Ruled.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_Ruled.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_Ruled.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_Ruled.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_Ruled.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_Ruled.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_Ruled.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_Ruled.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_Ruled.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  // BlendFunc_Ruled.AxeRot (method)
  AxeRot(Prm: number): gp_Ax1;

  // BlendFunc_Ruled.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_Ruled.delete (method)
  delete(): void;

  // BlendFunc_Ruled.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_RuledInv: declare class BlendFunc_RuledInv extends Blend_FuncInv

  // BlendFunc_RuledInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_RuledInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;

  // BlendFunc_RuledInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BlendFunc_RuledInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_RuledInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_RuledInv.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_RuledInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_RuledInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_RuledInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_RuledInv.delete (method)
  delete(): void;

  // BlendFunc_RuledInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_SectionShape: typeof BlendFunc_SectionShape[keyof typeof BlendFunc_SectionShape]

  readonly BlendFunc_Rational: 'BlendFunc_Rational'

  readonly BlendFunc_QuasiAngular: 'BlendFunc_QuasiAngular'

  readonly BlendFunc_Polynomial: 'BlendFunc_Polynomial'

  readonly BlendFunc_Linear: 'BlendFunc_Linear'

BlendFunc_Tensor: declare class BlendFunc_Tensor

  // BlendFunc_Tensor.constructor (constructor)
  constructor(NbRow: number, NbCol: number, NbMat: number);

  // BlendFunc_Tensor.Init (method)
  Init(InitialValue: number): void;

  // BlendFunc_Tensor.Value (method)
  Value(Row: number, Col: number, Mat: number): number;

  // BlendFunc_Tensor.ChangeValue (method)
  ChangeValue(Row: number, Col: number, Mat: number): number;

  // BlendFunc_Tensor.Multiply (method)
  Multiply(Right: math_VectorBase_double, Product: math_Matrix): void;

  // BlendFunc_Tensor.delete (method)
  delete(): void;

  // BlendFunc_Tensor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
