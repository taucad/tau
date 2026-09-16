# libcascade — XCAFDoc (3)

12 top-level symbols. Signatures are verbatim typescript.

XCAFDoc_Note: declare class XCAFDoc_Note extends TDF_Attribute

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static IsMine(theLabel: TDF_Label): boolean;

  static Get(theLabel: TDF_Label): XCAFDoc_Note;

  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  UserName(): TCollection_ExtendedString;

  TimeStamp(): TCollection_ExtendedString;

  IsOrphan(): boolean;

  GetObject(): XCAFNoteObjects_NoteObject;

  SetObject(theObject: XCAFNoteObjects_NoteObject): void;

  Restore(anAttribute: TDF_Attribute): void;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_NoteBalloon: declare class XCAFDoc_NoteBalloon extends XCAFDoc_NoteComment

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  static GetID(): Standard_GUID;

  static Get(theLabel: TDF_Label): XCAFDoc_NoteBalloon;

  static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_NoteBalloon;
  Set(theComment: TCollection_ExtendedString): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
  Set(theComment: TCollection_ExtendedString): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  ID(): Standard_GUID;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_NoteBinData: declare class XCAFDoc_NoteBinData extends XCAFDoc_Note

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static GetID(): Standard_GUID;

  static Get(theLabel: TDF_Label): XCAFDoc_NoteBinData;

  static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): XCAFDoc_NoteBinData;
  Set(theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
  Set(theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  Title(): TCollection_ExtendedString;

  MIMEtype(): TCollection_AsciiString;

  Size(): number;

  Data(): TColStd_HArray1OfByte;

  ID(): Standard_GUID;

  NewEmpty(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_NoteComment: declare class XCAFDoc_NoteComment extends XCAFDoc_Note

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static GetID(): Standard_GUID;

  static Get(theLabel: TDF_Label): XCAFDoc_NoteComment;

  static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_NoteComment;
  Set(theComment: TCollection_ExtendedString): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
  Set(theComment: TCollection_ExtendedString): void;
  Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

  Comment(): TCollection_ExtendedString;

  ID(): Standard_GUID;

  NewEmpty(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_NotesTool: declare class XCAFDoc_NotesTool extends TDataStd_GenericEmpty

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  static GetID(): Standard_GUID;

  static Set(theLabel: TDF_Label): XCAFDoc_NotesTool;

  GetNotesLabel(): TDF_Label;

  GetAnnotatedItemsLabel(): TDF_Label;

  NbNotes(): number;

  NbAnnotatedItems(): number;

  GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
  GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
  GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
  GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;

  GetAnnotatedItems(theLabels: NCollection_Sequence_TDF_Label): void;

  IsAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): boolean;
  IsAnnotatedItem(theItemLabel: TDF_Label): boolean;
  IsAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): boolean;
  IsAnnotatedItem(theItemLabel: TDF_Label): boolean;

  FindAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): TDF_Label;
  FindAnnotatedItem(theItemLabel: TDF_Label): TDF_Label;
  FindAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): TDF_Label;
  FindAnnotatedItem(theItemLabel: TDF_Label): TDF_Label;

  FindAnnotatedItemAttr(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): TDF_Label;
  FindAnnotatedItemAttr(theItemLabel: TDF_Label, theGUID: Standard_GUID): TDF_Label;
  FindAnnotatedItemAttr(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): TDF_Label;
  FindAnnotatedItemAttr(theItemLabel: TDF_Label, theGUID: Standard_GUID): TDF_Label;

  FindAnnotatedItemSubshape(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): TDF_Label;
  FindAnnotatedItemSubshape(theItemLabel: TDF_Label, theSubshapeIndex: number): TDF_Label;
  FindAnnotatedItemSubshape(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): TDF_Label;
  FindAnnotatedItemSubshape(theItemLabel: TDF_Label, theSubshapeIndex: number): TDF_Label;

  CreateComment(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_Note;

  CreateBalloon(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_Note;

  CreateBinData(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): XCAFDoc_Note;

  GetAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
  GetAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;

  GetSubshapeNotes(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theNoteLabels: NCollection_Sequence_TDF_Label): number;

  AddNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  AddNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label): XCAFDoc_AssemblyItemRef;
  AddNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
  AddNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label): XCAFDoc_AssemblyItemRef;

  AddNoteToAttr(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  AddNoteToAttr(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  AddNoteToAttr(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
  AddNoteToAttr(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;

  AddNoteToSubshape(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
  AddNoteToSubshape(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
  AddNoteToSubshape(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
  AddNoteToSubshape(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;

  RemoveNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
  RemoveNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;
  RemoveNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
  RemoveNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;

  RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
  RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
  RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
  RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;

  RemoveAttrNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAttrNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAttrNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAttrNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;

  RemoveAllNotes(theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
  RemoveAllNotes(theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;
  RemoveAllNotes(theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
  RemoveAllNotes(theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;

  RemoveAllSubshapeNotes(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan?: boolean): boolean;

  RemoveAllAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAllAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAllAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
  RemoveAllAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;

  DeleteNote(theNoteLabel: TDF_Label): boolean;

  DeleteNotes(theNoteLabels: NCollection_Sequence_TDF_Label): number;

  DeleteAllNotes(): number;

  NbOrphanNotes(): number;

  GetOrphanNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;

  DeleteOrphanNotes(): number;

  ID(): Standard_GUID;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_ShapeMapTool: declare class XCAFDoc_ShapeMapTool extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(L: TDF_Label): XCAFDoc_ShapeMapTool;

  IsSubShape(sub: TopoDS_Shape): boolean;

  SetShape(S: TopoDS_Shape): void;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  GetMap(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_ShapeTool: declare class XCAFDoc_ShapeTool extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(L: TDF_Label): XCAFDoc_ShapeTool;

  IsTopLevel(L: TDF_Label): boolean;

  static IsFree(L: TDF_Label): boolean;

  static IsShape(L: TDF_Label): boolean;

  static IsSimpleShape(L: TDF_Label): boolean;

  static IsReference(L: TDF_Label): boolean;

  static IsAssembly(L: TDF_Label): boolean;

  static IsComponent(L: TDF_Label): boolean;

  static IsCompound(L: TDF_Label): boolean;

  static IsSubShape(L: TDF_Label): boolean;
  IsSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): boolean;

  SearchUsingMap(S: TopoDS_Shape, L: TDF_Label, findWithoutLoc: boolean, findSubshape: boolean): boolean;

  Search(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean, findComponent: boolean, findSubshape: boolean): boolean;

  FindShape(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean): boolean;
  FindShape(S: TopoDS_Shape, findInstance: boolean): TDF_Label;
  FindShape(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean): boolean;
  FindShape(S: TopoDS_Shape, findInstance: boolean): TDF_Label;

  static GetShape(L: TDF_Label, S: TopoDS_Shape): boolean;
  static GetShape(L: TDF_Label): TopoDS_Shape;
  static GetShape(L: TDF_Label, S: TopoDS_Shape): boolean;
  static GetShape(L: TDF_Label): TopoDS_Shape;

  static GetOneShape(theLabels: NCollection_Sequence_TDF_Label): TopoDS_Shape;
  GetOneShape(): TopoDS_Shape;

  NewShape(): TDF_Label;

  SetShape(L: TDF_Label, S: TopoDS_Shape): void;

  AddShape(S: TopoDS_Shape, makeAssembly?: boolean, makePrepare?: boolean): TDF_Label;

  RemoveShape(L: TDF_Label, removeCompletely?: boolean): boolean;

  Init(): void;

  static SetAutoNaming(V: boolean): void;

  static AutoNaming(): boolean;

  ComputeShapes(L: TDF_Label): void;

  ComputeSimpleShapes(): void;

  GetShapes(Labels: NCollection_Sequence_TDF_Label): void;

  GetFreeShapes(FreeLabels: NCollection_Sequence_TDF_Label): void;

  static GetUsers(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): number;

  static GetLocation(L: TDF_Label): TopLoc_Location;

  static GetReferredShape(L: TDF_Label, Label: TDF_Label): boolean;

  static NbComponents(L: TDF_Label, getsubchilds?: boolean): number;

  static GetComponents(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): boolean;

  AddComponent(assembly: TDF_Label, comp: TDF_Label, Loc: TopLoc_Location): TDF_Label;
  AddComponent(assembly: TDF_Label, comp: TopoDS_Shape, expand: boolean): TDF_Label;
  AddComponent(assembly: TDF_Label, comp: TDF_Label, Loc: TopLoc_Location): TDF_Label;
  AddComponent(assembly: TDF_Label, comp: TopoDS_Shape, expand: boolean): TDF_Label;

  RemoveComponent(comp: TDF_Label): void;

  UpdateAssemblies(): void;

  FindSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, L: TDF_Label): boolean;

  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): TDF_Label;
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, addedSubShapeL: TDF_Label): boolean;
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): TDF_Label;
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, addedSubShapeL: TDF_Label): boolean;

  FindMainShapeUsingMap(sub: TopoDS_Shape): TDF_Label;

  FindMainShape(sub: TopoDS_Shape): TDF_Label;

  static GetSubShapes(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  BaseLabel(): TDF_Label;

  ID(): Standard_GUID;

  static IsExternRef(L: TDF_Label): boolean;

  SetExternRefs(SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): TDF_Label;
  SetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  SetExternRefs(SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): TDF_Label;
  SetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  static GetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  SetSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; MainSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  static GetSHUO(SHUOLabel: TDF_Label): { returnValue: boolean; aSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  static GetAllComponentSHUO(CompLabel: TDF_Label, SHUOAttrs: NCollection_Sequence_handle_TDF_Attribute): boolean;

  static GetSHUOUpperUsage(NextUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  static GetSHUONextUsage(UpperUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  RemoveSHUO(SHUOLabel: TDF_Label): boolean;

  FindComponent(theShape: TopoDS_Shape, Labels: NCollection_Sequence_TDF_Label): boolean;

  GetSHUOInstance(theSHUO: XCAFDoc_GraphNode): TopoDS_Shape;

  SetInstanceSHUO(theShape: TopoDS_Shape): XCAFDoc_GraphNode;

  GetAllSHUOInstances(theSHUO: XCAFDoc_GraphNode, theSHUOShapeSeq: NCollection_Sequence_TopoDS_Shape): boolean;

  static FindSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; theSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  SetLocation(theShapeLabel: TDF_Label, theLoc: TopLoc_Location, theRefLabel: TDF_Label): boolean;

  Expand(Shape: TDF_Label): boolean;

  GetNamedProperties(theLabel: TDF_Label, theToCreate: boolean): TDataStd_NamedData;
  GetNamedProperties(theShape: TopoDS_Shape, theToCreate: boolean): TDataStd_NamedData;
  GetNamedProperties(theLabel: TDF_Label, theToCreate: boolean): TDataStd_NamedData;
  GetNamedProperties(theShape: TopoDS_Shape, theToCreate: boolean): TDataStd_NamedData;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_View: declare class XCAFDoc_View extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(theLabel: TDF_Label): XCAFDoc_View;

  ID(): Standard_GUID;

  SetObject(theViewObject: XCAFView_Object): void;

  GetObject(): XCAFView_Object;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_ViewTool: declare class XCAFDoc_ViewTool extends TDataStd_GenericEmpty

  constructor

  static Set(L: TDF_Label): XCAFDoc_ViewTool;

  static GetID(): Standard_GUID;

  BaseLabel(): TDF_Label;

  IsView(theLabel: TDF_Label): boolean;

  GetViewLabels(theLabels: NCollection_Sequence_TDF_Label): void;

  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;

  SetClippingPlanes(theClippingPlaneLabels: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;

  RemoveView(theViewL: TDF_Label): void;

  GetViewLabelsForShape(theShapeL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  GetViewLabelsForGDT(theGDTL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  GetViewLabelsForClippingPlane(theClippingPlaneL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  GetViewLabelsForNote(theNoteL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  GetViewLabelsForAnnotation(theAnnotationL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  AddView(): TDF_Label;

  GetRefShapeLabel(theViewL: TDF_Label, theShapeLabels: NCollection_Sequence_TDF_Label): boolean;

  GetRefGDTLabel(theViewL: TDF_Label, theGDTLabels: NCollection_Sequence_TDF_Label): boolean;

  GetRefClippingPlaneLabel(theViewL: TDF_Label, theClippingPlaneLabels: NCollection_Sequence_TDF_Label): boolean;

  GetRefNoteLabel(theViewL: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): boolean;

  GetRefAnnotationLabel(theViewL: TDF_Label, theAnnotationLabels: NCollection_Sequence_TDF_Label): boolean;

  IsLocked(theViewL: TDF_Label): boolean;

  Lock(theViewL: TDF_Label): void;

  Unlock(theViewL: TDF_Label): void;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_VisMaterial: declare class XCAFDoc_VisMaterial extends TDF_Attribute

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static GetID(): Standard_GUID;

  IsEmpty(): boolean;

  FillAspect(theAspect: unknown): void;

  HasPbrMaterial(): boolean;

  PbrMaterial(): XCAFDoc_VisMaterialPBR;

  SetPbrMaterial(theMaterial: XCAFDoc_VisMaterialPBR): void;

  UnsetPbrMaterial(): void;

  HasCommonMaterial(): boolean;

  CommonMaterial(): XCAFDoc_VisMaterialCommon;

  SetCommonMaterial(theMaterial: XCAFDoc_VisMaterialCommon): void;

  UnsetCommonMaterial(): void;

  BaseColor(): Quantity_ColorRGBA;

  AlphaMode(): unknown;

  AlphaCutOff(): number;

  SetAlphaMode(theMode: unknown, theCutOff?: number): void;

  FaceCulling(): unknown;

  SetFaceCulling(theFaceCulling: unknown): void;

  // DEPRECATED
  IsDoubleSided(): boolean;

  // DEPRECATED
  SetDoubleSided(theIsDoubleSided: boolean): void;

  RawName(): TCollection_HAsciiString;

  SetRawName(theName: TCollection_HAsciiString): void;

  IsEqual(theOther: XCAFDoc_VisMaterial): boolean;

  ConvertToCommonMaterial(): XCAFDoc_VisMaterialCommon;

  ConvertToPbrMaterial(): XCAFDoc_VisMaterialPBR;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_VisMaterialCommon: declare class XCAFDoc_VisMaterialCommon

  constructor

  DiffuseTexture: unknown

  AmbientColor: Quantity_Color

  DiffuseColor: Quantity_Color

  SpecularColor: Quantity_Color

  EmissiveColor: Quantity_Color

  Shininess: number

  Transparency: number

  IsDefined: boolean

  IsEqual(theOther: XCAFDoc_VisMaterialCommon): boolean;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_VisMaterialPBR: declare class XCAFDoc_VisMaterialPBR

  constructor

  BaseColorTexture: unknown

  MetallicRoughnessTexture: unknown

  EmissiveTexture: unknown

  OcclusionTexture: unknown

  NormalTexture: unknown

  BaseColor: Quantity_ColorRGBA

  EmissiveFactor: [number, number, number]

  Metallic: number

  Roughness: number

  RefractionIndex: number

  IsDefined: boolean

  IsEqual(theOther: XCAFDoc_VisMaterialPBR): boolean;

  delete(): void;

  [Symbol.dispose](): void;
