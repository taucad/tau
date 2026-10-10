# libcascade — TopoDS

28 top-level symbols. Signatures are verbatim typescript.

TopoDS_AlertAttribute: declare class TopoDS_AlertAttribute extends Message_AttributeStream

  // TopoDS_AlertAttribute.constructor (constructor)
  constructor(theShape: TopoDS_Shape, theName?: TCollection_AsciiString);

  // TopoDS_AlertAttribute.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_AlertAttribute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_AlertAttribute.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_AlertAttribute.GetShape (method)
  GetShape(): TopoDS_Shape;

  // TopoDS_AlertAttribute.delete (method)
  delete(): void;

  // TopoDS_AlertAttribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_AlertWithShape: declare class TopoDS_AlertWithShape extends Message_Alert

  // TopoDS_AlertWithShape.constructor (constructor)
  constructor(theShape: TopoDS_Shape);

  // TopoDS_AlertWithShape.GetShape (method)
  GetShape(): TopoDS_Shape;

  // TopoDS_AlertWithShape.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // TopoDS_AlertWithShape.SupportsMerge (method)
  SupportsMerge(): boolean;

  // TopoDS_AlertWithShape.Merge (method)
  Merge(theTarget: Message_Alert): boolean;

  // TopoDS_AlertWithShape.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_AlertWithShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_AlertWithShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_AlertWithShape.delete (method)
  delete(): void;

  // TopoDS_AlertWithShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Builder: declare class TopoDS_Builder

  // TopoDS_Builder.constructor (constructor)
  constructor();

  // TopoDS_Builder.MakeWire (method)
  MakeWire(W: TopoDS_Wire): void;

  // TopoDS_Builder.MakeShell (method)
  MakeShell(S: TopoDS_Shell): void;

  // TopoDS_Builder.MakeSolid (method)
  MakeSolid(S: TopoDS_Solid): void;

  // TopoDS_Builder.MakeCompSolid (method)
  MakeCompSolid(C: TopoDS_CompSolid): void;

  // TopoDS_Builder.MakeCompound (method)
  MakeCompound(C: TopoDS_Compound): void;

  // TopoDS_Builder.Add (method)
  Add(S: TopoDS_Shape, C: TopoDS_Shape): void;

  // TopoDS_Builder.Remove (method)
  Remove(S: TopoDS_Shape, C: TopoDS_Shape): void;

  // TopoDS_Builder.delete (method)
  delete(): void;

  // TopoDS_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_CompSolid: declare class TopoDS_CompSolid extends TopoDS_Shape

  // TopoDS_CompSolid.constructor (constructor)
  constructor();

  // TopoDS_CompSolid.delete (method)
  delete(): void;

  // TopoDS_CompSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Compound: declare class TopoDS_Compound extends TopoDS_Shape

  // TopoDS_Compound.constructor (constructor)
  constructor();

  // TopoDS_Compound.delete (method)
  delete(): void;

  // TopoDS_Compound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Edge: declare class TopoDS_Edge extends TopoDS_Shape

  // TopoDS_Edge.constructor (constructor)
  constructor();

  // TopoDS_Edge.delete (method)
  delete(): void;

  // TopoDS_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Face: declare class TopoDS_Face extends TopoDS_Shape

  // TopoDS_Face.constructor (constructor)
  constructor();

  // TopoDS_Face.delete (method)
  delete(): void;

  // TopoDS_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_FrozenShape: declare class TopoDS_FrozenShape extends Standard_DomainError

  // TopoDS_FrozenShape.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // TopoDS_FrozenShape.ExceptionType (method)
  ExceptionType(): string;

  // TopoDS_FrozenShape.delete (method)
  delete(): void;

  // TopoDS_FrozenShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_HShape: declare class TopoDS_HShape extends Standard_Transient

  // TopoDS_HShape.constructor (constructor)
  constructor();
  constructor(aShape: TopoDS_Shape);

  // TopoDS_HShape.Shape (method)
  Shape(aShape: TopoDS_Shape): void;
  Shape(): TopoDS_Shape;

  // TopoDS_HShape.ChangeShape (method)
  ChangeShape(): TopoDS_Shape;

  // TopoDS_HShape.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_HShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_HShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_HShape.delete (method)
  delete(): void;

  // TopoDS_HShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Iterator: declare class TopoDS_Iterator

  // TopoDS_Iterator.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, cumOri?: boolean, cumLoc?: boolean);

  // TopoDS_Iterator.Initialize (method)
  Initialize(S: TopoDS_Shape, cumOri?: boolean, cumLoc?: boolean): void;

  // TopoDS_Iterator.More (method)
  More(): boolean;

  // TopoDS_Iterator.Next (method)
  Next(): void;

  // TopoDS_Iterator.Value (method)
  Value(): TopoDS_Shape;

  // TopoDS_Iterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // TopoDS_Iterator.delete (method)
  delete(): void;

  // TopoDS_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_LockedShape: declare class TopoDS_LockedShape extends Standard_DomainError

  // TopoDS_LockedShape.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // TopoDS_LockedShape.ExceptionType (method)
  ExceptionType(): string;

  // TopoDS_LockedShape.delete (method)
  delete(): void;

  // TopoDS_LockedShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Shape: declare class TopoDS_Shape

  // TopoDS_Shape.constructor (constructor)
  constructor();

  // TopoDS_Shape.IsNull (method)
  IsNull(): boolean;

  // TopoDS_Shape.Nullify (method)
  Nullify(): void;

  // TopoDS_Shape.Location (method)
  Location(): TopLoc_Location;
  Location(theLoc: TopLoc_Location, theRaiseExc: boolean): void;

  // TopoDS_Shape.Located (method)
  Located(theLoc: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;

  // TopoDS_Shape.Orientation (method)
  Orientation(): TopAbs_Orientation;
  Orientation(theOrient: TopAbs_Orientation): void;

  // TopoDS_Shape.Oriented (method)
  Oriented(theOrient: TopAbs_Orientation): TopoDS_Shape;

  // TopoDS_Shape.TShape (method)
  TShape(): TopoDS_TShape;
  TShape(theTShape: TopoDS_TShape): void;

  // TopoDS_Shape.ShapeType (method)
  ShapeType(): TopAbs_ShapeEnum;

  // TopoDS_Shape.Free (method)
  Free(): boolean;
  Free(theIsFree: boolean): void;

  // TopoDS_Shape.Locked (method)
  Locked(): boolean;
  Locked(theIsLocked: boolean): void;

  // TopoDS_Shape.Modified (method)
  Modified(): boolean;
  Modified(theIsModified: boolean): void;

  // TopoDS_Shape.Checked (method)
  Checked(): boolean;
  Checked(theIsChecked: boolean): void;

  // TopoDS_Shape.Orientable (method)
  Orientable(): boolean;
  Orientable(theIsOrientable: boolean): void;

  // TopoDS_Shape.Closed (method)
  Closed(): boolean;
  Closed(theIsClosed: boolean): void;

  // TopoDS_Shape.Infinite (method)
  Infinite(): boolean;
  Infinite(theIsInfinite: boolean): void;

  // TopoDS_Shape.Convex (method)
  Convex(): boolean;
  Convex(theIsConvex: boolean): void;

  // TopoDS_Shape.Move (method)
  Move(thePosition: TopLoc_Location, theRaiseExc?: boolean): void;

  // TopoDS_Shape.Moved (method)
  Moved(thePosition: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;

  // TopoDS_Shape.Reverse (method)
  Reverse(): void;

  // TopoDS_Shape.Reversed (method)
  Reversed(): TopoDS_Shape;

  // TopoDS_Shape.Complement (method)
  Complement(): void;

  // TopoDS_Shape.Complemented (method)
  Complemented(): TopoDS_Shape;

  // TopoDS_Shape.Compose (method)
  Compose(theOrient: TopAbs_Orientation): void;

  // TopoDS_Shape.Composed (method)
  Composed(theOrient: TopAbs_Orientation): TopoDS_Shape;

  // TopoDS_Shape.NbChildren (method)
  NbChildren(): number;

  // TopoDS_Shape.IsPartner (method)
  IsPartner(theOther: TopoDS_Shape): boolean;

  // TopoDS_Shape.IsSame (method)
  IsSame(theOther: TopoDS_Shape): boolean;

  // TopoDS_Shape.IsEqual (method)
  IsEqual(theOther: TopoDS_Shape): boolean;

  // TopoDS_Shape.IsNotEqual (method)
  IsNotEqual(theOther: TopoDS_Shape): boolean;

  // TopoDS_Shape.EmptyCopy (method)
  EmptyCopy(): void;

  // TopoDS_Shape.EmptyCopied (method)
  EmptyCopied(): TopoDS_Shape;

  // TopoDS_Shape.delete (method)
  delete(): void;

  // TopoDS_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Shell: declare class TopoDS_Shell extends TopoDS_Shape

  // TopoDS_Shell.constructor (constructor)
  constructor();

  // TopoDS_Shell.delete (method)
  delete(): void;

  // TopoDS_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Solid: declare class TopoDS_Solid extends TopoDS_Shape

  // TopoDS_Solid.constructor (constructor)
  constructor();

  // TopoDS_Solid.delete (method)
  delete(): void;

  // TopoDS_Solid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TCompSolid: declare class TopoDS_TCompSolid extends TopoDS_TShape

  // TopoDS_TCompSolid.constructor (constructor)
  constructor();

  // TopoDS_TCompSolid.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TCompSolid.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TCompSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TCompSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TCompSolid.delete (method)
  delete(): void;

  // TopoDS_TCompSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TCompound: declare class TopoDS_TCompound extends TopoDS_TShape

  // TopoDS_TCompound.constructor (constructor)
  constructor();

  // TopoDS_TCompound.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TCompound.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TCompound.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TCompound.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TCompound.delete (method)
  delete(): void;

  // TopoDS_TCompound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TEdge: declare class TopoDS_TEdge extends TopoDS_TShape

  // TopoDS_TEdge.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TEdge.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TEdge.delete (method)
  delete(): void;

  // TopoDS_TEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TFace: declare class TopoDS_TFace extends TopoDS_TShape

  // TopoDS_TFace.constructor (constructor)
  constructor();

  // TopoDS_TFace.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TFace.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TFace.delete (method)
  delete(): void;

  // TopoDS_TFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TShape: declare class TopoDS_TShape extends Standard_Transient

  // TopoDS_TShape.Free (method)
  Free(): boolean;
  Free(theIsFree: boolean): void;

  // TopoDS_TShape.Locked (method)
  Locked(): boolean;
  Locked(theIsLocked: boolean): void;

  // TopoDS_TShape.Modified (method)
  Modified(): boolean;
  Modified(theIsModified: boolean): void;

  // TopoDS_TShape.Checked (method)
  Checked(): boolean;
  Checked(theIsChecked: boolean): void;

  // TopoDS_TShape.Orientable (method)
  Orientable(): boolean;
  Orientable(theIsOrientable: boolean): void;

  // TopoDS_TShape.Closed (method)
  Closed(): boolean;
  Closed(theIsClosed: boolean): void;

  // TopoDS_TShape.Infinite (method)
  Infinite(): boolean;
  Infinite(theIsInfinite: boolean): void;

  // TopoDS_TShape.Convex (method)
  Convex(): boolean;
  Convex(theIsConvex: boolean): void;

  // TopoDS_TShape.ShapeType (method)
  ShapeType(): TopAbs_ShapeEnum;

  // TopoDS_TShape.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TShape.NbChildren (method)
  NbChildren(): number;

  // TopoDS_TShape.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TShape.delete (method)
  delete(): void;

  // TopoDS_TShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TShape_BitLayout: typeof TopoDS_TShape_BitLayout[keyof typeof TopoDS_TShape_BitLayout]

  readonly Bits_ShapeType_Mask: 'Bits_ShapeType_Mask'

  readonly Bits_ShapeType_Shift: 'Bits_ShapeType_Shift'

  readonly Bit_Free: 'Bit_Free'

  readonly Bit_Modified: 'Bit_Modified'

  readonly Bit_Checked: 'Bit_Checked'

  readonly Bit_Orientable: 'Bit_Orientable'

  readonly Bit_Closed: 'Bit_Closed'

  readonly Bit_Infinite: 'Bit_Infinite'

  readonly Bit_Convex: 'Bit_Convex'

  readonly Bit_Locked: 'Bit_Locked'

  readonly Bits_Reserved: 'Bits_Reserved'

TopoDS_TShell: declare class TopoDS_TShell extends TopoDS_TShape

  // TopoDS_TShell.constructor (constructor)
  constructor();

  // TopoDS_TShell.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TShell.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TShell.delete (method)
  delete(): void;

  // TopoDS_TShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TSolid: declare class TopoDS_TSolid extends TopoDS_TShape

  // TopoDS_TSolid.constructor (constructor)
  constructor();

  // TopoDS_TSolid.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TSolid.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TSolid.delete (method)
  delete(): void;

  // TopoDS_TSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TVertex: declare class TopoDS_TVertex extends TopoDS_TShape

  // TopoDS_TVertex.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TVertex.delete (method)
  delete(): void;

  // TopoDS_TVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_TWire: declare class TopoDS_TWire extends TopoDS_TShape

  // TopoDS_TWire.constructor (constructor)
  constructor();

  // TopoDS_TWire.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // TopoDS_TWire.get_type_name (method)
  static get_type_name(): string;

  // TopoDS_TWire.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopoDS_TWire.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopoDS_TWire.delete (method)
  delete(): void;

  // TopoDS_TWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_UnCompatibleShapes: declare class TopoDS_UnCompatibleShapes extends Standard_DomainError

  // TopoDS_UnCompatibleShapes.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // TopoDS_UnCompatibleShapes.ExceptionType (method)
  ExceptionType(): string;

  // TopoDS_UnCompatibleShapes.delete (method)
  delete(): void;

  // TopoDS_UnCompatibleShapes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Vertex: declare class TopoDS_Vertex extends TopoDS_Shape

  // TopoDS_Vertex.constructor (constructor)
  constructor();

  // TopoDS_Vertex.delete (method)
  delete(): void;

  // TopoDS_Vertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS_Wire: declare class TopoDS_Wire extends TopoDS_Shape

  // TopoDS_Wire.constructor (constructor)
  constructor();

  // TopoDS_Wire.delete (method)
  delete(): void;

  // TopoDS_Wire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopoDS: declare class TopoDS

  // TopoDS.Edge (method)
  static Edge(shape: TopoDS_Shape): TopoDS_Edge;

  // TopoDS.Wire (method)
  static Wire(shape: TopoDS_Shape): TopoDS_Wire;

  // TopoDS.Face (method)
  static Face(shape: TopoDS_Shape): TopoDS_Face;

  // TopoDS.Vertex (method)
  static Vertex(shape: TopoDS_Shape): TopoDS_Vertex;

  // TopoDS.Shell (method)
  static Shell(shape: TopoDS_Shape): TopoDS_Shell;

  // TopoDS.Solid (method)
  static Solid(shape: TopoDS_Shape): TopoDS_Solid;

  // TopoDS.Compound (method)
  static Compound(shape: TopoDS_Shape): TopoDS_Compound;
