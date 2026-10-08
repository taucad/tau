# libcascade — XCAFDoc

19 top-level symbols. Signatures are verbatim typescript.

XCAFDoc: declare class XCAFDoc

  // XCAFDoc.constructor (constructor)
  constructor();

  // XCAFDoc.AssemblyGUID (method)
  static AssemblyGUID(): Standard_GUID;

  // XCAFDoc.ShapeRefGUID (method)
  static ShapeRefGUID(): Standard_GUID;

  // XCAFDoc.ColorRefGUID (method)
  static ColorRefGUID(type_: XCAFDoc_ColorType): Standard_GUID;

  // XCAFDoc.DimTolRefGUID (method)
  static DimTolRefGUID(): Standard_GUID;

  // XCAFDoc.DimensionRefFirstGUID (method)
  static DimensionRefFirstGUID(): Standard_GUID;

  // XCAFDoc.DimensionRefSecondGUID (method)
  static DimensionRefSecondGUID(): Standard_GUID;

  // XCAFDoc.GeomToleranceRefGUID (method)
  static GeomToleranceRefGUID(): Standard_GUID;

  // XCAFDoc.DatumRefGUID (method)
  static DatumRefGUID(): Standard_GUID;

  // XCAFDoc.DatumTolRefGUID (method)
  static DatumTolRefGUID(): Standard_GUID;

  // XCAFDoc.LayerRefGUID (method)
  static LayerRefGUID(): Standard_GUID;

  // XCAFDoc.MaterialRefGUID (method)
  static MaterialRefGUID(): Standard_GUID;

  // XCAFDoc.VisMaterialRefGUID (method)
  static VisMaterialRefGUID(): Standard_GUID;

  // XCAFDoc.NoteRefGUID (method)
  static NoteRefGUID(): Standard_GUID;

  // XCAFDoc.InvisibleGUID (method)
  static InvisibleGUID(): Standard_GUID;

  // XCAFDoc.ColorByLayerGUID (method)
  static ColorByLayerGUID(): Standard_GUID;

  // XCAFDoc.ExternRefGUID (method)
  static ExternRefGUID(): Standard_GUID;

  // XCAFDoc.SHUORefGUID (method)
  static SHUORefGUID(): Standard_GUID;

  // XCAFDoc.ViewRefGUID (method)
  static ViewRefGUID(): Standard_GUID;

  // XCAFDoc.ViewRefShapeGUID (method)
  static ViewRefShapeGUID(): Standard_GUID;

  // XCAFDoc.ViewRefGDTGUID (method)
  static ViewRefGDTGUID(): Standard_GUID;

  // XCAFDoc.ViewRefPlaneGUID (method)
  static ViewRefPlaneGUID(): Standard_GUID;

  // XCAFDoc.ViewRefNoteGUID (method)
  static ViewRefNoteGUID(): Standard_GUID;

  // XCAFDoc.ViewRefAnnotationGUID (method)
  static ViewRefAnnotationGUID(): Standard_GUID;

  // XCAFDoc.LockGUID (method)
  static LockGUID(): Standard_GUID;

  // XCAFDoc.AttributeInfo (method)
  static AttributeInfo(theAtt: TDF_Attribute): TCollection_AsciiString;

  // XCAFDoc.delete (method)
  delete(): void;

  // XCAFDoc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Area: declare class XCAFDoc_Area extends TDataStd_Real

  // XCAFDoc_Area.constructor (constructor)
  constructor();

  // XCAFDoc_Area.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Area.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Area.Set (method)
  Set(V: number): void;
  static Set(label: TDF_Label, value: number): XCAFDoc_Area;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;

  // XCAFDoc_Area.Get (method)
  Get(): number;
  static Get(label: TDF_Label, area?: number): { returnValue: boolean; area: number };

  // XCAFDoc_Area.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Area.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Area.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Area.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Area.delete (method)
  delete(): void;

  // XCAFDoc_Area.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_AssemblyGraph: declare class XCAFDoc_AssemblyGraph extends Standard_Transient

  // XCAFDoc_AssemblyGraph.constructor (constructor)
  constructor(theDoc: TDocStd_Document);
  constructor(theLabel: TDF_Label);

  // XCAFDoc_AssemblyGraph.GetShapeTool (method)
  GetShapeTool(): XCAFDoc_ShapeTool;

  // XCAFDoc_AssemblyGraph.GetRoots (method)
  GetRoots(): TColStd_PackedMapOfInteger;

  // XCAFDoc_AssemblyGraph.IsDirectLink (method)
  IsDirectLink(theNode1: number, theNode2: number): boolean;

  // XCAFDoc_AssemblyGraph.HasChildren (method)
  HasChildren(theNode: number): boolean;

  // XCAFDoc_AssemblyGraph.GetChildren (method)
  GetChildren(theNode: number): TColStd_PackedMapOfInteger;

  // XCAFDoc_AssemblyGraph.GetNodeType (method)
  GetNodeType(theNode: number): XCAFDoc_AssemblyGraph_NodeType;

  // XCAFDoc_AssemblyGraph.GetNode (method)
  GetNode(theNode: number): TDF_Label;

  // XCAFDoc_AssemblyGraph.GetNodes (method)
  GetNodes(): NCollection_IndexedMap_TDF_Label;

  // XCAFDoc_AssemblyGraph.NbNodes (method)
  NbNodes(): number;

  // XCAFDoc_AssemblyGraph.GetLinks (method)
  GetLinks(): any;

  // XCAFDoc_AssemblyGraph.NbLinks (method)
  NbLinks(): number;

  // XCAFDoc_AssemblyGraph.NbOccurrences (method)
  NbOccurrences(theNode: number): number;

  // XCAFDoc_AssemblyGraph.delete (method)
  delete(): void;

  // XCAFDoc_AssemblyGraph.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_AssemblyGraph_NodeType: typeof XCAFDoc_AssemblyGraph_NodeType[keyof typeof XCAFDoc_AssemblyGraph_NodeType]

  readonly NodeType_UNDEFINED: 'NodeType_UNDEFINED'

  readonly NodeType_AssemblyRoot: 'NodeType_AssemblyRoot'

  readonly NodeType_Subassembly: 'NodeType_Subassembly'

  readonly NodeType_Occurrence: 'NodeType_Occurrence'

  readonly NodeType_Part: 'NodeType_Part'

  readonly NodeType_Subshape: 'NodeType_Subshape'

XCAFDoc_AssemblyGraph_Iterator: declare class XCAFDoc_AssemblyGraph_Iterator

  // XCAFDoc_AssemblyGraph_Iterator.constructor (constructor)
  constructor(theGraph: XCAFDoc_AssemblyGraph, theNode?: number);

  // XCAFDoc_AssemblyGraph_Iterator.More (method)
  More(): boolean;

  // XCAFDoc_AssemblyGraph_Iterator.Current (method)
  Current(): number;

  // XCAFDoc_AssemblyGraph_Iterator.Next (method)
  Next(): void;

  // XCAFDoc_AssemblyGraph_Iterator.delete (method)
  delete(): void;

  // XCAFDoc_AssemblyGraph_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_AssemblyItemId: declare class XCAFDoc_AssemblyItemId

  // XCAFDoc_AssemblyItemId.constructor (constructor)
  constructor();
  constructor(thePath: NCollection_List_TCollection_AsciiString);
  constructor(theString: TCollection_AsciiString);

  // XCAFDoc_AssemblyItemId.Init (method)
  Init(thePath: NCollection_List_TCollection_AsciiString): void;
  Init(theString: TCollection_AsciiString): void;

  // XCAFDoc_AssemblyItemId.IsNull (method)
  IsNull(): boolean;

  // XCAFDoc_AssemblyItemId.Nullify (method)
  Nullify(): void;

  // XCAFDoc_AssemblyItemId.IsChild (method)
  IsChild(theOther: XCAFDoc_AssemblyItemId): boolean;

  // XCAFDoc_AssemblyItemId.IsDirectChild (method)
  IsDirectChild(theOther: XCAFDoc_AssemblyItemId): boolean;

  // XCAFDoc_AssemblyItemId.IsEqual (method)
  IsEqual(theOther: XCAFDoc_AssemblyItemId): boolean;

  // XCAFDoc_AssemblyItemId.GetPath (method)
  GetPath(): NCollection_List_TCollection_AsciiString;

  // XCAFDoc_AssemblyItemId.ToString (method)
  ToString(): TCollection_AsciiString;

  // XCAFDoc_AssemblyItemId.delete (method)
  delete(): void;

  // XCAFDoc_AssemblyItemId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_AssemblyItemRef: declare class XCAFDoc_AssemblyItemRef extends TDF_Attribute

  // XCAFDoc_AssemblyItemRef.constructor (constructor)
  constructor();

  // XCAFDoc_AssemblyItemRef.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_AssemblyItemRef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_AssemblyItemRef.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_AssemblyItemRef.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_AssemblyItemRef.Get (method)
  static Get(theLabel: TDF_Label): XCAFDoc_AssemblyItemRef;

  // XCAFDoc_AssemblyItemRef.Set (method)
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;

  // XCAFDoc_AssemblyItemRef.IsOrphan (method)
  IsOrphan(): boolean;

  // XCAFDoc_AssemblyItemRef.HasExtraRef (method)
  HasExtraRef(): boolean;

  // XCAFDoc_AssemblyItemRef.IsGUID (method)
  IsGUID(): boolean;

  // XCAFDoc_AssemblyItemRef.IsSubshapeIndex (method)
  IsSubshapeIndex(): boolean;

  // XCAFDoc_AssemblyItemRef.GetGUID (method)
  GetGUID(): Standard_GUID;

  // XCAFDoc_AssemblyItemRef.GetSubshapeIndex (method)
  GetSubshapeIndex(): number;

  // XCAFDoc_AssemblyItemRef.GetItem (method)
  GetItem(): XCAFDoc_AssemblyItemId;

  // XCAFDoc_AssemblyItemRef.SetItem (method)
  SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
  SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
  SetItem(theString: TCollection_AsciiString): void;

  // XCAFDoc_AssemblyItemRef.SetGUID (method)
  SetGUID(theAttrGUID: Standard_GUID): void;

  // XCAFDoc_AssemblyItemRef.SetSubshapeIndex (method)
  SetSubshapeIndex(theShapeIndex: number): void;

  // XCAFDoc_AssemblyItemRef.ClearExtraRef (method)
  ClearExtraRef(): void;

  // XCAFDoc_AssemblyItemRef.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_AssemblyItemRef.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_AssemblyItemRef.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_AssemblyItemRef.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_AssemblyItemRef.delete (method)
  delete(): void;

  // XCAFDoc_AssemblyItemRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_AssemblyIterator: declare class XCAFDoc_AssemblyIterator

  // XCAFDoc_AssemblyIterator.constructor (constructor)
  constructor(theDoc: TDocStd_Document, theLevel?: number);
  constructor(theDoc: TDocStd_Document, theRoot: XCAFDoc_AssemblyItemId, theLevel?: number);

  // XCAFDoc_AssemblyIterator.More (method)
  More(): boolean;

  // XCAFDoc_AssemblyIterator.Next (method)
  Next(): void;

  // XCAFDoc_AssemblyIterator.Current (method)
  Current(): XCAFDoc_AssemblyItemId;

  // XCAFDoc_AssemblyIterator.delete (method)
  delete(): void;

  // XCAFDoc_AssemblyIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_AssemblyTool: declare class XCAFDoc_AssemblyTool

  // XCAFDoc_AssemblyTool.constructor (constructor)
  constructor();

  // XCAFDoc_AssemblyTool.delete (method)
  delete(): void;

  // XCAFDoc_AssemblyTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Centroid: declare class XCAFDoc_Centroid extends TDF_Attribute

  // XCAFDoc_Centroid.constructor (constructor)
  constructor();

  // XCAFDoc_Centroid.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Centroid.Set (method)
  static Set(label: TDF_Label, pnt: gp_Pnt): XCAFDoc_Centroid;
  Set(pnt: gp_Pnt): void;

  // XCAFDoc_Centroid.Get (method)
  Get(): gp_Pnt;
  static Get(label: TDF_Label, pnt: gp_Pnt): boolean;

  // XCAFDoc_Centroid.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Centroid.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_Centroid.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Centroid.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_Centroid.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Centroid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Centroid.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Centroid.delete (method)
  delete(): void;

  // XCAFDoc_Centroid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_ClippingPlaneTool: declare class XCAFDoc_ClippingPlaneTool extends TDataStd_GenericEmpty

  // XCAFDoc_ClippingPlaneTool.constructor (constructor)
  constructor();

  // XCAFDoc_ClippingPlaneTool.Set (method)
  static Set(theLabel: TDF_Label): XCAFDoc_ClippingPlaneTool;

  // XCAFDoc_ClippingPlaneTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_ClippingPlaneTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_ClippingPlaneTool.IsClippingPlane (method)
  IsClippingPlane(theLabel: TDF_Label): boolean;

  // XCAFDoc_ClippingPlaneTool.GetClippingPlane (method)
  GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
  GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping?: boolean): { returnValue: boolean; theName: TCollection_HAsciiString; theCapping: boolean; [Symbol.dispose](): void };

  // XCAFDoc_ClippingPlaneTool.AddClippingPlane (method)
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
  AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;

  // XCAFDoc_ClippingPlaneTool.RemoveClippingPlane (method)
  RemoveClippingPlane(theLabel: TDF_Label): boolean;

  // XCAFDoc_ClippingPlaneTool.GetClippingPlanes (method)
  GetClippingPlanes(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ClippingPlaneTool.UpdateClippingPlane (method)
  UpdateClippingPlane(theLabelL: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString): void;

  // XCAFDoc_ClippingPlaneTool.SetCapping (method)
  SetCapping(theClippingPlaneL: TDF_Label, theCapping: boolean): void;

  // XCAFDoc_ClippingPlaneTool.GetCapping (method)
  GetCapping(theClippingPlaneL: TDF_Label): boolean;
  GetCapping(theClippingPlaneL: TDF_Label, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };

  // XCAFDoc_ClippingPlaneTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_ClippingPlaneTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_ClippingPlaneTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_ClippingPlaneTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_ClippingPlaneTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_ClippingPlaneTool.delete (method)
  delete(): void;

  // XCAFDoc_ClippingPlaneTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Color: declare class XCAFDoc_Color extends TDF_Attribute

  // XCAFDoc_Color.constructor (constructor)
  constructor();

  // XCAFDoc_Color.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Color.Set (method)
  Set(C: Quantity_Color): void;
  Set(C: Quantity_ColorRGBA): void;
  Set(C: Quantity_NameOfColor): void;
  Set(R: number, G: number, B: number, alpha: number): void;
  static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
  static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
  static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;

  // XCAFDoc_Color.GetColor (method)
  GetColor(): Quantity_Color;

  // XCAFDoc_Color.GetColorRGBA (method)
  GetColorRGBA(): Quantity_ColorRGBA;

  // XCAFDoc_Color.GetNOC (method)
  GetNOC(): Quantity_NameOfColor;

  // XCAFDoc_Color.GetRGB (method)
  GetRGB(R?: number, G?: number, B?: number): { R: number; G: number; B: number };

  // XCAFDoc_Color.GetAlpha (method)
  GetAlpha(): number;

  // XCAFDoc_Color.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Color.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_Color.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Color.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_Color.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Color.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Color.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Color.delete (method)
  delete(): void;

  // XCAFDoc_Color.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_ColorTool: declare class XCAFDoc_ColorTool extends TDataStd_GenericEmpty

  // XCAFDoc_ColorTool.constructor (constructor)
  constructor();

  // XCAFDoc_ColorTool.AutoNaming (method)
  static AutoNaming(): boolean;

  // XCAFDoc_ColorTool.SetAutoNaming (method)
  static SetAutoNaming(theIsAutoNaming: boolean): void;

  // XCAFDoc_ColorTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_ColorTool;

  // XCAFDoc_ColorTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_ColorTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_ColorTool.ShapeTool (method)
  ShapeTool(): XCAFDoc_ShapeTool;

  // XCAFDoc_ColorTool.IsColor (method)
  IsColor(lab: TDF_Label): boolean;

  // XCAFDoc_ColorTool.GetColor (method)
  static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
  static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  static GetColor(L: TDF_Label, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, colorL: TDF_Label): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;

  // XCAFDoc_ColorTool.FindColor (method)
  FindColor(col: Quantity_Color): TDF_Label;
  FindColor(col: Quantity_ColorRGBA): TDF_Label;
  FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
  FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;

  // XCAFDoc_ColorTool.AddColor (method)
  AddColor(col: Quantity_Color): TDF_Label;
  AddColor(col: Quantity_ColorRGBA): TDF_Label;

  // XCAFDoc_ColorTool.RemoveColor (method)
  RemoveColor(lab: TDF_Label): void;

  // XCAFDoc_ColorTool.GetColors (method)
  GetColors(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ColorTool.SetColor (method)
  SetColor(L: TDF_Label, colorL: TDF_Label, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_Color, type_: XCAFDoc_ColorType): void;
  SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): void;
  SetColor(S: TopoDS_Shape, colorL: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_Color, type_: XCAFDoc_ColorType): boolean;
  SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type_: XCAFDoc_ColorType): boolean;

  // XCAFDoc_ColorTool.UnSetColor (method)
  UnSetColor(L: TDF_Label, type_: XCAFDoc_ColorType): void;
  UnSetColor(S: TopoDS_Shape, type_: XCAFDoc_ColorType): boolean;

  // XCAFDoc_ColorTool.IsSet (method)
  IsSet(L: TDF_Label, type_: XCAFDoc_ColorType): boolean;
  IsSet(S: TopoDS_Shape, type_: XCAFDoc_ColorType): boolean;

  // XCAFDoc_ColorTool.IsVisible (method)
  static IsVisible(L: TDF_Label): boolean;

  // XCAFDoc_ColorTool.SetVisibility (method)
  SetVisibility(shapeLabel: TDF_Label, isvisible?: boolean): void;

  // XCAFDoc_ColorTool.IsColorByLayer (method)
  IsColorByLayer(L: TDF_Label): boolean;

  // XCAFDoc_ColorTool.SetColorByLayer (method)
  SetColorByLayer(shapeLabel: TDF_Label, isColorByLayer?: boolean): void;

  // XCAFDoc_ColorTool.SetInstanceColor (method)
  SetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color, isCreateSHUO: boolean): boolean;
  SetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA, isCreateSHUO: boolean): boolean;

  // XCAFDoc_ColorTool.GetInstanceColor (method)
  GetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_Color): boolean;
  GetInstanceColor(theShape: TopoDS_Shape, type_: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;

  // XCAFDoc_ColorTool.IsInstanceVisible (method)
  IsInstanceVisible(theShape: TopoDS_Shape): boolean;

  // XCAFDoc_ColorTool.ReverseChainsOfTreeNodes (method)
  ReverseChainsOfTreeNodes(): boolean;

  // XCAFDoc_ColorTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_ColorTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_ColorTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_ColorTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_ColorTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_ColorTool.delete (method)
  delete(): void;

  // XCAFDoc_ColorTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_ColorType: typeof XCAFDoc_ColorType[keyof typeof XCAFDoc_ColorType]

  readonly XCAFDoc_ColorGen: 'XCAFDoc_ColorGen'

  readonly XCAFDoc_ColorSurf: 'XCAFDoc_ColorSurf'

  readonly XCAFDoc_ColorCurv: 'XCAFDoc_ColorCurv'

XCAFDoc_Datum: declare class XCAFDoc_Datum extends TDF_Attribute

  // XCAFDoc_Datum.constructor (constructor)
  constructor();

  // XCAFDoc_Datum.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Datum.Set (method)
  static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): XCAFDoc_Datum;
  static Set(theLabel: TDF_Label): XCAFDoc_Datum;
  Set(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): void;

  // XCAFDoc_Datum.GetName (method)
  GetName(): TCollection_HAsciiString;

  // XCAFDoc_Datum.GetDescription (method)
  GetDescription(): TCollection_HAsciiString;

  // XCAFDoc_Datum.GetIdentification (method)
  GetIdentification(): TCollection_HAsciiString;

  // XCAFDoc_Datum.GetObject (method)
  GetObject(): XCAFDimTolObjects_DatumObject;

  // XCAFDoc_Datum.SetObject (method)
  SetObject(theDatumObject: XCAFDimTolObjects_DatumObject): void;

  // XCAFDoc_Datum.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Datum.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_Datum.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Datum.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_Datum.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Datum.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Datum.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Datum.delete (method)
  delete(): void;

  // XCAFDoc_Datum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_DimTol: declare class XCAFDoc_DimTol extends TDF_Attribute

  // XCAFDoc_DimTol.constructor (constructor)
  constructor();

  // XCAFDoc_DimTol.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_DimTol.Set (method)
  static Set(label: TDF_Label, kind: number, aVal: NCollection_HArray1_double, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): XCAFDoc_DimTol;
  Set(kind: number, aVal: NCollection_HArray1_double, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

  // XCAFDoc_DimTol.GetKind (method)
  GetKind(): number;

  // XCAFDoc_DimTol.GetVal (method)
  GetVal(): NCollection_HArray1_double;

  // XCAFDoc_DimTol.GetName (method)
  GetName(): TCollection_HAsciiString;

  // XCAFDoc_DimTol.GetDescription (method)
  GetDescription(): TCollection_HAsciiString;

  // XCAFDoc_DimTol.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_DimTol.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_DimTol.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_DimTol.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_DimTol.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_DimTol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_DimTol.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_DimTol.delete (method)
  delete(): void;

  // XCAFDoc_DimTol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_DimTolTool: declare class XCAFDoc_DimTolTool extends TDataStd_GenericEmpty

  // XCAFDoc_DimTolTool.constructor (constructor)
  constructor();

  // XCAFDoc_DimTolTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_DimTolTool;

  // XCAFDoc_DimTolTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_DimTolTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_DimTolTool.ShapeTool (method)
  ShapeTool(): XCAFDoc_ShapeTool;

  // XCAFDoc_DimTolTool.IsDimension (method)
  IsDimension(theLab: TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetDimensionLabels (method)
  GetDimensionLabels(theLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_DimTolTool.SetDimension (method)
  SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
  SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
  SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;

  // XCAFDoc_DimTolTool.GetRefDimensionLabels (method)
  GetRefDimensionLabels(theShapeL: TDF_Label, theDimensions: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.AddDimension (method)
  AddDimension(): TDF_Label;

  // XCAFDoc_DimTolTool.IsGeomTolerance (method)
  IsGeomTolerance(theLab: TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetGeomToleranceLabels (method)
  GetGeomToleranceLabels(theLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_DimTolTool.SetGeomTolerance (method)
  SetGeomTolerance(theL: TDF_Label, theGeomTolL: TDF_Label): void;
  SetGeomTolerance(theL: NCollection_Sequence_TDF_Label, theGeomTolL: TDF_Label): void;

  // XCAFDoc_DimTolTool.GetRefGeomToleranceLabels (method)
  GetRefGeomToleranceLabels(theShapeL: TDF_Label, theDimTols: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.AddGeomTolerance (method)
  AddGeomTolerance(): TDF_Label;

  // XCAFDoc_DimTolTool.IsDimTol (method)
  IsDimTol(theLab: TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetDimTolLabels (method)
  GetDimTolLabels(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_DimTolTool.FindDimTol (method)
  FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, lab: TDF_Label): boolean;
  FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

  // XCAFDoc_DimTolTool.AddDimTol (method)
  AddDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

  // XCAFDoc_DimTolTool.SetDimTol (method)
  SetDimTol(theL: TDF_Label, theDimTolL: TDF_Label): void;
  SetDimTol(theL: TDF_Label, theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

  // XCAFDoc_DimTolTool.GetRefShapeLabel (method)
  static GetRefShapeLabel(theL: TDF_Label, theShapeLFirst: NCollection_Sequence_TDF_Label, theShapeLSecond: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetDimTol (method)
  GetDimTol(theDimTolL: TDF_Label, theKind?: number): { returnValue: boolean; theKind: number; theVal: NCollection_HArray1_double; theName: TCollection_HAsciiString; theDescription: TCollection_HAsciiString; [Symbol.dispose](): void };

  // XCAFDoc_DimTolTool.IsDatum (method)
  IsDatum(lab: TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetDatumLabels (method)
  GetDatumLabels(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_DimTolTool.FindDatum (method)
  FindDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString, lab: TDF_Label): boolean;

  // XCAFDoc_DimTolTool.AddDatum (method)
  AddDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): TDF_Label;
  AddDatum(): TDF_Label;

  // XCAFDoc_DimTolTool.SetDatum (method)
  SetDatum(theShapeLabels: NCollection_Sequence_TDF_Label, theDatumL: TDF_Label): void;
  SetDatum(theL: TDF_Label, theTolerL: TDF_Label, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): void;

  // XCAFDoc_DimTolTool.SetDatumToGeomTol (method)
  SetDatumToGeomTol(theDatumL: TDF_Label, theTolerL: TDF_Label): void;

  // XCAFDoc_DimTolTool.GetDatum (method)
  GetDatum(theDatumL: TDF_Label): { returnValue: boolean; theName: TCollection_HAsciiString; theDescription: TCollection_HAsciiString; theIdentification: TCollection_HAsciiString; [Symbol.dispose](): void };

  // XCAFDoc_DimTolTool.GetDatumOfTolerLabels (method)
  static GetDatumOfTolerLabels(theDimTolL: TDF_Label, theDatums: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetDatumWithObjectOfTolerLabels (method)
  static GetDatumWithObjectOfTolerLabels(theDimTolL: TDF_Label, theDatums: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetTolerOfDatumLabels (method)
  GetTolerOfDatumLabels(theDatumL: TDF_Label, theTols: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.GetRefDatumLabel (method)
  GetRefDatumLabel(theShapeL: TDF_Label, theDatum: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_DimTolTool.IsLocked (method)
  IsLocked(theViewL: TDF_Label): boolean;

  // XCAFDoc_DimTolTool.Lock (method)
  Lock(theViewL: TDF_Label): void;

  // XCAFDoc_DimTolTool.GetGDTPresentations (method)
  GetGDTPresentations(theGDTLabelToShape: NCollection_IndexedDataMap_TDF_Label_TopoDS_Shape): void;

  // XCAFDoc_DimTolTool.SetGDTPresentations (method)
  SetGDTPresentations(theGDTLabelToPrs: NCollection_IndexedDataMap_TDF_Label_TopoDS_Shape): void;

  // XCAFDoc_DimTolTool.Unlock (method)
  Unlock(theViewL: TDF_Label): void;

  // XCAFDoc_DimTolTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_DimTolTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_DimTolTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_DimTolTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_DimTolTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_DimTolTool.delete (method)
  delete(): void;

  // XCAFDoc_DimTolTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Dimension: declare class XCAFDoc_Dimension extends TDataStd_GenericEmpty

  // XCAFDoc_Dimension.constructor (constructor)
  constructor();

  // XCAFDoc_Dimension.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Dimension.Set (method)
  static Set(theLabel: TDF_Label): XCAFDoc_Dimension;

  // XCAFDoc_Dimension.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Dimension.SetObject (method)
  SetObject(theDimensionObject: XCAFDimTolObjects_DimensionObject): void;

  // XCAFDoc_Dimension.GetObject (method)
  GetObject(): XCAFDimTolObjects_DimensionObject;

  // XCAFDoc_Dimension.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Dimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Dimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Dimension.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Dimension.delete (method)
  delete(): void;

  // XCAFDoc_Dimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_DocumentTool: declare class XCAFDoc_DocumentTool extends TDataStd_GenericEmpty

  // XCAFDoc_DocumentTool.constructor (constructor)
  constructor();

  // XCAFDoc_DocumentTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_DocumentTool.Set (method)
  static Set(L: TDF_Label, IsAcces?: boolean): XCAFDoc_DocumentTool;

  // XCAFDoc_DocumentTool.IsXCAFDocument (method)
  static IsXCAFDocument(Doc: TDocStd_Document): boolean;

  // XCAFDoc_DocumentTool.DocLabel (method)
  static DocLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.ShapesLabel (method)
  static ShapesLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.ColorsLabel (method)
  static ColorsLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.LayersLabel (method)
  static LayersLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.DGTsLabel (method)
  static DGTsLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.MaterialsLabel (method)
  static MaterialsLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.ViewsLabel (method)
  static ViewsLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.ClippingPlanesLabel (method)
  static ClippingPlanesLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.NotesLabel (method)
  static NotesLabel(acces: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.VisMaterialLabel (method)
  static VisMaterialLabel(theLabel: TDF_Label): TDF_Label;

  // XCAFDoc_DocumentTool.ShapeTool (method)
  static ShapeTool(acces: TDF_Label): XCAFDoc_ShapeTool;

  // XCAFDoc_DocumentTool.CheckShapeTool (method)
  static CheckShapeTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.ColorTool (method)
  static ColorTool(acces: TDF_Label): XCAFDoc_ColorTool;

  // XCAFDoc_DocumentTool.CheckColorTool (method)
  static CheckColorTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.VisMaterialTool (method)
  static VisMaterialTool(theLabel: TDF_Label): XCAFDoc_VisMaterialTool;

  // XCAFDoc_DocumentTool.CheckVisMaterialTool (method)
  static CheckVisMaterialTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.LayerTool (method)
  static LayerTool(acces: TDF_Label): XCAFDoc_LayerTool;

  // XCAFDoc_DocumentTool.CheckLayerTool (method)
  static CheckLayerTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.DimTolTool (method)
  static DimTolTool(acces: TDF_Label): XCAFDoc_DimTolTool;

  // XCAFDoc_DocumentTool.CheckDimTolTool (method)
  static CheckDimTolTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.MaterialTool (method)
  static MaterialTool(acces: TDF_Label): XCAFDoc_MaterialTool;

  // XCAFDoc_DocumentTool.CheckMaterialTool (method)
  static CheckMaterialTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.ViewTool (method)
  static ViewTool(acces: TDF_Label): XCAFDoc_ViewTool;

  // XCAFDoc_DocumentTool.CheckViewTool (method)
  static CheckViewTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.ClippingPlaneTool (method)
  static ClippingPlaneTool(acces: TDF_Label): XCAFDoc_ClippingPlaneTool;

  // XCAFDoc_DocumentTool.CheckClippingPlaneTool (method)
  static CheckClippingPlaneTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.NotesTool (method)
  static NotesTool(acces: TDF_Label): XCAFDoc_NotesTool;

  // XCAFDoc_DocumentTool.CheckNotesTool (method)
  static CheckNotesTool(theAcces: TDF_Label): boolean;

  // XCAFDoc_DocumentTool.GetLengthUnit (method)
  static GetLengthUnit(theDoc: TDocStd_Document, theResut: number, theBaseUnit: UnitsMethods_LengthUnit): { returnValue: boolean; theResut: number };
  static GetLengthUnit(theDoc: TDocStd_Document, theResut?: number): { returnValue: boolean; theResut: number };

  // XCAFDoc_DocumentTool.SetLengthUnit (method)
  static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number): void;
  static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;

  // XCAFDoc_DocumentTool.Init (method)
  Init(): void;

  // XCAFDoc_DocumentTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_DocumentTool.AfterRetrieval (method)
  AfterRetrieval(forceIt?: boolean): boolean;

  // XCAFDoc_DocumentTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_DocumentTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_DocumentTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_DocumentTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_DocumentTool.delete (method)
  delete(): void;

  // XCAFDoc_DocumentTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
