# libcascade — RWPly

2 top-level symbols. Signatures are verbatim typescript.

RWPly_CafWriter: declare class RWPly_CafWriter extends Standard_Transient

  // RWPly_CafWriter.constructor (constructor)
  constructor(theFile: TCollection_AsciiString);

  // RWPly_CafWriter.get_type_name (method)
  static get_type_name(): string;

  // RWPly_CafWriter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWPly_CafWriter.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWPly_CafWriter.CoordinateSystemConverter (method)
  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWPly_CafWriter.ChangeCoordinateSystemConverter (method)
  ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWPly_CafWriter.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  // RWPly_CafWriter.DefaultStyle (method)
  DefaultStyle(): XCAFPrs_Style;

  // RWPly_CafWriter.SetDefaultStyle (method)
  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  // RWPly_CafWriter.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // RWPly_CafWriter.SetDoublePrecision (method)
  SetDoublePrecision(theDoublePrec: boolean): void;

  // RWPly_CafWriter.HasNormals (method)
  HasNormals(): boolean;

  // RWPly_CafWriter.SetNormals (method)
  SetNormals(theHasNormals: boolean): void;

  // RWPly_CafWriter.HasTexCoords (method)
  HasTexCoords(): boolean;

  // RWPly_CafWriter.SetTexCoords (method)
  SetTexCoords(theHasTexCoords: boolean): void;

  // RWPly_CafWriter.HasColors (method)
  HasColors(): boolean;

  // RWPly_CafWriter.SetColors (method)
  SetColors(theToWrite: boolean): void;

  // RWPly_CafWriter.HasPartId (method)
  HasPartId(): boolean;

  // RWPly_CafWriter.SetPartId (method)
  SetPartId(theSurfId: boolean): void;

  // RWPly_CafWriter.HasFaceId (method)
  HasFaceId(): boolean;

  // RWPly_CafWriter.SetFaceId (method)
  SetFaceId(theSurfId: boolean): void;

  // RWPly_CafWriter.Perform (method)
  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;

  // RWPly_CafWriter.delete (method)
  delete(): void;

  // RWPly_CafWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWPly_PlyWriterContext: declare class RWPly_PlyWriterContext

  // RWPly_PlyWriterContext.constructor (constructor)
  constructor();

  // RWPly_PlyWriterContext.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // RWPly_PlyWriterContext.SetDoublePrecision (method)
  SetDoublePrecision(theDoublePrec: boolean): void;

  // RWPly_PlyWriterContext.HasNormals (method)
  HasNormals(): boolean;

  // RWPly_PlyWriterContext.SetNormals (method)
  SetNormals(theHasNormals: boolean): void;

  // RWPly_PlyWriterContext.HasTexCoords (method)
  HasTexCoords(): boolean;

  // RWPly_PlyWriterContext.SetTexCoords (method)
  SetTexCoords(theHasTexCoords: boolean): void;

  // RWPly_PlyWriterContext.HasColors (method)
  HasColors(): boolean;

  // RWPly_PlyWriterContext.SetColors (method)
  SetColors(theToWrite: boolean): void;

  // RWPly_PlyWriterContext.HasSurfaceId (method)
  HasSurfaceId(): boolean;

  // RWPly_PlyWriterContext.SetSurfaceId (method)
  SetSurfaceId(theSurfId: boolean): void;
  SetSurfaceId(theSurfId: number): void;

  // RWPly_PlyWriterContext.IsOpened (method)
  IsOpened(): boolean;

  // RWPly_PlyWriterContext.WriteHeader (method)
  WriteHeader(theNbNodes: number, theNbElems: number, theFileInfo: any): boolean;

  // RWPly_PlyWriterContext.NbWrittenVertices (method)
  NbWrittenVertices(): number;

  // RWPly_PlyWriterContext.VertexOffset (method)
  VertexOffset(): number;

  // RWPly_PlyWriterContext.SetVertexOffset (method)
  SetVertexOffset(theOffset: number): void;

  // RWPly_PlyWriterContext.SurfaceId (method)
  SurfaceId(): number;

  // RWPly_PlyWriterContext.NbWrittenElements (method)
  NbWrittenElements(): number;

  // RWPly_PlyWriterContext.Close (method)
  Close(theIsAborted?: boolean): boolean;

  // RWPly_PlyWriterContext.delete (method)
  delete(): void;

  // RWPly_PlyWriterContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
