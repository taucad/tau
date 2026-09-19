# libcascade — RWObj

12 top-level symbols. Signatures are verbatim typescript.

RWObj: declare class RWObj

  constructor

  static ReadFile(theFile: string, aProgress?: Message_ProgressRange): Poly_Triangulation;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_CafReader: declare class RWObj_CafReader extends RWMesh_CafReader

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  IsSinglePrecision(): boolean;

  SetSinglePrecision(theIsSinglePrecision: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_CafWriter: declare class RWObj_CafWriter extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  DefaultStyle(): XCAFPrs_Style;

  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_Material: declare class RWObj_Material

  constructor

  Name: TCollection_AsciiString

  DiffuseTexture: TCollection_AsciiString

  SpecularTexture: TCollection_AsciiString

  BumpTexture: TCollection_AsciiString

  AmbientColor: Quantity_Color

  DiffuseColor: Quantity_Color

  SpecularColor: Quantity_Color

  Shininess: number

  Transparency: number

  delete(): void;

  [Symbol.dispose](): void;

RWObj_MtlReader: declare class RWObj_MtlReader

  constructor

  Read(theFolder: TCollection_AsciiString, theFile: TCollection_AsciiString): boolean;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_ObjMaterialMap: declare class RWObj_ObjMaterialMap extends RWMesh_MaterialMap

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  DefineMaterial(theStyle: XCAFPrs_Style, theKey: TCollection_AsciiString, theName: TCollection_AsciiString): void;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_ObjWriterContext: declare class RWObj_ObjWriterContext

  constructor

  NbFaces: number

  IsOpened(): boolean;

  Close(): boolean;

  HasNormals(): boolean;

  SetNormals(theHasNormals: boolean): void;

  HasTexCoords(): boolean;

  SetTexCoords(theHasTexCoords: boolean): void;

  WriteHeader(theNbNodes: number, theNbElems: number, theMatLib: TCollection_AsciiString, theFileInfo: any): boolean;

  ActiveMaterial(): TCollection_AsciiString;

  WriteActiveMaterial(theMaterial: TCollection_AsciiString): boolean;

  WriteGroup(theValue: TCollection_AsciiString): boolean;

  FlushFace(theNbNodes: number): void;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_Reader: declare class RWObj_Reader extends Standard_Transient

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Read(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  Probe(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

  FileComments(): TCollection_AsciiString;

  ExternalFiles(): NCollection_IndexedMap_TCollection_AsciiString;

  NbProbeNodes(): number;

  NbProbeElems(): number;

  MemoryLimit(): number;

  SetMemoryLimit(theMemLimit: number): void;

  Transformation(): RWMesh_CoordinateSystemConverter;

  SetTransformation(theCSConverter: RWMesh_CoordinateSystemConverter): void;

  IsSinglePrecision(): boolean;

  SetSinglePrecision(theIsSinglePrecision: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_SubMesh: declare class RWObj_SubMesh

  constructor

  Object: TCollection_AsciiString

  Group: TCollection_AsciiString

  SmoothGroup: TCollection_AsciiString

  Material: TCollection_AsciiString

  delete(): void;

  [Symbol.dispose](): void;

RWObj_SubMeshReason: typeof RWObj_SubMeshReason[keyof typeof RWObj_SubMeshReason]

RWObj_IShapeReceiver: declare class RWObj_IShapeReceiver

  BindNamedShape(theShape: TopoDS_Shape, theName: TCollection_AsciiString, theMaterial: RWObj_Material, theIsRootShape: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

RWObj_TriangulationReader: declare class RWObj_TriangulationReader extends RWObj_Reader

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  SetCreateShapes(theToCreateShapes: boolean): void;

  SetShapeReceiver(theReceiver: RWObj_IShapeReceiver): void;

  GetTriangulation(): Poly_Triangulation;

  ResultShape(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;
