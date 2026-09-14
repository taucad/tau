# libcascade — BRepBlend (2)

9 top-level symbols. Signatures are verbatim typescript.

BRepBlend_RstRstEvolRad: declare class BRepBlend_RstRstEvolRad extends Blend_RstRstFunction

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  PointOnRst1(): gp_Pnt;

  PointOnRst2(): gp_Pnt;

  Pnt2dOnRst1(): gp_Pnt2d;

  Pnt2dOnRst2(): gp_Pnt2d;

  ParameterOnRst1(): number;

  ParameterOnRst2(): number;

  IsTangencyPoint(): boolean;

  TangentOnRst1(): gp_Vec;

  Tangent2dOnRst1(): gp_Vec2d;

  TangentOnRst2(): gp_Vec;

  Tangent2dOnRst2(): gp_Vec2d;

  Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;

  CenterCircleRst1Rst2(PtRst1: gp_Pnt, PtRst2: gp_Pnt, np: gp_Vec, Center: gp_Pnt, VdMed: gp_Vec): boolean;

  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  IsRational(): boolean;

  GetSectionSize(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_RstRstLineBuilder: declare class BRepBlend_RstRstLineBuilder

  constructor

  Perform(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

  PerformFirstSection(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pdep: number, Pmax: number, Soldep: math_VectorBase_double, Tol3d: number, TolGuide: number, RecRst1: boolean, RecP1: boolean, RecRst2: boolean, RecP2: boolean, Psol: number, ParSol: math_VectorBase_double): { returnValue: boolean; Psol: number };

  Complete(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pmin: number): boolean;

  IsDone(): boolean;

  Line(): BRepBlend_Line;

  Decroch1Start(): boolean;

  Decroch1End(): boolean;

  Decroch2Start(): boolean;

  Decroch2End(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfCurvConstRadInv: declare class BRepBlend_SurfCurvConstRadInv extends Blend_SurfCurvFuncInv

  constructor

  Set(R: number, Choix: number): void;
  Set(Rst: Adaptor2d_Curve2d): void;
  Set(R: number, Choix: number): void;
  Set(Rst: Adaptor2d_Curve2d): void;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfCurvEvolRadInv: declare class BRepBlend_SurfCurvEvolRadInv extends Blend_SurfCurvFuncInv

  constructor

  Set(Choix: number): void;
  Set(Rst: Adaptor2d_Curve2d): void;
  Set(Choix: number): void;
  Set(Rst: Adaptor2d_Curve2d): void;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfPointConstRadInv: declare class BRepBlend_SurfPointConstRadInv extends Blend_SurfPointFuncInv

  constructor

  Set(R: number, Choix: number): void;
  Set(P: gp_Pnt): void;
  Set(R: number, Choix: number): void;
  Set(P: gp_Pnt): void;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfPointEvolRadInv: declare class BRepBlend_SurfPointEvolRadInv extends Blend_SurfPointFuncInv

  constructor

  Set(Choix: number): void;
  Set(P: gp_Pnt): void;
  Set(Choix: number): void;
  Set(P: gp_Pnt): void;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfRstConstRad: declare class BRepBlend_SurfRstConstRad extends Blend_SurfRstFunction

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  PointOnS(): gp_Pnt;

  PointOnRst(): gp_Pnt;

  Pnt2dOnS(): gp_Pnt2d;

  Pnt2dOnRst(): gp_Pnt2d;

  ParameterOnRst(): number;

  IsTangencyPoint(): boolean;

  TangentOnS(): gp_Vec;

  Tangent2dOnS(): gp_Vec2d;

  TangentOnRst(): gp_Vec;

  Tangent2dOnRst(): gp_Vec2d;

  Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;

  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  IsRational(): boolean;

  GetSectionSize(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfRstEvolRad: declare class BRepBlend_SurfRstEvolRad extends Blend_SurfRstFunction

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
  Set(First: number, Last: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  PointOnS(): gp_Pnt;

  PointOnRst(): gp_Pnt;

  Pnt2dOnS(): gp_Pnt2d;

  Pnt2dOnRst(): gp_Pnt2d;

  ParameterOnRst(): number;

  IsTangencyPoint(): boolean;

  TangentOnS(): gp_Vec;

  Tangent2dOnS(): gp_Vec2d;

  TangentOnRst(): gp_Vec;

  Tangent2dOnRst(): gp_Vec2d;

  Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;

  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  IsRational(): boolean;

  GetSectionSize(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_SurfRstLineBuilder: declare class BRepBlend_SurfRstLineBuilder

  constructor

  Perform(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, Tol2d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

  PerformFirstSection(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pdep: number, Pmax: number, Soldep: math_VectorBase_double, Tol3d: number, Tol2d: number, TolGuide: number, RecRst: boolean, RecP: boolean, RecS: boolean, Psol: number, ParSol: math_VectorBase_double): { returnValue: boolean; Psol: number };

  Complete(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pmin: number): boolean;

  ArcToRecadre(Sol: math_VectorBase_double, PrevIndex: number, pt2d: gp_Pnt2d, lastpt2d: gp_Pnt2d, ponarc?: number): { returnValue: number; ponarc: number };

  IsDone(): boolean;

  Line(): BRepBlend_Line;

  DecrochStart(): boolean;

  DecrochEnd(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
