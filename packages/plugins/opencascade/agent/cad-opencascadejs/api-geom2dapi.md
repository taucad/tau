# libcascade — Geom2dAPI

5 top-level symbols. Signatures are verbatim typescript.

Geom2dAPI_ExtremaCurveCurve: declare class Geom2dAPI_ExtremaCurveCurve

  constructor

  NbExtrema(): number;

  Points(Index: number, P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  Parameters(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  Distance(Index: number): number;

  NearestPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  LowerDistanceParameters(U1?: number, U2?: number): { U1: number; U2: number };

  LowerDistance(): number;

  Extrema(): Extrema_ExtCC2d;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dAPI_InterCurveCurve: declare class Geom2dAPI_InterCurveCurve

  constructor

  Init(C1: Geom2d_Curve, C2: Geom2d_Curve, Tol: number): void;
  Init(C1: Geom2d_Curve, Tol: number): void;
  Init(C1: Geom2d_Curve, C2: Geom2d_Curve, Tol: number): void;
  Init(C1: Geom2d_Curve, Tol: number): void;

  NbPoints(): number;

  Point(Index: number): gp_Pnt2d;

  NbSegments(): number;

  Segment(Index: number): { Curve1: Geom2d_Curve; Curve2: Geom2d_Curve; [Symbol.dispose](): void };

  Intersector(): Geom2dInt_GInter;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dAPI_Interpolate: declare class Geom2dAPI_Interpolate

  constructor

  Load(InitialTangent: gp_Vec2d, FinalTangent: gp_Vec2d, Scale: boolean): void;
  Load(Tangents: NCollection_Array1_gp_Vec2d, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;
  Load(InitialTangent: gp_Vec2d, FinalTangent: gp_Vec2d, Scale: boolean): void;
  Load(Tangents: NCollection_Array1_gp_Vec2d, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;

  Perform(): void;

  Curve(): Geom2d_BSplineCurve;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dAPI_PointsToBSpline: declare class Geom2dAPI_PointsToBSpline

  constructor

  Init(Points: NCollection_Array1_gp_Pnt2d, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(YValues: NCollection_Array1_double, X0: number, DX: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt2d, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol2D: number): void;

  Curve(): Geom2d_BSplineCurve;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dAPI_ProjectPointOnCurve: declare class Geom2dAPI_ProjectPointOnCurve

  constructor

  Init(P: gp_Pnt2d, Curve: Geom2d_Curve): void;
  Init(P: gp_Pnt2d, Curve: Geom2d_Curve, Umin: number, Usup: number): void;
  Init(P: gp_Pnt2d, Curve: Geom2d_Curve): void;
  Init(P: gp_Pnt2d, Curve: Geom2d_Curve, Umin: number, Usup: number): void;

  NbPoints(): number;

  Point(Index: number): gp_Pnt2d;

  Parameter(Index: number): number;
  Parameter(Index: number, U?: number): { U: number };
  Parameter(Index: number): number;
  Parameter(Index: number, U?: number): { U: number };

  Distance(Index: number): number;

  NearestPoint(): gp_Pnt2d;

  LowerDistanceParameter(): number;

  LowerDistance(): number;

  Extrema(): Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f;

  delete(): void;

  [Symbol.dispose](): void;
