# libcascade — BlendFunc

8 top-level symbols. Signatures are verbatim typescript.

BlendFunc: declare class BlendFunc

  constructor

  static GetMinimalWeights(SectShape: BlendFunc_SectionShape, TConv: Convert_ParameterisationType, AngleMin: number, AngleMax: number, Weigths: NCollection_Array1_double): void;

  static NextShape(S: GeomAbs_Shape): GeomAbs_Shape;

  static ComputeNormal(Surf: Adaptor3d_Surface, p2d: gp_Pnt2d, Normal: gp_Vec): boolean;

  static ComputeDNormal(Surf: Adaptor3d_Surface, p2d: gp_Pnt2d, Normal: gp_Vec, DNu: gp_Vec, DNv: gp_Vec): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_CSCircular: declare class BlendFunc_CSCircular extends Blend_CSFunction

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  PointOnS(): gp_Pnt;

  PointOnC(): gp_Pnt;

  Pnt2d(): gp_Pnt2d;

  ParameterOnC(): number;

  IsTangencyPoint(): boolean;

  TangentOnS(): gp_Vec;

  Tangent2d(): gp_Vec2d;

  TangentOnC(): gp_Vec;

  Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;

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

  GetSection(Param: number, U: number, V: number, W: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

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

BlendFunc_CSConstRad: declare class BlendFunc_CSConstRad extends Blend_CSFunction

  constructor

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  PointOnS(): gp_Pnt;

  PointOnC(): gp_Pnt;

  Pnt2d(): gp_Pnt2d;

  ParameterOnC(): number;

  IsTangencyPoint(): boolean;

  TangentOnS(): gp_Vec;

  Tangent2d(): gp_Vec2d;

  TangentOnC(): gp_Vec;

  Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;

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

  GetSection(Param: number, U: number, V: number, W: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

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

BlendFunc_ChAsym: declare class BlendFunc_ChAsym extends Blend_Function

  constructor

  NbEquations(): number;

  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Angle: number, Choix: number): void;
  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Angle: number, Choix: number): void;
  Set(Param: number): void;
  Set(First: number, Last: number): void;
  Set(Dist1: number, Angle: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  ComputeValues(X: math_VectorBase_double, DegF: number, DegL: number): boolean;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  PointOnS1(): gp_Pnt;

  PointOnS2(): gp_Pnt;

  IsTangencyPoint(): boolean;

  TangentOnS1(): gp_Vec;

  Tangent2dOnS1(): gp_Vec2d;

  TangentOnS2(): gp_Vec;

  Tangent2dOnS2(): gp_Vec2d;

  TwistOnS1(): boolean;

  TwistOnS2(): boolean;

  Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;

  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
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

BlendFunc_ChAsymInv: declare class BlendFunc_ChAsymInv extends Blend_FuncInv

  constructor

  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Angle: number, Choix: number): void;
  Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
  Set(Dist1: number, Angle: number, Choix: number): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  NbEquations(): number;

  ComputeValues(X: math_VectorBase_double, DegF: number, DegL: number): boolean;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BlendFunc_ChamfInv: declare class BlendFunc_ChamfInv extends BlendFunc_GenChamfInv

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

BlendFunc_Chamfer: declare class BlendFunc_Chamfer extends BlendFunc_GenChamfer

  constructor

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
  Set(First: number, Last: number): void;
  Set(Param: number): void;
  Set(Dist1: number, Dist2: number, Choix: number): void;
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

BlendFunc_ConstRad: declare class BlendFunc_ConstRad extends Blend_Function

  constructor

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;

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

  AxeRot(Prm: number): gp_Ax1;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;
