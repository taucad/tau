# libcascade — RWObj

12 top-level symbols. Signatures are verbatim typescript.

RWObj: declare class RWObj

  // RWObj.constructor (constructor)
  constructor();

  // RWObj.ReadFile (method)
  static ReadFile(theFile: string, aProgress?: Message_ProgressRange): Poly_Triangulation;

  // RWObj.delete (method)
  delete(): void;

  // RWObj.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_CafReader: declare class RWObj_CafReader extends RWMesh_CafReader

  // RWObj_CafReader.constructor (constructor)
  constructor();

  // RWObj_CafReader.get_type_name (method)
  static get_type_name(): string;

  // RWObj_CafReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWObj_CafReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWObj_CafReader.IsSinglePrecision (method)
  IsSinglePrecision(): boolean;

  // RWObj_CafReader.SetSinglePrecision (method)
  SetSinglePrecision(theIsSinglePrecision: boolean): void;

  // RWObj_CafReader.delete (method)
  delete(): void;

  // RWObj_CafReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_CafWriter: declare class RWObj_CafWriter extends Standard_Transient

  // RWObj_CafWriter.constructor (constructor)
  constructor(theFile: TCollection_AsciiString);

  // RWObj_CafWriter.get_type_name (method)
  static get_type_name(): string;

  // RWObj_CafWriter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWObj_CafWriter.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWObj_CafWriter.CoordinateSystemConverter (method)
  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWObj_CafWriter.ChangeCoordinateSystemConverter (method)
  ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWObj_CafWriter.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  // RWObj_CafWriter.DefaultStyle (method)
  DefaultStyle(): XCAFPrs_Style;

  // RWObj_CafWriter.SetDefaultStyle (method)
  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  // RWObj_CafWriter.Perform (method)
  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;

  // RWObj_CafWriter.delete (method)
  delete(): void;

  // RWObj_CafWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_Material: declare class RWObj_Material

  // RWObj_Material.constructor (constructor)
  constructor();

  Name: TCollection_AsciiString

  DiffuseTexture: TCollection_AsciiString

  SpecularTexture: TCollection_AsciiString

  BumpTexture: TCollection_AsciiString

  AmbientColor: Quantity_Color

  DiffuseColor: Quantity_Color

  SpecularColor: Quantity_Color

  Shininess: number

  Transparency: number

  // RWObj_Material.delete (method)
  delete(): void;

  // RWObj_Material.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_MtlReader: declare class RWObj_MtlReader

  // RWObj_MtlReader.constructor (constructor)
  constructor(theMaterials: NCollection_DataMap_TCollection_AsciiString_RWObj_Material);

  // RWObj_MtlReader.Read (method)
  Read(theFolder: TCollection_AsciiString, theFile: TCollection_AsciiString): boolean;

  // RWObj_MtlReader.delete (method)
  delete(): void;

  // RWObj_MtlReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_ObjMaterialMap: declare class RWObj_ObjMaterialMap extends RWMesh_MaterialMap

  // RWObj_ObjMaterialMap.constructor (constructor)
  constructor(theFile: TCollection_AsciiString);

  // RWObj_ObjMaterialMap.get_type_name (method)
  static get_type_name(): string;

  // RWObj_ObjMaterialMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWObj_ObjMaterialMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWObj_ObjMaterialMap.AddMaterial (method)
  AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  // RWObj_ObjMaterialMap.DefineMaterial (method)
  DefineMaterial(theStyle: XCAFPrs_Style, theKey: TCollection_AsciiString, theName: TCollection_AsciiString): void;

  // RWObj_ObjMaterialMap.delete (method)
  delete(): void;

  // RWObj_ObjMaterialMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_ObjWriterContext: declare class RWObj_ObjWriterContext

  // RWObj_ObjWriterContext.constructor (constructor)
  constructor(theName: TCollection_AsciiString);

  NbFaces: number

  // RWObj_ObjWriterContext.IsOpened (method)
  IsOpened(): boolean;

  // RWObj_ObjWriterContext.Close (method)
  Close(): boolean;

  // RWObj_ObjWriterContext.HasNormals (method)
  HasNormals(): boolean;

  // RWObj_ObjWriterContext.SetNormals (method)
  SetNormals(theHasNormals: boolean): void;

  // RWObj_ObjWriterContext.HasTexCoords (method)
  HasTexCoords(): boolean;

  // RWObj_ObjWriterContext.SetTexCoords (method)
  SetTexCoords(theHasTexCoords: boolean): void;

  // RWObj_ObjWriterContext.WriteHeader (method)
  WriteHeader(theNbNodes: number, theNbElems: number, theMatLib: TCollection_AsciiString, theFileInfo: any): boolean;

  // RWObj_ObjWriterContext.ActiveMaterial (method)
  ActiveMaterial(): TCollection_AsciiString;

  // RWObj_ObjWriterContext.WriteActiveMaterial (method)
  WriteActiveMaterial(theMaterial: TCollection_AsciiString): boolean;

  // RWObj_ObjWriterContext.WriteGroup (method)
  WriteGroup(theValue: TCollection_AsciiString): boolean;

  // RWObj_ObjWriterContext.FlushFace (method)
  FlushFace(theNbNodes: number): void;

  // RWObj_ObjWriterContext.delete (method)
  delete(): void;

  // RWObj_ObjWriterContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_Reader: declare class RWObj_Reader extends Standard_Transient

  // RWObj_Reader.get_type_name (method)
  static get_type_name(): string;

  // RWObj_Reader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWObj_Reader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWObj_Reader.Read (method)
  Read(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  // RWObj_Reader.Probe (method)
  Probe(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  // RWObj_Reader.FileComments (method)
  FileComments(): TCollection_AsciiString;

  // RWObj_Reader.ExternalFiles (method)
  ExternalFiles(): NCollection_IndexedMap_TCollection_AsciiString;

  // RWObj_Reader.NbProbeNodes (method)
  NbProbeNodes(): number;

  // RWObj_Reader.NbProbeElems (method)
  NbProbeElems(): number;

  // RWObj_Reader.MemoryLimit (method)
  MemoryLimit(): number;

  // RWObj_Reader.SetMemoryLimit (method)
  SetMemoryLimit(theMemLimit: number): void;

  // RWObj_Reader.Transformation (method)
  Transformation(): RWMesh_CoordinateSystemConverter;

  // RWObj_Reader.SetTransformation (method)
  SetTransformation(theCSConverter: RWMesh_CoordinateSystemConverter): void;

  // RWObj_Reader.IsSinglePrecision (method)
  IsSinglePrecision(): boolean;

  // RWObj_Reader.SetSinglePrecision (method)
  SetSinglePrecision(theIsSinglePrecision: boolean): void;

  // RWObj_Reader.delete (method)
  delete(): void;

  // RWObj_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_SubMesh: declare class RWObj_SubMesh

  // RWObj_SubMesh.constructor (constructor)
  constructor();

  Object: TCollection_AsciiString

  Group: TCollection_AsciiString

  SmoothGroup: TCollection_AsciiString

  Material: TCollection_AsciiString

  // RWObj_SubMesh.delete (method)
  delete(): void;

  // RWObj_SubMesh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_SubMeshReason: typeof RWObj_SubMeshReason[keyof typeof RWObj_SubMeshReason]

  readonly RWObj_SubMeshReason_NewObject: 'RWObj_SubMeshReason_NewObject'

  readonly RWObj_SubMeshReason_NewGroup: 'RWObj_SubMeshReason_NewGroup'

  readonly RWObj_SubMeshReason_NewMaterial: 'RWObj_SubMeshReason_NewMaterial'

  readonly RWObj_SubMeshReason_NewSmoothGroup: 'RWObj_SubMeshReason_NewSmoothGroup'

RWObj_IShapeReceiver: declare class RWObj_IShapeReceiver

  // RWObj_IShapeReceiver.BindNamedShape (method)
  BindNamedShape(theShape: TopoDS_Shape, theName: TCollection_AsciiString, theMaterial: RWObj_Material, theIsRootShape: boolean): void;

  // RWObj_IShapeReceiver.delete (method)
  delete(): void;

  // RWObj_IShapeReceiver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWObj_TriangulationReader: declare class RWObj_TriangulationReader extends RWObj_Reader

  // RWObj_TriangulationReader.constructor (constructor)
  constructor();

  // RWObj_TriangulationReader.get_type_name (method)
  static get_type_name(): string;

  // RWObj_TriangulationReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWObj_TriangulationReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWObj_TriangulationReader.SetCreateShapes (method)
  SetCreateShapes(theToCreateShapes: boolean): void;

  // RWObj_TriangulationReader.SetShapeReceiver (method)
  SetShapeReceiver(theReceiver: RWObj_IShapeReceiver): void;

  // RWObj_TriangulationReader.GetTriangulation (method)
  GetTriangulation(): Poly_Triangulation;

  // RWObj_TriangulationReader.ResultShape (method)
  ResultShape(): TopoDS_Shape;

  // RWObj_TriangulationReader.delete (method)
  delete(): void;

  // RWObj_TriangulationReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
