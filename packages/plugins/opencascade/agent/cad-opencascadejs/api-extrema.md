# libcascade — Extrema

22 top-level symbols. Signatures are verbatim typescript.

Extrema_Curve2dTool: declare class Extrema_Curve2dTool

  constructor

  static FirstParameter(theC: Adaptor2d_Curve2d): number;

  static LastParameter(theC: Adaptor2d_Curve2d): number;

  static Continuity(theC: Adaptor2d_Curve2d): GeomAbs_Shape;

  static NbIntervals(theC: Adaptor2d_Curve2d, theS: GeomAbs_Shape): number;

  static Intervals(theC: Adaptor2d_Curve2d, theT: NCollection_Array1_double, theS: GeomAbs_Shape): void;

  static DeflCurvIntervals(theC: Adaptor2d_Curve2d): NCollection_HArray1_double;

  static IsClosed(theC: Adaptor2d_Curve2d): boolean;

  static IsPeriodic(theC: Adaptor2d_Curve2d): boolean;

  static Period(theC: Adaptor2d_Curve2d): number;

  static Value(theC: Adaptor2d_Curve2d, theU: number): gp_Pnt2d;

  static D0(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d): void;

  static D1(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV: gp_Vec2d): void;

  static D2(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV1: gp_Vec2d, theV2: gp_Vec2d): void;

  static D3(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV1: gp_Vec2d, theV2: gp_Vec2d, theV3: gp_Vec2d): void;

  static DN(theC: Adaptor2d_Curve2d, theU: number, theN: number): gp_Vec2d;

  static Resolution(theC: Adaptor2d_Curve2d, theR3d: number): number;

  static GetType(theC: Adaptor2d_Curve2d): GeomAbs_CurveType;

  static Line(theC: Adaptor2d_Curve2d): gp_Lin2d;

  static Circle(theC: Adaptor2d_Curve2d): gp_Circ2d;

  static Ellipse(theC: Adaptor2d_Curve2d): gp_Elips2d;

  static Hyperbola(theC: Adaptor2d_Curve2d): gp_Hypr2d;

  static Parabola(theC: Adaptor2d_Curve2d): gp_Parab2d;

  static Degree(theC: Adaptor2d_Curve2d): number;

  static IsRational(theC: Adaptor2d_Curve2d): boolean;

  static NbPoles(theC: Adaptor2d_Curve2d): number;

  static NbKnots(theC: Adaptor2d_Curve2d): number;

  static Bezier(theC: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  static BSpline(theC: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_CurveTool: declare class Extrema_CurveTool

  constructor

  static FirstParameter(theC: Adaptor3d_Curve): number;

  static LastParameter(theC: Adaptor3d_Curve): number;

  static Continuity(theC: Adaptor3d_Curve): GeomAbs_Shape;

  static NbIntervals(theC: Adaptor3d_Curve, theS: GeomAbs_Shape): number;

  static Intervals(theC: Adaptor3d_Curve, theT: NCollection_Array1_double, theS: GeomAbs_Shape): void;

  static DeflCurvIntervals(theC: Adaptor3d_Curve): NCollection_HArray1_double;

  static IsPeriodic(theC: Adaptor3d_Curve): boolean;

  static Period(theC: Adaptor3d_Curve): number;

  static Resolution(theC: Adaptor3d_Curve, theR3d: number): number;

  static GetType(theC: Adaptor3d_Curve): GeomAbs_CurveType;

  static Value(theC: Adaptor3d_Curve, theU: number): gp_Pnt;

  static D0(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt): void;

  static D1(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV: gp_Vec): void;

  static D2(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): void;

  static D3(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

  static DN(theC: Adaptor3d_Curve, theU: number, theN: number): gp_Vec;

  static Line(theC: Adaptor3d_Curve): gp_Lin;

  static Circle(theC: Adaptor3d_Curve): gp_Circ;

  static Ellipse(theC: Adaptor3d_Curve): gp_Elips;

  static Hyperbola(theC: Adaptor3d_Curve): gp_Hypr;

  static Parabola(theC: Adaptor3d_Curve): gp_Parab;

  static Degree(theC: Adaptor3d_Curve): number;

  static IsRational(theC: Adaptor3d_Curve): boolean;

  static NbPoles(theC: Adaptor3d_Curve): number;

  static NbKnots(theC: Adaptor3d_Curve): number;

  static Bezier(theC: Adaptor3d_Curve): Geom_BezierCurve;

  static BSpline(theC: Adaptor3d_Curve): Geom_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ElementType: typeof Extrema_ElementType[keyof typeof Extrema_ElementType]

Extrema_ExtAlgo: typeof Extrema_ExtAlgo[keyof typeof Extrema_ExtAlgo]

Extrema_ExtCC: declare class Extrema_ExtCC

  constructor

  Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, TolC1: number, TolC2: number): void;
  Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U1: number, U2: number, V1: number, V2: number, TolC1: number, TolC2: number): void;
  Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, TolC1: number, TolC2: number): void;
  Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U1: number, U2: number, V1: number, V2: number, TolC1: number, TolC2: number): void;

  SetCurve(theRank: number, C: Adaptor3d_Curve): void;
  SetCurve(theRank: number, C: Adaptor3d_Curve, Uinf: number, Usup: number): void;
  SetCurve(theRank: number, C: Adaptor3d_Curve): void;
  SetCurve(theRank: number, C: Adaptor3d_Curve, Uinf: number, Usup: number): void;

  SetRange(theRank: number, Uinf: number, Usup: number): void;

  SetTolerance(theRank: number, Tol: number): void;

  Perform(): void;

  IsDone(): boolean;

  NbExt(): number;

  IsParallel(): boolean;

  SquareDistance(N?: number): number;

  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;

  TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt, P12: gp_Pnt, P21: gp_Pnt, P22: gp_Pnt): { dist11: number; distP12: number; distP21: number; distP22: number };

  SetSingleSolutionFlag(theSingleSolutionFlag: boolean): void;

  GetSingleSolutionFlag(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtCC2d: declare class Extrema_ExtCC2d

  constructor

  Initialize(C2: Adaptor2d_Curve2d, V1: number, V2: number, TolC1?: number, TolC2?: number): void;

  Perform(C1: Adaptor2d_Curve2d, U1: number, U2: number): void;

  IsDone(): boolean;

  NbExt(): number;

  IsParallel(): boolean;

  SquareDistance(N?: number): number;

  Points(N: number, P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;

  TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt2d, P12: gp_Pnt2d, P21: gp_Pnt2d, P22: gp_Pnt2d): { dist11: number; distP12: number; distP21: number; distP22: number };

  SetSingleSolutionFlag(theSingleSolutionFlag: boolean): void;

  GetSingleSolutionFlag(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtCS: declare class Extrema_ExtCS

  constructor

  Initialize(S: Adaptor3d_Surface, TolC: number, TolS: number): void;
  Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolC: number, TolS: number): void;
  Initialize(S: Adaptor3d_Surface, TolC: number, TolS: number): void;
  Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolC: number, TolS: number): void;

  Perform(C: Adaptor3d_Curve, Uinf: number, Usup: number): void;

  IsDone(): boolean;

  IsParallel(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnSurf): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtElC: declare class Extrema_ExtElC

  constructor

  IsDone(): boolean;

  IsParallel(): boolean;

  NbExt(): number;

  SquareDistance(N?: number): number;

  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtElC2d: declare class Extrema_ExtElC2d

  constructor

  IsDone(): boolean;

  IsParallel(): boolean;

  NbExt(): number;

  SquareDistance(N?: number): number;

  Points(N: number, P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtElCS: declare class Extrema_ExtElCS

  constructor

  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Pln): void;
  Perform(C: gp_Lin, S: gp_Cylinder): void;
  Perform(C: gp_Lin, S: gp_Cone): void;
  Perform(C: gp_Lin, S: gp_Sphere): void;
  Perform(C: gp_Lin, S: gp_Torus): void;
  Perform(C: gp_Circ, S: gp_Pln): void;
  Perform(C: gp_Circ, S: gp_Cylinder): void;
  Perform(C: gp_Circ, S: gp_Cone): void;
  Perform(C: gp_Circ, S: gp_Sphere): void;
  Perform(C: gp_Circ, S: gp_Torus): void;
  Perform(C: gp_Hypr, S: gp_Pln): void;

  IsDone(): boolean;

  IsParallel(): boolean;

  NbExt(): number;

  SquareDistance(N?: number): number;

  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnSurf): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtElSS: declare class Extrema_ExtElSS

  constructor

  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;
  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;
  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;
  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;
  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;
  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;

  IsDone(): boolean;

  IsParallel(): boolean;

  NbExt(): number;

  SquareDistance(N?: number): number;

  Points(N: number, P1: Extrema_POnSurf, P2: Extrema_POnSurf): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtFlag: typeof Extrema_ExtFlag[keyof typeof Extrema_ExtFlag]

Extrema_ExtPElC: declare class Extrema_ExtPElC

  constructor

  Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  IsMin(N: number): boolean;

  Point(N: number): Extrema_POnCurv;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtPElC2d: declare class Extrema_ExtPElC2d

  constructor

  Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  IsMin(N: number): boolean;

  Point(N: number): Extrema_POnCurv2d;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtPElS: declare class Extrema_ExtPElS

  constructor

  Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Point(N: number): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtPExtS: declare class Extrema_ExtPExtS extends Standard_Transient

  constructor

  Initialize(S: GeomAdaptor_SurfaceOfLinearExtrusion, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number): void;

  Perform(P: gp_Pnt): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Point(N: number): Extrema_POnSurf;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtPRevS: declare class Extrema_ExtPRevS extends Standard_Transient

  constructor

  Initialize(S: GeomAdaptor_SurfaceOfRevolution, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;

  Perform(P: gp_Pnt): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Point(N: number): Extrema_POnSurf;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtPS: declare class Extrema_ExtPS

  constructor

  Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number): void;

  Perform(P: gp_Pnt): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Point(N: number): Extrema_POnSurf;

  TrimmedSquareDistances(dUfVf: number, dUfVl: number, dUlVf: number, dUlVl: number, PUfVf: gp_Pnt, PUfVl: gp_Pnt, PUlVf: gp_Pnt, PUlVl: gp_Pnt): { dUfVf: number; dUfVl: number; dUlVf: number; dUlVl: number };

  SetFlag(F: Extrema_ExtFlag): void;

  SetAlgo(A: Extrema_ExtAlgo): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ExtSS: declare class Extrema_ExtSS

  constructor

  Initialize(S2: Adaptor3d_Surface, Uinf2: number, Usup2: number, Vinf2: number, Vsup2: number, TolS1: number): void;

  Perform(S1: Adaptor3d_Surface, Uinf1: number, Usup1: number, Vinf1: number, Vsup1: number, TolS1: number): void;

  IsDone(): boolean;

  IsParallel(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Points(N: number, P1: Extrema_POnSurf, P2: Extrema_POnSurf): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_FuncExtCS: declare class Extrema_FuncExtCS extends math_FunctionSetWithDerivatives

  constructor

  Initialize(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetStateNumber(): number;

  NbExt(): number;

  SquareDistance(N: number): number;

  PointOnCurve(N: number): Extrema_POnCurv;

  PointOnSurface(N: number): Extrema_POnSurf;

  SquareDistances(): NCollection_Sequence_double;

  PointsOnCurve(): NCollection_Sequence_Extrema_POnCurv;

  PointsOnSurf(): NCollection_Sequence_Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_FuncExtSS: declare class Extrema_FuncExtSS extends math_FunctionSetWithDerivatives

  constructor

  Initialize(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetStateNumber(): number;

  NbExt(): number;

  SquareDistance(N: number): number;

  PointOnS1(N: number): Extrema_POnSurf;

  PointOnS2(N: number): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_FuncPSDist: declare class Extrema_FuncPSDist extends math_MultipleVarFunctionWithGradient

  constructor

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;
