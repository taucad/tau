# libcascade — XCAFPrs

6 top-level symbols. Signatures are verbatim typescript.

XCAFPrs: declare class XCAFPrs

constructor

static CollectStyleSettings(L: TDF_Label, loc: TopLoc_Location, settings: NCollection_IndexedDataMap_TopoDS_Shape_XCAFPrs_Style_TopTools_ShapeMapHasher, theLayerColor: Quantity_ColorRGBA): void;

static SetViewNameMode(viewNameMode: boolean): void;

static GetViewNameMode(): boolean;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

XCAFPrs_DocumentIdIterator: declare class XCAFPrs_DocumentIdIterator

constructor

More(): boolean;

Value(): TCollection_AsciiString;

Next(): void;

delete(): void;

[Symbol.dispose](): void;

XCAFPrs_DocumentNode: declare class XCAFPrs_DocumentNode

constructor

Id: TCollection_AsciiString

Label: TDF_Label

RefLabel: TDF_Label

Style: XCAFPrs_Style

Location: TopLoc_Location

LocalTrsf: TopLoc_Location

IsAssembly: boolean

delete(): void;

[Symbol.dispose](): void;

XCAFPrs_Style: declare class XCAFPrs_Style

constructor

IsEmpty(): boolean;

Material(): XCAFDoc_VisMaterial;

SetMaterial(theMaterial: XCAFDoc_VisMaterial): void;

IsSetColorSurf(): boolean;

GetColorSurf(): Quantity_Color;

SetColorSurf(theColor: Quantity_Color): void;
SetColorSurf(theColor: Quantity_ColorRGBA): void;
SetColorSurf(theColor: Quantity_Color): void;
SetColorSurf(theColor: Quantity_ColorRGBA): void;

GetColorSurfRGBA(): Quantity_ColorRGBA;

UnSetColorSurf(): void;

IsSetColorCurv(): boolean;

GetColorCurv(): Quantity_Color;

SetColorCurv(col: Quantity_Color): void;

UnSetColorCurv(): void;

SetVisibility(theVisibility: boolean): void;

IsVisible(): boolean;

IsEqual(theOther: XCAFPrs_Style): boolean;

delete(): void;

[Symbol.dispose](): void;

XCAFPrs_IndexedDataMapOfShapeStyle: NCollection_IndexedDataMap_TopoDS_Shape_XCAFPrs_Style_TopTools_ShapeMapHasher
