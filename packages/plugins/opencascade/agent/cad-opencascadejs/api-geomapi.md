# libcascade — GeomAPI

11 top-level symbols. Signatures are verbatim typescript.

GeomAPI: declare class GeomAPI

  constructor

  static To2d(C: Geom_Curve, P: gp_Pln): Geom2d_Curve;

  static To3d(C: Geom2d_Curve, P: gp_Pln): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_ExtremaCurveCurve: declare class GeomAPI_ExtremaCurveCurve

  constructor

  Init(C1: Geom_Curve, C2: Geom_Curve): void;
  Init(C1: Geom_Curve, C2: Geom_Curve, U1min: number, U1max: number, U2min: number, U2max: number): void;
  Init(C1: Geom_Curve, C2: Geom_Curve): void;
  Init(C1: Geom_Curve, C2: Geom_Curve, U1min: number, U1max: number, U2min: number, U2max: number): void;

  NbExtrema(): number;

  Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;

  Parameters(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  Distance(Index: number): number;

  IsParallel(): boolean;

  NearestPoints(P1: gp_Pnt, P2: gp_Pnt): void;

  LowerDistanceParameters(U1?: number, U2?: number): { U1: number; U2: number };

  LowerDistance(): number;

  TotalNearestPoints(P1: gp_Pnt, P2: gp_Pnt): boolean;

  TotalLowerDistanceParameters(U1?: number, U2?: number): { returnValue: boolean; U1: number; U2: number };

  TotalLowerDistance(): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_ExtremaCurveSurface: declare class GeomAPI_ExtremaCurveSurface

  constructor

  Init(Curve: Geom_Curve, Surface: Geom_Surface): void;
  Init(Curve: Geom_Curve, Surface: Geom_Surface, Wmin: number, Wmax: number, Umin: number, Umax: number, Vmin: number, Vmax: number): void;
  Init(Curve: Geom_Curve, Surface: Geom_Surface): void;
  Init(Curve: Geom_Curve, Surface: Geom_Surface, Wmin: number, Wmax: number, Umin: number, Umax: number, Vmin: number, Vmax: number): void;

  NbExtrema(): number;

  Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;

  Parameters(Index: number, W?: number, U?: number, V?: number): { W: number; U: number; V: number };

  Distance(Index: number): number;

  IsParallel(): boolean;

  NearestPoints(PC: gp_Pnt, PS: gp_Pnt): void;

  LowerDistanceParameters(W?: number, U?: number, V?: number): { W: number; U: number; V: number };

  LowerDistance(): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_ExtremaSurfaceSurface: declare class GeomAPI_ExtremaSurfaceSurface

  constructor

  Init(S1: Geom_Surface, S2: Geom_Surface): void;
  Init(S1: Geom_Surface, S2: Geom_Surface, U1min: number, U1max: number, V1min: number, V1max: number, U2min: number, U2max: number, V2min: number, V2max: number): void;
  Init(S1: Geom_Surface, S2: Geom_Surface): void;
  Init(S1: Geom_Surface, S2: Geom_Surface, U1min: number, U1max: number, V1min: number, V1max: number, U2min: number, U2max: number, V2min: number, V2max: number): void;

  NbExtrema(): number;

  Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;

  Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  Distance(Index: number): number;

  IsParallel(): boolean;

  NearestPoints(P1: gp_Pnt, P2: gp_Pnt): void;

  LowerDistanceParameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  LowerDistance(): number;

  Extrema(): Extrema_ExtSS;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_IntCS: declare class GeomAPI_IntCS

  constructor

  Perform(C: Geom_Curve, S: Geom_Surface): void;

  IsDone(): boolean;

  NbPoints(): number;

  Point(Index: number): gp_Pnt;

  Parameters(Index: number, U?: number, V?: number, W?: number): { U: number; V: number; W: number };
  Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };
  Parameters(Index: number, U?: number, V?: number, W?: number): { U: number; V: number; W: number };
  Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

  NbSegments(): number;

  Segment(Index: number): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_IntSS: declare class GeomAPI_IntSS

  constructor

  Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number): void;

  IsDone(): boolean;

  NbLines(): number;

  Line(Index: number): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_Interpolate: declare class GeomAPI_Interpolate

  constructor

  Load(InitialTangent: gp_Vec, FinalTangent: gp_Vec, Scale: boolean): void;
  Load(Tangents: NCollection_Array1_gp_Vec, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;
  Load(InitialTangent: gp_Vec, FinalTangent: gp_Vec, Scale: boolean): void;
  Load(Tangents: NCollection_Array1_gp_Vec, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;

  Perform(): void;

  Curve(): Geom_BSplineCurve;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_PointsToBSpline: declare class GeomAPI_PointsToBSpline

  constructor

  Init(Points: NCollection_Array1_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array1_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;

  Curve(): Geom_BSplineCurve;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_PointsToBSplineSurface: declare class GeomAPI_PointsToBSplineSurface

  constructor

  Init(Points: NCollection_Array2_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number, thePeriodic: boolean): void;
  Init(Points: NCollection_Array2_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number, thePeriodic: boolean): void;
  Init(Points: NCollection_Array2_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number, thePeriodic: boolean): void;
  Init(Points: NCollection_Array2_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number, thePeriodic: boolean): void;
  Init(Points: NCollection_Array2_gp_Pnt, Weight1: number, Weight2: number, Weight3: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;
  Init(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number, DegMin: number, DegMax: number, Continuity: GeomAbs_Shape, Tol3D: number): void;

  Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
  Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
  Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;
  Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
  Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
  Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;
  Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
  Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
  Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;

  Surface(): Geom_BSplineSurface;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_ProjectPointOnCurve: declare class GeomAPI_ProjectPointOnCurve

  constructor

  Init(P: gp_Pnt, Curve: Geom_Curve): void;
  Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
  Init(Curve: Geom_Curve, Umin: number, Usup: number): void;
  Init(P: gp_Pnt, Curve: Geom_Curve): void;
  Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
  Init(Curve: Geom_Curve, Umin: number, Usup: number): void;
  Init(P: gp_Pnt, Curve: Geom_Curve): void;
  Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
  Init(Curve: Geom_Curve, Umin: number, Usup: number): void;

  Perform(P: gp_Pnt): void;

  NbPoints(): number;

  Point(Index: number): gp_Pnt;

  Parameter(Index: number): number;
  Parameter(Index: number, U?: number): { U: number };
  Parameter(Index: number): number;
  Parameter(Index: number, U?: number): { U: number };

  Distance(Index: number): number;

  NearestPoint(): gp_Pnt;

  LowerDistanceParameter(): number;

  LowerDistance(): number;

  Extrema(): Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db;

  delete(): void;

  [Symbol.dispose](): void;

GeomAPI_ProjectPointOnSurf: declare class GeomAPI_ProjectPointOnSurf

  constructor

  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Algo: Extrema_ExtAlgo): void;
  Init(Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;
  Init(P: gp_Pnt, Surface: Geom_Surface, Umin: number, Usup: number, Vmin: number, Vsup: number, Tolerance: number, Algo: Extrema_ExtAlgo): void;

  SetExtremaAlgo(theAlgo: Extrema_ExtAlgo): void;

  SetExtremaFlag(theExtFlag: Extrema_ExtFlag): void;

  Perform(P: gp_Pnt): void;

  IsDone(): boolean;

  NbPoints(): number;

  Point(Index: number): gp_Pnt;

  Parameters(Index: number, U?: number, V?: number): { U: number; V: number };

  Distance(Index: number): number;

  NearestPoint(): gp_Pnt;

  LowerDistanceParameters(U?: number, V?: number): { U: number; V: number };

  LowerDistance(): number;

  delete(): void;

  [Symbol.dispose](): void;
