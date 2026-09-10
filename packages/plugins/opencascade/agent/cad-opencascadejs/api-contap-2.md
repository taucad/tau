# libcascade — Contap (2)

5 top-level symbols. Signatures are verbatim typescript.

Contap_TheIWalking: declare class Contap_TheIWalking

constructor

// Deflection is the maximum deflection admitted between two consecutive points on a resulting polyline
SetTolerance(Epsilon: number, Deflection: number, Step: number): void;

// Searches a set of polylines starting on a point of Pnts1 or Pnts2
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: Contap_SurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
// Func: Mutated in place

// Returns true if the calculus was successful
IsDone(): boolean;

// Returns the number of resulting polylines
NbLines(): number;

// Returns the polyline of range Index
Value(Index: number): Contap_TheIWLineOfTheIWalking;

// Returns the number of points belonging to Pnts on which no line starts or ends
NbSinglePnts(): number;

// Returns the point of range Index
SinglePnt(Index: number): IntSurf_PathPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_ThePathPointOfTheSearch: declare class Contap_ThePathPointOfTheSearch

constructor

SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;
SetValue(P: gp_Pnt, Tol: number, V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d, Parameter: number): void;
SetValue(P: gp_Pnt, Tol: number, A: Adaptor2d_Curve2d, Parameter: number): void;

Value(): gp_Pnt;

Tolerance(): number;

IsNew(): boolean;

Vertex(): Adaptor3d_HVertex;

Arc(): Adaptor2d_Curve2d;

Parameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_TheSearch: declare class Contap_TheSearch

constructor

// Algorithm to find the points and parts of curves of Domain (domain of of restriction of a surface) which verify F = 0
Perform(F: Contap_ArcFunction, Domain: Adaptor3d_TopolTool, TolBoundary: number, TolTangency: number, RecheckOnRegularity: boolean): void;
// F: Mutated in place

// Returns True if the calculus was successful
IsDone(): boolean;

// Returns true if all arc of the Arcs are solution (inside the surface)
AllArcSolution(): boolean;

// Returns the number of resulting points
NbPoints(): number;

// Returns the resulting point of range Index
Point(Index: number): Contap_ThePathPointOfTheSearch;

// Returns the number of the resulting segments
NbSegments(): number;

// Returns the resulting segment of range Index
Segment(Index: number): Contap_TheSegmentOfTheSearch;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_TheSearchInside: declare class Contap_TheSearchInside

constructor

Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;
Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
Perform(F: Contap_SurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;

IsDone(): boolean;

// Returns the number of points
NbPoints(): number;

// Returns the point of range Index
Value(Index: number): IntSurf_InteriorPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_TheSegmentOfTheSearch: declare class Contap_TheSegmentOfTheSearch

constructor

// Defines the concerned arc
SetValue(A: Adaptor2d_Curve2d): void;

// Defines the first point or the last point, depending on the value of the boolean First
SetLimitPoint(V: Contap_ThePathPointOfTheSearch, First: boolean): void;

// Returns the geometric curve on the surface 's domain which is solution
Curve(): Adaptor2d_Curve2d;

// Returns True if there is a vertex (ThePathPoint) defining the lowest valid parameter on the arc
HasFirstPoint(): boolean;

// Returns the first point
FirstPoint(): Contap_ThePathPointOfTheSearch;

// Returns True if there is a vertex (ThePathPoint) defining the greatest valid parameter on the arc
HasLastPoint(): boolean;

// Returns the last point
LastPoint(): Contap_ThePathPointOfTheSearch;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
