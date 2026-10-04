# libcascade — BRepMesh (2)

10 top-level symbols. Signatures are verbatim typescript.

BRepMesh_ShapeVisitor: declare class BRepMesh_ShapeVisitor extends IMeshTools_ShapeVisitor

  // BRepMesh_ShapeVisitor.constructor (constructor)
  constructor(theModel: IMeshData_Model);

  // BRepMesh_ShapeVisitor.Visit (method)
  Visit(theFace: TopoDS_Face): void;
  Visit(theEdge: TopoDS_Edge): void;

  // BRepMesh_ShapeVisitor.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ShapeVisitor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ShapeVisitor.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ShapeVisitor.delete (method)
  delete(): void;

  // BRepMesh_ShapeVisitor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_SphereRangeSplitter: declare class BRepMesh_SphereRangeSplitter extends BRepMesh_DefaultRangeSplitter

  // BRepMesh_SphereRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_SphereRangeSplitter.GenerateSurfaceNodes (method)
  GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

  // BRepMesh_SphereRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_SphereRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_TorusRangeSplitter: declare class BRepMesh_TorusRangeSplitter extends BRepMesh_UVParamRangeSplitter

  // BRepMesh_TorusRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_TorusRangeSplitter.GenerateSurfaceNodes (method)
  GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

  // BRepMesh_TorusRangeSplitter.AddPoint (method)
  AddPoint(thePoint: gp_Pnt2d): void;

  // BRepMesh_TorusRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_TorusRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Triangulator: declare class BRepMesh_Triangulator

  // BRepMesh_Triangulator.constructor (constructor)
  constructor(theXYZs: NCollection_DynamicArray_gp_XYZ, theWires: NCollection_List_NCollection_Sequence_int, theNorm: gp_Dir);

  // BRepMesh_Triangulator.ToPolyTriangulation (method)
  static ToPolyTriangulation(theNodes: NCollection_Array1_gp_Pnt, thePolyTriangles: NCollection_List_Poly_Triangle): Poly_Triangulation;

  // BRepMesh_Triangulator.Perform (method)
  Perform(thePolyTriangles: NCollection_List_Poly_Triangle): boolean;

  // BRepMesh_Triangulator.delete (method)
  delete(): void;

  // BRepMesh_Triangulator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_UVParamRangeSplitter: declare class BRepMesh_UVParamRangeSplitter extends BRepMesh_DefaultRangeSplitter

  // BRepMesh_UVParamRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_UVParamRangeSplitter.Reset (method)
  Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

  // BRepMesh_UVParamRangeSplitter.GetParametersU (method)
  GetParametersU(): unknown;

  // BRepMesh_UVParamRangeSplitter.GetParametersV (method)
  GetParametersV(): unknown;

  // BRepMesh_UVParamRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_UVParamRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_UndefinedRangeSplitter: declare class BRepMesh_UndefinedRangeSplitter extends BRepMesh_NURBSRangeSplitter

  // BRepMesh_UndefinedRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_UndefinedRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_UndefinedRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Vertex: declare class BRepMesh_Vertex

  // BRepMesh_Vertex.constructor (constructor)
  constructor();
  constructor(theUV: gp_XY, theLocation3d: number, theMovability: BRepMesh_DegreeOfFreedom);
  constructor(theU: number, theV: number, theMovability: BRepMesh_DegreeOfFreedom);

  // BRepMesh_Vertex.Initialize (method)
  Initialize(theUV: gp_XY, theLocation3d: number, theMovability: BRepMesh_DegreeOfFreedom): void;

  // BRepMesh_Vertex.Coord (method)
  Coord(): gp_XY;

  // BRepMesh_Vertex.ChangeCoord (method)
  ChangeCoord(): gp_XY;

  // BRepMesh_Vertex.Location3d (method)
  Location3d(): number;

  // BRepMesh_Vertex.Movability (method)
  Movability(): BRepMesh_DegreeOfFreedom;

  // BRepMesh_Vertex.SetMovability (method)
  SetMovability(theMovability: BRepMesh_DegreeOfFreedom): void;

  // BRepMesh_Vertex.IsEqual (method)
  IsEqual(theOther: BRepMesh_Vertex): boolean;

  // BRepMesh_Vertex.delete (method)
  delete(): void;

  // BRepMesh_Vertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_VertexInspector: declare class BRepMesh_VertexInspector

  // BRepMesh_VertexInspector.constructor (constructor)
  constructor(theAllocator: NCollection_IncAllocator);

  // BRepMesh_VertexInspector.Coord (method)
  static Coord(i: number, thePnt: gp_XY): number;

  // BRepMesh_VertexInspector.Shift (method)
  static Shift(thePnt: gp_XY, theTol: number): gp_XY;

  // BRepMesh_VertexInspector.Add (method)
  Add(theVertex: BRepMesh_Vertex): number;

  // BRepMesh_VertexInspector.SetTolerance (method)
  SetTolerance(theTolerance: number): void;
  SetTolerance(theToleranceX: number, theToleranceY: number): void;

  // BRepMesh_VertexInspector.Clear (method)
  Clear(): void;

  // BRepMesh_VertexInspector.Delete (method)
  Delete(theIndex: number): void;

  // BRepMesh_VertexInspector.NbVertices (method)
  NbVertices(): number;

  // BRepMesh_VertexInspector.GetVertex (method)
  GetVertex(theIndex: number): BRepMesh_Vertex;

  // BRepMesh_VertexInspector.SetPoint (method)
  SetPoint(thePoint: gp_XY): void;

  // BRepMesh_VertexInspector.GetCoincidentPoint (method)
  GetCoincidentPoint(): number;

  // BRepMesh_VertexInspector.GetListOfDelPoints (method)
  GetListOfDelPoints(): unknown;

  // BRepMesh_VertexInspector.Vertices (method)
  Vertices(): VectorOfVertex;

  // BRepMesh_VertexInspector.ChangeVertices (method)
  ChangeVertices(): VectorOfVertex;

  // BRepMesh_VertexInspector.Inspect (method)
  Inspect(theTargetIndex: number): NCollection_CellFilter_Action;

  // BRepMesh_VertexInspector.IsEqual (method)
  static IsEqual(theIndex: number, theTargetIndex: number): boolean;

  // BRepMesh_VertexInspector.delete (method)
  delete(): void;

  // BRepMesh_VertexInspector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_VertexTool: declare class BRepMesh_VertexTool extends Standard_Transient

  // BRepMesh_VertexTool.constructor (constructor)
  constructor(theAllocator: NCollection_IncAllocator);

  // BRepMesh_VertexTool.SetCellSize (method)
  SetCellSize(theSize: number): void;
  SetCellSize(theSizeX: number, theSizeY: number): void;

  // BRepMesh_VertexTool.SetTolerance (method)
  SetTolerance(theTolerance: number): void;
  SetTolerance(theToleranceX: number, theToleranceY: number): void;

  // BRepMesh_VertexTool.GetTolerance (method)
  GetTolerance(theToleranceX?: number, theToleranceY?: number): { theToleranceX: number; theToleranceY: number };

  // BRepMesh_VertexTool.Add (method)
  Add(theVertex: BRepMesh_Vertex, isForceAdd: boolean): number;

  // BRepMesh_VertexTool.DeleteVertex (method)
  DeleteVertex(theIndex: number): void;

  // BRepMesh_VertexTool.Vertices (method)
  Vertices(): VectorOfVertex;

  // BRepMesh_VertexTool.ChangeVertices (method)
  ChangeVertices(): VectorOfVertex;

  // BRepMesh_VertexTool.FindKey (method)
  FindKey(theIndex: number): BRepMesh_Vertex;

  // BRepMesh_VertexTool.FindIndex (method)
  FindIndex(theVertex: BRepMesh_Vertex): number;

  // BRepMesh_VertexTool.Extent (method)
  Extent(): number;

  // BRepMesh_VertexTool.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepMesh_VertexTool.Substitute (method)
  Substitute(theIndex: number, theVertex: BRepMesh_Vertex): void;

  // BRepMesh_VertexTool.RemoveLast (method)
  RemoveLast(): void;

  // BRepMesh_VertexTool.GetListOfDelNodes (method)
  GetListOfDelNodes(): unknown;

  // BRepMesh_VertexTool.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_VertexTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_VertexTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_VertexTool.delete (method)
  delete(): void;

  // BRepMesh_VertexTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_FaceChecker_Segment: interface BRepMesh_FaceChecker_Segment

  EdgePtr: unknown

  Point1: gp_Pnt2d

  Point2: gp_Pnt2d
