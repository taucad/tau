# libcascade — TDataXtd

16 top-level symbols. Signatures are verbatim typescript.

TDataXtd: declare class TDataXtd

  // TDataXtd.constructor (constructor)
  constructor();

  // TDataXtd.IDList (method)
  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  // TDataXtd.delete (method)
  delete(): void;

  // TDataXtd.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Axis: declare class TDataXtd_Axis extends TDataStd_GenericEmpty

  // TDataXtd_Axis.constructor (constructor)
  constructor();

  // TDataXtd_Axis.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Axis.Set (method)
  static Set(label: TDF_Label): TDataXtd_Axis;
  static Set(label: TDF_Label, L: gp_Lin): TDataXtd_Axis;

  // TDataXtd_Axis.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Axis.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Axis.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Axis.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Axis.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Axis.delete (method)
  delete(): void;

  // TDataXtd_Axis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Constraint: declare class TDataXtd_Constraint extends TDF_Attribute

  // TDataXtd_Constraint.constructor (constructor)
  constructor();

  // TDataXtd_Constraint.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Constraint.Set (method)
  static Set(label: TDF_Label): TDataXtd_Constraint;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;

  // TDataXtd_Constraint.Verified (method)
  Verified(): boolean;
  Verified(status: boolean): void;

  // TDataXtd_Constraint.GetType (method)
  GetType(): TDataXtd_ConstraintEnum;

  // TDataXtd_Constraint.IsPlanar (method)
  IsPlanar(): boolean;

  // TDataXtd_Constraint.GetPlane (method)
  GetPlane(): TNaming_NamedShape;

  // TDataXtd_Constraint.IsDimension (method)
  IsDimension(): boolean;

  // TDataXtd_Constraint.GetValue (method)
  GetValue(): TDataStd_Real;

  // TDataXtd_Constraint.NbGeometries (method)
  NbGeometries(): number;

  // TDataXtd_Constraint.GetGeometry (method)
  GetGeometry(Index: number): TNaming_NamedShape;

  // TDataXtd_Constraint.ClearGeometries (method)
  ClearGeometries(): void;

  // TDataXtd_Constraint.SetType (method)
  SetType(CTR: TDataXtd_ConstraintEnum): void;

  // TDataXtd_Constraint.SetPlane (method)
  SetPlane(plane: TNaming_NamedShape): void;

  // TDataXtd_Constraint.SetValue (method)
  SetValue(V: TDataStd_Real): void;

  // TDataXtd_Constraint.SetGeometry (method)
  SetGeometry(Index: number, G: TNaming_NamedShape): void;

  // TDataXtd_Constraint.Inverted (method)
  Inverted(status: boolean): void;
  Inverted(): boolean;

  // TDataXtd_Constraint.Reversed (method)
  Reversed(status: boolean): void;
  Reversed(): boolean;

  // TDataXtd_Constraint.CollectChildConstraints (method)
  static CollectChildConstraints(aLabel: TDF_Label, TheList: NCollection_List_TDF_Label): void;

  // TDataXtd_Constraint.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Constraint.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataXtd_Constraint.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Constraint.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataXtd_Constraint.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataXtd_Constraint.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Constraint.delete (method)
  delete(): void;

  // TDataXtd_Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_ConstraintEnum: typeof TDataXtd_ConstraintEnum[keyof typeof TDataXtd_ConstraintEnum]

  readonly TDataXtd_RADIUS: 'TDataXtd_RADIUS'

  readonly TDataXtd_DIAMETER: 'TDataXtd_DIAMETER'

  readonly TDataXtd_MINOR_RADIUS: 'TDataXtd_MINOR_RADIUS'

  readonly TDataXtd_MAJOR_RADIUS: 'TDataXtd_MAJOR_RADIUS'

  readonly TDataXtd_TANGENT: 'TDataXtd_TANGENT'

  readonly TDataXtd_PARALLEL: 'TDataXtd_PARALLEL'

  readonly TDataXtd_PERPENDICULAR: 'TDataXtd_PERPENDICULAR'

  readonly TDataXtd_CONCENTRIC: 'TDataXtd_CONCENTRIC'

  readonly TDataXtd_COINCIDENT: 'TDataXtd_COINCIDENT'

  readonly TDataXtd_DISTANCE: 'TDataXtd_DISTANCE'

  readonly TDataXtd_ANGLE: 'TDataXtd_ANGLE'

  readonly TDataXtd_EQUAL_RADIUS: 'TDataXtd_EQUAL_RADIUS'

  readonly TDataXtd_SYMMETRY: 'TDataXtd_SYMMETRY'

  readonly TDataXtd_MIDPOINT: 'TDataXtd_MIDPOINT'

  readonly TDataXtd_EQUAL_DISTANCE: 'TDataXtd_EQUAL_DISTANCE'

  readonly TDataXtd_FIX: 'TDataXtd_FIX'

  readonly TDataXtd_RIGID: 'TDataXtd_RIGID'

  readonly TDataXtd_FROM: 'TDataXtd_FROM'

  readonly TDataXtd_AXIS: 'TDataXtd_AXIS'

  readonly TDataXtd_MATE: 'TDataXtd_MATE'

  readonly TDataXtd_ALIGN_FACES: 'TDataXtd_ALIGN_FACES'

  readonly TDataXtd_ALIGN_AXES: 'TDataXtd_ALIGN_AXES'

  readonly TDataXtd_AXES_ANGLE: 'TDataXtd_AXES_ANGLE'

  readonly TDataXtd_FACES_ANGLE: 'TDataXtd_FACES_ANGLE'

  readonly TDataXtd_ROUND: 'TDataXtd_ROUND'

  readonly TDataXtd_OFFSET: 'TDataXtd_OFFSET'

TDataXtd_Geometry: declare class TDataXtd_Geometry extends TDF_Attribute

  // TDataXtd_Geometry.constructor (constructor)
  constructor();

  // TDataXtd_Geometry.Set (method)
  static Set(label: TDF_Label): TDataXtd_Geometry;

  // TDataXtd_Geometry.Type (method)
  static Type(L: TDF_Label): TDataXtd_GeometryEnum;
  static Type(S: TNaming_NamedShape): TDataXtd_GeometryEnum;

  // TDataXtd_Geometry.Point (method)
  static Point(L: TDF_Label, G: gp_Pnt): boolean;
  static Point(S: TNaming_NamedShape, G: gp_Pnt): boolean;

  // TDataXtd_Geometry.Axis (method)
  static Axis(L: TDF_Label, G: gp_Ax1): boolean;
  static Axis(S: TNaming_NamedShape, G: gp_Ax1): boolean;

  // TDataXtd_Geometry.Line (method)
  static Line(L: TDF_Label, G: gp_Lin): boolean;
  static Line(S: TNaming_NamedShape, G: gp_Lin): boolean;

  // TDataXtd_Geometry.Circle (method)
  static Circle(L: TDF_Label, G: gp_Circ): boolean;
  static Circle(S: TNaming_NamedShape, G: gp_Circ): boolean;

  // TDataXtd_Geometry.Ellipse (method)
  static Ellipse(L: TDF_Label, G: gp_Elips): boolean;
  static Ellipse(S: TNaming_NamedShape, G: gp_Elips): boolean;

  // TDataXtd_Geometry.Plane (method)
  static Plane(L: TDF_Label, G: gp_Pln): boolean;
  static Plane(S: TNaming_NamedShape, G: gp_Pln): boolean;

  // TDataXtd_Geometry.Cylinder (method)
  static Cylinder(L: TDF_Label, G: gp_Cylinder): boolean;
  static Cylinder(S: TNaming_NamedShape, G: gp_Cylinder): boolean;

  // TDataXtd_Geometry.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Geometry.SetType (method)
  SetType(T: TDataXtd_GeometryEnum): void;

  // TDataXtd_Geometry.GetType (method)
  GetType(): TDataXtd_GeometryEnum;

  // TDataXtd_Geometry.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Geometry.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataXtd_Geometry.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Geometry.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataXtd_Geometry.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Geometry.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Geometry.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Geometry.delete (method)
  delete(): void;

  // TDataXtd_Geometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_GeometryEnum: typeof TDataXtd_GeometryEnum[keyof typeof TDataXtd_GeometryEnum]

  readonly TDataXtd_ANY_GEOM: 'TDataXtd_ANY_GEOM'

  readonly TDataXtd_POINT: 'TDataXtd_POINT'

  readonly TDataXtd_LINE: 'TDataXtd_LINE'

  readonly TDataXtd_CIRCLE: 'TDataXtd_CIRCLE'

  readonly TDataXtd_ELLIPSE: 'TDataXtd_ELLIPSE'

  readonly TDataXtd_SPLINE: 'TDataXtd_SPLINE'

  readonly TDataXtd_PLANE: 'TDataXtd_PLANE'

  readonly TDataXtd_CYLINDER: 'TDataXtd_CYLINDER'

TDataXtd_Pattern: declare class TDataXtd_Pattern extends TDF_Attribute

  // TDataXtd_Pattern.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Pattern.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Pattern.PatternID (method)
  PatternID(): Standard_GUID;

  // TDataXtd_Pattern.NbTrsfs (method)
  NbTrsfs(): number;

  // TDataXtd_Pattern.ComputeTrsfs (method)
  ComputeTrsfs(Trsfs: NCollection_Array1_gp_Trsf): void;

  // TDataXtd_Pattern.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Pattern.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Pattern.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Pattern.delete (method)
  delete(): void;

  // TDataXtd_Pattern.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_PatternStd: declare class TDataXtd_PatternStd extends TDataXtd_Pattern

  // TDataXtd_PatternStd.constructor (constructor)
  constructor();

  // TDataXtd_PatternStd.GetPatternID (method)
  static GetPatternID(): Standard_GUID;

  // TDataXtd_PatternStd.Set (method)
  static Set(label: TDF_Label): TDataXtd_PatternStd;

  // TDataXtd_PatternStd.Signature (method)
  Signature(signature: number): void;
  Signature(): number;

  // TDataXtd_PatternStd.Axis1 (method)
  Axis1(Axis1: TNaming_NamedShape): void;
  Axis1(): TNaming_NamedShape;

  // TDataXtd_PatternStd.Axis2 (method)
  Axis2(Axis2: TNaming_NamedShape): void;
  Axis2(): TNaming_NamedShape;

  // TDataXtd_PatternStd.Axis1Reversed (method)
  Axis1Reversed(Axis1Reversed: boolean): void;
  Axis1Reversed(): boolean;

  // TDataXtd_PatternStd.Axis2Reversed (method)
  Axis2Reversed(Axis2Reversed: boolean): void;
  Axis2Reversed(): boolean;

  // TDataXtd_PatternStd.Value1 (method)
  Value1(value: TDataStd_Real): void;
  Value1(): TDataStd_Real;

  // TDataXtd_PatternStd.Value2 (method)
  Value2(value: TDataStd_Real): void;
  Value2(): TDataStd_Real;

  // TDataXtd_PatternStd.NbInstances1 (method)
  NbInstances1(NbInstances1: TDataStd_Integer): void;
  NbInstances1(): TDataStd_Integer;

  // TDataXtd_PatternStd.NbInstances2 (method)
  NbInstances2(NbInstances2: TDataStd_Integer): void;
  NbInstances2(): TDataStd_Integer;

  // TDataXtd_PatternStd.Mirror (method)
  Mirror(plane: TNaming_NamedShape): void;
  Mirror(): TNaming_NamedShape;

  // TDataXtd_PatternStd.NbTrsfs (method)
  NbTrsfs(): number;

  // TDataXtd_PatternStd.ComputeTrsfs (method)
  ComputeTrsfs(Trsfs: NCollection_Array1_gp_Trsf): void;

  // TDataXtd_PatternStd.PatternID (method)
  PatternID(): Standard_GUID;

  // TDataXtd_PatternStd.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataXtd_PatternStd.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_PatternStd.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataXtd_PatternStd.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataXtd_PatternStd.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_PatternStd.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_PatternStd.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_PatternStd.delete (method)
  delete(): void;

  // TDataXtd_PatternStd.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Placement: declare class TDataXtd_Placement extends TDataStd_GenericEmpty

  // TDataXtd_Placement.constructor (constructor)
  constructor();

  // TDataXtd_Placement.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Placement.Set (method)
  static Set(label: TDF_Label): TDataXtd_Placement;

  // TDataXtd_Placement.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Placement.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Placement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Placement.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Placement.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Placement.delete (method)
  delete(): void;

  // TDataXtd_Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Plane: declare class TDataXtd_Plane extends TDataStd_GenericEmpty

  // TDataXtd_Plane.constructor (constructor)
  constructor();

  // TDataXtd_Plane.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Plane.Set (method)
  static Set(label: TDF_Label): TDataXtd_Plane;
  static Set(label: TDF_Label, P: gp_Pln): TDataXtd_Plane;

  // TDataXtd_Plane.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Plane.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Plane.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Plane.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Plane.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Plane.delete (method)
  delete(): void;

  // TDataXtd_Plane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Point: declare class TDataXtd_Point extends TDataStd_GenericEmpty

  // TDataXtd_Point.constructor (constructor)
  constructor();

  // TDataXtd_Point.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Point.Set (method)
  static Set(label: TDF_Label): TDataXtd_Point;
  static Set(label: TDF_Label, P: gp_Pnt): TDataXtd_Point;

  // TDataXtd_Point.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Point.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Point.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Point.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Point.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Point.delete (method)
  delete(): void;

  // TDataXtd_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Position: declare class TDataXtd_Position extends TDF_Attribute

  // TDataXtd_Position.constructor (constructor)
  constructor();

  // TDataXtd_Position.Set (method)
  static Set(aLabel: TDF_Label, aPos: gp_Pnt): void;
  static Set(aLabel: TDF_Label): TDataXtd_Position;

  // TDataXtd_Position.Get (method)
  static Get(aLabel: TDF_Label, aPos: gp_Pnt): boolean;

  // TDataXtd_Position.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Position.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Position.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataXtd_Position.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Position.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataXtd_Position.GetPosition (method)
  GetPosition(): gp_Pnt;

  // TDataXtd_Position.SetPosition (method)
  SetPosition(aPos: gp_Pnt): void;

  // TDataXtd_Position.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Position.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Position.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Position.delete (method)
  delete(): void;

  // TDataXtd_Position.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Presentation: declare class TDataXtd_Presentation extends TDF_Attribute

  // TDataXtd_Presentation.constructor (constructor)
  constructor();

  // TDataXtd_Presentation.Set (method)
  static Set(theLabel: TDF_Label, theDriverId: Standard_GUID): TDataXtd_Presentation;

  // TDataXtd_Presentation.Unset (method)
  static Unset(theLabel: TDF_Label): void;

  // TDataXtd_Presentation.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Presentation.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Presentation.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataXtd_Presentation.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Presentation.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataXtd_Presentation.BackupCopy (method)
  BackupCopy(): TDF_Attribute;

  // TDataXtd_Presentation.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Presentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Presentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Presentation.GetDriverGUID (method)
  GetDriverGUID(): Standard_GUID;

  // TDataXtd_Presentation.SetDriverGUID (method)
  SetDriverGUID(theGUID: Standard_GUID): void;

  // TDataXtd_Presentation.IsDisplayed (method)
  IsDisplayed(): boolean;

  // TDataXtd_Presentation.HasOwnMaterial (method)
  HasOwnMaterial(): boolean;

  // TDataXtd_Presentation.HasOwnTransparency (method)
  HasOwnTransparency(): boolean;

  // TDataXtd_Presentation.HasOwnColor (method)
  HasOwnColor(): boolean;

  // TDataXtd_Presentation.HasOwnWidth (method)
  HasOwnWidth(): boolean;

  // TDataXtd_Presentation.HasOwnMode (method)
  HasOwnMode(): boolean;

  // TDataXtd_Presentation.HasOwnSelectionMode (method)
  HasOwnSelectionMode(): boolean;

  // TDataXtd_Presentation.SetDisplayed (method)
  SetDisplayed(theIsDisplayed: boolean): void;

  // TDataXtd_Presentation.SetMaterialIndex (method)
  SetMaterialIndex(theMaterialIndex: number): void;

  // TDataXtd_Presentation.SetTransparency (method)
  SetTransparency(theValue: number): void;

  // TDataXtd_Presentation.SetColor (method)
  SetColor(theColor: Quantity_NameOfColor): void;

  // TDataXtd_Presentation.SetWidth (method)
  SetWidth(theWidth: number): void;

  // TDataXtd_Presentation.SetMode (method)
  SetMode(theMode: number): void;

  // TDataXtd_Presentation.GetNbSelectionModes (method)
  GetNbSelectionModes(): number;

  // TDataXtd_Presentation.SetSelectionMode (method)
  SetSelectionMode(theSelectionMode: number, theTransaction?: boolean): void;

  // TDataXtd_Presentation.AddSelectionMode (method)
  AddSelectionMode(theSelectionMode: number, theTransaction?: boolean): void;

  // TDataXtd_Presentation.MaterialIndex (method)
  MaterialIndex(): number;

  // TDataXtd_Presentation.Transparency (method)
  Transparency(): number;

  // TDataXtd_Presentation.Color (method)
  Color(): Quantity_NameOfColor;

  // TDataXtd_Presentation.Width (method)
  Width(): number;

  // TDataXtd_Presentation.Mode (method)
  Mode(): number;

  // TDataXtd_Presentation.SelectionMode (method)
  SelectionMode(index?: number): number;

  // TDataXtd_Presentation.UnsetMaterial (method)
  UnsetMaterial(): void;

  // TDataXtd_Presentation.UnsetTransparency (method)
  UnsetTransparency(): void;

  // TDataXtd_Presentation.UnsetColor (method)
  UnsetColor(): void;

  // TDataXtd_Presentation.UnsetWidth (method)
  UnsetWidth(): void;

  // TDataXtd_Presentation.UnsetMode (method)
  UnsetMode(): void;

  // TDataXtd_Presentation.UnsetSelectionMode (method)
  UnsetSelectionMode(): void;

  // TDataXtd_Presentation.getColorNameFromOldEnum (method)
  static getColorNameFromOldEnum(theOld: number): Quantity_NameOfColor;

  // TDataXtd_Presentation.getOldColorNameFromNewEnum (method)
  static getOldColorNameFromNewEnum(theNew: Quantity_NameOfColor): number;

  // TDataXtd_Presentation.delete (method)
  delete(): void;

  // TDataXtd_Presentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Shape: declare class TDataXtd_Shape extends TDataStd_GenericEmpty

  // TDataXtd_Shape.constructor (constructor)
  constructor();

  // TDataXtd_Shape.Find (method)
  static Find(current: TDF_Label): { returnValue: boolean; S: TDataXtd_Shape; [Symbol.dispose](): void };

  // TDataXtd_Shape.New (method)
  static New(label: TDF_Label): TDataXtd_Shape;

  // TDataXtd_Shape.Set (method)
  static Set(label: TDF_Label, shape: TopoDS_Shape): TDataXtd_Shape;

  // TDataXtd_Shape.Get (method)
  static Get(label: TDF_Label): TopoDS_Shape;

  // TDataXtd_Shape.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Shape.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Shape.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataXtd_Shape.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Shape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Shape.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Shape.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Shape.delete (method)
  delete(): void;

  // TDataXtd_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Triangulation: declare class TDataXtd_Triangulation extends TDF_Attribute

  // TDataXtd_Triangulation.constructor (constructor)
  constructor();

  // TDataXtd_Triangulation.GetID (method)
  static GetID(): Standard_GUID;

  // TDataXtd_Triangulation.Set (method)
  static Set(theLabel: TDF_Label): TDataXtd_Triangulation;
  static Set(theLabel: TDF_Label, theTriangulation: Poly_Triangulation): TDataXtd_Triangulation;
  Set(theTriangulation: Poly_Triangulation): void;

  // TDataXtd_Triangulation.Get (method)
  Get(): Poly_Triangulation;

  // TDataXtd_Triangulation.Deflection (method)
  Deflection(): number;
  Deflection(theDeflection: number): void;

  // TDataXtd_Triangulation.RemoveUVNodes (method)
  RemoveUVNodes(): void;

  // TDataXtd_Triangulation.NbNodes (method)
  NbNodes(): number;

  // TDataXtd_Triangulation.NbTriangles (method)
  NbTriangles(): number;

  // TDataXtd_Triangulation.HasUVNodes (method)
  HasUVNodes(): boolean;

  // TDataXtd_Triangulation.Node (method)
  Node(theIndex: number): gp_Pnt;

  // TDataXtd_Triangulation.SetNode (method)
  SetNode(theIndex: number, theNode: gp_Pnt): void;

  // TDataXtd_Triangulation.UVNode (method)
  UVNode(theIndex: number): gp_Pnt2d;

  // TDataXtd_Triangulation.SetUVNode (method)
  SetUVNode(theIndex: number, theUVNode: gp_Pnt2d): void;

  // TDataXtd_Triangulation.Triangle (method)
  Triangle(theIndex: number): Poly_Triangle;

  // TDataXtd_Triangulation.SetTriangle (method)
  SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;

  // TDataXtd_Triangulation.SetNormal (method)
  SetNormal(theIndex: number, theNormal: gp_Dir): void;

  // TDataXtd_Triangulation.HasNormals (method)
  HasNormals(): boolean;

  // TDataXtd_Triangulation.Normal (method)
  Normal(theIndex: number): gp_Dir;

  // TDataXtd_Triangulation.ID (method)
  ID(): Standard_GUID;

  // TDataXtd_Triangulation.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataXtd_Triangulation.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataXtd_Triangulation.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataXtd_Triangulation.get_type_name (method)
  static get_type_name(): string;

  // TDataXtd_Triangulation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataXtd_Triangulation.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataXtd_Triangulation.delete (method)
  delete(): void;

  // TDataXtd_Triangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataXtd_Array1OfTrsf: NCollection_Array1_gp_Trsf
