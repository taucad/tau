# libcascade — ShapeAnalysis (2)

9 top-level symbols. Signatures are verbatim typescript.

// This class is intended to output free bounds of the shape
ShapeAnalysis_FreeBounds: declare class ShapeAnalysis_FreeBounds

constructor

// Returns compound of closed wires out of free edges
GetClosedWires(): TopoDS_Compound;

// Returns compound of open wires out of free edges
GetOpenWires(): TopoDS_Compound;

// Builds sequence of <wires> out of sequence of not sorted <edges>
static ConnectEdgesToWires(edges: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;
// edges: the sequence of edges to connect
// toler: distance tolerance for connection
// shared: if true, connection uses shared vertices only

// Connects wires from the given sequence into longer wires
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean, vertices: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_HSequence_TopoDS_Shape;
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean, vertices: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_HSequence_TopoDS_Shape;
// iwires: the sequence of input wires
// toler: distance tolerance for connection
// shared: if true, connection uses shared vertices only

// Extracts closed sub-wires out of <wires> and adds them to <closed>, open wires remained after extraction are put into <open>
static SplitWires(wires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): { closed: NCollection_HSequence_TopoDS_Shape; open: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

// Dispatches sequence of <wires> into two compounds <closed> for closed wires and <open> for open wires
static DispatchWires(wires: NCollection_HSequence_TopoDS_Shape, closed: TopoDS_Compound, open: TopoDS_Compound): void;
// closed: Mutated in place
// open: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to calculate shape free bounds properties
ShapeAnalysis_FreeBoundsProperties: declare class ShapeAnalysis_FreeBoundsProperties

constructor

// Initializes the object with given parameters
Init(shape: TopoDS_Shape, tolerance: number, splitclosed: boolean, splitopen: boolean): void;
Init(shape: TopoDS_Shape, splitclosed: boolean, splitopen: boolean): void;
Init(shape: TopoDS_Shape, tolerance: number, splitclosed: boolean, splitopen: boolean): void;
Init(shape: TopoDS_Shape, splitclosed: boolean, splitopen: boolean): void;

// Builds and analyzes free bounds of the shape
Perform(): boolean;

// Returns True if shape is loaded
IsLoaded(): boolean;

// Returns shape
Shape(): TopoDS_Shape;

// Returns tolerance
Tolerance(): number;

// Returns number of free bounds
NbFreeBounds(): number;

// Returns number of closed free bounds
NbClosedFreeBounds(): number;

// Returns number of open free bounds
NbOpenFreeBounds(): number;

// Returns all closed free bounds
ClosedFreeBounds(): NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData;

// Returns all open free bounds
OpenFreeBounds(): NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData;

// Returns properties of closed free bound specified by its rank number
ClosedFreeBound(index: number): ShapeAnalysis_FreeBoundData;

// Returns properties of open free bound specified by its rank number
OpenFreeBound(index: number): ShapeAnalysis_FreeBoundData;

DispatchBounds(): boolean;

CheckContours(prec?: number): boolean;

CheckNotches(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };
CheckNotches(freebound: TopoDS_Wire, num: number, notch: TopoDS_Wire, distMax: number, prec: number): { returnValue: boolean; distMax: number };
CheckNotches(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };
CheckNotches(freebound: TopoDS_Wire, num: number, notch: TopoDS_Wire, distMax: number, prec: number): { returnValue: boolean; distMax: number };

FillProperties(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Analyzing tool aimed to work on primitive geometrical objects
ShapeAnalysis_Geom: declare class ShapeAnalysis_Geom

constructor

// Builds a plane out of a set of points in array Returns in <dmax> the maximal distance between the produced plane and given points
static NearestPlane(Pnts: NCollection_Array1_gp_Pnt, aPln: gp_Pln, Dmax?: number): { returnValue: boolean; Dmax: number };
// aPln: Mutated in place

// Builds transformation object out of matrix
static PositionTrsf(coefs: NCollection_HArray2_double, trsf: gp_Trsf, unit: number, prec: number): boolean;
// trsf: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Dumps shape contents
ShapeAnalysis_ShapeContents: declare class ShapeAnalysis_ShapeContents

constructor

// Clears all accumulated statistics
Clear(): void;

// Clears all flags
ClearFlags(): void;

// Counts quantities of sun-shapes in shape and stores sub-shapes according to flags
Perform(shape: TopoDS_Shape): void;

// Returns (modifiable) the flag which defines whether to store faces with edges if its 3D curves has more than 8192 poles
ModifyBigSplineMode(): boolean;

// Returns (modifiable) the flag which defines whether to store faces on indirect surfaces
ModifyIndirectMode(): boolean;

// Returns (modifiable) the flag which defines whether to store faces on offset surfaces
ModifyOffsetSurfaceMode(): boolean;

// Returns (modifiable) the flag which defines whether to store faces with edges if its 3D curves are trimmed curves
ModifyTrimmed3dMode(): boolean;

// Returns (modifiable) the flag which defines whether to store faces with edges if its 3D curves and pcurves are offset curves
ModifyOffsetCurveMode(): boolean;

// Returns (modifiable) the flag which defines whether to store faces with edges if its pcurves are trimmed curves
ModifyTrimmed2dMode(): boolean;

NbSolids(): number;

NbShells(): number;

NbFaces(): number;

NbWires(): number;

NbEdges(): number;

NbVertices(): number;

NbSolidsWithVoids(): number;

NbBigSplines(): number;

NbC0Surfaces(): number;

NbC0Curves(): number;

NbOffsetSurf(): number;

NbIndirectSurf(): number;

NbOffsetCurves(): number;

NbTrimmedCurve2d(): number;

NbTrimmedCurve3d(): number;

NbBSplibeSurf(): number;

NbBezierSurf(): number;

NbTrimSurf(): number;

NbWireWitnSeam(): number;

NbWireWithSevSeams(): number;

NbFaceWithSevWires(): number;

NbNoPCurve(): number;

NbFreeFaces(): number;

NbFreeWires(): number;

NbFreeEdges(): number;

NbSharedSolids(): number;

NbSharedShells(): number;

NbSharedFaces(): number;

NbSharedWires(): number;

NbSharedFreeWires(): number;

NbSharedFreeEdges(): number;

NbSharedEdges(): number;

NbSharedVertices(): number;

BigSplineSec(): NCollection_HSequence_TopoDS_Shape;

IndirectSec(): NCollection_HSequence_TopoDS_Shape;

OffsetSurfaceSec(): NCollection_HSequence_TopoDS_Shape;

Trimmed3dSec(): NCollection_HSequence_TopoDS_Shape;

OffsetCurveSec(): NCollection_HSequence_TopoDS_Shape;

Trimmed2dSec(): NCollection_HSequence_TopoDS_Shape;

// DEPRECATED
ModifyOffestSurfaceMode(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for computing shape tolerances (minimal, maximal, average), finding shape with tolerance matching given criteria, setting or limitating tolerances
ShapeAnalysis_ShapeTolerance: declare class ShapeAnalysis_ShapeTolerance

constructor

// Determines a tolerance from the ones stored in a shape Remark
Tolerance(shape: TopoDS*Shape, mode: number, type*?: TopAbs_ShapeEnum): number;

// Determines which shapes have a tolerance over the given value <type> is interpreted as in the method Tolerance
OverTolerance(shape: TopoDS*Shape, value: number, type*?: TopAbs_ShapeEnum): NCollection_HSequence_TopoDS_Shape;

// Determines which shapes have a tolerance within a given interval <type> is interpreted as in the method Tolerance
InTolerance(shape: TopoDS*Shape, valmin: number, valmax: number, type*?: TopAbs_ShapeEnum): NCollection_HSequence_TopoDS_Shape;

// Initializes computation of cumulated tolerance
InitTolerance(): void;

// Adds data on new Shape to compute Cumulated Tolerance (prepares three computations
AddTolerance(shape: TopoDS*Shape, type*?: TopAbs_ShapeEnum): void;

// Returns the computed tolerance according to the <mode> <mode> = 0
GlobalTolerance(mode: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides operators to analyze edges orientation in the shell
ShapeAnalysis_Shell: declare class ShapeAnalysis_Shell

constructor

// Clears data about loaded shells and performed checks
Clear(): void;

// Adds shells contained in the <shape> to the list of loaded shells
LoadShells(shape: TopoDS_Shape): void;

// Checks if shells fulfill orientation condition, i.e
CheckOrientedShells(shape: TopoDS_Shape, alsofree?: boolean, checkinternaledges?: boolean): boolean;

// Tells if a shape is loaded (only shells are checked)
IsLoaded(shape: TopoDS_Shape): boolean;

// Returns the actual number of loaded shapes (i.e
NbLoaded(): number;

// Returns a loaded shape specified by its rank number
Loaded(num: number): TopoDS_Shape;

// Tells if at least one edge is recorded as bad
HasBadEdges(): boolean;

// Returns the list of bad edges as a Compound It is empty (not null) if no edge are recorded as bad
BadEdges(): TopoDS_Compound;

// Tells if at least one edge is recorded as free (not connected)
HasFreeEdges(): boolean;

// Returns the list of free (not connected) edges as a Compound It is empty (not null) if no edge are recorded as free
FreeEdges(): TopoDS_Compound;

// Tells if at least one edge is connected (shared twice or more)
HasConnectedEdges(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Complements standard tool {@link Geom_Surface`Geom_Surface`} by providing additional functionality for detection surface singularities, checking spatial surface closure and computing projections of 3D points onto a surface
ShapeAnalysis_Surface: declare class ShapeAnalysis_Surface extends Standard_Transient

constructor

// Loads existing surface
Init(S: Geom_Surface): void;
Init(other: ShapeAnalysis_Surface): void;
Init(S: Geom_Surface): void;
Init(other: ShapeAnalysis_Surface): void;

SetDomain(U1: number, U2: number, V1: number, V2: number): void;

// Returns a surface being analyzed
Surface(): Geom_Surface;

// Returns the Adaptor
Adaptor3d(): GeomAdaptor_Surface;

// Returns the Adaptor (may be Null if method Adaptor() was not called)
TrueAdaptor3d(): GeomAdaptor_Surface;

// Returns 3D distance found by one of the following methods
Gap(): number;

// Returns a 3D point specified by parameters in surface parametrical space
Value(u: number, v: number): gp_Pnt;
Value(p2d: gp_Pnt2d): gp_Pnt;
Value(u: number, v: number): gp_Pnt;
Value(p2d: gp_Pnt2d): gp_Pnt;

// Returns True if the surface has singularities for the given precision (i.e
HasSingularities(preci: number): boolean;

// Returns the number of singularities for the given precision (i.e
NbSingularities(preci: number): number;

// Returns the characteristics of the singularity specified by its rank number <num>
Singularity(num: number, preci: number, P3d: gp_Pnt, firstP2d: gp_Pnt2d, lastP2d: gp_Pnt2d, firstpar?: number, lastpar?: number, uisodeg?: boolean): { returnValue: boolean; preci: number; firstpar: number; lastpar: number; uisodeg: boolean };
// P3d: Mutated in place
// firstP2d: Mutated in place
// lastP2d: Mutated in place

// Returns True if there is at least one surface boundary which is considered as degenerated with <preci> and distance between P3d and corresponding singular point is less than <preci> Returns True if straight pcurve going from point p2d1 to p2d2 is degenerate, i.e
IsDegenerated(P3d: gp_Pnt, preci: number): boolean;
IsDegenerated(p2d1: gp_Pnt2d, p2d2: gp_Pnt2d, tol: number, ratio: number): boolean;
IsDegenerated(P3d: gp_Pnt, preci: number): boolean;
IsDegenerated(p2d1: gp_Pnt2d, p2d2: gp_Pnt2d, tol: number, ratio: number): boolean;

// Returns True if there is at least one surface iso-line which is considered as degenerated with <preci> and distance between P3d and corresponding singular point is less than <preci> (like IsDegenerated)
DegeneratedValues(P3d: gp_Pnt, preci: number, firstP2d: gp_Pnt2d, lastP2d: gp_Pnt2d, firstpar: number, lastpar: number, forward: boolean): { returnValue: boolean; firstpar: number; lastpar: number };
// firstP2d: Mutated in place
// lastP2d: Mutated in place

// Projects a point <P3d> on a singularity by computing one of the coordinates of preliminary computed <result>
ProjectDegenerated(P3d: gp_Pnt, preci: number, neighbour: gp_Pnt2d, result: gp_Pnt2d): boolean;
ProjectDegenerated(nbrPnt: number, points: NCollection_Sequence_gp_Pnt, pnt2d: NCollection_Sequence_gp_Pnt2d, preci: number, direct: boolean): boolean;
ProjectDegenerated(P3d: gp_Pnt, preci: number, neighbour: gp_Pnt2d, result: gp_Pnt2d): boolean;
ProjectDegenerated(nbrPnt: number, points: NCollection_Sequence_gp_Pnt, pnt2d: NCollection_Sequence_gp_Pnt2d, preci: number, direct: boolean): boolean;
// result: Mutated in place

// Returns the bounds of the surface (from Bounds from Surface, but buffered)
Bounds(ufirst?: number, ulast?: number, vfirst?: number, vlast?: number): { ufirst: number; ulast: number; vfirst: number; vlast: number };

// Computes bound isos (protected against exceptions)
ComputeBoundIsos(): void;

// Returns a U-Iso
UIso(U: number): Geom_Curve;

// Returns a V-Iso
VIso(V: number): Geom_Curve;

// Tells if the Surface is spatially closed in U with given precision
IsUClosed(preci?: number): boolean;

// Tells if the Surface is spatially closed in V with given precision
IsVClosed(preci?: number): boolean;

// Computes the parameters in the surface parametrical space of 3D point
ValueOfUV(P3D: gp_Pnt, preci: number): gp_Pnt2d;

// Projects a point P3D on the surface
NextValueOfUV(p2dPrev: gp_Pnt2d, P3D: gp_Pnt, preci: number, maxpreci?: number): gp_Pnt2d;

// Tries a refinement of an already computed couple (U,V) by using projecting 3D point on iso-lines
UVFromIso(P3D: gp_Pnt, preci: number, U?: number, V?: number): { returnValue: number; U: number; V: number };

// Returns minimum value to consider the surface as U-closed
UCloseVal(): number;

// Returns minimum value to consider the surface as V-closed
VCloseVal(): number;

GetBoxUF(): Bnd_Box;

GetBoxUL(): Bnd_Box;

GetBoxVF(): Bnd_Box;

GetBoxVL(): Bnd_Box;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This tool is used for transferring parameters from 3d curve of the edge to pcurve and vice versa
ShapeAnalysis_TransferParameters: declare class ShapeAnalysis_TransferParameters extends Standard_Transient

constructor

// Initialize a tool with edge and face
Init(E: TopoDS_Edge, F: TopoDS_Face): void;

// Sets maximal tolerance to use linear recomputation of parameters
SetMaxTolerance(maxtol: number): void;

// Transfers parameters given by sequence Params from 3d curve to pcurve (if To2d is True) or back (if To2d is False) Transfers parameter given by sequence Params from 3d curve to pcurve (if To2d is True) or back (if To2d is False)
Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
Perform(Param: number, To2d: boolean): number;
Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
Perform(Param: number, To2d: boolean): number;

// Recomputes range of curves from NewEdge
TransferRange(newEdge: TopoDS_Edge, prevPar: number, currPar: number, To2d: boolean): void;
// newEdge: Mutated in place

// Returns True if 3d curve of edge and pcurve are SameRange (in default implementation, if myScale == 1 and myShift == 0)
IsSameRange(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This tool is used for transferring parameters from 3d curve of the edge to pcurve and vice versa
ShapeAnalysis_TransferParametersProj: declare class ShapeAnalysis_TransferParametersProj extends ShapeAnalysis_TransferParameters

constructor

// Initialize a tool with edge and face
Init(E: TopoDS_Edge, F: TopoDS_Face): void;

// Transfers parameters given by sequence Params from 3d curve to pcurve (if To2d is True) or back (if To2d is False) Transfers parameter given by Param from 3d curve to pcurve (if To2d is True) or back (if To2d is False)
Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
Perform(Param: number, To2d: boolean): number;
Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
Perform(Param: number, To2d: boolean): number;

// Returns modifiable flag forcing projection If it is False (default), projection is done only if edge is not SameParameter or if tolerance of edge is greater than MaxTolerance()
ForceProjection(): boolean;

// Recomputes range of curves from NewEdge
TransferRange(newEdge: TopoDS_Edge, prevPar: number, currPar: number, To2d: boolean): void;
// newEdge: Mutated in place

// Returns False;
IsSameRange(): boolean;

// Make a copy of non-manifold vertex theVert (i.e
static CopyNMVertex(theVert: TopoDS_Vertex, toedge: TopoDS_Edge, fromedge: TopoDS_Edge): TopoDS_Vertex;
static CopyNMVertex(theVert: TopoDS_Vertex, toFace: TopoDS_Face, fromFace: TopoDS_Face): TopoDS_Vertex;
static CopyNMVertex(theVert: TopoDS_Vertex, toedge: TopoDS_Edge, fromedge: TopoDS_Edge): TopoDS_Vertex;
static CopyNMVertex(theVert: TopoDS_Vertex, toFace: TopoDS_Face, fromFace: TopoDS_Face): TopoDS_Vertex;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
