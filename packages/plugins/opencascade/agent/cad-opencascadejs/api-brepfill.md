# libcascade — BRepFill

22 top-level symbols. Signatures are verbatim typescript.

BRepFill: declare class BRepFill

constructor

// Computes a ruled surface between two edges
static Face(Edge1: TopoDS_Edge, Edge2: TopoDS_Edge): TopoDS_Face;

// Computes a ruled surface between two wires
static Shell(Wire1: TopoDS_Wire, Wire2: TopoDS_Wire): TopoDS_Shell;

// Computes <AxeProf> as Follow
static Axe(Spine: TopoDS_Shape, Profile: TopoDS_Wire, AxeProf: gp_Ax3, ProfOnSpine: boolean, Tol: number): { ProfOnSpine: boolean };
// AxeProf: Mutated in place

// Compute ACR on a wire
static ComputeACR(wire: TopoDS_Wire, ACR: NCollection_Array1_double): void;
// ACR: Mutated in place

// Insert ACR on a wire
static InsertACR(wire: TopoDS_Wire, ACRcuts: NCollection_Array1_double, prec: number): TopoDS_Wire;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Location {@link Law`Law`}, with a Wire
BRepFill_ACRLaw: declare class BRepFill_ACRLaw extends BRepFill_LocationLaw

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Constructs an evolved volume from a spine (wire or face) and a profile (wire)
BRepFill_AdvancedEvolved: declare class BRepFill_AdvancedEvolved

constructor

Perform(theSpine: TopoDS_Wire, theProfile: TopoDS_Wire, theTolerance: number, theSolidReq?: boolean): void;

IsDone(theErrorCode?: number): boolean;

// returns the resulting shape
Shape(): TopoDS_Shape;

// Sets directory where the debug shapes will be saved
SetTemporaryDirectory(thePath: string): void;

// Sets/Unsets computation in parallel mode
SetParallelMode(theVal: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Evaluate the 3dCurve and the PCurves described in a MultiLine from {@link BRepFill`BRepFill`}
BRepFill_ApproxSeewing: declare class BRepFill_ApproxSeewing

constructor

Perform(ML: BRepFill_MultiLine): void;

IsDone(): boolean;

// returns the approximation of the 3d Curve
Curve(): Geom_Curve;

// returns the approximation of the PCurve on the first face of the MultiLine
CurveOnF1(): Geom2d_Curve;

// returns the approximation of the PCurve on the first face of the MultiLine
CurveOnF2(): Geom2d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Constructs a sequence of Wires (with good orientation and origin) agreed each other so that the surface passing through these sections is not twisted
BRepFill_CompatibleWires: declare class BRepFill_CompatibleWires

constructor

Init(Sections: NCollection_Sequence_TopoDS_Shape): void;

SetPercent(percent?: number): void;

// Performs CompatibleWires According to the orientation and the origin of each other
Perform(WithRotation?: boolean): void;

IsDone(): boolean;

GetStatus(): BRepFill_ThruSectionErrorStatus;

// returns the generated sequence
Shape(): NCollection_Sequence_TopoDS_Shape;

// Returns the shapes created from a subshape <SubSection> of a section
GeneratedShapes(SubSection: TopoDS_Edge): NCollection_List_TopoDS_Shape;

Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

IsDegeneratedFirstSection(): boolean;

IsDegeneratedLastSection(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepFill_ComputeCLine: declare class BRepFill_ComputeCLine

constructor

// runs the algorithm after having initialized the fields
Perform(Line: BRepFill_MultiLine): void;

// changes the degrees of the approximation
SetDegrees(degreemin: number, degreemax: number): void;

// Changes the tolerances of the approximation
SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

// Changes the constraints of the approximation
SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

// Changes the max number of segments, which is allowed for cutting
SetMaxSegments(theMaxSegments: number): void;

// Set inverse order of degree selection
SetInvOrder(theInvOrder: boolean): void;

// Set value of hang checking flag if this flag = true, possible hang of algorithm is checked and algorithm is forced to stop
SetHangChecking(theHangChecking: boolean): void;

// returns False if at a moment of the approximation, the status NoApproximation has been sent by the user when more points were needed
IsAllApproximated(): boolean;

// returns False if the status NoPointsAdded has been sent
IsToleranceReached(): boolean;

// returns the tolerances 2d and 3d of the <Index> MultiCurve
Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

// Returns the number of MultiCurve doing the approximation of the MultiLine
NbMultiCurves(): number;

// returns the approximation MultiCurve of range <Index>
Value(Index?: number): AppParCurves_MultiCurve;

Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// same as CurveConstraint from GeomPlate with {@link BRepAdaptor_Surface `BRepAdaptor_Surface`} instead of {@link GeomAdaptor_Surface `GeomAdaptor_Surface`}
BRepFill_CurveConstraint: declare class BRepFill_CurveConstraint extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepFill_Draft: declare class BRepFill_Draft

constructor

SetOptions(Style?: BRepFill_TransitionStyle, AngleMin?: number, AngleMax?: number): void;

SetDraft(IsInternal?: boolean): void;

Perform(LengthMax: number): void;
Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;
Perform(LengthMax: number): void;
Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;
Perform(LengthMax: number): void;
Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;

IsDone(): boolean;

// Returns the draft surface To have the complete shape you have to use the `Shape()` methode
Shell(): TopoDS_Shell;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Shape(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Location {@link Law`Law`}, with a Wire
BRepFill_DraftLaw: declare class BRepFill_DraftLaw extends BRepFill_Edge3DLaw

constructor

// To clean the little discontinuities
CleanLaw(TolAngular: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Location {@link Law`Law`}, with a Wire
BRepFill_Edge3DLaw: declare class BRepFill_Edge3DLaw extends BRepFill_LocationLaw

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepFill_EdgeFaceAndOrder: declare class BRepFill_EdgeFaceAndOrder

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Location {@link Law`Law`}, with a Wire and a Surface
BRepFill_EdgeOnSurfLaw: declare class BRepFill_EdgeOnSurfLaw extends BRepFill_LocationLaw

constructor

// returns <False> if one Edge of <Path> do not have representation on <Surf>
HasResult(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Constructs an evolved volume from a spine (wire or face) and a profile ( wire)
BRepFill_Evolved: declare class BRepFill_Evolved

constructor

// Performs an evolved shape by sweeping the <Profile> along the <Spine>
Perform(Spine: TopoDS_Wire, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
Perform(Spine: TopoDS_Face, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
Perform(Spine: TopoDS_Wire, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
Perform(Spine: TopoDS_Face, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;

IsDone(): boolean;

// returns the generated shape
Shape(): TopoDS_Shape;

// Returns the shapes created from a subshape <SpineShape> of the spine and a subshape <ProfShape> on the profile
GeneratedShapes(SpineShape: TopoDS_Shape, ProfShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

JoinType(): GeomAbs_JoinType;

// Return the face Top if <Solid> is True in the constructor
Top(): TopoDS_Shape;

// Return the face Bottom if <Solid> is True in the constructor
Bottom(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A structure containing Face and Order of constraint
BRepFill_FaceAndOrder: declare class BRepFill_FaceAndOrder

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// N-Side Filling This algorithm avoids to build a face from
BRepFill_Filling: declare class BRepFill_Filling

constructor

// Sets the values of Tolerances used to control the constraint
SetConstrParam(Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number): void;

// Sets the parameters used for resolution
SetResolParam(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean): void;

// Sets the parameters used for approximation of the surface
SetApproxParam(MaxDeg?: number, MaxSegments?: number): void;

// Loads the initial Surface The initial surface must have orthogonal local coordinates, i.e
LoadInitSurface(aFace: TopoDS_Face): void;

// Adds a punctual constraint
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;

// Builds the resulting faces
Build(): void;

IsDone(): boolean;

Face(): TopoDS_Face;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

G0Error(): number;
G0Error(Index: number): number;
G0Error(): number;
G0Error(Index: number): number;

G1Error(): number;
G1Error(Index: number): number;
G1Error(): number;
G1Error(Index: number): number;

G2Error(): number;
G2Error(Index: number): number;
G2Error(): number;
G2Error(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Compute a topological surface (a shell) using generating wires
BRepFill_Generator: declare class BRepFill_Generator

constructor

AddWire(Wire: TopoDS_Wire): void;

// Compute the shell
Perform(): void;

Shell(): TopoDS_Shell;

// Returns all the shapes created
Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

// Returns the shapes created from a subshape <SSection> of a section
GeneratedShapes(SSection: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns a modified shape in the constructed shell, If shape is not changed (replaced) during operation => returns the same shape
ResultShape(theShape: TopoDS_Shape): TopoDS_Shape;

// Sets the mutable input state If true then the input profile can be modified inside the operation
SetMutableInput(theIsMutableInput: boolean): void;

// Returns the current mutable input state
IsMutableInput(): boolean;

// Returns status of the operation
GetStatus(): BRepFill_ThruSectionErrorStatus;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Location {@link Law`Law`} on a Wire
BRepFill_LocationLaw: declare class BRepFill_LocationLaw extends Standard_Transient

constructor

// Return a error status, if the status is not PipeOk then it exist a parameter tlike the law is not valuable for t
GetStatus(): GeomFill_PipeError;

// Apply a linear transformation on each law, to have continuity of the global law between the edges
TransformInG0Law(): void;

// Apply a linear transformation on each law, to reduce the dicontinuities of law at one rotation
TransformInCompatibleLaw(AngularTolerance: number): void;

DeleteTransform(): void;

NbHoles(Tol?: number): number;

Holes(Interval: NCollection_Array1_int): void;

// Return the number of elementary {@link Law`Law`}
NbLaw(): number;

// Return the elementary {@link Law`Law`} of rank <Index> <Index> have to be in [1, `NbLaw()`]
Law(Index: number): GeomFill_LocationLaw;

// return the path
Wire(): TopoDS_Wire;

// Return the Edge of rank <Index> in the path <Index> have to be in [1, `NbLaw()`]
Edge(Index: number): TopoDS_Edge;

// Return the vertex of rank <Index> in the path <Index> have to be in [0, `NbLaw()`]
Vertex(Index: number): TopoDS_Vertex;

// Compute <OutputVertex> like a transformation of <InputVertex> the transformation is given by evaluation of the location law in the vertex of rank <Index>
PerformVertex(Index: number, InputVertex: TopoDS_Vertex, TolMin: number, OutputVertex: TopoDS_Vertex, Location: number): void;
// OutputVertex: Mutated in place

// Return the Curvilinear Bounds of the <Index> {@link Law`Law`}
CurvilinearBounds(Index: number, First?: number, Last?: number): { First: number; Last: number };

IsClosed(): boolean;

// Compute the {@link Law`Law`}'s continuity between 2 edges of the path The result can be
IsG1(Index: number, SpatialTolerance?: number, AngularTolerance?: number): number;

// Apply the {@link Law`Law`} to a shape, for a given Curvilinear abscissa
D0(Abscissa: number, Section: TopoDS_Shape): void;
// Section: Mutated in place

// Find the index {@link Law`Law`} and the parameter, for a given Curvilinear abscissa
Parameter(Abscissa: number, Index?: number, Param?: number): { Index: number; Param: number };

// Return the curvilinear abscissa corresponding to a point of the path, defined by <Index> of Edge and a parameter on the edge
Abscissa(Index: number, Param: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class used to compute the 3d curve and the two 2d curves resulting from the intersection of a surface of linear extrusion( Bissec, Dz) and the 2 faces
BRepFill_MultiLine: declare class BRepFill_MultiLine extends AppCont_Function

constructor

// Search if the Projection of the Bissectrice on the faces needs an approximation or not
IsParticularCase(): boolean;

// Returns the continuity between the two faces seShape from GeomAbsparated by myBis
Continuity(): GeomAbs_Shape;

// raises if IsParticularCase is <False>
Curves(): { Curve: Geom_Curve; PCurve1: Geom2d_Curve; PCurve2: Geom2d_Curve; [Symbol.dispose](): void };

// returns the first parameter of the Bissectrice
FirstParameter(): number;

// returns the last parameter of the Bissectrice
LastParameter(): number;

// Returns the current point on the 3d curve
Value(U: number): gp_Pnt;
Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;
Value(U: number): gp_Pnt;
Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;

// returns the current point on the PCurve of the first face
ValueOnF1(U: number): gp_Pnt2d;

// returns the current point on the PCurve of the first face
ValueOnF2(U: number): gp_Pnt2d;

Value3dOnF1OnF2(U: number, P3d: gp_Pnt, PF1: gp_Pnt2d, PF2: gp_Pnt2d): void;

// Returns the derivative at parameter <theU>
D1(theU: number, theVec2d: NCollection_Array1_gp_Vec2d, theVec: NCollection_Array1_gp_Vec): boolean;
// theVec2d: Mutated in place
// theVec: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build Section {@link Law`Law`}, with N Sections
BRepFill_NSections: declare class BRepFill_NSections extends BRepFill_SectionLaw

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

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class is used to find the generating shapes of an OffsetWire
BRepFill_OffsetAncestors: declare class BRepFill_OffsetAncestors

constructor

Perform(Paral: BRepFill_OffsetWire): void;

IsDone(): boolean;

HasAncestor(S1: TopoDS_Edge): boolean;

// may return a Null Shape if S1 is not a subShape of <Paral>
Ancestor(S1: TopoDS_Edge): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Constructs a Offset Wire to a spine (wire or face)
BRepFill_OffsetWire: declare class BRepFill_OffsetWire

constructor

// Initialize the evaluation of Offsetting
Init(Spine: TopoDS_Face, Join?: GeomAbs_JoinType, IsOpenResult?: boolean): void;

// Performs an OffsetWire at an altitude <Alt> from the face (According to the orientation of the face)
Perform(Offset: number, Alt?: number): void;

// Performs an OffsetWire
PerformWithBiLo(WSP: TopoDS_Face, Offset: number, Locus: BRepMAT2d_BisectingLocus, Link: BRepMAT2d_LinkTopoBilo, Join: GeomAbs_JoinType, Alt: number): void;
// Link: Mutated in place

IsDone(): boolean;

Spine(): TopoDS_Face;

// returns the generated shape
Shape(): TopoDS_Shape;

// Returns the shapes created from a subshape <SpineShape> of the spine
GeneratedShapes(SpineShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

JoinType(): GeomAbs_JoinType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Create a shape by sweeping a shape (the profile) along a wire (the spine)
BRepFill_Pipe: declare class BRepFill_Pipe

constructor

Perform(Spine: TopoDS_Wire, Profile: TopoDS_Shape, GeneratePartCase?: boolean): void;

Spine(): TopoDS_Shape;

Profile(): TopoDS_Shape;

Shape(): TopoDS_Shape;

ErrorOnSurface(): number;

FirstShape(): TopoDS_Shape;

LastShape(): TopoDS_Shape;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;
// L: Mutated in place

// Returns the face created from an edge of the spine and an edge of the profile
Face(ESpine: TopoDS_Edge, EProfile: TopoDS_Edge): TopoDS_Face;

// Returns the edge created from an edge of the spine and a vertex of the profile
Edge(ESpine: TopoDS_Edge, VProfile: TopoDS_Vertex): TopoDS_Edge;

// Returns the shape created from the profile at the position of the vertex VSpine
Section(VSpine: TopoDS_Vertex): TopoDS_Shape;

// Create a Wire by sweeping the Point along the <spine> if the <Spine> is undefined
PipeLine(Point: gp_Pnt): TopoDS_Wire;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
