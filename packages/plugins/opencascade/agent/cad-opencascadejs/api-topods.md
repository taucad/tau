# libcascade — TopoDS

28 top-level symbols. Signatures are verbatim typescript.

TopoDS_AlertAttribute: declare class TopoDS_AlertAttribute extends Message_AttributeStream

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  GetShape(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_AlertWithShape: declare class TopoDS_AlertWithShape extends Message_Alert

  constructor

  GetShape(): TopoDS_Shape;

  SetShape(theShape: TopoDS_Shape): void;

  SupportsMerge(): boolean;

  Merge(theTarget: Message_Alert): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Builder: declare class TopoDS_Builder

  constructor

  MakeWire(W: TopoDS_Wire): void;

  MakeShell(S: TopoDS_Shell): void;

  MakeSolid(S: TopoDS_Solid): void;

  MakeCompSolid(C: TopoDS_CompSolid): void;

  MakeCompound(C: TopoDS_Compound): void;

  Add(S: TopoDS_Shape, C: TopoDS_Shape): void;

  Remove(S: TopoDS_Shape, C: TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_CompSolid: declare class TopoDS_CompSolid extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Compound: declare class TopoDS_Compound extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Edge: declare class TopoDS_Edge extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Face: declare class TopoDS_Face extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_FrozenShape: declare class TopoDS_FrozenShape extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_HShape: declare class TopoDS_HShape extends Standard_Transient

  constructor

  Shape(aShape: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;
  Shape(aShape: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;

  ChangeShape(): TopoDS_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Iterator: declare class TopoDS_Iterator

  constructor

  Initialize(S: TopoDS_Shape, cumOri?: boolean, cumLoc?: boolean): void;

  More(): boolean;

  Next(): void;

  Value(): TopoDS_Shape;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_LockedShape: declare class TopoDS_LockedShape extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Shape: declare class TopoDS_Shape

  constructor

  IsNull(): boolean;

  Nullify(): void;

  Location(): TopLoc_Location;
  Location(theLoc: TopLoc_Location, theRaiseExc: boolean): void;
  Location(): TopLoc_Location;
  Location(theLoc: TopLoc_Location, theRaiseExc: boolean): void;

  Located(theLoc: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;

  Orientation(): TopAbs_Orientation;
  Orientation(theOrient: TopAbs_Orientation): void;
  Orientation(): TopAbs_Orientation;
  Orientation(theOrient: TopAbs_Orientation): void;

  Oriented(theOrient: TopAbs_Orientation): TopoDS_Shape;

  TShape(): TopoDS_TShape;
  TShape(theTShape: TopoDS_TShape): void;
  TShape(): TopoDS_TShape;
  TShape(theTShape: TopoDS_TShape): void;

  ShapeType(): TopAbs_ShapeEnum;

  Free(): boolean;
  Free(theIsFree: boolean): void;
  Free(): boolean;
  Free(theIsFree: boolean): void;

  Locked(): boolean;
  Locked(theIsLocked: boolean): void;
  Locked(): boolean;
  Locked(theIsLocked: boolean): void;

  Modified(): boolean;
  Modified(theIsModified: boolean): void;
  Modified(): boolean;
  Modified(theIsModified: boolean): void;

  Checked(): boolean;
  Checked(theIsChecked: boolean): void;
  Checked(): boolean;
  Checked(theIsChecked: boolean): void;

  Orientable(): boolean;
  Orientable(theIsOrientable: boolean): void;
  Orientable(): boolean;
  Orientable(theIsOrientable: boolean): void;

  Closed(): boolean;
  Closed(theIsClosed: boolean): void;
  Closed(): boolean;
  Closed(theIsClosed: boolean): void;

  Infinite(): boolean;
  Infinite(theIsInfinite: boolean): void;
  Infinite(): boolean;
  Infinite(theIsInfinite: boolean): void;

  Convex(): boolean;
  Convex(theIsConvex: boolean): void;
  Convex(): boolean;
  Convex(theIsConvex: boolean): void;

  Move(thePosition: TopLoc_Location, theRaiseExc?: boolean): void;

  Moved(thePosition: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;

  Reverse(): void;

  Reversed(): TopoDS_Shape;

  Complement(): void;

  Complemented(): TopoDS_Shape;

  Compose(theOrient: TopAbs_Orientation): void;

  Composed(theOrient: TopAbs_Orientation): TopoDS_Shape;

  NbChildren(): number;

  IsPartner(theOther: TopoDS_Shape): boolean;

  IsSame(theOther: TopoDS_Shape): boolean;

  IsEqual(theOther: TopoDS_Shape): boolean;

  IsNotEqual(theOther: TopoDS_Shape): boolean;

  EmptyCopy(): void;

  EmptyCopied(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Shell: declare class TopoDS_Shell extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Solid: declare class TopoDS_Solid extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TCompSolid: declare class TopoDS_TCompSolid extends TopoDS_TShape

  constructor

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TCompound: declare class TopoDS_TCompound extends TopoDS_TShape

  constructor

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TEdge: declare class TopoDS_TEdge extends TopoDS_TShape

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TFace: declare class TopoDS_TFace extends TopoDS_TShape

  constructor

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TShape: declare class TopoDS_TShape extends Standard_Transient

  Free(): boolean;
  Free(theIsFree: boolean): void;
  Free(): boolean;
  Free(theIsFree: boolean): void;

  Locked(): boolean;
  Locked(theIsLocked: boolean): void;
  Locked(): boolean;
  Locked(theIsLocked: boolean): void;

  Modified(): boolean;
  Modified(theIsModified: boolean): void;
  Modified(): boolean;
  Modified(theIsModified: boolean): void;

  Checked(): boolean;
  Checked(theIsChecked: boolean): void;
  Checked(): boolean;
  Checked(theIsChecked: boolean): void;

  Orientable(): boolean;
  Orientable(theIsOrientable: boolean): void;
  Orientable(): boolean;
  Orientable(theIsOrientable: boolean): void;

  Closed(): boolean;
  Closed(theIsClosed: boolean): void;
  Closed(): boolean;
  Closed(theIsClosed: boolean): void;

  Infinite(): boolean;
  Infinite(theIsInfinite: boolean): void;
  Infinite(): boolean;
  Infinite(theIsInfinite: boolean): void;

  Convex(): boolean;
  Convex(theIsConvex: boolean): void;
  Convex(): boolean;
  Convex(theIsConvex: boolean): void;

  ShapeType(): TopAbs_ShapeEnum;

  EmptyCopy(): TopoDS_TShape;

  NbChildren(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TShape_BitLayout: typeof TopoDS_TShape_BitLayout[keyof typeof TopoDS_TShape_BitLayout]

TopoDS_TShell: declare class TopoDS_TShell extends TopoDS_TShape

  constructor

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TSolid: declare class TopoDS_TSolid extends TopoDS_TShape

  constructor

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TVertex: declare class TopoDS_TVertex extends TopoDS_TShape

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_TWire: declare class TopoDS_TWire extends TopoDS_TShape

  constructor

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_UnCompatibleShapes: declare class TopoDS_UnCompatibleShapes extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Vertex: declare class TopoDS_Vertex extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS_Wire: declare class TopoDS_Wire extends TopoDS_Shape

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopoDS: declare class TopoDS

  static Edge(shape: TopoDS_Shape): TopoDS_Edge;

  static Wire(shape: TopoDS_Shape): TopoDS_Wire;

  static Face(shape: TopoDS_Shape): TopoDS_Face;

  static Vertex(shape: TopoDS_Shape): TopoDS_Vertex;

  static Shell(shape: TopoDS_Shape): TopoDS_Shell;

  static Solid(shape: TopoDS_Shape): TopoDS_Solid;

  static Compound(shape: TopoDS_Shape): TopoDS_Compound;
