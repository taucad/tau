# libcascade — BRepOffsetAPI

10 top-level symbols. Signatures are verbatim typescript.

// Taper-adding transformations on a shape
BRepOffsetAPI_DraftAngle: declare class BRepOffsetAPI_DraftAngle extends BRepBuilderAPI_ModifyShape

constructor

// Cancels the results of all taper-adding transformations performed by this algorithm on the initial shape
Clear(): void;

// Initializes, or reinitializes this taper-adding algorithm with the shape S
Init(S: TopoDS_Shape): void;

// Adds the face F, the direction Direction, the angle Angle, the plane NeutralPlane, and the flag Flag to the framework created at construction time, and with this data, defines the taper-adding transformation
Add(F: TopoDS_Face, Direction: gp_Dir, Angle: number, NeutralPlane: gp_Pln, Flag?: boolean): void;

// Returns true if the previous taper-adding transformation performed by this algorithm in the last call to Add, was successful
AddDone(): boolean;

// Cancels the taper-adding transformation previously performed by this algorithm on the face F and the series of tangential faces which contain F, and retrieves the shape before the last taper-adding transformation
Remove(F: TopoDS_Face): void;

// Returns the shape on which an error occurred after an unsuccessful call to Add or when IsDone returns false
ProblematicShape(): TopoDS_Shape;

// Returns an error status when an error has occurred (Face, Edge or Vertex recomputation problem)
Status(): Draft_ErrorStatus;

// Returns all the faces which have been added together with the face <F>
ConnectedFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Returns all the faces on which a modification has been given
ModifiedFaces(): NCollection_List_TopoDS_Shape;

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

CorrectWires(): void;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the modified shape corresponding to
ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Build a draft surface along a wire
BRepOffsetAPI_MakeDraft: declare class BRepOffsetAPI_MakeDraft extends BRepBuilderAPI_MakeShape

constructor

// Sets the options of this draft tool
SetOptions(Style?: BRepBuilderAPI_TransitionMode, AngleMin?: number, AngleMax?: number): void;

// Sets the direction of the draft for this object
SetDraft(IsInternal?: boolean): void;

// Performs the draft using the length LengthMax as the maximum length for the corner edge between two draft faces
Perform(LengthMax: number): void;
Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;
Perform(LengthMax: number): void;
Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;
Perform(LengthMax: number): void;
Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;

// Returns the shell resulting from performance of the draft along the wire
Shell(): TopoDS_Shell;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build evolved shapes
BRepOffsetAPI_MakeEvolved: declare class BRepOffsetAPI_MakeEvolved extends BRepBuilderAPI_MakeShape

constructor

Evolved(): BRepFill_Evolved;

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

// Returns the shapes created from a subshape <SpineShape> of the spine and a subshape <ProfShape> on the profile
GeneratedShapes(SpineShape: TopoDS_Shape, ProfShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Return the face Top if <Solid> is True in the constructor
Top(): TopoDS_Shape;

// Return the face Bottom if <Solid> is True in the constructor
Bottom(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// N-Side Filling This algorithm avoids to build a face from
BRepOffsetAPI_MakeFilling: declare class BRepOffsetAPI_MakeFilling extends BRepBuilderAPI_MakeShape

constructor

// Sets the values of Tolerances used to control the constraint
SetConstrParam(Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number): void;

// Sets the parameters used for resolution
SetResolParam(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean): void;

// Sets the parameters used to approximate the filling surface
SetApproxParam(MaxDeg?: number, MaxSegments?: number): void;

// Loads the initial surface Surf to begin the construction of the surface
LoadInitSurface(Surf: TopoDS_Face): void;

// Adds a punctual constraint
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Point: gp_Pnt): number;
Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;

// Builds the resulting faces
Build(theRange?: Message_ProgressRange): void;

// Tests whether computation of the filling plate has been completed
IsDone(): boolean;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the maximum distance between the result and the constraints
G0Error(): number;
G0Error(Index: number): number;
G0Error(): number;
G0Error(Index: number): number;

// Returns the maximum angle between the result and the constraints
G1Error(): number;
G1Error(Index: number): number;
G1Error(): number;
G1Error(Index: number): number;

// Returns the maximum angle between the result and the constraints
G2Error(): number;
G2Error(Index: number): number;
G2Error(): number;
G2Error(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes algorithms for offsetting wires from a set of wires contained in a planar face
BRepOffsetAPI_MakeOffset: declare class BRepOffsetAPI_MakeOffset extends BRepBuilderAPI_MakeShape

constructor

// Initializes the algorithm to construct parallels to the spine Spine
Init(Spine: TopoDS_Face, Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
Init(Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
Init(Spine: TopoDS_Face, Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
Init(Join: GeomAbs_JoinType, IsOpenResult: boolean): void;

// Set approximation flag for conversion input contours into ones consisting of 2D circular arcs and 2D linear segments only
SetApprox(ToApprox: boolean): void;

// Initializes the algorithm to construct parallels to the wire Spine
AddWire(Spine: TopoDS_Wire): void;

// Computes a parallel to the spine at distance Offset and at an altitude Alt from the plane of the spine in relation to the normal to the spine
Perform(Offset: number, Alt?: number): void;

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

// returns a list of the created shapes from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Converts each wire of the face into contour consisting only of arcs and segments
static ConvertFace(theFace: TopoDS_Face, theAngleTolerance: number): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build a shell out of a shape
BRepOffsetAPI_MakeOffsetShape: declare class BRepOffsetAPI_MakeOffsetShape extends BRepBuilderAPI_MakeShape

constructor

// Constructs offset shape for the given one using simple algorithm without intersections computation
PerformBySimple(theS: TopoDS_Shape, theOffsetValue: number): void;

// Constructs a shape parallel to the shape S, where
PerformByJoin(S: TopoDS_Shape, Offset: number, Tol: number, Mode?: BRepOffset_Mode, Intersection?: boolean, SelfInter?: boolean, Join?: GeomAbs_JoinType, RemoveIntEdges?: boolean, theRange?: Message_ProgressRange): void;

// Does nothing
Build(theRange?: Message_ProgressRange): void;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes Modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape has been removed from the result
IsDeleted(S: TopoDS_Shape): boolean;

// Returns offset join type
GetJoinType(): GeomAbs_JoinType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build pipes
BRepOffsetAPI_MakePipe: declare class BRepOffsetAPI_MakePipe extends BRepPrimAPI_MakeSweep

constructor

Pipe(): BRepFill_Pipe;

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

// Returns the `TopoDS` Shape of the bottom of the prism
FirstShape(): TopoDS_Shape;

// Returns the `TopoDS` Shape of the top of the prism
LastShape(): TopoDS_Shape;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
Generated(SSpine: TopoDS_Shape, SProfile: TopoDS_Shape): TopoDS_Shape;
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
Generated(SSpine: TopoDS_Shape, SProfile: TopoDS_Shape): TopoDS_Shape;

ErrorOnSurface(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides for a framework to construct a shell or a solid along a spine consisting in a wire
BRepOffsetAPI_MakePipeShell: declare class BRepOffsetAPI_MakePipeShell extends BRepPrimAPI_MakeSweep

constructor

// Sets a Frenet or a CorrectedFrenet trihedron to perform the sweeping If IsFrenet is false, a corrected Frenet trihedron is used
SetMode(IsFrenet: boolean): void;
SetMode(Axe: gp_Ax2): void;
SetMode(BiNormal: gp_Dir): void;
SetMode(SpineSupport: TopoDS_Shape): boolean;
SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
SetMode(IsFrenet: boolean): void;
SetMode(Axe: gp_Ax2): void;
SetMode(BiNormal: gp_Dir): void;
SetMode(SpineSupport: TopoDS_Shape): boolean;
SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
SetMode(IsFrenet: boolean): void;
SetMode(Axe: gp_Ax2): void;
SetMode(BiNormal: gp_Dir): void;
SetMode(SpineSupport: TopoDS_Shape): boolean;
SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
SetMode(IsFrenet: boolean): void;
SetMode(Axe: gp_Ax2): void;
SetMode(BiNormal: gp_Dir): void;
SetMode(SpineSupport: TopoDS_Shape): boolean;
SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
SetMode(IsFrenet: boolean): void;
SetMode(Axe: gp_Ax2): void;
SetMode(BiNormal: gp_Dir): void;
SetMode(SpineSupport: TopoDS_Shape): boolean;
SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;

// Sets a Discrete trihedron to perform the sweeping
SetDiscreteMode(): void;

// Adds the section Profile to this framework
Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

// Sets the evolution law defined by the wire Profile with its position (Location, WithContact, WithCorrection are the same options as in methods Add) and a homotetic law defined by the function L
SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

// Removes the section Profile from this framework
Delete(Profile: TopoDS_Shape): void;

// Returns true if this tool object is ready to build the shape, i.e
IsReady(): boolean;

// Get a status, when Simulate or Build failed
GetStatus(): BRepBuilderAPI_PipeError;

// Sets the following tolerance values
SetTolerance(Tol3d?: number, BoundTol?: number, TolAngular?: number): void;

// Define the maximum V degree of resulting surface
SetMaxDegree(NewMaxDegree: number): void;

// Define the maximum number of spans in V-direction on resulting surface
SetMaxSegments(NewMaxSegments: number): void;

// Set the flag that indicates attempt to approximate a C1-continuous surface if a swept surface proved to be C0
SetForceApproxC1(ForceApproxC1: boolean): void;

// Sets the transition mode to manage discontinuities on the swept shape caused by fractures on the spine
SetTransitionMode(Mode?: BRepBuilderAPI_TransitionMode): void;

// Simulates the resulting shape by calculating its cross-sections
Simulate(NumberOfSection: number, Result: NCollection_List_TopoDS_Shape): void;
// Result: Mutated in place

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

// Transforms the sweeping Shell in Solid
MakeSolid(): boolean;

// Returns the `TopoDS` Shape of the bottom of the sweep
FirstShape(): TopoDS_Shape;

// Returns the `TopoDS` Shape of the top of the sweep
LastShape(): TopoDS_Shape;

// Returns a list of new shapes generated from the shape S by the shell-generating algorithm
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

ErrorOnSurface(): number;

// Sets the build history flag
SetIsBuildHistory(theIsBuildHistory: boolean): void;

// Returns the build history flag
IsBuildHistory(): boolean;

// Returns the list of original profiles
Profiles(theProfiles: NCollection_List_TopoDS_Shape): void;
// theProfiles: Mutated in place

// Returns the spine
Spine(): TopoDS_Wire;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build hollowed solids
BRepOffsetAPI_MakeThickSolid: declare class BRepOffsetAPI_MakeThickSolid extends BRepOffsetAPI_MakeOffsetShape

constructor

// Constructs solid using simple algorithm
MakeThickSolidBySimple(theS: TopoDS_Shape, theOffsetValue: number): void;

// Constructs a hollowed solid from the solid S by removing the set of faces ClosingFaces from S, where
MakeThickSolidByJoin(S: TopoDS_Shape, ClosingFaces: NCollection_List_TopoDS_Shape, Offset: number, Tol: number, Mode?: BRepOffset_Mode, Intersection?: boolean, SelfInter?: boolean, Join?: GeomAbs_JoinType, RemoveIntEdges?: boolean, theRange?: Message_ProgressRange): void;

// Does nothing
Build(theRange?: Message_ProgressRange): void;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build a middle path of a pipe-like shape
BRepOffsetAPI_MiddlePath: declare class BRepOffsetAPI_MiddlePath extends BRepBuilderAPI_MakeShape

constructor

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
