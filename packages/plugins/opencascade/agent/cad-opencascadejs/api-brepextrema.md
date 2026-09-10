# libcascade — BRepExtrema

20 top-level symbols. Signatures are verbatim typescript.

// This class provides tools to compute minimum distance between two Shapes (Compound,CompSolid, Solid, Shell, Face, Wire, Edge, Vertex)
BRepExtrema_DistShapeShape: declare class BRepExtrema_DistShapeShape

constructor

// Sets deflection to computation of the minimum distance
SetDeflection(theDeflection: number): void;

// load first shape into extrema
LoadS1(Shape1: TopoDS_Shape): void;

// load second shape into extrema
LoadS2(Shape1: TopoDS_Shape): void;

// computation of the minimum distance (value and couple of points)
Perform(theRange?: Message_ProgressRange): boolean;

// True if the minimum distance is found
IsDone(): boolean;

// Returns the number of solutions satisfying the minimum distance
NbSolution(): number;

// Returns the value of the minimum distance
Value(): number;

// True if one of the shapes is a solid and the other shape is completely or partially inside the solid
InnerSolution(): boolean;

// Returns the Point corresponding to the <N>th solution on the first Shape
PointOnShape1(N: number): gp_Pnt;

// Returns the Point corresponding to the <N>th solution on the second Shape
PointOnShape2(N: number): gp_Pnt;

// gives the type of the support where the Nth solution on the first shape is situated
SupportTypeShape1(N: number): BRepExtrema_SupportType;

// gives the type of the support where the Nth solution on the second shape is situated
SupportTypeShape2(N: number): BRepExtrema_SupportType;

// gives the support where the Nth solution on the first shape is situated
SupportOnShape1(N: number): TopoDS_Shape;

// gives the support where the Nth solution on the second shape is situated
SupportOnShape2(N: number): TopoDS_Shape;

// gives the corresponding parameter t if the Nth solution is situated on an Edge of the first shape
ParOnEdgeS1(N: number, t?: number): { t: number };

// gives the corresponding parameter t if the Nth solution is situated on an Edge of the first shape
ParOnEdgeS2(N: number, t?: number): { t: number };

// gives the corresponding parameters (U,V) if the Nth solution is situated on an face of the first shape
ParOnFaceS1(N: number, u?: number, v?: number): { u: number; v: number };

// gives the corresponding parameters (U,V) if the Nth solution is situated on an Face of the second shape
ParOnFaceS2(N: number, u?: number, v?: number): { u: number; v: number };

// Sets unused parameter Obsolete
SetFlag(F: Extrema_ExtFlag): void;

// Sets unused parameter Obsolete
SetAlgo(A: Extrema_ExtAlgo): void;

// If isMultiThread == true then computation will be performed in parallel
SetMultiThread(theIsMultiThread: boolean): void;

// Returns true then computation will be performed in parallel Default value is false
IsMultiThread(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to compute minimum distance between two brep shapes (face edge vertex) and is used in DistShapeShape class
BRepExtrema_DistanceSS: declare class BRepExtrema_DistanceSS

constructor

IsDone(): boolean;

DistValue(): number;

Seq1Value(): NCollection_Sequence_BRepExtrema_SolutionElem;

Seq2Value(): NCollection_Sequence_BRepExtrema_SolutionElem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Filtering tool used to detect if two given mesh elements should be tested for overlapping/intersection or not
BRepExtrema_ElementFilter: declare class BRepExtrema_ElementFilter

constructor

// Checks if two mesh elements should be tested for overlapping/intersection (used for detection correct/incorrect cases of shared edges and vertices)
PreCheckElements(argNo0: number, argNo1: number): BRepExtrema_ElementFilter_FilterResult;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Result of filtering function
BRepExtrema_ElementFilter_FilterResult: typeof BRepExtrema_ElementFilter_FilterResult[keyof typeof BRepExtrema_ElementFilter_FilterResult]

BRepExtrema_ExtCC: declare class BRepExtrema_ExtCC

constructor

Initialize(E2: TopoDS_Edge): void;

// An exception is raised if the fields have not been initialized
Perform(E1: TopoDS_Edge): void;

// True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns True if E1 and E2 are parallel
IsParallel(): boolean;

// Returns the value of the <N>th extremum square distance
SquareDistance(N: number): number;

// Returns the parameter on the first edge of the <N>th extremum distance
ParameterOnE1(N: number): number;

// Returns the Point of the <N>th extremum distance on the edge E1
PointOnE1(N: number): gp_Pnt;

// Returns the parameter on the second edge of the <N>th extremum distance
ParameterOnE2(N: number): number;

// Returns the Point of the <N>th extremum distance on the edge E2
PointOnE2(N: number): gp_Pnt;

// if the edges is a trimmed curve, dist11 is a square distance between the point on E1 of parameter FirstParameter and the point of parameter FirstParameter on E2
TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt, P12: gp_Pnt, P21: gp_Pnt, P22: gp_Pnt): { dist11: number; distP12: number; distP21: number; distP22: number };
// P11: Mutated in place
// P12: Mutated in place
// P21: Mutated in place
// P22: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtCF: declare class BRepExtrema_ExtCF

constructor

Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

// An exception is raised if the fields have not been initialized
Perform(E: TopoDS_Edge, F: TopoDS_Face): void;

// True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the <N>th extremum square distance
SquareDistance(N: number): number;

// Returns True if the curve is on a parallel surface
IsParallel(): boolean;

// Returns the parameters on the Edge of the <N>th extremum distance
ParameterOnEdge(N: number): number;

// Returns the parameters on the Face of the <N>th extremum distance
ParameterOnFace(N: number, U?: number, V?: number): { U: number; V: number };

// Returns the Point of the <N>th extremum distance
PointOnEdge(N: number): gp_Pnt;

// Returns the Point of the <N>th extremum distance
PointOnFace(N: number): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtFF: declare class BRepExtrema_ExtFF

constructor

Initialize(F2: TopoDS_Face): void;

// An exception is raised if the fields have not been initialized
Perform(F1: TopoDS_Face, F2: TopoDS_Face): void;

// True if the distances are found
IsDone(): boolean;

// Returns True if the surfaces are parallel
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the <N>th extremum square distance
SquareDistance(N: number): number;

// Returns the parameters on the Face F1 of the <N>th extremum distance
ParameterOnFace1(N: number, U?: number, V?: number): { U: number; V: number };

// Returns the parameters on the Face F2 of the <N>th extremum distance
ParameterOnFace2(N: number, U?: number, V?: number): { U: number; V: number };

// Returns the Point of the <N>th extremum distance
PointOnFace1(N: number): gp_Pnt;

// Returns the Point of the <N>th extremum distance
PointOnFace2(N: number): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtPC: declare class BRepExtrema_ExtPC

constructor

Initialize(E: TopoDS_Edge): void;

// An exception is raised if the fields have not been initialized
Perform(V: TopoDS_Vertex): void;

// True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns True if the <N>th extremum distance is a minimum
IsMin(N: number): boolean;

// Returns the value of the <N>th extremum square distance
SquareDistance(N: number): number;

// Returns the parameter on the edge of the <N>th extremum distance
Parameter(N: number): number;

// Returns the Point of the <N>th extremum distance
Point(N: number): gp_Pnt;

// if the curve is a trimmed curve, dist1 is a square distance between
TrimmedSquareDistances(dist1: number, dist2: number, pnt1: gp_Pnt, pnt2: gp_Pnt): { dist1: number; dist2: number };
// pnt1: Mutated in place
// pnt2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtPF: declare class BRepExtrema_ExtPF

constructor

Initialize(TheFace: TopoDS_Face, TheFlag?: Extrema_ExtFlag, TheAlgo?: Extrema_ExtAlgo): void;

// An exception is raised if the fields have not been initialized
Perform(TheVertex: TopoDS_Vertex, TheFace: TopoDS_Face): void;

// True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the <N>th extremum square distance
SquareDistance(N: number): number;

// Returns the parameters on the Face of the <N>th extremum distance
Parameter(N: number, U?: number, V?: number): { U: number; V: number };

// Returns the Point of the <N>th extremum distance
Point(N: number): gp_Pnt;

SetFlag(F: Extrema_ExtFlag): void;

SetAlgo(A: Extrema_ExtAlgo): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enables storing of individual overlapped triangles (useful for debug)
BRepExtrema_OverlapTool: declare class BRepExtrema_OverlapTool

constructor

// Loads the given element sets into the overlap tool
LoadTriangleSets(theSet1: BRepExtrema_TriangleSet, theSet2: BRepExtrema_TriangleSet): void;

// Performs searching of overlapped mesh elements
Perform(theTolerance?: number): void;

// Is overlap test completed?
IsDone(): boolean;

// Marks test results as outdated
MarkDirty(): void;

// Returns set of overlapped sub-shapes of 1st shape (currently only faces are detected)
OverlapSubShapes1(): unknown;

// Returns set of overlapped sub-shapes of 2nd shape (currently only faces are detected)
OverlapSubShapes2(): unknown;

// Sets filtering tool for preliminary checking pairs of mesh elements
SetElementFilter(theFilter: BRepExtrema_ElementFilter): void;

Accept(theLeaf1: number, theLeaf2: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_Poly: declare class BRepExtrema_Poly

constructor

// returns true if OK
static Distance(S1: TopoDS_Shape, S2: TopoDS_Shape, P1: gp_Pnt, P2: gp_Pnt, dist?: number): { returnValue: boolean; dist: number };
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ProximityDistTool_PrjState: declare class BRepExtrema_ProximityDistTool_PrjState

constructor

GetTrgIdx(): number;

GetPrjState(): unknown;

GetNumberOfFirstNode(): number;

GetNumberOfLastNode(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Inspector for CellFilter algorithm working with {@link gp_XYZ`gp_XYZ`} points in 3d space
BRepExtrema_VertexInspector: declare class BRepExtrema_VertexInspector

constructor

static Coord(i: number, thePnt: gp_XYZ): number;

static Shift(thePnt: gp_XYZ, theTol: number): gp_XYZ;

// Keep the points used for comparison
Add(thePnt: gp_XYZ): void;

// Set tolerance for comparison of point coordinates
SetTol(theTol: number): void;

// Set current point to search for coincidence
SetCurrent(theCurPnt: gp_XYZ): void;

IsNeedAdd(): boolean;

// Implementation of inspection method
Inspect(theTarget: number): NCollection_CellFilter_Action;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool class for detection of self-sections in the given shape
BRepExtrema_SelfIntersection: declare class BRepExtrema_SelfIntersection extends BRepExtrema_ElementFilter

constructor

// Returns tolerance value used for self-intersection test
Tolerance(): number;

// Sets tolerance value used for self-intersection test
SetTolerance(theTolerance: number): void;

// Loads shape for detection of self-intersections
LoadShape(theShape: TopoDS_Shape): boolean;

// Performs detection of self-intersections
Perform(): void;

// True if the detection is completed
IsDone(): boolean;

// Returns set of IDs of overlapped sub-shapes (started from 0)
OverlapElements(): unknown;

// Returns sub-shape from the shape for the given index (started from 0)
GetSubShape(theID: number): TopoDS_Face;

// Returns set of all the face triangles of the shape
ElementSet(): BRepExtrema_TriangleSet;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool class for shape proximity detection
BRepExtrema_ShapeProximity: declare class BRepExtrema_ShapeProximity

constructor

// Returns tolerance value for overlap test (distance between shapes)
Tolerance(): number;

// Sets tolerance value for overlap test (distance between shapes)
SetTolerance(theTolerance: number): void;

// Returns proximity value calculated for the whole input shapes
Proximity(): number;

// Loads 1st shape into proximity tool
LoadShape1(theShape1: TopoDS_Shape): boolean;

// Loads 2nd shape into proximity tool
LoadShape2(theShape2: TopoDS_Shape): boolean;

// Set number of sample points on the 1st shape used to compute the proximity value
SetNbSamples1(theNbSamples: number): void;

// Set number of sample points on the 2nd shape used to compute the proximity value
SetNbSamples2(theNbSamples: number): void;

// Performs search of overlapped faces
Perform(): void;

// True if the search is completed
IsDone(): boolean;

// Returns set of IDs of overlapped faces of 1st shape (started from 0)
OverlapSubShapes1(): unknown;

// Returns set of IDs of overlapped faces of 2nd shape (started from 0)
OverlapSubShapes2(): unknown;

// Returns sub-shape from 1st shape with the given index (started from 0)
GetSubShape1(theID: number): TopoDS_Shape;

// Returns sub-shape from 1st shape with the given index (started from 0)
GetSubShape2(theID: number): TopoDS_Shape;

// Returns set of all the face triangles of the 1st shape
ElementSet1(): BRepExtrema_TriangleSet;

// Returns set of all the face triangles of the 2nd shape
ElementSet2(): BRepExtrema_TriangleSet;

// Returns the point on the 1st shape, which could be used as a reference point for the value of the proximity
ProximityPoint1(): gp_Pnt;

// Returns the point on the 2nd shape, which could be used as a reference point for the value of the proximity
ProximityPoint2(): gp_Pnt;

// Returns the status of point on the 1st shape, which could be used as a reference point for the value of the proximity
ProxPntStatus1(): unknown;

// Returns the status of point on the 2nd shape, which could be used as a reference point for the value of the proximity
ProxPntStatus2(): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to store information relative to the minimum distance between two shapes
BRepExtrema_SolutionElem: declare class BRepExtrema_SolutionElem

constructor

// Returns the value of the minimum distance
Dist(): number;

// Returns the solution point
Point(): gp_Pnt;

// Returns the Support type
SupportKind(): BRepExtrema_SupportType;

// Returns the vertex if the solution is a Vertex
Vertex(): TopoDS_Vertex;

// Returns the vertex if the solution is an Edge
Edge(): TopoDS_Edge;

// Returns the vertex if the solution is an Face
Face(): TopoDS_Face;

// Returns the parameter value if the solution is on Edge
EdgeParameter(theParam?: number): { theParam: number };

// Returns the parameters U and V if the solution is in a Face
FaceParameter(theU?: number, theV?: number): { theU: number; theV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_SupportType: typeof BRepExtrema_SupportType[keyof typeof BRepExtrema_SupportType]

// List of shapes and their IDs for collision detection
BRepExtrema_TriangleSet: declare class BRepExtrema_TriangleSet

constructor

Size(): number;

Box(theIndex: number): any;

Center(theIndex: number, theAxis: number): number;

Swap(theIndex1: number, theIndex2: number): void;

Clear(): void;

Init(theShapes: NCollection_DynamicArray_TopoDS_Shape): boolean;

GetVertices(): [number, number, number][];

GetVtxIndices(theIndex: number, theVtxIndices: NCollection_Array1_int): void;

GetFaceID(theIndex: number): number;

GetShapeIDOfVtx(theIndex: number): number;

GetVtxIdxInShape(theIndex: number): number;

GetTrgIdxInShape(theIndex: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_UnCompatibleShape: declare class BRepExtrema_UnCompatibleShape extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepExtrema_SeqOfSolution: NCollection_Sequence_BRepExtrema_SolutionElem
