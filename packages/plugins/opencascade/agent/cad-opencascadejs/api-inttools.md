# libcascade — IntTools

15 top-level symbols. Signatures are verbatim typescript.

// Contains classes for intersection and classification purposes and accompanying classes
IntTools: declare class IntTools

constructor

// returns the length of the edge
static Length(E: TopoDS_Edge): number;

// Remove from the sequence aSeq the Roots that have values ti and tj such as |ti-tj] < anEpsT
static RemoveIdenticalRoots(aSeq: NCollection_Sequence_IntTools_Root, anEpsT: number): void;
// aSeq: Mutated in place

// Sort the sequence aSeq of the Roots to arrange the Roots in increasing order
static SortRoots(aSeq: NCollection_Sequence_IntTools_Root, anEpsT: number): void;
// aSeq: Mutated in place

// Find the states (before and after) for each Root from the sequence aSeq
static FindRootStates(aSeq: NCollection_Sequence_IntTools_Root, anEpsNull: number): void;
// aSeq: Mutated in place

static Parameter(P: gp_Pnt, Curve: Geom_Curve, aParm?: number): { returnValue: number; aParm: number };

static GetRadius(C: BRepAdaptor_Curve, t1: number, t3: number, R?: number): { returnValue: number; R: number };

static PrepareArgs(C: BRepAdaptor_Curve, tMax: number, tMin: number, Discret: number, Deflect: number, anArgs: NCollection_Array1_double): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// base class for range index management
IntTools_BaseRangeSample: declare class IntTools_BaseRangeSample

constructor

SetDepth(theDepth: number): void;

GetDepth(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class BeanFaceIntersector computes ranges of parameters on the curve of a bean(part of edge) that bound the parts of bean which are on the surface of a face according to edge and face tolerances
IntTools_BeanFaceIntersector: declare class IntTools_BeanFaceIntersector

constructor

// Initializes the algorithm
Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;

// Sets the intersection context
SetContext(theContext: IntTools_Context): void;

// Gets the intersection context
Context(): IntTools_Context;

// Set restrictions for curve
SetBeanParameters(theFirstParOnCurve: number, theLastParOnCurve: number): void;

// Set restrictions for surface
SetSurfaceParameters(theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number): void;

// Launches the algorithm
Perform(): void;

// Returns Done/NotDone state of the algorithm
IsDone(): boolean;

Result(): NCollection_Sequence_IntTools_Range;
Result(theResults: NCollection_Sequence_IntTools_Range): void;
Result(): NCollection_Sequence_IntTools_Range;
Result(theResults: NCollection_Sequence_IntTools_Range): void;

// Returns the minimal distance found between edge and face
MinimalSquareDistance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class is to describe a common part between two edges in 3D space
IntTools_CommonPrt: declare class IntTools_CommonPrt

constructor

Assign(Other: IntTools_CommonPrt): IntTools_CommonPrt;

// Sets the first edge
SetEdge1(anE: TopoDS_Edge): void;

// Sets the second edge
SetEdge2(anE: TopoDS_Edge): void;

// Sets the type of the common part Vertex or Edge
SetType(aType: TopAbs_ShapeEnum): void;

// Sets the range of first edge
SetRange1(aR: IntTools_Range): void;
SetRange1(tf: number, tl: number): void;
SetRange1(aR: IntTools_Range): void;
SetRange1(tf: number, tl: number): void;

// Appends the range of second edge
AppendRange2(aR: IntTools_Range): void;
AppendRange2(tf: number, tl: number): void;
AppendRange2(aR: IntTools_Range): void;
AppendRange2(tf: number, tl: number): void;

// Sets a parameter of first vertex
SetVertexParameter1(tV: number): void;

// Sets a parameter of second vertex
SetVertexParameter2(tV: number): void;

// Returns the first edge
Edge1(): TopoDS_Edge;

// Returns the second edge
Edge2(): TopoDS_Edge;

// Returns the type of the common part
Type(): TopAbs_ShapeEnum;

// Returns the range of first edge
Range1(): IntTools_Range;
Range1(tf?: number, tl?: number): { tf: number; tl: number };
Range1(): IntTools_Range;
Range1(tf?: number, tl?: number): { tf: number; tl: number };

// Returns the ranges of second edge
Ranges2(): NCollection_Sequence_IntTools_Range;

// Returns the ranges of second edge
ChangeRanges2(): NCollection_Sequence_IntTools_Range;

// Returns parameter of first vertex
VertexParameter1(): number;

// Returns parameter of second vertex
VertexParameter2(): number;

// Copies me to anOther
Copy(anOther: IntTools_CommonPrt): void;
// anOther: Mutated in place

// Modifier
AllNullFlag(): boolean;

// Selector
SetAllNullFlag(aFlag: boolean): void;

// Modifier
SetBoundingPoints(aP1: gp_Pnt, aP2: gp_Pnt): void;

// Selector
BoundingPoints(aP1: gp_Pnt, aP2: gp_Pnt): void;
// aP1: Mutated in place
// aP2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The intersection Context contains geometrical and topological toolkit (classifiers, projectors, etc)
IntTools_Context: declare class IntTools_Context extends Standard_Transient

constructor

// Returns a reference to point projector for given edge
ProjPC(aE: TopoDS_Edge): GeomAPI_ProjectPointOnCurve;

// Returns a reference to point projector for given curve
ProjPT(aC: Geom_Curve): GeomAPI_ProjectPointOnCurve;

// Returns a reference to surface localization data for given face
SurfaceData(aF: TopoDS_Face): IntTools_SurfaceRangeLocalizeData;

// Returns a reference to 2D hatcher for given face
Hatcher(aF: TopoDS_Face): Geom2dHatch_Hatcher;

// Returns a reference to surface adaptor for given face
SurfaceAdaptor(theFace: TopoDS_Face): BRepAdaptor_Surface;

// Builds and stores an Oriented Bounding Box for the shape
OBB(theShape: TopoDS_Shape, theFuzzyValue?: number): Bnd_OBB;

// Computes the boundaries of the face using surface adaptor
UVBounds(theFace: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };

// Computes parameter of the Point theP on the edge aE
ComputePE(theP: gp_Pnt, theTolP: number, theE: TopoDS_Edge, theT?: number, theDist?: number): { returnValue: number; theT: number; theDist: number };

// Computes parameter of the vertex aV on the edge aE and correct tolerance value for the vertex on the edge
ComputeVE(theV: TopoDS_Vertex, theE: TopoDS_Edge, theT: number, theTol: number, theFuzz: number): { returnValue: number; theT: number; theTol: number };

// Computes UV parameters of the vertex aV on face aF and correct tolerance value for the vertex on the face
ComputeVF(theVertex: TopoDS_Vertex, theFace: TopoDS_Face, theU: number, theV: number, theTol: number, theFuzz: number): { returnValue: number; theU: number; theV: number; theTol: number };

// Returns the state of the point aP2D relative to face aF
StatePointFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): TopAbs_State;

// Returns true if the point aP2D is inside the boundaries of the face aF, otherwise returns false
IsPointInFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;
IsPointInFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;
IsPointInFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;
IsPointInFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;

// Returns true if the point aP2D is inside or on the boundaries of aF
IsPointInOnFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;

// Returns true if the distance between point aP3D and face aF is less or equal to tolerance aTol and projection point is inside or on the boundaries of the face aF
IsValidPointForFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;

// Returns true if IsValidPointForFace returns true for both face aF1 and aF2
IsValidPointForFaces(aP3D: gp_Pnt, aF1: TopoDS_Face, aF2: TopoDS_Face, aTol: number): boolean;

// Returns true if IsValidPointForFace returns true for some 3d point that lay on the curve aIC bounded by parameters aT1 and aT2
IsValidBlockForFace(aT1: number, aT2: number, aIC: IntTools_Curve, aF: TopoDS_Face, aTol: number): boolean;

// Returns true if IsValidBlockForFace returns true for both faces aF1 and aF2
IsValidBlockForFaces(aT1: number, aT2: number, aIC: IntTools_Curve, aF1: TopoDS_Face, aF2: TopoDS_Face, aTol: number): boolean;

// Computes parameter of the vertex aV on the curve aIC
IsVertexOnLine(aV: TopoDS_Vertex, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
IsVertexOnLine(aV: TopoDS_Vertex, aTolV: number, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
IsVertexOnLine(aV: TopoDS_Vertex, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
IsVertexOnLine(aV: TopoDS_Vertex, aTolV: number, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };

// Computes parameter of the point aP on the edge aE
ProjectPointOnEdge(aP: gp_Pnt, aE: TopoDS_Edge, aT?: number): { returnValue: boolean; aT: number };

BndBox(theS: TopoDS_Shape): Bnd_Box;

// Returns true if the solid <theFace> has infinite bounds
IsInfiniteFace(theFace: TopoDS_Face): boolean;

// Sets tolerance to be used for projection of point on surface
SetPOnSProjectionTolerance(theValue: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class is a container of one 3D curve, two 2D curves and two Tolerance values
IntTools_Curve: declare class IntTools_Curve

constructor

// Sets the curves
SetCurves(the3dCurve: Geom_Curve, the2dCurve1: Geom2d_Curve, the2dCurve2: Geom2d_Curve): void;

// Sets the 3d curve
SetCurve(the3dCurve: Geom_Curve): void;

// Sets the first 2d curve
SetFirstCurve2d(the2dCurve1: Geom2d_Curve): void;

// Sets the second 2d curve
SetSecondCurve2d(the2dCurve2: Geom2d_Curve): void;

// Sets the tolerance for the curve
SetTolerance(theTolerance: number): void;

// Sets the tangential tolerance
SetTangentialTolerance(theTangentialTolerance: number): void;

// Returns 3d curve
Curve(): Geom_Curve;

// Returns first 2d curve
FirstCurve2d(): Geom2d_Curve;

// Returns second 2d curve
SecondCurve2d(): Geom2d_Curve;

// Returns the tolerance
Tolerance(): number;

// Returns the tangential tolerance
TangentialTolerance(): number;

// Returns TRUE if 3d curve is BoundedCurve
HasBounds(): boolean;

// If the 3d curve is bounded curve the method will return TRUE and modify the output parameters with boundary parameters of the curve and corresponded 3d points
Bounds(theFirst: number, theLast: number, theFirstPnt: gp_Pnt, theLastPnt: gp_Pnt): { returnValue: boolean; theFirst: number; theLast: number };
// theFirstPnt: Mutated in place
// theLastPnt: Mutated in place

// Computes 3d point corresponded to the given parameter if this parameter is inside the boundaries of the curve
D0(thePar: number, thePnt: gp_Pnt): boolean;
// thePnt: Mutated in place

// Returns the type of the 3d curve
Type(): GeomAbs_CurveType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntTools_CurveRangeLocalizeData: declare class IntTools_CurveRangeLocalizeData

constructor

GetNbSample(): number;

GetMinRange(): number;

AddOutRange(theRange: IntTools_CurveRangeSample): void;

AddBox(theRange: IntTools_CurveRangeSample, theBox: Bnd_Box): void;

FindBox(theRange: IntTools_CurveRangeSample, theBox: Bnd_Box): boolean;

IsRangeOut(theRange: IntTools_CurveRangeSample): boolean;

ListRangeOut(theList: NCollection_List_IntTools_CurveRangeSample): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// class for range index management of curve
IntTools_CurveRangeSample: declare class IntTools_CurveRangeSample extends IntTools_BaseRangeSample

constructor

SetRangeIndex(theIndex: number): void;

GetRangeIndex(): number;

IsEqual(Other: IntTools_CurveRangeSample): boolean;

GetRange(theFirst: number, theLast: number, theNbSample: number): IntTools_Range;

GetRangeIndexDeeper(theNbSample: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides Edge/Edge intersection algorithm based on the intersection between edges bounding boxes
IntTools_EdgeEdge: declare class IntTools_EdgeEdge

constructor

// Sets the first edge
SetEdge1(theEdge: TopoDS_Edge): void;
SetEdge1(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;
SetEdge1(theEdge: TopoDS_Edge): void;
SetEdge1(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;

// Sets the range for the first edge
SetRange1(theRange1: IntTools_Range): void;
SetRange1(aT1: number, aT2: number): void;
SetRange1(theRange1: IntTools_Range): void;
SetRange1(aT1: number, aT2: number): void;

// Sets the second edge
SetEdge2(theEdge: TopoDS_Edge): void;
SetEdge2(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;
SetEdge2(theEdge: TopoDS_Edge): void;
SetEdge2(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;

// Sets the range for the second edge
SetRange2(theRange: IntTools_Range): void;
SetRange2(aT1: number, aT2: number): void;
SetRange2(theRange: IntTools_Range): void;
SetRange2(aT1: number, aT2: number): void;

// Sets the Fuzzy value
SetFuzzyValue(theFuzz: number): void;

// Performs the intersection between edges
Perform(): void;

// Returns TRUE if common part(s) is(are) found
IsDone(): boolean;

// Returns Fuzzy value
FuzzyValue(): number;

// Returns common parts
CommonParts(): NCollection_Sequence_IntTools_CommonPrt;

// Sets the flag myQuickCoincidenceCheck
UseQuickCoincidenceCheck(bFlag: boolean): void;

// Returns the flag myQuickCoincidenceCheck
IsCoincidenceCheckedQuickly(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides Edge/Face intersection algorithm to determine common parts between edge and face in 3-d space
IntTools_EdgeFace: declare class IntTools_EdgeFace

constructor

SetEdge(theEdge: TopoDS_Edge): void;

Edge(): TopoDS_Edge;

SetFace(theFace: TopoDS_Face): void;

Face(): TopoDS_Face;

SetRange(theRange: IntTools_Range): void;
SetRange(theFirst: number, theLast: number): void;
SetRange(theRange: IntTools_Range): void;
SetRange(theFirst: number, theLast: number): void;

Range(): IntTools_Range;

SetContext(theContext: IntTools_Context): void;

Context(): IntTools_Context;

SetFuzzyValue(theFuzz: number): void;

FuzzyValue(): number;

UseQuickCoincidenceCheck(theFlag: boolean): void;

IsCoincidenceCheckedQuickly(): boolean;

Perform(): void;

IsDone(): boolean;

ErrorStatus(): number;

CommonParts(): NCollection_Sequence_IntTools_CommonPrt;

MinimalDistance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class provides an algorithm to classify a 2d Point in 2d space of face using boundaries of the face
IntTools_FClass2d: declare class IntTools_FClass2d

constructor

// Initializes algorithm by the face F and tolerance Tol
Init(F: TopoDS_Face, Tol: number): void;

// Returns state of infinite 2d point relatively to (0, 0)
PerformInfinitePoint(): TopAbs_State;

// Returns state of the 2d point Puv
Perform(Puv: gp_Pnt2d, RecadreOnPeriodic?: boolean): TopAbs_State;

// Test a point with +- an offset (Tol) and returns On if some points are OUT an some are IN (Caution
TestOnRestriction(Puv: gp_Pnt2d, Tol: number, RecadreOnPeriodic?: boolean): TopAbs_State;

IsHole(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides the intersection of face's underlying surfaces
IntTools_FaceFace: declare class IntTools_FaceFace

constructor

// Modifier
SetParameters(ApproxCurves: boolean, ComputeCurveOnS1: boolean, ComputeCurveOnS2: boolean, ApproximationTolerance: number): void;

// Intersects underliing surfaces of F1 and F2 Use sum of tolerance of F1 and F2 as intersection criteria
Perform(F1: TopoDS_Face, F2: TopoDS_Face, theToRunParallel?: boolean): void;

// Returns True if the intersection was successful
IsDone(): boolean;

// Returns sequence of 3d curves as result of intersection
Lines(): NCollection_Sequence_IntTools_Curve;

// Returns sequence of 3d curves as result of intersection
Points(): NCollection_Sequence_IntTools_PntOn2Faces;

// Returns first of processed faces
Face1(): TopoDS_Face;

// Returns second of processed faces
Face2(): TopoDS_Face;

// Returns True if faces are tangent
TangentFaces(): boolean;

// Provides post-processing the result lines
PrepareLines3D(bToSplit?: boolean): void;
// bToSplit: split the closed 3D-curves on parts when TRUE, remain untouched otherwise

SetList(ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;

// Sets the intersection context
SetContext(aContext: IntTools_Context): void;

// Sets the Fuzzy value
SetFuzzyValue(theFuzz: number): void;

// Returns Fuzzy value
FuzzyValue(): number;

// Gets the intersection context
Context(): IntTools_Context;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// class MarkedRangeSet provides continuous set of ranges marked with flags
IntTools_MarkedRangeSet: declare class IntTools_MarkedRangeSet

constructor

// build set of ranges which consists of one range with boundary values theFirstBoundary and theLastBoundary
SetBoundaries(theFirstBoundary: number, theLastBoundary: number, theInitFlag: number): void;

// Build set of ranges based on the array of progressive sorted values
SetRanges(theSortedArray: NCollection_Array1_double, theInitFlag: number): void;

// Inserts a new range marked with flag theFlag It replace the existing ranges or parts of ranges and their flags
InsertRange(theRange: IntTools_Range, theFlag: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number, theIndex: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number, theIndex: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number, theIndex: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number, theIndex: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number, theIndex: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number, theIndex: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number): boolean;
InsertRange(theRange: IntTools_Range, theFlag: number, theIndex: number): boolean;
InsertRange(theFirstBoundary: number, theLastBoundary: number, theFlag: number, theIndex: number): boolean;

// Set flag theFlag for range with index theIndex
SetFlag(theIndex: number, theFlag: number): void;

// Returns flag of the range with index theIndex
Flag(theIndex: number): number;

// Returns index of range which contains theValue
GetIndex(theValue: number): number;
GetIndex(theValue: number, UseLower: boolean): number;
GetIndex(theValue: number): number;
GetIndex(theValue: number, UseLower: boolean): number;

GetIndices(theValue: number): NCollection_Sequence_int;

// Returns number of ranges
Length(): number;

// Returns the range with index theIndex
Range(theIndex: number): IntTools_Range;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains two points PntOnFace from {@link IntTools`IntTools`} and a flag
IntTools_PntOn2Faces: declare class IntTools_PntOn2Faces

constructor

// Modifier
SetValid(bF: boolean): void;

// Selector
IsValid(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class describes the 1-d range [myFirst, myLast]
IntTools_Range: declare class IntTools_Range

constructor

// Modifier
SetFirst(aFirst: number): void;

// Modifier
SetLast(aLast: number): void;

// Selector
First(): number;

// Selector
Last(): number;

// Selector
Range(aFirst?: number, aLast?: number): { aFirst: number; aLast: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
