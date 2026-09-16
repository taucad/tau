# libcascade — TNaming

27 top-level symbols. Signatures are verbatim typescript.

TNaming: declare class TNaming

  constructor

  static Substitute(labelsource: TDF_Label, labelcible: TDF_Label, mapOldNew: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static Update(label: TDF_Label, mapOldNew: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static Displace(label: TDF_Label, aLocation: TopLoc_Location, WithOld?: boolean): void;

  static ChangeShapes(label: TDF_Label, M: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static Transform(label: TDF_Label, aTransformation: gp_Trsf): void;

  static Replicate(NS: TNaming_NamedShape, T: gp_Trsf, L: TDF_Label): void;
  static Replicate(SH: TopoDS_Shape, T: gp_Trsf, L: TDF_Label): void;
  static Replicate(NS: TNaming_NamedShape, T: gp_Trsf, L: TDF_Label): void;
  static Replicate(SH: TopoDS_Shape, T: gp_Trsf, L: TDF_Label): void;

  static MakeShape(MS: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): TopoDS_Shape;

  static FindUniqueContext(S: TopoDS_Shape, Context: TopoDS_Shape): TopoDS_Shape;

  static FindUniqueContextSet(S: TopoDS_Shape, Context: TopoDS_Shape): { returnValue: TopoDS_Shape; Arr: NCollection_HArray1_TopoDS_Shape; [Symbol.dispose](): void };

  static SubstituteSShape(accesslabel: TDF_Label, From: TopoDS_Shape, To: TopoDS_Shape): boolean;

  static OuterWire(theFace: TopoDS_Face, theWire: TopoDS_Wire): boolean;

  static OuterShell(theSolid: TopoDS_Solid, theShell: TopoDS_Shell): boolean;

  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Builder: declare class TNaming_Builder

  constructor

  Generated(newShape: TopoDS_Shape): void;
  Generated(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;
  Generated(newShape: TopoDS_Shape): void;
  Generated(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;

  Delete(oldShape: TopoDS_Shape): void;

  Modify(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;

  Select(aShape: TopoDS_Shape, inShape: TopoDS_Shape): void;

  NamedShape(): TNaming_NamedShape;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_CopyShape: declare class TNaming_CopyShape

  constructor

  static CopyTool(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape): void;

  static Translate(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape, TrTool: TNaming_TranslateTool): void;
  static Translate(L: TopLoc_Location, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): TopLoc_Location;
  static Translate(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape, TrTool: TNaming_TranslateTool): void;
  static Translate(L: TopLoc_Location, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): TopLoc_Location;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_DeltaOnModification: declare class TNaming_DeltaOnModification extends TDF_DeltaOnModification

  constructor

  Apply(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_DeltaOnRemoval: declare class TNaming_DeltaOnRemoval extends TDF_DeltaOnRemoval

  constructor

  Apply(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Evolution: typeof TNaming_Evolution[keyof typeof TNaming_Evolution]

TNaming_Identifier: declare class TNaming_Identifier

  constructor

  IsDone(): boolean;

  Type(): TNaming_NameType;

  IsFeature(): boolean;

  Feature(): TNaming_NamedShape;

  InitArgs(): void;

  MoreArgs(): boolean;

  NextArg(): void;

  ArgIsFeature(): boolean;

  FeatureArg(): TNaming_NamedShape;

  ShapeArg(): TopoDS_Shape;

  ShapeContext(): TopoDS_Shape;

  NamedShapeOfGeneration(): TNaming_NamedShape;

  AncestorIdentification(Localizer: TNaming_Localizer, Context: TopoDS_Shape): void;

  PrimitiveIdentification(Localizer: TNaming_Localizer, NS: TNaming_NamedShape): void;

  GeneratedIdentification(Localizer: TNaming_Localizer, NS: TNaming_NamedShape): void;

  Identification(Localizer: TNaming_Localizer, NS: TNaming_NamedShape): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Iterator: declare class TNaming_Iterator

  constructor

  More(): boolean;

  Next(): void;

  OldShape(): TopoDS_Shape;

  NewShape(): TopoDS_Shape;

  IsModification(): boolean;

  Evolution(): TNaming_Evolution;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_IteratorOnShapesSet: declare class TNaming_IteratorOnShapesSet

  constructor

  Init(S: TNaming_ShapesSet): void;

  More(): boolean;

  Next(): void;

  Value(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Localizer: declare class TNaming_Localizer

  constructor

  Init(US: TNaming_UsedShapes, CurTrans: number): void;

  SubShapes(S: TopoDS_Shape, Type: TopAbs_ShapeEnum): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

  Ancestors(S: TopoDS_Shape, Type: TopAbs_ShapeEnum): NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  FindFeaturesInAncestors(S: TopoDS_Shape, In: TopoDS_Shape, AncInFeatures: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  GoBack(S: TopoDS_Shape, Lab: TDF_Label, Evol: TNaming_Evolution, OldS: NCollection_List_TopoDS_Shape, OldLab: NCollection_List_handle_TNaming_NamedShape): void;

  Backward(NS: TNaming_NamedShape, S: TopoDS_Shape, Primitives: NCollection_Map_handle_TNaming_NamedShape, ValidShapes: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  FindNeighbourg(Cont: TopoDS_Shape, S: TopoDS_Shape, Neighbourg: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static IsNew(S: TopoDS_Shape, NS: TNaming_NamedShape): boolean;

  static FindGenerator(NS: TNaming_NamedShape, S: TopoDS_Shape, theListOfGenerators: NCollection_List_TopoDS_Shape): void;

  static FindShapeContext(NS: TNaming_NamedShape, theS: TopoDS_Shape, theSC: TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Name: declare class TNaming_Name

  constructor

  Type(aType: TNaming_NameType): void;
  Type(): TNaming_NameType;
  Type(aType: TNaming_NameType): void;
  Type(): TNaming_NameType;

  ShapeType(aType: TopAbs_ShapeEnum): void;
  ShapeType(): TopAbs_ShapeEnum;
  ShapeType(aType: TopAbs_ShapeEnum): void;
  ShapeType(): TopAbs_ShapeEnum;

  Shape(theShape: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;
  Shape(theShape: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;

  Append(arg: TNaming_NamedShape): void;

  StopNamedShape(arg: TNaming_NamedShape): void;
  StopNamedShape(): TNaming_NamedShape;
  StopNamedShape(arg: TNaming_NamedShape): void;
  StopNamedShape(): TNaming_NamedShape;

  Index(I: number): void;
  Index(): number;
  Index(I: number): void;
  Index(): number;

  ContextLabel(theLab: TDF_Label): void;
  ContextLabel(): TDF_Label;
  ContextLabel(theLab: TDF_Label): void;
  ContextLabel(): TDF_Label;

  Orientation(theOrientation: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;
  Orientation(theOrientation: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  Arguments(): NCollection_List_handle_TNaming_NamedShape;

  Solve(aLab: TDF_Label, Valid: NCollection_Map_TDF_Label): boolean;

  Paste(into: TNaming_Name, RT: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_NameType: typeof TNaming_NameType[keyof typeof TNaming_NameType]

TNaming_NamedShape: declare class TNaming_NamedShape extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  IsEmpty(): boolean;

  Get(): TopoDS_Shape;

  Evolution(): TNaming_Evolution;

  Version(): number;

  SetVersion(version: number): void;

  Clear(): void;

  ID(): Standard_GUID;

  BackupCopy(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  DeltaOnRemoval(): TDF_DeltaOnRemoval;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  BeforeRemoval(): void;

  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Naming: declare class TNaming_Naming extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Insert(under: TDF_Label): TNaming_Naming;

  static Name(where: TDF_Label, Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry?: boolean, KeepOrientation?: boolean, BNproblem?: boolean): TNaming_NamedShape;

  IsDefined(): boolean;

  GetName(): TNaming_Name;

  ChangeName(): TNaming_Name;

  Regenerate(scope: NCollection_Map_TDF_Label): boolean;

  Solve(scope: NCollection_Map_TDF_Label): boolean;

  ID(): Standard_GUID;

  NewEmpty(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_NamingTool: declare class TNaming_NamingTool

  constructor

  static CurrentShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, NS: TNaming_NamedShape, MS: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static CurrentShapeFromShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, Acces: TDF_Label, S: TopoDS_Shape, MS: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static BuildDescendants(NS: TNaming_NamedShape, Labels: NCollection_Map_TDF_Label): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_NewShapeIterator: declare class TNaming_NewShapeIterator

  constructor

  More(): boolean;

  Next(): void;

  Label(): TDF_Label;

  NamedShape(): TNaming_NamedShape;

  Shape(): TopoDS_Shape;

  IsModification(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_OldShapeIterator: declare class TNaming_OldShapeIterator

  constructor

  More(): boolean;

  Next(): void;

  Label(): TDF_Label;

  NamedShape(): TNaming_NamedShape;

  Shape(): TopoDS_Shape;

  IsModification(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_RefShape: declare class TNaming_RefShape

  constructor

  Shape(S: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;
  Shape(S: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;

  FirstUse(aPtr: unknown): void;
  FirstUse(): unknown;
  FirstUse(aPtr: unknown): void;
  FirstUse(): unknown;

  Label(): TDF_Label;

  NamedShape(): TNaming_NamedShape;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_SameShapeIterator: declare class TNaming_SameShapeIterator

  constructor

  More(): boolean;

  Next(): void;

  Label(): TDF_Label;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Scope: declare class TNaming_Scope

  constructor

  WithValid(): boolean;
  WithValid(mode: boolean): void;
  WithValid(): boolean;
  WithValid(mode: boolean): void;

  ClearValid(): void;

  Valid(L: TDF_Label): void;

  ValidChildren(L: TDF_Label, withroot?: boolean): void;

  Unvalid(L: TDF_Label): void;

  UnvalidChildren(L: TDF_Label, withroot?: boolean): void;

  IsValid(L: TDF_Label): boolean;

  GetValid(): NCollection_Map_TDF_Label;

  ChangeValid(): NCollection_Map_TDF_Label;

  CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Selector: declare class TNaming_Selector

  constructor

  static IsIdentified(access: TDF_Label, selection: TopoDS_Shape, Geometry: boolean): { returnValue: boolean; NS: TNaming_NamedShape; [Symbol.dispose](): void };

  Select(Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
  Select(Selection: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
  Select(Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
  Select(Selection: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;

  Solve(Valid: NCollection_Map_TDF_Label): boolean;

  Arguments(args: NCollection_Map_handle_TDF_Attribute): void;

  NamedShape(): TNaming_NamedShape;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_ShapesSet: declare class TNaming_ShapesSet

  constructor

  Clear(): void;

  Add(S: TopoDS_Shape): boolean;
  Add(Shapes: TNaming_ShapesSet): void;
  Add(S: TopoDS_Shape): boolean;
  Add(Shapes: TNaming_ShapesSet): void;

  Contains(S: TopoDS_Shape): boolean;

  Remove(S: TopoDS_Shape): boolean;
  Remove(Shapes: TNaming_ShapesSet): void;
  Remove(S: TopoDS_Shape): boolean;
  Remove(Shapes: TNaming_ShapesSet): void;

  Filter(Shapes: TNaming_ShapesSet): void;

  IsEmpty(): boolean;

  NbShapes(): number;

  ChangeMap(): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

  Map(): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Tool: declare class TNaming_Tool

  constructor

  static CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;
  static CurrentShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TopoDS_Shape;
  static CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;
  static CurrentShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TopoDS_Shape;

  static CurrentNamedShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TNaming_NamedShape;
  static CurrentNamedShape(NS: TNaming_NamedShape): TNaming_NamedShape;
  static CurrentNamedShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TNaming_NamedShape;
  static CurrentNamedShape(NS: TNaming_NamedShape): TNaming_NamedShape;

  static NamedShape(aShape: TopoDS_Shape, anAcces: TDF_Label): TNaming_NamedShape;

  static GetShape(NS: TNaming_NamedShape): TopoDS_Shape;

  static OriginalShape(NS: TNaming_NamedShape): TopoDS_Shape;

  static GeneratedShape(S: TopoDS_Shape, Generation: TNaming_NamedShape): TopoDS_Shape;

  static Collect(NS: TNaming_NamedShape, Labels: NCollection_Map_handle_TNaming_NamedShape, OnlyModif: boolean): void;

  static HasLabel(access: TDF_Label, aShape: TopoDS_Shape): boolean;

  static Label(access: TDF_Label, aShape: TopoDS_Shape, TransDef?: number): { returnValue: TDF_Label; TransDef: number; [Symbol.dispose](): void };

  static InitialShape(aShape: TopoDS_Shape, anAcces: TDF_Label, Labels: NCollection_List_TDF_Label): TopoDS_Shape;

  static ValidUntil(access: TDF_Label, S: TopoDS_Shape): number;

  static FindShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, Arg: TNaming_NamedShape, S: TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_TranslateTool: declare class TNaming_TranslateTool extends Standard_Transient

  constructor

  Add(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  MakeVertex(S: TopoDS_Shape): void;

  MakeEdge(S: TopoDS_Shape): void;

  MakeWire(S: TopoDS_Shape): void;

  MakeFace(S: TopoDS_Shape): void;

  MakeShell(S: TopoDS_Shape): void;

  MakeSolid(S: TopoDS_Shape): void;

  MakeCompSolid(S: TopoDS_Shape): void;

  MakeCompound(S: TopoDS_Shape): void;

  UpdateVertex(S1: TopoDS_Shape, S2: TopoDS_Shape, M: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  UpdateEdge(S1: TopoDS_Shape, S2: TopoDS_Shape, M: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  UpdateFace(S1: TopoDS_Shape, S2: TopoDS_Shape, M: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  UpdateShape(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_Translator: declare class TNaming_Translator

  constructor

  Add(aShape: TopoDS_Shape): void;

  Perform(): void;

  IsDone(): boolean;

  Copied(aShape: TopoDS_Shape): TopoDS_Shape;
  Copied(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;
  Copied(aShape: TopoDS_Shape): TopoDS_Shape;
  Copied(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  DumpMap(isWrite?: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_UsedShapes: declare class TNaming_UsedShapes extends TDF_Attribute

  Destroy(): void;

  Map(): unknown;

  ID(): Standard_GUID;

  static GetID(): Standard_GUID;

  BackupCopy(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  BeforeRemoval(): void;

  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  DeltaOnAddition(): TDF_DeltaOnAddition;

  DeltaOnRemoval(): TDF_DeltaOnRemoval;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TNaming_ListOfNamedShape: NCollection_List_handle_TNaming_NamedShape
