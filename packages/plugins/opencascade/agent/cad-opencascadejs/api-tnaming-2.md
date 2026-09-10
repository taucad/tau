# libcascade — TNaming (2)

5 top-level symbols. Signatures are verbatim typescript.

// A tool to get information on the topology of a named shape attribute
TNaming_Tool: declare class TNaming_Tool

constructor

// Returns the last Modification of <NS>
static CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;
static CurrentShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TopoDS_Shape;
static CurrentShape(NS: TNaming_NamedShape): TopoDS_Shape;
static CurrentShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TopoDS_Shape;

// Returns the NamedShape of the last Modification of <NS>
static CurrentNamedShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TNaming_NamedShape;
static CurrentNamedShape(NS: TNaming_NamedShape): TNaming_NamedShape;
static CurrentNamedShape(NS: TNaming_NamedShape, Updated: NCollection_Map_TDF_Label): TNaming_NamedShape;
static CurrentNamedShape(NS: TNaming_NamedShape): TNaming_NamedShape;

// Returns the named shape attribute defined by the shape aShape and the label anAccess
static NamedShape(aShape: TopoDS_Shape, anAcces: TDF_Label): TNaming_NamedShape;

// Returns the entities stored in the named shape attribute NS
static GetShape(NS: TNaming_NamedShape): TopoDS_Shape;

// Returns the shape contained as OldShape in <NS>
static OriginalShape(NS: TNaming_NamedShape): TopoDS_Shape;

// Returns the shape generated from S or by a modification of S and contained in the named shape Generation
static GeneratedShape(S: TopoDS_Shape, Generation: TNaming_NamedShape): TopoDS_Shape;

static Collect(NS: TNaming_NamedShape, Labels: NCollection_Map_handle_TNaming_NamedShape, OnlyModif: boolean): void;

// Returns True if <aShape> appears under a label.(DP)
static HasLabel(access: TDF_Label, aShape: TopoDS_Shape): boolean;

// Returns the label of the first apparition of <aShape>
static Label(access: TDF_Label, aShape: TopoDS_Shape, TransDef?: number): { returnValue: TDF_Label; TransDef: number; [Symbol.dispose](): void };

// Returns the shape created from the shape aShape contained in the attribute anAcces
static InitialShape(aShape: TopoDS_Shape, anAcces: TDF_Label, Labels: NCollection_List_TDF_Label): TopoDS_Shape;
// Labels: Mutated in place

// Returns the last transaction where the creation of S is valid
static ValidUntil(access: TDF_Label, S: TopoDS_Shape): number;

// Returns the current shape (a Wire or a Shell) built (in the data framework) from the shapes of the argument named shape
static FindShape(Valid: NCollection_Map_TDF_Label, Forbiden: NCollection_Map_TDF_Label, Arg: TNaming_NamedShape, S: TopoDS_Shape): void;
// S: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// tool to copy underlying TShape of a Shape
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// only for Shape Copy test - to move in DNaming
TNaming_Translator: declare class TNaming_Translator

constructor

Add(aShape: TopoDS_Shape): void;

Perform(): void;

IsDone(): boolean;

// returns copied shape returns DataMap of results
Copied(aShape: TopoDS_Shape): TopoDS_Shape;
Copied(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;
Copied(aShape: TopoDS_Shape): TopoDS_Shape;
Copied(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

DumpMap(isWrite?: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Global attribute located under root label to store all the shapes handled by the framework Set of Shapes Used in a Data from {@link TDF `TDF`} Only one instance by Data, it always Stored as Attribute of The Root
TNaming_UsedShapes: declare class TNaming_UsedShapes extends TDF_Attribute

Destroy(): void;

Map(): unknown;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns the ID
static GetID(): Standard_GUID;

// Copies the attribute contents into a new other attribute
BackupCopy(): TDF_Attribute;

// Restores the contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Clears the table
BeforeRemoval(): void;

// Something to do after applying <anAttDelta>
AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// this method returns a null handle (no delta)
DeltaOnAddition(): TDF_DeltaOnAddition;

// this method returns a null handle (no delta)
DeltaOnRemoval(): TDF_DeltaOnRemoval;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Adds the directly referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TNaming_ListOfNamedShape: NCollection_List_handle_TNaming_NamedShape
