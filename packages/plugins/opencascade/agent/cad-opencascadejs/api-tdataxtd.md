# libcascade — TDataXtd

16 top-level symbols. Signatures are verbatim typescript.

TDataXtd: declare class TDataXtd

  constructor

  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Axis: declare class TDataXtd_Axis extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataXtd_Axis;
  static Set(label: TDF_Label, L: gp_Lin): TDataXtd_Axis;
  static Set(label: TDF_Label): TDataXtd_Axis;
  static Set(label: TDF_Label, L: gp_Lin): TDataXtd_Axis;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Constraint: declare class TDataXtd_Constraint extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataXtd_Constraint;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
  Set(type_: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;

  Verified(): boolean;
  Verified(status: boolean): void;
  Verified(): boolean;
  Verified(status: boolean): void;

  GetType(): TDataXtd_ConstraintEnum;

  IsPlanar(): boolean;

  GetPlane(): TNaming_NamedShape;

  IsDimension(): boolean;

  GetValue(): TDataStd_Real;

  NbGeometries(): number;

  GetGeometry(Index: number): TNaming_NamedShape;

  ClearGeometries(): void;

  SetType(CTR: TDataXtd_ConstraintEnum): void;

  SetPlane(plane: TNaming_NamedShape): void;

  SetValue(V: TDataStd_Real): void;

  SetGeometry(Index: number, G: TNaming_NamedShape): void;

  Inverted(status: boolean): void;
  Inverted(): boolean;
  Inverted(status: boolean): void;
  Inverted(): boolean;

  Reversed(status: boolean): void;
  Reversed(): boolean;
  Reversed(status: boolean): void;
  Reversed(): boolean;

  static CollectChildConstraints(aLabel: TDF_Label, TheList: NCollection_List_TDF_Label): void;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_ConstraintEnum: typeof TDataXtd_ConstraintEnum[keyof typeof TDataXtd_ConstraintEnum]

TDataXtd_Geometry: declare class TDataXtd_Geometry extends TDF_Attribute

  constructor

  static Set(label: TDF_Label): TDataXtd_Geometry;

  static Type(L: TDF_Label): TDataXtd_GeometryEnum;
  static Type(S: TNaming_NamedShape): TDataXtd_GeometryEnum;
  static Type(L: TDF_Label): TDataXtd_GeometryEnum;
  static Type(S: TNaming_NamedShape): TDataXtd_GeometryEnum;

  static Point(L: TDF_Label, G: gp_Pnt): boolean;
  static Point(S: TNaming_NamedShape, G: gp_Pnt): boolean;
  static Point(L: TDF_Label, G: gp_Pnt): boolean;
  static Point(S: TNaming_NamedShape, G: gp_Pnt): boolean;

  static Axis(L: TDF_Label, G: gp_Ax1): boolean;
  static Axis(S: TNaming_NamedShape, G: gp_Ax1): boolean;
  static Axis(L: TDF_Label, G: gp_Ax1): boolean;
  static Axis(S: TNaming_NamedShape, G: gp_Ax1): boolean;

  static Line(L: TDF_Label, G: gp_Lin): boolean;
  static Line(S: TNaming_NamedShape, G: gp_Lin): boolean;
  static Line(L: TDF_Label, G: gp_Lin): boolean;
  static Line(S: TNaming_NamedShape, G: gp_Lin): boolean;

  static Circle(L: TDF_Label, G: gp_Circ): boolean;
  static Circle(S: TNaming_NamedShape, G: gp_Circ): boolean;
  static Circle(L: TDF_Label, G: gp_Circ): boolean;
  static Circle(S: TNaming_NamedShape, G: gp_Circ): boolean;

  static Ellipse(L: TDF_Label, G: gp_Elips): boolean;
  static Ellipse(S: TNaming_NamedShape, G: gp_Elips): boolean;
  static Ellipse(L: TDF_Label, G: gp_Elips): boolean;
  static Ellipse(S: TNaming_NamedShape, G: gp_Elips): boolean;

  static Plane(L: TDF_Label, G: gp_Pln): boolean;
  static Plane(S: TNaming_NamedShape, G: gp_Pln): boolean;
  static Plane(L: TDF_Label, G: gp_Pln): boolean;
  static Plane(S: TNaming_NamedShape, G: gp_Pln): boolean;

  static Cylinder(L: TDF_Label, G: gp_Cylinder): boolean;
  static Cylinder(S: TNaming_NamedShape, G: gp_Cylinder): boolean;
  static Cylinder(L: TDF_Label, G: gp_Cylinder): boolean;
  static Cylinder(S: TNaming_NamedShape, G: gp_Cylinder): boolean;

  static GetID(): Standard_GUID;

  SetType(T: TDataXtd_GeometryEnum): void;

  GetType(): TDataXtd_GeometryEnum;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_GeometryEnum: typeof TDataXtd_GeometryEnum[keyof typeof TDataXtd_GeometryEnum]

TDataXtd_Pattern: declare class TDataXtd_Pattern extends TDF_Attribute

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  PatternID(): Standard_GUID;

  NbTrsfs(): number;

  ComputeTrsfs(Trsfs: NCollection_Array1_gp_Trsf): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_PatternStd: declare class TDataXtd_PatternStd extends TDataXtd_Pattern

  constructor

  static GetPatternID(): Standard_GUID;

  static Set(label: TDF_Label): TDataXtd_PatternStd;

  Signature(signature: number): void;
  Signature(): number;
  Signature(signature: number): void;
  Signature(): number;

  Axis1(Axis1: TNaming_NamedShape): void;
  Axis1(): TNaming_NamedShape;
  Axis1(Axis1: TNaming_NamedShape): void;
  Axis1(): TNaming_NamedShape;

  Axis2(Axis2: TNaming_NamedShape): void;
  Axis2(): TNaming_NamedShape;
  Axis2(Axis2: TNaming_NamedShape): void;
  Axis2(): TNaming_NamedShape;

  Axis1Reversed(Axis1Reversed: boolean): void;
  Axis1Reversed(): boolean;
  Axis1Reversed(Axis1Reversed: boolean): void;
  Axis1Reversed(): boolean;

  Axis2Reversed(Axis2Reversed: boolean): void;
  Axis2Reversed(): boolean;
  Axis2Reversed(Axis2Reversed: boolean): void;
  Axis2Reversed(): boolean;

  Value1(value: TDataStd_Real): void;
  Value1(): TDataStd_Real;
  Value1(value: TDataStd_Real): void;
  Value1(): TDataStd_Real;

  Value2(value: TDataStd_Real): void;
  Value2(): TDataStd_Real;
  Value2(value: TDataStd_Real): void;
  Value2(): TDataStd_Real;

  NbInstances1(NbInstances1: TDataStd_Integer): void;
  NbInstances1(): TDataStd_Integer;
  NbInstances1(NbInstances1: TDataStd_Integer): void;
  NbInstances1(): TDataStd_Integer;

  NbInstances2(NbInstances2: TDataStd_Integer): void;
  NbInstances2(): TDataStd_Integer;
  NbInstances2(NbInstances2: TDataStd_Integer): void;
  NbInstances2(): TDataStd_Integer;

  Mirror(plane: TNaming_NamedShape): void;
  Mirror(): TNaming_NamedShape;
  Mirror(plane: TNaming_NamedShape): void;
  Mirror(): TNaming_NamedShape;

  NbTrsfs(): number;

  ComputeTrsfs(Trsfs: NCollection_Array1_gp_Trsf): void;

  PatternID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Placement: declare class TDataXtd_Placement extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataXtd_Placement;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Plane: declare class TDataXtd_Plane extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataXtd_Plane;
  static Set(label: TDF_Label, P: gp_Pln): TDataXtd_Plane;
  static Set(label: TDF_Label): TDataXtd_Plane;
  static Set(label: TDF_Label, P: gp_Pln): TDataXtd_Plane;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Point: declare class TDataXtd_Point extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataXtd_Point;
  static Set(label: TDF_Label, P: gp_Pnt): TDataXtd_Point;
  static Set(label: TDF_Label): TDataXtd_Point;
  static Set(label: TDF_Label, P: gp_Pnt): TDataXtd_Point;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Position: declare class TDataXtd_Position extends TDF_Attribute

  constructor

  static Set(aLabel: TDF_Label, aPos: gp_Pnt): void;
  static Set(aLabel: TDF_Label): TDataXtd_Position;
  static Set(aLabel: TDF_Label, aPos: gp_Pnt): void;
  static Set(aLabel: TDF_Label): TDataXtd_Position;

  static Get(aLabel: TDF_Label, aPos: gp_Pnt): boolean;

  ID(): Standard_GUID;

  static GetID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  GetPosition(): gp_Pnt;

  SetPosition(aPos: gp_Pnt): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Presentation: declare class TDataXtd_Presentation extends TDF_Attribute

  constructor

  static Set(theLabel: TDF_Label, theDriverId: Standard_GUID): TDataXtd_Presentation;

  static Unset(theLabel: TDF_Label): void;

  ID(): Standard_GUID;

  static GetID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  BackupCopy(): TDF_Attribute;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  GetDriverGUID(): Standard_GUID;

  SetDriverGUID(theGUID: Standard_GUID): void;

  IsDisplayed(): boolean;

  HasOwnMaterial(): boolean;

  HasOwnTransparency(): boolean;

  HasOwnColor(): boolean;

  HasOwnWidth(): boolean;

  HasOwnMode(): boolean;

  HasOwnSelectionMode(): boolean;

  SetDisplayed(theIsDisplayed: boolean): void;

  SetMaterialIndex(theMaterialIndex: number): void;

  SetTransparency(theValue: number): void;

  SetColor(theColor: Quantity_NameOfColor): void;

  SetWidth(theWidth: number): void;

  SetMode(theMode: number): void;

  GetNbSelectionModes(): number;

  SetSelectionMode(theSelectionMode: number, theTransaction?: boolean): void;

  AddSelectionMode(theSelectionMode: number, theTransaction?: boolean): void;

  MaterialIndex(): number;

  Transparency(): number;

  Color(): Quantity_NameOfColor;

  Width(): number;

  Mode(): number;

  SelectionMode(index?: number): number;

  UnsetMaterial(): void;

  UnsetTransparency(): void;

  UnsetColor(): void;

  UnsetWidth(): void;

  UnsetMode(): void;

  UnsetSelectionMode(): void;

  static getColorNameFromOldEnum(theOld: number): Quantity_NameOfColor;

  static getOldColorNameFromNewEnum(theNew: Quantity_NameOfColor): number;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Shape: declare class TDataXtd_Shape extends TDataStd_GenericEmpty

  constructor

  static Find(current: TDF_Label): { returnValue: boolean; S: TDataXtd_Shape; [Symbol.dispose](): void };

  static New(label: TDF_Label): TDataXtd_Shape;

  static Set(label: TDF_Label, shape: TopoDS_Shape): TDataXtd_Shape;

  static Get(label: TDF_Label): TopoDS_Shape;

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Triangulation: declare class TDataXtd_Triangulation extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(theLabel: TDF_Label): TDataXtd_Triangulation;
  static Set(theLabel: TDF_Label, theTriangulation: Poly_Triangulation): TDataXtd_Triangulation;
  Set(theTriangulation: Poly_Triangulation): void;
  static Set(theLabel: TDF_Label): TDataXtd_Triangulation;
  static Set(theLabel: TDF_Label, theTriangulation: Poly_Triangulation): TDataXtd_Triangulation;

  Get(): Poly_Triangulation;

  Deflection(): number;
  Deflection(theDeflection: number): void;
  Deflection(): number;
  Deflection(theDeflection: number): void;

  RemoveUVNodes(): void;

  NbNodes(): number;

  NbTriangles(): number;

  HasUVNodes(): boolean;

  Node(theIndex: number): gp_Pnt;

  SetNode(theIndex: number, theNode: gp_Pnt): void;

  UVNode(theIndex: number): gp_Pnt2d;

  SetUVNode(theIndex: number, theUVNode: gp_Pnt2d): void;

  Triangle(theIndex: number): Poly_Triangle;

  SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;

  SetNormal(theIndex: number, theNormal: gp_Dir): void;

  HasNormals(): boolean;

  Normal(theIndex: number): gp_Dir;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataXtd_Array1OfTrsf: NCollection_Array1_gp_Trsf
