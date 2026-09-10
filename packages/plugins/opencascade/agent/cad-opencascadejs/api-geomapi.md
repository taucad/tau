# libcascade — GeomAPI

9 top-level symbols. Signatures are verbatim typescript.

// The {@link GeomAPI`GeomAPI`} package provides an Application Programming Interface for the Geometry
GeomAPI: declare class GeomAPI

constructor

// This function builds (in the parametric space of the plane P) a 2D curve equivalent to the 3D curve C
static To2d(C: Geom_Curve, P: gp_Pln): Geom2d_Curve;

// Builds a 3D curve equivalent to the 2D curve C described in the parametric space defined by the local coordinate system of plane P
static To3d(C: Geom2d_Curve, P: gp_Pln): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for computing all the extrema between two 3D curves
GeomAPI_ExtremaCurveCurve: declare class GeomAPI_ExtremaCurveCurve

constructor

// Initializes this algorithm with the given arguments and computes the extrema between the curves C1 and C2
Init(C1: Geom_Curve, C2: Geom_Curve): void;
Init(C1: Geom_Curve, C2: Geom_Curve, U1min: number, U1max: number, U2min: number, U2max: number): void;
Init(C1: Geom_Curve, C2: Geom_Curve): void;
Init(C1: Geom_Curve, C2: Geom_Curve, U1min: number, U1max: number, U2min: number, U2max: number): void;

// Returns the number of extrema computed by this algorithm
NbExtrema(): number;

// Returns the points P1 on the first curve and P2 on the second curve, which are the ends of the extremum of index Index computed by this algorithm
Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters U1 of the point on the first curve and U2 of the point on the second curve, which are the ends of the extremum of index Index computed by this algorithm
Parameters(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

// Computes the distance between the end points of the extremum of index Index computed by this algorithm
Distance(Index: number): number;

// Returns True if the two curves are parallel
IsParallel(): boolean;

// Returns the points P1 on the first curve and P2 on the second curve, which are the ends of the shortest extremum computed by this algorithm
NearestPoints(P1: gp_Pnt, P2: gp_Pnt): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters U1 of the point on the first curve and U2 of the point on the second curve, which are the ends of the shortest extremum computed by this algorithm
LowerDistanceParameters(U1?: number, U2?: number): { U1: number; U2: number };

// Computes the distance between the end points of the shortest extremum computed by this algorithm
LowerDistance(): number;

// set in <P1> and <P2> the couple solution points such a the distance [P1,P2] is the minimum
TotalNearestPoints(P1: gp_Pnt, P2: gp_Pnt): boolean;
// P1: Mutated in place
// P2: Mutated in place

// set in <U1> and <U2> the parameters of the couple solution points which represents the total nearest solution
TotalLowerDistanceParameters(U1?: number, U2?: number): { returnValue: boolean; U1: number; U2: number };

// return the distance of the total nearest couple solution point
TotalLowerDistance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for computing all the extrema between a curve and a surface
GeomAPI_ExtremaCurveSurface: declare class GeomAPI_ExtremaCurveSurface

constructor

// Computes the extrema distances between the curve `and the surface .` Computes the extrema distances between the curve `and the surface
Init(Curve: Geom_Curve, Surface: Geom_Surface): void;
Init(Curve: Geom_Curve, Surface: Geom_Surface, Wmin: number, Wmax: number, Umin: number, Umax: number, Vmin: number, Vmax: number): void;
Init(Curve: Geom_Curve, Surface: Geom_Surface): void;
Init(Curve: Geom_Curve, Surface: Geom_Surface, Wmin: number, Wmax: number, Umin: number, Umax: number, Vmin: number, Vmax: number): void;

// Returns the number of extrema computed by this algorithm
NbExtrema(): number;

// Returns the points P1 on the curve and P2 on the surface, which are the ends of the extremum of index Index computed by this algorithm
Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters W of the point on the curve, and (U,V) of the point on the surface, which are the ends of the extremum of index Index computed by this algorithm
Parameters(Index: number, W?: number, U?: number, V?: number): { W: number; U: number; V: number };

// Computes the distance between the end points of the extremum of index Index computed by this algorithm
Distance(Index: number): number;

// Returns True if the curve is on a parallel surface
IsParallel(): boolean;

// Returns the points PC on the curve and PS on the surface, which are the ends of the shortest extremum computed by this algorithm
NearestPoints(PC: gp_Pnt, PS: gp_Pnt): void;
// PC: Mutated in place
// PS: Mutated in place

// Returns the parameters W of the point on the curve and (U,V) of the point on the surface, which are the ends of the shortest extremum computed by this algorithm
LowerDistanceParameters(W?: number, U?: number, V?: number): { W: number; U: number; V: number };

// Computes the distance between the end points of the shortest extremum computed by this algorithm
LowerDistance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions for computing all the extrema between two surfaces
GeomAPI_ExtremaSurfaceSurface: declare class GeomAPI_ExtremaSurfaceSurface

constructor

// Initializes this algorithm with the given arguments and computes the extrema distances between the surfaces <S1> and <S2> Initializes this algorithm with the given arguments and computes the extrema distances between - the portion of the surface S1 limited by the two values of parameter (U1min,U1max) in the u parametric direction, and by the two values of parameter (V1min,V1max) in the v parametric direction, and
Init(S1: Geom_Surface, S2: Geom_Surface): void;
Init(S1: Geom_Surface, S2: Geom_Surface, U1min: number, U1max: number, V1min: number, V1max: number, U2min: number, U2max: number, V2min: number, V2max: number): void;
Init(S1: Geom_Surface, S2: Geom_Surface): void;
Init(S1: Geom_Surface, S2: Geom_Surface, U1min: number, U1max: number, V1min: number, V1max: number, U2min: number, U2max: number, V2min: number, V2max: number): void;

// Returns the number of extrema computed by this algorithm
NbExtrema(): number;

// Returns the points P1 on the first surface and P2 on the second surface, which are the ends of the extremum of index Index computed by this algorithm
Points(Index: number, P1: gp_Pnt, P2: gp_Pnt): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters (U1,V1) of the point on the first surface, and (U2,V2) of the point on the second surface, which are the ends of the extremum of index Index computed by this algorithm
Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

// Computes the distance between the end points of the extremum of index Index computed by this algorithm
Distance(Index: number): number;

// Returns True if the surfaces are parallel
IsParallel(): boolean;

// Returns the points P1 on the first surface and P2 on the second surface, which are the ends of the shortest extremum computed by this algorithm
NearestPoints(P1: gp_Pnt, P2: gp_Pnt): void;
// P1: Mutated in place
// P2: Mutated in place

// Returns the parameters (U1,V1) of the point on the first surface and (U2,V2) of the point on the second surface, which are the ends of the shortest extremum computed by this algorithm
LowerDistanceParameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

// Computes the distance between the end points of the shortest extremum computed by this algorithm
LowerDistance(): number;

// return the algorithmic object from Extrema
Extrema(): Extrema_ExtSS;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements methods for computing intersection points and segments between a
GeomAPI_IntCS: declare class GeomAPI_IntCS

constructor

// This function Initializes an algorithm with the curve C and the surface S and computes the intersections between C and S
Perform(C: Geom_Curve, S: Geom_Surface): void;

// Returns true if the intersections are successfully computed
IsDone(): boolean;

// Returns the number of Intersection Points if IsDone returns True
NbPoints(): number;

// Returns the Intersection Point of range <Index>in case of cross intersection
Point(Index: number): gp_Pnt;

// Returns parameter W on the curve and (parameters U,V) on the surface of the computed intersection point of index Index in case of cross intersection
Parameters(Index: number, U?: number, V?: number, W?: number): { U: number; V: number; W: number };
Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };
Parameters(Index: number, U?: number, V?: number, W?: number): { U: number; V: number; W: number };
Parameters(Index: number, U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

// Returns the number of computed intersection segments in case of tangential intersection
NbSegments(): number;

// Returns the computed intersection segment of index Index in case of tangential intersection
Segment(Index: number): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements methods for computing the intersection curves between two surfaces
GeomAPI_IntSS: declare class GeomAPI_IntSS

constructor

// Initializes an algorithm with the given arguments and computes the intersection curves between the two surfaces S1 and S2
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number): void;

// Returns True if the intersection was successful
IsDone(): boolean;

// Returns the number of computed intersection curves
NbLines(): number;

// Returns the computed intersection curve of index Index
Line(Index: number): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to interpolate a BsplineCurve passing through an array of points, with a C2 Continuity if tangency is not requested at the point
GeomAPI_Interpolate: declare class GeomAPI_Interpolate

constructor

// Assigns this constrained BSpline curve to be tangential to vectors InitialTangent and FinalTangent at its first and last points respectively (i.e
Load(InitialTangent: gp_Vec, FinalTangent: gp_Vec, Scale: boolean): void;
Load(Tangents: NCollection_Array1_gp_Vec, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;
Load(InitialTangent: gp_Vec, FinalTangent: gp_Vec, Scale: boolean): void;
Load(Tangents: NCollection_Array1_gp_Vec, TangentFlags: NCollection_HArray1_bool, Scale: boolean): void;

// Computes the constrained BSpline curve
Perform(): void;

// Returns the computed BSpline curve
Curve(): Geom_BSplineCurve;

// Returns true if the constrained BSpline curve is successfully constructed
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to approximate a BsplineCurve passing through an array of points, with a given Continuity
GeomAPI_PointsToBSpline: declare class GeomAPI_PointsToBSpline

constructor

// Approximate a BSpline Curve passing through an array of Point
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

// Returns the computed BSpline curve
Curve(): Geom_BSplineCurve;

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to approximate or interpolate a BSplineSurface passing through an Array2 of points, with a given continuity
GeomAPI_PointsToBSplineSurface: declare class GeomAPI_PointsToBSplineSurface

constructor

// Approximates a BSpline Surface passing through an array of Point
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

// Interpolates a BSpline Surface passing through an array of Point
Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;
Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;
Interpolate(Points: NCollection_Array2_gp_Pnt, thePeriodic: boolean): void;
Interpolate(Points: NCollection_Array2_gp_Pnt, ParType: Approx_ParametrizationType, thePeriodic: boolean): void;
Interpolate(ZPoints: NCollection_Array2_double, X0: number, dX: number, Y0: number, dY: number): void;

// Returns the approximate BSpline Surface
Surface(): Geom_BSplineSurface;

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
