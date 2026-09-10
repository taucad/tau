# libcascade — BRepFill (2)

12 top-level symbols. Signatures are verbatim typescript.

// Computes a topological shell using some wires (spines and profiles) and displacement option Perform general sweeping construction
BRepFill_PipeShell: declare class BRepFill_PipeShell extends Standard_Transient

constructor

// Set an Frenet or an CorrectedFrenet trihedron to perform the sweeping
Set(Frenet: boolean): void;
Set(Axe: gp_Ax2): void;
Set(BiNormal: gp_Dir): void;
Set(SpineSupport: TopoDS_Shape): boolean;
Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
Set(Frenet: boolean): void;
Set(Axe: gp_Ax2): void;
Set(BiNormal: gp_Dir): void;
Set(SpineSupport: TopoDS_Shape): boolean;
Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
Set(Frenet: boolean): void;
Set(Axe: gp_Ax2): void;
Set(BiNormal: gp_Dir): void;
Set(SpineSupport: TopoDS_Shape): boolean;
Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
Set(Frenet: boolean): void;
Set(Axe: gp_Ax2): void;
Set(BiNormal: gp_Dir): void;
Set(SpineSupport: TopoDS_Shape): boolean;
Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
Set(Frenet: boolean): void;
Set(Axe: gp_Ax2): void;
Set(BiNormal: gp_Dir): void;
Set(SpineSupport: TopoDS_Shape): boolean;
Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;

// Set a Discrete trihedron to perform the sweeping
SetDiscrete(): void;

// Define the maximum V degree of resulting surface
SetMaxDegree(NewMaxDegree: number): void;

// Define the maximum number of spans in V-direction on resulting surface
SetMaxSegments(NewMaxSegments: number): void;

// Set the flag that indicates attempt to approximate a C1-continuous surface if a swept surface proved to be C0
SetForceApproxC1(ForceApproxC1: boolean): void;

// Sets the build history flag
SetIsBuildHistory(theIsBuildHistory: boolean): void;

// Returns the build history flag
IsBuildHistory(): boolean;

// Set an section
Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

// Set an section and an homotetic law
SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

// Delete an section
DeleteProfile(Profile: TopoDS_Shape): void;

// Say if <me> is ready to build the shape return False if <me> do not have section definition
IsReady(): boolean;

// Get a status, when Simulate or Build failed
GetStatus(): GeomFill_PipeError;

SetTolerance(Tol3d?: number, BoundTol?: number, TolAngular?: number): void;

// Set the Transition Mode to manage discontinuities on the sweep
SetTransition(Mode?: BRepFill_TransitionStyle, Angmin?: number, Angmax?: number): void;

// Perform simulation of the sweep
Simulate(NumberOfSection: number, Sections: NCollection_List_TopoDS_Shape): void;
// Sections: Mutated in place

// Builds the resulting shape (redefined from MakeShape)
Build(): boolean;

// Transform the sweeping Shell in Solid
MakeSolid(): boolean;

// Returns the result Shape
Shape(): TopoDS_Shape;

ErrorOnSurface(): number;

// Returns the `TopoDS` Shape of the bottom of the sweep
FirstShape(): TopoDS_Shape;

// Returns the `TopoDS` Shape of the top of the sweep
LastShape(): TopoDS_Shape;

// Returns the list of original profiles
Profiles(theProfiles: NCollection_List_TopoDS_Shape): void;
// theProfiles: Mutated in place

// Returns the spine
Spine(): TopoDS_Wire;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;
// L: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To store section definition
BRepFill_Section: declare class BRepFill_Section

constructor

Set(IsLaw: boolean): void;

OriginalShape(): TopoDS_Shape;

Wire(): TopoDS_Wire;

Vertex(): TopoDS_Vertex;

ModifiedShape(theShape: TopoDS_Shape): TopoDS_Shape;

IsLaw(): boolean;

IsPunctual(): boolean;

WithContact(): boolean;

WithCorrection(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Section {@link Law`Law`}, with an Vertex, or an Wire
BRepFill_SectionLaw: declare class BRepFill_SectionLaw extends Standard_Transient

NbLaw(): number;

Law(Index: number): GeomFill_SectionLaw;

IndexOfEdge(anEdge: TopoDS_Shape): number;

IsConstant(): boolean;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsDone(): boolean;

// Say if the input shape is a vertex
IsVertex(): boolean;

ConcatenedLaw(): GeomFill_SectionLaw;

Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

VertexTol(Index: number, Param: number): number;

Vertex(Index: number, Param: number): TopoDS_Vertex;

D0(U: number, S: TopoDS_Shape): void;

Init(W: TopoDS_Wire): void;

CurrentEdge(): TopoDS_Edge;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Place a shape in a local axis coordinate
BRepFill_SectionPlacement: declare class BRepFill_SectionPlacement

constructor

Transformation(): gp_Trsf;

AbscissaOnPath(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Section {@link Law`Law`}, with an Vertex, or an Wire
BRepFill_ShapeLaw: declare class BRepFill_ShapeLaw extends BRepFill_SectionLaw

constructor

// Say if the input shape is a vertex
IsVertex(): boolean;

// Say if the {@link Law`Law`} is Constant
IsConstant(): boolean;

// Give the law build on a concatenated section
ConcatenedLaw(): GeomFill_SectionLaw;

Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

VertexTol(Index: number, Param: number): number;

Vertex(Index: number, Param: number): TopoDS_Vertex;

D0(U: number, S: TopoDS_Shape): void;

Edge(Index: number): TopoDS_Edge;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Topological Sweep Algorithm Computes an Sweep shell using a generating wire, an SectionLaw and an LocationLaw
BRepFill_Sweep: declare class BRepFill_Sweep

constructor

SetBounds(FirstShape: TopoDS_Wire, LastShape: TopoDS_Wire): void;

// Set Approximation Tolerance Tol3d
SetTolerance(Tol3d: number, BoundTol?: number, Tol2d?: number, TolAngular?: number): void;

// Tolerance To controle Corner management
SetAngularControl(AngleMin?: number, AngleMax?: number): void;

// Set the flag that indicates attempt to approximate a C1-continuous surface if a swept surface proved to be C0
SetForceApproxC1(ForceApproxC1: boolean): void;

// Build the Sweep Surface Transition define Transition strategy Approx define Approximation Strategy
Build(ReversedEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, Tapes: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher, Rails: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher, Transition: BRepFill_TransitionStyle, Continuity: GeomAbs_Shape, Approx: GeomFill_ApproxStyle, Degmax: number, Segmax: number): void;
// ReversedEdges: Mutated in place
// Tapes: Mutated in place
// Rails: Mutated in place

// Say if the Shape is Build
IsDone(): boolean;

// Returns the Sweeping Shape
Shape(): TopoDS_Shape;

// Get the Approximation error
ErrorOnSurface(): number;

SubShape(): NCollection_HArray2_TopoDS_Shape;

InterFaces(): NCollection_HArray2_TopoDS_Shape;

Sections(): NCollection_HArray2_TopoDS_Shape;

// Returns the Tape corresponding to Index-th edge of section
Tape(Index: number): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Errors that can occur at thrusection algorithm
BRepFill_ThruSectionErrorStatus: typeof BRepFill_ThruSectionErrorStatus[keyof typeof BRepFill_ThruSectionErrorStatus]

BRepFill_TransitionStyle: typeof BRepFill_TransitionStyle[keyof typeof BRepFill_TransitionStyle]

// Geometric Tool using to construct Offset Wires
BRepFill_TrimEdgeTool: declare class BRepFill_TrimEdgeTool

constructor

IntersectWith(Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, InitShape1: TopoDS_Shape, InitShape2: TopoDS_Shape, End1: TopoDS_Vertex, End2: TopoDS_Vertex, theJoinType: GeomAbs_JoinType, IsOpenResult: boolean, Params: NCollection_Sequence_gp_Pnt): void;

AddOrConfuse(Start: boolean, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Params: NCollection_Sequence_gp_Pnt): void;

IsInside(P: gp_Pnt2d): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Trims sets of faces in the corner to make proper parts of pipe
BRepFill_TrimShellCorner: declare class BRepFill_TrimShellCorner

constructor

AddBounds(Bounds: NCollection_HArray2_TopoDS_Shape): void;

AddUEdges(theUEdges: NCollection_HArray2_TopoDS_Shape): void;

AddVEdges(theVEdges: NCollection_HArray2_TopoDS_Shape, theIndex: number): void;

Perform(): void;

IsDone(): boolean;

HasSection(): boolean;

Modified(S: TopoDS_Shape, theModified: NCollection_List_TopoDS_Shape): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A pair of bound shapes with the result
BRepFill_TypeOfContact: typeof BRepFill_TypeOfContact[keyof typeof BRepFill_TypeOfContact]

BRepFill_DataMapOfShapeHArray2OfShape: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher
