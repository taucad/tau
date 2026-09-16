# libcascade — RWMesh

16 top-level symbols. Signatures are verbatim typescript.

RWMesh: declare class RWMesh

  constructor

  static ReadNameAttribute(theLabel: TDF_Label): TCollection_AsciiString;

  static FormatName(theFormat: RWMesh_NameFormat, theLabel: TDF_Label, theRefLabel: TDF_Label): TCollection_AsciiString;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_CafReader: declare class RWMesh_CafReader extends Standard_Transient

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Document(): TDocStd_Document;

  SetDocument(theDoc: TDocStd_Document): void;

  RootPrefix(): TCollection_AsciiString;

  SetRootPrefix(theRootPrefix: TCollection_AsciiString): void;

  ToFillIncompleteDocument(): boolean;

  SetFillIncompleteDocument(theToFillIncomplete: boolean): void;

  MemoryLimitMiB(): number;

  SetMemoryLimitMiB(theLimitMiB: number): void;

  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  SystemLengthUnit(): number;

  SetSystemLengthUnit(theUnits: number): void;

  HasSystemCoordinateSystem(): boolean;

  SystemCoordinateSystem(): gp_Ax3;

  SetSystemCoordinateSystem(theCS: gp_Ax3): void;
  SetSystemCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;
  SetSystemCoordinateSystem(theCS: gp_Ax3): void;
  SetSystemCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;

  FileLengthUnit(): number;

  SetFileLengthUnit(theUnits: number): void;

  HasFileCoordinateSystem(): boolean;

  FileCoordinateSystem(): gp_Ax3;

  SetFileCoordinateSystem(theCS: gp_Ax3): void;
  SetFileCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;
  SetFileCoordinateSystem(theCS: gp_Ax3): void;
  SetFileCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;

  Perform(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  ExtraStatus(): number;

  SingleShape(): TopoDS_Shape;

  ExternalFiles(): NCollection_IndexedMap_TCollection_AsciiString;

  Metadata(): any;

  ProbeHeader(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_CafReaderStatusEx: typeof RWMesh_CafReaderStatusEx[keyof typeof RWMesh_CafReaderStatusEx]

RWMesh_CoordinateSystem: typeof RWMesh_CoordinateSystem[keyof typeof RWMesh_CoordinateSystem]

RWMesh_CoordinateSystemConverter: declare class RWMesh_CoordinateSystemConverter

  constructor

  static StandardCoordinateSystem(theSys: RWMesh_CoordinateSystem): gp_Ax3;

  IsEmpty(): boolean;

  InputLengthUnit(): number;

  SetInputLengthUnit(theInputScale: number): void;

  OutputLengthUnit(): number;

  SetOutputLengthUnit(theOutputScale: number): void;

  HasInputCoordinateSystem(): boolean;

  InputCoordinateSystem(): gp_Ax3;

  SetInputCoordinateSystem(theSysFrom: gp_Ax3): void;
  SetInputCoordinateSystem(theSysFrom: RWMesh_CoordinateSystem): void;
  SetInputCoordinateSystem(theSysFrom: gp_Ax3): void;
  SetInputCoordinateSystem(theSysFrom: RWMesh_CoordinateSystem): void;

  HasOutputCoordinateSystem(): boolean;

  OutputCoordinateSystem(): gp_Ax3;

  SetOutputCoordinateSystem(theSysTo: gp_Ax3): void;
  SetOutputCoordinateSystem(theSysTo: RWMesh_CoordinateSystem): void;
  SetOutputCoordinateSystem(theSysTo: gp_Ax3): void;
  SetOutputCoordinateSystem(theSysTo: RWMesh_CoordinateSystem): void;

  Init(theInputSystem: gp_Ax3, theInputLengthUnit: number, theOutputSystem: gp_Ax3, theOutputLengthUnit: number): void;

  TransformTransformation(theTrsf: gp_Trsf): void;

  TransformPosition(thePos: gp_XYZ): void;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_EdgeIterator: declare class RWMesh_EdgeIterator extends RWMesh_ShapeIterator

  constructor

  More(): boolean;

  Next(): void;

  Edge(): TopoDS_Edge;

  Shape(): TopoDS_Shape;

  Polygon3D(): Poly_Polygon3D;

  IsEmpty(): boolean;

  ElemLower(): number;

  ElemUpper(): number;

  NbNodes(): number;

  NodeLower(): number;

  NodeUpper(): number;

  node(theNode: number): gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_FaceIterator: declare class RWMesh_FaceIterator extends RWMesh_ShapeIterator

  constructor

  More(): boolean;

  Next(): void;

  Face(): TopoDS_Face;

  Shape(): TopoDS_Shape;

  Triangulation(): Poly_Triangulation;

  IsEmptyMesh(): boolean;

  IsEmpty(): boolean;

  FaceStyle(): XCAFPrs_Style;

  HasFaceColor(): boolean;

  FaceColor(): Quantity_ColorRGBA;

  NbTriangles(): number;

  ElemLower(): number;

  ElemUpper(): number;

  TriangleOriented(theElemIndex: number): Poly_Triangle;

  HasNormals(): boolean;

  HasTexCoords(): boolean;

  NormalTransformed(theNode: number): gp_Dir;

  NbNodes(): number;

  NodeLower(): number;

  NodeUpper(): number;

  NodeTexCoord(theNode: number): gp_Pnt2d;

  node(theNode: number): gp_Pnt;

  normal(theNode: number): gp_Dir;

  triangle(theElemIndex: number): Poly_Triangle;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_MaterialMap: declare class RWMesh_MaterialMap extends Standard_Transient

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  DefaultStyle(): XCAFPrs_Style;

  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  FindMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  CreateTextureFolder(): boolean;

  DefineMaterial(theStyle: XCAFPrs_Style, theKey: TCollection_AsciiString, theName: TCollection_AsciiString): void;

  IsFailed(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_NameFormat: typeof RWMesh_NameFormat[keyof typeof RWMesh_NameFormat]

RWMesh_NodeAttributes: declare class RWMesh_NodeAttributes

  constructor

  Name: TCollection_AsciiString

  RawName: TCollection_AsciiString

  NamedData: TDataStd_NamedData

  Style: XCAFPrs_Style

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_ShapeIterator: declare class RWMesh_ShapeIterator

  ExploredShape(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  More(): boolean;

  Next(): void;

  IsEmpty(): boolean;

  Style(): XCAFPrs_Style;

  HasColor(): boolean;

  Color(): Quantity_ColorRGBA;

  ElemLower(): number;

  ElemUpper(): number;

  NbNodes(): number;

  NodeLower(): number;

  NodeUpper(): number;

  NodeTransformed(theNode: number): gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_TriangulationReader: declare class RWMesh_TriangulationReader extends Standard_Transient

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  FileName(): TCollection_AsciiString;

  SetFileName(theFileName: TCollection_AsciiString): void;

  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  IsDoublePrecision(): boolean;

  SetDoublePrecision(theIsDouble: boolean): void;

  ToSkipDegenerates(): boolean;

  SetToSkipDegenerates(theToSkip: boolean): void;

  ToPrintDebugMessages(): boolean;

  SetToPrintDebugMessages(theToPrint: boolean): void;

  StartStatistic(): void;

  StopStatistic(): void;

  PrintStatistic(): void;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_TriangulationReader_LoadingStatistic: declare class RWMesh_TriangulationReader_LoadingStatistic

  constructor

  ExpectedNodesNb: number

  LoadedNodesNb: number

  ExpectedTrianglesNb: number

  DegeneratedTrianglesNb: number

  LoadedTrianglesNb: number

  Reset(): void;

  PrintStatistic(thePrefix?: TCollection_AsciiString): void;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_TriangulationSource: declare class RWMesh_TriangulationSource extends Poly_Triangulation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Reader(): RWMesh_TriangulationReader;

  SetReader(theReader: RWMesh_TriangulationReader): void;

  DegeneratedTriNb(): number;

  ChangeDegeneratedTriNb(): number;

  HasGeometry(): boolean;

  NbEdges(): number;

  Edge(theIndex: number): number;

  SetEdge(theIndex: number, theEdge: number): void;

  NbDeferredNodes(): number;

  SetNbDeferredNodes(theNbNodes: number): void;

  NbDeferredTriangles(): number;

  SetNbDeferredTriangles(theNbTris: number): void;

  InternalEdges(): NCollection_Array1_int;

  ResizeEdges(theNbEdges: number, theToCopyOld: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_VertexIterator: declare class RWMesh_VertexIterator extends RWMesh_ShapeIterator

  constructor

  More(): boolean;

  Next(): void;

  Vertex(): TopoDS_Vertex;

  Shape(): TopoDS_Shape;

  Point(): gp_Pnt;

  IsEmpty(): boolean;

  ElemLower(): number;

  ElemUpper(): number;

  NbNodes(): number;

  NodeLower(): number;

  NodeUpper(): number;

  node(argNo0: number): gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

RWMesh_CafReader_CafDocumentTools: interface RWMesh_CafReader_CafDocumentTools

  ShapeTool: XCAFDoc_ShapeTool

  ColorTool: XCAFDoc_ColorTool

  VisMaterialTool: XCAFDoc_VisMaterialTool

  ComponentMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher

  OriginalShapeMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher
