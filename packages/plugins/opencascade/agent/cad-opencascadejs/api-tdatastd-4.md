# libcascade — TDataStd (4)

7 top-level symbols. Signatures are verbatim typescript.

// Allows you to define an explicit tree of labels which you can also edit
TDataStd_TreeNode: declare class TDataStd_TreeNode extends TDF_Attribute

constructor

// **class methods working on the node**
static Find(L: TDF_Label): { returnValue: boolean; T: TDataStd_TreeNode; [Symbol.dispose](): void };

// Finds or Creates a TreeNode attribute on the label <L> with the default tree ID, returned by the method <GetDefaultTreeID>
static Set(L: TDF_Label): TDataStd_TreeNode;
static Set(L: TDF_Label, ExplicitTreeID: Standard_GUID): TDataStd_TreeNode;
static Set(L: TDF_Label): TDataStd_TreeNode;
static Set(L: TDF_Label, ExplicitTreeID: Standard_GUID): TDataStd_TreeNode;

// returns a default tree ID
static GetDefaultTreeID(): Standard_GUID;

// Insert the TreeNode <Child> as last child of <me>
Append(Child: TDataStd_TreeNode): boolean;

// Insert the the TreeNode <Child> as first child of <me>
Prepend(Child: TDataStd_TreeNode): boolean;

// Inserts the TreeNode <Node> before <me>
InsertBefore(Node: TDataStd_TreeNode): boolean;

// Inserts the TreeNode <Node> after <me>
InsertAfter(Node: TDataStd_TreeNode): boolean;

// Removes this tree node attribute from its father node
Remove(): boolean;

// Returns the depth of this tree node in the overall tree node structure
Depth(): number;

// Returns the number of child nodes
NbChildren(allLevels?: boolean): number;

// Returns true if this tree node attribute is an ascendant of of
IsAscendant(of\_: TDataStd_TreeNode): boolean;

// Returns true if this tree node attribute is a descendant of of
IsDescendant(of\_: TDataStd_TreeNode): boolean;

// Returns true if this tree node attribute is the ultimate father in the tree
IsRoot(): boolean;

// Returns the ultimate father of this tree node attribute
Root(): TDataStd_TreeNode;

// Returns true if this tree node attribute is a father of of
IsFather(of\_: TDataStd_TreeNode): boolean;

// Returns true if this tree node attribute is a child of of
IsChild(of\_: TDataStd_TreeNode): boolean;

// Returns true if this tree node attribute has a father tree node
HasFather(): boolean;

// Returns the father TreeNode of <me>
Father(): TDataStd_TreeNode;

// Returns true if this tree node attribute has a next tree node
HasNext(): boolean;

// Returns the next tree node in this tree node attribute
Next(): TDataStd_TreeNode;

// Returns true if this tree node attribute has a previous tree node
HasPrevious(): boolean;

// Returns the previous tree node of this tree node attribute
Previous(): TDataStd_TreeNode;

// Returns true if this tree node attribute has a first child tree node
HasFirst(): boolean;

// Returns the first child tree node in this tree node object
First(): TDataStd_TreeNode;

// Returns true if this tree node attribute has a last child tree node
HasLast(): boolean;

// Returns the last child tree node in this tree node object
Last(): TDataStd_TreeNode;

// Returns the last child tree node in this tree node object
FindLast(): TDataStd_TreeNode;

SetTreeID(explicitID: Standard_GUID): void;

SetFather(F: TDataStd_TreeNode): void;

SetNext(F: TDataStd_TreeNode): void;

SetPrevious(F: TDataStd_TreeNode): void;

SetFirst(F: TDataStd_TreeNode): void;

// **TreeNode callback:**
SetLast(F: TDataStd_TreeNode): void;

// Connect the TreeNode to its father child list
AfterAddition(): void;

// Disconnect the TreeNode from its Father child list
BeforeForget(): void;

// Reconnect the TreeNode to its father child list
AfterResume(): void;

// Disconnect the TreeNode, if necessary
BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// Reconnect the TreeNode, if necessary
AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// Returns the tree ID (default or explicit one depending on the Set method used)
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDataStd_UAttribute: declare class TDataStd_UAttribute extends TDF_Attribute

constructor

// **api class methods**
static Set(label: TDF_Label, LocalID: Standard_GUID): TDataStd_UAttribute;

// Sets specific ID of the attribute (supports several attributes of one type at the same label feature)
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

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

// **Variable attribute.**
TDataStd_Variable: declare class TDataStd_Variable extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Find, or create, a Variable attribute
static Set(label: TDF_Label): TDataStd_Variable;
Set(value: number): void;
Set(value: number, dimension: TDataStd_RealEnum): void;
Set(value: number): void;
Set(value: number, dimension: TDataStd_RealEnum): void;

// set or change the name of the variable, in myUnknown and my associated Name attribute
Name(string*: TCollection_ExtendedString): void;
Name(): TCollection_ExtendedString;
Name(string*: TCollection_ExtendedString): void;
Name(): TCollection_ExtendedString;

// returns True if a Real attribute is associated
IsValued(): boolean;

// returns value stored in associated Real attribute
Get(): number;

// returns associated Real attribute
Real(): TDataStd_Real;

// returns True if an Expression attribute is associated
IsAssigned(): boolean;

// create(if doesn't exist) and returns the assigned expression attribute
Assign(): TDataStd_Expression;

// if <me> is assigned delete the associated expression attribute
Desassign(): void;

// if <me> is assigned, returns associated Expression attribute
Expression(): TDataStd_Expression;

// shortcut for <`Real()`->`IsCaptured()`>
IsCaptured(): boolean;

// A constant value is not modified by regeneration
IsConstant(): boolean;

// **to read/write fields**
Unit(unit: TCollection_AsciiString): void;
Unit(): TCollection_AsciiString;
Unit(unit: TCollection_AsciiString): void;
Unit(): TCollection_AsciiString;

// if <status> is True, this variable will not be modified by the solver
Constant(status: boolean): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// to export reference to the associated Name attribute
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDataStd_HLabelArray1: NCollection_HArray1_TDF_Label

TDataStd_LabelArray1: NCollection_Array1_TDF_Label

TDataStd_ListOfByte: NCollection_List_uint8_t

TDataStd_ListOfExtendedString: NCollection_List_TCollection_ExtendedString
