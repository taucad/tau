# libcascade — RWPly

2 top-level symbols. Signatures are verbatim typescript.

RWPly_CafWriter: declare class RWPly_CafWriter extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  DefaultStyle(): XCAFPrs_Style;

  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  IsDoublePrecision(): boolean;

  SetDoublePrecision(theDoublePrec: boolean): void;

  HasNormals(): boolean;

  SetNormals(theHasNormals: boolean): void;

  HasTexCoords(): boolean;

  SetTexCoords(theHasTexCoords: boolean): void;

  HasColors(): boolean;

  SetColors(theToWrite: boolean): void;

  HasPartId(): boolean;

  SetPartId(theSurfId: boolean): void;

  HasFaceId(): boolean;

  SetFaceId(theSurfId: boolean): void;

  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;

  delete(): void;

  [Symbol.dispose](): void;

RWPly_PlyWriterContext: declare class RWPly_PlyWriterContext

  constructor

  IsDoublePrecision(): boolean;

  SetDoublePrecision(theDoublePrec: boolean): void;

  HasNormals(): boolean;

  SetNormals(theHasNormals: boolean): void;

  HasTexCoords(): boolean;

  SetTexCoords(theHasTexCoords: boolean): void;

  HasColors(): boolean;

  SetColors(theToWrite: boolean): void;

  HasSurfaceId(): boolean;

  SetSurfaceId(theSurfId: boolean): void;
  SetSurfaceId(theSurfId: number): void;
  SetSurfaceId(theSurfId: boolean): void;
  SetSurfaceId(theSurfId: number): void;

  IsOpened(): boolean;

  WriteHeader(theNbNodes: number, theNbElems: number, theFileInfo: any): boolean;

  NbWrittenVertices(): number;

  VertexOffset(): number;

  SetVertexOffset(theOffset: number): void;

  SurfaceId(): number;

  NbWrittenElements(): number;

  Close(theIsAborted?: boolean): boolean;

  delete(): void;

  [Symbol.dispose](): void;
