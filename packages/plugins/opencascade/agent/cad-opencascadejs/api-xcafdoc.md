# libcascade — XCAFDoc

16 top-level symbols. Signatures are verbatim typescript.

XCAFDoc: declare class XCAFDoc

  constructor

  static AssemblyGUID(): Standard_GUID;

  static ShapeRefGUID(): Standard_GUID;

  static ColorRefGUID(type_: XCAFDoc_ColorType): Standard_GUID;

  static DimTolRefGUID(): Standard_GUID;

  static DimensionRefFirstGUID(): Standard_GUID;

  static DimensionRefSecondGUID(): Standard_GUID;

  static GeomToleranceRefGUID(): Standard_GUID;

  static DatumRefGUID(): Standard_GUID;

  static DatumTolRefGUID(): Standard_GUID;

  static LayerRefGUID(): Standard_GUID;

  static MaterialRefGUID(): Standard_GUID;

  static VisMaterialRefGUID(): Standard_GUID;

  static NoteRefGUID(): Standard_GUID;

  static InvisibleGUID(): Standard_GUID;

  static ColorByLayerGUID(): Standard_GUID;

  static ExternRefGUID(): Standard_GUID;

  static SHUORefGUID(): Standard_GUID;

  static ViewRefGUID(): Standard_GUID;

  static ViewRefShapeGUID(): Standard_GUID;

  static ViewRefGDTGUID(): Standard_GUID;

  static ViewRefPlaneGUID(): Standard_GUID;

  static ViewRefNoteGUID(): Standard_GUID;

  static ViewRefAnnotationGUID(): Standard_GUID;

  static LockGUID(): Standard_GUID;

  static AttributeInfo(theAtt: TDF_Attribute): TCollection_AsciiString;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_Area: declare class XCAFDoc_Area extends TDataStd_Real

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  Set(V: number): void;
  static Set(label: TDF_Label, value: number): XCAFDoc_Area;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
  static Set(label: TDF_Label, value: number): XCAFDoc_Area;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;

  Get(): number;
  static Get(label: TDF_Label, area?: number): { returnValue: boolean; area: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_AssemblyGraph: declare class XCAFDoc_AssemblyGraph extends Standard_Transient

  constructor

  GetShapeTool(): XCAFDoc_ShapeTool;

  GetRoots(): TColStd_PackedMapOfInteger;

  IsDirectLink(theNode1: number, theNode2: number): boolean;

  HasChildren(theNode: number): boolean;

  GetChildren(theNode: number): TColStd_PackedMapOfInteger;

  GetNodeType(theNode: number): XCAFDoc_AssemblyGraph_NodeType;

  GetNode(theNode: number): TDF_Label;

  GetNodes(): NCollection_IndexedMap_TDF_Label;

  NbNodes(): number;

  GetLinks(): any;

  NbLinks(): number;

  NbOccurrences(theNode: number): number;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_AssemblyGraph_NodeType: typeof XCAFDoc_AssemblyGraph_NodeType[keyof typeof XCAFDoc_AssemblyGraph_NodeType]

XCAFDoc_AssemblyGraph_Iterator: declare class XCAFDoc_AssemblyGraph_Iterator

  constructor

  More(): boolean;

  Current(): number;

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_AssemblyItemId: declare class XCAFDoc_AssemblyItemId

  constructor

  Init(thePath: NCollection_List_TCollection_AsciiString): void;
  Init(theString: TCollection_AsciiString): void;
  Init(thePath: NCollection_List_TCollection_AsciiString): void;
  Init(theString: TCollection_AsciiString): void;

  IsNull(): boolean;

  Nullify(): void;

  IsChild(theOther: XCAFDoc_AssemblyItemId): boolean;

  IsDirectChild(theOther: XCAFDoc_AssemblyItemId): boolean;

  IsEqual(theOther: XCAFDoc_AssemblyItemId): boolean;

  GetPath(): NCollection_List_TCollection_AsciiString;

  ToString(): TCollection_AsciiString;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_AssemblyItemRef: declare class XCAFDoc_AssemblyItemRef extends TDF_Attribute

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static GetID(): Standard_GUID;

  static Get(theLabel: TDF_Label): XCAFDoc_AssemblyItemRef;

  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;

  IsOrphan(): boolean;

  HasExtraRef(): boolean;

  IsGUID(): boolean;

  IsSubshapeIndex(): boolean;

  GetGUID(): Standard_GUID;

  GetSubshapeIndex(): number;

  GetItem(): XCAFDoc_AssemblyItemId;

  SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
  SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
  SetItem(theString: TCollection_AsciiString): void;
  SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
  SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
  SetItem(theString: TCollection_AsciiString): void;
  SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
  SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
  SetItem(theString: TCollection_AsciiString): void;

  SetGUID(theAttrGUID: Standard_GUID): void;

  SetSubshapeIndex(theShapeIndex: number): void;

  ClearExtraRef(): void;

  ID(): Standard_GUID;

  NewEmpty(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_AssemblyIterator: declare class XCAFDoc_AssemblyIterator

  constructor

  More(): boolean;

  Next(): void;

  Current(): XCAFDoc_AssemblyItemId;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_AssemblyTool: declare class XCAFDoc_AssemblyTool

  constructor

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_Centroid: declare class XCAFDoc_Centroid extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, pnt: gp_Pnt): XCAFDoc_Centroid;
  Set(pnt: gp_Pnt): void;

  Get(): gp_Pnt;
  static Get(label: TDF_Label, pnt: gp_Pnt): boolean;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_ClippingPlaneTool: declare class XCAFDoc_ClippingPlaneTool extends TDataStd_GenericEmpty

  constructor

  static Set(theLabel: TDF_Label): XCAFDoc_ClippingPlaneTool;

  static GetID(): Standard_GUID;

  BaseLabel(): TDF_Label;

  IsClippingPlane(theLabel: TDF_Label): boolean;

  GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
  GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping?: boolean): { returnValue: boolean; theName: TCollection_HAsciiString; theCapping: boolean; [Symbol.dispose](): void };
  GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
  GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping?: boolean): { returnValue: boolean; theName: TCollection_HAsciiString; theCapping: boolean; [Symbol.dispose](): void };

  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;

  RemoveClippingPlane(theLabel: TDF_Label): boolean;

  GetClippingPlanes(Labels: NCollection_Sequence_TDF_Label): void;

  UpdateClippingPlane(theLabelL: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString): void;

  SetCapping(theClippingPlaneL: TDF_Label, theCapping: boolean): void;

  GetCapping(theClippingPlaneL: TDF_Label): boolean;
  GetCapping(theClippingPlaneL: TDF_Label, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
  GetCapping(theClippingPlaneL: TDF_Label): boolean;
  GetCapping(theClippingPlaneL: TDF_Label, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_Color: declare class XCAFDoc_Color extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  Set(C: Quantity_Color): void;
  Set(C: Quantity_ColorRGBA): void;
  Set(C: Quantity_NameOfColor): void;
  Set(R: number, G: number, B: number, alpha: number): void;
  Set(C: Quantity_Color): void;
  Set(C: Quantity_ColorRGBA): void;
  Set(C: Quantity_NameOfColor): void;
  Set(R: number, G: number, B: number, alpha: number): void;
  Set(C: Quantity_Color): void;
  Set(C: Quantity_ColorRGBA): void;
  Set(C: Quantity_NameOfColor): void;
  Set(R: number, G: number, B: number, alpha: number): void;
  static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
  static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
  static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
  static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;
  Set(C: Quantity_Color): void;
  Set(C: Quantity_ColorRGBA): void;
  Set(C: Quantity_NameOfColor): void;
  Set(R: number, G: number, B: number, alpha: number): void;
  static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
  static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;

  GetColor(): Quantity_Color;

  GetColorRGBA(): Quantity_ColorRGBA;

  GetNOC(): Quantity_NameOfColor;

  GetRGB(R?: number, G?: number, B?: number): { R: number; G: number; B: number };

  GetAlpha(): number;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_ColorTool: declare class XCAFDoc_ColorTool extends TDataStd_GenericEmpty

  constructor

  static AutoNaming(): boolean;

  static SetAutoNaming(theIsAutoNaming: boolean): void;

  static Set(L: TDF_Label): XCAFDoc_ColorTool;

  static GetID(): Standard_GUID;

  BaseLabel(): TDF_Label;

  ShapeTool(): XCAFDoc_ShapeTool;

  IsColor(lab: TDF_Label): boolean;

  static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;

  FindColor(col: Quantity_Color): TDF_Label;
  FindColor(col: Quantity_ColorRGBA): TDF_Label;
  FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
  FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;
  FindColor(col: Quantity_Color): TDF_Label;
  FindColor(col: Quantity_ColorRGBA): TDF_Label;
  FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
  FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;
  FindColor(col: Quantity_Color): TDF_Label;
  FindColor(col: Quantity_ColorRGBA): TDF_Label;
  FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
  FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;
  FindColor(col: Quantity_Color): TDF_Label;
  FindColor(col: Quantity_ColorRGBA): TDF_Label;
  FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
  FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;

  AddColor(col: Quantity_Color): TDF_Label;
  AddColor(col: Quantity_ColorRGBA): TDF_Label;
  AddColor(col: Quantity_Color): TDF_Label;
  AddColor(col: Quantity_ColorRGBA): TDF_Label;

  RemoveColor(lab: TDF_Label): void;

  GetColors(Labels: NCollection_Sequence_TDF_Label): void;

  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;
  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;
  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;
  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;
  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;
  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;

  UnSetColor(L: TDF_Label, type_: XCAFDoc_ColorType): void;
  UnSetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType): boolean;
  UnSetColor(L: TDF_Label, type_: XCAFDoc_ColorType): void;
  UnSetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType): boolean;

  IsSet(L: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  IsSet(S: TopoDS_Shape, type_: XCAFDoc_ColorType): boolean;
  IsSet(L: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  IsSet(S: TopoDS_Shape, type_: XCAFDoc_ColorType): boolean;

  static IsVisible(L: TDF_Label): boolean;

  SetVisibility(shapeLabel: TDF_Label, isvisible?: boolean): void;

  IsColorByLayer(L: TDF_Label): boolean;

  SetColorByLayer(shapeLabel: TDF_Label, isColorByLayer?: boolean): void;

  SetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color, isCreateSHUO: boolean): boolean;
  SetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA, isCreateSHUO: boolean): boolean;
  SetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color, isCreateSHUO: boolean): boolean;
  SetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA, isCreateSHUO: boolean): boolean;

  GetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  GetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;

  IsInstanceVisible(theShape: TopoDS_Shape): boolean;

  ReverseChainsOfTreeNodes(): boolean;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_ColorType: typeof XCAFDoc_ColorType[keyof typeof XCAFDoc_ColorType]

XCAFDoc_Datum: declare class XCAFDoc_Datum extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): XCAFDoc_Datum;
  static Set(theLabel: TDF_Label): XCAFDoc_Datum;
  static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): XCAFDoc_Datum;
  static Set(theLabel: TDF_Label): XCAFDoc_Datum;
  Set(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): void;

  GetName(): TCollection_HAsciiString;

  GetDescription(): TCollection_HAsciiString;

  GetIdentification(): TCollection_HAsciiString;

  GetObject(): XCAFDimTolObjects_DatumObject;

  SetObject(theDatumObject: XCAFDimTolObjects_DatumObject): void;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_DimTol: declare class XCAFDoc_DimTol extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, kind: number, aVal: NCollection_HArray1_double, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): XCAFDoc_DimTol;
  Set(kind: number, aVal: NCollection_HArray1_double, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

  GetKind(): number;

  GetVal(): NCollection_HArray1_double;

  GetName(): TCollection_HAsciiString;

  GetDescription(): TCollection_HAsciiString;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
