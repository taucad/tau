# libcascade — IntPatch

25 top-level symbols. Signatures are verbatim typescript.

IntPatch_ALine: declare class IntPatch_ALine extends IntPatch_Line

constructor

AddVertex(Pnt: IntPatch_Point): void;

Replace(Index: number, Pnt: IntPatch_Point): void;

SetFirstPoint(IndFirst: number): void;

SetLastPoint(IndLast: number): void;

FirstParameter(IsIncluded?: boolean): { returnValue: number; IsIncluded: boolean };

LastParameter(IsIncluded?: boolean): { returnValue: number; IsIncluded: boolean };

Value(U: number): gp_Pnt;

D1(U: number, P: gp_Pnt, Du: gp_Vec): boolean;

FindParameter(P: gp_Pnt, theParams: NCollection_List_double): void;

HasFirstPoint(): boolean;

HasLastPoint(): boolean;

FirstPoint(): IntPatch_Point;

LastPoint(): IntPatch_Point;

NbVertex(): number;

Vertex(Index: number): IntPatch_Point;

ChangeVertex(theIndex: number): IntPatch_Point;

ComputeVertexParameters(Tol: number): void;

Curve(): IntAna_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IntPatch_ALineToWLine: declare class IntPatch_ALineToWLine

constructor

SetTolOpenDomain(aT: number): void;

TolOpenDomain(): number;

SetTolTransition(aT: number): void;

TolTransition(): number;

SetTol3D(aT: number): void;

Tol3D(): number;

MakeWLine(aline: IntPatch_ALine, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
MakeWLine(aline: IntPatch_ALine, paraminf: number, paramsup: number, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
MakeWLine(aline: IntPatch_ALine, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
MakeWLine(aline: IntPatch_ALine, paraminf: number, paramsup: number, theLines: NCollection_Sequence_handle_IntPatch_Line): void;

delete(): void;

[Symbol.dispose](): void;

IntPatch_ArcFunction: declare class IntPatch_ArcFunction extends math_FunctionWithDerivative

constructor

SetQuadric(Q: IntSurf_Quadric): void;

Set(A: Adaptor2d_Curve2d): void;
Set(S: Adaptor3d_Surface): void;
Set(A: Adaptor2d_Curve2d): void;
Set(S: Adaptor3d_Surface): void;

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

NbSamples(): number;

GetStateNumber(): number;

Valpoint(Index: number): gp_Pnt;

Quadric(): IntSurf_Quadric;

Arc(): Adaptor2d_Curve2d;

Surface(): Adaptor3d_Surface;

LastComputedPoint(): gp_Pnt;

delete(): void;

[Symbol.dispose](): void;

IntPatch_BVHTraversal: declare class IntPatch_BVHTraversal

constructor

Perform(theSet1: IntPatch_PolyhedronBVH, theSet2: IntPatch_PolyhedronBVH, theSelfInterference: boolean): number;

Pairs(): any;

Clear(): void;

Accept(theIndex1: number, theIndex2: number): boolean;

delete(): void;

[Symbol.dispose](): void;

IntPatch_BVHTraversal_TrianglePair: interface IntPatch_BVHTraversal_TrianglePair

First: number

Second: number

constructor

First: number

Second: number

delete(): void;

[Symbol.dispose](): void;

IntPatch_CSFunction: declare class IntPatch_CSFunction extends math_FunctionSetWithDerivatives

constructor

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Point(): gp_Pnt;

Root(): number;

AuxillarSurface(): Adaptor3d_Surface;

AuxillarCurve(): Adaptor2d_Curve2d;

delete(): void;

[Symbol.dispose](): void;

IntPatch_CurvIntSurf: declare class IntPatch_CurvIntSurf

constructor

Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

IsDone(): boolean;

IsEmpty(): boolean;

Point(): gp_Pnt;

ParameterOnCurve(): number;

ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

Function(): IntPatch_CSFunction;

delete(): void;

[Symbol.dispose](): void;

IntPatch_GLine: declare class IntPatch_GLine extends IntPatch_Line

constructor

AddVertex(Pnt: IntPatch_Point): void;

Replace(Index: number, Pnt: IntPatch_Point): void;

SetFirstPoint(IndFirst: number): void;

SetLastPoint(IndLast: number): void;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Parabola(): gp_Parab;

Hyperbola(): gp_Hypr;

HasFirstPoint(): boolean;

HasLastPoint(): boolean;

FirstPoint(): IntPatch_Point;

LastPoint(): IntPatch_Point;

NbVertex(): number;

Vertex(Index: number): IntPatch_Point;

ComputeVertexParameters(Tol: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IntPatch_HCurve2dTool: declare class IntPatch_HCurve2dTool

constructor

static FirstParameter(C: Adaptor2d_Curve2d): number;

static LastParameter(C: Adaptor2d_Curve2d): number;

static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

static IsClosed(C: Adaptor2d_Curve2d): boolean;

static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

static Period(C: Adaptor2d_Curve2d): number;

static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

delete(): void;

[Symbol.dispose](): void;

IntPatch_HInterTool: declare class IntPatch_HInterTool

constructor

static SingularOnUMin(S: Adaptor3d_Surface): boolean;

static SingularOnUMax(S: Adaptor3d_Surface): boolean;

static SingularOnVMin(S: Adaptor3d_Surface): boolean;

static SingularOnVMax(S: Adaptor3d_Surface): boolean;

static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

NbSamplePoints(S: Adaptor3d_Surface): number;

SamplePoint(S: Adaptor3d_Surface, Index: number, U?: number, V?: number): { U: number; V: number };

static HasBeenSeen(C: Adaptor2d_Curve2d): boolean;

static NbSamplesOnArc(A: Adaptor2d_Curve2d): number;

static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

static Project(C: Adaptor2d_Curve2d, P: gp_Pnt2d, Paramproj: number, Ptproj: gp_Pnt2d): { returnValue: boolean; Paramproj: number };

static Tolerance(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

static Parameter(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

static NbPoints(C: Adaptor2d_Curve2d): number;

static Value(C: Adaptor2d_Curve2d, Index: number, Pt: gp_Pnt, Tol?: number, U?: number): { Tol: number; U: number };

static IsVertex(C: Adaptor2d_Curve2d, Index: number): boolean;

static Vertex(C: Adaptor2d_Curve2d, Index: number): { V: Adaptor3d_HVertex; [Symbol.dispose](): void };

static NbSegments(C: Adaptor2d_Curve2d): number;

static HasFirstPoint(C: Adaptor2d_Curve2d, Index: number, IndFirst?: number): { returnValue: boolean; IndFirst: number };

static HasLastPoint(C: Adaptor2d_Curve2d, Index: number, IndLast?: number): { returnValue: boolean; IndLast: number };

static IsAllSolution(C: Adaptor2d_Curve2d): boolean;

delete(): void;

[Symbol.dispose](): void;

IntPatch_IType: typeof IntPatch_IType[keyof typeof IntPatch_IType]

IntPatch_ImpImpIntersection: declare class IntPatch_ImpImpIntersection

constructor

Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, theIsReqToKeepRLine?: boolean): void;

IsDone(): boolean;

GetStatus(): IntPatch_ImpImpIntersection_IntStatus;

IsEmpty(): boolean;

TangentFaces(): boolean;

OppositeFaces(): boolean;

NbPnts(): number;

Point(Index: number): IntPatch_Point;

NbLines(): number;

Line(Index: number): IntPatch_Line;

delete(): void;

[Symbol.dispose](): void;

IntPatch_ImpImpIntersection_IntStatus: typeof IntPatch_ImpImpIntersection_IntStatus[keyof typeof IntPatch_ImpImpIntersection_IntStatus]

IntPatch_ImpPrmIntersection: declare class IntPatch_ImpPrmIntersection

constructor

SetStartPoint(U: number, V: number): void;

Perform(Surf1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, Surf2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, Fleche: number, Pas: number): void;

IsDone(): boolean;

IsEmpty(): boolean;

NbPnts(): number;

Point(Index: number): IntPatch_Point;

NbLines(): number;

Line(Index: number): IntPatch_Line;

delete(): void;

[Symbol.dispose](): void;

IntPatch_InterferencePolyhedron: declare class IntPatch_InterferencePolyhedron extends Intf_Interference

constructor

delete(): void;

[Symbol.dispose](): void;

IntPatch_Intersection: declare class IntPatch_Intersection

constructor

SetTolerances(TolArc: number, TolTang: number, UVMaxStep: number, Fleche: number): void;

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

IsDone(): boolean;

IsEmpty(): boolean;

TangentFaces(): boolean;

OppositeFaces(): boolean;

NbPnts(): number;

Point(Index: number): IntPatch_Point;

NbLines(): number;

Line(Index: number): IntPatch_Line;

SequenceOfLine(): NCollection_Sequence_handle_IntPatch_Line;

Dump(Mode: number, S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool): void;

static CheckSingularPoints(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theDist?: number): { returnValue: boolean; theDist: number };

static DefineUVMaxStep(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theD2: Adaptor3d_TopolTool): number;

static PrepareSurfaces(theS1: Adaptor3d_Surface, theD1: Adaptor3d_TopolTool, theS2: Adaptor3d_Surface, theD2: Adaptor3d_TopolTool, Tol: number, theSeqHS1: NCollection_DynamicArray_handle_Adaptor3d_Surface, theSeqHS2: NCollection_DynamicArray_handle_Adaptor3d_Surface): void;

delete(): void;

[Symbol.dispose](): void;

IntPatch_Line: declare class IntPatch_Line extends Standard_Transient

SetValue(Uiso1: boolean, Viso1: boolean, Uiso2: boolean, Viso2: boolean): void;

ArcType(): IntPatch_IType;

IsTangent(): boolean;

TransitionOnS1(): IntSurf_TypeTrans;

TransitionOnS2(): IntSurf_TypeTrans;

SituationS1(): IntSurf_Situation;

SituationS2(): IntSurf_Situation;

IsUIsoOnS1(): boolean;

IsVIsoOnS1(): boolean;

IsUIsoOnS2(): boolean;

IsVIsoOnS2(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IntPatch_LineConstructor: declare class IntPatch_LineConstructor

constructor

Perform(SL: NCollection_Sequence_handle_IntPatch_Line, L: IntPatch_Line, S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, Tol: number): void;

NbLines(): number;

Line(index: number): IntPatch_Line;

delete(): void;

[Symbol.dispose](): void;

IntPatch_Point: declare class IntPatch_Point

constructor

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

SetParameters(U1: number, V1: number, U2: number, V2: number): void;

SetParameter(Para: number): void;

SetVertex(OnFirst: boolean, V: Adaptor3d_HVertex): void;

SetArc(OnFirst: boolean, A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

SetMultiple(IsMult: boolean): void;

Value(): gp_Pnt;

ParameterOnLine(): number;

Tolerance(): number;

IsTangencyPoint(): boolean;

ParametersOnS1(U1?: number, V1?: number): { U1: number; V1: number };

ParametersOnS2(U2?: number, V2?: number): { U2: number; V2: number };

IsMultiple(): boolean;

IsOnDomS1(): boolean;

IsVertexOnS1(): boolean;

VertexOnS1(): Adaptor3d_HVertex;

ArcOnS1(): Adaptor2d_Curve2d;

TransitionLineArc1(): IntSurf_Transition;

TransitionOnS1(): IntSurf_Transition;

ParameterOnArc1(): number;

IsOnDomS2(): boolean;

IsVertexOnS2(): boolean;

VertexOnS2(): Adaptor3d_HVertex;

ArcOnS2(): Adaptor2d_Curve2d;

TransitionLineArc2(): IntSurf_Transition;

TransitionOnS2(): IntSurf_Transition;

ParameterOnArc2(): number;

PntOn2S(): IntSurf_PntOn2S;

Parameters(U1?: number, V1?: number, U2?: number, V2?: number): { U1: number; V1: number; U2: number; V2: number };

ReverseTransition(): void;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

IntPatch_PointLine: declare class IntPatch_PointLine extends IntPatch_Line

AddVertex(Pnt: IntPatch_Point, theIsPrepend?: boolean): void;

NbPnts(): number;

NbVertex(): number;

Point(Index: number): IntSurf_PntOn2S;

Vertex(Index: number): IntPatch_Point;

ChangeVertex(Index: number): IntPatch_Point;

ClearVertexes(): void;

RemoveVertex(theIndex: number): void;

Curve(): IntSurf_LineOn2S;

IsOutSurf1Box(P1: gp_Pnt2d): boolean;

IsOutSurf2Box(P2: gp_Pnt2d): boolean;

IsOutBox(P: gp_Pnt): boolean;

static CurvatureRadiusOfIntersLine(theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface, theUVPoint: IntSurf_PntOn2S): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IntPatch_PolyArc: declare class IntPatch_PolyArc extends IntPatch_Polygo

constructor

Closed(): boolean;

NbPoints(): number;

Point(Index: number): gp_Pnt2d;

Parameter(Index: number): number;

SetOffset(OffsetX: number, OffsetY: number): void;

delete(): void;

[Symbol.dispose](): void;

IntPatch_PolyLine: declare class IntPatch_PolyLine extends IntPatch_Polygo

constructor

SetWLine(OnFirst: boolean, Line: IntPatch_WLine): void;

ResetError(): void;

NbPoints(): number;

Point(Index: number): gp_Pnt2d;

delete(): void;

[Symbol.dispose](): void;

IntPatch_Polygo: declare class IntPatch_Polygo extends Intf_Polygon2d

Error(): number;

NbPoints(): number;

Point(Index: number): gp_Pnt2d;

DeflectionOverEstimation(): number;

NbSegments(): number;

Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

IntPatch_PolyhedronBVH: declare class IntPatch_PolyhedronBVH

constructor

Clear(): void;

Size(): number;

Box(theIndex: number): any;

Center(theIndex: number, theAxis: number): number;

Swap(theIndex1: number, theIndex2: number): void;

OriginalIndex(theIndex: number): number;

IsInitialized(): boolean;

delete(): void;

[Symbol.dispose](): void;

IntPatch_PolyhedronTool: declare class IntPatch_PolyhedronTool

constructor

delete(): void;

[Symbol.dispose](): void;
