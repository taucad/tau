# libcascade — ShapeFix

11 top-level symbols. Signatures are verbatim typescript.

// This package provides algorithms for fixing problematic (violating Open CASCADE requirements) shapes
ShapeFix: declare class ShapeFix

constructor

// Runs SameParameter from {@link BRepLib `BRepLib`} with these adaptations
static SameParameter(shape: TopoDS_Shape, enforce: boolean, preci?: number, theProgress?: Message_ProgressRange, theMsgReg?: ShapeExtend_BasicMsgRegistrator): boolean;

// Runs EncodeRegularity from {@link BRepLib `BRepLib`} taking into account shared components of assemblies, so that each component is processed only once
static EncodeRegularity(shape: TopoDS_Shape, tolang?: number): void;

// Removes edges which are less than given tolerance from shape with help of `ShapeFix_Wire::FixSmall()`
static RemoveSmallEdges(shape: TopoDS_Shape, Tolerance: number): { returnValue: TopoDS_Shape; context: ShapeBuild_ReShape; [Symbol.dispose](): void };
// shape: Mutated in place

// Fix position of the vertices having tolerance more tnan specified one.;
static FixVertexPosition(theshape: TopoDS_Shape, theTolerance: number, thecontext: ShapeBuild_ReShape): boolean;
// theshape: Mutated in place

// Calculate size of least edge;
static LeastEdgeSize(theshape: TopoDS_Shape): number;
// theshape: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to create a shell from the composite surface (grid of surfaces) and set of wires
ShapeFix_ComposeShell: declare class ShapeFix_ComposeShell extends ShapeFix_Root

constructor

// Initializes with composite surface, face and precision
Init(Grid: ShapeExtend_CompositeSurface, L: TopLoc_Location, Face: TopoDS_Face, Prec: number): void;

// Returns (modifiable) flag for special 'closed' mode which forces ComposeShell to consider all pcurves on closed surface as modulo period
ClosedMode(): boolean;

// Performs the work on already loaded data
Perform(): boolean;

// Splits edges in the original shape by grid
SplitEdges(): void;

// Returns resulting shell or face (or Null shape if not done)
Result(): TopoDS_Shape;

// Queries status of last call to `Perform()` OK
Status(status: ShapeExtend_Status): boolean;

// Sets tool for transfer parameters from 3d to 2d and vice versa
SetTransferParamTool(TransferParam: ShapeAnalysis_TransferParameters): void;

// Gets tool for transfer parameters from 3d to 2d and vice versa
GetTransferParamTool(): ShapeAnalysis_TransferParameters;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fixing invalid edge
ShapeFix_Edge: declare class ShapeFix_Edge extends Standard_Transient

constructor

// Returns the projector used for recomputing missing pcurves Can be used for adjusting parameters of projector
Projector(): ShapeConstruct_ProjectCurveOnSurface;

// Removes the pcurve(s) of the edge if it does not match the vertices Check is done Use
FixRemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixRemovePCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
FixRemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixRemovePCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

// Removes 3d curve of the edge if it does not match the vertices Returns
FixRemoveCurve3d(edge: TopoDS_Edge): boolean;

// See method below for information
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;

// Tries to build 3d curve of the edge if missing Use
FixAddCurve3d(edge: TopoDS_Edge): boolean;

// Increases the tolerances of the edge vertices to comprise the ends of 3d curve and pcurve on the given face (first method) or all pcurves stored in an edge (second one) Returns
FixVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixVertexTolerance(edge: TopoDS_Edge): boolean;
FixVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixVertexTolerance(edge: TopoDS_Edge): boolean;

// Fixes edge if pcurve is directed opposite to 3d curve Check is done by call to the function `ShapeAnalysis_Edge::CheckCurve3dWithPCurve()` Warning
FixReversed2d(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixReversed2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
FixReversed2d(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixReversed2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

// Tries to make edge SameParameter and sets corresponding tolerance and SameParameter flag
FixSameParameter(edge: TopoDS_Edge, tolerance: number): boolean;
FixSameParameter(edge: TopoDS_Edge, face: TopoDS_Face, tolerance: number): boolean;
FixSameParameter(edge: TopoDS_Edge, tolerance: number): boolean;
FixSameParameter(edge: TopoDS_Edge, face: TopoDS_Face, tolerance: number): boolean;

// Returns the status (in the form of True/False) of last Fix
Status(status: ShapeExtend_Status): boolean;

// Sets context
SetContext(context: ShapeBuild_ReShape): void;

// Returns context
Context(): ShapeBuild_ReShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Rebuilds edges to connect with new vertices, was moved from {@link ShapeBuild `ShapeBuild`}
ShapeFix_EdgeConnect: declare class ShapeFix_EdgeConnect

constructor

// Adds information on connectivity between start vertex of second edge and end vertex of first edge, taking edges orientation into account
Add(aFirst: TopoDS_Edge, aSecond: TopoDS_Edge): void;
Add(aShape: TopoDS_Shape): void;
Add(aFirst: TopoDS_Edge, aSecond: TopoDS_Edge): void;
Add(aShape: TopoDS_Shape): void;

// Builds shared vertices, updates their positions and tolerances
Build(): void;

// Clears internal data structure
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Project 3D point (vertex) on pcurves to find Vertex Parameter on parametric representation of an edge
ShapeFix_EdgeProjAux: declare class ShapeFix_EdgeProjAux extends Standard_Transient

constructor

Init(F: TopoDS_Face, E: TopoDS_Edge): void;

Compute(preci: number): void;

IsFirstDone(): boolean;

IsLastDone(): boolean;

FirstParam(): number;

LastParam(): number;

IsIso(C: Geom2d_Curve): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This operator allows to perform various fixes on face and its wires
ShapeFix_Face: declare class ShapeFix_Face extends ShapeFix_Root

constructor

// Sets all modes to default
ClearModes(): void;

// Loads a whole face already created, with its wires, sense and location
Init(face: TopoDS_Face): void;
Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;
Init(face: TopoDS_Face): void;
Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;
Init(face: TopoDS_Face): void;
Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Sets basic precision value (also to FixWireTool)
SetPrecision(preci: number): void;

// Sets minimal allowed tolerance (also to FixWireTool)
SetMinTolerance(mintol: number): void;

// Sets maximal allowed tolerance (also to FixWireTool)
SetMaxTolerance(maxtol: number): void;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Wire`ShapeFix_Wire`}, by default True
FixWireMode(): number;

// Returns (modifiable) the fix orientation mode, by default True
FixOrientationMode(): number;

// Returns (modifiable) the add natural bound mode
FixAddNaturalBoundMode(): number;

// Returns (modifiable) the fix missing seam mode, by default True
FixMissingSeamMode(): number;

// Returns (modifiable) the fix small area wire mode, by default False
FixSmallAreaWireMode(): number;

// Returns (modifiable) the remove face with small area, by default False
RemoveSmallAreaFaceMode(): number;

// Returns (modifiable) the fix intersecting wires mode by default True
FixIntersectingWiresMode(): number;

// Returns (modifiable) the fix loop wires mode by default True
FixLoopWiresMode(): number;

// Returns (modifiable) the fix split face mode by default True
FixSplitFaceMode(): number;

// Returns (modifiable) the auto-correct precision mode by default False
AutoCorrectPrecisionMode(): number;

// Returns (modifiable) the activation flag for periodic degenerated fix
FixPeriodicDegeneratedMode(): number;

// Returns a face which corresponds to the current state Warning
Face(): TopoDS_Face;

// Returns resulting shape (Face or Shell if split) To be used instead of `Face()` if FixMissingSeam involved
Result(): TopoDS_Shape;

// Add a wire to current face using {@link BRep_Builder `BRep_Builder`}
Add(wire: TopoDS_Wire): void;

// Performs all the fixes, depending on modes Function Status returns the status of last call to `Perform()` ShapeExtend_OK
Perform(theProgress?: Message_ProgressRange): boolean;

// Fixes orientation of wires on the face It tries to make all wires lie outside all others (according to orientation) by reversing orientation of some of them
FixOrientation(): boolean;
FixOrientation(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;
FixOrientation(): boolean;
FixOrientation(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Adds natural boundary on face if it is missing
FixAddNaturalBound(): boolean;

// Detects and fixes the special case when face on a closed surface is given by two wires closed in 3d but with gap in 2d
FixMissingSeam(): boolean;

// Detects wires with small area (that is less than 100\*Precision::PConfusion()
FixSmallAreaWire(theIsRemoveSmallFace: boolean): boolean;

// Detects if wire has a loop and fixes this situation by splitting on the few parts
FixLoopWire(aResWires: NCollection_Sequence_TopoDS_Shape): boolean;
// aResWires: Mutated in place

// Detects and fixes the special case when face has more than one wire and this wires have intersection point
FixIntersectingWires(): boolean;

// If wire contains two coincidence edges it must be removed Queries on status after `Perform()`
FixWiresTwoCoincEdges(): boolean;

// Split face if there are more than one out wire using inrormation after `FixOrientation()`
FixSplitFace(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

// Fixes topology for a specific case when face is composed by a single wire belting a periodic surface
FixPeriodicDegenerated(): boolean;

// Returns the status of last call to `Perform()` ShapeExtend_OK
Status(status: ShapeExtend_Status): boolean;

// Returns tool for fixing wires
FixWireTool(): ShapeFix_Wire;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Rebuilds connectivity between faces in shell
ShapeFix_FaceConnect: declare class ShapeFix_FaceConnect

constructor

Add(aFirst: TopoDS_Face, aSecond: TopoDS_Face): boolean;

Build(shell: TopoDS_Shell, sewtoler: number, fixtoler: number): TopoDS_Shell;

// Clears internal data structure
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fixing face with small size
ShapeFix_FixSmallFace: declare class ShapeFix_FixSmallFace extends ShapeFix_Root

constructor

Init(S: TopoDS_Shape): void;

// Fixing case of spot face
Perform(): void;

// Fixing case of spot face, if tol = -1 used local tolerance
FixSpotFace(): TopoDS_Shape;

// Compute average vertex and replacing vertices by new one
ReplaceVerticesInCaseOfSpot(F: TopoDS_Face, tol: number): boolean;
// F: Mutated in place

// Remove spot face from compound
RemoveFacesInCaseOfSpot(F: TopoDS_Face): boolean;

// Fixing case of strip face, if tol = -1 used local tolerance
FixStripFace(wasdone?: boolean): TopoDS_Shape;

// Replace veretces and edges
ReplaceInCaseOfStrip(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;
// F: Mutated in place
// E1: Mutated in place
// E2: Mutated in place

// Remove strip face from compound
RemoveFacesInCaseOfStrip(F: TopoDS_Face): boolean;

// Compute average edge for strip face
ComputeSharedEdgeForStripFace(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, F1: TopoDS_Face, tol: number): TopoDS_Edge;

FixSplitFace(S: TopoDS_Shape): TopoDS_Shape;

// Compute data for face splitting
SplitOneFace(F: TopoDS_Face, theSplittedFaces: TopoDS_Compound): boolean;
// F: Mutated in place
// theSplittedFaces: Mutated in place

FixFace(F: TopoDS_Face): TopoDS_Face;

FixShape(): TopoDS_Shape;

Shape(): TopoDS_Shape;

FixPinFace(F: TopoDS_Face): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fixing solids with small size
ShapeFix_FixSmallSolid: declare class ShapeFix_FixSmallSolid extends ShapeFix_Root

constructor

// Set working mode for operator
SetFixMode(theMode: number): void;

// Set or clear volume threshold for small solids
SetVolumeThreshold(theThreshold?: number): void;

// Set or clear width factor threshold for small solids
SetWidthFactorThreshold(theThreshold?: number): void;

// Remove small solids from the given shape
Remove(theShape: TopoDS_Shape, theContext: ShapeBuild_ReShape): TopoDS_Shape;

// Merge small solids in the given shape to adjacent non-small ones
Merge(theShape: TopoDS_Shape, theContext: ShapeBuild_ReShape): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to output free bounds of the shape (free bounds are the wires consisting of edges referenced by the only face)
ShapeFix_FreeBounds: declare class ShapeFix_FreeBounds

constructor

// Returns compound of closed wires out of free edges
GetClosedWires(): TopoDS_Compound;

// Returns compound of open wires out of free edges
GetOpenWires(): TopoDS_Compound;

// Returns modified source shape
GetShape(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for fixing selfintersecting wire and intersecting wires
ShapeFix_IntersectionTool: declare class ShapeFix_IntersectionTool

constructor

// Returns context
Context(): ShapeBuild_ReShape;

// Split edge on two new edges using new vertex "vert" and "param" - parameter for splitting The "face" is necessary for pcurves and using TransferParameterProj
SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, preci: number): boolean;
// newE1: Mutated in place
// newE2: Mutated in place

// Cut edge by parameters pend and cut
CutEdge(edge: TopoDS_Edge, pend: number, cut: number, face: TopoDS_Face, iscutline?: boolean): { returnValue: boolean; iscutline: boolean };

FixSelfIntersectWire(face: TopoDS_Face, NbSplit?: number, NbCut?: number, NbRemoved?: number): { returnValue: boolean; sewd: ShapeExtend_WireData; NbSplit: number; NbCut: number; NbRemoved: number; [Symbol.dispose](): void };

FixIntersectingWires(face: TopoDS_Face): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
