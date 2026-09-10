# libcascade — TopoDS

28 top-level symbols. Signatures are verbatim typescript.

// Alert attribute object storing `TopoDS` shape in its field
TopoDS_AlertAttribute: declare class TopoDS_AlertAttribute extends Message_AttributeStream

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns contained shape
GetShape(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Alert object storing `TopoDS` shape in its field
TopoDS_AlertWithShape: declare class TopoDS_AlertWithShape extends Message_Alert

constructor

// Returns contained shape
GetShape(): TopoDS_Shape;

// Sets the shape
SetShape(theShape: TopoDS_Shape): void;

// Returns false
SupportsMerge(): boolean;

// Returns false
Merge(theTarget: Message_Alert): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Builder is used to create Topological Data Structures
TopoDS_Builder: declare class TopoDS_Builder

constructor

// Make an empty Wire
MakeWire(W: TopoDS_Wire): void;
// W: Mutated in place

// Make an empty Shell
MakeShell(S: TopoDS_Shell): void;
// S: Mutated in place

// Make a Solid covering the whole 3D space
MakeSolid(S: TopoDS_Solid): void;
// S: Mutated in place

// Make an empty Composite Solid
MakeCompSolid(C: TopoDS_CompSolid): void;
// C: Mutated in place

// Make an empty Compound
MakeCompound(C: TopoDS_Compound): void;
// C: Mutated in place

// Add the Shape C in the Shape S
Add(S: TopoDS_Shape, C: TopoDS_Shape): void;
// S: Mutated in place

// Remove the Shape C from the Shape S
Remove(S: TopoDS_Shape, C: TopoDS_Shape): void;
// S: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a composite solid which
TopoDS_CompSolid: declare class TopoDS_CompSolid extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a compound which
TopoDS_Compound: declare class TopoDS_Compound extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an edge which
TopoDS_Edge: declare class TopoDS_Edge extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a face which
TopoDS_Face: declare class TopoDS_Face extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopoDS_FrozenShape: declare class TopoDS_FrozenShape extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class to manipulate a Shape with handle
TopoDS_HShape: declare class TopoDS_HShape extends Standard_Transient

constructor

// Loads this shape with the shape aShape
Shape(aShape: TopoDS_Shape): void;
Shape(): TopoDS_Shape;
Shape(aShape: TopoDS_Shape): void;
Shape(): TopoDS_Shape;

// Exchanges the {@link TopoDS_Shape`TopoDS_Shape`} object defining this shape for another one referencing the same underlying shape Accesses the list of shapes within the underlying shape referenced by the {@link TopoDS_Shape`TopoDS_Shape`} object
ChangeShape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on the underlying shape underlying a given {@link TopoDS_Shape`TopoDS_Shape`} object, providing access to its component sub-shapes
TopoDS_Iterator: declare class TopoDS_Iterator

constructor

// Initializes this iterator with shape S
Initialize(S: TopoDS_Shape, cumOri?: boolean, cumLoc?: boolean): void;

// Returns true if there is another sub-shape in the shape which this iterator is scanning
More(): boolean;

// Moves on to the next sub-shape in the shape which this iterator is scanning
Next(): void;

// Returns the current sub-shape in the shape which this iterator is scanning
Value(): TopoDS_Shape;

// Returns a sentinel marking the end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopoDS_LockedShape: declare class TopoDS_LockedShape extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a shape which
TopoDS_Shape: declare class TopoDS_Shape

constructor

// Returns true if this shape is null
IsNull(): boolean;

// Destroys the reference to the underlying shape stored in this shape
Nullify(): void;

// Returns the shape local coordinate system
Location(): TopLoc_Location;
Location(theLoc: TopLoc_Location, theRaiseExc: boolean): void;
Location(): TopLoc_Location;
Location(theLoc: TopLoc_Location, theRaiseExc: boolean): void;

// Returns a shape similar to <me> with the local coordinate system set to <Loc>
Located(theLoc: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;
// theLoc: the new local coordinate system
// theRaiseExc: flag to raise exception in case of transformation with scale or negative

// Returns the shape orientation
Orientation(): TopAbs_Orientation;
Orientation(theOrient: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;
Orientation(theOrient: TopAbs_Orientation): void;

// Returns a shape similar to <me> with the orientation set to <Or>
Oriented(theOrient: TopAbs_Orientation): TopoDS_Shape;

// Returns a handle to the actual shape implementation
TShape(): TopoDS_TShape;
TShape(theTShape: TopoDS_TShape): void;
TShape(): TopoDS_TShape;
TShape(theTShape: TopoDS_TShape): void;

// Returns the value of the TopAbs_ShapeEnum enumeration that corresponds to this shape, for example VERTEX, EDGE, and so on
ShapeType(): TopAbs_ShapeEnum;

// Returns the free flag
Free(): boolean;
Free(theIsFree: boolean): void;
Free(): boolean;
Free(theIsFree: boolean): void;

// Returns the locked flag
Locked(): boolean;
Locked(theIsLocked: boolean): void;
Locked(): boolean;
Locked(theIsLocked: boolean): void;

// Returns the modification flag
Modified(): boolean;
Modified(theIsModified: boolean): void;
Modified(): boolean;
Modified(theIsModified: boolean): void;

// Returns the checked flag
Checked(): boolean;
Checked(theIsChecked: boolean): void;
Checked(): boolean;
Checked(theIsChecked: boolean): void;

// Returns the orientability flag
Orientable(): boolean;
Orientable(theIsOrientable: boolean): void;
Orientable(): boolean;
Orientable(theIsOrientable: boolean): void;

// Returns the closedness flag
Closed(): boolean;
Closed(theIsClosed: boolean): void;
Closed(): boolean;
Closed(theIsClosed: boolean): void;

// Returns the infinity flag
Infinite(): boolean;
Infinite(theIsInfinite: boolean): void;
Infinite(): boolean;
Infinite(theIsInfinite: boolean): void;

// Returns the convexness flag
Convex(): boolean;
Convex(theIsConvex: boolean): void;
Convex(): boolean;
Convex(theIsConvex: boolean): void;

// Multiplies the Shape location by thePosition
Move(thePosition: TopLoc_Location, theRaiseExc?: boolean): void;
// thePosition: the transformation to apply
// theRaiseExc: flag to raise exception in case of transformation with scale or negative

// Returns a shape similar to <me> with a location multiplied by thePosition
Moved(thePosition: TopLoc_Location, theRaiseExc?: boolean): TopoDS_Shape;
// thePosition: the transformation to apply
// theRaiseExc: flag to raise exception in case of transformation with scale or negative

// Reverses the orientation, using the Reverse method from the {@link TopAbs `TopAbs`} package
Reverse(): void;

// Returns a shape similar to <me> with the orientation reversed, using the Reverse method from the {@link TopAbs `TopAbs`} package
Reversed(): TopoDS_Shape;

// Complements the orientation, using the Complement method from the {@link TopAbs `TopAbs`} package
Complement(): void;

// Returns a shape similar to <me> with the orientation complemented, using the Complement method from the {@link TopAbs `TopAbs`} package
Complemented(): TopoDS_Shape;

// Updates the Shape Orientation by composition with theOrient, using the Compose method from the {@link TopAbs `TopAbs`} package
Compose(theOrient: TopAbs_Orientation): void;

// Returns a shape similar to <me> with the orientation composed with theOrient, using the Compose method from the {@link TopAbs `TopAbs`} package
Composed(theOrient: TopAbs_Orientation): TopoDS_Shape;

// Returns the number of direct sub-shapes (children)
NbChildren(): number;

// Returns True if two shapes are partners, i.e
IsPartner(theOther: TopoDS_Shape): boolean;

// Returns True if two shapes are same, i.e
IsSame(theOther: TopoDS_Shape): boolean;

// Returns True if two shapes are equal, i.e
IsEqual(theOther: TopoDS_Shape): boolean;

// Negation of the IsEqual method
IsNotEqual(theOther: TopoDS_Shape): boolean;

// Replace <me> by a new Shape with the same Orientation and Location and a new TShape with the same geometry and no sub-shapes
EmptyCopy(): void;

// Returns a new Shape with the same Orientation and Location and a new TShape with the same geometry and no sub-shapes
EmptyCopied(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a shell which
TopoDS_Shell: declare class TopoDS_Shell extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a solid shape which
TopoDS_Solid: declare class TopoDS_Solid extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A set of solids connected by their faces
TopoDS_TCompSolid: declare class TopoDS_TCompSolid extends TopoDS_TShape

constructor

// Returns an empty TCompSolid
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A TCompound is an all-purpose set of Shapes
TopoDS_TCompound: declare class TopoDS_TCompound extends TopoDS_TShape

constructor

// Returns an empty TCompound
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A topological part of a curve in 2D or 3D, the boundary is a set of oriented Vertices
TopoDS_TEdge: declare class TopoDS_TEdge extends TopoDS_TShape

// Returns an empty TEdge
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A topological part of a surface or of the 2D space
TopoDS_TFace: declare class TopoDS_TFace extends TopoDS_TShape

constructor

// Returns an empty TFace
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A TShape is a topological structure describing a set of points in a 2D or 3D space
TopoDS_TShape: declare class TopoDS_TShape extends Standard_Transient

// Returns the free flag
Free(): boolean;
Free(theIsFree: boolean): void;
Free(): boolean;
Free(theIsFree: boolean): void;

// Returns the locked flag
Locked(): boolean;
Locked(theIsLocked: boolean): void;
Locked(): boolean;
Locked(theIsLocked: boolean): void;

// Returns the modification flag
Modified(): boolean;
Modified(theIsModified: boolean): void;
Modified(): boolean;
Modified(theIsModified: boolean): void;

// Returns the checked flag
Checked(): boolean;
Checked(theIsChecked: boolean): void;
Checked(): boolean;
Checked(theIsChecked: boolean): void;

// Returns the orientability flag
Orientable(): boolean;
Orientable(theIsOrientable: boolean): void;
Orientable(): boolean;
Orientable(theIsOrientable: boolean): void;

// Returns the closedness flag
Closed(): boolean;
Closed(theIsClosed: boolean): void;
Closed(): boolean;
Closed(theIsClosed: boolean): void;

// Returns the infinity flag
Infinite(): boolean;
Infinite(theIsInfinite: boolean): void;
Infinite(): boolean;
Infinite(theIsInfinite: boolean): void;

// Returns the convexness flag
Convex(): boolean;
Convex(theIsConvex: boolean): void;
Convex(): boolean;
Convex(theIsConvex: boolean): void;

// Returns the type as a term of the ShapeEnum enum
ShapeType(): TopAbs_ShapeEnum;

// Returns a copy of the TShape with no sub-shapes
EmptyCopy(): TopoDS_TShape;

// Returns the number of direct sub-shapes (children)
NbChildren(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Bit layout for compact state storage
TopoDS_TShape_BitLayout: typeof TopoDS_TShape_BitLayout[keyof typeof TopoDS_TShape_BitLayout]

// A set of faces connected by their edges
TopoDS_TShell: declare class TopoDS_TShell extends TopoDS_TShape

constructor

// Returns an empty TShell
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Topological part of 3D space, bounded by shells, edges and vertices
TopoDS_TSolid: declare class TopoDS_TSolid extends TopoDS_TShape

constructor

// Returns an empty TSolid
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Vertex is a topological point in two or three dimensions
TopoDS_TVertex: declare class TopoDS_TVertex extends TopoDS_TShape

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A set of edges connected by their vertices
TopoDS_TWire: declare class TopoDS_TWire extends TopoDS_TShape

constructor

// Returns an empty TWire
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopoDS_UnCompatibleShapes: declare class TopoDS_UnCompatibleShapes extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a vertex which
TopoDS_Vertex: declare class TopoDS_Vertex extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a wire which
TopoDS_Wire: declare class TopoDS_Wire extends TopoDS_Shape

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Static helper for downcasting generic `TopoDS_Shape` to concrete topology subtypes
TopoDS: declare class TopoDS

// Downcast a generic shape to an edge
static Edge(shape: TopoDS_Shape): TopoDS_Edge;
// shape: The shape to cast (must have `ShapeType() === TopAbs_EDGE`)

// Downcast a generic shape to a wire
static Wire(shape: TopoDS_Shape): TopoDS_Wire;
// shape: The shape to cast (must have `ShapeType() === TopAbs_WIRE`)

// Downcast a generic shape to a face
static Face(shape: TopoDS_Shape): TopoDS_Face;
// shape: The shape to cast (must have `ShapeType() === TopAbs_FACE`)

// Downcast a generic shape to a vertex
static Vertex(shape: TopoDS_Shape): TopoDS_Vertex;
// shape: The shape to cast (must have `ShapeType() === TopAbs_VERTEX`)

// Downcast a generic shape to a shell
static Shell(shape: TopoDS_Shape): TopoDS_Shell;
// shape: The shape to cast (must have `ShapeType() === TopAbs_SHELL`)

// Downcast a generic shape to a solid
static Solid(shape: TopoDS_Shape): TopoDS_Solid;
// shape: The shape to cast (must have `ShapeType() === TopAbs_SOLID`)

// Downcast a generic shape to a compound
static Compound(shape: TopoDS_Shape): TopoDS_Compound;
// shape: The shape to cast (must have `ShapeType() === TopAbs_COMPOUND`)
