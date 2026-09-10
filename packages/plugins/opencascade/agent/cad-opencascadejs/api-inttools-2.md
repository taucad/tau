# libcascade — IntTools (2)

14 top-level symbols. Signatures are verbatim typescript.

// The class is to describe the root of function of one variable for Edge/Edge and Edge/Surface algorithms
IntTools_Root: declare class IntTools_Root

constructor

// Sets the Root's value
SetRoot(aRoot: number): void;

// Sets the Root's Type
SetType(aType: number): void;

// Set the value of the state before the root (at t=Root-dt)
SetStateBefore(aState: TopAbs_State): void;

// Set the value of the state after the root (at t=Root-dt)
SetStateAfter(aState: TopAbs_State): void;

// Not used in Edge/Edge algorithm
SetLayerHeight(aHeight: number): void;

// Sets the interval from which the Root was found [t1,t2] and the corresponding values of the function on the bounds f(t1), f(t2)
SetInterval(t1: number, t2: number, f1: number, f2: number): void;

// Returns the Root value
Root(): number;

// Returns the type of the root =0 - Simple (was found by bisection method)
Type(): number;

// Returns the state before the root
StateBefore(): TopAbs_State;

// Returns the state after the root
StateAfter(): TopAbs_State;

// Not used in Edge/Edge algorithm
LayerHeight(): number;

// Returns the validity flag for the root, True if myStateBefore==TopAbs_OUT && myStateAfter==TopAbs_IN or myStateBefore==TopAbs_OUT && myStateAfter==TopAbs_ON or myStateBefore==TopAbs_ON && myStateAfter==TopAbs_OUT or myStateBefore==TopAbs_IN && myStateAfter==TopAbs_OUT For other cases it returns False
IsValid(): boolean;

// Returns the values of interval from which the Root was found [t1,t2] and the corresponding values of the function on the bounds f(t1), f(t2)
Interval(t1?: number, t2?: number, f1?: number, f2?: number): { t1: number; t2: number; f1: number; f2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides the computation of a working (shrunk) range [t1, t2] for the 3D-curve of the edge
IntTools_ShrunkRange: declare class IntTools_ShrunkRange

constructor

SetData(aE: TopoDS_Edge, aT1: number, aT2: number, aV1: TopoDS_Vertex, aV2: TopoDS_Vertex): void;

SetContext(aCtx: IntTools_Context): void;

Context(): IntTools_Context;

SetShrunkRange(aT1: number, aT2: number): void;

ShrunkRange(aT1?: number, aT2?: number): { aT1: number; aT2: number };

BndBox(): Bnd_Box;

Edge(): TopoDS_Edge;

Perform(): void;

// Returns TRUE in case the shrunk range is computed
IsDone(): boolean;

// Returns FALSE in case the shrunk range is too short and the edge cannot be split, otherwise returns TRUE
IsSplittable(): boolean;

// Returns the length of the edge if computed
Length(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntTools_SurfaceRangeLocalizeData: declare class IntTools_SurfaceRangeLocalizeData

constructor

Assign(Other: IntTools_SurfaceRangeLocalizeData): IntTools_SurfaceRangeLocalizeData;

GetNbSampleU(): number;

GetNbSampleV(): number;

GetMinRangeU(): number;

GetMinRangeV(): number;

AddOutRange(theRange: IntTools_SurfaceRangeSample): void;

AddBox(theRange: IntTools_SurfaceRangeSample, theBox: Bnd_Box): void;

FindBox(theRange: IntTools_SurfaceRangeSample, theBox: Bnd_Box): boolean;

IsRangeOut(theRange: IntTools_SurfaceRangeSample): boolean;

ListRangeOut(theList: NCollection_List_IntTools_SurfaceRangeSample): void;

RemoveRangeOutAll(): void;

// Set the grid deflection
SetGridDeflection(theDeflection: number): void;

// Query the grid deflection
GetGridDeflection(): number;

// Set the range U of the grid of points
SetRangeUGrid(theNbUGrid: number): void;

// Query the range U of the grid of points
GetRangeUGrid(): number;

// Set the U parameter of the grid points at that index
SetUParam(theIndex: number, theUParam: number): void;

// Query the U parameter of the grid points at that index
GetUParam(theIndex: number): number;

// Set the range V of the grid of points
SetRangeVGrid(theNbVGrid: number): void;

// Query the range V of the grid of points
GetRangeVGrid(): number;

// Set the V parameter of the grid points at that index
SetVParam(theIndex: number, theVParam: number): void;

// Query the V parameter of the grid points at that index
GetVParam(theIndex: number): number;

// Set the grid point
SetGridPoint(theUIndex: number, theVIndex: number, thePoint: gp_Pnt): void;

// Set the grid point
GetGridPoint(theUIndex: number, theVIndex: number): gp_Pnt;

// Sets the frame area
SetFrame(theUMin: number, theUMax: number, theVMin: number, theVMax: number): void;

// Returns the number of grid points on U direction in frame
GetNBUPointsInFrame(): number;

// Returns the number of grid points on V direction in frame
GetNBVPointsInFrame(): number;

// Returns the grid point in frame
GetPointInFrame(theUIndex: number, theVIndex: number): gp_Pnt;

// Query the U parameter of the grid points at that index in frame
GetUParamInFrame(theIndex: number): number;

// Query the V parameter of the grid points at that index in frame
GetVParamInFrame(theIndex: number): number;

// Clears the grid of points
ClearGrid(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// class for range index management of surface
IntTools_SurfaceRangeSample: declare class IntTools_SurfaceRangeSample

constructor

Assign(Other: IntTools_SurfaceRangeSample): IntTools_SurfaceRangeSample;

SetRanges(theRangeU: IntTools_CurveRangeSample, theRangeV: IntTools_CurveRangeSample): void;

GetRanges(theRangeU: IntTools_CurveRangeSample, theRangeV: IntTools_CurveRangeSample): void;

SetIndexes(theIndexU: number, theIndexV: number): void;

GetIndexes(theIndexU?: number, theIndexV?: number): { theIndexU: number; theIndexV: number };

GetDepths(theDepthU?: number, theDepthV?: number): { theDepthU: number; theDepthV: number };

SetSampleRangeU(theRangeSampleU: IntTools_CurveRangeSample): void;

GetSampleRangeU(): IntTools_CurveRangeSample;

SetSampleRangeV(theRangeSampleV: IntTools_CurveRangeSample): void;

GetSampleRangeV(): IntTools_CurveRangeSample;

SetIndexU(theIndexU: number): void;

GetIndexU(): number;

SetIndexV(theIndexV: number): void;

GetIndexV(): number;

SetDepthU(theDepthU: number): void;

GetDepthU(): number;

SetDepthV(theDepthV: number): void;

GetDepthV(): number;

GetRangeU(theFirstU: number, theLastU: number, theNbSampleU: number): IntTools_Range;

GetRangeV(theFirstV: number, theLastV: number, theNbSampleV: number): IntTools_Range;

IsEqual(Other: IntTools_SurfaceRangeSample): boolean;

GetRangeIndexUDeeper(theNbSampleU: number): number;

GetRangeIndexVDeeper(theNbSampleV: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class contains handy static functions dealing with the geometry and topology
IntTools_Tools: declare class IntTools_Tools

constructor

// Computes distance between vertex V1 and vertex V2, if the distance is less than sum of vertex tolerances returns zero, otherwise returns negative value
static ComputeVV(V1: TopoDS_Vertex, V2: TopoDS_Vertex): number;

// Returns True if wire aW contains edges with INTERNAL orientation
static HasInternalEdge(aW: TopoDS_Wire): boolean;

// Build a face based on surface of given face aF and bounded by wire aW
static MakeFaceFromWireAndFace(aW: TopoDS_Wire, aF: TopoDS_Face, aFNew: TopoDS_Face): void;
// aFNew: Mutated in place

static ClassifyPointByFace(aF: TopoDS_Face, P: gp_Pnt2d): TopAbs_State;

// Returns True if IsVertx for middle parameter of fist range and first edge returns True and if IsVertex for middle parameter of second range and second range returns True, otherwise returns False
static IsVertex(aCmnPrt: IntTools_CommonPrt): boolean;
static IsVertex(E: TopoDS_Edge, t: number): boolean;
static IsVertex(E: TopoDS_Edge, V: TopoDS_Vertex, t: number): boolean;
static IsVertex(aP: gp_Pnt, aTolPV: number, aV: TopoDS_Vertex): boolean;
static IsVertex(aCmnPrt: IntTools_CommonPrt): boolean;
static IsVertex(E: TopoDS_Edge, t: number): boolean;
static IsVertex(E: TopoDS_Edge, V: TopoDS_Vertex, t: number): boolean;
static IsVertex(aP: gp_Pnt, aTolPV: number, aV: TopoDS_Vertex): boolean;
static IsVertex(aCmnPrt: IntTools_CommonPrt): boolean;
static IsVertex(E: TopoDS_Edge, t: number): boolean;
static IsVertex(E: TopoDS_Edge, V: TopoDS_Vertex, t: number): boolean;
static IsVertex(aP: gp_Pnt, aTolPV: number, aV: TopoDS_Vertex): boolean;
static IsVertex(aCmnPrt: IntTools_CommonPrt): boolean;
static IsVertex(E: TopoDS_Edge, t: number): boolean;
static IsVertex(E: TopoDS_Edge, V: TopoDS_Vertex, t: number): boolean;
static IsVertex(aP: gp_Pnt, aTolPV: number, aV: TopoDS_Vertex): boolean;

// Gets boundary of parameters of E1 and E2
static IsMiddlePointsEqual(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

// Returns some value between aFirst and aLast
static IntermediatePoint(aFirst: number, aLast: number): number;

// Split aC by average parameter if aC is closed in 3D
static SplitCurve(aC: IntTools_Curve, aS: NCollection_Sequence_IntTools_Curve): number;
// aS: Mutated in place

// Puts curves from aSIn to aSOut except those curves that are coincide with first curve from aSIn
static RejectLines(aSIn: NCollection_Sequence_IntTools_Curve, aSOut: NCollection_Sequence_IntTools_Curve): void;
// aSOut: Mutated in place

// Returns True if D1 and D2 coincide
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir): boolean;
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir, aTol: number): boolean;
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir): boolean;
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir, aTol: number): boolean;

// Returns True if aC is BoundedCurve from Geom and the distance between first point of the curve aC and last point is less than 1.e-12
static IsClosed(aC: Geom_Curve): boolean;

// Returns adaptive tolerance for given aTolBase if aC is trimmed curve and basis curve is parabola, otherwise returns value of aTolBase
static CurveTolerance(aC: Geom_Curve, aTolBase: number): number;

// Checks if the curve is not covered by the default tolerance (confusion)
static CheckCurve(theCurve: IntTools_Curve, theBox: Bnd_Box): boolean;
// theBox: Mutated in place

static IsOnPave(theT: number, theRange: IntTools_Range, theTol: number): boolean;

static VertexParameters(theCP: IntTools_CommonPrt, theT1?: number, theT2?: number): { theT1: number; theT2: number };

static VertexParameter(theCP: IntTools_CommonPrt, theT?: number): { theT: number };

static IsOnPave1(theT: number, theRange: IntTools_Range, theTol: number): boolean;

// Checks if the range <theR> interfere with the range <theRRef>
static IsInRange(theRRef: IntTools_Range, theR: IntTools_Range, theTol: number): boolean;

static SegPln(theLin: gp_Lin, theTLin1: number, theTLin2: number, theTolLin: number, thePln: gp_Pln, theTolPln: number, theP: gp_Pnt, theT?: number, theTolP?: number, theTmin?: number, theTmax?: number): { returnValue: number; theT: number; theTolP: number; theTmin: number; theTmax: number };

// Computes the max distance between points taken from 3D and 2D curves by the same parameter
static ComputeTolerance(theCurve3D: Geom_Curve, theCurve2D: Geom2d_Curve, theSurf: Geom_Surface, theFirst: number, theLast: number, theMaxDist: number, theMaxPar: number, theTolRange: number, theToRunParallel: boolean): { returnValue: boolean; theMaxDist: number; theMaxPar: number };

// Computes the correct Intersection range for Line/Line, Line/Plane and Plane/Plane intersections
static ComputeIntRange(theTol1: number, theTol2: number, theAngle: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class redefine methods of TopolTool from Adaptor3d concerning sample points
IntTools_TopolTool: declare class IntTools_TopolTool extends Adaptor3d_TopolTool

constructor

// Redefined empty initializer
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;

ComputeSamplePoints(): void;

// Computes the sample-points for the intersections algorithms
NbSamplesU(): number;

// Computes the sample-points for the intersections algorithms
NbSamplesV(): number;

// Computes the sample-points for the intersections algorithms
NbSamples(): number;

// Returns a 2d point from surface myS and a corresponded 3d point for given index
SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;
// P2d: Mutated in place
// P3d: Mutated in place

// compute the sample-points for the intersections algorithms by adaptive algorithm for BSpline surfaces
SamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link IntTools_WLineTool`IntTools_WLineTool`} provides set of static methods related to walking lines
IntTools_WLineTool: declare class IntTools_WLineTool

constructor

static NotUseSurfacesForApprox(aF1: TopoDS_Face, aF2: TopoDS_Face, WL: IntPatch_WLine, ifprm: number, ilprm: number): boolean;

static DecompositionOfWLine(theWLine: IntPatch_WLine, theSurface1: GeomAdaptor_Surface, theSurface2: GeomAdaptor_Surface, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theLConstructor: GeomInt_LineConstructor, theAvoidLConstructor: boolean, theTol: number, theNewLines: NCollection_Sequence_handle_IntPatch_Line, argNo9: IntTools_Context): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntTools_ListOfCurveRangeSample: NCollection_List_IntTools_CurveRangeSample

IntTools_ListOfSurfaceRangeSample: NCollection_List_IntTools_SurfaceRangeSample

IntTools_SequenceOfCommonPrts: NCollection_Sequence_IntTools_CommonPrt

IntTools_SequenceOfCurves: NCollection_Sequence_IntTools_Curve

IntTools_SequenceOfPntOn2Faces: NCollection_Sequence_IntTools_PntOn2Faces

IntTools_SequenceOfRanges: NCollection_Sequence_IntTools_Range

IntTools_SequenceOfRoots: NCollection_Sequence_IntTools_Root
