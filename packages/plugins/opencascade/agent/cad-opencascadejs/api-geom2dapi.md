# libcascade — Geom2dAPI

5 top-level symbols. Signatures are verbatim typescript.

// Describes functions for computing all the extrema between two 2D curves
Geom2dAPI_ExtremaCurveCurve: declare class Geom2dAPI_ExtremaCurveCurve

constructor

// Returns the number of extrema computed by this algorithm
NbExtrema(): number;

// Returns the points P1 on the first curve and P2 on the second curve, which are the ends of the extremum of index Index computed by this algorithm
Points(Index: number, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters U1 of the point on the first curve and U2 of the point on the second curve, which are the ends of the extremum of index Index computed by this algorithm
Parameters(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

// Computes the distance between the end points of the extremum of index Index computed by this algorithm
Distance(Index: number): number;

// Returns the points P1 on the first curve and P2 on the second curve, which are the ends of the shortest extremum computed by this algorithm
NearestPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters U1 of the point on the first curve and U2 of the point on the second curve, which are the ends of the shortest extremum computed by this algorithm
LowerDistanceParameters(U1?: number, U2?: number): { U1: number; U2: number };

// Computes the distance between the end points of the shortest extremum computed by this algorithm
LowerDistance(): number;

Extrema(): Extrema_ExtCC2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements methods for computing
Geom2dAPI_InterCurveCurve: declare class Geom2dAPI_InterCurveCurve

constructor

// Initializes an algorithm with the given arguments and computes the intersections between the curves C1
Init(C1: Geom2d_Curve, C2: Geom2d_Curve, Tol: number): void;
Init(C1: Geom2d_Curve, Tol: number): void;
Init(C1: Geom2d_Curve, C2: Geom2d_Curve, Tol: number): void;
Init(C1: Geom2d_Curve, Tol: number): void;

// Returns the number of intersection-points in case of cross intersections
NbPoints(): number;

// Returns the intersection point of index Index
Point(Index: number): gp_Pnt2d;

// Returns the number of tangential intersections
NbSegments(): number;

// Use this syntax only to get solutions of tangential intersection between two curves
Segment(Index: number): { Curve1: Geom2d_Curve; Curve2: Geom2d_Curve; [Symbol.dispose](): void };

// return the algorithmic object from Intersection
Intersector(): Geom2dInt_GInter;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to interpolate a BsplineCurve passing through an array of points, with a C2 Continuity if tangency is not requested at the point
Geom2dAPI_Interpolate: declare class Geom2dAPI_Interpolate

constructor

// Assigns this constrained BSpline curve to be tangential to vectors InitialTangent and FinalTangent at its first and last points respectively (i.e
Load(InitialTangent: gp_Vec2d, FinalTangent: gp_Vec2d, Scale: boolean): void;
Load(Tangents: NCollection_Array1_gp_Vec2d, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;
Load(InitialTangent: gp_Vec2d, FinalTangent: gp_Vec2d, Scale: boolean): void;
Load(Tangents: NCollection_Array1_gp_Vec2d, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;

// Computes the constrained BSpline curve
Perform(): void;

// Returns the computed BSpline curve
Curve(): Geom2d_BSplineCurve;

// Returns true if the constrained BSpline curve is successfully constructed
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to approximate a BsplineCurve passing through an array of points, with a given Continuity
Geom2dAPI_PointsToBSpline: declare class Geom2dAPI_PointsToBSpline

constructor

// Approximate a BSpline Curve passing through an array of Point
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

// Returns the approximate BSpline Curve
Curve(): Geom2d_BSplineCurve;

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements methods for computing all the orthogonal projections of a 2D point onto a 2D curve
Geom2dAPI_ProjectPointOnCurve: declare class Geom2dAPI_ProjectPointOnCurve

constructor

// Initializes this algorithm with the given arguments, and computes the orthogonal projections of a point
Init(P: gp_Pnt2d, Curve: Geom2d_Curve): void;
Init(P: gp_Pnt2d, Curve: Geom2d_Curve, Umin: number, Usup: number): void;
Init(P: gp_Pnt2d, Curve: Geom2d_Curve): void;
Init(P: gp_Pnt2d, Curve: Geom2d_Curve, Umin: number, Usup: number): void;

// return the number of of computed orthogonal projectionn points
NbPoints(): number;

// Returns the orthogonal projection on the curve
Point(Index: number): gp_Pnt2d;

// Returns the parameter on the curve of a point which is the orthogonal projection
Parameter(Index: number): number;
Parameter(Index: number, U?: number): { U: number };
Parameter(Index: number): number;
Parameter(Index: number, U?: number): { U: number };

// Computes the distance between the point and its computed orthogonal projection on the curve
Distance(Index: number): number;

// Returns the nearest orthogonal projection of the point on the curve
NearestPoint(): gp_Pnt2d;

// Returns the parameter on the curve of the nearest orthogonal projection of the point
LowerDistanceParameter(): number;

// Computes the distance between the point and its nearest orthogonal projection on the curve
LowerDistance(): number;

// return the algorithmic object from Extrema
Extrema(): Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
