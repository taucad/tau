# libcascade — GeomAPI (2)

2 top-level symbols. Signatures are verbatim typescript.

// This class implements methods for computing all the orthogonal projections of a 3D point onto a 3D curve
GeomAPI_ProjectPointOnCurve: declare class GeomAPI_ProjectPointOnCurve

constructor

// Init the projection of a point
Init(P: gp_Pnt, Curve: Geom_Curve): void;
Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
Init(Curve: Geom_Curve, Umin: number, Usup: number): void;
Init(P: gp_Pnt, Curve: Geom_Curve): void;
Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
Init(Curve: Geom_Curve, Umin: number, Usup: number): void;
Init(P: gp_Pnt, Curve: Geom_Curve): void;
Init(P: gp_Pnt, Curve: Geom_Curve, Umin: number, Usup: number): void;
Init(Curve: Geom_Curve, Umin: number, Usup: number): void;

// Performs the projection of a point on the current curve
Perform(P: gp_Pnt): void;

// Returns the number of computed orthogonal projection points
NbPoints(): number;

// Returns the orthogonal projection on the curve
Point(Index: number): gp_Pnt;

// Returns the parameter on the curve of the point, which is the orthogonal projection
Parameter(Index: number): number;
Parameter(Index: number, U?: number): { U: number };
Parameter(Index: number): number;
Parameter(Index: number, U?: number): { U: number };

// Computes the distance between the point and its orthogonal projection on the curve
Distance(Index: number): number;

// Returns the nearest orthogonal projection of the point on the curve
NearestPoint(): gp_Pnt;

// Returns the parameter on the curve of the nearest orthogonal projection of the point
LowerDistanceParameter(): number;

// Computes the distance between the point and its nearest orthogonal projection on the curve
LowerDistance(): number;

// return the algorithmic object from Extrema
Extrema(): Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements methods for computing all the orthogonal projections of a point onto a surface
GeomAPI_ProjectPointOnSurf: declare class GeomAPI_ProjectPointOnSurf

constructor

// Init the projection of a point
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

// Sets the Extrema search algorithm - Grad or Tree
SetExtremaAlgo(theAlgo: Extrema_ExtAlgo): void;

// Sets the Extrema search flag - MIN or MAX or MINMAX
SetExtremaFlag(theExtFlag: Extrema_ExtFlag): void;

// Performs the projection of a point on the current surface
Perform(P: gp_Pnt): void;

IsDone(): boolean;

// Returns the number of computed orthogonal projection points
NbPoints(): number;

// Returns the orthogonal projection on the surface
Point(Index: number): gp_Pnt;

// Returns the parameters (U,V) on the surface of the orthogonal projection
Parameters(Index: number, U?: number, V?: number): { U: number; V: number };

// Computes the distance between the point and its orthogonal projection on the surface
Distance(Index: number): number;

// Returns the nearest orthogonal projection of the point on the surface
NearestPoint(): gp_Pnt;

// Returns the parameters (U,V) on the surface of the nearest computed orthogonal projection of the point
LowerDistanceParameters(U?: number, V?: number): { U: number; V: number };

// Computes the distance between the point and its nearest orthogonal projection on the surface
LowerDistance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
