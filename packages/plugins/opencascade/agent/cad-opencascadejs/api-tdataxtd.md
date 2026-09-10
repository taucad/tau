# libcascade — TDataXtd

14 top-level symbols. Signatures are verbatim typescript.

// This package defines extension of standard attributes for modelling (mainly for work with geometry)
TDataXtd: declare class TDataXtd

constructor

// Appends to <anIDList> the list of the attributes IDs of this package
static IDList(anIDList: NCollection_List_Standard_GUID): void;
// anIDList: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The basis to define an axis attribute
TDataXtd_Axis: declare class TDataXtd_Axis extends TDataStd_GenericEmpty

constructor

// **class methods**
static GetID(): Standard_GUID;

// Finds or creates an axis attribute defined by the label
static Set(label: TDF_Label): TDataXtd_Axis;
static Set(label: TDF_Label, L: gp_Lin): TDataXtd_Axis;
static Set(label: TDF_Label): TDataXtd_Axis;
static Set(label: TDF_Label, L: gp_Lin): TDataXtd_Axis;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The groundwork to define constraint attributes
TDataXtd_Constraint: declare class TDataXtd_Constraint extends TDF_Attribute

constructor

// Returns the GUID for constraints
static GetID(): Standard_GUID;

// Finds or creates the 2D constraint attribute defined by the planar topological attribute plane and the label label
static Set(label: TDF*Label): TDataXtd_Constraint;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape): void;
Set(type*: TDataXtd*ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape): void;
Set(type*: TDataXtd_ConstraintEnum, G1: TNaming_NamedShape, G2: TNaming_NamedShape, G3: TNaming_NamedShape, G4: TNaming_NamedShape): void;

// Returns true if this constraint attribute is valid
Verified(): boolean;
Verified(status: boolean): void;
Verified(): boolean;
Verified(status: boolean): void;

// Returns the type of constraint
GetType(): TDataXtd_ConstraintEnum;

// Returns true if this constraint attribute is two-dimensional
IsPlanar(): boolean;

// Returns the topological attribute of the plane used for planar - i.e., 2D - constraints
GetPlane(): TNaming_NamedShape;

// Returns true if this constraint attribute is a dimension, and therefore has a value
IsDimension(): boolean;

// Returns the value of a dimension
GetValue(): TDataStd_Real;

// Returns the number of geometry attributes in this constraint attribute
NbGeometries(): number;

// Returns the integer index Index used to access the array of the constraint or stored geometries of a dimension Index has a value between 1 and 4
GetGeometry(Index: number): TNaming_NamedShape;

// Removes the geometries involved in the constraint or dimension from the array of topological attributes where they are stored
ClearGeometries(): void;

// Finds or creates the type of constraint CTR
SetType(CTR: TDataXtd_ConstraintEnum): void;

// Finds or creates the plane of the 2D constraint attribute, defined by the planar topological attribute plane
SetPlane(plane: TNaming_NamedShape): void;

// Finds or creates the real number value V of the dimension constraint attribute
SetValue(V: TDataStd_Real): void;

// Finds or creates the underlying geometry of the constraint defined by the topological attribute G and the integer index Index
SetGeometry(Index: number, G: TNaming_NamedShape): void;

Inverted(status: boolean): void;
Inverted(): boolean;
Inverted(status: boolean): void;
Inverted(): boolean;

Reversed(status: boolean): void;
Reversed(): boolean;
Reversed(status: boolean): void;
Reversed(): boolean;

// collects constraints on Childs for label <aLabel>
static CollectChildConstraints(aLabel: TDF_Label, TheList: NCollection_List_TDF_Label): void;
// TheList: Mutated in place

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The terms of this enumeration define the types
TDataXtd_ConstraintEnum: typeof TDataXtd_ConstraintEnum[keyof typeof TDataXtd_ConstraintEnum]

// This class is used to model construction geometry
TDataXtd_Geometry: declare class TDataXtd_Geometry extends TDF_Attribute

constructor

// **API class methods**
static Set(label: TDF_Label): TDataXtd_Geometry;

// Returns the label L used to define the type of geometric construction for the geometry attribute
static Type(L: TDF_Label): TDataXtd_GeometryEnum;
static Type(S: TNaming_NamedShape): TDataXtd_GeometryEnum;
static Type(L: TDF_Label): TDataXtd_GeometryEnum;
static Type(S: TNaming_NamedShape): TDataXtd_GeometryEnum;

// Returns the point attribute defined by the label L and the point G
static Point(L: TDF_Label, G: gp_Pnt): boolean;
static Point(S: TNaming_NamedShape, G: gp_Pnt): boolean;
static Point(L: TDF_Label, G: gp_Pnt): boolean;
static Point(S: TNaming_NamedShape, G: gp_Pnt): boolean;
// G: Mutated in place

// Returns the axis attribute defined by the label L and the axis G
static Axis(L: TDF_Label, G: gp_Ax1): boolean;
static Axis(S: TNaming_NamedShape, G: gp_Ax1): boolean;
static Axis(L: TDF_Label, G: gp_Ax1): boolean;
static Axis(S: TNaming_NamedShape, G: gp_Ax1): boolean;
// G: Mutated in place

// Returns the line attribute defined by the label L and the line G
static Line(L: TDF_Label, G: gp_Lin): boolean;
static Line(S: TNaming_NamedShape, G: gp_Lin): boolean;
static Line(L: TDF_Label, G: gp_Lin): boolean;
static Line(S: TNaming_NamedShape, G: gp_Lin): boolean;
// G: Mutated in place

// Returns the circle attribute defined by the label L and the circle G
static Circle(L: TDF_Label, G: gp_Circ): boolean;
static Circle(S: TNaming_NamedShape, G: gp_Circ): boolean;
static Circle(L: TDF_Label, G: gp_Circ): boolean;
static Circle(S: TNaming_NamedShape, G: gp_Circ): boolean;
// G: Mutated in place

// Returns the ellipse attribute defined by the label L and the ellipse G
static Ellipse(L: TDF_Label, G: gp_Elips): boolean;
static Ellipse(S: TNaming_NamedShape, G: gp_Elips): boolean;
static Ellipse(L: TDF_Label, G: gp_Elips): boolean;
static Ellipse(S: TNaming_NamedShape, G: gp_Elips): boolean;
// G: Mutated in place

// Returns the plane attribute defined by the label L and the plane G
static Plane(L: TDF_Label, G: gp_Pln): boolean;
static Plane(S: TNaming_NamedShape, G: gp_Pln): boolean;
static Plane(L: TDF_Label, G: gp_Pln): boolean;
static Plane(S: TNaming_NamedShape, G: gp_Pln): boolean;
// G: Mutated in place

// Returns the cylinder attribute defined by the label L and the cylinder G
static Cylinder(L: TDF_Label, G: gp_Cylinder): boolean;
static Cylinder(S: TNaming_NamedShape, G: gp_Cylinder): boolean;
static Cylinder(L: TDF_Label, G: gp_Cylinder): boolean;
static Cylinder(S: TNaming_NamedShape, G: gp_Cylinder): boolean;
// G: Mutated in place

// Returns the GUID for geometry attributes
static GetID(): Standard_GUID;

// Returns the type of geometric construction T of this attribute
SetType(T: TDataXtd_GeometryEnum): void;

// Returns the type of geometric construction
GetType(): TDataXtd_GeometryEnum;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The terms of this enumeration define the types of geometric shapes available
TDataXtd_GeometryEnum: typeof TDataXtd_GeometryEnum[keyof typeof TDataXtd_GeometryEnum]

// a general pattern model
TDataXtd_Pattern: declare class TDataXtd_Pattern extends TDF_Attribute

static GetID(): Standard_GUID;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns the ID of the attribute
PatternID(): Standard_GUID;

// Give the number of transformation
NbTrsfs(): number;

// Give the transformations
ComputeTrsfs(Trsfs: NCollection_Array1_gp_Trsf): void;
// Trsfs: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// to create a PatternStd (LinearPattern, CircularPattern, RectangularPattern, RadialCircularPattern, MirrorPattern)
TDataXtd_PatternStd: declare class TDataXtd_PatternStd extends TDataXtd_Pattern

constructor

static GetPatternID(): Standard_GUID;

// Find, or create, a PatternStd attribute
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

// Give the number of transformation
NbTrsfs(): number;

// Give the transformations
ComputeTrsfs(Trsfs: NCollection_Array1_gp_Trsf): void;
// Trsfs: Mutated in place

// Returns the ID of the attribute
PatternID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDataXtd_Placement: declare class TDataXtd_Placement extends TDataStd_GenericEmpty

constructor

// **class methods**
static GetID(): Standard_GUID;

// Find, or create, a Placement attribute
static Set(label: TDF_Label): TDataXtd_Placement;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The basis to define a plane attribute
TDataXtd_Plane: declare class TDataXtd_Plane extends TDataStd_GenericEmpty

constructor

// **class methods**
static GetID(): Standard_GUID;

// Finds or creates the plane attribute defined by the label label
static Set(label: TDF_Label): TDataXtd_Plane;
static Set(label: TDF_Label, P: gp_Pln): TDataXtd_Plane;
static Set(label: TDF_Label): TDataXtd_Plane;
static Set(label: TDF_Label, P: gp_Pln): TDataXtd_Plane;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The basis to define a point attribute
TDataXtd_Point: declare class TDataXtd_Point extends TDataStd_GenericEmpty

constructor

// **class methods**
static GetID(): Standard_GUID;

// Sets the label Label as a point attribute
static Set(label: TDF_Label): TDataXtd_Point;
static Set(label: TDF_Label, P: gp_Pnt): TDataXtd_Point;
static Set(label: TDF_Label): TDataXtd_Point;
static Set(label: TDF_Label, P: gp_Pnt): TDataXtd_Point;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Position of a Label
TDataXtd_Position: declare class TDataXtd_Position extends TDF_Attribute

constructor

// Create if not found the {@link TDataXtd_Position`TDataXtd_Position`} attribute set its position to <aPos> Find an existing, or create an empty, Position
static Set(aLabel: TDF_Label, aPos: gp_Pnt): void;
static Set(aLabel: TDF_Label): TDataXtd_Position;
static Set(aLabel: TDF_Label, aPos: gp_Pnt): void;
static Set(aLabel: TDF_Label): TDataXtd_Position;

// Search label
static Get(aLabel: TDF_Label, aPos: gp_Pnt): boolean;
// aPos: Mutated in place

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns the ID of the attribute
static GetID(): Standard_GUID;

// Restores the contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

GetPosition(): gp_Pnt;

SetPosition(aPos: gp_Pnt): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Attribute containing parameters of presentation of the shape, e.g
TDataXtd_Presentation: declare class TDataXtd_Presentation extends TDF_Attribute

constructor

static Set(theLabel: TDF_Label, theDriverId: Standard_GUID): TDataXtd_Presentation;

static Unset(theLabel: TDF_Label): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

static GetID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Copies the attribute contents into a new other attribute
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Shape is associated in the framework with
TDataXtd_Shape: declare class TDataXtd_Shape extends TDataStd_GenericEmpty

constructor

// **class methods**
static Find(current: TDF_Label): { returnValue: boolean; S: TDataXtd_Shape; [Symbol.dispose](): void };

// Find, or create, a Shape attribute
static New(label: TDF_Label): TDataXtd_Shape;

// Create or update associated NamedShape attribute
static Set(label: TDF_Label, shape: TopoDS_Shape): TDataXtd_Shape;

// the Shape from associated NamedShape attribute is returned
static Get(label: TDF_Label): TopoDS_Shape;

// **Shape methods**
static GetID(): Standard_GUID;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
