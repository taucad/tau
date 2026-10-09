# libcascade — Extrema

27 top-level symbols. Signatures are verbatim typescript.

Extrema_Curve2dTool: declare class Extrema_Curve2dTool

  // Extrema_Curve2dTool.constructor (constructor)
  constructor();

  // Extrema_Curve2dTool.FirstParameter (method)
  static FirstParameter(theC: Adaptor2d_Curve2d): number;

  // Extrema_Curve2dTool.LastParameter (method)
  static LastParameter(theC: Adaptor2d_Curve2d): number;

  // Extrema_Curve2dTool.Continuity (method)
  static Continuity(theC: Adaptor2d_Curve2d): GeomAbs_Shape;

  // Extrema_Curve2dTool.NbIntervals (method)
  static NbIntervals(theC: Adaptor2d_Curve2d, theS: GeomAbs_Shape): number;

  // Extrema_Curve2dTool.Intervals (method)
  static Intervals(theC: Adaptor2d_Curve2d, theT: NCollection_Array1_double, theS: GeomAbs_Shape): void;

  // Extrema_Curve2dTool.DeflCurvIntervals (method)
  static DeflCurvIntervals(theC: Adaptor2d_Curve2d): NCollection_HArray1_double;

  // Extrema_Curve2dTool.IsClosed (method)
  static IsClosed(theC: Adaptor2d_Curve2d): boolean;

  // Extrema_Curve2dTool.IsPeriodic (method)
  static IsPeriodic(theC: Adaptor2d_Curve2d): boolean;

  // Extrema_Curve2dTool.Period (method)
  static Period(theC: Adaptor2d_Curve2d): number;

  // Extrema_Curve2dTool.Value (method)
  static Value(theC: Adaptor2d_Curve2d, theU: number): gp_Pnt2d;

  // Extrema_Curve2dTool.D0 (method)
  static D0(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d): void;

  // Extrema_Curve2dTool.D1 (method)
  static D1(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV: gp_Vec2d): void;

  // Extrema_Curve2dTool.D2 (method)
  static D2(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV1: gp_Vec2d, theV2: gp_Vec2d): void;

  // Extrema_Curve2dTool.D3 (method)
  static D3(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV1: gp_Vec2d, theV2: gp_Vec2d, theV3: gp_Vec2d): void;

  // Extrema_Curve2dTool.DN (method)
  static DN(theC: Adaptor2d_Curve2d, theU: number, theN: number): gp_Vec2d;

  // Extrema_Curve2dTool.Resolution (method)
  static Resolution(theC: Adaptor2d_Curve2d, theR3d: number): number;

  // Extrema_Curve2dTool.GetType (method)
  static GetType(theC: Adaptor2d_Curve2d): GeomAbs_CurveType;

  // Extrema_Curve2dTool.Line (method)
  static Line(theC: Adaptor2d_Curve2d): gp_Lin2d;

  // Extrema_Curve2dTool.Circle (method)
  static Circle(theC: Adaptor2d_Curve2d): gp_Circ2d;

  // Extrema_Curve2dTool.Ellipse (method)
  static Ellipse(theC: Adaptor2d_Curve2d): gp_Elips2d;

  // Extrema_Curve2dTool.Hyperbola (method)
  static Hyperbola(theC: Adaptor2d_Curve2d): gp_Hypr2d;

  // Extrema_Curve2dTool.Parabola (method)
  static Parabola(theC: Adaptor2d_Curve2d): gp_Parab2d;

  // Extrema_Curve2dTool.Degree (method)
  static Degree(theC: Adaptor2d_Curve2d): number;

  // Extrema_Curve2dTool.IsRational (method)
  static IsRational(theC: Adaptor2d_Curve2d): boolean;

  // Extrema_Curve2dTool.NbPoles (method)
  static NbPoles(theC: Adaptor2d_Curve2d): number;

  // Extrema_Curve2dTool.NbKnots (method)
  static NbKnots(theC: Adaptor2d_Curve2d): number;

  // Extrema_Curve2dTool.Bezier (method)
  static Bezier(theC: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  // Extrema_Curve2dTool.BSpline (method)
  static BSpline(theC: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  // Extrema_Curve2dTool.delete (method)
  delete(): void;

  // Extrema_Curve2dTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_CurveTool: declare class Extrema_CurveTool

  // Extrema_CurveTool.constructor (constructor)
  constructor();

  // Extrema_CurveTool.FirstParameter (method)
  static FirstParameter(theC: Adaptor3d_Curve): number;

  // Extrema_CurveTool.LastParameter (method)
  static LastParameter(theC: Adaptor3d_Curve): number;

  // Extrema_CurveTool.Continuity (method)
  static Continuity(theC: Adaptor3d_Curve): GeomAbs_Shape;

  // Extrema_CurveTool.NbIntervals (method)
  static NbIntervals(theC: Adaptor3d_Curve, theS: GeomAbs_Shape): number;

  // Extrema_CurveTool.Intervals (method)
  static Intervals(theC: Adaptor3d_Curve, theT: NCollection_Array1_double, theS: GeomAbs_Shape): void;

  // Extrema_CurveTool.DeflCurvIntervals (method)
  static DeflCurvIntervals(theC: Adaptor3d_Curve): NCollection_HArray1_double;

  // Extrema_CurveTool.IsPeriodic (method)
  static IsPeriodic(theC: Adaptor3d_Curve): boolean;

  // Extrema_CurveTool.Period (method)
  static Period(theC: Adaptor3d_Curve): number;

  // Extrema_CurveTool.Resolution (method)
  static Resolution(theC: Adaptor3d_Curve, theR3d: number): number;

  // Extrema_CurveTool.GetType (method)
  static GetType(theC: Adaptor3d_Curve): GeomAbs_CurveType;

  // Extrema_CurveTool.Value (method)
  static Value(theC: Adaptor3d_Curve, theU: number): gp_Pnt;

  // Extrema_CurveTool.D0 (method)
  static D0(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt): void;

  // Extrema_CurveTool.D1 (method)
  static D1(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV: gp_Vec): void;

  // Extrema_CurveTool.D2 (method)
  static D2(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): void;

  // Extrema_CurveTool.D3 (method)
  static D3(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

  // Extrema_CurveTool.DN (method)
  static DN(theC: Adaptor3d_Curve, theU: number, theN: number): gp_Vec;

  // Extrema_CurveTool.Line (method)
  static Line(theC: Adaptor3d_Curve): gp_Lin;

  // Extrema_CurveTool.Circle (method)
  static Circle(theC: Adaptor3d_Curve): gp_Circ;

  // Extrema_CurveTool.Ellipse (method)
  static Ellipse(theC: Adaptor3d_Curve): gp_Elips;

  // Extrema_CurveTool.Hyperbola (method)
  static Hyperbola(theC: Adaptor3d_Curve): gp_Hypr;

  // Extrema_CurveTool.Parabola (method)
  static Parabola(theC: Adaptor3d_Curve): gp_Parab;

  // Extrema_CurveTool.Degree (method)
  static Degree(theC: Adaptor3d_Curve): number;

  // Extrema_CurveTool.IsRational (method)
  static IsRational(theC: Adaptor3d_Curve): boolean;

  // Extrema_CurveTool.NbPoles (method)
  static NbPoles(theC: Adaptor3d_Curve): number;

  // Extrema_CurveTool.NbKnots (method)
  static NbKnots(theC: Adaptor3d_Curve): number;

  // Extrema_CurveTool.Bezier (method)
  static Bezier(theC: Adaptor3d_Curve): Geom_BezierCurve;

  // Extrema_CurveTool.BSpline (method)
  static BSpline(theC: Adaptor3d_Curve): Geom_BSplineCurve;

  // Extrema_CurveTool.delete (method)
  delete(): void;

  // Extrema_CurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ElementType: typeof Extrema_ElementType[keyof typeof Extrema_ElementType]

  readonly Extrema_Node: 'Extrema_Node'

  readonly Extrema_UIsoEdge: 'Extrema_UIsoEdge'

  readonly Extrema_VIsoEdge: 'Extrema_VIsoEdge'

  readonly Extrema_Face: 'Extrema_Face'

Extrema_ExtAlgo: typeof Extrema_ExtAlgo[keyof typeof Extrema_ExtAlgo]

  readonly Extrema_ExtAlgo_Grad: 'Extrema_ExtAlgo_Grad'

  readonly Extrema_ExtAlgo_Tree: 'Extrema_ExtAlgo_Tree'

Extrema_ExtCC: declare class Extrema_ExtCC

  // Extrema_ExtCC.constructor (constructor)
  constructor(TolC1?: number, TolC2?: number);
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, TolC1?: number, TolC2?: number);
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U1: number, U2: number, V1: number, V2: number, TolC1?: number, TolC2?: number);

  // Extrema_ExtCC.Initialize (method)
  Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, TolC1: number, TolC2: number): void;
  Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U1: number, U2: number, V1: number, V2: number, TolC1: number, TolC2: number): void;

  // Extrema_ExtCC.SetCurve (method)
  SetCurve(theRank: number, C: Adaptor3d_Curve): void;
  SetCurve(theRank: number, C: Adaptor3d_Curve, Uinf: number, Usup: number): void;

  // Extrema_ExtCC.SetRange (method)
  SetRange(theRank: number, Uinf: number, Usup: number): void;

  // Extrema_ExtCC.SetTolerance (method)
  SetTolerance(theRank: number, Tol: number): void;

  // Extrema_ExtCC.Perform (method)
  Perform(): void;

  // Extrema_ExtCC.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtCC.NbExt (method)
  NbExt(): number;

  // Extrema_ExtCC.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtCC.SquareDistance (method)
  SquareDistance(N?: number): number;

  // Extrema_ExtCC.Points (method)
  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;

  // Extrema_ExtCC.TrimmedSquareDistances (method)
  TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt, P12: gp_Pnt, P21: gp_Pnt, P22: gp_Pnt): { dist11: number; distP12: number; distP21: number; distP22: number };

  // Extrema_ExtCC.SetSingleSolutionFlag (method)
  SetSingleSolutionFlag(theSingleSolutionFlag: boolean): void;

  // Extrema_ExtCC.GetSingleSolutionFlag (method)
  GetSingleSolutionFlag(): boolean;

  // Extrema_ExtCC.delete (method)
  delete(): void;

  // Extrema_ExtCC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtCC2d: declare class Extrema_ExtCC2d

  // Extrema_ExtCC2d.constructor (constructor)
  constructor();
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolC1?: number, TolC2?: number);
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, U1: number, U2: number, V1: number, V2: number, TolC1?: number, TolC2?: number);

  // Extrema_ExtCC2d.Initialize (method)
  Initialize(C2: Adaptor2d_Curve2d, V1: number, V2: number, TolC1?: number, TolC2?: number): void;

  // Extrema_ExtCC2d.Perform (method)
  Perform(C1: Adaptor2d_Curve2d, U1: number, U2: number): void;

  // Extrema_ExtCC2d.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtCC2d.NbExt (method)
  NbExt(): number;

  // Extrema_ExtCC2d.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtCC2d.SquareDistance (method)
  SquareDistance(N?: number): number;

  // Extrema_ExtCC2d.Points (method)
  Points(N: number, P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;

  // Extrema_ExtCC2d.TrimmedSquareDistances (method)
  TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt2d, P12: gp_Pnt2d, P21: gp_Pnt2d, P22: gp_Pnt2d): { dist11: number; distP12: number; distP21: number; distP22: number };

  // Extrema_ExtCC2d.SetSingleSolutionFlag (method)
  SetSingleSolutionFlag(theSingleSolutionFlag: boolean): void;

  // Extrema_ExtCC2d.GetSingleSolutionFlag (method)
  GetSingleSolutionFlag(): boolean;

  // Extrema_ExtCC2d.delete (method)
  delete(): void;

  // Extrema_ExtCC2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtCS: declare class Extrema_ExtCS

  // Extrema_ExtCS.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, TolC: number, TolS: number);
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, UCinf: number, UCsup: number, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolC: number, TolS: number);

  // Extrema_ExtCS.Initialize (method)
  Initialize(S: Adaptor3d_Surface, TolC: number, TolS: number): void;
  Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolC: number, TolS: number): void;

  // Extrema_ExtCS.Perform (method)
  Perform(C: Adaptor3d_Curve, Uinf: number, Usup: number): void;

  // Extrema_ExtCS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtCS.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtCS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtCS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtCS.Points (method)
  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnSurf): void;

  // Extrema_ExtCS.delete (method)
  delete(): void;

  // Extrema_ExtCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtElC: declare class Extrema_ExtElC

  // Extrema_ExtElC.constructor (constructor)
  constructor();
  constructor(C1: gp_Lin, C2: gp_Elips);
  constructor(C1: gp_Lin, C2: gp_Hypr);
  constructor(C1: gp_Lin, C2: gp_Parab);
  constructor(C1: gp_Circ, C2: gp_Circ);
  constructor(C1: gp_Lin, C2: gp_Lin, AngTol: number);
  constructor(C1: gp_Lin, C2: gp_Circ, Tol: number);

  // Extrema_ExtElC.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtElC.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtElC.NbExt (method)
  NbExt(): number;

  // Extrema_ExtElC.SquareDistance (method)
  SquareDistance(N?: number): number;

  // Extrema_ExtElC.Points (method)
  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;

  // Extrema_ExtElC.delete (method)
  delete(): void;

  // Extrema_ExtElC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtElC2d: declare class Extrema_ExtElC2d

  // Extrema_ExtElC2d.constructor (constructor)
  constructor();
  constructor(C1: gp_Lin2d, C2: gp_Elips2d);
  constructor(C1: gp_Lin2d, C2: gp_Hypr2d);
  constructor(C1: gp_Lin2d, C2: gp_Parab2d);
  constructor(C1: gp_Circ2d, C2: gp_Circ2d);
  constructor(C1: gp_Circ2d, C2: gp_Elips2d);
  constructor(C1: gp_Circ2d, C2: gp_Hypr2d);
  constructor(C1: gp_Circ2d, C2: gp_Parab2d);
  constructor(C1: gp_Lin2d, C2: gp_Lin2d, AngTol: number);
  constructor(C1: gp_Lin2d, C2: gp_Circ2d, Tol: number);

  // Extrema_ExtElC2d.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtElC2d.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtElC2d.NbExt (method)
  NbExt(): number;

  // Extrema_ExtElC2d.SquareDistance (method)
  SquareDistance(N?: number): number;

  // Extrema_ExtElC2d.Points (method)
  Points(N: number, P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;

  // Extrema_ExtElC2d.delete (method)
  delete(): void;

  // Extrema_ExtElC2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtElCS: declare class Extrema_ExtElCS

  // Extrema_ExtElCS.constructor (constructor)
  constructor();
  constructor(C: gp_Lin, S: gp_Pln);
  constructor(C: gp_Lin, S: gp_Cylinder);
  constructor(C: gp_Lin, S: gp_Cone);
  constructor(C: gp_Lin, S: gp_Sphere);
  constructor(C: gp_Lin, S: gp_Torus);
  constructor(C: gp_Circ, S: gp_Pln);
  constructor(C: gp_Circ, S: gp_Cylinder);
  constructor(C: gp_Circ, S: gp_Cone);
  constructor(C: gp_Circ, S: gp_Sphere);
  constructor(C: gp_Circ, S: gp_Torus);
  constructor(C: gp_Hypr, S: gp_Pln);

  // Extrema_ExtElCS.Perform (method)
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

  // Extrema_ExtElCS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtElCS.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtElCS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtElCS.SquareDistance (method)
  SquareDistance(N?: number): number;

  // Extrema_ExtElCS.Points (method)
  Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnSurf): void;

  // Extrema_ExtElCS.delete (method)
  delete(): void;

  // Extrema_ExtElCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtElSS: declare class Extrema_ExtElSS

  // Extrema_ExtElSS.constructor (constructor)
  constructor();
  constructor(S1: gp_Pln, S2: gp_Pln);
  constructor(S1: gp_Pln, S2: gp_Sphere);
  constructor(S1: gp_Sphere, S2: gp_Sphere);
  constructor(S1: gp_Sphere, S2: gp_Cylinder);
  constructor(S1: gp_Sphere, S2: gp_Cone);
  constructor(S1: gp_Sphere, S2: gp_Torus);

  // Extrema_ExtElSS.Perform (method)
  Perform(S1: gp_Pln, S2: gp_Pln): void;
  Perform(S1: gp_Pln, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Sphere): void;
  Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
  Perform(S1: gp_Sphere, S2: gp_Cone): void;
  Perform(S1: gp_Sphere, S2: gp_Torus): void;

  // Extrema_ExtElSS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtElSS.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtElSS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtElSS.SquareDistance (method)
  SquareDistance(N?: number): number;

  // Extrema_ExtElSS.Points (method)
  Points(N: number, P1: Extrema_POnSurf, P2: Extrema_POnSurf): void;

  // Extrema_ExtElSS.delete (method)
  delete(): void;

  // Extrema_ExtElSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtFlag: typeof Extrema_ExtFlag[keyof typeof Extrema_ExtFlag]

  readonly Extrema_ExtFlag_MIN: 'Extrema_ExtFlag_MIN'

  readonly Extrema_ExtFlag_MAX: 'Extrema_ExtFlag_MAX'

  readonly Extrema_ExtFlag_MINMAX: 'Extrema_ExtFlag_MINMAX'

Extrema_ExtPElC: declare class Extrema_ExtPElC

  // Extrema_ExtPElC.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number);

  // Extrema_ExtPElC.Perform (method)
  Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;

  // Extrema_ExtPElC.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtPElC.NbExt (method)
  NbExt(): number;

  // Extrema_ExtPElC.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtPElC.IsMin (method)
  IsMin(N: number): boolean;

  // Extrema_ExtPElC.Point (method)
  Point(N: number): Extrema_POnCurv;

  // Extrema_ExtPElC.delete (method)
  delete(): void;

  // Extrema_ExtPElC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtPElC2d: declare class Extrema_ExtPElC2d

  // Extrema_ExtPElC2d.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt2d, C: gp_Lin2d, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number);
  constructor(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number);

  // Extrema_ExtPElC2d.Perform (method)
  Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
  Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;

  // Extrema_ExtPElC2d.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtPElC2d.NbExt (method)
  NbExt(): number;

  // Extrema_ExtPElC2d.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtPElC2d.IsMin (method)
  IsMin(N: number): boolean;

  // Extrema_ExtPElC2d.Point (method)
  Point(N: number): Extrema_POnCurv2d;

  // Extrema_ExtPElC2d.delete (method)
  delete(): void;

  // Extrema_ExtPElC2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtPElS: declare class Extrema_ExtPElS

  // Extrema_ExtPElS.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, S: gp_Cylinder, Tol: number);
  constructor(P: gp_Pnt, S: gp_Pln, Tol: number);
  constructor(P: gp_Pnt, S: gp_Cone, Tol: number);
  constructor(P: gp_Pnt, S: gp_Torus, Tol: number);
  constructor(P: gp_Pnt, S: gp_Sphere, Tol: number);

  // Extrema_ExtPElS.Perform (method)
  Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
  Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;

  // Extrema_ExtPElS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtPElS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtPElS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtPElS.Point (method)
  Point(N: number): Extrema_POnSurf;

  // Extrema_ExtPElS.delete (method)
  delete(): void;

  // Extrema_ExtPElS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtPExtS: declare class Extrema_ExtPExtS extends Standard_Transient

  // Extrema_ExtPExtS.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, S: GeomAdaptor_SurfaceOfLinearExtrusion, TolU: number, TolV: number);
  constructor(P: gp_Pnt, S: GeomAdaptor_SurfaceOfLinearExtrusion, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number);

  // Extrema_ExtPExtS.Initialize (method)
  Initialize(S: GeomAdaptor_SurfaceOfLinearExtrusion, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number): void;

  // Extrema_ExtPExtS.Perform (method)
  Perform(P: gp_Pnt): void;

  // Extrema_ExtPExtS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtPExtS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtPExtS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtPExtS.Point (method)
  Point(N: number): Extrema_POnSurf;

  // Extrema_ExtPExtS.get_type_name (method)
  static get_type_name(): string;

  // Extrema_ExtPExtS.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Extrema_ExtPExtS.DynamicType (method)
  DynamicType(): Standard_Type;

  // Extrema_ExtPExtS.delete (method)
  delete(): void;

  // Extrema_ExtPExtS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtPRevS: declare class Extrema_ExtPRevS extends Standard_Transient

  // Extrema_ExtPRevS.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, S: GeomAdaptor_SurfaceOfRevolution, TolU: number, TolV: number);
  constructor(P: gp_Pnt, S: GeomAdaptor_SurfaceOfRevolution, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number);

  // Extrema_ExtPRevS.Initialize (method)
  Initialize(S: GeomAdaptor_SurfaceOfRevolution, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;

  // Extrema_ExtPRevS.Perform (method)
  Perform(P: gp_Pnt): void;

  // Extrema_ExtPRevS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtPRevS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtPRevS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtPRevS.Point (method)
  Point(N: number): Extrema_POnSurf;

  // Extrema_ExtPRevS.get_type_name (method)
  static get_type_name(): string;

  // Extrema_ExtPRevS.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Extrema_ExtPRevS.DynamicType (method)
  DynamicType(): Standard_Type;

  // Extrema_ExtPRevS.delete (method)
  delete(): void;

  // Extrema_ExtPRevS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtPS: declare class Extrema_ExtPS

  // Extrema_ExtPS.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, S: Adaptor3d_Surface, TolU: number, TolV: number, F?: Extrema_ExtFlag, A?: Extrema_ExtAlgo);
  constructor(P: gp_Pnt, S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number, F?: Extrema_ExtFlag, A?: Extrema_ExtAlgo);

  // Extrema_ExtPS.Initialize (method)
  Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number): void;

  // Extrema_ExtPS.Perform (method)
  Perform(P: gp_Pnt): void;

  // Extrema_ExtPS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtPS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtPS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtPS.Point (method)
  Point(N: number): Extrema_POnSurf;

  // Extrema_ExtPS.TrimmedSquareDistances (method)
  TrimmedSquareDistances(dUfVf: number, dUfVl: number, dUlVf: number, dUlVl: number, PUfVf: gp_Pnt, PUfVl: gp_Pnt, PUlVf: gp_Pnt, PUlVl: gp_Pnt): { dUfVf: number; dUfVl: number; dUlVf: number; dUlVl: number };

  // Extrema_ExtPS.SetFlag (method)
  SetFlag(F: Extrema_ExtFlag): void;

  // Extrema_ExtPS.SetAlgo (method)
  SetAlgo(A: Extrema_ExtAlgo): void;

  // Extrema_ExtPS.delete (method)
  delete(): void;

  // Extrema_ExtPS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ExtSS: declare class Extrema_ExtSS

  // Extrema_ExtSS.constructor (constructor)
  constructor();
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, TolS1: number, TolS2: number);
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, Uinf1: number, Usup1: number, Vinf1: number, Vsup1: number, Uinf2: number, Usup2: number, Vinf2: number, Vsup2: number, TolS1: number, TolS2: number);

  // Extrema_ExtSS.Initialize (method)
  Initialize(S2: Adaptor3d_Surface, Uinf2: number, Usup2: number, Vinf2: number, Vsup2: number, TolS1: number): void;

  // Extrema_ExtSS.Perform (method)
  Perform(S1: Adaptor3d_Surface, Uinf1: number, Usup1: number, Vinf1: number, Vsup1: number, TolS1: number): void;

  // Extrema_ExtSS.IsDone (method)
  IsDone(): boolean;

  // Extrema_ExtSS.IsParallel (method)
  IsParallel(): boolean;

  // Extrema_ExtSS.NbExt (method)
  NbExt(): number;

  // Extrema_ExtSS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_ExtSS.Points (method)
  Points(N: number, P1: Extrema_POnSurf, P2: Extrema_POnSurf): void;

  // Extrema_ExtSS.delete (method)
  delete(): void;

  // Extrema_ExtSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_FuncExtCS: declare class Extrema_FuncExtCS extends math_FunctionSetWithDerivatives

  // Extrema_FuncExtCS.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface);

  // Extrema_FuncExtCS.Initialize (method)
  Initialize(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;

  // Extrema_FuncExtCS.NbVariables (method)
  NbVariables(): number;

  // Extrema_FuncExtCS.NbEquations (method)
  NbEquations(): number;

  // Extrema_FuncExtCS.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Extrema_FuncExtCS.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Extrema_FuncExtCS.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Extrema_FuncExtCS.GetStateNumber (method)
  GetStateNumber(): number;

  // Extrema_FuncExtCS.NbExt (method)
  NbExt(): number;

  // Extrema_FuncExtCS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_FuncExtCS.PointOnCurve (method)
  PointOnCurve(N: number): Extrema_POnCurv;

  // Extrema_FuncExtCS.PointOnSurface (method)
  PointOnSurface(N: number): Extrema_POnSurf;

  // Extrema_FuncExtCS.SquareDistances (method)
  SquareDistances(): NCollection_Sequence_double;

  // Extrema_FuncExtCS.PointsOnCurve (method)
  PointsOnCurve(): NCollection_Sequence_Extrema_POnCurv;

  // Extrema_FuncExtCS.PointsOnSurf (method)
  PointsOnSurf(): NCollection_Sequence_Extrema_POnSurf;

  // Extrema_FuncExtCS.delete (method)
  delete(): void;

  // Extrema_FuncExtCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_FuncExtSS: declare class Extrema_FuncExtSS extends math_FunctionSetWithDerivatives

  // Extrema_FuncExtSS.constructor (constructor)
  constructor();
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface);

  // Extrema_FuncExtSS.Initialize (method)
  Initialize(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface): void;

  // Extrema_FuncExtSS.NbVariables (method)
  NbVariables(): number;

  // Extrema_FuncExtSS.NbEquations (method)
  NbEquations(): number;

  // Extrema_FuncExtSS.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Extrema_FuncExtSS.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Extrema_FuncExtSS.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Extrema_FuncExtSS.GetStateNumber (method)
  GetStateNumber(): number;

  // Extrema_FuncExtSS.NbExt (method)
  NbExt(): number;

  // Extrema_FuncExtSS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_FuncExtSS.PointOnS1 (method)
  PointOnS1(N: number): Extrema_POnSurf;

  // Extrema_FuncExtSS.PointOnS2 (method)
  PointOnS2(N: number): Extrema_POnSurf;

  // Extrema_FuncExtSS.delete (method)
  delete(): void;

  // Extrema_FuncExtSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_FuncPSDist: declare class Extrema_FuncPSDist extends math_MultipleVarFunctionWithGradient

  // Extrema_FuncPSDist.constructor (constructor)
  constructor(theS: Adaptor3d_Surface, theP: gp_Pnt);

  // Extrema_FuncPSDist.NbVariables (method)
  NbVariables(): number;

  // Extrema_FuncPSDist.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_FuncPSDist.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // Extrema_FuncPSDist.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // Extrema_FuncPSDist.delete (method)
  delete(): void;

  // Extrema_FuncPSDist.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_FuncPSNorm: declare class Extrema_FuncPSNorm extends math_FunctionSetWithDerivatives

  // Extrema_FuncPSNorm.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, S: Adaptor3d_Surface);

  // Extrema_FuncPSNorm.Initialize (method)
  Initialize(S: Adaptor3d_Surface): void;

  // Extrema_FuncPSNorm.SetPoint (method)
  SetPoint(P: gp_Pnt): void;

  // Extrema_FuncPSNorm.NbVariables (method)
  NbVariables(): number;

  // Extrema_FuncPSNorm.NbEquations (method)
  NbEquations(): number;

  // Extrema_FuncPSNorm.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // Extrema_FuncPSNorm.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // Extrema_FuncPSNorm.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // Extrema_FuncPSNorm.GetStateNumber (method)
  GetStateNumber(): number;

  // Extrema_FuncPSNorm.NbExt (method)
  NbExt(): number;

  // Extrema_FuncPSNorm.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_FuncPSNorm.Point (method)
  Point(N: number): Extrema_POnSurf;

  // Extrema_FuncPSNorm.delete (method)
  delete(): void;

  // Extrema_FuncPSNorm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GenExtCS: declare class Extrema_GenExtCS

  // Extrema_GenExtCS.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, NbT: number, NbU: number, NbV: number, Tol1: number, Tol2: number);
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, NbT: number, NbU: number, NbV: number, tmin: number, tsup: number, Umin: number, Usup: number, Vmin: number, Vsup: number, Tol1: number, Tol2: number);

  // Extrema_GenExtCS.Initialize (method)
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, Tol2: number): void;

  // Extrema_GenExtCS.Perform (method)
  Perform(C: Adaptor3d_Curve, NbT: number, Tol1: number): void;
  Perform(C: Adaptor3d_Curve, NbT: number, tmin: number, tsup: number, Tol1: number): void;

  // Extrema_GenExtCS.IsDone (method)
  IsDone(): boolean;

  // Extrema_GenExtCS.NbExt (method)
  NbExt(): number;

  // Extrema_GenExtCS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_GenExtCS.PointOnCurve (method)
  PointOnCurve(N: number): Extrema_POnCurv;

  // Extrema_GenExtCS.PointOnSurface (method)
  PointOnSurface(N: number): Extrema_POnSurf;

  // Extrema_GenExtCS.delete (method)
  delete(): void;

  // Extrema_GenExtCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GenExtPS: declare class Extrema_GenExtPS

  // Extrema_GenExtPS.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, S: Adaptor3d_Surface, NbU: number, NbV: number, TolU: number, TolV: number, F?: Extrema_ExtFlag, A?: Extrema_ExtAlgo);
  constructor(P: gp_Pnt, S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number, F?: Extrema_ExtFlag, A?: Extrema_ExtAlgo);

  // Extrema_GenExtPS.Initialize (method)
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, TolU: number, TolV: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;

  // Extrema_GenExtPS.Perform (method)
  Perform(P: gp_Pnt): void;

  // Extrema_GenExtPS.SetFlag (method)
  SetFlag(F: Extrema_ExtFlag): void;

  // Extrema_GenExtPS.SetAlgo (method)
  SetAlgo(A: Extrema_ExtAlgo): void;

  // Extrema_GenExtPS.IsDone (method)
  IsDone(): boolean;

  // Extrema_GenExtPS.NbExt (method)
  NbExt(): number;

  // Extrema_GenExtPS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_GenExtPS.Point (method)
  Point(N: number): Extrema_POnSurf;

  // Extrema_GenExtPS.delete (method)
  delete(): void;

  // Extrema_GenExtPS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GenExtSS: declare class Extrema_GenExtSS

  // Extrema_GenExtSS.constructor (constructor)
  constructor();
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, NbU: number, NbV: number, Tol1: number, Tol2: number);
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, NbU: number, NbV: number, U1min: number, U1sup: number, V1min: number, V1sup: number, U2min: number, U2sup: number, V2min: number, V2sup: number, Tol1: number, Tol2: number);

  // Extrema_GenExtSS.Initialize (method)
  Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
  Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, U2min: number, U2sup: number, V2min: number, V2sup: number, Tol2: number): void;

  // Extrema_GenExtSS.Perform (method)
  Perform(S1: Adaptor3d_Surface, Tol1: number): void;
  Perform(S1: Adaptor3d_Surface, U1min: number, U1sup: number, V1min: number, V1sup: number, Tol1: number): void;

  // Extrema_GenExtSS.IsDone (method)
  IsDone(): boolean;

  // Extrema_GenExtSS.NbExt (method)
  NbExt(): number;

  // Extrema_GenExtSS.SquareDistance (method)
  SquareDistance(N: number): number;

  // Extrema_GenExtSS.PointOnS1 (method)
  PointOnS1(N: number): Extrema_POnSurf;

  // Extrema_GenExtSS.PointOnS2 (method)
  PointOnS2(N: number): Extrema_POnSurf;

  // Extrema_GenExtSS.delete (method)
  delete(): void;

  // Extrema_GenExtSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GenLocateExtCS: declare class Extrema_GenLocateExtCS

  // Extrema_GenLocateExtCS.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface, T: number, U: number, V: number, Tol1: number, Tol2: number);

  // Extrema_GenLocateExtCS.Perform (method)
  Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface, T: number, U: number, V: number, Tol1: number, Tol2: number): void;

  // Extrema_GenLocateExtCS.IsDone (method)
  IsDone(): boolean;

  // Extrema_GenLocateExtCS.SquareDistance (method)
  SquareDistance(): number;

  // Extrema_GenLocateExtCS.PointOnCurve (method)
  PointOnCurve(): Extrema_POnCurv;

  // Extrema_GenLocateExtCS.PointOnSurface (method)
  PointOnSurface(): Extrema_POnSurf;

  // Extrema_GenLocateExtCS.delete (method)
  delete(): void;

  // Extrema_GenLocateExtCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
