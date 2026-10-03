# libcascade — XCAFDoc (2)

15 top-level symbols. Signatures are verbatim typescript.

XCAFDoc_GeomTolerance: declare class XCAFDoc_GeomTolerance extends TDataStd_GenericEmpty

  // XCAFDoc_GeomTolerance.constructor (constructor)
  constructor();

  // XCAFDoc_GeomTolerance.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_GeomTolerance.Set (method)
  static Set(theLabel: TDF_Label): XCAFDoc_GeomTolerance;

  // XCAFDoc_GeomTolerance.SetObject (method)
  SetObject(theGeomToleranceObject: XCAFDimTolObjects_GeomToleranceObject): void;

  // XCAFDoc_GeomTolerance.GetObject (method)
  GetObject(): XCAFDimTolObjects_GeomToleranceObject;

  // XCAFDoc_GeomTolerance.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_GeomTolerance.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_GeomTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_GeomTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_GeomTolerance.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_GeomTolerance.delete (method)
  delete(): void;

  // XCAFDoc_GeomTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_GraphNode: declare class XCAFDoc_GraphNode extends TDF_Attribute

  // XCAFDoc_GraphNode.constructor (constructor)
  constructor();

  // XCAFDoc_GraphNode.Find (method)
  static Find(L: TDF_Label): { returnValue: boolean; G: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_GraphNode.Set (method)
  static Set(L: TDF_Label): XCAFDoc_GraphNode;
  static Set(L: TDF_Label, ExplicitGraphID: Standard_GUID): XCAFDoc_GraphNode;

  // XCAFDoc_GraphNode.GetDefaultGraphID (method)
  static GetDefaultGraphID(): Standard_GUID;

  // XCAFDoc_GraphNode.SetGraphID (method)
  SetGraphID(explicitID: Standard_GUID): void;

  // XCAFDoc_GraphNode.SetFather (method)
  SetFather(F: XCAFDoc_GraphNode): number;

  // XCAFDoc_GraphNode.SetChild (method)
  SetChild(Ch: XCAFDoc_GraphNode): number;

  // XCAFDoc_GraphNode.UnSetFather (method)
  UnSetFather(F: XCAFDoc_GraphNode): void;
  UnSetFather(Findex: number): void;

  // XCAFDoc_GraphNode.UnSetChild (method)
  UnSetChild(Ch: XCAFDoc_GraphNode): void;
  UnSetChild(Chindex: number): void;

  // XCAFDoc_GraphNode.GetFather (method)
  GetFather(Findex: number): XCAFDoc_GraphNode;

  // XCAFDoc_GraphNode.GetChild (method)
  GetChild(Chindex: number): XCAFDoc_GraphNode;

  // XCAFDoc_GraphNode.FatherIndex (method)
  FatherIndex(F: XCAFDoc_GraphNode): number;

  // XCAFDoc_GraphNode.ChildIndex (method)
  ChildIndex(Ch: XCAFDoc_GraphNode): number;

  // XCAFDoc_GraphNode.IsFather (method)
  IsFather(Ch: XCAFDoc_GraphNode): boolean;

  // XCAFDoc_GraphNode.IsChild (method)
  IsChild(F: XCAFDoc_GraphNode): boolean;

  // XCAFDoc_GraphNode.NbFathers (method)
  NbFathers(): number;

  // XCAFDoc_GraphNode.NbChildren (method)
  NbChildren(): number;

  // XCAFDoc_GraphNode.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_GraphNode.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_GraphNode.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_GraphNode.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_GraphNode.References (method)
  References(aDataSet: TDF_DataSet): void;

  // XCAFDoc_GraphNode.BeforeForget (method)
  BeforeForget(): void;

  // XCAFDoc_GraphNode.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_GraphNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_GraphNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_GraphNode.delete (method)
  delete(): void;

  // XCAFDoc_GraphNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_LayerTool: declare class XCAFDoc_LayerTool extends TDataStd_GenericEmpty

  // XCAFDoc_LayerTool.constructor (constructor)
  constructor();

  // XCAFDoc_LayerTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_LayerTool;

  // XCAFDoc_LayerTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_LayerTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_LayerTool.ShapeTool (method)
  ShapeTool(): XCAFDoc_ShapeTool;

  // XCAFDoc_LayerTool.IsLayer (method)
  IsLayer(lab: TDF_Label): boolean;

  // XCAFDoc_LayerTool.GetLayer (method)
  GetLayer(lab: TDF_Label, aLayer: TCollection_ExtendedString): boolean;

  // XCAFDoc_LayerTool.FindLayer (method)
  FindLayer(aLayer: TCollection_ExtendedString, lab: TDF_Label): boolean;
  FindLayer(aLayer: TCollection_ExtendedString, theToFindWithProperty: boolean, theToFindVisible: boolean): TDF_Label;

  // XCAFDoc_LayerTool.AddLayer (method)
  AddLayer(theLayer: TCollection_ExtendedString): TDF_Label;
  AddLayer(theLayer: TCollection_ExtendedString, theToFindVisible: boolean): TDF_Label;

  // XCAFDoc_LayerTool.RemoveLayer (method)
  RemoveLayer(lab: TDF_Label): void;

  // XCAFDoc_LayerTool.GetLayerLabels (method)
  GetLayerLabels(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_LayerTool.SetLayer (method)
  SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
  SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
  SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
  SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;

  // XCAFDoc_LayerTool.UnSetLayers (method)
  UnSetLayers(L: TDF_Label): void;
  UnSetLayers(Sh: TopoDS_Shape): boolean;

  // XCAFDoc_LayerTool.UnSetOneLayer (method)
  UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
  UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
  UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
  UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;

  // XCAFDoc_LayerTool.IsSet (method)
  IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
  IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
  IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
  IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;

  // XCAFDoc_LayerTool.GetLayers (method)
  GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
  GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
  GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
  GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_LayerTool.GetShapesOfLayer (method)
  static GetShapesOfLayer(theLayerL: TDF_Label, theShLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_LayerTool.IsVisible (method)
  IsVisible(layerL: TDF_Label): boolean;

  // XCAFDoc_LayerTool.SetVisibility (method)
  SetVisibility(layerL: TDF_Label, isvisible?: boolean): void;

  // XCAFDoc_LayerTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_LayerTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_LayerTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_LayerTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_LayerTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_LayerTool.delete (method)
  delete(): void;

  // XCAFDoc_LayerTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_LengthUnit: declare class XCAFDoc_LengthUnit extends TDF_Attribute

  // XCAFDoc_LengthUnit.constructor (constructor)
  constructor();

  // XCAFDoc_LengthUnit.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_LengthUnit.Set (method)
  static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
  static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
  static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
  Set(theUnitName: TCollection_AsciiString, theUnitValue: number): void;

  // XCAFDoc_LengthUnit.GetUnitName (method)
  GetUnitName(): TCollection_AsciiString;

  // XCAFDoc_LengthUnit.GetUnitValue (method)
  GetUnitValue(): number;

  // XCAFDoc_LengthUnit.IsEmpty (method)
  IsEmpty(): boolean;

  // XCAFDoc_LengthUnit.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_LengthUnit.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_LengthUnit.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_LengthUnit.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_LengthUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_LengthUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_LengthUnit.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_LengthUnit.delete (method)
  delete(): void;

  // XCAFDoc_LengthUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Location: declare class XCAFDoc_Location extends TDF_Attribute

  // XCAFDoc_Location.constructor (constructor)
  constructor();

  // XCAFDoc_Location.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Location.Set (method)
  static Set(label: TDF_Label, Loc: TopLoc_Location): XCAFDoc_Location;
  Set(Loc: TopLoc_Location): void;

  // XCAFDoc_Location.Get (method)
  Get(): TopLoc_Location;

  // XCAFDoc_Location.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Location.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_Location.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Location.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_Location.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Location.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Location.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Location.delete (method)
  delete(): void;

  // XCAFDoc_Location.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Material: declare class XCAFDoc_Material extends TDF_Attribute

  // XCAFDoc_Material.constructor (constructor)
  constructor();

  // XCAFDoc_Material.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Material.Set (method)
  static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): XCAFDoc_Material;
  Set(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;

  // XCAFDoc_Material.GetName (method)
  GetName(): TCollection_HAsciiString;

  // XCAFDoc_Material.GetDescription (method)
  GetDescription(): TCollection_HAsciiString;

  // XCAFDoc_Material.GetDensity (method)
  GetDensity(): number;

  // XCAFDoc_Material.GetDensName (method)
  GetDensName(): TCollection_HAsciiString;

  // XCAFDoc_Material.GetDensValType (method)
  GetDensValType(): TCollection_HAsciiString;

  // XCAFDoc_Material.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Material.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_Material.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Material.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_Material.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Material.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Material.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Material.delete (method)
  delete(): void;

  // XCAFDoc_Material.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_MaterialTool: declare class XCAFDoc_MaterialTool extends TDataStd_GenericEmpty

  // XCAFDoc_MaterialTool.constructor (constructor)
  constructor();

  // XCAFDoc_MaterialTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_MaterialTool;

  // XCAFDoc_MaterialTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_MaterialTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_MaterialTool.ShapeTool (method)
  ShapeTool(): XCAFDoc_ShapeTool;

  // XCAFDoc_MaterialTool.IsMaterial (method)
  IsMaterial(lab: TDF_Label): boolean;

  // XCAFDoc_MaterialTool.GetMaterialLabels (method)
  GetMaterialLabels(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_MaterialTool.AddMaterial (method)
  AddMaterial(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): TDF_Label;

  // XCAFDoc_MaterialTool.SetMaterial (method)
  SetMaterial(L: TDF_Label, MatL: TDF_Label): void;
  SetMaterial(L: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;

  // XCAFDoc_MaterialTool.GetMaterial (method)
  static GetMaterial(MatL: TDF_Label, aDensity?: number): { returnValue: boolean; aName: TCollection_HAsciiString; aDescription: TCollection_HAsciiString; aDensity: number; aDensName: TCollection_HAsciiString; aDensValType: TCollection_HAsciiString; [Symbol.dispose](): void };

  // XCAFDoc_MaterialTool.GetDensityForShape (method)
  static GetDensityForShape(ShapeL: TDF_Label): number;

  // XCAFDoc_MaterialTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_MaterialTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_MaterialTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_MaterialTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_MaterialTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_MaterialTool.delete (method)
  delete(): void;

  // XCAFDoc_MaterialTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Note: declare class XCAFDoc_Note extends TDF_Attribute

  // XCAFDoc_Note.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Note.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Note.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Note.IsMine (method)
  static IsMine(theLabel: TDF_Label): boolean;

  // XCAFDoc_Note.Get (method)
  static Get(theLabel: TDF_Label): XCAFDoc_Note;

  // XCAFDoc_Note.Set (method)
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  // XCAFDoc_Note.UserName (method)
  UserName(): TCollection_ExtendedString;

  // XCAFDoc_Note.TimeStamp (method)
  TimeStamp(): TCollection_ExtendedString;

  // XCAFDoc_Note.IsOrphan (method)
  IsOrphan(): boolean;

  // XCAFDoc_Note.GetObject (method)
  GetObject(): XCAFNoteObjects_NoteObject;

  // XCAFDoc_Note.SetObject (method)
  SetObject(theObject: XCAFNoteObjects_NoteObject): void;

  // XCAFDoc_Note.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_Note.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_Note.delete (method)
  delete(): void;

  // XCAFDoc_Note.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_NoteBalloon: declare class XCAFDoc_NoteBalloon extends XCAFDoc_NoteComment

  // XCAFDoc_NoteBalloon.constructor (constructor)
  constructor();

  // XCAFDoc_NoteBalloon.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_NoteBalloon.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_NoteBalloon.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_NoteBalloon.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_NoteBalloon.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_NoteBalloon.Get (method)
  static Get(theLabel: TDF_Label): XCAFDoc_NoteBalloon;

  // XCAFDoc_NoteBalloon.Set (method)
  static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_NoteBalloon;
  Set(theComment: TCollection_ExtendedString): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  // XCAFDoc_NoteBalloon.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_NoteBalloon.delete (method)
  delete(): void;

  // XCAFDoc_NoteBalloon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_NoteBinData: declare class XCAFDoc_NoteBinData extends XCAFDoc_Note

  // XCAFDoc_NoteBinData.constructor (constructor)
  constructor();

  // XCAFDoc_NoteBinData.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_NoteBinData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_NoteBinData.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_NoteBinData.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_NoteBinData.Get (method)
  static Get(theLabel: TDF_Label): XCAFDoc_NoteBinData;

  // XCAFDoc_NoteBinData.Set (method)
  static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): XCAFDoc_NoteBinData;
  Set(theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  // XCAFDoc_NoteBinData.Title (method)
  Title(): TCollection_ExtendedString;

  // XCAFDoc_NoteBinData.MIMEtype (method)
  MIMEtype(): TCollection_AsciiString;

  // XCAFDoc_NoteBinData.Size (method)
  Size(): number;

  // XCAFDoc_NoteBinData.Data (method)
  Data(): TColStd_HArray1OfByte;

  // XCAFDoc_NoteBinData.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_NoteBinData.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_NoteBinData.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_NoteBinData.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_NoteBinData.delete (method)
  delete(): void;

  // XCAFDoc_NoteBinData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_NoteComment: declare class XCAFDoc_NoteComment extends XCAFDoc_Note

  // XCAFDoc_NoteComment.constructor (constructor)
  constructor();

  // XCAFDoc_NoteComment.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_NoteComment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_NoteComment.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_NoteComment.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_NoteComment.Get (method)
  static Get(theLabel: TDF_Label): XCAFDoc_NoteComment;

  // XCAFDoc_NoteComment.Set (method)
  static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_NoteComment;
  Set(theComment: TCollection_ExtendedString): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  // XCAFDoc_NoteComment.Comment (method)
  Comment(): TCollection_ExtendedString;

  // XCAFDoc_NoteComment.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_NoteComment.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_NoteComment.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_NoteComment.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_NoteComment.delete (method)
  delete(): void;

  // XCAFDoc_NoteComment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_NotesTool: declare class XCAFDoc_NotesTool extends TDataStd_GenericEmpty

  // XCAFDoc_NotesTool.constructor (constructor)
  constructor();

  // XCAFDoc_NotesTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_NotesTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_NotesTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_NotesTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_NotesTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_NotesTool.Set (method)
  static Set(theLabel: TDF_Label): XCAFDoc_NotesTool;

  // XCAFDoc_NotesTool.GetNotesLabel (method)
  GetNotesLabel(): TDF_Label;

  // XCAFDoc_NotesTool.GetAnnotatedItemsLabel (method)
  GetAnnotatedItemsLabel(): TDF_Label;

  // XCAFDoc_NotesTool.NbNotes (method)
  NbNotes(): number;

  // XCAFDoc_NotesTool.NbAnnotatedItems (method)
  NbAnnotatedItems(): number;

  // XCAFDoc_NotesTool.GetNotes (method)
  GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
  GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;

  // XCAFDoc_NotesTool.GetAnnotatedItems (method)
  GetAnnotatedItems(theLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_NotesTool.IsAnnotatedItem (method)
  IsAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): boolean;
  IsAnnotatedItem(theItemLabel: TDF_Label): boolean;

  // XCAFDoc_NotesTool.FindAnnotatedItem (method)
  FindAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): TDF_Label;
  FindAnnotatedItem(theItemLabel: TDF_Label): TDF_Label;

  // XCAFDoc_NotesTool.FindAnnotatedItemAttr (method)
  FindAnnotatedItemAttr(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): TDF_Label;
  FindAnnotatedItemAttr(theItemLabel: TDF_Label, theGUID: Standard_GUID): TDF_Label;

  // XCAFDoc_NotesTool.FindAnnotatedItemSubshape (method)
  FindAnnotatedItemSubshape(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): TDF_Label;
  FindAnnotatedItemSubshape(theItemLabel: TDF_Label, theSubshapeIndex: number): TDF_Label;

  // XCAFDoc_NotesTool.CreateComment (method)
  CreateComment(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_Note;

  // XCAFDoc_NotesTool.CreateBalloon (method)
  CreateBalloon(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_Note;

  // XCAFDoc_NotesTool.CreateBinData (method)
  CreateBinData(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): XCAFDoc_Note;

  // XCAFDoc_NotesTool.GetAttrNotes (method)
  GetAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;

  // XCAFDoc_NotesTool.GetSubshapeNotes (method)
  GetSubshapeNotes(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theNoteLabels: NCollection_Sequence_TDF_Label): number;

  // XCAFDoc_NotesTool.AddNote (method)
  AddNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  AddNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label): XCAFDoc_AssemblyItemRef;

  // XCAFDoc_NotesTool.AddNoteToAttr (method)
  AddNoteToAttr(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  AddNoteToAttr(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;

  // XCAFDoc_NotesTool.AddNoteToSubshape (method)
  AddNoteToSubshape(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
  AddNoteToSubshape(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;

  // XCAFDoc_NotesTool.RemoveNote (method)
  RemoveNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
  RemoveNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;

  // XCAFDoc_NotesTool.RemoveSubshapeNote (method)
  RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
  RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;

  // XCAFDoc_NotesTool.RemoveAttrNote (method)
  RemoveAttrNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAttrNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;

  // XCAFDoc_NotesTool.RemoveAllNotes (method)
  RemoveAllNotes(theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
  RemoveAllNotes(theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;

  // XCAFDoc_NotesTool.RemoveAllSubshapeNotes (method)
  RemoveAllSubshapeNotes(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan?: boolean): boolean;

  // XCAFDoc_NotesTool.RemoveAllAttrNotes (method)
  RemoveAllAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAllAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;

  // XCAFDoc_NotesTool.DeleteNote (method)
  DeleteNote(theNoteLabel: TDF_Label): boolean;

  // XCAFDoc_NotesTool.DeleteNotes (method)
  DeleteNotes(theNoteLabels: NCollection_Sequence_TDF_Label): number;

  // XCAFDoc_NotesTool.DeleteAllNotes (method)
  DeleteAllNotes(): number;

  // XCAFDoc_NotesTool.NbOrphanNotes (method)
  NbOrphanNotes(): number;

  // XCAFDoc_NotesTool.GetOrphanNotes (method)
  GetOrphanNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_NotesTool.DeleteOrphanNotes (method)
  DeleteOrphanNotes(): number;

  // XCAFDoc_NotesTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_NotesTool.delete (method)
  delete(): void;

  // XCAFDoc_NotesTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_ShapeMapTool: declare class XCAFDoc_ShapeMapTool extends TDF_Attribute

  // XCAFDoc_ShapeMapTool.constructor (constructor)
  constructor();

  // XCAFDoc_ShapeMapTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_ShapeMapTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_ShapeMapTool;

  // XCAFDoc_ShapeMapTool.IsSubShape (method)
  IsSubShape(sub: TopoDS_Shape): boolean;

  // XCAFDoc_ShapeMapTool.SetShape (method)
  SetShape(S: TopoDS_Shape): void;

  // XCAFDoc_ShapeMapTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_ShapeMapTool.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_ShapeMapTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_ShapeMapTool.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_ShapeMapTool.GetMap (method)
  GetMap(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

  // XCAFDoc_ShapeMapTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_ShapeMapTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_ShapeMapTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_ShapeMapTool.delete (method)
  delete(): void;

  // XCAFDoc_ShapeMapTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_ShapeTool: declare class XCAFDoc_ShapeTool extends TDataStd_GenericEmpty

  // XCAFDoc_ShapeTool.constructor (constructor)
  constructor();

  // XCAFDoc_ShapeTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_ShapeTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_ShapeTool;

  // XCAFDoc_ShapeTool.IsTopLevel (method)
  IsTopLevel(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsFree (method)
  static IsFree(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsShape (method)
  static IsShape(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsSimpleShape (method)
  static IsSimpleShape(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsReference (method)
  static IsReference(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsAssembly (method)
  static IsAssembly(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsComponent (method)
  static IsComponent(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsCompound (method)
  static IsCompound(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsSubShape (method)
  static IsSubShape(L: TDF_Label): boolean;
  IsSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): boolean;

  // XCAFDoc_ShapeTool.SearchUsingMap (method)
  SearchUsingMap(S: TopoDS_Shape, L: TDF_Label, findWithoutLoc: boolean, findSubshape: boolean): boolean;

  // XCAFDoc_ShapeTool.Search (method)
  Search(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean, findComponent: boolean, findSubshape: boolean): boolean;

  // XCAFDoc_ShapeTool.FindShape (method)
  FindShape(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean): boolean;
  FindShape(S: TopoDS_Shape, findInstance: boolean): TDF_Label;

  // XCAFDoc_ShapeTool.GetShape (method)
  static GetShape(L: TDF_Label, S: TopoDS_Shape): boolean;
  static GetShape(L: TDF_Label): TopoDS_Shape;

  // XCAFDoc_ShapeTool.GetOneShape (method)
  static GetOneShape(theLabels: NCollection_Sequence_TDF_Label): TopoDS_Shape;
  GetOneShape(): TopoDS_Shape;

  // XCAFDoc_ShapeTool.NewShape (method)
  NewShape(): TDF_Label;

  // XCAFDoc_ShapeTool.SetShape (method)
  SetShape(L: TDF_Label, S: TopoDS_Shape): void;

  // XCAFDoc_ShapeTool.AddShape (method)
  AddShape(S: TopoDS_Shape, makeAssembly?: boolean, makePrepare?: boolean): TDF_Label;

  // XCAFDoc_ShapeTool.RemoveShape (method)
  RemoveShape(L: TDF_Label, removeCompletely?: boolean): boolean;

  // XCAFDoc_ShapeTool.Init (method)
  Init(): void;

  // XCAFDoc_ShapeTool.SetAutoNaming (method)
  static SetAutoNaming(V: boolean): void;

  // XCAFDoc_ShapeTool.AutoNaming (method)
  static AutoNaming(): boolean;

  // XCAFDoc_ShapeTool.ComputeShapes (method)
  ComputeShapes(L: TDF_Label): void;

  // XCAFDoc_ShapeTool.ComputeSimpleShapes (method)
  ComputeSimpleShapes(): void;

  // XCAFDoc_ShapeTool.GetShapes (method)
  GetShapes(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ShapeTool.GetFreeShapes (method)
  GetFreeShapes(FreeLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ShapeTool.GetUsers (method)
  static GetUsers(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): number;

  // XCAFDoc_ShapeTool.GetLocation (method)
  static GetLocation(L: TDF_Label): TopLoc_Location;

  // XCAFDoc_ShapeTool.GetReferredShape (method)
  static GetReferredShape(L: TDF_Label, Label: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.NbComponents (method)
  static NbComponents(L: TDF_Label, getsubchilds?: boolean): number;

  // XCAFDoc_ShapeTool.GetComponents (method)
  static GetComponents(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): boolean;

  // XCAFDoc_ShapeTool.AddComponent (method)
  AddComponent(assembly: TDF_Label, comp: TDF_Label, Loc: TopLoc_Location): TDF_Label;
  AddComponent(assembly: TDF_Label, comp: TopoDS_Shape, expand: boolean): TDF_Label;

  // XCAFDoc_ShapeTool.RemoveComponent (method)
  RemoveComponent(comp: TDF_Label): void;

  // XCAFDoc_ShapeTool.UpdateAssemblies (method)
  UpdateAssemblies(): void;

  // XCAFDoc_ShapeTool.FindSubShape (method)
  FindSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.AddSubShape (method)
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): TDF_Label;
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, addedSubShapeL: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.FindMainShapeUsingMap (method)
  FindMainShapeUsingMap(sub: TopoDS_Shape): TDF_Label;

  // XCAFDoc_ShapeTool.FindMainShape (method)
  FindMainShape(sub: TopoDS_Shape): TDF_Label;

  // XCAFDoc_ShapeTool.GetSubShapes (method)
  static GetSubShapes(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_ShapeTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_ShapeTool.IsExternRef (method)
  static IsExternRef(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.SetExternRefs (method)
  SetExternRefs(SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): TDF_Label;
  SetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // XCAFDoc_ShapeTool.GetExternRefs (method)
  static GetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // XCAFDoc_ShapeTool.SetSHUO (method)
  SetSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; MainSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_ShapeTool.GetSHUO (method)
  static GetSHUO(SHUOLabel: TDF_Label): { returnValue: boolean; aSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_ShapeTool.GetAllComponentSHUO (method)
  static GetAllComponentSHUO(CompLabel: TDF_Label, SHUOAttrs: NCollection_Sequence_handle_TDF_Attribute): boolean;

  // XCAFDoc_ShapeTool.GetSHUOUpperUsage (method)
  static GetSHUOUpperUsage(NextUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.GetSHUONextUsage (method)
  static GetSHUONextUsage(UpperUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.RemoveSHUO (method)
  RemoveSHUO(SHUOLabel: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.FindComponent (method)
  FindComponent(theShape: TopoDS_Shape, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.GetSHUOInstance (method)
  GetSHUOInstance(theSHUO: XCAFDoc_GraphNode): TopoDS_Shape;

  // XCAFDoc_ShapeTool.SetInstanceSHUO (method)
  SetInstanceSHUO(theShape: TopoDS_Shape): XCAFDoc_GraphNode;

  // XCAFDoc_ShapeTool.GetAllSHUOInstances (method)
  GetAllSHUOInstances(theSHUO: XCAFDoc_GraphNode, theSHUOShapeSeq: NCollection_Sequence_TopoDS_Shape): boolean;

  // XCAFDoc_ShapeTool.FindSHUO (method)
  static FindSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; theSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_ShapeTool.SetLocation (method)
  SetLocation(theShapeLabel: TDF_Label, theLoc: TopLoc_Location, theRefLabel: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.Expand (method)
  Expand(Shape: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.GetNamedProperties (method)
  GetNamedProperties(theLabel: TDF_Label, theToCreate: boolean): TDataStd_NamedData;
  GetNamedProperties(theShape: TopoDS_Shape, theToCreate: boolean): TDataStd_NamedData;

  // XCAFDoc_ShapeTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_ShapeTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_ShapeTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_ShapeTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_ShapeTool.delete (method)
  delete(): void;

  // XCAFDoc_ShapeTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_View: declare class XCAFDoc_View extends TDataStd_GenericEmpty

  // XCAFDoc_View.constructor (constructor)
  constructor();

  // XCAFDoc_View.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_View.Set (method)
  static Set(theLabel: TDF_Label): XCAFDoc_View;

  // XCAFDoc_View.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_View.SetObject (method)
  SetObject(theViewObject: XCAFView_Object): void;

  // XCAFDoc_View.GetObject (method)
  GetObject(): XCAFView_Object;

  // XCAFDoc_View.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_View.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_View.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_View.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_View.delete (method)
  delete(): void;

  // XCAFDoc_View.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
