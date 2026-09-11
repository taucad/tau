# libcascade — BRepExtrema

20 top-level symbols. Signatures are verbatim typescript.

BRepExtrema_DistShapeShape: declare class BRepExtrema_DistShapeShape

constructor

SetDeflection(theDeflection: number): void;

LoadS1(Shape1: TopoDS_Shape): void;

LoadS2(Shape1: TopoDS_Shape): void;

Perform(theRange?: Message_ProgressRange): boolean;

IsDone(): boolean;

NbSolution(): number;

Value(): number;

InnerSolution(): boolean;

PointOnShape1(N: number): gp_Pnt;

PointOnShape2(N: number): gp_Pnt;

SupportTypeShape1(N: number): BRepExtrema_SupportType;

SupportTypeShape2(N: number): BRepExtrema_SupportType;

SupportOnShape1(N: number): TopoDS_Shape;

SupportOnShape2(N: number): TopoDS_Shape;

ParOnEdgeS1(N: number, t?: number): { t: number };

ParOnEdgeS2(N: number, t?: number): { t: number };

ParOnFaceS1(N: number, u?: number, v?: number): { u: number; v: number };

ParOnFaceS2(N: number, u?: number, v?: number): { u: number; v: number };

SetFlag(F: Extrema_ExtFlag): void;

SetAlgo(A: Extrema_ExtAlgo): void;

SetMultiThread(theIsMultiThread: boolean): void;

IsMultiThread(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_DistanceSS: declare class BRepExtrema_DistanceSS

constructor

IsDone(): boolean;

DistValue(): number;

Seq1Value(): NCollection_Sequence_BRepExtrema_SolutionElem;

Seq2Value(): NCollection_Sequence_BRepExtrema_SolutionElem;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ElementFilter: declare class BRepExtrema_ElementFilter

constructor

PreCheckElements(argNo0: number, argNo1: number): BRepExtrema_ElementFilter_FilterResult;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ElementFilter_FilterResult: typeof BRepExtrema_ElementFilter_FilterResult[keyof typeof BRepExtrema_ElementFilter_FilterResult]

BRepExtrema_ExtCC: declare class BRepExtrema_ExtCC

constructor

Initialize(E2: TopoDS_Edge): void;

Perform(E1: TopoDS_Edge): void;

IsDone(): boolean;

NbExt(): number;

IsParallel(): boolean;

SquareDistance(N: number): number;

ParameterOnE1(N: number): number;

PointOnE1(N: number): gp_Pnt;

ParameterOnE2(N: number): number;

PointOnE2(N: number): gp_Pnt;

TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt, P12: gp_Pnt, P21: gp_Pnt, P22: gp_Pnt): { dist11: number; distP12: number; distP21: number; distP22: number };

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtCF: declare class BRepExtrema_ExtCF

constructor

Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

Perform(E: TopoDS_Edge, F: TopoDS_Face): void;

IsDone(): boolean;

NbExt(): number;

SquareDistance(N: number): number;

IsParallel(): boolean;

ParameterOnEdge(N: number): number;

ParameterOnFace(N: number, U?: number, V?: number): { U: number; V: number };

PointOnEdge(N: number): gp_Pnt;

PointOnFace(N: number): gp_Pnt;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtFF: declare class BRepExtrema_ExtFF

constructor

Initialize(F2: TopoDS_Face): void;

Perform(F1: TopoDS_Face, F2: TopoDS_Face): void;

IsDone(): boolean;

IsParallel(): boolean;

NbExt(): number;

SquareDistance(N: number): number;

ParameterOnFace1(N: number, U?: number, V?: number): { U: number; V: number };

ParameterOnFace2(N: number, U?: number, V?: number): { U: number; V: number };

PointOnFace1(N: number): gp_Pnt;

PointOnFace2(N: number): gp_Pnt;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtPC: declare class BRepExtrema_ExtPC

constructor

Initialize(E: TopoDS_Edge): void;

Perform(V: TopoDS_Vertex): void;

IsDone(): boolean;

NbExt(): number;

IsMin(N: number): boolean;

SquareDistance(N: number): number;

Parameter(N: number): number;

Point(N: number): gp_Pnt;

TrimmedSquareDistances(dist1: number, dist2: number, pnt1: gp_Pnt, pnt2: gp_Pnt): { dist1: number; dist2: number };

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ExtPF: declare class BRepExtrema_ExtPF

constructor

Initialize(TheFace: TopoDS_Face, TheFlag?: Extrema_ExtFlag, TheAlgo?: Extrema_ExtAlgo): void;

Perform(TheVertex: TopoDS_Vertex, TheFace: TopoDS_Face): void;

IsDone(): boolean;

NbExt(): number;

SquareDistance(N: number): number;

Parameter(N: number, U?: number, V?: number): { U: number; V: number };

Point(N: number): gp_Pnt;

SetFlag(F: Extrema_ExtFlag): void;

SetAlgo(A: Extrema_ExtAlgo): void;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_OverlapTool: declare class BRepExtrema_OverlapTool

constructor

LoadTriangleSets(theSet1: BRepExtrema_TriangleSet, theSet2: BRepExtrema_TriangleSet): void;

Perform(theTolerance?: number): void;

IsDone(): boolean;

MarkDirty(): void;

OverlapSubShapes1(): unknown;

OverlapSubShapes2(): unknown;

SetElementFilter(theFilter: BRepExtrema_ElementFilter): void;

Accept(theLeaf1: number, theLeaf2: number): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_Poly: declare class BRepExtrema_Poly

constructor

static Distance(S1: TopoDS_Shape, S2: TopoDS_Shape, P1: gp_Pnt, P2: gp_Pnt, dist?: number): { returnValue: boolean; dist: number };

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ProximityDistTool_PrjState: declare class BRepExtrema_ProximityDistTool_PrjState

constructor

GetTrgIdx(): number;

GetPrjState(): unknown;

GetNumberOfFirstNode(): number;

GetNumberOfLastNode(): number;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_VertexInspector: declare class BRepExtrema_VertexInspector

constructor

static Coord(i: number, thePnt: gp_XYZ): number;

static Shift(thePnt: gp_XYZ, theTol: number): gp_XYZ;

Add(thePnt: gp_XYZ): void;

SetTol(theTol: number): void;

SetCurrent(theCurPnt: gp_XYZ): void;

IsNeedAdd(): boolean;

Inspect(theTarget: number): NCollection_CellFilter_Action;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_SelfIntersection: declare class BRepExtrema_SelfIntersection extends BRepExtrema_ElementFilter

constructor

Tolerance(): number;

SetTolerance(theTolerance: number): void;

LoadShape(theShape: TopoDS_Shape): boolean;

Perform(): void;

IsDone(): boolean;

OverlapElements(): unknown;

GetSubShape(theID: number): TopoDS_Face;

ElementSet(): BRepExtrema_TriangleSet;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_ShapeProximity: declare class BRepExtrema_ShapeProximity

constructor

Tolerance(): number;

SetTolerance(theTolerance: number): void;

Proximity(): number;

LoadShape1(theShape1: TopoDS_Shape): boolean;

LoadShape2(theShape2: TopoDS_Shape): boolean;

SetNbSamples1(theNbSamples: number): void;

SetNbSamples2(theNbSamples: number): void;

Perform(): void;

IsDone(): boolean;

OverlapSubShapes1(): unknown;

OverlapSubShapes2(): unknown;

GetSubShape1(theID: number): TopoDS_Shape;

GetSubShape2(theID: number): TopoDS_Shape;

ElementSet1(): BRepExtrema_TriangleSet;

ElementSet2(): BRepExtrema_TriangleSet;

ProximityPoint1(): gp_Pnt;

ProximityPoint2(): gp_Pnt;

ProxPntStatus1(): unknown;

ProxPntStatus2(): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_SolutionElem: declare class BRepExtrema_SolutionElem

constructor

Dist(): number;

Point(): gp_Pnt;

SupportKind(): BRepExtrema_SupportType;

Vertex(): TopoDS_Vertex;

Edge(): TopoDS_Edge;

Face(): TopoDS_Face;

EdgeParameter(theParam?: number): { theParam: number };

FaceParameter(theU?: number, theV?: number): { theU: number; theV: number };

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_SupportType: typeof BRepExtrema_SupportType[keyof typeof BRepExtrema_SupportType]

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

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_UnCompatibleShape: declare class BRepExtrema_UnCompatibleShape extends Standard_DomainError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

BRepExtrema_SeqOfSolution: NCollection_Sequence_BRepExtrema_SolutionElem
