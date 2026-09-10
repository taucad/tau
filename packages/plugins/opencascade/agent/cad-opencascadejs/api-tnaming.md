# libcascade — TNaming

22 top-level symbols. Signatures are verbatim typescript.

// A topological attribute can be seen as a hook into the topological structure
TNaming: declare class TNaming

constructor

// Subtituter les shapes sur les structures de source vers cible
static Substitute(labelsource: TDF_Label, labelcible: TDF_Label, mapOldNew: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// mapOldNew: Mutated in place

// Mise a jour des shapes du label et de ses fils en tenant compte des substitutions decrite par mapOldNew
static Update(label: TDF_Label, mapOldNew: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// mapOldNew: Mutated in place

// Application de la Location sur les shapes du label et de ses sous labels
static Displace(label: TDF_Label, aLocation: TopLoc_Location, WithOld?: boolean): void;

// Remplace les shapes du label et des sous-labels par des copies
static ChangeShapes(label: TDF_Label, M: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// M: Mutated in place

// Application de la transformation sur les shapes du label et de ses sous labels
static Transform(label: TDF_Label, aTransformation: gp_Trsf): void;

// Replicates the named shape with the transformation <T> on the label <L> (and sub-labels if necessary) (TNaming_GENERATED is set) Replicates the shape with the transformation <T> on the label <L> (and sub-labels if necessary) (TNaming_GENERATED is set)
static Replicate(NS: TNaming_NamedShape, T: gp_Trsf, L: TDF_Label): void;
static Replicate(SH: TopoDS_Shape, T: gp_Trsf, L: TDF_Label): void;
static Replicate(NS: TNaming_NamedShape, T: gp_Trsf, L: TDF_Label): void;
static Replicate(SH: TopoDS_Shape, T: gp_Trsf, L: TDF_Label): void;

// Builds shape from map content
static MakeShape(MS: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): TopoDS_Shape;

// Find unique context of shape
static FindUniqueContext(S: TopoDS_Shape, Context: TopoDS_Shape): TopoDS_Shape;

// Find unique context of shape ,which is pure concatenation of atomic shapes (Compound)
static FindUniqueContextSet(S: TopoDS_Shape, Context: TopoDS_Shape): { returnValue: TopoDS_Shape; Arr: NCollection_HArray1_TopoDS_Shape; [Symbol.dispose](): void };

// Substitutes shape in source structure
static SubstituteSShape(accesslabel: TDF_Label, From: TopoDS_Shape, To: TopoDS_Shape): boolean;
// To: Mutated in place

// Returns True if outer wire is found and the found wire in <theWire>
static OuterWire(theFace: TopoDS_Face, theWire: TopoDS_Wire): boolean;
// theWire: Mutated in place

// Returns True if outer Shell is found and the found shell in <theShell>
static OuterShell(theSolid: TopoDS_Solid, theShell: TopoDS_Shell): boolean;
// theShell: Mutated in place

// Appends to <anIDList> the list of the attributes IDs of this package
static IDList(anIDList: NCollection_List_Standard_GUID): void;
// anIDList: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A tool to create and maintain topological attributes
TNaming_Builder: declare class TNaming_Builder

constructor

// Records the shape newShape which was generated during a topological construction
Generated(newShape: TopoDS_Shape): void;
Generated(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;
Generated(newShape: TopoDS_Shape): void;
Generated(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;

// Records the shape oldShape which was deleted from the current label
Delete(oldShape: TopoDS_Shape): void;

// Records the shape newShape which is a modification of the shape oldShape
Modify(oldShape: TopoDS_Shape, newShape: TopoDS_Shape): void;

// Add a Shape to the current label, This Shape is unmodified
Select(aShape: TopoDS_Shape, inShape: TopoDS_Shape): void;

// Returns the NamedShape which has been built or is under construction
NamedShape(): TNaming_NamedShape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TNaming_CopyShape: declare class TNaming_CopyShape

constructor

// Makes copy a set of shape(s), using the aMap
static CopyTool(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape): void;
// aMap: Mutated in place
// aResult: Mutated in place

// Translates a Transient shape(s) to Transient
static Translate(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape, TrTool: TNaming_TranslateTool): void;
static Translate(L: TopLoc_Location, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): TopLoc_Location;
static Translate(aShape: TopoDS_Shape, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient, aResult: TopoDS_Shape, TrTool: TNaming_TranslateTool): void;
static Translate(L: TopLoc_Location, aMap: NCollection_IndexedDataMap_handle_Standard_Transient_handle_Standard_Transient): TopLoc_Location;
// aMap: Mutated in place
// aResult: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a MODIFICATION action
TNaming_DeltaOnModification: declare class TNaming_DeltaOnModification extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TNaming_DeltaOnRemoval: declare class TNaming_DeltaOnRemoval extends TDF_DeltaOnRemoval

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the type of evolution in old shape - new shape pairs
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A tool to visit the contents of a named shape attribute
TNaming_Iterator: declare class TNaming_Iterator

constructor

// Returns True if there is a current Item in the iteration
More(): boolean;

// Moves the iteration to the next Item
Next(): void;

// Returns the old shape in this iterator object
OldShape(): TopoDS_Shape;

// Returns the new shape in this iterator object
NewShape(): TopoDS_Shape;

// Returns true if the new shape is a modification (split, fuse, etc...) of the old shape
IsModification(): boolean;

Evolution(): TNaming_Evolution;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TNaming_IteratorOnShapesSet: declare class TNaming_IteratorOnShapesSet

constructor

// Initialize the iteration
Init(S: TNaming_ShapesSet): void;

// Returns True if there is a current Item in the iteration
More(): boolean;

// Move to the next Item
Next(): void;

Value(): TopoDS_Shape;

// Releases the C++ object
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

// Finds context of the shape
static FindShapeContext(NS: TNaming_NamedShape, theS: TopoDS_Shape, theSC: TopoDS_Shape): void;
// theSC: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// store the arguments of Naming
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// to store naming characteristcs
TNaming_NameType: typeof TNaming_NameType[keyof typeof TNaming_NameType]

// The basis to define an attribute for the storage of topology and naming data
TNaming_NamedShape: declare class TNaming_NamedShape extends TDF_Attribute

constructor

// **class method**
static GetID(): Standard_GUID;

IsEmpty(): boolean;

// Returns the shapes contained in <NS>
Get(): TopoDS_Shape;

// Returns the Evolution of the attribute
Evolution(): TNaming_Evolution;

// Returns the Version of the attribute
Version(): number;

// Set the Version of the attribute
SetVersion(version: number): void;

Clear(): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Copies the attribute contents into a new other attribute
BackupCopy(): TDF_Attribute;

// Restores the contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Makes a DeltaOnModification between <me> and
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

// Makes a DeltaOnRemoval on <me> because <me> has disappeared from the DS
DeltaOnRemoval(): TDF_DeltaOnRemoval;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Adds the directly referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

// Something to do before removing an Attribute from a label
BeforeRemoval(): void;

// Something to do before applying <anAttDelta>
BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// Something to do after applying <anAttDelta>
AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This attribute store the topological naming of any selected shape, when this shape is not already attached to a specific label
TNaming_Naming: declare class TNaming_Naming extends TDF_Attribute

constructor

// **following code from TDesignStd**
static GetID(): Standard_GUID;

static Insert(under: TDF_Label): TNaming_Naming;

// Creates a Naming attribute at label <where> to identify the shape <Selection>
static Name(where: TDF_Label, Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry?: boolean, KeepOrientation?: boolean, BNproblem?: boolean): TNaming_NamedShape;

IsDefined(): boolean;

GetName(): TNaming_Name;

ChangeName(): TNaming_Name;

// regenerate only the Name associated to me
Regenerate(scope: NCollection_Map_TDF_Label): boolean;
// scope: Mutated in place

// Regenerate recursively the whole name with scope
Solve(scope: NCollection_Map_TDF_Label): boolean;
// scope: Mutated in place

// **Deferred methods from TDF_Attribute**
ID(): Standard_GUID;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

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

TNaming_NamingTool: declare class TNaming_NamingTool

constructor

static CurrentShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, NS: TNaming_NamedShape, MS: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

static CurrentShapeFromShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, Acces: TDF_Label, S: TopoDS_Shape, MS: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

static BuildDescendants(NS: TNaming_NamedShape, Labels: NCollection_Map_TDF_Label): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on all the descendants of a shape
TNaming_NewShapeIterator: declare class TNaming_NewShapeIterator

constructor

More(): boolean;

Next(): void;

Label(): TDF_Label;

NamedShape(): TNaming_NamedShape;

// Warning! Can be a Null Shape if a descendant is deleted
Shape(): TopoDS_Shape;

// True if the new shape is a modification (split, fuse,etc...) of the old shape
IsModification(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on all the ascendants of a shape
TNaming_OldShapeIterator: declare class TNaming_OldShapeIterator

constructor

More(): boolean;

Next(): void;

Label(): TDF_Label;

NamedShape(): TNaming_NamedShape;

Shape(): TopoDS_Shape;

// True if the new shape is a modification (split, fuse,etc...) of the old shape
IsModification(): boolean;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To iterate on all the label which contained a given shape
TNaming_SameShapeIterator: declare class TNaming_SameShapeIterator

constructor

More(): boolean;

Next(): void;

Label(): TDF_Label;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// **this class manage a scope of labels**
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

// Returns the current value of <NS> according to the Valid Scope
CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a single API for selection of shapes
TNaming_Selector: declare class TNaming_Selector

constructor

// **To know if a shape is already identified (not selected)**
static IsIdentified(access: TDF_Label, selection: TopoDS_Shape, Geometry: boolean): { returnValue: boolean; NS: TNaming_NamedShape; [Symbol.dispose](): void };

// Creates a topological naming on the label aLabel given as an argument at construction time
Select(Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
Select(Selection: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
Select(Selection: TopoDS_Shape, Context: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;
Select(Selection: TopoDS_Shape, Geometry: boolean, KeepOrientatation: boolean): boolean;

// Updates the topological naming on the label aLabel given as an argument at construction time
Solve(Valid: NCollection_Map_TDF_Label): boolean;
// Valid: Mutated in place

// Returns the attribute list args
Arguments(args: NCollection_Map_handle_TDF_Attribute): void;
// args: Mutated in place

// Returns the NamedShape build or under construction, which contains the topological naming.
NamedShape(): TNaming_NamedShape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TNaming_ShapesSet: declare class TNaming_ShapesSet

constructor

// Removes all Shapes
Clear(): void;

// Adds the Shape Adds the shapes contained in <Shapes>
Add(S: TopoDS_Shape): boolean;
Add(Shapes: TNaming_ShapesSet): void;
Add(S: TopoDS_Shape): boolean;
Add(Shapes: TNaming_ShapesSet): void;

// Returns True if is in <me>
Contains(S: TopoDS_Shape): boolean;

// Removes in <me>
Remove(S: TopoDS_Shape): boolean;
Remove(Shapes: TNaming_ShapesSet): void;
Remove(S: TopoDS_Shape): boolean;
Remove(Shapes: TNaming_ShapesSet): void;

// Erases in <me> the shapes not contained in <Shapes>
Filter(Shapes: TNaming_ShapesSet): void;

IsEmpty(): boolean;

NbShapes(): number;

ChangeMap(): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

Map(): NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
