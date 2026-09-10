# libcascade — IntPatch (2)

14 top-level symbols. Signatures are verbatim typescript.

// This class provides a generic algorithm to intersect 2 surfaces
IntPatch_Intersection: declare class IntPatch_Intersection

constructor

// Set the tolerances used by the algorithms
SetTolerances(TolArc: number, TolTang: number, UVMaxStep: number, Fleche: number): void;

// Uses for finding self-intersected surfaces
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, LOfPnts: NCollection_List_IntSurf_PntOn2S, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, LOfPnts: NCollection_List_IntSurf_PntOn2S, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, LOfPnts: NCollection_List_IntSurf_PntOn2S, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, TolArc: number, TolTang: number): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, LOfPnts: NCollection_List_IntSurf_PntOn2S, isGeomInt: boolean, theIsReqToKeepRLine: boolean, theIsReqToPostWLProc: boolean): void;
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolArc: number, TolTang: number): void;

// Returns True if the calculus was successful
IsDone(): boolean;

// Returns true if the is no intersection
IsEmpty(): boolean;

// Returns True if the two patches are considered as entirely tangent, i-e every restriction arc of one patch is inside the geometric base of the other patch
TangentFaces(): boolean;

// Returns True when the TangentFaces returns True and the normal vectors evaluated at a point on the first and the second surface are opposite
OppositeFaces(): boolean;

// Returns the number of "single" points
NbPnts(): number;

// Returns the point of range Index
Point(Index: number): IntPatch_Point;

// Returns the number of intersection lines
NbLines(): number;

// Returns the line of range Index
Line(Index: number): IntPatch_Line;

SequenceOfLine(): NCollection_Sequence_handle_IntPatch_Line;

// Dump of each result line
Dump(Mode: number, S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool): void;

// Checks if surface theS1 has degenerated boundary (dS/du or dS/dv = 0) and calculates minimal distance between corresponding singular points and surface theS2 If singular point exists the method returns "true" and stores minimal distance in theDist
static CheckSingularPoints(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theDist?: number): { returnValue: boolean; theDist: number };

// Calculates recommended value for myUVMaxStep depending on surfaces and their domains
static DefineUVMaxStep(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theD2: Adaptor3d_TopolTool): number;

// Prepares surfaces for intersection
static PrepareSurfaces(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theD2: Adaptor3d_TopolTool, Tol: number, theSeqHS1: NCollection_DynamicArray_handle_Adaptor3d_Surface, theSeqHS2: NCollection_DynamicArray_handle_Adaptor3d_Surface): void;
// theSeqHS1: Mutated in place
// theSeqHS2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of an intersection line between two surfaces
IntPatch_Line: declare class IntPatch_Line extends Standard_Transient

// To set the values returned by IsUIsoS1,...
SetValue(Uiso1: boolean, Viso1: boolean, Uiso2: boolean, Viso2: boolean): void;

// Returns the type of geometry 3d (Line, Circle, Parabola, Hyperbola, Ellipse, Analytic, Walking, Restriction)
ArcType(): IntPatch_IType;

// Returns TRUE if the intersection is a line of tangency between the 2 patches
IsTangent(): boolean;

// Returns the type of the transition of the line for the first surface
TransitionOnS1(): IntSurf_TypeTrans;

// Returns the type of the transition of the line for the second surface
TransitionOnS2(): IntSurf_TypeTrans;

// Returns the situation (INSIDE/OUTSIDE/UNKNOWN) of the first patch compared to the second one, when TransitionOnS1 or TransitionOnS2 returns TOUCH
SituationS1(): IntSurf_Situation;

// Returns the situation (INSIDE/OUTSIDE/UNKNOWN) of the second patch compared to the first one, when TransitionOnS1 or TransitionOnS2 returns TOUCH
SituationS2(): IntSurf_Situation;

// Returns TRUE if the intersection is a U isoparametric curve on the first patch
IsUIsoOnS1(): boolean;

// Returns TRUE if the intersection is a V isoparametric curve on the first patch
IsVIsoOnS1(): boolean;

// Returns TRUE if the intersection is a U isoparametric curve on the second patch
IsUIsoOnS2(): boolean;

// Returns TRUE if the intersection is a V isoparametric curve on the second patch
IsVIsoOnS2(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The intersections algorithms compute the intersection on two surfaces and return the intersections lines as {@link IntPatch_Line`IntPatch_Line`}
IntPatch_LineConstructor: declare class IntPatch_LineConstructor

constructor

Perform(SL: NCollection_Sequence_handle_IntPatch_Line, L: IntPatch_Line, S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, Tol: number): void;

NbLines(): number;

Line(index: number): IntPatch_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of an intersection point between two surfaces
IntPatch_Point: declare class IntPatch_Point

constructor

// Sets the value of <pt> member
SetValue(Pt: gp_Pnt): void;
SetValue(thePOn2S: IntSurf_PntOn2S): void;
SetValue(Pt: gp_Pnt, Tol: number, Tangent: boolean): void;
SetValue(Pt: gp_Pnt): void;
SetValue(thePOn2S: IntSurf_PntOn2S): void;
SetValue(Pt: gp_Pnt, Tol: number, Tangent: boolean): void;
SetValue(Pt: gp_Pnt): void;
SetValue(thePOn2S: IntSurf_PntOn2S): void;
SetValue(Pt: gp_Pnt, Tol: number, Tangent: boolean): void;

SetTolerance(Tol: number): void;

// Sets the values of the parameters of the point on each surface
SetParameters(U1: number, V1: number, U2: number, V2: number): void;

// Set the value of the parameter on the intersection line
SetParameter(Para: number): void;

// Sets the values of a point which is a vertex on the initial facet of restriction of one of the surface
SetVertex(OnFirst: boolean, V: Adaptor3d_HVertex): void;

// Sets the values of a point which is on one of the domain, when both surfaces are implicit ones
SetArc(OnFirst: boolean, A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

// Sets (or unsets) the point as a point on several intersection line
SetMultiple(IsMult: boolean): void;

// Returns the intersection point (geometric information)
Value(): gp_Pnt;

// This method returns the parameter of the point on the intersection line
ParameterOnLine(): number;

// This method returns the fuzziness on the point
Tolerance(): number;

// Returns True if the Point is a tangency point between the surfaces
IsTangencyPoint(): boolean;

// Returns the parameters on the first surface of the point
ParametersOnS1(U1?: number, V1?: number): { U1: number; V1: number };

// Returns the parameters on the second surface of the point
ParametersOnS2(U2?: number, V2?: number): { U2: number; V2: number };

// Returns True if the point belongs to several intersection lines
IsMultiple(): boolean;

// Returns TRUE if the point is on a boundary of the domain of the first patch
IsOnDomS1(): boolean;

// Returns TRUE if the point is a vertex on the initial restriction facet of the first surface
IsVertexOnS1(): boolean;

// Returns the information about the point when it is on the domain of the first patch, i-e when the function IsVertexOnS1 returns True
VertexOnS1(): Adaptor3d_HVertex;

// Returns the arc of restriction containing the vertex
ArcOnS1(): Adaptor2d_Curve2d;

// Returns the transition of the point on the intersection line with the arc on S1
TransitionLineArc1(): IntSurf_Transition;

// Returns the transition between the intersection line returned by the method Line and the arc on S1 returned by `ArcOnS1()`
TransitionOnS1(): IntSurf_Transition;

// Returns the parameter of the point on the arc returned by the method ArcOnS2
ParameterOnArc1(): number;

// Returns TRUE if the point is on a boundary of the domain of the second patch
IsOnDomS2(): boolean;

// Returns TRUE if the point is a vertex on the initial restriction facet of the first surface
IsVertexOnS2(): boolean;

// Returns the information about the point when it is on the domain of the second patch, i-e when the function IsVertexOnS2 returns True
VertexOnS2(): Adaptor3d_HVertex;

// Returns the arc of restriction containing the vertex
ArcOnS2(): Adaptor2d_Curve2d;

// Returns the transition of the point on the intersection line with the arc on S2
TransitionLineArc2(): IntSurf_Transition;

// Returns the transition between the intersection line returned by the method Line and the arc on S2 returned by ArcOnS2
TransitionOnS2(): IntSurf_Transition;

// Returns the parameter of the point on the arc returned by the method ArcOnS2
ParameterOnArc2(): number;

// Returns the PntOn2S (geometric Point and the parameters)
PntOn2S(): IntSurf_PntOn2S;

// Returns the parameters on the first and on the second surface of the point
Parameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

ReverseTransition(): void;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of an intersection line between two surfaces
IntPatch_PointLine: declare class IntPatch_PointLine extends IntPatch_Line

// Adds a vertex in the list
AddVertex(Pnt: IntPatch_Point, theIsPrepend?: boolean): void;

// Returns the number of intersection points
NbPnts(): number;

// Returns number of vertices ({@link IntPatch_Point`IntPatch_Point`}) of the line
NbVertex(): number;

// Returns the intersection point of range Index
Point(Index: number): IntSurf_PntOn2S;

// Returns the vertex of range Index on the line
Vertex(Index: number): IntPatch_Point;

// Returns the vertex of range Index on the line
ChangeVertex(Index: number): IntPatch_Point;

// Removes vertices from the line
ClearVertexes(): void;

// Removes single vertex from the line
RemoveVertex(theIndex: number): void;

// Returns set of intersection points
Curve(): IntSurf_LineOn2S;

// Returns TRUE if P1 is out of the box built from the points on 1st surface
IsOutSurf1Box(P1: gp_Pnt2d): boolean;

// Returns TRUE if P2 is out of the box built from the points on 2nd surface
IsOutSurf2Box(P2: gp_Pnt2d): boolean;

// Returns TRUE if P is out of the box built from 3D-points
IsOutBox(P: gp_Pnt): boolean;

// Returns the radius of curvature of the intersection line in given point
static CurvatureRadiusOfIntersLine(theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theUVPoint: IntSurf_PntOn2S): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_PolyArc: declare class IntPatch_PolyArc extends IntPatch_Polygo

constructor

// Returns True if the polyline is closed
Closed(): boolean;

NbPoints(): number;

Point(Index: number): gp_Pnt2d;

Parameter(Index: number): number;

SetOffset(OffsetX: number, OffsetY: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_PolyLine: declare class IntPatch_PolyLine extends IntPatch_Polygo

constructor

SetWLine(OnFirst: boolean, Line: IntPatch_WLine): void;

ResetError(): void;

NbPoints(): number;

Point(Index: number): gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_Polygo: declare class IntPatch_Polygo extends Intf_Polygon2d

Error(): number;

NbPoints(): number;

Point(Index: number): gp_Pnt2d;

// Returns the tolerance of the polygon
DeflectionOverEstimation(): number;

// Returns the number of Segments in the polyline
NbSegments(): number;

// Returns the points of the segment <Index> in the Polygon
Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;
// theBegin: Mutated in place
// theEnd: Mutated in place

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Wraps `IntPatch_Polyhedron` as a `BVH_PrimitiveSet` for efficient spatial queries
IntPatch_PolyhedronBVH: declare class IntPatch_PolyhedronBVH

constructor

// Clears the `BVH` set
Clear(): void;

Size(): number;

Box(theIndex: number): any;

Center(theIndex: number, theAxis: number): number;

Swap(theIndex1: number, theIndex2: number): void;

OriginalIndex(theIndex: number): number;

IsInitialized(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describe the signature of a polyhedral surface with only triangular facets and the necessary information to compute the interferences
IntPatch_PolyhedronTool: declare class IntPatch_PolyhedronTool

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of the Intersection between two bi-parametrised surfaces
IntPatch_PrmPrmIntersection: declare class IntPatch_PrmPrmIntersection

constructor

// Performs the intersection between <Caro1> and <Caro2>
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ClearFlag: boolean): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, TolTangency: number, Epsilon: number, Deflection: number, Increment: number, ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;
Perform(Caro1: Adaptor3d_Surface, Domain1: Adaptor3d_TopolTool, Caro2: Adaptor3d_Surface, Domain2: Adaptor3d_TopolTool, U1: number, V1: number, U2: number, V2: number, TolTangency: number, Epsilon: number, Deflection: number, Increment: number): void;

// Returns true if the calculus was successful
IsDone(): boolean;

// Returns true if the is no intersection
IsEmpty(): boolean;

// Returns the number of intersection lines
NbLines(): number;

// Returns the line of range Index
Line(Index: number): IntPatch_Line;

// Computes about <NbPoints> Intersection Points on the Line <IndexLine> between the Points of Index <LowPoint> and <HighPoint>
NewLine(Caro1: Adaptor3d_Surface, Caro2: Adaptor3d_Surface, IndexLine: number, LowPoint: number, HighPoint: number, NbPoints: number): IntPatch_Line;

GrilleInteger(ix: number, iy: number, iz: number): number;

IntegerGrille(t: number, ix?: number, iy?: number, iz?: number): { ix: number; iy: number; iz: number };

DansGrille(t: number): number;

NbPointsGrille(): number;

RemplitLin(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

RemplitTri(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

Remplit(a: number, b: number, c: number, Map: IntPatch_PrmPrmIntersection_T3Bits): void;

CodeReject(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number): number;

PointDepart(S1: Adaptor3d_Surface, SU1: number, SV1: number, S2: Adaptor3d_Surface, SU2: number, SV2: number): { LineOn2S: IntSurf_LineOn2S; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_PrmPrmIntersection_T3Bits: declare class IntPatch_PrmPrmIntersection_T3Bits

constructor

Add(t: number): void;

Val(t: number): number;

Raz(t: number): void;

ResetAnd(): void;

And(Oth: IntPatch_PrmPrmIntersection_T3Bits, indiceprecedent?: number): { returnValue: number; indiceprecedent: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// trouver les points d intersection entre la ligne de cheminement et les arcs de restriction
IntPatch_RstInt: declare class IntPatch_RstInt

constructor

static PutVertexOnLine(L: IntPatch_Line, Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, OtherSurf: Adaptor3d_Surface, OnFirst: boolean, Tol: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Created on
IntPatch_SpecPntType: typeof IntPatch_SpecPntType[keyof typeof IntPatch_SpecPntType]
