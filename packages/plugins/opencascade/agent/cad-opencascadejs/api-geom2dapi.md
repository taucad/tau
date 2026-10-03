# libcascade — Geom2dAPI

5 top-level symbols. Signatures are verbatim typescript.

Geom2dAPI_ExtremaCurveCurve: declare class Geom2dAPI_ExtremaCurveCurve

  // Geom2dAPI_ExtremaCurveCurve.constructor (constructor)
  constructor(C1: Geom2d_Curve, C2: Geom2d_Curve, U1min: number, U1max: number, U2min: number, U2max: number);

  // Geom2dAPI_ExtremaCurveCurve.NbExtrema (method)
  NbExtrema(): number;

  // Geom2dAPI_ExtremaCurveCurve.Points (method)
  Points(Index: number, P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // Geom2dAPI_ExtremaCurveCurve.Parameters (method)
  Parameters(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  // Geom2dAPI_ExtremaCurveCurve.Distance (method)
  Distance(Index: number): number;

  // Geom2dAPI_ExtremaCurveCurve.NearestPoints (method)
  NearestPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // Geom2dAPI_ExtremaCurveCurve.LowerDistanceParameters (method)
  LowerDistanceParameters(U1?: number, U2?: number): { U1: number; U2: number };

  // Geom2dAPI_ExtremaCurveCurve.LowerDistance (method)
  LowerDistance(): number;

  // Geom2dAPI_ExtremaCurveCurve.Extrema (method)
  Extrema(): Extrema_ExtCC2d;

  // Geom2dAPI_ExtremaCurveCurve.delete (method)
  delete(): void;

  // Geom2dAPI_ExtremaCurveCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dAPI_InterCurveCurve: declare class Geom2dAPI_InterCurveCurve

  // Geom2dAPI_InterCurveCurve.constructor (constructor)
  constructor();
  constructor(C1: Geom2d_Curve, Tol?: number);
  constructor(C1: Geom2d_Curve, C2: Geom2d_Curve, Tol?: number);

  // Geom2dAPI_InterCurveCurve.Init (method)
  Init(C1: Geom2d_Curve, C2: Geom2d_Curve, Tol: number): void;
  Init(C1: Geom2d_Curve, Tol: number): void;

  // Geom2dAPI_InterCurveCurve.NbPoints (method)
  NbPoints(): number;

  // Geom2dAPI_InterCurveCurve.Point (method)
  Point(Index: number): gp_Pnt2d;

  // Geom2dAPI_InterCurveCurve.NbSegments (method)
  NbSegments(): number;

  // Geom2dAPI_InterCurveCurve.Segment (method)
  Segment(Index: number): { Curve1: Geom2d_Curve; Curve2: Geom2d_Curve; [Symbol.dispose](): void };

  // Geom2dAPI_InterCurveCurve.Intersector (method)
  Intersector(): Geom2dInt_GInter;

  // Geom2dAPI_InterCurveCurve.delete (method)
  delete(): void;

  // Geom2dAPI_InterCurveCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dAPI_Interpolate: declare class Geom2dAPI_Interpolate

  // Geom2dAPI_Interpolate.constructor (constructor)
  constructor(Points: NCollection_HArray1_gp_Pnt2d, PeriodicFlag: boolean, Tolerance: number);
  constructor(Points: NCollection_HArray1_gp_Pnt2d, Parameters: NCollection_HArray1_double, PeriodicFlag: boolean, Tolerance: number);

  // Geom2dAPI_Interpolate.Load (method)
  Load(InitialTangent: gp_Vec2d, FinalTangent: gp_Vec2d, Scale: boolean): void;
  Load(Tangents: NCollection_Array1_gp_Vec2d, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;

  // Geom2dAPI_Interpolate.Perform (method)
  Perform(): void;

  // Geom2dAPI_Interpolate.Curve (method)
  Curve(): Geom2d_BSplineCurve;

  // Geom2dAPI_Interpolate.IsDone (method)
  IsDone(): boolean;

  // Geom2dAPI_Interpolate.delete (method)
  delete(): void;

  // Geom2dAPI_Interpolate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dAPI_PointsToBSpline: declare class Geom2dAPI_PointsToBSpline

  // Geom2dAPI_PointsToBSpline.constructor (constructor)
  constructor();
  constructor(Points: NCollection_Array1_gp_Pnt2d, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol2D?: number);
  constructor(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol2D?: number);
  constructor(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol2D?: number);
  constructor(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol2D?: number);
  constructor(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);

  // Geom2dAPI_PointsToBSpline.Init (method)
  Init(Points: NCollection_Array1_gp_Pnt2d, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;

  // Geom2dAPI_PointsToBSpline.Curve (method)
  Curve(): Geom2d_BSplineCurve;

  // Geom2dAPI_PointsToBSpline.IsDone (method)
  IsDone(): boolean;

  // Geom2dAPI_PointsToBSpline.delete (method)
  delete(): void;

  // Geom2dAPI_PointsToBSpline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dAPI_ProjectPointOnCurve: declare class Geom2dAPI_ProjectPointOnCurve

  // Geom2dAPI_ProjectPointOnCurve.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt2d, Curve: Geom2d_Curve);
  constructor(P: gp_Pnt2d, Curve: Geom2d_Curve, Umin: number, Usup: number);

  // Geom2dAPI_ProjectPointOnCurve.Init (method)
  Init(P: gp_Pnt2d, Curve: Geom2d_Curve): void;
  Init(P: gp_Pnt2d, Curve: Geom2d_Curve, Umin: number, Usup: number): void;

  // Geom2dAPI_ProjectPointOnCurve.NbPoints (method)
  NbPoints(): number;

  // Geom2dAPI_ProjectPointOnCurve.Point (method)
  Point(Index: number): gp_Pnt2d;

  // Geom2dAPI_ProjectPointOnCurve.Parameter (method)
  Parameter(Index: number): number;
  Parameter(Index: number, U?: number): { U: number };

  // Geom2dAPI_ProjectPointOnCurve.Distance (method)
  Distance(Index: number): number;

  // Geom2dAPI_ProjectPointOnCurve.NearestPoint (method)
  NearestPoint(): gp_Pnt2d;

  // Geom2dAPI_ProjectPointOnCurve.LowerDistanceParameter (method)
  LowerDistanceParameter(): number;

  // Geom2dAPI_ProjectPointOnCurve.LowerDistance (method)
  LowerDistance(): number;

  // Geom2dAPI_ProjectPointOnCurve.Extrema (method)
  Extrema(): Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f;

  // Geom2dAPI_ProjectPointOnCurve.delete (method)
  delete(): void;

  // Geom2dAPI_ProjectPointOnCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
