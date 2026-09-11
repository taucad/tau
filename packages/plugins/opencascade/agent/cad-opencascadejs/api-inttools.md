# libcascade — IntTools

20 top-level symbols. Signatures are verbatim typescript.

IntTools: declare class IntTools

constructor

static Length(E: TopoDS_Edge): number;

static RemoveIdenticalRoots(aSeq: NCollection_Sequence_IntTools_Root, anEpsT: number): void;

static SortRoots(aSeq: NCollection_Sequence_IntTools_Root, anEpsT: number): void;

static FindRootStates(aSeq: NCollection_Sequence_IntTools_Root, anEpsNull: number): void;

static Parameter(P: gp_Pnt, Curve: Geom_Curve, aParm?: number): { returnValue: number; aParm: number };

static GetRadius(C: BRepAdaptor_Curve, t1: number, t3: number, R?: number): { returnValue: number; R: number };

static PrepareArgs(C: BRepAdaptor_Curve, tMax: number, tMin: number, Discret: number, Deflect: number, anArgs: NCollection_Array1_double): number;

delete(): void;

[Symbol.dispose](): void;

IntTools_BaseRangeSample: declare class IntTools_BaseRangeSample

constructor

SetDepth(theDepth: number): void;

GetDepth(): number;

delete(): void;

[Symbol.dispose](): void;

IntTools_BeanFaceIntersector: declare class IntTools_BeanFaceIntersector

constructor

Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theBeanTolerance: number, theFaceTolerance: number): void;
Init(theCurve: BRepAdaptor_Curve, theSurface: BRepAdaptor_Surface, theFirstParOnCurve: number, theLastParOnCurve: number, theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number, theBeanTolerance: number, theFaceTolerance: number): void;

SetContext(theContext: IntTools_Context): void;

Context(): IntTools_Context;

SetBeanParameters(theFirstParOnCurve: number, theLastParOnCurve: number): void;

SetSurfaceParameters(theUMinParameter: number, theUMaxParameter: number, theVMinParameter: number, theVMaxParameter: number): void;

Perform(): void;

IsDone(): boolean;

Result(): NCollection_Sequence_IntTools_Range;
Result(theResults: NCollection_Sequence_IntTools_Range): void;
Result(): NCollection_Sequence_IntTools_Range;
Result(theResults: NCollection_Sequence_IntTools_Range): void;

MinimalSquareDistance(): number;

delete(): void;

[Symbol.dispose](): void;

IntTools_CommonPrt: declare class IntTools_CommonPrt

constructor

Assign(Other: IntTools_CommonPrt): IntTools_CommonPrt;

SetEdge1(anE: TopoDS_Edge): void;

SetEdge2(anE: TopoDS_Edge): void;

SetType(aType: TopAbs_ShapeEnum): void;

SetRange1(aR: IntTools_Range): void;
SetRange1(tf: number, tl: number): void;
SetRange1(aR: IntTools_Range): void;
SetRange1(tf: number, tl: number): void;

AppendRange2(aR: IntTools_Range): void;
AppendRange2(tf: number, tl: number): void;
AppendRange2(aR: IntTools_Range): void;
AppendRange2(tf: number, tl: number): void;

SetVertexParameter1(tV: number): void;

SetVertexParameter2(tV: number): void;

Edge1(): TopoDS_Edge;

Edge2(): TopoDS_Edge;

Type(): TopAbs_ShapeEnum;

Range1(): IntTools_Range;
Range1(tf?: number, tl?: number): { tf: number; tl: number };
Range1(): IntTools_Range;
Range1(tf?: number, tl?: number): { tf: number; tl: number };

Ranges2(): NCollection_Sequence_IntTools_Range;

ChangeRanges2(): NCollection_Sequence_IntTools_Range;

VertexParameter1(): number;

VertexParameter2(): number;

Copy(anOther: IntTools_CommonPrt): void;

AllNullFlag(): boolean;

SetAllNullFlag(aFlag: boolean): void;

SetBoundingPoints(aP1: gp_Pnt, aP2: gp_Pnt): void;

BoundingPoints(aP1: gp_Pnt, aP2: gp_Pnt): void;

delete(): void;

[Symbol.dispose](): void;

IntTools_Context: declare class IntTools_Context extends Standard_Transient

constructor

ProjPC(aE: TopoDS_Edge): GeomAPI_ProjectPointOnCurve;

ProjPT(aC: Geom_Curve): GeomAPI_ProjectPointOnCurve;

SurfaceData(aF: TopoDS_Face): IntTools_SurfaceRangeLocalizeData;

Hatcher(aF: TopoDS_Face): Geom2dHatch_Hatcher;

SurfaceAdaptor(theFace: TopoDS_Face): BRepAdaptor_Surface;

OBB(theShape: TopoDS_Shape, theFuzzyValue?: number): Bnd_OBB;

UVBounds(theFace: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };

ComputePE(theP: gp_Pnt, theTolP: number, theE: TopoDS_Edge, theT?: number, theDist?: number): { returnValue: number; theT: number; theDist: number };

ComputeVE(theV: TopoDS_Vertex, theE: TopoDS_Edge, theT: number, theTol: number, theFuzz: number): { returnValue: number; theT: number; theTol: number };

ComputeVF(theVertex: TopoDS_Vertex, theFace: TopoDS_Face, theU: number, theV: number, theTol: number, theFuzz: number): { returnValue: number; theU: number; theV: number; theTol: number };

StatePointFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): TopAbs_State;

IsPointInFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;
IsPointInFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;
IsPointInFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;
IsPointInFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;

IsPointInOnFace(aF: TopoDS_Face, aP2D: gp_Pnt2d): boolean;

IsValidPointForFace(aP3D: gp_Pnt, aF: TopoDS_Face, aTol: number): boolean;

IsValidPointForFaces(aP3D: gp_Pnt, aF1: TopoDS_Face, aF2: TopoDS_Face, aTol: number): boolean;

IsValidBlockForFace(aT1: number, aT2: number, aIC: IntTools_Curve, aF: TopoDS_Face, aTol: number): boolean;

IsValidBlockForFaces(aT1: number, aT2: number, aIC: IntTools_Curve, aF1: TopoDS_Face, aF2: TopoDS_Face, aTol: number): boolean;

IsVertexOnLine(aV: TopoDS_Vertex, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
IsVertexOnLine(aV: TopoDS_Vertex, aTolV: number, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
IsVertexOnLine(aV: TopoDS_Vertex, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };
IsVertexOnLine(aV: TopoDS_Vertex, aTolV: number, aIC: IntTools_Curve, aTolC: number, aT?: number): { returnValue: boolean; aT: number };

ProjectPointOnEdge(aP: gp_Pnt, aE: TopoDS_Edge, aT?: number): { returnValue: boolean; aT: number };

BndBox(theS: TopoDS_Shape): Bnd_Box;

IsInfiniteFace(theFace: TopoDS_Face): boolean;

SetPOnSProjectionTolerance(theValue: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IntTools_Curve: declare class IntTools_Curve

constructor

SetCurves(the3dCurve: Geom_Curve, the2dCurve1: Geom2d_Curve, the2dCurve2: Geom2d_Curve): void;

SetCurve(the3dCurve: Geom_Curve): void;

SetFirstCurve2d(the2dCurve1: Geom2d_Curve): void;

SetSecondCurve2d(the2dCurve2: Geom2d_Curve): void;

SetTolerance(theTolerance: number): void;

SetTangentialTolerance(theTangentialTolerance: number): void;

Curve(): Geom_Curve;

FirstCurve2d(): Geom2d_Curve;

SecondCurve2d(): Geom2d_Curve;

Tolerance(): number;

TangentialTolerance(): number;

HasBounds(): boolean;

Bounds(theFirst: number, theLast: number, theFirstPnt: gp_Pnt, theLastPnt: gp_Pnt): { returnValue: boolean; theFirst: number; theLast: number };

D0(thePar: number, thePnt: gp_Pnt): boolean;

Type(): GeomAbs_CurveType;

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

delete(): void;

[Symbol.dispose](): void;

IntTools_CurveRangeSample: declare class IntTools_CurveRangeSample extends IntTools_BaseRangeSample

constructor

SetRangeIndex(theIndex: number): void;

GetRangeIndex(): number;

IsEqual(Other: IntTools_CurveRangeSample): boolean;

GetRange(theFirst: number, theLast: number, theNbSample: number): IntTools_Range;

GetRangeIndexDeeper(theNbSample: number): number;

delete(): void;

[Symbol.dispose](): void;

IntTools_EdgeEdge: declare class IntTools_EdgeEdge

constructor

SetEdge1(theEdge: TopoDS_Edge): void;
SetEdge1(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;
SetEdge1(theEdge: TopoDS_Edge): void;
SetEdge1(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;

SetRange1(theRange1: IntTools_Range): void;
SetRange1(aT1: number, aT2: number): void;
SetRange1(theRange1: IntTools_Range): void;
SetRange1(aT1: number, aT2: number): void;

SetEdge2(theEdge: TopoDS_Edge): void;
SetEdge2(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;
SetEdge2(theEdge: TopoDS_Edge): void;
SetEdge2(theEdge: TopoDS_Edge, aT1: number, aT2: number): void;

SetRange2(theRange: IntTools_Range): void;
SetRange2(aT1: number, aT2: number): void;
SetRange2(theRange: IntTools_Range): void;
SetRange2(aT1: number, aT2: number): void;

SetFuzzyValue(theFuzz: number): void;

Perform(): void;

IsDone(): boolean;

FuzzyValue(): number;

CommonParts(): NCollection_Sequence_IntTools_CommonPrt;

UseQuickCoincidenceCheck(bFlag: boolean): void;

IsCoincidenceCheckedQuickly(): boolean;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

IntTools_FClass2d: declare class IntTools_FClass2d

constructor

Init(F: TopoDS_Face, Tol: number): void;

PerformInfinitePoint(): TopAbs_State;

Perform(Puv: gp_Pnt2d, RecadreOnPeriodic?: boolean): TopAbs_State;

TestOnRestriction(Puv: gp_Pnt2d, Tol: number, RecadreOnPeriodic?: boolean): TopAbs_State;

IsHole(): boolean;

delete(): void;

[Symbol.dispose](): void;

IntTools_FaceFace: declare class IntTools_FaceFace

constructor

SetParameters(ApproxCurves: boolean, ComputeCurveOnS1: boolean, ComputeCurveOnS2: boolean, ApproximationTolerance: number): void;

Perform(F1: TopoDS_Face, F2: TopoDS_Face, theToRunParallel?: boolean): void;

IsDone(): boolean;

Lines(): NCollection_Sequence_IntTools_Curve;

Points(): NCollection_Sequence_IntTools_PntOn2Faces;

Face1(): TopoDS_Face;

Face2(): TopoDS_Face;

TangentFaces(): boolean;

PrepareLines3D(bToSplit?: boolean): void;

SetList(ListOfPnts: NCollection_List_IntSurf_PntOn2S): void;

SetContext(aContext: IntTools_Context): void;

SetFuzzyValue(theFuzz: number): void;

FuzzyValue(): number;

Context(): IntTools_Context;

delete(): void;

[Symbol.dispose](): void;

IntTools_MarkedRangeSet: declare class IntTools_MarkedRangeSet

constructor

SetBoundaries(theFirstBoundary: number, theLastBoundary: number, theInitFlag: number): void;

SetRanges(theSortedArray: NCollection_Array1_double, theInitFlag: number): void;

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

SetFlag(theIndex: number, theFlag: number): void;

Flag(theIndex: number): number;

GetIndex(theValue: number): number;
GetIndex(theValue: number, UseLower: boolean): number;
GetIndex(theValue: number): number;
GetIndex(theValue: number, UseLower: boolean): number;

GetIndices(theValue: number): NCollection_Sequence_int;

Length(): number;

Range(theIndex: number): IntTools_Range;

delete(): void;

[Symbol.dispose](): void;

IntTools_PntOn2Faces: declare class IntTools_PntOn2Faces

constructor

SetValid(bF: boolean): void;

IsValid(): boolean;

delete(): void;

[Symbol.dispose](): void;

IntTools_Range: declare class IntTools_Range

constructor

SetFirst(aFirst: number): void;

SetLast(aLast: number): void;

First(): number;

Last(): number;

Range(aFirst?: number, aLast?: number): { aFirst: number; aLast: number };

delete(): void;

[Symbol.dispose](): void;

IntTools_Root: declare class IntTools_Root

constructor

SetRoot(aRoot: number): void;

SetType(aType: number): void;

SetStateBefore(aState: TopAbs_State): void;

SetStateAfter(aState: TopAbs_State): void;

SetLayerHeight(aHeight: number): void;

SetInterval(t1: number, t2: number, f1: number, f2: number): void;

Root(): number;

Type(): number;

StateBefore(): TopAbs_State;

StateAfter(): TopAbs_State;

LayerHeight(): number;

IsValid(): boolean;

Interval(t1?: number, t2?: number, f1?: number, f2?: number): { t1: number; t2: number; f1: number; f2: number };

delete(): void;

[Symbol.dispose](): void;

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

IsDone(): boolean;

IsSplittable(): boolean;

Length(): number;

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

SetGridDeflection(theDeflection: number): void;

GetGridDeflection(): number;

SetRangeUGrid(theNbUGrid: number): void;

GetRangeUGrid(): number;

SetUParam(theIndex: number, theUParam: number): void;

GetUParam(theIndex: number): number;

SetRangeVGrid(theNbVGrid: number): void;

GetRangeVGrid(): number;

SetVParam(theIndex: number, theVParam: number): void;

GetVParam(theIndex: number): number;

SetGridPoint(theUIndex: number, theVIndex: number, thePoint: gp_Pnt): void;

GetGridPoint(theUIndex: number, theVIndex: number): gp_Pnt;

SetFrame(theUMin: number, theUMax: number, theVMin: number, theVMax: number): void;

GetNBUPointsInFrame(): number;

GetNBVPointsInFrame(): number;

GetPointInFrame(theUIndex: number, theVIndex: number): gp_Pnt;

GetUParamInFrame(theIndex: number): number;

GetVParamInFrame(theIndex: number): number;

ClearGrid(): void;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

IntTools_Tools: declare class IntTools_Tools

constructor

static ComputeVV(V1: TopoDS_Vertex, V2: TopoDS_Vertex): number;

static HasInternalEdge(aW: TopoDS_Wire): boolean;

static MakeFaceFromWireAndFace(aW: TopoDS_Wire, aF: TopoDS_Face, aFNew: TopoDS_Face): void;

static ClassifyPointByFace(aF: TopoDS_Face, P: gp_Pnt2d): TopAbs_State;

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

static IsMiddlePointsEqual(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

static IntermediatePoint(aFirst: number, aLast: number): number;

static SplitCurve(aC: IntTools_Curve, aS: NCollection_Sequence_IntTools_Curve): number;

static RejectLines(aSIn: NCollection_Sequence_IntTools_Curve, aSOut: NCollection_Sequence_IntTools_Curve): void;

static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir): boolean;
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir, aTol: number): boolean;
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir): boolean;
static IsDirsCoinside(D1: gp_Dir, D2: gp_Dir, aTol: number): boolean;

static IsClosed(aC: Geom_Curve): boolean;

static CurveTolerance(aC: Geom_Curve, aTolBase: number): number;

static CheckCurve(theCurve: IntTools_Curve, theBox: Bnd_Box): boolean;

static IsOnPave(theT: number, theRange: IntTools_Range, theTol: number): boolean;

static VertexParameters(theCP: IntTools_CommonPrt, theT1?: number, theT2?: number): { theT1: number; theT2: number };

static VertexParameter(theCP: IntTools_CommonPrt, theT?: number): { theT: number };

static IsOnPave1(theT: number, theRange: IntTools_Range, theTol: number): boolean;

static IsInRange(theRRef: IntTools_Range, theR: IntTools_Range, theTol: number): boolean;

static SegPln(theLin: gp_Lin, theTLin1: number, theTLin2: number, theTolLin: number, thePln: gp_Pln, theTolPln: number, theP: gp_Pnt, theT?: number, theTolP?: number, theTmin?: number, theTmax?: number): { returnValue: number; theT: number; theTolP: number; theTmin: number; theTmax: number };

static ComputeTolerance(theCurve3D: Geom_Curve, theCurve2D: Geom2d_Curve, theSurf: Geom_Surface, theFirst: number, theLast: number, theMaxDist: number, theMaxPar: number, theTolRange: number, theToRunParallel: boolean): { returnValue: boolean; theMaxDist: number; theMaxPar: number };

static ComputeIntRange(theTol1: number, theTol2: number, theAngle: number): number;

delete(): void;

[Symbol.dispose](): void;
