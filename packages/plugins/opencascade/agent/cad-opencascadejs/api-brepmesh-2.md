# libcascade — BRepMesh (2)

11 top-level symbols. Signatures are verbatim typescript.

BRepMesh_ShapeTool: declare class BRepMesh_ShapeTool extends Standard_Transient

constructor

static MaxFaceTolerance(theFace: TopoDS_Face): number;

static BoxMaxDimension(theBox: Bnd_Box, theMaxDimension?: number): { theMaxDimension: number };

static CheckAndUpdateFlags(theEdge: unknown, thePCurve: unknown): void;

static AddInFace(theFace: TopoDS_Face): { theTriangulation: Poly_Triangulation; [Symbol.dispose](): void };

static NullifyFace(theFace: TopoDS_Face): void;

static NullifyEdge(theEdge: TopoDS_Edge, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static NullifyEdge(theEdge: TopoDS_Edge, theLocation: TopLoc_Location): void;
static NullifyEdge(theEdge: TopoDS_Edge, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static NullifyEdge(theEdge: TopoDS_Edge, theLocation: TopLoc_Location): void;

static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;

static UseLocation(thePnt: gp_Pnt, theLoc: TopLoc_Location): gp_Pnt;

static UVPoints(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstPoint2d: gp_Pnt2d, theLastPoint2d: gp_Pnt2d, isConsiderOrientation: boolean): boolean;

static Range(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; thePCurve: Geom2d_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
static Range(theEdge: TopoDS_Edge, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; theCurve: Geom_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
static Range(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; thePCurve: Geom2d_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
static Range(theEdge: TopoDS_Edge, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; theCurve: Geom_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_ShapeVisitor: declare class BRepMesh_ShapeVisitor extends IMeshTools_ShapeVisitor

constructor

Visit(theFace: TopoDS_Face): void;
Visit(theEdge: TopoDS_Edge): void;
Visit(theFace: TopoDS_Face): void;
Visit(theEdge: TopoDS_Edge): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_SphereRangeSplitter: declare class BRepMesh_SphereRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_TorusRangeSplitter: declare class BRepMesh_TorusRangeSplitter extends BRepMesh_UVParamRangeSplitter

constructor

GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

AddPoint(thePoint: gp_Pnt2d): void;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Triangulator: declare class BRepMesh_Triangulator

constructor

static ToPolyTriangulation(theNodes: NCollection_Array1_gp_Pnt, thePolyTriangles: NCollection_List_Poly_Triangle): Poly_Triangulation;

Perform(thePolyTriangles: NCollection_List_Poly_Triangle): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_UVParamRangeSplitter: declare class BRepMesh_UVParamRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

GetParametersU(): unknown;

GetParametersV(): unknown;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_UndefinedRangeSplitter: declare class BRepMesh_UndefinedRangeSplitter extends BRepMesh_NURBSRangeSplitter

constructor

delete(): void;

[Symbol.dispose](): void;

BRepMesh_Vertex: declare class BRepMesh_Vertex

constructor

Initialize(theUV: gp_XY, theLocation3d: number, theMovability: BRepMesh_DegreeOfFreedom): void;

Coord(): gp_XY;

ChangeCoord(): gp_XY;

Location3d(): number;

Movability(): BRepMesh_DegreeOfFreedom;

SetMovability(theMovability: BRepMesh_DegreeOfFreedom): void;

IsEqual(theOther: BRepMesh_Vertex): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_VertexInspector: declare class BRepMesh_VertexInspector

constructor

static Coord(i: number, thePnt: gp_XY): number;

static Shift(thePnt: gp_XY, theTol: number): gp_XY;

Add(theVertex: BRepMesh_Vertex): number;

SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;
SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;

Clear(): void;

Delete(theIndex: number): void;

NbVertices(): number;

GetVertex(theIndex: number): BRepMesh_Vertex;

SetPoint(thePoint: gp_XY): void;

GetCoincidentPoint(): number;

GetListOfDelPoints(): unknown;

Vertices(): VectorOfVertex;

ChangeVertices(): VectorOfVertex;

Inspect(theTargetIndex: number): NCollection_CellFilter_Action;

static IsEqual(theIndex: number, theTargetIndex: number): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_VertexTool: declare class BRepMesh_VertexTool extends Standard_Transient

constructor

SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;
SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;

SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;
SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;

GetTolerance(theToleranceX?: number, theToleranceY?: number): { theToleranceX: number; theToleranceY: number };

Add(theVertex: BRepMesh_Vertex, isForceAdd: boolean): number;

DeleteVertex(theIndex: number): void;

Vertices(): VectorOfVertex;

ChangeVertices(): VectorOfVertex;

FindKey(theIndex: number): BRepMesh_Vertex;

FindIndex(theVertex: BRepMesh_Vertex): number;

Extent(): number;

IsEmpty(): boolean;

Substitute(theIndex: number, theVertex: BRepMesh_Vertex): void;

RemoveLast(): void;

GetListOfDelNodes(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepMesh_FaceChecker_Segment: interface BRepMesh_FaceChecker_Segment

EdgePtr: unknown

Point1: gp_Pnt2d

Point2: gp_Pnt2d
