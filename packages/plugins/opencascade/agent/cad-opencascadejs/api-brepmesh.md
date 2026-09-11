# libcascade — BRepMesh

44 top-level symbols. Signatures are verbatim typescript.

BRepMesh_BaseMeshAlgo: declare class BRepMesh_BaseMeshAlgo extends IMeshTools_MeshAlgo

Perform(theDFace: unknown, theParameters: IMeshTools_Parameters, theRange?: Message_ProgressRange): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_BoundaryParamsRangeSplitter: declare class BRepMesh_BoundaryParamsRangeSplitter extends BRepMesh_NURBSRangeSplitter

constructor

AddPoint(thePoint: gp_Pnt2d): void;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Circle: declare class BRepMesh_Circle

constructor

SetLocation(theLocation: gp_XY): void;

SetRadius(theRadius: number): void;

Location(): gp_XY;

Radius(): number;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_CircleInspector: declare class BRepMesh_CircleInspector

constructor

static Coord(i: number, thePnt: gp_XY): number;

static Shift(thePnt: gp_XY, theTol: number): gp_XY;

Bind(theIndex: number, theCircle: BRepMesh_Circle): void;

Circles(): VectorOfCircle;

Circle(theIndex: number): BRepMesh_Circle;

SetPoint(thePoint: gp_XY): void;

GetShotCircles(): unknown;

Inspect(theTargetIndex: number): NCollection_CellFilter_Action;

static IsEqual(theIndex: number, theTargetIndex: number): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_CircleTool: declare class BRepMesh_CircleTool

constructor

Init(argNo0: number): void;

SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;
SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;

SetMinMaxSize(theMin: gp_XY, theMax: gp_XY): void;

IsEmpty(): boolean;

Bind(theIndex: number, theCircle: gp_Circ2d): void;
Bind(theIndex: number, thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY): boolean;
Bind(theIndex: number, theCircle: gp_Circ2d): void;
Bind(theIndex: number, thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY): boolean;

static MakeCircle(thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY, theLocation: gp_XY, theRadius?: number): { returnValue: boolean; theRadius: number };

MocBind(theIndex: number): void;

Delete(theIndex: number): void;

Select(thePoint: gp_XY): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Classifier: declare class BRepMesh_Classifier extends Standard_Transient

constructor

Perform(thePoint: gp_Pnt2d): TopAbs_State;

RegisterWire(theWire: NCollection_Sequence_gp_Pnt2d, theTolUV: [number, number], theRangeU: [number, number], theRangeV: [number, number]): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ConeRangeSplitter: declare class BRepMesh_ConeRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

GetSplitSteps(theParameters: IMeshTools_Parameters, theStepsNb: [number, number]): [number, number];

GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ConstrainedBaseMeshAlgo: declare class BRepMesh_ConstrainedBaseMeshAlgo extends BRepMesh_BaseMeshAlgo

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Context: declare class BRepMesh_Context extends IMeshTools_Context

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_CurveTessellator: declare class BRepMesh_CurveTessellator extends IMeshTools_CurveTessellator

constructor

PointsNb(): number;

Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_CustomBaseMeshAlgo: declare class BRepMesh_CustomBaseMeshAlgo extends BRepMesh_ConstrainedBaseMeshAlgo

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_CylinderRangeSplitter: declare class BRepMesh_CylinderRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DataStructureOfDelaun: declare class BRepMesh_DataStructureOfDelaun extends Standard_Transient

constructor

NbNodes(): number;

AddNode(theNode: BRepMesh_Vertex, isForceAdd?: boolean): number;

IndexOf(theNode: BRepMesh_Vertex): number;
IndexOf(theLink: BRepMesh_Edge): number;
IndexOf(theNode: BRepMesh_Vertex): number;
IndexOf(theLink: BRepMesh_Edge): number;

GetNode(theIndex: number): BRepMesh_Vertex;

SubstituteNode(theIndex: number, theNewNode: BRepMesh_Vertex): boolean;

RemoveNode(theIndex: number, isForce?: boolean): void;

LinksConnectedTo(theIndex: number): unknown;

NbLinks(): number;

AddLink(theLink: BRepMesh_Edge): number;

GetLink(theIndex: number): BRepMesh_Edge;

LinksOfDomain(): unknown;

SubstituteLink(theIndex: number, theNewLink: BRepMesh_Edge): boolean;

RemoveLink(theIndex: number, isForce?: boolean): void;

ElementsConnectedTo(theLinkIndex: number): BRepMesh_PairOfIndex;

NbElements(): number;

ElementsOfDomain(): unknown;

RemoveElement(theIndex: number): void;

Dump(theFileNameStr: string): void;

Allocator(): NCollection_IncAllocator;

Data(): BRepMesh_VertexTool;

ClearDomain(): void;

ClearDeleted(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DefaultRangeSplitter: declare class BRepMesh_DefaultRangeSplitter

constructor

Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

AddPoint(thePoint: gp_Pnt2d): void;

AdjustRange(): void;

IsValid(): boolean;

Scale(thePoint: gp_Pnt2d, isToFaceBasis: boolean): gp_Pnt2d;

GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

Point(thePoint2d: gp_Pnt2d): gp_Pnt;

GetDFace(): unknown;

GetSurface(): BRepAdaptor_Surface;

GetRangeU(): [number, number];

GetRangeV(): [number, number];

GetDelta(): [number, number];

GetToleranceUV(): [number, number];

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Deflection: declare class BRepMesh_Deflection extends Standard_Transient

constructor

static ComputeAbsoluteDeflection(theShape: TopoDS_Shape, theRelativeDeflection: number, theMaxShapeSize: number): number;

static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;

static IsConsistent(theCurrent: number, theRequired: number, theAllowDecrease: boolean, theRatio?: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DegreeOfFreedom: typeof BRepMesh_DegreeOfFreedom[keyof typeof BRepMesh_DegreeOfFreedom]

BRepMesh_DelabellaBaseMeshAlgo: declare class BRepMesh_DelabellaBaseMeshAlgo extends BRepMesh_CustomBaseMeshAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DelabellaMeshAlgoFactory: declare class BRepMesh_DelabellaMeshAlgoFactory extends IMeshTools_MeshAlgoFactory

constructor

GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DelaunayBaseMeshAlgo: declare class BRepMesh_DelaunayBaseMeshAlgo extends BRepMesh_ConstrainedBaseMeshAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DiscretAlgoFactory: declare class BRepMesh_DiscretAlgoFactory extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static RegisterFactory(theFactory: BRepMesh_DiscretAlgoFactory, theIsPreferred?: boolean): void;

static UnregisterFactory(theName: TCollection_AsciiString): void;

static DefaultFactory(): BRepMesh_DiscretAlgoFactory;

static FindFactory(theName: TCollection_AsciiString): BRepMesh_DiscretAlgoFactory;

static Factories(): NCollection_List_handle_BRepMesh_DiscretAlgoFactory;

CreateAlgorithm(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;

Name(): TCollection_AsciiString;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DiscretFactory: declare class BRepMesh_DiscretFactory

static Get(): BRepMesh_DiscretFactory;

SetDefaultName(theName: TCollection_AsciiString): boolean;

DefaultName(): TCollection_AsciiString;

Discret(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_DiscretRoot: declare class BRepMesh_DiscretRoot extends Standard_Transient

SetShape(theShape: TopoDS_Shape): void;

Shape(): TopoDS_Shape;

IsDone(): boolean;

Perform(theRange?: Message_ProgressRange): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Edge: declare class BRepMesh_Edge extends BRepMesh_OrientedEdge

constructor

Movability(): BRepMesh_DegreeOfFreedom;

SetMovability(theMovability: BRepMesh_DegreeOfFreedom): void;

IsSameOrientation(theOther: BRepMesh_Edge): boolean;

IsEqual(theOther: BRepMesh_Edge): boolean;
IsEqual(theOther: BRepMesh_OrientedEdge): boolean;
IsEqual(theOther: BRepMesh_Edge): boolean;
IsEqual(theOther: BRepMesh_OrientedEdge): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_EdgeDiscret: declare class BRepMesh_EdgeDiscret extends IMeshTools_ModelAlgo

constructor

static CreateEdgeTessellator(theDEdge: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
static CreateEdgeTessellator(theDEdge: unknown, theOrientation: TopAbs_Orientation, theDFace: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
static CreateEdgeTessellator(theDEdge: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
static CreateEdgeTessellator(theDEdge: unknown, theOrientation: TopAbs_Orientation, theDFace: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;

static CreateEdgeTessellationExtractor(theDEdge: unknown, theDFace: unknown): IMeshTools_CurveTessellator;

static Tessellate3d(theDEdge: unknown, theTessellator: IMeshTools_CurveTessellator, theUpdateEnds: boolean): void;

static Tessellate2d(theDEdge: unknown, theUpdateEnds: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_EdgeTessellationExtractor: declare class BRepMesh_EdgeTessellationExtractor extends IMeshTools_CurveTessellator

constructor

PointsNb(): number;

Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ExtrusionRangeSplitter: declare class BRepMesh_ExtrusionRangeSplitter extends BRepMesh_NURBSRangeSplitter

constructor

delete(): void;

[Symbol.dispose](): void;

BRepMesh_FaceChecker: declare class BRepMesh_FaceChecker extends Standard_Transient

constructor

Perform(): boolean;

GetIntersectingEdges(): any;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_FaceDiscret: declare class BRepMesh_FaceDiscret extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_FastDiscret: declare class BRepMesh_FastDiscret

constructor

delete(): void;

[Symbol.dispose](): void;

BRepMesh_GeomTool: declare class BRepMesh_GeomTool

constructor

AddPoint(thePoint: gp_Pnt, theParam: number, theIsReplace?: boolean): number;

NbPoints(): number;

Value(theIndex: number, theIsoParam: number, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
Value(theIndex: number, theSurface: BRepAdaptor_Surface, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
Value(theIndex: number, theIsoParam: number, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
Value(theIndex: number, theSurface: BRepAdaptor_Surface, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };

static Normal(theSurface: BRepAdaptor_Surface, theParamU: number, theParamV: number, thePoint: gp_Pnt, theNormal: gp_Dir): boolean;

static IntLinLin(theStartPnt1: gp_XY, theEndPnt1: gp_XY, theStartPnt2: gp_XY, theEndPnt2: gp_XY, theIntPnt: gp_XY, theParamOnSegment: [number, number]): BRepMesh_GeomTool_IntFlag;

static IntSegSeg(theStartPnt1: gp_XY, theEndPnt1: gp_XY, theStartPnt2: gp_XY, theEndPnt2: gp_XY, isConsiderEndPointTouch: boolean, isConsiderPointOnSegment: boolean, theIntPnt: gp_Pnt2d): BRepMesh_GeomTool_IntFlag;

static SquareDeflectionOfSegment(theFirstPoint: gp_Pnt, theLastPoint: gp_Pnt, theMidPoint: gp_Pnt): number;

static CellsCount(theSurface: Adaptor3d_Surface, theVerticesNb: number, theDeflection: number, theRangeSplitter: BRepMesh_DefaultRangeSplitter): [number, number];

delete(): void;

[Symbol.dispose](): void;

BRepMesh_GeomTool_IntFlag: typeof BRepMesh_GeomTool_IntFlag[keyof typeof BRepMesh_GeomTool_IntFlag]

BRepMesh_IncrementalMesh: declare class BRepMesh_IncrementalMesh extends BRepMesh_DiscretRoot

constructor

Perform(theRange: Message_ProgressRange): void;
Perform(theContext: IMeshTools_Context, theRange: Message_ProgressRange): void;
Perform(theRange: Message_ProgressRange): void;
Perform(theContext: IMeshTools_Context, theRange: Message_ProgressRange): void;

Parameters(): IMeshTools_Parameters;

ChangeParameters(): IMeshTools_Parameters;

IsModified(): boolean;

GetStatusFlags(): number;

static IsParallelDefault(): boolean;

static SetParallelDefault(isInParallel: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_IncrementalMeshFactory: declare class BRepMesh_IncrementalMeshFactory extends BRepMesh_DiscretAlgoFactory

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

CreateAlgorithm(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_MeshAlgoFactory: declare class BRepMesh_MeshAlgoFactory extends IMeshTools_MeshAlgoFactory

constructor

GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_MeshTool: declare class BRepMesh_MeshTool extends Standard_Transient

constructor

GetStructure(): BRepMesh_DataStructureOfDelaun;

DumpTriangles(theFileName: string, theTriangles: unknown): void;

AddAndLegalizeTriangle(thePoint1: number, thePoint2: number, thePoint3: number): void;

AddTriangle(thePoint1: number, thePoint2: number, thePoint3: number, theEdges: [number, number, number]): void;

AddLink(theFirstNode: number, theLastNode: number, theLinkIndex?: number, theLinkOri?: boolean): { theLinkIndex: number; theLinkOri: boolean };

Legalize(theLinkIndex: number): void;

EraseItemsConnectedTo(theNodeIndex: number): void;

CleanFrontierLinks(): void;

EraseTriangles(theTriangles: unknown, theLoopEdges: unknown): void;

EraseTriangle(theTriangleIndex: number, theLoopEdges: unknown): void;

EraseFreeLinks(): void;
EraseFreeLinks(theLinks: unknown): void;
EraseFreeLinks(): void;
EraseFreeLinks(theLinks: unknown): void;

GetEdgesByType(theEdgeType: BRepMesh_DegreeOfFreedom): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_MeshTool_NodeClassifier: declare class BRepMesh_MeshTool_NodeClassifier

constructor

IsAbove(theNodeIndex: number): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ModelBuilder: declare class BRepMesh_ModelBuilder extends IMeshTools_ModelBuilder

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ModelHealer: declare class BRepMesh_ModelHealer extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ModelPostProcessor: declare class BRepMesh_ModelPostProcessor extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ModelPreProcessor: declare class BRepMesh_ModelPreProcessor extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_NURBSRangeSplitter: declare class BRepMesh_NURBSRangeSplitter extends BRepMesh_UVParamRangeSplitter

constructor

AdjustRange(): void;

GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_OrientedEdge: declare class BRepMesh_OrientedEdge

constructor

FirstNode(): number;

LastNode(): number;

IsEqual(theOther: BRepMesh_OrientedEdge): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_PairOfIndex: declare class BRepMesh_PairOfIndex

constructor

Clear(): void;

Append(theIndex: number): void;

Prepend(theIndex: number): void;

IsEmpty(): boolean;

Extent(): number;

FirstIndex(): number;

LastIndex(): number;

Index(thePairPos: number): number;

SetIndex(thePairPos: number, theIndex: number): void;

RemoveIndex(thePairPos: number): void;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_SelectorOfDataStructureOfDelaun: declare class BRepMesh_SelectorOfDataStructureOfDelaun extends Standard_Transient

constructor

Initialize(theMesh: BRepMesh_DataStructureOfDelaun): void;

NeighboursOf(theNode: BRepMesh_Vertex): void;
NeighboursOf(theLink: BRepMesh_Edge): void;
NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;
NeighboursOf(theNode: BRepMesh_Vertex): void;
NeighboursOf(theLink: BRepMesh_Edge): void;
NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;
NeighboursOf(theNode: BRepMesh_Vertex): void;
NeighboursOf(theLink: BRepMesh_Edge): void;
NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;

NeighboursOfNode(theNodeIndex: number): void;

NeighboursOfLink(theLinkIndex: number): void;

NeighboursOfElement(theElementIndex: number): void;

AddNeighbours(): void;

Nodes(): unknown;

Links(): unknown;

Elements(): unknown;

FrontierLinks(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
