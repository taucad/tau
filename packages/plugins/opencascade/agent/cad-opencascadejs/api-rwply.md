# libcascade — RWPly

2 top-level symbols. Signatures are verbatim typescript.

// PLY writer context from XCAF document
RWPly_CafWriter: declare class RWPly_CafWriter extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return transformation from OCCT to PLY coordinate system
CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Return transformation from OCCT to PLY coordinate system
ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Set transformation from OCCT to PLY coordinate system
SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

// Return default material definition to be used for nodes with only color defined
DefaultStyle(): XCAFPrs_Style;

// Set default material definition to be used for nodes with only color defined
SetDefaultStyle(theStyle: XCAFPrs_Style): void;

// Return TRUE if vertex position should be stored with double floating point precision
IsDoublePrecision(): boolean;

// Set if vertex position should be stored with double floating point precision
SetDoublePrecision(theDoublePrec: boolean): void;

// Return TRUE if normals should be written
HasNormals(): boolean;

// Set if normals are defined
SetNormals(theHasNormals: boolean): void;

// Return TRUE if UV / texture coordinates should be written
HasTexCoords(): boolean;

// Set if UV / texture coordinates should be written
SetTexCoords(theHasTexCoords: boolean): void;

// Return TRUE if point colors should be written
HasColors(): boolean;

// Set if point colors should be written
SetColors(theToWrite: boolean): void;

// Return TRUE if part Id should be written as element attribute
HasPartId(): boolean;

// Set if part Id should be written as element attribute
SetPartId(theSurfId: boolean): void;

// Return TRUE if face Id should be written as element attribute
HasFaceId(): boolean;

// Set if face Id should be written as element attribute
SetFaceId(theSurfId: boolean): void;

// Write PLY file and associated MTL material file
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
// theDocument: input document
// theRootLabels: list of root shapes to export
// theLabelFilter: optional filter with document nodes to export, with keys defined by `XCAFPrs_DocumentExplorer::DefineChildId()` and filled recursively (leaves and parent assembly nodes at all levels)
// theFileInfo: map with file metadata to put into PLY header section
// theProgress: optional progress indicator

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary low-level tool writing PLY file
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
