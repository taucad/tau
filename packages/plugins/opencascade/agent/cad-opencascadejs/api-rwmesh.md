# libcascade — RWMesh

16 top-level symbols. Signatures are verbatim typescript.

RWMesh: declare class RWMesh

  // RWMesh.constructor (constructor)
  constructor();

  // RWMesh.ReadNameAttribute (method)
  static ReadNameAttribute(theLabel: TDF_Label): TCollection_AsciiString;

  // RWMesh.FormatName (method)
  static FormatName(theFormat: RWMesh_NameFormat, theLabel: TDF_Label, theRefLabel: TDF_Label): TCollection_AsciiString;

  // RWMesh.delete (method)
  delete(): void;

  // RWMesh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_CafReader: declare class RWMesh_CafReader extends Standard_Transient

  // RWMesh_CafReader.get_type_name (method)
  static get_type_name(): string;

  // RWMesh_CafReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWMesh_CafReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWMesh_CafReader.Document (method)
  Document(): TDocStd_Document;

  // RWMesh_CafReader.SetDocument (method)
  SetDocument(theDoc: TDocStd_Document): void;

  // RWMesh_CafReader.RootPrefix (method)
  RootPrefix(): TCollection_AsciiString;

  // RWMesh_CafReader.SetRootPrefix (method)
  SetRootPrefix(theRootPrefix: TCollection_AsciiString): void;

  // RWMesh_CafReader.ToFillIncompleteDocument (method)
  ToFillIncompleteDocument(): boolean;

  // RWMesh_CafReader.SetFillIncompleteDocument (method)
  SetFillIncompleteDocument(theToFillIncomplete: boolean): void;

  // RWMesh_CafReader.MemoryLimitMiB (method)
  MemoryLimitMiB(): number;

  // RWMesh_CafReader.SetMemoryLimitMiB (method)
  SetMemoryLimitMiB(theLimitMiB: number): void;

  // RWMesh_CafReader.CoordinateSystemConverter (method)
  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWMesh_CafReader.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  // RWMesh_CafReader.SystemLengthUnit (method)
  SystemLengthUnit(): number;

  // RWMesh_CafReader.SetSystemLengthUnit (method)
  SetSystemLengthUnit(theUnits: number): void;

  // RWMesh_CafReader.HasSystemCoordinateSystem (method)
  HasSystemCoordinateSystem(): boolean;

  // RWMesh_CafReader.SystemCoordinateSystem (method)
  SystemCoordinateSystem(): gp_Ax3;

  // RWMesh_CafReader.SetSystemCoordinateSystem (method)
  SetSystemCoordinateSystem(theCS: gp_Ax3): void;
  SetSystemCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;

  // RWMesh_CafReader.FileLengthUnit (method)
  FileLengthUnit(): number;

  // RWMesh_CafReader.SetFileLengthUnit (method)
  SetFileLengthUnit(theUnits: number): void;

  // RWMesh_CafReader.HasFileCoordinateSystem (method)
  HasFileCoordinateSystem(): boolean;

  // RWMesh_CafReader.FileCoordinateSystem (method)
  FileCoordinateSystem(): gp_Ax3;

  // RWMesh_CafReader.SetFileCoordinateSystem (method)
  SetFileCoordinateSystem(theCS: gp_Ax3): void;
  SetFileCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;

  // RWMesh_CafReader.Perform (method)
  Perform(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  // RWMesh_CafReader.ExtraStatus (method)
  ExtraStatus(): number;

  // RWMesh_CafReader.SingleShape (method)
  SingleShape(): TopoDS_Shape;

  // RWMesh_CafReader.ExternalFiles (method)
  ExternalFiles(): NCollection_IndexedMap_TCollection_AsciiString;

  // RWMesh_CafReader.Metadata (method)
  Metadata(): any;

  // RWMesh_CafReader.ProbeHeader (method)
  ProbeHeader(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  // RWMesh_CafReader.delete (method)
  delete(): void;

  // RWMesh_CafReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_CafReaderStatusEx: typeof RWMesh_CafReaderStatusEx[keyof typeof RWMesh_CafReaderStatusEx]

  readonly RWMesh_CafReaderStatusEx_NONE: 'RWMesh_CafReaderStatusEx_NONE'

  readonly RWMesh_CafReaderStatusEx_Partial: 'RWMesh_CafReaderStatusEx_Partial'

RWMesh_CoordinateSystem: typeof RWMesh_CoordinateSystem[keyof typeof RWMesh_CoordinateSystem]

  readonly RWMesh_CoordinateSystem_Undefined: 'RWMesh_CoordinateSystem_Undefined'

  readonly RWMesh_CoordinateSystem_posYfwd_posZup: 'RWMesh_CoordinateSystem_posYfwd_posZup'

  readonly RWMesh_CoordinateSystem_negZfwd_posYup: 'RWMesh_CoordinateSystem_negZfwd_posYup'

  readonly RWMesh_CoordinateSystem_Blender: 'RWMesh_CoordinateSystem_Blender'

  readonly RWMesh_CoordinateSystem_glTF: 'RWMesh_CoordinateSystem_glTF'

  readonly RWMesh_CoordinateSystem_Zup: 'RWMesh_CoordinateSystem_Zup'

  readonly RWMesh_CoordinateSystem_Yup: 'RWMesh_CoordinateSystem_Yup'

RWMesh_CoordinateSystemConverter: declare class RWMesh_CoordinateSystemConverter

  // RWMesh_CoordinateSystemConverter.constructor (constructor)
  constructor();

  // RWMesh_CoordinateSystemConverter.StandardCoordinateSystem (method)
  static StandardCoordinateSystem(theSys: RWMesh_CoordinateSystem): gp_Ax3;

  // RWMesh_CoordinateSystemConverter.IsEmpty (method)
  IsEmpty(): boolean;

  // RWMesh_CoordinateSystemConverter.InputLengthUnit (method)
  InputLengthUnit(): number;

  // RWMesh_CoordinateSystemConverter.SetInputLengthUnit (method)
  SetInputLengthUnit(theInputScale: number): void;

  // RWMesh_CoordinateSystemConverter.OutputLengthUnit (method)
  OutputLengthUnit(): number;

  // RWMesh_CoordinateSystemConverter.SetOutputLengthUnit (method)
  SetOutputLengthUnit(theOutputScale: number): void;

  // RWMesh_CoordinateSystemConverter.HasInputCoordinateSystem (method)
  HasInputCoordinateSystem(): boolean;

  // RWMesh_CoordinateSystemConverter.InputCoordinateSystem (method)
  InputCoordinateSystem(): gp_Ax3;

  // RWMesh_CoordinateSystemConverter.SetInputCoordinateSystem (method)
  SetInputCoordinateSystem(theSysFrom: gp_Ax3): void;
  SetInputCoordinateSystem(theSysFrom: RWMesh_CoordinateSystem): void;

  // RWMesh_CoordinateSystemConverter.HasOutputCoordinateSystem (method)
  HasOutputCoordinateSystem(): boolean;

  // RWMesh_CoordinateSystemConverter.OutputCoordinateSystem (method)
  OutputCoordinateSystem(): gp_Ax3;

  // RWMesh_CoordinateSystemConverter.SetOutputCoordinateSystem (method)
  SetOutputCoordinateSystem(theSysTo: gp_Ax3): void;
  SetOutputCoordinateSystem(theSysTo: RWMesh_CoordinateSystem): void;

  // RWMesh_CoordinateSystemConverter.Init (method)
  Init(theInputSystem: gp_Ax3, theInputLengthUnit: number, theOutputSystem: gp_Ax3, theOutputLengthUnit: number): void;

  // RWMesh_CoordinateSystemConverter.TransformTransformation (method)
  TransformTransformation(theTrsf: gp_Trsf): void;

  // RWMesh_CoordinateSystemConverter.TransformPosition (method)
  TransformPosition(thePos: gp_XYZ): void;

  // RWMesh_CoordinateSystemConverter.delete (method)
  delete(): void;

  // RWMesh_CoordinateSystemConverter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_EdgeIterator: declare class RWMesh_EdgeIterator extends RWMesh_ShapeIterator

  // RWMesh_EdgeIterator.constructor (constructor)
  constructor(theShape: TopoDS_Shape, theStyle?: XCAFPrs_Style);
  constructor(theLabel: TDF_Label, theLocation: TopLoc_Location, theToMapColors?: boolean, theStyle?: XCAFPrs_Style);

  // RWMesh_EdgeIterator.More (method)
  More(): boolean;

  // RWMesh_EdgeIterator.Next (method)
  Next(): void;

  // RWMesh_EdgeIterator.Edge (method)
  Edge(): TopoDS_Edge;

  // RWMesh_EdgeIterator.Shape (method)
  Shape(): TopoDS_Shape;

  // RWMesh_EdgeIterator.Polygon3D (method)
  Polygon3D(): Poly_Polygon3D;

  // RWMesh_EdgeIterator.IsEmpty (method)
  IsEmpty(): boolean;

  // RWMesh_EdgeIterator.ElemLower (method)
  ElemLower(): number;

  // RWMesh_EdgeIterator.ElemUpper (method)
  ElemUpper(): number;

  // RWMesh_EdgeIterator.NbNodes (method)
  NbNodes(): number;

  // RWMesh_EdgeIterator.NodeLower (method)
  NodeLower(): number;

  // RWMesh_EdgeIterator.NodeUpper (method)
  NodeUpper(): number;

  // RWMesh_EdgeIterator.node (method)
  node(theNode: number): gp_Pnt;

  // RWMesh_EdgeIterator.delete (method)
  delete(): void;

  // RWMesh_EdgeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_FaceIterator: declare class RWMesh_FaceIterator extends RWMesh_ShapeIterator

  // RWMesh_FaceIterator.constructor (constructor)
  constructor(theShape: TopoDS_Shape, theStyle?: XCAFPrs_Style);
  constructor(theLabel: TDF_Label, theLocation: TopLoc_Location, theToMapColors?: boolean, theStyle?: XCAFPrs_Style);

  // RWMesh_FaceIterator.More (method)
  More(): boolean;

  // RWMesh_FaceIterator.Next (method)
  Next(): void;

  // RWMesh_FaceIterator.Face (method)
  Face(): TopoDS_Face;

  // RWMesh_FaceIterator.Shape (method)
  Shape(): TopoDS_Shape;

  // RWMesh_FaceIterator.Triangulation (method)
  Triangulation(): Poly_Triangulation;

  // RWMesh_FaceIterator.IsEmptyMesh (method)
  IsEmptyMesh(): boolean;

  // RWMesh_FaceIterator.IsEmpty (method)
  IsEmpty(): boolean;

  // RWMesh_FaceIterator.FaceStyle (method)
  FaceStyle(): XCAFPrs_Style;

  // RWMesh_FaceIterator.HasFaceColor (method)
  HasFaceColor(): boolean;

  // RWMesh_FaceIterator.FaceColor (method)
  FaceColor(): Quantity_ColorRGBA;

  // RWMesh_FaceIterator.NbTriangles (method)
  NbTriangles(): number;

  // RWMesh_FaceIterator.ElemLower (method)
  ElemLower(): number;

  // RWMesh_FaceIterator.ElemUpper (method)
  ElemUpper(): number;

  // RWMesh_FaceIterator.TriangleOriented (method)
  TriangleOriented(theElemIndex: number): Poly_Triangle;

  // RWMesh_FaceIterator.HasNormals (method)
  HasNormals(): boolean;

  // RWMesh_FaceIterator.HasTexCoords (method)
  HasTexCoords(): boolean;

  // RWMesh_FaceIterator.NormalTransformed (method)
  NormalTransformed(theNode: number): gp_Dir;

  // RWMesh_FaceIterator.NbNodes (method)
  NbNodes(): number;

  // RWMesh_FaceIterator.NodeLower (method)
  NodeLower(): number;

  // RWMesh_FaceIterator.NodeUpper (method)
  NodeUpper(): number;

  // RWMesh_FaceIterator.NodeTexCoord (method)
  NodeTexCoord(theNode: number): gp_Pnt2d;

  // RWMesh_FaceIterator.node (method)
  node(theNode: number): gp_Pnt;

  // RWMesh_FaceIterator.normal (method)
  normal(theNode: number): gp_Dir;

  // RWMesh_FaceIterator.triangle (method)
  triangle(theElemIndex: number): Poly_Triangle;

  // RWMesh_FaceIterator.delete (method)
  delete(): void;

  // RWMesh_FaceIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_MaterialMap: declare class RWMesh_MaterialMap extends Standard_Transient

  // RWMesh_MaterialMap.get_type_name (method)
  static get_type_name(): string;

  // RWMesh_MaterialMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWMesh_MaterialMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWMesh_MaterialMap.DefaultStyle (method)
  DefaultStyle(): XCAFPrs_Style;

  // RWMesh_MaterialMap.SetDefaultStyle (method)
  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  // RWMesh_MaterialMap.FindMaterial (method)
  FindMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  // RWMesh_MaterialMap.AddMaterial (method)
  AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  // RWMesh_MaterialMap.CreateTextureFolder (method)
  CreateTextureFolder(): boolean;

  // RWMesh_MaterialMap.DefineMaterial (method)
  DefineMaterial(theStyle: XCAFPrs_Style, theKey: TCollection_AsciiString, theName: TCollection_AsciiString): void;

  // RWMesh_MaterialMap.IsFailed (method)
  IsFailed(): boolean;

  // RWMesh_MaterialMap.delete (method)
  delete(): void;

  // RWMesh_MaterialMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_NameFormat: typeof RWMesh_NameFormat[keyof typeof RWMesh_NameFormat]

  readonly RWMesh_NameFormat_Empty: 'RWMesh_NameFormat_Empty'

  readonly RWMesh_NameFormat_Product: 'RWMesh_NameFormat_Product'

  readonly RWMesh_NameFormat_Instance: 'RWMesh_NameFormat_Instance'

  readonly RWMesh_NameFormat_InstanceOrProduct: 'RWMesh_NameFormat_InstanceOrProduct'

  readonly RWMesh_NameFormat_ProductOrInstance: 'RWMesh_NameFormat_ProductOrInstance'

  readonly RWMesh_NameFormat_ProductAndInstance: 'RWMesh_NameFormat_ProductAndInstance'

  readonly RWMesh_NameFormat_ProductAndInstanceAndOcaf: 'RWMesh_NameFormat_ProductAndInstanceAndOcaf'

RWMesh_NodeAttributes: declare class RWMesh_NodeAttributes

  // RWMesh_NodeAttributes.constructor (constructor)
  constructor();

  Name: TCollection_AsciiString

  RawName: TCollection_AsciiString

  NamedData: TDataStd_NamedData

  Style: XCAFPrs_Style

  // RWMesh_NodeAttributes.delete (method)
  delete(): void;

  // RWMesh_NodeAttributes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_ShapeIterator: declare class RWMesh_ShapeIterator

  // RWMesh_ShapeIterator.ExploredShape (method)
  ExploredShape(): TopoDS_Shape;

  // RWMesh_ShapeIterator.Shape (method)
  Shape(): TopoDS_Shape;

  // RWMesh_ShapeIterator.More (method)
  More(): boolean;

  // RWMesh_ShapeIterator.Next (method)
  Next(): void;

  // RWMesh_ShapeIterator.IsEmpty (method)
  IsEmpty(): boolean;

  // RWMesh_ShapeIterator.Style (method)
  Style(): XCAFPrs_Style;

  // RWMesh_ShapeIterator.HasColor (method)
  HasColor(): boolean;

  // RWMesh_ShapeIterator.Color (method)
  Color(): Quantity_ColorRGBA;

  // RWMesh_ShapeIterator.ElemLower (method)
  ElemLower(): number;

  // RWMesh_ShapeIterator.ElemUpper (method)
  ElemUpper(): number;

  // RWMesh_ShapeIterator.NbNodes (method)
  NbNodes(): number;

  // RWMesh_ShapeIterator.NodeLower (method)
  NodeLower(): number;

  // RWMesh_ShapeIterator.NodeUpper (method)
  NodeUpper(): number;

  // RWMesh_ShapeIterator.NodeTransformed (method)
  NodeTransformed(theNode: number): gp_Pnt;

  // RWMesh_ShapeIterator.delete (method)
  delete(): void;

  // RWMesh_ShapeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_TriangulationReader: declare class RWMesh_TriangulationReader extends Standard_Transient

  // RWMesh_TriangulationReader.get_type_name (method)
  static get_type_name(): string;

  // RWMesh_TriangulationReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWMesh_TriangulationReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWMesh_TriangulationReader.FileName (method)
  FileName(): TCollection_AsciiString;

  // RWMesh_TriangulationReader.SetFileName (method)
  SetFileName(theFileName: TCollection_AsciiString): void;

  // RWMesh_TriangulationReader.CoordinateSystemConverter (method)
  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWMesh_TriangulationReader.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  // RWMesh_TriangulationReader.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // RWMesh_TriangulationReader.SetDoublePrecision (method)
  SetDoublePrecision(theIsDouble: boolean): void;

  // RWMesh_TriangulationReader.ToSkipDegenerates (method)
  ToSkipDegenerates(): boolean;

  // RWMesh_TriangulationReader.SetToSkipDegenerates (method)
  SetToSkipDegenerates(theToSkip: boolean): void;

  // RWMesh_TriangulationReader.ToPrintDebugMessages (method)
  ToPrintDebugMessages(): boolean;

  // RWMesh_TriangulationReader.SetToPrintDebugMessages (method)
  SetToPrintDebugMessages(theToPrint: boolean): void;

  // RWMesh_TriangulationReader.StartStatistic (method)
  StartStatistic(): void;

  // RWMesh_TriangulationReader.StopStatistic (method)
  StopStatistic(): void;

  // RWMesh_TriangulationReader.PrintStatistic (method)
  PrintStatistic(): void;

  // RWMesh_TriangulationReader.delete (method)
  delete(): void;

  // RWMesh_TriangulationReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_TriangulationReader_LoadingStatistic: declare class RWMesh_TriangulationReader_LoadingStatistic

  // RWMesh_TriangulationReader_LoadingStatistic.constructor (constructor)
  constructor();

  ExpectedNodesNb: number

  LoadedNodesNb: number

  ExpectedTrianglesNb: number

  DegeneratedTrianglesNb: number

  LoadedTrianglesNb: number

  // RWMesh_TriangulationReader_LoadingStatistic.Reset (method)
  Reset(): void;

  // RWMesh_TriangulationReader_LoadingStatistic.PrintStatistic (method)
  PrintStatistic(thePrefix?: TCollection_AsciiString): void;

  // RWMesh_TriangulationReader_LoadingStatistic.delete (method)
  delete(): void;

  // RWMesh_TriangulationReader_LoadingStatistic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_TriangulationSource: declare class RWMesh_TriangulationSource extends Poly_Triangulation

  // RWMesh_TriangulationSource.constructor (constructor)
  constructor();

  // RWMesh_TriangulationSource.get_type_name (method)
  static get_type_name(): string;

  // RWMesh_TriangulationSource.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWMesh_TriangulationSource.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWMesh_TriangulationSource.Reader (method)
  Reader(): RWMesh_TriangulationReader;

  // RWMesh_TriangulationSource.SetReader (method)
  SetReader(theReader: RWMesh_TriangulationReader): void;

  // RWMesh_TriangulationSource.DegeneratedTriNb (method)
  DegeneratedTriNb(): number;

  // RWMesh_TriangulationSource.ChangeDegeneratedTriNb (method)
  ChangeDegeneratedTriNb(): number;

  // RWMesh_TriangulationSource.HasGeometry (method)
  HasGeometry(): boolean;

  // RWMesh_TriangulationSource.NbEdges (method)
  NbEdges(): number;

  // RWMesh_TriangulationSource.Edge (method)
  Edge(theIndex: number): number;

  // RWMesh_TriangulationSource.SetEdge (method)
  SetEdge(theIndex: number, theEdge: number): void;

  // RWMesh_TriangulationSource.NbDeferredNodes (method)
  NbDeferredNodes(): number;

  // RWMesh_TriangulationSource.SetNbDeferredNodes (method)
  SetNbDeferredNodes(theNbNodes: number): void;

  // RWMesh_TriangulationSource.NbDeferredTriangles (method)
  NbDeferredTriangles(): number;

  // RWMesh_TriangulationSource.SetNbDeferredTriangles (method)
  SetNbDeferredTriangles(theNbTris: number): void;

  // RWMesh_TriangulationSource.InternalEdges (method)
  InternalEdges(): NCollection_Array1_int;

  // RWMesh_TriangulationSource.ResizeEdges (method)
  ResizeEdges(theNbEdges: number, theToCopyOld: boolean): void;

  // RWMesh_TriangulationSource.delete (method)
  delete(): void;

  // RWMesh_TriangulationSource.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_VertexIterator: declare class RWMesh_VertexIterator extends RWMesh_ShapeIterator

  // RWMesh_VertexIterator.constructor (constructor)
  constructor(theShape: TopoDS_Shape, theStyle?: XCAFPrs_Style);
  constructor(theLabel: TDF_Label, theLocation: TopLoc_Location, theToMapColors?: boolean, theStyle?: XCAFPrs_Style);

  // RWMesh_VertexIterator.More (method)
  More(): boolean;

  // RWMesh_VertexIterator.Next (method)
  Next(): void;

  // RWMesh_VertexIterator.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // RWMesh_VertexIterator.Shape (method)
  Shape(): TopoDS_Shape;

  // RWMesh_VertexIterator.Point (method)
  Point(): gp_Pnt;

  // RWMesh_VertexIterator.IsEmpty (method)
  IsEmpty(): boolean;

  // RWMesh_VertexIterator.ElemLower (method)
  ElemLower(): number;

  // RWMesh_VertexIterator.ElemUpper (method)
  ElemUpper(): number;

  // RWMesh_VertexIterator.NbNodes (method)
  NbNodes(): number;

  // RWMesh_VertexIterator.NodeLower (method)
  NodeLower(): number;

  // RWMesh_VertexIterator.NodeUpper (method)
  NodeUpper(): number;

  // RWMesh_VertexIterator.node (method)
  node(argNo0: number): gp_Pnt;

  // RWMesh_VertexIterator.delete (method)
  delete(): void;

  // RWMesh_VertexIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWMesh_CafReader_CafDocumentTools: interface RWMesh_CafReader_CafDocumentTools

  ShapeTool: XCAFDoc_ShapeTool

  ColorTool: XCAFDoc_ColorTool

  VisMaterialTool: XCAFDoc_VisMaterialTool

  ComponentMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher

  OriginalShapeMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher
