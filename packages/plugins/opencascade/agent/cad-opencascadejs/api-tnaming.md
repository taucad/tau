# libcascade — TNaming

27 top-level symbols. Signatures are verbatim typescript.

TNaming: declare class TNaming

  // TNaming.constructor (constructor)
  constructor();

  // TNaming.Substitute (method)
  static Substitute(labelsource: TDF_Label, labelcible: TDF_Label, mapOldNew: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming.Update (method)
  static Update(label: TDF_Label, mapOldNew: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming.Displace (method)
  static Displace(label: TDF_Label, aLocation: TopLoc_Location, WithOld?: boolean): void;

  // TNaming.ChangeShapes (method)
  static ChangeShapes(label: TDF_Label, M: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming.Transform (method)
  static Transform(label: TDF_Label, aTransformation: gp_Trsf): void;

  // TNaming.Replicate (method)
  static Replicate(NS: TNaming_NamedShape, T: gp_Trsf, L: TDF_Label): void;
  static Replicate(SH: TopoDS_Shape, T: gp_Trsf, L: TDF_Label): void;

  // TNaming.MakeShape (method)
  static MakeShape(MS: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): TopoDS_Shape;

  // TNaming.FindUniqueContext (method)
  static FindUniqueContext(S: TopoDS_Shape, Context: TopoDS_Shape): TopoDS_Shape;

  // TNaming.FindUniqueContextSet (method)
  static FindUniqueContextSet(S: TopoDS_Shape, Context: TopoDS_Shape): { returnValue: TopoDS_Shape; Arr: NCollection_HArray1_TopoDS_Shape; [Symbol.dispose](): void };

  // TNaming.SubstituteSShape (method)
  static SubstituteSShape(accesslabel: TDF_Label, From: TopoDS_Shape, To: TopoDS_Shape): boolean;

  // TNaming.OuterWire (method)
  static OuterWire(theFace: TopoDS_Face, theWire: TopoDS_Wire): boolean;

  // TNaming.OuterShell (method)
  static OuterShell(theSolid: TopoDS_Solid, theShell: TopoDS_Shell): boolean;

  // TNaming.IDList (method)
  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  // TNaming.delete (method)
  delete(): void;

  // TNaming.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Builder: declare class TNaming_Builder

  // TNaming_Builder.constructor (constructor)
  constructor(aLabel: TDF_Label);

  // TNaming_Builder.Generated (method)
  Generated(newShape: TopoDS_Shape): void;
  Generated(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;

  // TNaming_Builder.Delete (method)
  Delete(oldShape: TopoDS_Shape): void;

  // TNaming_Builder.Modify (method)
  Modify(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;

  // TNaming_Builder.Select (method)
  Select(aShape: TopoDS_Shape, inShape: TopoDS_Shape): void;

  // TNaming_Builder.NamedShape (method)
  NamedShape(): TNaming_NamedShape;

  // TNaming_Builder.delete (method)
  delete(): void;

  // TNaming_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_CopyShape: declare class TNaming_CopyShape

  // TNaming_CopyShape.constructor (constructor)
  constructor();

  // TNaming_CopyShape.CopyTool (method)
  static CopyTool(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape): void;

  // TNaming_CopyShape.Translate (method)
  static Translate(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape, TrTool: TNaming_TranslateTool): void;
  static Translate(L: TopLoc_Location, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): TopLoc_Location;

  // TNaming_CopyShape.delete (method)
  delete(): void;

  // TNaming_CopyShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_DeltaOnModification: declare class TNaming_DeltaOnModification extends TDF_DeltaOnModification

  // TNaming_DeltaOnModification.constructor (constructor)
  constructor(NS: TNaming_NamedShape);

  // TNaming_DeltaOnModification.Apply (method)
  Apply(): void;

  // TNaming_DeltaOnModification.get_type_name (method)
  static get_type_name(): string;

  // TNaming_DeltaOnModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TNaming_DeltaOnModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // TNaming_DeltaOnModification.delete (method)
  delete(): void;

  // TNaming_DeltaOnModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_DeltaOnRemoval: declare class TNaming_DeltaOnRemoval extends TDF_DeltaOnRemoval

  // TNaming_DeltaOnRemoval.constructor (constructor)
  constructor(NS: TNaming_NamedShape);

  // TNaming_DeltaOnRemoval.Apply (method)
  Apply(): void;

  // TNaming_DeltaOnRemoval.get_type_name (method)
  static get_type_name(): string;

  // TNaming_DeltaOnRemoval.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TNaming_DeltaOnRemoval.DynamicType (method)
  DynamicType(): Standard_Type;

  // TNaming_DeltaOnRemoval.delete (method)
  delete(): void;

  // TNaming_DeltaOnRemoval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Evolution: typeof TNaming_Evolution[keyof typeof TNaming_Evolution]

  readonly TNaming_PRIMITIVE: 'TNaming_PRIMITIVE'

  readonly TNaming_GENERATED: 'TNaming_GENERATED'

  readonly TNaming_MODIFY: 'TNaming_MODIFY'

  readonly TNaming_DELETE: 'TNaming_DELETE'

  readonly TNaming_REPLACE: 'TNaming_REPLACE'

  readonly TNaming_SELECTED: 'TNaming_SELECTED'

TNaming_Identifier: declare class TNaming_Identifier

  // TNaming_Identifier.constructor (constructor)
  constructor(Lab: TDF_Label, S: TopoDS_Shape, Context: TopoDS_Shape, Geom: boolean);
  constructor(Lab: TDF_Label, S: TopoDS_Shape, ContextNS: TNaming_NamedShape, Geom: boolean);

  // TNaming_Identifier.IsDone (method)
  IsDone(): boolean;

  // TNaming_Identifier.Type (method)
  Type(): TNaming_NameType;

  // TNaming_Identifier.IsFeature (method)
  IsFeature(): boolean;

  // TNaming_Identifier.Feature (method)
  Feature(): TNaming_NamedShape;

  // TNaming_Identifier.InitArgs (method)
  InitArgs(): void;

  // TNaming_Identifier.MoreArgs (method)
  MoreArgs(): boolean;

  // TNaming_Identifier.NextArg (method)
  NextArg(): void;

  // TNaming_Identifier.ArgIsFeature (method)
  ArgIsFeature(): boolean;

  // TNaming_Identifier.FeatureArg (method)
  FeatureArg(): TNaming_NamedShape;

  // TNaming_Identifier.ShapeArg (method)
  ShapeArg(): TopoDS_Shape;

  // TNaming_Identifier.ShapeContext (method)
  ShapeContext(): TopoDS_Shape;

  // TNaming_Identifier.NamedShapeOfGeneration (method)
  NamedShapeOfGeneration(): TNaming_NamedShape;

  // TNaming_Identifier.AncestorIdentification (method)
  AncestorIdentification(Localizer: TNaming_Localizer, Context: TopoDS_Shape): void;

  // TNaming_Identifier.PrimitiveIdentification (method)
  PrimitiveIdentification(Localizer: TNaming_Localizer, NS: TNaming_NamedShape): void;

  // TNaming_Identifier.GeneratedIdentification (method)
  GeneratedIdentification(Localizer: TNaming_Localizer, NS: TNaming_NamedShape): void;

  // TNaming_Identifier.Identification (method)
  Identification(Localizer: TNaming_Localizer, NS: TNaming_NamedShape): void;

  // TNaming_Identifier.delete (method)
  delete(): void;

  // TNaming_Identifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Iterator: declare class TNaming_Iterator

  // TNaming_Iterator.constructor (constructor)
  constructor(anAtt: TNaming_NamedShape);
  constructor(aLabel: TDF_Label);
  constructor(aLabel: TDF_Label, aTrans: number);

  // TNaming_Iterator.More (method)
  More(): boolean;

  // TNaming_Iterator.Next (method)
  Next(): void;

  // TNaming_Iterator.OldShape (method)
  OldShape(): TopoDS_Shape;

  // TNaming_Iterator.NewShape (method)
  NewShape(): TopoDS_Shape;

  // TNaming_Iterator.IsModification (method)
  IsModification(): boolean;

  // TNaming_Iterator.Evolution (method)
  Evolution(): TNaming_Evolution;

  // TNaming_Iterator.delete (method)
  delete(): void;

  // TNaming_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_IteratorOnShapesSet: declare class TNaming_IteratorOnShapesSet

  // TNaming_IteratorOnShapesSet.constructor (constructor)
  constructor();
  constructor(S: TNaming_ShapesSet);

  // TNaming_IteratorOnShapesSet.Init (method)
  Init(S: TNaming_ShapesSet): void;

  // TNaming_IteratorOnShapesSet.More (method)
  More(): boolean;

  // TNaming_IteratorOnShapesSet.Next (method)
  Next(): void;

  // TNaming_IteratorOnShapesSet.Value (method)
  Value(): TopoDS_Shape;

  // TNaming_IteratorOnShapesSet.delete (method)
  delete(): void;

  // TNaming_IteratorOnShapesSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Localizer: declare class TNaming_Localizer

  // TNaming_Localizer.constructor (constructor)
  constructor();

  // TNaming_Localizer.Init (method)
  Init(US: TNaming_UsedShapes, CurTrans: number): void;

  // TNaming_Localizer.SubShapes (method)
  SubShapes(S: TopoDS_Shape, Type: TopAbs_ShapeEnum): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

  // TNaming_Localizer.Ancestors (method)
  Ancestors(S: TopoDS_Shape, Type: TopAbs_ShapeEnum): NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  // TNaming_Localizer.FindFeaturesInAncestors (method)
  FindFeaturesInAncestors(S: TopoDS_Shape, In: TopoDS_Shape, AncInFeatures: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming_Localizer.GoBack (method)
  GoBack(S: TopoDS_Shape, Lab: TDF_Label, Evol: TNaming_Evolution, OldS: NCollection_List_TopoDS_Shape, OldLab: NCollection_List_handle_TNaming_NamedShape): void;

  // TNaming_Localizer.Backward (method)
  Backward(NS: TNaming_NamedShape, S: TopoDS_Shape, Primitives: NCollection_Map_handle_TNaming_NamedShape, ValidShapes: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming_Localizer.FindNeighbourg (method)
  FindNeighbourg(Cont: TopoDS_Shape, S: TopoDS_Shape, Neighbourg: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming_Localizer.IsNew (method)
  static IsNew(S: TopoDS_Shape, NS: TNaming_NamedShape): boolean;

  // TNaming_Localizer.FindGenerator (method)
  static FindGenerator(NS: TNaming_NamedShape, S: TopoDS_Shape, theListOfGenerators: NCollection_List_TopoDS_Shape): void;

  // TNaming_Localizer.FindShapeContext (method)
  static FindShapeContext(NS: TNaming_NamedShape, theS: TopoDS_Shape, theSC: TopoDS_Shape): void;

  // TNaming_Localizer.delete (method)
  delete(): void;

  // TNaming_Localizer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Name: declare class TNaming_Name

  // TNaming_Name.constructor (constructor)
  constructor();

  // TNaming_Name.Type (method)
  Type(aType: TNaming_NameType): void;
  Type(): TNaming_NameType;

  // TNaming_Name.ShapeType (method)
  ShapeType(aType: TopAbs_ShapeEnum): void;
  ShapeType(): TopAbs_ShapeEnum;

  // TNaming_Name.Shape (method)
  Shape(theShape: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;

  // TNaming_Name.Append (method)
  Append(arg: TNaming_NamedShape): void;

  // TNaming_Name.StopNamedShape (method)
  StopNamedShape(arg: TNaming_NamedShape): void;
  StopNamedShape(): TNaming_NamedShape;

  // TNaming_Name.Index (method)
  Index(I: number): void;
  Index(): number;

  // TNaming_Name.ContextLabel (method)
  ContextLabel(theLab: TDF_Label): void;
  ContextLabel(): TDF_Label;

  // TNaming_Name.Orientation (method)
  Orientation(theOrientation: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;

  // TNaming_Name.Arguments (method)
  Arguments(): NCollection_List_handle_TNaming_NamedShape;

  // TNaming_Name.Solve (method)
  Solve(aLab: TDF_Label, Valid: NCollection_Map_TDF_Label): boolean;

  // TNaming_Name.Paste (method)
  Paste(into: TNaming_Name, RT: TDF_RelocationTable): void;

  // TNaming_Name.delete (method)
  delete(): void;

  // TNaming_Name.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_NameType: typeof TNaming_NameType[keyof typeof TNaming_NameType]

  readonly TNaming_UNKNOWN: 'TNaming_UNKNOWN'

  readonly TNaming_IDENTITY: 'TNaming_IDENTITY'

  readonly TNaming_MODIFUNTIL: 'TNaming_MODIFUNTIL'

  readonly TNaming_GENERATION: 'TNaming_GENERATION'

  readonly TNaming_INTERSECTION: 'TNaming_INTERSECTION'

  readonly TNaming_UNION: 'TNaming_UNION'

  readonly TNaming_SUBSTRACTION: 'TNaming_SUBSTRACTION'

  readonly TNaming_CONSTSHAPE: 'TNaming_CONSTSHAPE'

  readonly TNaming_FILTERBYNEIGHBOURGS: 'TNaming_FILTERBYNEIGHBOURGS'

  readonly TNaming_ORIENTATION: 'TNaming_ORIENTATION'

  readonly TNaming_WIREIN: 'TNaming_WIREIN'

  readonly TNaming_SHELLIN: 'TNaming_SHELLIN'

TNaming_NamedShape: declare class TNaming_NamedShape extends TDF_Attribute

  // TNaming_NamedShape.constructor (constructor)
  constructor();

  // TNaming_NamedShape.GetID (method)
  static GetID(): Standard_GUID;

  // TNaming_NamedShape.IsEmpty (method)
  IsEmpty(): boolean;

  // TNaming_NamedShape.Get (method)
  Get(): TopoDS_Shape;

  // TNaming_NamedShape.Evolution (method)
  Evolution(): TNaming_Evolution;

  // TNaming_NamedShape.Version (method)
  Version(): number;

  // TNaming_NamedShape.SetVersion (method)
  SetVersion(version: number): void;

  // TNaming_NamedShape.Clear (method)
  Clear(): void;

  // TNaming_NamedShape.ID (method)
  ID(): Standard_GUID;

  // TNaming_NamedShape.BackupCopy (method)
  BackupCopy(): TDF_Attribute;

  // TNaming_NamedShape.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TNaming_NamedShape.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TNaming_NamedShape.DeltaOnRemoval (method)
  DeltaOnRemoval(): TDF_DeltaOnRemoval;

  // TNaming_NamedShape.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TNaming_NamedShape.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TNaming_NamedShape.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TNaming_NamedShape.BeforeRemoval (method)
  BeforeRemoval(): void;

  // TNaming_NamedShape.BeforeUndo (method)
  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TNaming_NamedShape.AfterUndo (method)
  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TNaming_NamedShape.get_type_name (method)
  static get_type_name(): string;

  // TNaming_NamedShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TNaming_NamedShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // TNaming_NamedShape.delete (method)
  delete(): void;

  // TNaming_NamedShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Naming: declare class TNaming_Naming extends TDF_Attribute

  // TNaming_Naming.constructor (constructor)
  constructor();

  // TNaming_Naming.GetID (method)
  static GetID(): Standard_GUID;

  // TNaming_Naming.Insert (method)
  static Insert(under: TDF_Label): TNaming_Naming;

  // TNaming_Naming.Name (method)
  static Name(where: TDF_Label, Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry?: boolean, KeepOrientation?: boolean, BNproblem?: boolean): TNaming_NamedShape;

  // TNaming_Naming.IsDefined (method)
  IsDefined(): boolean;

  // TNaming_Naming.GetName (method)
  GetName(): TNaming_Name;

  // TNaming_Naming.ChangeName (method)
  ChangeName(): TNaming_Name;

  // TNaming_Naming.Regenerate (method)
  Regenerate(scope: NCollection_Map_TDF_Label): boolean;

  // TNaming_Naming.Solve (method)
  Solve(scope: NCollection_Map_TDF_Label): boolean;

  // TNaming_Naming.ID (method)
  ID(): Standard_GUID;

  // TNaming_Naming.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TNaming_Naming.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TNaming_Naming.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TNaming_Naming.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TNaming_Naming.get_type_name (method)
  static get_type_name(): string;

  // TNaming_Naming.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TNaming_Naming.DynamicType (method)
  DynamicType(): Standard_Type;

  // TNaming_Naming.delete (method)
  delete(): void;

  // TNaming_Naming.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_NamingTool: declare class TNaming_NamingTool

  // TNaming_NamingTool.constructor (constructor)
  constructor();

  // TNaming_NamingTool.CurrentShape (method)
  static CurrentShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, NS: TNaming_NamedShape, MS: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming_NamingTool.CurrentShapeFromShape (method)
  static CurrentShapeFromShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, Acces: TDF_Label, S: TopoDS_Shape, MS: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TNaming_NamingTool.BuildDescendants (method)
  static BuildDescendants(NS: TNaming_NamedShape, Labels: NCollection_Map_TDF_Label): void;

  // TNaming_NamingTool.delete (method)
  delete(): void;

  // TNaming_NamingTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_NewShapeIterator: declare class TNaming_NewShapeIterator

  // TNaming_NewShapeIterator.constructor (constructor)
  constructor(aShape: TopoDS_Shape, access: TDF_Label);
  constructor(aShape: TopoDS_Shape, Transaction: number, access: TDF_Label);

  // TNaming_NewShapeIterator.More (method)
  More(): boolean;

  // TNaming_NewShapeIterator.Next (method)
  Next(): void;

  // TNaming_NewShapeIterator.Label (method)
  Label(): TDF_Label;

  // TNaming_NewShapeIterator.NamedShape (method)
  NamedShape(): TNaming_NamedShape;

  // TNaming_NewShapeIterator.Shape (method)
  Shape(): TopoDS_Shape;

  // TNaming_NewShapeIterator.IsModification (method)
  IsModification(): boolean;

  // TNaming_NewShapeIterator.delete (method)
  delete(): void;

  // TNaming_NewShapeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_OldShapeIterator: declare class TNaming_OldShapeIterator

  // TNaming_OldShapeIterator.constructor (constructor)
  constructor(aShape: TopoDS_Shape, access: TDF_Label);
  constructor(aShape: TopoDS_Shape, Transaction: number, access: TDF_Label);

  // TNaming_OldShapeIterator.More (method)
  More(): boolean;

  // TNaming_OldShapeIterator.Next (method)
  Next(): void;

  // TNaming_OldShapeIterator.Label (method)
  Label(): TDF_Label;

  // TNaming_OldShapeIterator.NamedShape (method)
  NamedShape(): TNaming_NamedShape;

  // TNaming_OldShapeIterator.Shape (method)
  Shape(): TopoDS_Shape;

  // TNaming_OldShapeIterator.IsModification (method)
  IsModification(): boolean;

  // TNaming_OldShapeIterator.delete (method)
  delete(): void;

  // TNaming_OldShapeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_RefShape: declare class TNaming_RefShape

  // TNaming_RefShape.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // TNaming_RefShape.Shape (method)
  Shape(S: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;

  // TNaming_RefShape.FirstUse (method)
  FirstUse(aPtr: unknown): void;
  FirstUse(): unknown;

  // TNaming_RefShape.Label (method)
  Label(): TDF_Label;

  // TNaming_RefShape.NamedShape (method)
  NamedShape(): TNaming_NamedShape;

  // TNaming_RefShape.delete (method)
  delete(): void;

  // TNaming_RefShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_SameShapeIterator: declare class TNaming_SameShapeIterator

  // TNaming_SameShapeIterator.constructor (constructor)
  constructor(aShape: TopoDS_Shape, access: TDF_Label);

  // TNaming_SameShapeIterator.More (method)
  More(): boolean;

  // TNaming_SameShapeIterator.Next (method)
  Next(): void;

  // TNaming_SameShapeIterator.Label (method)
  Label(): TDF_Label;

  // TNaming_SameShapeIterator.delete (method)
  delete(): void;

  // TNaming_SameShapeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Scope: declare class TNaming_Scope

  // TNaming_Scope.constructor (constructor)
  constructor();
  constructor(WithValid: boolean);
  constructor(valid: NCollection_Map_TDF_Label);

  // TNaming_Scope.WithValid (method)
  WithValid(): boolean;
  WithValid(mode: boolean): void;

  // TNaming_Scope.ClearValid (method)
  ClearValid(): void;

  // TNaming_Scope.Valid (method)
  Valid(L: TDF_Label): void;

  // TNaming_Scope.ValidChildren (method)
  ValidChildren(L: TDF_Label, withroot?: boolean): void;

  // TNaming_Scope.Unvalid (method)
  Unvalid(L: TDF_Label): void;

  // TNaming_Scope.UnvalidChildren (method)
  UnvalidChildren(L: TDF_Label, withroot?: boolean): void;

  // TNaming_Scope.IsValid (method)
  IsValid(L: TDF_Label): boolean;

  // TNaming_Scope.GetValid (method)
  GetValid(): NCollection_Map_TDF_Label;

  // TNaming_Scope.ChangeValid (method)
  ChangeValid(): NCollection_Map_TDF_Label;

  // TNaming_Scope.CurrentShape (method)
  CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;

  // TNaming_Scope.delete (method)
  delete(): void;

  // TNaming_Scope.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Selector: declare class TNaming_Selector

  // TNaming_Selector.constructor (constructor)
  constructor(aLabel: TDF_Label);

  // TNaming_Selector.IsIdentified (method)
  static IsIdentified(access: TDF_Label, selection: TopoDS_Shape, Geometry: boolean): { returnValue: boolean; NS: TNaming_NamedShape; [Symbol.dispose](): void };

  // TNaming_Selector.Select (method)
  Select(Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
  Select(Selection: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;

  // TNaming_Selector.Solve (method)
  Solve(Valid: NCollection_Map_TDF_Label): boolean;

  // TNaming_Selector.Arguments (method)
  Arguments(args: NCollection_Map_handle_TDF_Attribute): void;

  // TNaming_Selector.NamedShape (method)
  NamedShape(): TNaming_NamedShape;

  // TNaming_Selector.delete (method)
  delete(): void;

  // TNaming_Selector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_ShapesSet: declare class TNaming_ShapesSet

  // TNaming_ShapesSet.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, Type?: TopAbs_ShapeEnum);

  // TNaming_ShapesSet.Clear (method)
  Clear(): void;

  // TNaming_ShapesSet.Add (method)
  Add(S: TopoDS_Shape): boolean;
  Add(Shapes: TNaming_ShapesSet): void;

  // TNaming_ShapesSet.Contains (method)
  Contains(S: TopoDS_Shape): boolean;

  // TNaming_ShapesSet.Remove (method)
  Remove(S: TopoDS_Shape): boolean;
  Remove(Shapes: TNaming_ShapesSet): void;

  // TNaming_ShapesSet.Filter (method)
  Filter(Shapes: TNaming_ShapesSet): void;

  // TNaming_ShapesSet.IsEmpty (method)
  IsEmpty(): boolean;

  // TNaming_ShapesSet.NbShapes (method)
  NbShapes(): number;

  // TNaming_ShapesSet.ChangeMap (method)
  ChangeMap(): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

  // TNaming_ShapesSet.Map (method)
  Map(): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

  // TNaming_ShapesSet.delete (method)
  delete(): void;

  // TNaming_ShapesSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Tool: declare class TNaming_Tool

  // TNaming_Tool.constructor (constructor)
  constructor();

  // TNaming_Tool.CurrentShape (method)
  static CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;
  static CurrentShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TopoDS_Shape;

  // TNaming_Tool.CurrentNamedShape (method)
  static CurrentNamedShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TNaming_NamedShape;
  static CurrentNamedShape(NS: TNaming_NamedShape): TNaming_NamedShape;

  // TNaming_Tool.NamedShape (method)
  static NamedShape(aShape: TopoDS_Shape, anAcces: TDF_Label): TNaming_NamedShape;

  // TNaming_Tool.GetShape (method)
  static GetShape(NS: TNaming_NamedShape): TopoDS_Shape;

  // TNaming_Tool.OriginalShape (method)
  static OriginalShape(NS: TNaming_NamedShape): TopoDS_Shape;

  // TNaming_Tool.GeneratedShape (method)
  static GeneratedShape(S: TopoDS_Shape, Generation: TNaming_NamedShape): TopoDS_Shape;

  // TNaming_Tool.Collect (method)
  static Collect(NS: TNaming_NamedShape, Labels: NCollection_Map_handle_TNaming_NamedShape, OnlyModif: boolean): void;

  // TNaming_Tool.HasLabel (method)
  static HasLabel(access: TDF_Label, aShape: TopoDS_Shape): boolean;

  // TNaming_Tool.Label (method)
  static Label(access: TDF_Label, aShape: TopoDS_Shape, TransDef?: number): { returnValue: TDF_Label; TransDef: number; [Symbol.dispose](): void };

  // TNaming_Tool.InitialShape (method)
  static InitialShape(aShape: TopoDS_Shape, anAcces: TDF_Label, Labels: NCollection_List_TDF_Label): TopoDS_Shape;

  // TNaming_Tool.ValidUntil (method)
  static ValidUntil(access: TDF_Label, S: TopoDS_Shape): number;

  // TNaming_Tool.FindShape (method)
  static FindShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, Arg: TNaming_NamedShape, S: TopoDS_Shape): void;

  // TNaming_Tool.delete (method)
  delete(): void;

  // TNaming_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_TranslateTool: declare class TNaming_TranslateTool extends Standard_Transient

  // TNaming_TranslateTool.constructor (constructor)
  constructor();

  // TNaming_TranslateTool.Add (method)
  Add(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeVertex (method)
  MakeVertex(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeEdge (method)
  MakeEdge(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeWire (method)
  MakeWire(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeFace (method)
  MakeFace(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeShell (method)
  MakeShell(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeSolid (method)
  MakeSolid(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeCompSolid (method)
  MakeCompSolid(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.MakeCompound (method)
  MakeCompound(S: TopoDS_Shape): void;

  // TNaming_TranslateTool.UpdateVertex (method)
  UpdateVertex(S1: TopoDS_Shape, S2: TopoDS_Shape, M: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  // TNaming_TranslateTool.UpdateEdge (method)
  UpdateEdge(S1: TopoDS_Shape, S2: TopoDS_Shape, M: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  // TNaming_TranslateTool.UpdateFace (method)
  UpdateFace(S1: TopoDS_Shape, S2: TopoDS_Shape, M: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): void;

  // TNaming_TranslateTool.UpdateShape (method)
  UpdateShape(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  // TNaming_TranslateTool.get_type_name (method)
  static get_type_name(): string;

  // TNaming_TranslateTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TNaming_TranslateTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // TNaming_TranslateTool.delete (method)
  delete(): void;

  // TNaming_TranslateTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_Translator: declare class TNaming_Translator

  // TNaming_Translator.constructor (constructor)
  constructor();

  // TNaming_Translator.Add (method)
  Add(aShape: TopoDS_Shape): void;

  // TNaming_Translator.Perform (method)
  Perform(): void;

  // TNaming_Translator.IsDone (method)
  IsDone(): boolean;

  // TNaming_Translator.Copied (method)
  Copied(aShape: TopoDS_Shape): TopoDS_Shape;
  Copied(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  // TNaming_Translator.DumpMap (method)
  DumpMap(isWrite?: boolean): void;

  // TNaming_Translator.delete (method)
  delete(): void;

  // TNaming_Translator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_UsedShapes: declare class TNaming_UsedShapes extends TDF_Attribute

  // TNaming_UsedShapes.Destroy (method)
  Destroy(): void;

  // TNaming_UsedShapes.Map (method)
  Map(): unknown;

  // TNaming_UsedShapes.ID (method)
  ID(): Standard_GUID;

  // TNaming_UsedShapes.GetID (method)
  static GetID(): Standard_GUID;

  // TNaming_UsedShapes.BackupCopy (method)
  BackupCopy(): TDF_Attribute;

  // TNaming_UsedShapes.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TNaming_UsedShapes.BeforeRemoval (method)
  BeforeRemoval(): void;

  // TNaming_UsedShapes.AfterUndo (method)
  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TNaming_UsedShapes.DeltaOnAddition (method)
  DeltaOnAddition(): TDF_DeltaOnAddition;

  // TNaming_UsedShapes.DeltaOnRemoval (method)
  DeltaOnRemoval(): TDF_DeltaOnRemoval;

  // TNaming_UsedShapes.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TNaming_UsedShapes.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TNaming_UsedShapes.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TNaming_UsedShapes.get_type_name (method)
  static get_type_name(): string;

  // TNaming_UsedShapes.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TNaming_UsedShapes.DynamicType (method)
  DynamicType(): Standard_Type;

  // TNaming_UsedShapes.delete (method)
  delete(): void;

  // TNaming_UsedShapes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TNaming_ListOfNamedShape: NCollection_List_handle_TNaming_NamedShape
