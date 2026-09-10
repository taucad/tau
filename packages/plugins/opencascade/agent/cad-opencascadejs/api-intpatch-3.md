# libcascade — IntPatch (3)

13 top-level symbols. Signatures are verbatim typescript.

IntPatch_SpecialPoints: declare class IntPatch_SpecialPoints

constructor

// Adds the point defined as intersection of two isolines (U = 0 and V = 0) on theQSurf in theLine
static AddCrossUVIsoPoint(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theTol3d: number, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;
// theAddedPoint: Mutated in place

// Adds the point lain strictly in the isoline U = 0 or V = 0 of theQSurf, in theLine
static AddPointOnUorVIso(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theIsU: boolean, theIsoParameter: number, theToler: math_VectorBase_double, theInitPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;
// theAddedPoint: Mutated in place

// Computes the pole of sphere to add it in the intersection line
static AddSingularPole(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, thePtIso: IntSurf_PntOn2S, theVertex: IntPatch_Point, theAddedPoint: IntSurf_PntOn2S, theIsReversed: boolean, theIsReqRefCheck: boolean): boolean;
// theVertex: Mutated in place
// theAddedPoint: Mutated in place

// Special point has already been added in the line
static ContinueAfterSpecialPoint(theQSurf: Adaptor3d_Surface, thePSurf: Adaptor3d_Surface, theRefPt: IntSurf_PntOn2S, theSPType: IntPatch_SpecPntType, theTol2D: number, theNewPoint: IntSurf_PntOn2S, theIsReversed: boolean): boolean;
// theNewPoint: Mutated in place

// Sets theNewPoint parameters in 2D-space the closest to theRefPoint with help of adding/subtracting corresponding periods
static AdjustPointAndVertex(theRefPoint: IntSurf_PntOn2S, theArrPeriods: [number, number, number, number], theNewPoint: IntSurf_PntOn2S, theVertex: IntPatch_Point): void;
// theNewPoint: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_TheIWLineOfTheIWalking: declare class IntPatch_TheIWLineOfTheIWalking extends Standard_Transient

constructor

// reverse the points in the line
Reverse(): void;

// Cut the line at the point of rank Index
Cut(Index: number): void;

// Add a point in the line
AddPoint(P: IntSurf_PntOn2S): void;

AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

AddStatusFirstLast(Closed: boolean, HasFirst: boolean, HasLast: boolean): void;

AddStatusLast(HasLast: boolean): void;
AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
AddStatusLast(HasLast: boolean): void;
AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

// associate the index of the point on the line with the index of the point passing through the starting iterator
AddIndexPassing(Index: number): void;

SetTangentVector(V: gp_Vec, Index: number): void;

SetTangencyAtBegining(IsTangent: boolean): void;

SetTangencyAtEnd(IsTangent: boolean): void;

// Returns the number of points of the line (including first point and end point
NbPoints(): number;

// Returns the point of range Index
Value(Index: number): IntSurf_PntOn2S;

// Returns the LineOn2S contained in the walking line
Line(): IntSurf_LineOn2S;

// Returns True if the line is closed
IsClosed(): boolean;

// Returns True if the first point of the line is a marching point
HasFirstPoint(): boolean;

// Returns True if the end point of the line is a marching point (Point from IntWS)
HasLastPoint(): boolean;

// Returns the first point of the line when it is a marching point
FirstPoint(): IntSurf_PathPoint;

// Returns the Index of first point of the line when it is a marching point
FirstPointIndex(): number;

// Returns the last point of the line when it is a marching point
LastPoint(): IntSurf_PathPoint;

// Returns the index of last point of the line when it is a marching point
LastPointIndex(): number;

// returns the number of points belonging to Pnts1 which are passing point
NbPassingPoint(): number;

// returns the index of the point belonging to the line which is associated to the passing point belonging to Pnts1 an exception is raised if Index > `NbPassingPoint()`
PassingPoint(Index: number, IndexLine?: number, IndexPnts?: number): { IndexLine: number; IndexPnts: number };

TangentVector(Index?: number): { returnValue: gp_Vec; Index: number; [Symbol.dispose](): void };

IsTangentAtBegining(): boolean;

IsTangentAtEnd(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_TheIWalking: declare class IntPatch_TheIWalking

constructor

// Deflection is the maximum deflection admitted between two consecutive points on a resulting polyline
SetTolerance(Epsilon: number, Deflection: number, Step: number): void;

// Searches a set of polylines starting on a point of Pnts1 or Pnts2
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Pnts2: NCollection_Sequence_IntSurf_InteriorPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
Perform(Pnts1: NCollection_Sequence_IntSurf_PathPoint, Func: IntPatch_TheSurfFunction, S: Adaptor3d_Surface, Reversed: boolean): void;
// Func: Mutated in place

// Returns true if the calculus was successful
IsDone(): boolean;

// Returns the number of resulting polylines
NbLines(): number;

// Returns the polyline of range Index
Value(Index: number): IntPatch_TheIWLineOfTheIWalking;

// Returns the number of points belonging to Pnts on which no line starts or ends
NbSinglePnts(): number;

// Returns the point of range Index
SinglePnt(Index: number): IntSurf_PathPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_ThePathPointOfTheSOnBounds: declare class IntPatch_ThePathPointOfTheSOnBounds

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

IntPatch_TheSOnBounds: declare class IntPatch_TheSOnBounds

constructor

// Algorithm to find the points and parts of curves of Domain (domain of of restriction of a surface) which verify F = 0
Perform(F: IntPatch_ArcFunction, Domain: Adaptor3d_TopolTool, TolBoundary: number, TolTangency: number, RecheckOnRegularity: boolean): void;
// F: Mutated in place

// Returns True if the calculus was successful
IsDone(): boolean;

// Returns true if all arc of the Arcs are solution (inside the surface)
AllArcSolution(): boolean;

// Returns the number of resulting points
NbPoints(): number;

// Returns the resulting point of range Index
Point(Index: number): IntPatch_ThePathPointOfTheSOnBounds;

// Returns the number of the resulting segments
NbSegments(): number;

// Returns the resulting segment of range Index
Segment(Index: number): IntPatch_TheSegmentOfTheSOnBounds;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_TheSearchInside: declare class IntPatch_TheSearchInside

constructor

Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;
Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, T: Adaptor3d_TopolTool, Epsilon: number): void;
Perform(F: IntPatch_TheSurfFunction, Surf: Adaptor3d_Surface, UStart: number, VStart: number): void;

IsDone(): boolean;

// Returns the number of points
NbPoints(): number;

// Returns the point of range Index
Value(Index: number): IntSurf_InteriorPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_TheSegmentOfTheSOnBounds: declare class IntPatch_TheSegmentOfTheSOnBounds

constructor

// Defines the concerned arc
SetValue(A: Adaptor2d_Curve2d): void;

// Defines the first point or the last point, depending on the value of the boolean First
SetLimitPoint(V: IntPatch_ThePathPointOfTheSOnBounds, First: boolean): void;

// Returns the geometric curve on the surface 's domain which is solution
Curve(): Adaptor2d_Curve2d;

// Returns True if there is a vertex (ThePathPoint) defining the lowest valid parameter on the arc
HasFirstPoint(): boolean;

// Returns the first point
FirstPoint(): IntPatch_ThePathPointOfTheSOnBounds;

// Returns True if there is a vertex (ThePathPoint) defining the greatest valid parameter on the arc
HasLastPoint(): boolean;

// Returns the last point
LastPoint(): IntPatch_ThePathPointOfTheSOnBounds;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_TheSurfFunction: declare class IntPatch_TheSurfFunction extends math_FunctionSetWithDerivatives

constructor

Set(PS: Adaptor3d_Surface): void;
Set(Tolerance: number): void;
Set(PS: Adaptor3d_Surface): void;
Set(Tolerance: number): void;

SetImplicitSurface(IS: IntSurf_Quadric): void;

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Root(): number;

// Returns the value Tol so that if std::abs(Func.Root())<Tol the function is considered null
Tolerance(): number;

Point(): gp_Pnt;

IsTangent(): boolean;

Direction3d(): gp_Vec;

Direction2d(): gp_Dir2d;

PSurface(): Adaptor3d_Surface;

ISurface(): IntSurf_Quadric;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of set of points as a result of the intersection between 2 parametrised patches
IntPatch_WLine: declare class IntPatch_WLine extends IntPatch_PointLine

constructor

// Adds a vertex in the list
AddVertex(Pnt: IntPatch_Point, theIsPrepend?: boolean): void;

// Set the Point of index <Index> in the LineOn2S
SetPoint(Index: number, Pnt: IntPatch_Point): void;

// Replaces the element of range Index in the list of points
Replace(Index: number, Pnt: IntPatch_Point): void;

SetFirstPoint(IndFirst: number): void;

SetLastPoint(IndLast: number): void;

// Returns the number of intersection points
NbPnts(): number;

// Returns the intersection point of range Index
Point(Index: number): IntSurf_PntOn2S;

// Returns True if the line has a known First point
HasFirstPoint(): boolean;

// Returns True if the line has a known Last point
HasLastPoint(): boolean;

// Returns the Point corresponding to the FirstPoint
FirstPoint(): IntPatch_Point;
FirstPoint(Indfirst?: number): { returnValue: IntPatch_Point; Indfirst: number; [Symbol.dispose](): void };
FirstPoint(): IntPatch_Point;
FirstPoint(Indfirst?: number): { returnValue: IntPatch_Point; Indfirst: number; [Symbol.dispose](): void };

// Returns the Point corresponding to the LastPoint
LastPoint(): IntPatch_Point;
LastPoint(Indlast?: number): { returnValue: IntPatch_Point; Indlast: number; [Symbol.dispose](): void };
LastPoint(): IntPatch_Point;
LastPoint(Indlast?: number): { returnValue: IntPatch_Point; Indlast: number; [Symbol.dispose](): void };

// Returns number of vertices ({@link IntPatch_Point`IntPatch_Point`}) of the line
NbVertex(): number;

// Returns the vertex of range Index on the line
Vertex(Index: number): IntPatch_Point;

// Returns the vertex of range Index on the line
ChangeVertex(Index: number): IntPatch_Point;

// Set the parameters of all the vertex on the line
ComputeVertexParameters(Tol: number): void;

// Returns set of intersection points
Curve(): IntSurf_LineOn2S;

// Returns TRUE if theP is out of the box built from the points on 1st surface
IsOutSurf1Box(P1: gp_Pnt2d): boolean;

// Returns TRUE if theP is out of the box built from the points on 2nd surface
IsOutSurf2Box(P2: gp_Pnt2d): boolean;

// Returns TRUE if theP is out of the box built from 3D-points
IsOutBox(P: gp_Pnt): boolean;

SetPeriod(pu1: number, pv1: number, pu2: number, pv2: number): void;

U1Period(): number;

V1Period(): number;

U2Period(): number;

V2Period(): number;

SetArcOnS1(A: Adaptor2d_Curve2d): void;

HasArcOnS1(): boolean;

GetArcOnS1(): Adaptor2d_Curve2d;

SetArcOnS2(A: Adaptor2d_Curve2d): void;

HasArcOnS2(): boolean;

GetArcOnS2(): Adaptor2d_Curve2d;

// Removes vertices from the line (i.e
ClearVertexes(): void;

// Removes single vertex from the line
RemoveVertex(theIndex: number): void;

InsertVertexBefore(theIndex: number, thePnt: IntPatch_Point): void;

// if (theMode == 0) then prints the information about WLine if (theMode == 1) then prints the list of 3d-points if (theMode == 2) then prints the list of 2d-points on the 1st surface Otherwise, prints list of 2d-points on the 2nd surface
Dump(theMode: number): void;

// Allows or forbids purging of existing WLine
EnablePurging(theIsEnabled: boolean): void;

// Returns TRUE if purging is allowed or forbidden for existing WLine
IsPurgingAllowed(): boolean;

// Returns the way of <\*this> creation
GetCreatingWay(): IntPatch_WLine_IntPatch_WLType;

// Sets the info about the way of <\*this> creation
SetCreatingWayInfo(theAlgo: IntPatch_WLine_IntPatch_WLType): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration of ways of WLine creation
IntPatch_WLine_IntPatch_WLType: typeof IntPatch_WLine_IntPatch_WLType[keyof typeof IntPatch_WLine_IntPatch_WLType]

// {@link IntPatch_WLineTool`IntPatch_WLineTool`} provides set of static methods related to walking lines
IntPatch_WLineTool: declare class IntPatch_WLineTool

constructor

// I Removes equal points (leave one of equal points) from theWLine and recompute vertex parameters
static ComputePurgedWLine(theWLine: IntPatch_WLine, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theDom1: Adaptor3d_TopolTool, theDom2: Adaptor3d_TopolTool): IntPatch_WLine;

// Joins all WLines from theSlin to one if it is possible and records the result into theSlin again
static JoinWLines(theSlin: NCollection_Sequence_handle_IntPatch_Line, theSPnt: NCollection_Sequence_IntPatch_Point, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theTol3D: number): void;
// theSlin: Mutated in place
// theSPnt: Mutated in place

// Extends every line from theSlin (if it is possible) to be started/finished in strictly determined point (in the place of joint of two lines)
static ExtendTwoWLines(theSlin: NCollection_Sequence_handle_IntPatch_Line, theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theToler3D: number, theArrPeriods: number, theBoxS1: Bnd_Box2d, theBoxS2: Bnd_Box2d, theListOfCriticalPoints: NCollection_List_gp_Pnt): void;
// theSlin: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_SequenceOfLine: NCollection_Sequence_handle_IntPatch_Line

IntPatch_SequenceOfPoint: NCollection_Sequence_IntPatch_Point
