# libcascade — BlendFunc (2)

14 top-level symbols. Signatures are verbatim typescript.

BlendFunc_ConstRadInv: declare class BlendFunc_ConstRadInv extends Blend_FuncInv

  constructor

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(R: number, Choix: number): void;
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(R: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_ConstThroat: declare class BlendFunc_ConstThroat extends BlendFunc_GenChamfer

  constructor

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(aThroat: number, argNo1: number, Choix: number): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(aThroat: number, argNo1: number, Choix: number): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(aThroat: number, argNo1: number, Choix: number): void;
  Set(First: number, Last: number): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  PointOnS1(): gp_Pnt;

  PointOnS2(): gp_Pnt;

  IsTangencyPoint(): boolean;

  TangentOnS1(): gp_Vec;

  Tangent2dOnS1(): gp_Vec2d;

  TangentOnS2(): gp_Vec;

  Tangent2dOnS2(): gp_Vec2d;

  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  GetSectionSize(): number;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_ConstThroatInv: declare class BlendFunc_ConstThroatInv extends BlendFunc_GenChamfInv

  constructor

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_ConstThroatWithPenetration: declare class BlendFunc_ConstThroatWithPenetration extends BlendFunc_ConstThroat

  constructor

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  TangentOnS1(): gp_Vec;

  Tangent2dOnS1(): gp_Vec2d;

  TangentOnS2(): gp_Vec;

  Tangent2dOnS2(): gp_Vec2d;

  GetSectionSize(): number;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_ConstThroatWithPenetrationInv: declare class BlendFunc_ConstThroatWithPenetrationInv extends BlendFunc_ConstThroatInv

  constructor

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_Corde: declare class BlendFunc_Corde

  constructor

  SetParam(Param: number): void;

  SetDist(Dist: number): void;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  PointOnS(): gp_Pnt;

  PointOnGuide(): gp_Pnt;

  NPlan(): gp_Vec;

  IsTangencyPoint(): boolean;

  TangentOnS(): gp_Vec;

  Tangent2dOnS(): gp_Vec2d;

  DerFguide(Sol: math_VectorBase_double, DerF: gp_Vec2d): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_EvolRad: declare class BlendFunc_EvolRad extends Blend_Function

  constructor

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

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

  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

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

BlendFunc_EvolRadInv: declare class BlendFunc_EvolRadInv extends Blend_FuncInv

  constructor

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Choix: number): void;
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_GenChamfInv: declare class BlendFunc_GenChamfInv extends Blend_FuncInv

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  NbEquations(): number;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_GenChamfer: declare class BlendFunc_GenChamfer extends Blend_Function

  NbEquations(): number;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  GetMinimalDistance(): number;

  IsRational(): boolean;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_Ruled: declare class BlendFunc_Ruled extends Blend_Function

  constructor

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

  PointOnS1(): gp_Pnt;

  PointOnS2(): gp_Pnt;

  IsTangencyPoint(): boolean;

  TangentOnS1(): gp_Vec;

  Tangent2dOnS1(): gp_Vec2d;

  TangentOnS2(): gp_Vec;

  Tangent2dOnS2(): gp_Vec2d;

  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  GetSection(Param: number, U1: number, V1: number, U2: number, V2: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

  IsRational(): boolean;

  GetSectionSize(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  AxeRot(Prm: number): gp_Ax1;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_RuledInv: declare class BlendFunc_RuledInv extends Blend_FuncInv

  constructor

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_SectionShape: typeof BlendFunc_SectionShape[keyof typeof BlendFunc_SectionShape]

BlendFunc_Tensor: declare class BlendFunc_Tensor

  constructor

  Init(InitialValue: number): void;

  Value(Row: number, Col: number, Mat: number): number;

  ChangeValue(Row: number, Col: number, Mat: number): number;

  Multiply(Right: math_VectorBase_double, Product: math_Matrix): void;

  delete(): void;

  [Symbol.dispose](): void;
