# libcascade — ShapeFix (3)

4 top-level symbols. Signatures are verbatim typescript.

// This class provides a set of tools for repairing a wire
ShapeFix_Wire: declare class ShapeFix_Wire extends ShapeFix_Root

constructor

// Sets all modes to default
ClearModes(): void;

// Clears all statuses
ClearStatuses(): void;

// Load analyzer with all the data for the wire and face and drops all fixing statuses
Init(wire: TopoDS_Wire, face: TopoDS_Face, prec: number): void;
Init(saw: ShapeAnalysis_Wire): void;
Init(wire: TopoDS_Wire, face: TopoDS_Face, prec: number): void;
Init(saw: ShapeAnalysis_Wire): void;

// Load data for the wire, and drops all fixing statuses
Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;
Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;

// Set working face for the wire
SetFace(face: TopoDS_Face): void;
SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetFace(face: TopoDS_Face): void;
SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;

// Set surface analysis for the wire
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surf: Geom_Surface): void;
SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surf: Geom_Surface): void;
SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surf: Geom_Surface): void;
SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;

// Set working precision (to root and to analyzer)
SetPrecision(preci: number): void;

// Sets the maximal allowed angle of the tails in radians
SetMaxTailAngle(theMaxTailAngle: number): void;

// Sets the maximal allowed width of the tails
SetMaxTailWidth(theMaxTailWidth: number): void;

// Tells if the wire is loaded
IsLoaded(): boolean;

// Tells if the wire and face are loaded
IsReady(): boolean;

// returns number of edges in the working wire
NbEdges(): number;

// Makes the resulting Wire (by basic Brep_Builder)
Wire(): TopoDS_Wire;

// Makes the resulting Wire (by BRepAPI_MakeWire)
WireAPIMake(): TopoDS_Wire;

// returns field Analyzer (working tool)
Analyzer(): ShapeAnalysis_Wire;

// returns working wire
WireData(): ShapeExtend_WireData;

// returns working face (Analyzer.Face())
Face(): TopoDS_Face;

// Returns (modifiable) the flag which defines whether it is allowed to modify topology of the wire during fixing (adding/removing edges etc.)
ModifyTopologyMode(): boolean;

// Returns (modifiable) the flag which defines whether the Fix..() methods are allowed to modify geometry of the edges and vertices
ModifyGeometryMode(): boolean;

// Returns (modifiable) the flag which defines whether the Fix..() methods are allowed to modify RemoveLoop of the edges
ModifyRemoveLoopMode(): number;

// Returns (modifiable) the flag which defines whether the wire is to be closed (by calling methods like `FixDegenerated()` and `FixConnected()` for last and first edges)
ClosedWireMode(): boolean;

// Returns (modifiable) the flag which defines whether the 2d (True) representation of the wire is preferable over 3d one (in the case of ambiguity in FixEdgeCurves)
PreferencePCurveMode(): boolean;

// Returns (modifiable) the flag which defines whether tool tries to fix gaps first by changing curves ranges (i.e
FixGapsByRangesMode(): boolean;

FixReorderMode(): number;

FixSmallMode(): number;

FixConnectedMode(): number;

FixEdgeCurvesMode(): number;

FixDegeneratedMode(): number;

FixSelfIntersectionMode(): number;

FixLackingMode(): number;

FixGaps3dMode(): number;

// Returns (modifiable) the flag for corresponding Fix..() method which defines whether this method will be called from the method APIFix()
FixGaps2dMode(): number;

FixReversed2dMode(): number;

FixRemovePCurveMode(): number;

FixAddPCurveMode(): number;

FixRemoveCurve3dMode(): number;

FixAddCurve3dMode(): number;

FixSeamMode(): number;

FixShiftedMode(): number;

FixSameParameterMode(): number;

FixVertexToleranceMode(): number;

FixNotchedEdgesMode(): number;

FixSelfIntersectingEdgeMode(): number;

FixIntersectingEdgesMode(): number;

// Returns (modifiable) the flag for corresponding Fix..() method which defines whether this method will be called from the corresponding Fix..() method of the public level
FixNonAdjacentIntersectingEdgesMode(): number;

FixTailMode(): number;

// This method performs all the available fixes
Perform(theProgress?: Message_ProgressRange): boolean;

// Performs an analysis and reorders edges in the wire using class WireOrder
FixReorder(theModeBoth: boolean): boolean;
FixReorder(wi: ShapeAnalysis_WireOrder): boolean;
FixReorder(theModeBoth: boolean): boolean;
FixReorder(wi: ShapeAnalysis_WireOrder): boolean;

// Applies FixSmall(num) to all edges in the wire
FixSmall(lockvtx: boolean, precsmall: number): number;
FixSmall(num: number, lockvtx: boolean, precsmall: number): boolean;
FixSmall(lockvtx: boolean, precsmall: number): number;
FixSmall(num: number, lockvtx: boolean, precsmall: number): boolean;

// Applies FixConnected(num) to all edges in the wire Connection between first and last edges is treated only if flag ClosedMode is True If <prec> is -1 then `MaxTolerance()` is taken
FixConnected(prec: number): boolean;
FixConnected(num: number, prec: number, theUpdateWire: boolean): boolean;
FixConnected(prec: number): boolean;
FixConnected(num: number, prec: number, theUpdateWire: boolean): boolean;

// Groups the fixes dealing with 3d and pcurves of the edges
FixEdgeCurves(): boolean;

// Applies FixDegenerated(num) to all edges in the wire Connection between first and last edges is treated only if flag ClosedMode is True
FixDegenerated(): boolean;
FixDegenerated(num: number): boolean;
FixDegenerated(): boolean;
FixDegenerated(num: number): boolean;

// Applies FixSelfIntersectingEdge(num) and FixIntersectingEdges(num) to all edges in the wire and FixIntersectingEdges(num1, num2) for all pairs num1 and num2 such that num2 >= num1 + 2 and removes wrong edges if any
FixSelfIntersection(): boolean;

// Applies FixLacking(num) to all edges in the wire Connection between first and last edges is treated only if flag ClosedMode is True If <force> is False (default), test for connectness is done with precision of vertex between edges, else it is done with minimal value of vertex tolerance and Analyzer.Precision()
FixLacking(force: boolean): boolean;
FixLacking(num: number, force: boolean): boolean;
FixLacking(force: boolean): boolean;
FixLacking(num: number, force: boolean): boolean;

// Fixes a wire to be well closed It performs FixConnected, FixDegenerated and FixLacking between last and first edges (independingly on flag ClosedMode and modes for these fixings) If <prec> is -1 then `MaxTolerance()` is taken
FixClosed(prec?: number): boolean;

// Fixes gaps between ends of 3d curves on adjacent edges myPrecision is used to detect the gaps
FixGaps3d(): boolean;

// Fixes gaps between ends of pcurves on adjacent edges myPrecision is used to detect the gaps
FixGaps2d(): boolean;

// Fixes a seam edge A Seam edge has two pcurves, one for forward
FixSeam(num: number): boolean;

// Fixes edges which have pcurves shifted by whole parameter range on the closed surface (the case may occur if pcurve of edge was computed by projecting 3d curve, which goes along the seam)
FixShifted(): boolean;

FixNotchedEdges(): boolean;

// Fixes gap between ends of 3d curves on num-1 and num-th edges
FixGap3d(num: number, convert?: boolean): boolean;

// Fixes gap between ends of pcurves on num-1 and num-th edges
FixGap2d(num: number, convert?: boolean): boolean;

FixTails(): boolean;

StatusReorder(status: ShapeExtend_Status): boolean;

StatusSmall(status: ShapeExtend_Status): boolean;

StatusConnected(status: ShapeExtend_Status): boolean;

StatusEdgeCurves(status: ShapeExtend_Status): boolean;

StatusDegenerated(status: ShapeExtend_Status): boolean;

StatusSelfIntersection(status: ShapeExtend_Status): boolean;

StatusLacking(status: ShapeExtend_Status): boolean;

StatusClosed(status: ShapeExtend_Status): boolean;

StatusGaps3d(status: ShapeExtend_Status): boolean;

StatusGaps2d(status: ShapeExtend_Status): boolean;

StatusNotches(status: ShapeExtend_Status): boolean;

// Querying the status of performed API fixing procedures Each Status..() methods gives information about the last call to the corresponding Fix..() method of API level
StatusRemovedSegment(): boolean;

StatusFixTails(status: ShapeExtend_Status): boolean;

// Queries the status of last call to methods Fix..
LastFixStatus(status: ShapeExtend_Status): boolean;

// Returns tool for fixing wires
FixEdgeTool(): ShapeFix_Edge;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fixing disconnected edges in the wire Fixes vertices in the wire on the basis of pre-analysis made by {@link ShapeAnalysis_WireVertex`ShapeAnalysis_WireVertex`} (given as argument)
ShapeFix_WireVertex: declare class ShapeFix_WireVertex

constructor

// Loads all the data on wire, already analysed by {@link ShapeAnalysis_WireVertex`ShapeAnalysis_WireVertex`}
Init(sawv: ShapeAnalysis_WireVertex): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(sbwd: ShapeExtend_WireData, preci: number): void;
Init(sawv: ShapeAnalysis_WireVertex): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(sbwd: ShapeExtend_WireData, preci: number): void;
Init(sawv: ShapeAnalysis_WireVertex): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(sbwd: ShapeExtend_WireData, preci: number): void;

// returns internal analyzer
Analyzer(): ShapeAnalysis_WireVertex;

// returns data on wire (fixed)
WireData(): ShapeExtend_WireData;

// returns resulting wire (fixed)
Wire(): TopoDS_Wire;

// Fixes "Same" or "Close" status (same vertex may be set, without changing parameters) Returns the count of fixed vertices, 0 if none
FixSame(): number;

// Fixes all statuses except "Disjoined", i.e
Fix(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods for fixing wireframe of shape
ShapeFix_Wireframe: declare class ShapeFix_Wireframe extends ShapeFix_Root

constructor

// Clears all statuses
ClearStatuses(): void;

// Loads a shape, resets statuses
Load(shape: TopoDS_Shape): void;

// Fixes gaps between ends of curves of adjacent edges (both 3d and pcurves) in wires If precision is 0.0, uses `Precision::Confusion()`
FixWireGaps(): boolean;

// Fixes small edges in shape by merging adjacent edges If precision is 0.0, uses `Precision::Confusion()`
FixSmallEdges(): boolean;

// Auxiliary tool for FixSmallEdges which checks for small edges and fills the maps
CheckSmallEdges(theSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theEdgeToFaces: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theFaceWithSmall: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theMultyEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;
// theSmallEdges: Mutated in place
// theEdgeToFaces: Mutated in place
// theFaceWithSmall: Mutated in place
// theMultyEdges: Mutated in place

// Auxiliary tool for FixSmallEdges which merges small edges
MergeSmallEdges(theSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theEdgeToFaces: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theFaceWithSmall: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theMultyEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theModeDrop: boolean, theLimitAngle: number): boolean;
// theSmallEdges: Mutated in place
// theEdgeToFaces: Mutated in place
// theFaceWithSmall: Mutated in place
// theMultyEdges: Mutated in place

// Decodes the status of the last FixWireGaps
StatusWireGaps(status: ShapeExtend_Status): boolean;

// Decodes the status of the last FixSmallEdges
StatusSmallEdges(status: ShapeExtend_Status): boolean;

Shape(): TopoDS_Shape;

// Returns mode managing removing small edges
ModeDropSmallEdges(): boolean;

// Set limit angle for merging edges
SetLimitAngle(theLimitAngle: number): void;

// Get limit angle for merging edges
LimitAngle(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeFix_SequenceOfWireSegment: NCollection_Sequence_ShapeFix_WireSegment
