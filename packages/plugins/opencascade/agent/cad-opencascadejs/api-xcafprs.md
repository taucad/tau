# libcascade — XCAFPrs

6 top-level symbols. Signatures are verbatim typescript.

// Presentation (visualiation, selection etc.) tools for DECAF documents
XCAFPrs: declare class XCAFPrs

constructor

// Collect styles defined for shape on label L and its components and subshapes and fills a map of shape - style correspondence The location <loc> is for internal use, it should be Null location for external call
static CollectStyleSettings(L: TDF_Label, loc: TopLoc_Location, settings: NCollection_IndexedDataMap_TopoDS_Shape_XCAFPrs_Style_TopTools_ShapeMapHasher, theLayerColor: Quantity_ColorRGBA): void;
// settings: Mutated in place

// Set ViewNameMode for indicate display names or not
static SetViewNameMode(viewNameMode: boolean): void;

static GetViewNameMode(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Document iterator through shape nodes
XCAFPrs_DocumentExplorer: declare class XCAFPrs_DocumentExplorer

constructor

static DefineChildId(theLabel: TDF_Label, theParentId: TCollection_AsciiString): TCollection_AsciiString;

static FindLabelFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString, theParentLocation: TopLoc_Location, theLocation: TopLoc_Location): TDF_Label;
static FindLabelFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString, theLocation: TopLoc_Location): TDF_Label;
static FindLabelFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString, theParentLocation: TopLoc_Location, theLocation: TopLoc_Location): TDF_Label;
static FindLabelFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString, theLocation: TopLoc_Location): TDF_Label;

static FindShapeFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString): TopoDS_Shape;

Init(theDocument: TDocStd_Document, theRoot: TDF_Label, theFlags: number, theDefStyle: XCAFPrs_Style): void;
Init(theDocument: TDocStd_Document, theRoots: NCollection_Sequence_TDF_Label, theFlags: number, theDefStyle: XCAFPrs_Style): void;
Init(theDocument: TDocStd_Document, theRoot: TDF_Label, theFlags: number, theDefStyle: XCAFPrs_Style): void;
Init(theDocument: TDocStd_Document, theRoots: NCollection_Sequence_TDF_Label, theFlags: number, theDefStyle: XCAFPrs_Style): void;

More(): boolean;

Current(): XCAFPrs_DocumentNode;
Current(theDepth: number): XCAFPrs_DocumentNode;
Current(): XCAFPrs_DocumentNode;
Current(theDepth: number): XCAFPrs_DocumentNode;

ChangeCurrent(): XCAFPrs_DocumentNode;

CurrentDepth(): number;

Next(): void;

ColorTool(): XCAFDoc_ColorTool;

VisMaterialTool(): XCAFDoc_VisMaterialTool;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool for iterating through Path identification string
XCAFPrs_DocumentIdIterator: declare class XCAFPrs_DocumentIdIterator

constructor

// Return TRUE if iterator points to a value
More(): boolean;

// Return current value
Value(): TCollection_AsciiString;

// Find the next value
Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Structure defining document node
XCAFPrs_DocumentNode: declare class XCAFPrs_DocumentNode

constructor

Id: TCollection_AsciiString

Label: TDF_Label

RefLabel: TDF_Label

Style: XCAFPrs_Style

Location: TopLoc_Location

LocalTrsf: TopLoc_Location

IsAssembly: boolean

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Represents a set of styling settings applicable to a (sub)shape
XCAFPrs_Style: declare class XCAFPrs_Style

constructor

// Return TRUE if style is empty - does not override any properties
IsEmpty(): boolean;

// Return material
Material(): XCAFDoc_VisMaterial;

// Set material
SetMaterial(theMaterial: XCAFDoc_VisMaterial): void;

// Return TRUE if surface color has been defined
IsSetColorSurf(): boolean;

// Return surface color
GetColorSurf(): Quantity_Color;

// Set surface color
SetColorSurf(theColor: Quantity_Color): void;
SetColorSurf(theColor: Quantity_ColorRGBA): void;
SetColorSurf(theColor: Quantity_Color): void;
SetColorSurf(theColor: Quantity_ColorRGBA): void;

// Return surface color
GetColorSurfRGBA(): Quantity_ColorRGBA;

// Manage surface color setting
UnSetColorSurf(): void;

// Return TRUE if curve color has been defined
IsSetColorCurv(): boolean;

// Return curve color
GetColorCurv(): Quantity_Color;

// Set curve color
SetColorCurv(col: Quantity_Color): void;

// Manage curve color setting
UnSetColorCurv(): void;

// Assign visibility
SetVisibility(theVisibility: boolean): void;

// Manage visibility
IsVisible(): boolean;

// Returns True if styles are the same Methods for using Style as key in maps
IsEqual(theOther: XCAFPrs_Style): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XCAFPrs_IndexedDataMapOfShapeStyle: NCollection_IndexedDataMap_TopoDS_Shape_XCAFPrs_Style_TopTools_ShapeMapHasher
