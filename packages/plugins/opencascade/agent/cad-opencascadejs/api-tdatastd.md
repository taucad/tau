# libcascade — TDataStd

16 top-level symbols. Signatures are verbatim typescript.

// This package defines standard attributes for modelling
TDataStd: declare class TDataStd

constructor

// Appends to <anIDList> the list of the attributes IDs of this package
static IDList(anIDList: NCollection_List_Standard_GUID): void;
// anIDList: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Used to define an AsciiString attribute containing a {@link TCollection_AsciiString`TCollection_AsciiString`}
TDataStd_AsciiString: declare class TDataStd_AsciiString extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Finds, or creates an AsciiString attribute and sets the string
static Set(label: TDF*Label, string*: TCollection*AsciiString): TDataStd_AsciiString;
static Set(label: TDF_Label, guid: Standard_GUID, string*: TCollection*AsciiString): TDataStd_AsciiString;
static Set(label: TDF_Label, string*: TCollection*AsciiString): TDataStd_AsciiString;
static Set(label: TDF_Label, guid: Standard_GUID, string*: TCollection_AsciiString): TDataStd_AsciiString;
Set(S: TCollection_AsciiString): void;

// Sets the explicit user defined GUID to the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Get(): TCollection_AsciiString;

IsEmpty(): boolean;

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

// An array of boolean values
TDataStd_BooleanArray: declare class TDataStd_BooleanArray extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates an attribute with internal boolean array
static Set(label: TDF_Label, lower: number, upper: number): TDataStd_BooleanArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_BooleanArray;
static Set(label: TDF_Label, lower: number, upper: number): TDataStd_BooleanArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_BooleanArray;

// Initialize the inner array with bounds from <lower> to <upper>
Init(lower: number, upper: number): void;

// Sets the <Index>th element of the array to OutOfRange exception is raised if <Index> doesn't respect Lower and Upper bounds of the internal array
SetValue(index: number, value: boolean): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Return the value of the <Index>th element of the array
Value(Index: number): boolean;

// Returns the lower boundary of the array
Lower(): number;

// Returns the upper boundary of the array
Upper(): number;

// Returns the number of elements in the array
Length(): number;

InternalArray(): TColStd_HArray1OfByte;

SetInternalArray(values: TColStd_HArray1OfByte): void;

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

// Contains a list of bolleans
TDataStd_BooleanList: declare class TDataStd_BooleanList extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates a list of boolean values attribute
static Set(label: TDF_Label): TDataStd_BooleanList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_BooleanList;
static Set(label: TDF_Label): TDataStd_BooleanList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_BooleanList;

IsEmpty(): boolean;

Extent(): number;

Prepend(value: boolean): void;

Append(value: boolean): void;

Clear(): void;

First(): boolean;

Last(): boolean;

// 1 - means TRUE, 0 - means FALSE
List(): NCollection_List_uint8_t;

// Inserts the before the <index> position
InsertBefore(index: number, before_value: boolean): boolean;

// Inserts the after the <index> position
InsertAfter(index: number, after_value: boolean): boolean;

// Removes a value at <index> position
Remove(index: number): boolean;

// Sets the explicit GUID (user defined) for the attribute
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

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An array of Byte (unsigned char) values
TDataStd_ByteArray: declare class TDataStd_ByteArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates an attribute with the array on the specified label
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;

// Initialize the inner array with bounds from <lower> to <upper>
Init(lower: number, upper: number): void;

// Sets the <Index>th element of the array to OutOfRange exception is raised if <Index> doesn't respect Lower and Upper bounds of the internal array
SetValue(index: number, value: number): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Return the value of the <Index>th element of the array
Value(Index: number): number;

// Returns the lower boundary of the array
Lower(): number;

// Returns the upper boundary of the array
Upper(): number;

// Returns the number of elements in the array
Length(): number;

InternalArray(): TColStd_HArray1OfByte;

// Sets the inner array <myValue> of the attribute to <newArray>
ChangeArray(newArray: TColStd_HArray1OfByte, isCheckItems?: boolean): void;

GetDelta(): boolean;

// for internal use only!
SetDelta(isDelta: boolean): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Makes a DeltaOnModification between <me> and <anOldAttribute>
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on the ChildStepren step of a step, at the first level only
TDataStd_ChildNodeIterator: declare class TDataStd_ChildNodeIterator

constructor

// Initializes the iteration on the Children Step of the given Step
Initialize(aTreeNode: TDataStd_TreeNode, allLevels?: boolean): void;

// Returns True if there is a current Item in the iteration
More(): boolean;

// Move to the next Item
Next(): void;

// Move to the next Brother
NextBrother(): void;

// Returns the current item
Value(): TDataStd_TreeNode;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Comment attribute
TDataStd_Comment: declare class TDataStd_Comment extends TDataStd_GenericExtString

constructor

// **class methods**
static GetID(): Standard_GUID;

// Find, or create a Comment attribute
static Set(label: TDF*Label): TDataStd_Comment;
static Set(label: TDF_Label, string*: TCollection*ExtendedString): TDataStd_Comment;
Set(S: TCollection_ExtendedString): void;
static Set(label: TDF_Label): TDataStd_Comment;
static Set(label: TDF_Label, string*: TCollection_ExtendedString): TDataStd_Comment;

// Sets the explicit user defined GUID to the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this attribute, located at root label, manage an access to a current label
TDataStd_Current: declare class TDataStd_Current extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Set <L> as current of <L> Framework
static Set(L: TDF_Label): void;

// returns current of <acces> Framework
static Get(acces: TDF_Label): TDF_Label;

// returns True if a current label is managed in <acces> Framework
static Has(acces: TDF_Label): boolean;

SetLabel(current: TDF_Label): void;

GetLabel(): TDF_Label;

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

// This class provides default services for an AttributeDelta on a MODIFICATION action
TDataStd_DeltaOnModificationOfByteArray: declare class TDataStd_DeltaOnModificationOfByteArray extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a MODIFICATION action
TDataStd_DeltaOnModificationOfExtStringArray: declare class TDataStd_DeltaOnModificationOfExtStringArray extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a MODIFICATION action
TDataStd_DeltaOnModificationOfIntArray: declare class TDataStd_DeltaOnModificationOfIntArray extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a MODIFICATION action
TDataStd_DeltaOnModificationOfIntPackedMap: declare class TDataStd_DeltaOnModificationOfIntPackedMap extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides default services for an AttributeDelta on a MODIFICATION action
TDataStd_DeltaOnModificationOfRealArray: declare class TDataStd_DeltaOnModificationOfRealArray extends TDF_DeltaOnModification

constructor

// Applies the delta to the attribute
Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Associates a directory in the data framework with a TDataStd_TagSource attribute
TDataStd_Directory: declare class TDataStd_Directory extends TDataStd_GenericEmpty

constructor

// **class methods**
static Find(current: TDF_Label): { returnValue: boolean; D: TDataStd_Directory; [Symbol.dispose](): void };

// Creates an empty Directory attribute, located at <label>
static New(label: TDF_Label): TDataStd_Directory;

// Creates a new sub-label and sets the sub-directory dir on that label
static AddDirectory(dir: TDataStd_Directory): TDataStd_Directory;

// Makes new label and returns it to insert other object attributes (sketch,part...etc...)
static MakeObjectLabel(dir: TDataStd_Directory): TDF_Label;

// **Directory methods**
static GetID(): Standard_GUID;

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

// **Expression attribute.**
TDataStd_Expression: declare class TDataStd_Expression extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Find, or create, an Expression attribute
static Set(label: TDF_Label): TDataStd_Expression;

// build and return the expression name
Name(): TCollection_ExtendedString;

SetExpression(E: TCollection_ExtendedString): void;

GetExpression(): TCollection_ExtendedString;

GetVariables(): NCollection_List_handle_TDF_Attribute;

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

// ExtStringArray Attribute
TDataStd_ExtStringArray: declare class TDataStd_ExtStringArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// **class methods**
static GetID(): Standard_GUID;

// Finds, or creates, an ExtStringArray attribute with <lower> and <upper> bounds on the specified label
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;

// Initializes the inner array with bounds from <lower> to <upper>
Init(lower: number, upper: number): void;

// Sets the <Index>th element of the array to OutOfRange exception is raised if <Index> doesn't respect Lower and Upper bounds of the internal array
SetValue(Index: number, Value: TCollection_ExtendedString): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Returns the value of the <Index>th element of the array
Value(Index: number): TCollection_ExtendedString;

// Return the lower bound
Lower(): number;

// Return the upper bound
Upper(): number;

// Return the number of elements of <me>
Length(): number;

// Sets the inner array <myValue> of the ExtStringArray attribute to <newArray>
ChangeArray(newArray: NCollection_HArray1_TCollection_ExtendedString, isCheckItems?: boolean): void;

// Return the inner array of the ExtStringArray attribute
Array(): NCollection_HArray1_TCollection_ExtendedString;

GetDelta(): boolean;

// for internal use only!
SetDelta(isDelta: boolean): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Makes a DeltaOnModification between <me> and <anOldAttribute>
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
