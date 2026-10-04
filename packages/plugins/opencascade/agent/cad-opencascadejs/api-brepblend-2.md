# libcascade — BRepBlend (2)

8 top-level symbols. Signatures are verbatim typescript.

BRepBlend_RstRstLineBuilder: declare class BRepBlend_RstRstLineBuilder

  // BRepBlend_RstRstLineBuilder.constructor (constructor)
  constructor(Surf1: Adaptor3d_Surface, Rst1: Adaptor2d_Curve2d, Domain1: Adaptor3d_TopolTool, Surf2: Adaptor3d_Surface, Rst2: Adaptor2d_Curve2d, Domain2: Adaptor3d_TopolTool);

  // BRepBlend_RstRstLineBuilder.Perform (method)
  Perform(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

  // BRepBlend_RstRstLineBuilder.PerformFirstSection (method)
  PerformFirstSection(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pdep: number, Pmax: number, Soldep: math_VectorBase_double, Tol3d: number, TolGuide: number, RecRst1: boolean, RecP1: boolean, RecRst2: boolean, RecP2: boolean, Psol: number, ParSol: math_VectorBase_double): { returnValue: boolean; Psol: number };

  // BRepBlend_RstRstLineBuilder.Complete (method)
  Complete(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pmin: number): boolean;

  // BRepBlend_RstRstLineBuilder.IsDone (method)
  IsDone(): boolean;

  // BRepBlend_RstRstLineBuilder.Line (method)
  Line(): BRepBlend_Line;

  // BRepBlend_RstRstLineBuilder.Decroch1Start (method)
  Decroch1Start(): boolean;

  // BRepBlend_RstRstLineBuilder.Decroch1End (method)
  Decroch1End(): boolean;

  // BRepBlend_RstRstLineBuilder.Decroch2Start (method)
  Decroch2Start(): boolean;

  // BRepBlend_RstRstLineBuilder.Decroch2End (method)
  Decroch2End(): boolean;

  // BRepBlend_RstRstLineBuilder.delete (method)
  delete(): void;

  // BRepBlend_RstRstLineBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfCurvConstRadInv: declare class BRepBlend_SurfCurvConstRadInv extends Blend_SurfCurvFuncInv

  // BRepBlend_SurfCurvConstRadInv.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, Cg: Adaptor3d_Curve);

  // BRepBlend_SurfCurvConstRadInv.Set (method)
  Set(R: number, Choix: number): void;
  Set(Rst: Adaptor2d_Curve2d): void;

  // BRepBlend_SurfCurvConstRadInv.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_SurfCurvConstRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_SurfCurvConstRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfCurvConstRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfCurvConstRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BRepBlend_SurfCurvConstRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_SurfCurvConstRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_SurfCurvConstRadInv.delete (method)
  delete(): void;

  // BRepBlend_SurfCurvConstRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfCurvEvolRadInv: declare class BRepBlend_SurfCurvEvolRadInv extends Blend_SurfCurvFuncInv

  // BRepBlend_SurfCurvEvolRadInv.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, Cg: Adaptor3d_Curve, Evol: Law_Function);

  // BRepBlend_SurfCurvEvolRadInv.Set (method)
  Set(Choix: number): void;
  Set(Rst: Adaptor2d_Curve2d): void;

  // BRepBlend_SurfCurvEvolRadInv.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_SurfCurvEvolRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_SurfCurvEvolRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfCurvEvolRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfCurvEvolRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BRepBlend_SurfCurvEvolRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_SurfCurvEvolRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_SurfCurvEvolRadInv.delete (method)
  delete(): void;

  // BRepBlend_SurfCurvEvolRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfPointConstRadInv: declare class BRepBlend_SurfPointConstRadInv extends Blend_SurfPointFuncInv

  // BRepBlend_SurfPointConstRadInv.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve);

  // BRepBlend_SurfPointConstRadInv.Set (method)
  Set(R: number, Choix: number): void;
  Set(P: gp_Pnt): void;

  // BRepBlend_SurfPointConstRadInv.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_SurfPointConstRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_SurfPointConstRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfPointConstRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfPointConstRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BRepBlend_SurfPointConstRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_SurfPointConstRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_SurfPointConstRadInv.delete (method)
  delete(): void;

  // BRepBlend_SurfPointConstRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfPointEvolRadInv: declare class BRepBlend_SurfPointEvolRadInv extends Blend_SurfPointFuncInv

  // BRepBlend_SurfPointEvolRadInv.constructor (constructor)
  constructor(S: Adaptor3d_Surface, C: Adaptor3d_Curve, Evol: Law_Function);

  // BRepBlend_SurfPointEvolRadInv.Set (method)
  Set(Choix: number): void;
  Set(P: gp_Pnt): void;

  // BRepBlend_SurfPointEvolRadInv.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_SurfPointEvolRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_SurfPointEvolRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfPointEvolRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfPointEvolRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BRepBlend_SurfPointEvolRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_SurfPointEvolRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_SurfPointEvolRadInv.delete (method)
  delete(): void;

  // BRepBlend_SurfPointEvolRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfRstConstRad: declare class BRepBlend_SurfRstConstRad extends Blend_SurfRstFunction

  // BRepBlend_SurfRstConstRad.constructor (constructor)
  constructor(Surf: Adaptor3d_Surface, SurfRst: Adaptor3d_Surface, Rst: Adaptor2d_Curve2d, CGuide: Adaptor3d_Curve);

  // BRepBlend_SurfRstConstRad.NbVariables (method)
  NbVariables(): number;

  // BRepBlend_SurfRstConstRad.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_SurfRstConstRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_SurfRstConstRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfRstConstRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfRstConstRad.Set (method)
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  // BRepBlend_SurfRstConstRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BRepBlend_SurfRstConstRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_SurfRstConstRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_SurfRstConstRad.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BRepBlend_SurfRstConstRad.PointOnS (method)
  PointOnS(): gp_Pnt;

  // BRepBlend_SurfRstConstRad.PointOnRst (method)
  PointOnRst(): gp_Pnt;

  // BRepBlend_SurfRstConstRad.Pnt2dOnS (method)
  Pnt2dOnS(): gp_Pnt2d;

  // BRepBlend_SurfRstConstRad.Pnt2dOnRst (method)
  Pnt2dOnRst(): gp_Pnt2d;

  // BRepBlend_SurfRstConstRad.ParameterOnRst (method)
  ParameterOnRst(): number;

  // BRepBlend_SurfRstConstRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BRepBlend_SurfRstConstRad.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // BRepBlend_SurfRstConstRad.Tangent2dOnS (method)
  Tangent2dOnS(): gp_Vec2d;

  // BRepBlend_SurfRstConstRad.TangentOnRst (method)
  TangentOnRst(): gp_Vec;

  // BRepBlend_SurfRstConstRad.Tangent2dOnRst (method)
  Tangent2dOnRst(): gp_Vec2d;

  // BRepBlend_SurfRstConstRad.Decroch (method)
  Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;

  // BRepBlend_SurfRstConstRad.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BRepBlend_SurfRstConstRad.IsRational (method)
  IsRational(): boolean;

  // BRepBlend_SurfRstConstRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BRepBlend_SurfRstConstRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BRepBlend_SurfRstConstRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BRepBlend_SurfRstConstRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_SurfRstConstRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BRepBlend_SurfRstConstRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BRepBlend_SurfRstConstRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BRepBlend_SurfRstConstRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BRepBlend_SurfRstConstRad.delete (method)
  delete(): void;

  // BRepBlend_SurfRstConstRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfRstEvolRad: declare class BRepBlend_SurfRstEvolRad extends Blend_SurfRstFunction

  // BRepBlend_SurfRstEvolRad.constructor (constructor)
  constructor(Surf: Adaptor3d_Surface, SurfRst: Adaptor3d_Surface, Rst: Adaptor2d_Curve2d, CGuide: Adaptor3d_Curve, Evol: Law_Function);

  // BRepBlend_SurfRstEvolRad.NbVariables (method)
  NbVariables(): number;

  // BRepBlend_SurfRstEvolRad.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_SurfRstEvolRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_SurfRstEvolRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfRstEvolRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_SurfRstEvolRad.Set (method)
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;

  // BRepBlend_SurfRstEvolRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BRepBlend_SurfRstEvolRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_SurfRstEvolRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_SurfRstEvolRad.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BRepBlend_SurfRstEvolRad.PointOnS (method)
  PointOnS(): gp_Pnt;

  // BRepBlend_SurfRstEvolRad.PointOnRst (method)
  PointOnRst(): gp_Pnt;

  // BRepBlend_SurfRstEvolRad.Pnt2dOnS (method)
  Pnt2dOnS(): gp_Pnt2d;

  // BRepBlend_SurfRstEvolRad.Pnt2dOnRst (method)
  Pnt2dOnRst(): gp_Pnt2d;

  // BRepBlend_SurfRstEvolRad.ParameterOnRst (method)
  ParameterOnRst(): number;

  // BRepBlend_SurfRstEvolRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BRepBlend_SurfRstEvolRad.TangentOnS (method)
  TangentOnS(): gp_Vec;

  // BRepBlend_SurfRstEvolRad.Tangent2dOnS (method)
  Tangent2dOnS(): gp_Vec2d;

  // BRepBlend_SurfRstEvolRad.TangentOnRst (method)
  TangentOnRst(): gp_Vec;

  // BRepBlend_SurfRstEvolRad.Tangent2dOnRst (method)
  Tangent2dOnRst(): gp_Vec2d;

  // BRepBlend_SurfRstEvolRad.Decroch (method)
  Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;

  // BRepBlend_SurfRstEvolRad.Section (method)
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BRepBlend_SurfRstEvolRad.IsRational (method)
  IsRational(): boolean;

  // BRepBlend_SurfRstEvolRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BRepBlend_SurfRstEvolRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BRepBlend_SurfRstEvolRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BRepBlend_SurfRstEvolRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_SurfRstEvolRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BRepBlend_SurfRstEvolRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BRepBlend_SurfRstEvolRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BRepBlend_SurfRstEvolRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BRepBlend_SurfRstEvolRad.delete (method)
  delete(): void;

  // BRepBlend_SurfRstEvolRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_SurfRstLineBuilder: declare class BRepBlend_SurfRstLineBuilder

  // BRepBlend_SurfRstLineBuilder.constructor (constructor)
  constructor(Surf1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Surf2: Adaptor3d_Surface, Rst: Adaptor2d_Curve2d, Domain2: Adaptor3d_TopolTool);

  // BRepBlend_SurfRstLineBuilder.Perform (method)
  Perform(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, Tol2d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

  // BRepBlend_SurfRstLineBuilder.PerformFirstSection (method)
  PerformFirstSection(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pdep: number, Pmax: number, Soldep: math_VectorBase_double, Tol3d: number, Tol2d: number, TolGuide: number, RecRst: boolean, RecP: boolean, RecS: boolean, Psol: number, ParSol: math_VectorBase_double): { returnValue: boolean; Psol: number };

  // BRepBlend_SurfRstLineBuilder.Complete (method)
  Complete(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pmin: number): boolean;

  // BRepBlend_SurfRstLineBuilder.ArcToRecadre (method)
  ArcToRecadre(Sol: math_VectorBase_double, PrevIndex: number, pt2d: gp_Pnt2d, lastpt2d: gp_Pnt2d, ponarc?: number): { returnValue: number; ponarc: number };

  // BRepBlend_SurfRstLineBuilder.IsDone (method)
  IsDone(): boolean;

  // BRepBlend_SurfRstLineBuilder.Line (method)
  Line(): BRepBlend_Line;

  // BRepBlend_SurfRstLineBuilder.DecrochStart (method)
  DecrochStart(): boolean;

  // BRepBlend_SurfRstLineBuilder.DecrochEnd (method)
  DecrochEnd(): boolean;

  // BRepBlend_SurfRstLineBuilder.delete (method)
  delete(): void;

  // BRepBlend_SurfRstLineBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
