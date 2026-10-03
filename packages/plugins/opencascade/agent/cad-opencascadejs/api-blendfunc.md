# libcascade — BlendFunc

17 top-level symbols. Signatures are verbatim typescript.

BlendFunc: declare class BlendFunc

  // BlendFunc.constructor (constructor)
  constructor();

  // BlendFunc.GetMinimalWeights (method)
  static GetMinimalWeights(SectShape: BlendFunc_SectionShape, TConv: Convert_ParameterisationType, AngleMin: number, AngleMax: number, Weigths: NCollection_Array1_double): void;

  // BlendFunc.NextShape (method)
  static NextShape(S: GeomAbs_Shape): GeomAbs_Shape;

  // BlendFunc.ComputeNormal (method)
  static ComputeNormal(Surf: Adaptor3d_Surface, p2d: gp_Pnt2d, Normal: gp_Vec): boolean;

  // BlendFunc.ComputeDNormal (method)
  static ComputeDNormal(Surf: Adaptor3d_Surface, p2d: gp_Pnt2d, Normal: gp_Vec, DNu: gp_Vec, DNv: gp_Vec): boolean;

  // BlendFunc.delete (method)
  delete(): void;

  // BlendFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_CSCircular: declare class BlendFunc_CSCircular extends Blend_CSFunction

  // BlendFunc_CSCircular.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, CGuide: Adaptor3d_Curve, L: Law_Function);

  // BlendFunc_CSCircular.NbVariables (method)
  NbVariables(): number;

  // BlendFunc_CSCircular.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_CSCircular.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_CSCircular.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_CSCircular.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_CSCircular.Set (method)
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  // BlendFunc_CSCircular.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_CSCircular.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_CSCircular.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_CSCircular.PointOnS (method)
  PointOnS(): gp_Pnt;

  // BlendFunc_CSCircular.PointOnC (method)
  PointOnC(): gp_Pnt;

  // BlendFunc_CSCircular.Pnt2d (method)
  Pnt2d(): gp_Pnt2d;

  // BlendFunc_CSCircular.ParameterOnC (method)
  ParameterOnC(): number;

  // BlendFunc_CSCircular.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_CSCircular.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // BlendFunc_CSCircular.Tangent2d (method)
  Tangent2d(): gp_Vec2d;

  // BlendFunc_CSCircular.TangentOnC (method)
  TangentOnC(): gp_Vec;

  // BlendFunc_CSCircular.Tangent (method)
  Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;

  // BlendFunc_CSCircular.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BlendFunc_CSCircular.GetSection (method)
  GetSection(Param: number, U: number, V: number, W: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

  // BlendFunc_CSCircular.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_CSCircular.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_CSCircular.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_CSCircular.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_CSCircular.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_CSCircular.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_CSCircular.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_CSCircular.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_CSCircular.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_CSCircular.delete (method)
  delete(): void;

  // BlendFunc_CSCircular.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_CSConstRad: declare class BlendFunc_CSConstRad extends Blend_CSFunction

  // BlendFunc_CSConstRad.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, CGuide: Adaptor3d_Curve);

  // BlendFunc_CSConstRad.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_CSConstRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_CSConstRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_CSConstRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_CSConstRad.Set (method)
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  // BlendFunc_CSConstRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_CSConstRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_CSConstRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_CSConstRad.PointOnS (method)
  PointOnS(): gp_Pnt;

  // BlendFunc_CSConstRad.PointOnC (method)
  PointOnC(): gp_Pnt;

  // BlendFunc_CSConstRad.Pnt2d (method)
  Pnt2d(): gp_Pnt2d;

  // BlendFunc_CSConstRad.ParameterOnC (method)
  ParameterOnC(): number;

  // BlendFunc_CSConstRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_CSConstRad.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // BlendFunc_CSConstRad.Tangent2d (method)
  Tangent2d(): gp_Vec2d;

  // BlendFunc_CSConstRad.TangentOnC (method)
  TangentOnC(): gp_Vec;

  // BlendFunc_CSConstRad.Tangent (method)
  Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;

  // BlendFunc_CSConstRad.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BlendFunc_CSConstRad.GetSection (method)
  GetSection(Param: number, U: number, V: number, W: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

  // BlendFunc_CSConstRad.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_CSConstRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_CSConstRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_CSConstRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_CSConstRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_CSConstRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_CSConstRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_CSConstRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_CSConstRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_CSConstRad.delete (method)
  delete(): void;

  // BlendFunc_CSConstRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ChAsym: declare class BlendFunc_ChAsym extends Blend_Function

  // BlendFunc_ChAsym.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ChAsym.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_ChAsym.Set (method)
  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Angle: number, Choix: number): void;

  // BlendFunc_ChAsym.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_ChAsym.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_ChAsym.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ChAsym.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BlendFunc_ChAsym.ComputeValues (method)
  ComputeValues(X: math_VectorBase_double, DegF: number, DegL: number): boolean;

  // BlendFunc_ChAsym.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ChAsym.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ChAsym.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ChAsym.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // BlendFunc_ChAsym.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // BlendFunc_ChAsym.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_ChAsym.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_ChAsym.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_ChAsym.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_ChAsym.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_ChAsym.TwistOnS1 (method)
  TwistOnS1(): boolean;

  // BlendFunc_ChAsym.TwistOnS2 (method)
  TwistOnS2(): boolean;

  // BlendFunc_ChAsym.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // BlendFunc_ChAsym.Section (method)
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BlendFunc_ChAsym.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_ChAsym.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_ChAsym.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_ChAsym.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_ChAsym.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_ChAsym.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_ChAsym.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_ChAsym.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_ChAsym.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_ChAsym.delete (method)
  delete(): void;

  // BlendFunc_ChAsym.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ChAsymInv: declare class BlendFunc_ChAsymInv extends Blend_FuncInv

  // BlendFunc_ChAsymInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ChAsymInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Angle: number, Choix: number): void;

  // BlendFunc_ChAsymInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BlendFunc_ChAsymInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_ChAsymInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ChAsymInv.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_ChAsymInv.ComputeValues (method)
  ComputeValues(X: math_VectorBase_double, DegF: number, DegL: number): boolean;

  // BlendFunc_ChAsymInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ChAsymInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ChAsymInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ChAsymInv.delete (method)
  delete(): void;

  // BlendFunc_ChAsymInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ChamfInv: declare class BlendFunc_ChamfInv extends BlendFunc_GenChamfInv

  // BlendFunc_ChamfInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ChamfInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ChamfInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ChamfInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ChamfInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  // BlendFunc_ChamfInv.delete (method)
  delete(): void;

  // BlendFunc_ChamfInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_Chamfer: declare class BlendFunc_Chamfer extends BlendFunc_GenChamfer

  // BlendFunc_Chamfer.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, CG: Adaptor3d_Curve);

  // BlendFunc_Chamfer.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_Chamfer.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_Chamfer.Set (method)
  Set(Param: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(First: number, Last: number): void;

  // BlendFunc_Chamfer.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_Chamfer.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // BlendFunc_Chamfer.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // BlendFunc_Chamfer.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_Chamfer.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_Chamfer.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_Chamfer.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_Chamfer.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_Chamfer.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // BlendFunc_Chamfer.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_Chamfer.delete (method)
  delete(): void;

  // BlendFunc_Chamfer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ConstRad: declare class BlendFunc_ConstRad extends Blend_Function

  // BlendFunc_ConstRad.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ConstRad.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_ConstRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ConstRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstRad.Set (method)
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  // BlendFunc_ConstRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_ConstRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_ConstRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ConstRad.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BlendFunc_ConstRad.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // BlendFunc_ConstRad.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // BlendFunc_ConstRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_ConstRad.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_ConstRad.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_ConstRad.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_ConstRad.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_ConstRad.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // BlendFunc_ConstRad.TwistOnS1 (method)
  TwistOnS1(): boolean;

  // BlendFunc_ConstRad.TwistOnS2 (method)
  TwistOnS2(): boolean;

  // BlendFunc_ConstRad.Section (method)
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  // BlendFunc_ConstRad.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_ConstRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_ConstRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_ConstRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_ConstRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_ConstRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_ConstRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_ConstRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_ConstRad.AxeRot (method)
  AxeRot(Prm: number): gp_Ax1;

  // BlendFunc_ConstRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_ConstRad.delete (method)
  delete(): void;

  // BlendFunc_ConstRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ConstRadInv: declare class BlendFunc_ConstRadInv extends Blend_FuncInv

  // BlendFunc_ConstRadInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ConstRadInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(R: number, Choix: number): void;

  // BlendFunc_ConstRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BlendFunc_ConstRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_ConstRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ConstRadInv.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_ConstRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ConstRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstRadInv.delete (method)
  delete(): void;

  // BlendFunc_ConstRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ConstThroat: declare class BlendFunc_ConstThroat extends BlendFunc_GenChamfer

  // BlendFunc_ConstThroat.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ConstThroat.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ConstThroat.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstThroat.Set (method)
  Set(Param: number): void;
  Set(aThroat: number, argNo1: number, Choix: number): void;
  Set(First: number, Last: number): void;

  // BlendFunc_ConstThroat.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ConstThroat.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // BlendFunc_ConstThroat.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // BlendFunc_ConstThroat.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_ConstThroat.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_ConstThroat.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_ConstThroat.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_ConstThroat.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_ConstThroat.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // BlendFunc_ConstThroat.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_ConstThroat.delete (method)
  delete(): void;

  // BlendFunc_ConstThroat.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ConstThroatInv: declare class BlendFunc_ConstThroatInv extends BlendFunc_GenChamfInv

  // BlendFunc_ConstThroatInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ConstThroatInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ConstThroatInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ConstThroatInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstThroatInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  // BlendFunc_ConstThroatInv.delete (method)
  delete(): void;

  // BlendFunc_ConstThroatInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ConstThroatWithPenetration: declare class BlendFunc_ConstThroatWithPenetration extends BlendFunc_ConstThroat

  // BlendFunc_ConstThroatWithPenetration.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ConstThroatWithPenetration.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ConstThroatWithPenetration.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstThroatWithPenetration.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ConstThroatWithPenetration.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_ConstThroatWithPenetration.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_ConstThroatWithPenetration.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_ConstThroatWithPenetration.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_ConstThroatWithPenetration.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_ConstThroatWithPenetration.delete (method)
  delete(): void;

  // BlendFunc_ConstThroatWithPenetration.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_ConstThroatWithPenetrationInv: declare class BlendFunc_ConstThroatWithPenetrationInv extends BlendFunc_ConstThroatInv

  // BlendFunc_ConstThroatWithPenetrationInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BlendFunc_ConstThroatWithPenetrationInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_ConstThroatWithPenetrationInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_ConstThroatWithPenetrationInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_ConstThroatWithPenetrationInv.delete (method)
  delete(): void;

  // BlendFunc_ConstThroatWithPenetrationInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_Corde: declare class BlendFunc_Corde

  // BlendFunc_Corde.constructor (constructor)
  constructor(S: Adaptor3d_Surface, CGuide: Adaptor3d_Curve);

  // BlendFunc_Corde.SetParam (method)
  SetParam(Param: number): void;

  // BlendFunc_Corde.SetDist (method)
  SetDist(Dist: number): void;

  // BlendFunc_Corde.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_Corde.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_Corde.PointOnS (method)
  PointOnS(): gp_Pnt;

  // BlendFunc_Corde.PointOnGuide (method)
  PointOnGuide(): gp_Pnt;

  // BlendFunc_Corde.NPlan (method)
  NPlan(): gp_Vec;

  // BlendFunc_Corde.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_Corde.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // BlendFunc_Corde.Tangent2dOnS (method)
  Tangent2dOnS(): gp_Vec2d;

  // BlendFunc_Corde.DerFguide (method)
  DerFguide(Sol: math_VectorBase_double, DerF: gp_Vec2d): void;

  // BlendFunc_Corde.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_Corde.delete (method)
  delete(): void;

  // BlendFunc_Corde.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_EvolRad: declare class BlendFunc_EvolRad extends Blend_Function

  // BlendFunc_EvolRad.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve, Law: Law_Function);

  // BlendFunc_EvolRad.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_EvolRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_EvolRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_EvolRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_EvolRad.Set (method)
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;

  // BlendFunc_EvolRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BlendFunc_EvolRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_EvolRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_EvolRad.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BlendFunc_EvolRad.PointOnS1 (method)
  PointOnS1(): gp_Pnt;

  // BlendFunc_EvolRad.PointOnS2 (method)
  PointOnS2(): gp_Pnt;

  // BlendFunc_EvolRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BlendFunc_EvolRad.TangentOnS1 (method)
  TangentOnS1(): gp_Vec;

  // BlendFunc_EvolRad.Tangent2dOnS1 (method)
  Tangent2dOnS1(): gp_Vec2d;

  // BlendFunc_EvolRad.TangentOnS2 (method)
  TangentOnS2(): gp_Vec;

  // BlendFunc_EvolRad.Tangent2dOnS2 (method)
  Tangent2dOnS2(): gp_Vec2d;

  // BlendFunc_EvolRad.Tangent (method)
  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  // BlendFunc_EvolRad.TwistOnS1 (method)
  TwistOnS1(): boolean;

  // BlendFunc_EvolRad.TwistOnS2 (method)
  TwistOnS2(): boolean;

  // BlendFunc_EvolRad.Section (method)
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  // BlendFunc_EvolRad.IsRational (method)
  IsRational(): boolean;

  // BlendFunc_EvolRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BlendFunc_EvolRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BlendFunc_EvolRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BlendFunc_EvolRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BlendFunc_EvolRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BlendFunc_EvolRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BlendFunc_EvolRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BlendFunc_EvolRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BlendFunc_EvolRad.delete (method)
  delete(): void;

  // BlendFunc_EvolRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_EvolRadInv: declare class BlendFunc_EvolRadInv extends Blend_FuncInv

  // BlendFunc_EvolRadInv.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, C: Adaptor3d_Curve, Law: Law_Function);

  // BlendFunc_EvolRadInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Choix: number): void;

  // BlendFunc_EvolRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BlendFunc_EvolRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_EvolRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BlendFunc_EvolRadInv.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_EvolRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BlendFunc_EvolRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_EvolRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_EvolRadInv.delete (method)
  delete(): void;

  // BlendFunc_EvolRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BlendFunc_GenChamfInv: declare class BlendFunc_GenChamfInv extends Blend_FuncInv

  // BlendFunc_GenChamfInv.Set (method)
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  // BlendFunc_GenChamfInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BlendFunc_GenChamfInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BlendFunc_GenChamfInv.NbEquations (method)
  NbEquations(): number;

  // BlendFunc_GenChamfInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BlendFunc_GenChamfInv.delete (method)
  delete(): void;

  // BlendFunc_GenChamfInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
