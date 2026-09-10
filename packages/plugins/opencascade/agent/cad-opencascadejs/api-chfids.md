# libcascade — ChFiDS

15 top-level symbols. Signatures are verbatim typescript.

ChFiDS_ChamfMethod: typeof ChFiDS_ChamfMethod[keyof typeof ChFiDS_ChamfMethod]

// this enumeration defines several modes of chamfer
ChFiDS_ChamfMode: typeof ChFiDS_ChamfMode[keyof typeof ChFiDS_ChamfMode]

// Provides data specific to chamfers distances on each of faces
ChFiDS_ChamfSpine: declare class ChFiDS_ChamfSpine extends ChFiDS_Spine

constructor

SetDist(Dis: number): void;

GetDist(Dis?: number): { Dis: number };

SetDists(Dis1: number, Dis2: number): void;

Dists(Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

GetDistAngle(Dis?: number, Angle?: number): { Dis: number; Angle: number };

SetDistAngle(Dis: number, Angle: number): void;

SetMode(theMode: ChFiDS_ChamfMode): void;

// Return the method of chamfers used
IsChamfer(): ChFiDS_ChamfMethod;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Section of fillet
ChFiDS_CircSection: declare class ChFiDS_CircSection

constructor

Set(C: gp_Circ, F: number, L: number): void;
Set(C: gp_Lin, F: number, L: number): void;
Set(C: gp_Circ, F: number, L: number): void;
Set(C: gp_Lin, F: number, L: number): void;

Get(C: gp_Circ, F: number, L: number): { F: number; L: number };
Get(C: gp_Lin, F: number, L: number): { F: number; L: number };
Get(C: gp_Circ, F: number, L: number): { F: number; L: number };
Get(C: gp_Lin, F: number, L: number): { F: number; L: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// point start/end of fillet common to 2 adjacent filets and to an edge on one of 2 faces participating in the construction of the fillet
ChFiDS_CommonPoint: declare class ChFiDS_CommonPoint

constructor

// default value for all fields
Reset(): void;

// Sets the values of a point which is a vertex on the initial facet of restriction of one of the surface
SetVertex(theVertex: TopoDS_Vertex): void;

// Sets the values of a point which is on the arc A, at parameter Param
SetArc(Tol: number, A: TopoDS_Edge, Param: number, TArc: TopAbs_Orientation): void;

// Sets the value of the parameter on the spine
SetParameter(Param: number): void;

// Set the 3d point for a commonpoint that is not a vertex or on an arc
SetPoint(thePoint: gp_Pnt): void;

// Set the output 3d vector
SetVector(theVector: gp_Vec): void;

// This method set the fuzziness on the point
SetTolerance(Tol: number): void;

// This method returns the fuzziness on the point
Tolerance(): number;

// Returns TRUE if the point is a vertex on the initial restriction facet of the surface
IsVertex(): boolean;

// Returns the information about the point when it is on the domain of the first patch, i-e when the function IsVertex returns True
Vertex(): TopoDS_Vertex;

// Returns TRUE if the point is a on an edge of the initial restriction facet of the surface
IsOnArc(): boolean;

// Returns the arc of restriction containing the vertex
Arc(): TopoDS_Edge;

// Returns the transition of the point on the arc returned by `Arc()`
TransitionOnArc(): TopAbs_Orientation;

// Returns the parameter of the point on the arc returned by the method `Arc()`
ParameterOnArc(): number;

// Returns the parameter on the spine
Parameter(): number;

// Returns the 3d point
Point(): gp_Pnt;

// Returns TRUE if the output vector is stored
HasVector(): boolean;

// Returns the output 3d vector
Vector(): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Elementary Spine for cheminements and approximations
ChFiDS_ElSpine: declare class ChFiDS_ElSpine extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

FirstParameter(): number;
FirstParameter(P: number): void;
FirstParameter(): number;
FirstParameter(P: number): void;

LastParameter(): number;
LastParameter(P: number): void;
LastParameter(): number;
LastParameter(P: number): void;

GetSavedFirstParameter(): number;

GetSavedLastParameter(): number;

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

IsPeriodic(): boolean;

SetPeriodic(I: boolean): void;

Period(): number;

// Computes the point of parameter theAbsC on the curve
EvalD0(theU: number): gp_Pnt;

// Computes the point and first derivative at parameter theAbsC
EvalD1(theU: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter theAbsC
EvalD2(theU: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter theAbsC
EvalD3(theU: number): Geom_Curve_ResD3;

SaveFirstParameter(): void;

SaveLastParameter(): void;

SetOrigin(O: number): void;

FirstPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

LastPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

NbVertices(): number;

VertexWithTangent(Index: number): gp_Ax1;

SetFirstPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

SetLastPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

AddVertexWithTangent(anAx1: gp_Ax1): void;

SetCurve(C: Geom_Curve): void;

Previous(): ChFiDS_SurfData;

ChangePrevious(): ChFiDS_SurfData;

Next(): ChFiDS_SurfData;

ChangeNext(): ChFiDS_SurfData;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Hyperbola(): gp_Hypr;

Parabola(): gp_Parab;

Bezier(): Geom_BezierCurve;

BSpline(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// -- Purpose status concerning the cause of the error
ChFiDS_ErrorStatus: typeof ChFiDS_ErrorStatus[keyof typeof ChFiDS_ErrorStatus]

// interference face/fillet
ChFiDS_FaceInterference: declare class ChFiDS_FaceInterference

constructor

SetInterference(LineIndex: number, Trans: TopAbs_Orientation, PCurv1: Geom2d_Curve, PCurv2: Geom2d_Curve): void;

SetTransition(Trans: TopAbs_Orientation): void;

SetFirstParameter(U1: number): void;

SetLastParameter(U1: number): void;

SetParameter(U1: number, IsFirst: boolean): void;

LineIndex(): number;

SetLineIndex(I: number): void;

Transition(): TopAbs_Orientation;

PCurveOnFace(): Geom2d_Curve;

PCurveOnSurf(): Geom2d_Curve;

ChangePCurveOnFace(): Geom2d_Curve;

ChangePCurveOnSurf(): Geom2d_Curve;

FirstParameter(): number;

LastParameter(): number;

Parameter(IsFirst: boolean): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides data specific to the fillets - vector or rule of evolution (C2)
ChFiDS_FilSpine: declare class ChFiDS_FilSpine extends ChFiDS_Spine

constructor

Reset(AllData?: boolean): void;

// initializes the constant vector on all spine
SetRadius(Radius: number): void;
SetRadius(Radius: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IinC: number): void;
SetRadius(C: Law_Function, IinC: number): void;
SetRadius(Radius: number): void;
SetRadius(Radius: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IinC: number): void;
SetRadius(C: Law_Function, IinC: number): void;
SetRadius(Radius: number): void;
SetRadius(Radius: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IinC: number): void;
SetRadius(C: Law_Function, IinC: number): void;
SetRadius(Radius: number): void;
SetRadius(Radius: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IinC: number): void;
SetRadius(C: Law_Function, IinC: number): void;
SetRadius(Radius: number): void;
SetRadius(Radius: number, E: TopoDS_Edge): void;
SetRadius(Radius: number, V: TopoDS_Vertex): void;
SetRadius(UandR: gp_XY, IinC: number): void;
SetRadius(C: Law_Function, IinC: number): void;

// resets the constant vector on edge E
UnSetRadius(E: TopoDS_Edge): void;
UnSetRadius(V: TopoDS_Vertex): void;
UnSetRadius(E: TopoDS_Edge): void;
UnSetRadius(V: TopoDS_Vertex): void;

// returns true if the radius is constant all along the spine
IsConstant(): boolean;
IsConstant(IE: number): boolean;
IsConstant(): boolean;
IsConstant(IE: number): boolean;

// returns the radius if the fillet is constant all along the spine
Radius(): number;
Radius(IE: number): number;
Radius(E: TopoDS_Edge): number;
Radius(): number;
Radius(IE: number): number;
Radius(E: TopoDS_Edge): number;
Radius(): number;
Radius(IE: number): number;
Radius(E: TopoDS_Edge): number;

AppendElSpine(Els: ChFiDS_ElSpine): void;

Law(Els: ChFiDS_ElSpine): Law_Composite;

// returns the elementary law
ChangeLaw(E: TopoDS_Edge): Law_Function;

// returns the maximum radius if the fillet is non-constant
MaxRadFromSeqAndLaws(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Encapsulation of IndexedDataMapOfShapeListOfShape
ChFiDS_Map: declare class ChFiDS_Map

constructor

// Fills the map with the subshapes of type T1 as keys and the list of ancestors of type T2 as items
Fill(S: TopoDS_Shape, T1: TopAbs_ShapeEnum, T2: TopAbs_ShapeEnum): void;

Contains(S: TopoDS_Shape): boolean;

FindFromKey(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

FindFromIndex(I: number): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Storage`Storage`} of a curve and its 2 faces or surfaces of support
ChFiDS_Regul: declare class ChFiDS_Regul

constructor

SetCurve(IC: number): void;

SetS1(IS1: number, IsFace?: boolean): void;

SetS2(IS2: number, IsFace?: boolean): void;

IsSurface1(): boolean;

IsSurface2(): boolean;

Curve(): number;

S1(): number;

S2(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains information necessary for construction of a 3D fillet or chamfer
ChFiDS_Spine: declare class ChFiDS_Spine extends Standard_Transient

constructor

// store edges composing the guideline
SetEdges(E: TopoDS_Edge): void;

// store offset edges composing the offset guideline
SetOffsetEdges(E: TopoDS_Edge): void;

// store the edge at the first position before all others
PutInFirst(E: TopoDS_Edge): void;

// store the offset edge at the first position before all others
PutInFirstOffset(E: TopoDS_Edge): void;

NbEdges(): number;

Edges(I: number): TopoDS_Edge;

OffsetEdges(I: number): TopoDS_Edge;

// stores if the start of a set of edges starts on a section of free border or forms a closed contour
SetFirstStatus(S: ChFiDS_State): void;

// stores if the end of a set of edges starts on a section of free border or forms a closed contour
SetLastStatus(S: ChFiDS_State): void;

AppendElSpine(Els: ChFiDS_ElSpine): void;

AppendOffsetElSpine(Els: ChFiDS_ElSpine): void;

ElSpine(IE: number): ChFiDS_ElSpine;
ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
ElSpine(W: number): ChFiDS_ElSpine;
ElSpine(IE: number): ChFiDS_ElSpine;
ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
ElSpine(W: number): ChFiDS_ElSpine;
ElSpine(IE: number): ChFiDS_ElSpine;
ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
ElSpine(W: number): ChFiDS_ElSpine;

ChangeElSpines(): NCollection_List_handle_ChFiDS_ElSpine;

ChangeOffsetElSpines(): NCollection_List_handle_ChFiDS_ElSpine;

Reset(AllData?: boolean): void;

SplitDone(): boolean;
SplitDone(B: boolean): void;
SplitDone(): boolean;
SplitDone(B: boolean): void;

// prepare the guideline depending on the edges that are elementary arks (take parameters from a single curvilinear abscissa)
Load(): void;

Resolution(R3d: number): number;

IsClosed(): boolean;

// gives the total length of all arcs before the number IndexSp
FirstParameter(): number;
FirstParameter(IndexSpine: number): number;
FirstParameter(): number;
FirstParameter(IndexSpine: number): number;

// gives the total length till the ark with number IndexSpine (inclus)
LastParameter(): number;
LastParameter(IndexSpine: number): number;
LastParameter(): number;
LastParameter(IndexSpine: number): number;

SetFirstParameter(Par: number): void;

SetLastParameter(Par: number): void;

// gives the length of ark with number IndexSp
Length(IndexSpine: number): number;

IsPeriodic(): boolean;

Period(): number;

Absc(U: number): number;
Absc(V: TopoDS_Vertex): number;
Absc(U: number, I: number): number;
Absc(U: number): number;
Absc(V: TopoDS_Vertex): number;
Absc(U: number, I: number): number;
Absc(U: number): number;
Absc(V: TopoDS_Vertex): number;
Absc(U: number, I: number): number;

Parameter(AbsC: number, U: number, Oriented: boolean): { U: number };
Parameter(Index: number, AbsC: number, U: number, Oriented: boolean): { U: number };
Parameter(AbsC: number, U: number, Oriented: boolean): { U: number };
Parameter(Index: number, AbsC: number, U: number, Oriented: boolean): { U: number };

Value(AbsC: number): gp_Pnt;

D0(AbsC: number, P: gp_Pnt): void;

D1(AbsC: number, P: gp_Pnt, V1: gp_Vec): void;

D2(AbsC: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

SetCurrent(Index: number): void;

// sets the current curve and returns it
CurrentElementarySpine(Index: number): BRepAdaptor_Curve;

CurrentIndexOfElementarySpine(): number;

GetType(): GeomAbs_CurveType;

Line(): gp_Lin;

Circle(): gp_Circ;

// returns if the set of edges starts on a free boundary or if the first vertex is a breakpoint or if the set is closed
FirstStatus(): ChFiDS_State;

// returns the state at the end of the set
LastStatus(): ChFiDS_State;

Status(IsFirst: boolean): ChFiDS_State;

// returns the type of concavity in the connection
GetTypeOfConcavity(): ChFiDS_TypeOfConcavity;

SetStatus(S: ChFiDS_State, IsFirst: boolean): void;

// sets the type of concavity in the connection
SetTypeOfConcavity(theType: ChFiDS_TypeOfConcavity): void;

// returns if the set of edges starts (or end) on Tangency point
IsTangencyExtremity(IsFirst: boolean): boolean;

SetTangencyExtremity(IsTangency: boolean, IsFirst: boolean): void;

FirstVertex(): TopoDS_Vertex;

LastVertex(): TopoDS_Vertex;

SetFirstTgt(W: number): void;

SetLastTgt(W: number): void;

HasFirstTgt(): boolean;

HasLastTgt(): boolean;

// set a parameter reference for the approx
SetReference(W: number): void;
SetReference(I: number): void;
SetReference(W: number): void;
SetReference(I: number): void;

Index(W: number, Forward: boolean): number;
Index(E: TopoDS_Edge): number;
Index(W: number, Forward: boolean): number;
Index(E: TopoDS_Edge): number;

UnsetReference(): void;

SetErrorStatus(state: ChFiDS_ErrorStatus): void;

ErrorStatus(): ChFiDS_ErrorStatus;

// Return the mode of chamfers used
Mode(): ChFiDS_ChamfMode;

// Return tolesp parameter
GetTolesp(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This enum describe the different kinds of extremities of a fillet
ChFiDS_State: typeof ChFiDS_State[keyof typeof ChFiDS_State]

// Data characterising a band of fillet
ChFiDS_Stripe: declare class ChFiDS_Stripe extends Standard_Transient

constructor

// Reset everything except Spine
Reset(): void;

SetOfSurfData(): NCollection_HSequence_handle_ChFiDS_SurfData;

Spine(): ChFiDS_Spine;

OrientationOnFace1(): TopAbs_Orientation;
OrientationOnFace1(Or1: TopAbs_Orientation): void;
OrientationOnFace1(): TopAbs_Orientation;
OrientationOnFace1(Or1: TopAbs_Orientation): void;

OrientationOnFace2(): TopAbs_Orientation;
OrientationOnFace2(Or2: TopAbs_Orientation): void;
OrientationOnFace2(): TopAbs_Orientation;
OrientationOnFace2(Or2: TopAbs_Orientation): void;

Choix(): number;
Choix(C: number): void;
Choix(): number;
Choix(C: number): void;

ChangeSetOfSurfData(): NCollection_HSequence_handle_ChFiDS_SurfData;

ChangeSpine(): ChFiDS_Spine;

FirstParameters(Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

LastParameters(Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

ChangeFirstParameters(Pdeb: number, Pfin: number): void;

ChangeLastParameters(Pdeb: number, Pfin: number): void;

FirstCurve(): number;

LastCurve(): number;

ChangeFirstCurve(Index: number): void;

ChangeLastCurve(Index: number): void;

FirstPCurve(): Geom2d_Curve;

LastPCurve(): Geom2d_Curve;

ChangeFirstPCurve(): Geom2d_Curve;

ChangeLastPCurve(): Geom2d_Curve;

FirstPCurveOrientation(): TopAbs_Orientation;
FirstPCurveOrientation(O: TopAbs_Orientation): void;
FirstPCurveOrientation(): TopAbs_Orientation;
FirstPCurveOrientation(O: TopAbs_Orientation): void;

LastPCurveOrientation(): TopAbs_Orientation;
LastPCurveOrientation(O: TopAbs_Orientation): void;
LastPCurveOrientation(): TopAbs_Orientation;
LastPCurveOrientation(O: TopAbs_Orientation): void;

IndexFirstPointOnS1(): number;

IndexFirstPointOnS2(): number;

IndexLastPointOnS1(): number;

IndexLastPointOnS2(): number;

ChangeIndexFirstPointOnS1(Index: number): void;

ChangeIndexFirstPointOnS2(Index: number): void;

ChangeIndexLastPointOnS1(Index: number): void;

ChangeIndexLastPointOnS2(Index: number): void;

Parameters(First: boolean, Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

SetParameters(First: boolean, Pdeb: number, Pfin: number): void;

Curve(First: boolean): number;

SetCurve(Index: number, First: boolean): void;

PCurve(First: boolean): Geom2d_Curve;

ChangePCurve(First: boolean): Geom2d_Curve;

Orientation(OnS: number): TopAbs_Orientation;
Orientation(First: boolean): TopAbs_Orientation;
Orientation(OnS: number): TopAbs_Orientation;
Orientation(First: boolean): TopAbs_Orientation;

SetOrientation(Or: TopAbs_Orientation, OnS: number): void;
SetOrientation(Or: TopAbs_Orientation, First: boolean): void;
SetOrientation(Or: TopAbs_Orientation, OnS: number): void;
SetOrientation(Or: TopAbs_Orientation, First: boolean): void;

IndexPoint(First: boolean, OnS: number): number;

SetIndexPoint(Index: number, First: boolean, OnS: number): void;

SolidIndex(): number;

SetSolidIndex(Index: number): void;

// Set nb of SurfData's at end put in DS
InDS(First: boolean, Nb?: number): void;

// Returns nb of SurfData's at end being in DS
IsInDS(First: boolean): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// encapsulation of IndexedDataMapOfVertexListOfStripe
ChFiDS_StripeMap: declare class ChFiDS_StripeMap

constructor

Add(V: TopoDS_Vertex, F: ChFiDS_Stripe): void;

Extent(): number;

FindFromKey(V: TopoDS_Vertex): NCollection_List_handle_ChFiDS_Stripe;

FindFromIndex(I: number): NCollection_List_handle_ChFiDS_Stripe;

FindKey(I: number): TopoDS_Vertex;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
