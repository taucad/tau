# libcascade — GeomAPI

11 top-level symbols. Signatures are verbatim typescript.

GeomAPI: declare class GeomAPI

  // GeomAPI.constructor (constructor)
  constructor();

  // GeomAPI.To2d (method)
  static To2d(C: Geom_Curve, P: gp_Pln): Geom2d_Curve;

  // GeomAPI.To3d (method)
  static To3d(C: Geom2d_Curve, P: gp_Pln): Geom_Curve;

  // GeomAPI.delete (method)
  delete(): void;

  // GeomAPI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_ExtremaCurveCurve: declare class GeomAPI_ExtremaCurveCurve

  // GeomAPI_ExtremaCurveCurve.constructor (constructor)
  constructor();
  constructor(C1: Geom_Curve, C2: Geom_Curve);
  constructor(C1: Geom_Curve, C2: Geom_Curve, U1min: number, U1max: number, U2min: number, U2max: number);

  // GeomAPI_ExtremaCurveCurve.Init (method)
  Init(C1: Geom_Curve, C2: Geom_Curve): void;
  Init(C1: Geom_Curve, C2: Geom_Curve, U1min: number, U1max: number, U2min: number, U2max: number): void;

  // GeomAPI_ExtremaCurveCurve.NbExtrema (method)
  NbExtrema(): number;

  // GeomAPI_ExtremaCurveCurve.Points (method)
  Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;

  // GeomAPI_ExtremaCurveCurve.Parameters (method)
  Parameters(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  // GeomAPI_ExtremaCurveCurve.Distance (method)
  Distance(Index: number): number;

  // GeomAPI_ExtremaCurveCurve.IsParallel (method)
  IsParallel(): boolean;

  // GeomAPI_ExtremaCurveCurve.NearestPoints (method)
  NearestPoints(P1: gp_Pnt, P2: gp_Pnt): void;

  // GeomAPI_ExtremaCurveCurve.LowerDistanceParameters (method)
  LowerDistanceParameters(U1?: number, U2?: number): { U1: number; U2: number };

  // GeomAPI_ExtremaCurveCurve.LowerDistance (method)
  LowerDistance(): number;

  // GeomAPI_ExtremaCurveCurve.TotalNearestPoints (method)
  TotalNearestPoints(P1: gp_Pnt, P2: gp_Pnt): boolean;

  // GeomAPI_ExtremaCurveCurve.TotalLowerDistanceParameters (method)
  TotalLowerDistanceParameters(U1?: number, U2?: number): { returnValue: boolean; U1: number; U2: number };

  // GeomAPI_ExtremaCurveCurve.TotalLowerDistance (method)
  TotalLowerDistance(): number;

  // GeomAPI_ExtremaCurveCurve.delete (method)
  delete(): void;

  // GeomAPI_ExtremaCurveCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_ExtremaCurveSurface: declare class GeomAPI_ExtremaCurveSurface

  // GeomAPI_ExtremaCurveSurface.constructor (constructor)
  constructor();
  constructor(Curve: Geom_Curve, Surface: Geom_Surface);
  constructor(Curve: Geom_Curve, Surface: Geom_Surface, Wmin: number, Wmax: number, Umin: number, Umax: number, Vmin: number, Vmax: number);

  // GeomAPI_ExtremaCurveSurface.Init (method)
  Init(Curve: Geom_Curve, Surface: Geom_Surface): void;
  Init(Curve: Geom_Curve, Surface: Geom_Surface, Wmin: number, Wmax: number, Umin: number, Umax: number, Vmin: number, Vmax: number): void;

  // GeomAPI_ExtremaCurveSurface.NbExtrema (method)
  NbExtrema(): number;

  // GeomAPI_ExtremaCurveSurface.Points (method)
  Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;

  // GeomAPI_ExtremaCurveSurface.Parameters (method)
  Parameters(Index: number, W?: number, U?: number, V?: number): { W: number; U: number; V: number };

  // GeomAPI_ExtremaCurveSurface.Distance (method)
  Distance(Index: number): number;

  // GeomAPI_ExtremaCurveSurface.IsParallel (method)
  IsParallel(): boolean;

  // GeomAPI_ExtremaCurveSurface.NearestPoints (method)
  NearestPoints(PC: gp_Pnt, PS: gp_Pnt): void;

  // GeomAPI_ExtremaCurveSurface.LowerDistanceParameters (method)
  LowerDistanceParameters(W?: number, U?: number, V?: number): { W: number; U: number; V: number };

  // GeomAPI_ExtremaCurveSurface.LowerDistance (method)
  LowerDistance(): number;

  // GeomAPI_ExtremaCurveSurface.delete (method)
  delete(): void;

  // GeomAPI_ExtremaCurveSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_ExtremaSurfaceSurface: declare class GeomAPI_ExtremaSurfaceSurface

  // GeomAPI_ExtremaSurfaceSurface.constructor (constructor)
  constructor();
  constructor(S1: Geom_Surface, S2: Geom_Surface);
  constructor(S1: Geom_Surface, S2: Geom_Surface, U1min: number, U1max: number, V1min: number, V1max: number, U2min: number, U2max: number, V2min: number, V2max: number);

  // GeomAPI_ExtremaSurfaceSurface.Init (method)
  Init(S1: Geom_Surface, S2: Geom_Surface): void;
  Init(S1: Geom_Surface, S2: Geom_Surface, U1min: number, U1max: number, V1min: number, V1max: number, U2min: number, U2max: number, V2min: number, V2max: number): void;

  // GeomAPI_ExtremaSurfaceSurface.NbExtrema (method)
  NbExtrema(): number;

  // GeomAPI_ExtremaSurfaceSurface.Points (method)
  Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;

  // GeomAPI_ExtremaSurfaceSurface.Parameters (method)
  Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  // GeomAPI_ExtremaSurfaceSurface.Distance (method)
  Distance(Index: number): number;

  // GeomAPI_ExtremaSurfaceSurface.IsParallel (method)
  IsParallel(): boolean;

  // GeomAPI_ExtremaSurfaceSurface.NearestPoints (method)
  NearestPoints(P1: gp_Pnt, P2: gp_Pnt): void;

  // GeomAPI_ExtremaSurfaceSurface.LowerDistanceParameters (method)
  LowerDistanceParameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  // GeomAPI_ExtremaSurfaceSurface.LowerDistance (method)
  LowerDistance(): number;

  // GeomAPI_ExtremaSurfaceSurface.Extrema (method)
  Extrema(): Extrema_ExtSS;

  // GeomAPI_ExtremaSurfaceSurface.delete (method)
  delete(): void;

  // GeomAPI_ExtremaSurfaceSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_IntCS: declare class GeomAPI_IntCS

  // GeomAPI_IntCS.constructor (constructor)
  constructor();
  constructor(C: Geom_Curve, S: Geom_Surface);

  // GeomAPI_IntCS.Perform (method)
  Perform(C: Geom_Curve, S: Geom_Surface): void;

  // GeomAPI_IntCS.IsDone (method)
  IsDone(): boolean;

  // GeomAPI_IntCS.NbPoints (method)
  NbPoints(): number;

  // GeomAPI_IntCS.Point (method)
  Point(Index: number): gp_Pnt;

  // GeomAPI_IntCS.Parameters (method)
  Parameters(Index: number, U?: number, V?: number, W?: number): { U: number; V: number; W: number };
  Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  // GeomAPI_IntCS.NbSegments (method)
  NbSegments(): number;

  // GeomAPI_IntCS.Segment (method)
  Segment(Index: number): Geom_Curve;

  // GeomAPI_IntCS.delete (method)
  delete(): void;

  // GeomAPI_IntCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_IntSS: declare class GeomAPI_IntSS

  // GeomAPI_IntSS.constructor (constructor)
  constructor();
  constructor(S1: Geom_Surface, S2: Geom_Surface, Tol: number);

  // GeomAPI_IntSS.Perform (method)
  Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number): void;

  // GeomAPI_IntSS.IsDone (method)
  IsDone(): boolean;

  // GeomAPI_IntSS.NbLines (method)
  NbLines(): number;

  // GeomAPI_IntSS.Line (method)
  Line(Index: number): Geom_Curve;

  // GeomAPI_IntSS.delete (method)
  delete(): void;

  // GeomAPI_IntSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_Interpolate: declare class GeomAPI_Interpolate

  // GeomAPI_Interpolate.constructor (constructor)
  constructor(Points: NCollection_HArray1_gp_Pnt, PeriodicFlag: boolean, Tolerance: number);
  constructor(Points: NCollection_HArray1_gp_Pnt, Parameters: NCollection_HArray1_double, PeriodicFlag: boolean, Tolerance: number);

  // GeomAPI_Interpolate.Load (method)
  Load(InitialTangent: gp_Vec, FinalTangent: gp_Vec, Scale: boolean): void;
  Load(Tangents: NCollection_Array1_gp_Vec, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;

  // GeomAPI_Interpolate.Perform (method)
  Perform(): void;

  // GeomAPI_Interpolate.Curve (method)
  Curve(): Geom_BSplineCurve;

  // GeomAPI_Interpolate.IsDone (method)
  IsDone(): boolean;

  // GeomAPI_Interpolate.delete (method)
  delete(): void;

  // GeomAPI_Interpolate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_PointsToBSpline: declare class GeomAPI_PointsToBSpline

  // GeomAPI_PointsToBSpline.constructor (constructor)
  constructor();
  constructor(Points: NCollection_Array1_gp_Pnt, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);
  constructor(Points: NCollection_Array1_gp_Pnt, ParType: Approx_ParametrizationType, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);
  constructor(Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);
  constructor(Points: NCollection_Array1_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);

  // GeomAPI_PointsToBSpline.Init (method)
  Init(Points: NCollection_Array1_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;

  // GeomAPI_PointsToBSpline.Curve (method)
  Curve(): Geom_BSplineCurve;

  // GeomAPI_PointsToBSpline.IsDone (method)
  IsDone(): boolean;

  // GeomAPI_PointsToBSpline.delete (method)
  delete(): void;

  // GeomAPI_PointsToBSpline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_PointsToBSplineSurface: declare class GeomAPI_PointsToBSplineSurface

  // GeomAPI_PointsToBSplineSurface.constructor (constructor)
  constructor();
  constructor(Points: NCollection_Array2_gp_Pnt, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);
  constructor(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);
  constructor(Points: NCollection_Array2_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);
  constructor(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number, DegMin?: number, DegMax?: number, Continuity?: GeomAbs_Shape, Tol3D?: number);

  // GeomAPI_PointsToBSplineSurface.Init (method)
  Init(Points: NCollection_Array2_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number, thePeriodic: boolean): void;
  Init(Points: NCollection_Array2_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;

  // GeomAPI_PointsToBSplineSurface.Interpolate (method)
  Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
  Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
  Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;

  // GeomAPI_PointsToBSplineSurface.Surface (method)
  Surface(): Geom_BSplineSurface;

  // GeomAPI_PointsToBSplineSurface.IsDone (method)
  IsDone(): boolean;

  // GeomAPI_PointsToBSplineSurface.delete (method)
  delete(): void;

  // GeomAPI_PointsToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_ProjectPointOnCurve: declare class GeomAPI_ProjectPointOnCurve

  // GeomAPI_ProjectPointOnCurve.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, Curve: Geom_Curve);
  constructor(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number);

  // GeomAPI_ProjectPointOnCurve.Init (method)
  Init(P: gp_Pnt, Curve: Geom_Curve): void;
  Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
  Init(Curve: Geom_Curve, Umin: number, Usup: number): void;

  // GeomAPI_ProjectPointOnCurve.Perform (method)
  Perform(P: gp_Pnt): void;

  // GeomAPI_ProjectPointOnCurve.NbPoints (method)
  NbPoints(): number;

  // GeomAPI_ProjectPointOnCurve.Point (method)
  Point(Index: number): gp_Pnt;

  // GeomAPI_ProjectPointOnCurve.Parameter (method)
  Parameter(Index: number): number;
  Parameter(Index: number, U?: number): { U: number };

  // GeomAPI_ProjectPointOnCurve.Distance (method)
  Distance(Index: number): number;

  // GeomAPI_ProjectPointOnCurve.NearestPoint (method)
  NearestPoint(): gp_Pnt;

  // GeomAPI_ProjectPointOnCurve.LowerDistanceParameter (method)
  LowerDistanceParameter(): number;

  // GeomAPI_ProjectPointOnCurve.LowerDistance (method)
  LowerDistance(): number;

  // GeomAPI_ProjectPointOnCurve.Extrema (method)
  Extrema(): Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db;

  // GeomAPI_ProjectPointOnCurve.delete (method)
  delete(): void;

  // GeomAPI_ProjectPointOnCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomAPI_ProjectPointOnSurf: declare class GeomAPI_ProjectPointOnSurf

  // GeomAPI_ProjectPointOnSurf.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, Surface: Geom_Surface, Algo?: Extrema_ExtAlgo);
  constructor(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo?: Extrema_ExtAlgo);
  constructor(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo?: Extrema_ExtAlgo);
  constructor(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo?: Extrema_ExtAlgo);

  // GeomAPI_ProjectPointOnSurf.Init (method)
  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;

  // GeomAPI_ProjectPointOnSurf.SetExtremaAlgo (method)
  SetExtremaAlgo(theAlgo: Extrema_ExtAlgo): void;

  // GeomAPI_ProjectPointOnSurf.SetExtremaFlag (method)
  SetExtremaFlag(theExtFlag: Extrema_ExtFlag): void;

  // GeomAPI_ProjectPointOnSurf.Perform (method)
  Perform(P: gp_Pnt): void;

  // GeomAPI_ProjectPointOnSurf.IsDone (method)
  IsDone(): boolean;

  // GeomAPI_ProjectPointOnSurf.NbPoints (method)
  NbPoints(): number;

  // GeomAPI_ProjectPointOnSurf.Point (method)
  Point(Index: number): gp_Pnt;

  // GeomAPI_ProjectPointOnSurf.Parameters (method)
  Parameters(Index: number, U?: number, V?: number): { U: number; V: number };

  // GeomAPI_ProjectPointOnSurf.Distance (method)
  Distance(Index: number): number;

  // GeomAPI_ProjectPointOnSurf.NearestPoint (method)
  NearestPoint(): gp_Pnt;

  // GeomAPI_ProjectPointOnSurf.LowerDistanceParameters (method)
  LowerDistanceParameters(U?: number, V?: number): { U: number; V: number };

  // GeomAPI_ProjectPointOnSurf.LowerDistance (method)
  LowerDistance(): number;

  // GeomAPI_ProjectPointOnSurf.delete (method)
  delete(): void;

  // GeomAPI_ProjectPointOnSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
