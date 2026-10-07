# libcascade — XCAFPrs

6 top-level symbols. Signatures are verbatim typescript.

XCAFPrs: declare class XCAFPrs

  // XCAFPrs.constructor (constructor)
  constructor();

  // XCAFPrs.CollectStyleSettings (method)
  static CollectStyleSettings(L: TDF_Label, loc: TopLoc_Location, settings: NCollection_IndexedDataMap_TopoDS_Shape_XCAFPrs_Style_TopTools_ShapeMapHasher, theLayerColor: Quantity_ColorRGBA): void;

  // XCAFPrs.SetViewNameMode (method)
  static SetViewNameMode(viewNameMode: boolean): void;

  // XCAFPrs.GetViewNameMode (method)
  static GetViewNameMode(): boolean;

  // XCAFPrs.delete (method)
  delete(): void;

  // XCAFPrs.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFPrs_DocumentExplorer: declare class XCAFPrs_DocumentExplorer

  // XCAFPrs_DocumentExplorer.constructor (constructor)
  constructor();
  constructor(theDocument: TDocStd_Document, theFlags: number, theDefStyle?: XCAFPrs_Style);
  constructor(theDocument: TDocStd_Document, theRoots: NCollection_Sequence_TDF_Label, theFlags: number, theDefStyle?: XCAFPrs_Style);

  // XCAFPrs_DocumentExplorer.DefineChildId (method)
  static DefineChildId(theLabel: TDF_Label, theParentId: TCollection_AsciiString): TCollection_AsciiString;

  // XCAFPrs_DocumentExplorer.FindLabelFromPathId (method)
  static FindLabelFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString, theParentLocation: TopLoc_Location, theLocation: TopLoc_Location): TDF_Label;
  static FindLabelFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString, theLocation: TopLoc_Location): TDF_Label;

  // XCAFPrs_DocumentExplorer.FindShapeFromPathId (method)
  static FindShapeFromPathId(theDocument: TDocStd_Document, theId: TCollection_AsciiString): TopoDS_Shape;

  // XCAFPrs_DocumentExplorer.Init (method)
  Init(theDocument: TDocStd_Document, theRoot: TDF_Label, theFlags: number, theDefStyle: XCAFPrs_Style): void;
  Init(theDocument: TDocStd_Document, theRoots: NCollection_Sequence_TDF_Label, theFlags: number, theDefStyle: XCAFPrs_Style): void;

  // XCAFPrs_DocumentExplorer.More (method)
  More(): boolean;

  // XCAFPrs_DocumentExplorer.Current (method)
  Current(): XCAFPrs_DocumentNode;
  Current(theDepth: number): XCAFPrs_DocumentNode;

  // XCAFPrs_DocumentExplorer.ChangeCurrent (method)
  ChangeCurrent(): XCAFPrs_DocumentNode;

  // XCAFPrs_DocumentExplorer.CurrentDepth (method)
  CurrentDepth(): number;

  // XCAFPrs_DocumentExplorer.Next (method)
  Next(): void;

  // XCAFPrs_DocumentExplorer.ColorTool (method)
  ColorTool(): XCAFDoc_ColorTool;

  // XCAFPrs_DocumentExplorer.VisMaterialTool (method)
  VisMaterialTool(): XCAFDoc_VisMaterialTool;

  // XCAFPrs_DocumentExplorer.delete (method)
  delete(): void;

  // XCAFPrs_DocumentExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFPrs_DocumentIdIterator: declare class XCAFPrs_DocumentIdIterator

  // XCAFPrs_DocumentIdIterator.constructor (constructor)
  constructor(thePath: TCollection_AsciiString);

  // XCAFPrs_DocumentIdIterator.More (method)
  More(): boolean;

  // XCAFPrs_DocumentIdIterator.Value (method)
  Value(): TCollection_AsciiString;

  // XCAFPrs_DocumentIdIterator.Next (method)
  Next(): void;

  // XCAFPrs_DocumentIdIterator.delete (method)
  delete(): void;

  // XCAFPrs_DocumentIdIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFPrs_DocumentNode: declare class XCAFPrs_DocumentNode

  // XCAFPrs_DocumentNode.constructor (constructor)
  constructor();

  Id: TCollection_AsciiString

  Label: TDF_Label

  RefLabel: TDF_Label

  Style: XCAFPrs_Style

  Location: TopLoc_Location

  LocalTrsf: TopLoc_Location

  IsAssembly: boolean

  // XCAFPrs_DocumentNode.delete (method)
  delete(): void;

  // XCAFPrs_DocumentNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFPrs_Style: declare class XCAFPrs_Style

  // XCAFPrs_Style.constructor (constructor)
  constructor();

  // XCAFPrs_Style.IsEmpty (method)
  IsEmpty(): boolean;

  // XCAFPrs_Style.Material (method)
  Material(): XCAFDoc_VisMaterial;

  // XCAFPrs_Style.SetMaterial (method)
  SetMaterial(theMaterial: XCAFDoc_VisMaterial): void;

  // XCAFPrs_Style.IsSetColorSurf (method)
  IsSetColorSurf(): boolean;

  // XCAFPrs_Style.GetColorSurf (method)
  GetColorSurf(): Quantity_Color;

  // XCAFPrs_Style.SetColorSurf (method)
  SetColorSurf(theColor: Quantity_Color): void;
  SetColorSurf(theColor: Quantity_ColorRGBA): void;

  // XCAFPrs_Style.GetColorSurfRGBA (method)
  GetColorSurfRGBA(): Quantity_ColorRGBA;

  // XCAFPrs_Style.UnSetColorSurf (method)
  UnSetColorSurf(): void;

  // XCAFPrs_Style.IsSetColorCurv (method)
  IsSetColorCurv(): boolean;

  // XCAFPrs_Style.GetColorCurv (method)
  GetColorCurv(): Quantity_Color;

  // XCAFPrs_Style.SetColorCurv (method)
  SetColorCurv(col: Quantity_Color): void;

  // XCAFPrs_Style.UnSetColorCurv (method)
  UnSetColorCurv(): void;

  // XCAFPrs_Style.SetVisibility (method)
  SetVisibility(theVisibility: boolean): void;

  // XCAFPrs_Style.IsVisible (method)
  IsVisible(): boolean;

  // XCAFPrs_Style.IsEqual (method)
  IsEqual(theOther: XCAFPrs_Style): boolean;

  // XCAFPrs_Style.delete (method)
  delete(): void;

  // XCAFPrs_Style.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFPrs_IndexedDataMapOfShapeStyle: NCollection_IndexedDataMap_TopoDS_Shape_XCAFPrs_Style_TopTools_ShapeMapHasher
