# libcascade — ShapeAnalysis (3)

6 top-level symbols. Signatures are verbatim typescript.

// This class provides analysis of a wire to be compliant to CAS.CADE requirements
ShapeAnalysis_Wire: declare class ShapeAnalysis_Wire extends Standard_Transient

constructor

// Initializes the object with standard {@link TopoDS_Wire`TopoDS_Wire`}, face and precision
Init(wire: TopoDS_Wire, face: TopoDS_Face, precision: number): void;
Init(sbwd: ShapeExtend_WireData, face: TopoDS_Face, precision: number): void;
Init(wire: TopoDS_Wire, face: TopoDS_Face, precision: number): void;
Init(sbwd: ShapeExtend_WireData, face: TopoDS_Face, precision: number): void;

// Loads the object with standard {@link TopoDS_Wire`TopoDS_Wire`}
Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;
Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;

// Loads the face the wire lies on
SetFace(face: TopoDS_Face): void;
SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetFace(face: TopoDS_Face): void;
SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;

// Loads the surface analysis object
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surface: Geom_Surface): void;
SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surface: Geom_Surface): void;
SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surface: Geom_Surface): void;
SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;

SetPrecision(precision: number): void;

// Unsets all the status and distance fields wire, face and precision are not cleared
ClearStatuses(): void;

// Returns True if wire is loaded and has number of edges >0
IsLoaded(): boolean;

// Returns True if IsLoaded and underlying face is not null
IsReady(): boolean;

// Returns the value of precision
Precision(): number;

// Returns wire object being analyzed
WireData(): ShapeExtend_WireData;

// Returns the number of edges in the wire, or 0 if it is not loaded
NbEdges(): number;

// Returns the working face
Face(): TopoDS_Face;

// Returns the working surface
Surface(): ShapeAnalysis_Surface;

// Performs all the checks in the following order
Perform(): boolean;

// Calls CheckOrder and returns False if wire is already ordered (tail-to-head), True otherwise Flag <isClosed> defines if the wire is closed or not Flag <mode3d> defines which mode is used (3d or 2d) Analyzes the order of the edges in the wire, uses class WireOrder for that purpose
CheckOrder(isClosed: boolean, mode3d: boolean): boolean;
CheckOrder(sawo: ShapeAnalysis_WireOrder, isClosed: boolean, theMode3D: boolean, theModeBoth: boolean): boolean;
CheckOrder(isClosed: boolean, mode3d: boolean): boolean;
CheckOrder(sawo: ShapeAnalysis_WireOrder, isClosed: boolean, theMode3D: boolean, theModeBoth: boolean): boolean;

// Calls to CheckConnected for each edge Returns
CheckConnected(prec: number): boolean;
CheckConnected(num: number, prec: number): boolean;
CheckConnected(prec: number): boolean;
CheckConnected(num: number, prec: number): boolean;

// Calls to CheckSmall for each edge Returns
CheckSmall(precsmall: number): boolean;
CheckSmall(num: number, precsmall: number): boolean;
CheckSmall(precsmall: number): boolean;
CheckSmall(num: number, precsmall: number): boolean;

// Checks edges geometry (consistency of 2d and 3d senses, adjasment of curves to the vertices, etc.)
CheckEdgeCurves(): boolean;

// Calls to CheckDegenerated for each edge Returns
CheckDegenerated(): boolean;
CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
CheckDegenerated(num: number): boolean;
CheckDegenerated(): boolean;
CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
CheckDegenerated(num: number): boolean;
CheckDegenerated(): boolean;
CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
CheckDegenerated(num: number): boolean;

// Checks if wire is closed, performs CheckConnected, CheckDegenerated and CheckLacking for the first and the last edges Returns
CheckClosed(prec?: number): boolean;

// Checks self-intersection of the wire (considering pcurves) Looks for self-intersecting edges and each pair of intersecting edges
CheckSelfIntersection(): boolean;

// Calls to CheckLacking for each edge Returns
CheckLacking(): boolean;
CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
CheckLacking(num: number, Tolerance: number): boolean;
CheckLacking(): boolean;
CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
CheckLacking(num: number, Tolerance: number): boolean;
CheckLacking(): boolean;
CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
CheckLacking(num: number, Tolerance: number): boolean;

CheckGaps3d(): boolean;

CheckGaps2d(): boolean;

CheckCurveGaps(): boolean;

// Checks if a seam pcurves are correct oriented Returns
CheckSeam(num: number, cf?: number, cl?: number): { returnValue: boolean; C1: Geom2d_Curve; C2: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
CheckSeam(num: number): boolean;
CheckSeam(num: number, cf?: number, cl?: number): { returnValue: boolean; C1: Geom2d_Curve; C2: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
CheckSeam(num: number): boolean;

// Checks gap between edges in 3D (3d curves)
CheckGap3d(num?: number): boolean;

// Checks gap between edges in 2D (pcurves)
CheckGap2d(num?: number): boolean;

// Checks gap between points on 3D curve and points on surface generated by pcurve of the num-th edge
CheckCurveGap(num?: number): boolean;

// Checks if num-th edge is self-intersecting
CheckSelfIntersectingEdge(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt): boolean;
CheckSelfIntersectingEdge(num: number): boolean;
CheckSelfIntersectingEdge(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt): boolean;
CheckSelfIntersectingEdge(num: number): boolean;
// points2d: Mutated in place
// points3d: Mutated in place

// Checks two adjacent edges for intersecting
CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num: number): boolean;
CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num1: number, num2: number): boolean;
CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num: number): boolean;
CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num1: number, num2: number): boolean;
CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num: number): boolean;
CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num1: number, num2: number): boolean;
CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num: number): boolean;
CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
CheckIntersectingEdges(num1: number, num2: number): boolean;
// points2d: Mutated in place
// points3d: Mutated in place
// errors: Mutated in place

// Checks if wire defines an outer bound on the face Uses `ShapeAnalysis::IsOuterBound` for analysis If <APIMake> is True uses BRepAPI_MakeWire to build the wire, if False (to be used only when edges share common vertices) uses {@link BRep_Builder `BRep_Builder`} to build the wire
CheckOuterBound(APIMake?: boolean): boolean;

// Detects a notch
CheckNotchedEdges(num: number, shortNum: number, param: number, Tolerance: number): { returnValue: boolean; shortNum: number; param: number };

// Checks if wire has parametric area less than precision
CheckSmallArea(theWire: TopoDS_Wire): boolean;

// Checks with what orientation <shape> (wire or edge) can be connected to the wire
CheckShapeConnect(shape: TopoDS_Shape, prec: number): boolean;
CheckShapeConnect(tailhead: number, tailtail: number, headtail: number, headhead: number, shape: TopoDS_Shape, prec: number): { returnValue: boolean; tailhead: number; tailtail: number; headtail: number; headhead: number };
CheckShapeConnect(shape: TopoDS_Shape, prec: number): boolean;
CheckShapeConnect(tailhead: number, tailtail: number, headtail: number, headhead: number, shape: TopoDS_Shape, prec: number): { returnValue: boolean; tailhead: number; tailtail: number; headtail: number; headhead: number };

// Checks existence of loop on wire and return vertices which are loop vertices (vertices belonging to a few pairs of edges)
CheckLoop(aMapLoopVertices: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, aMapVertexEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, aMapSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, aMapSeemEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;
// aMapLoopVertices: Mutated in place
// aMapVertexEdges: Mutated in place
// aMapSmallEdges: Mutated in place
// aMapSeemEdges: Mutated in place

CheckTail(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theMaxSine: number, theMaxWidth: number, theMaxTolerance: number, theEdge11: TopoDS_Edge, theEdge12: TopoDS_Edge, theEdge21: TopoDS_Edge, theEdge22: TopoDS_Edge): boolean;

StatusOrder(Status: ShapeExtend_Status): boolean;

StatusConnected(Status: ShapeExtend_Status): boolean;

StatusEdgeCurves(Status: ShapeExtend_Status): boolean;

StatusDegenerated(Status: ShapeExtend_Status): boolean;

StatusClosed(Status: ShapeExtend_Status): boolean;

StatusSmall(Status: ShapeExtend_Status): boolean;

StatusSelfIntersection(Status: ShapeExtend_Status): boolean;

StatusLacking(Status: ShapeExtend_Status): boolean;

StatusGaps3d(Status: ShapeExtend_Status): boolean;

StatusGaps2d(Status: ShapeExtend_Status): boolean;

StatusCurveGaps(Status: ShapeExtend_Status): boolean;

StatusLoop(Status: ShapeExtend_Status): boolean;

// Querying the status of the LAST performed 'Advanced' checking procedure
LastCheckStatus(Status: ShapeExtend_Status): boolean;

// Returns the last lowest distance in 3D computed by CheckOrientation, CheckConnected, CheckContinuity3d, CheckVertex, CheckNewVertex
MinDistance3d(): number;

// Returns the last lowest distance in 2D-UV computed by CheckContinuity2d
MinDistance2d(): number;

// Returns the last maximal distance in 3D computed by CheckOrientation, CheckConnected, CheckContinuity3d, CheckVertex, CheckNewVertex, CheckSameParameter
MaxDistance3d(): number;

// Returns the last maximal distance in 2D-UV computed by CheckContinuity2d
MaxDistance2d(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to control and, if possible, redefine the order of a list of edges which define a wire Edges are not given directly, but as their bounds (start,end)
ShapeAnalysis_WireOrder: declare class ShapeAnalysis_WireOrder

constructor

// Sets new values
SetMode(theMode3D: boolean, theTolerance: number, theModeBoth?: boolean): void;

// Returns the working tolerance
Tolerance(): number;

// Clears the list of edges, but not mode and tol
Clear(): void;

// Adds a couple of points 3D (start, end) Adds a couple of points 2D (start, end) Adds a couple of points 3D and 2D (start, end)
Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;
Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;
Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;

// Returns the count of added couples of points (one per edges)
NbEdges(): number;

// If this mode is True method perform does not sort edges of different loops
KeepLoopsMode(): boolean;

// Computes the better order Optimised if the couples were already in order The criterium is
Perform(closed?: boolean): void;

// Tells if Perform has been done Else, the following methods returns original values
IsDone(): boolean;

// Returns the status of the order (0 if not done)
Status(): number;

// Returns the number of original edge which correspond to the newly ordered number <n> Warning
Ordered(theIdx: number): number;

// Returns the values of the couple <num>, as 3D values
XYZ(theIdx: number, theStart3D: gp_XYZ, theEnd3D: gp_XYZ): void;
// theStart3D: Mutated in place
// theEnd3D: Mutated in place

// Returns the values of the couple <num>, as 2D values
XY(theIdx: number, theStart2D: gp_XY, theEnd2D: gp_XY): void;
// theStart2D: Mutated in place
// theEnd2D: Mutated in place

// Returns the gap between a couple and its preceding <num> is considered ordered If <num> = 0 (D), returns the greatest gap found
Gap(num?: number): number;

// Determines the chains inside which successive edges have a gap less than a given value
SetChains(gap: number): void;

// Returns the count of computed chains
NbChains(): number;

// Returns, for the chain n0 num, starting and ending numbers of edges
Chain(num: number, n1?: number, n2?: number): { n1: number; n2: number };

// Determines the couples of edges for which end and start fit inside a given gap
SetCouples(gap: number): void;

// Returns the count of computed couples
NbCouples(): number;

// Returns, for the couple n0 num, the two implied edges In the list of ordered edges
Couple(num: number, n1?: number, n2?: number): { n1: number; n2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Analyzes and records status of vertices in a Wire
ShapeAnalysis_WireVertex: declare class ShapeAnalysis_WireVertex

constructor

Init(wire: TopoDS_Wire, preci: number): void;
Init(swbd: ShapeExtend_WireData, preci: number): void;
Init(wire: TopoDS_Wire, preci: number): void;
Init(swbd: ShapeExtend_WireData, preci: number): void;

Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;
Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;

// Sets the precision for work Analysing
SetPrecision(preci: number): void;

Analyze(): void;

// Records status "Same Vertex" (logically) on Vertex <num>
SetSameVertex(num: number): void;

// Records status "Same Coords" (at the Vertices Tolerances)
SetSameCoords(num: number): void;

// Records status "Close Coords" (at the {@link Precision`Precision`} of <me>)
SetClose(num: number): void;

// <num> is the End of preceding Edge, and its projection on the following one lies on it at the {@link Precision`Precision`} of <me> <ufol> gives the parameter on the following edge
SetEnd(num: number, pos: gp_XYZ, ufol: number): void;

// <num> is the Start of following Edge, its projection on the preceding one lies on it at the {@link Precision`Precision`} of <me> <upre> gives the parameter on the preceding edge
SetStart(num: number, pos: gp_XYZ, upre: number): void;

// <num> is the Intersection of both Edges <upre> is the parameter on preceding edge, <ufol> on following edge
SetInters(num: number, pos: gp_XYZ, upre: number, ufol: number): void;

// <num> cannot be said as same vertex
SetDisjoined(num: number): void;

// Returns True if analysis was performed, else returns False
IsDone(): boolean;

// Returns precision value used in analysis
Precision(): number;

// Returns the number of edges in analyzed wire (i.e
NbEdges(): number;

// Returns analyzed wire
WireData(): ShapeExtend_WireData;

// Returns the recorded status for a vertex More detail by method Data
Status(num: number): number;

Position(num: number): gp_XYZ;

UPrevious(num: number): number;

UFollowing(num: number): number;

// Returns the recorded status for a vertex With its recorded position and parameters on both edges These values are relevant regarding the status
Data(num: number, pos: gp_XYZ, upre?: number, ufol?: number): { returnValue: number; upre: number; ufol: number };
// pos: Mutated in place

// For a given status, returns the rank of the vertex which follows <num> and has the same status
NextStatus(stat: number, num?: number): number;

// For a given criter, returns the rank of the vertex which follows <num> and has the same status
NextCriter(crit: number, num?: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_DataMapOfShapeListOfReal: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher

ShapeAnalysis_HSequenceOfFreeBounds: NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData

ShapeAnalysis_SequenceOfFreeBounds: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData
