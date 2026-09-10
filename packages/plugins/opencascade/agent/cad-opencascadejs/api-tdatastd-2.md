# libcascade — TDataStd (2)

14 top-level symbols. Signatures are verbatim typescript.

// Contains a list of ExtendedString
TDataStd_ExtStringList: declare class TDataStd_ExtStringList extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates a list of string values attribute with explicit user defined <guid>
static Set(label: TDF_Label): TDataStd_ExtStringList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ExtStringList;
static Set(label: TDF_Label): TDataStd_ExtStringList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ExtStringList;

IsEmpty(): boolean;

Extent(): number;

Prepend(value: TCollection_ExtendedString): void;

Append(value: TCollection_ExtendedString): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Inserts the before the first meet of <before_value>
InsertBefore(value: TCollection_ExtendedString, before_value: TCollection_ExtendedString): boolean;
InsertBefore(index: number, before_value: TCollection_ExtendedString): boolean;
InsertBefore(value: TCollection_ExtendedString, before_value: TCollection_ExtendedString): boolean;
InsertBefore(index: number, before_value: TCollection_ExtendedString): boolean;

// Inserts the after the first meet of <after_value>
InsertAfter(value: TCollection_ExtendedString, after_value: TCollection_ExtendedString): boolean;
InsertAfter(index: number, after_value: TCollection_ExtendedString): boolean;
InsertAfter(value: TCollection_ExtendedString, after_value: TCollection_ExtendedString): boolean;
InsertAfter(index: number, after_value: TCollection_ExtendedString): boolean;

// Removes the first meet of the
Remove(value: TCollection_ExtendedString): boolean;
Remove(index: number): boolean;
Remove(value: TCollection_ExtendedString): boolean;
Remove(index: number): boolean;

Clear(): void;

First(): TCollection_ExtendedString;

Last(): TCollection_ExtendedString;

List(): NCollection_List_TCollection_ExtendedString;

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

// An ancestor attribute for all attributes which have no fields
TDataStd_GenericEmpty: declare class TDataStd_GenericEmpty extends TDF_Attribute

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An ancestor attribute for all attributes which have {@link TCollection_ExtendedString`TCollection_ExtendedString`} field
TDataStd_GenericExtString: declare class TDataStd_GenericExtString extends TDF_Attribute

// Sets as name
Set(S: TCollection_ExtendedString): void;

// Sets the explicit user defined GUID to the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Returns the name contained in this name attribute
Get(): TCollection_ExtendedString;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extension of `NCollection_DataMap<TCollection_ExtendedString, uint8_t>` class to be manipulated by handle
TDataStd_HDataMapOfStringByte: declare class TDataStd_HDataMapOfStringByte extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extension of `NCollection_DataMap`<{@link TCollection_ExtendedString`TCollection_ExtendedString`}, occ::handle<NCollection_HArray1<int>>> class to be manipulated by handle
TDataStd_HDataMapOfStringHArray1OfInteger: declare class TDataStd_HDataMapOfStringHArray1OfInteger extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extension of `NCollection_DataMap`<{@link TCollection_ExtendedString`TCollection_ExtendedString`}, occ::handle<NCollection_HArray1<double>>> class to be manipulated by handle
TDataStd_HDataMapOfStringHArray1OfReal: declare class TDataStd_HDataMapOfStringHArray1OfReal extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extension of `NCollection_DataMap<TCollection_ExtendedString, int>` class to be manipulated by handle
TDataStd_HDataMapOfStringInteger: declare class TDataStd_HDataMapOfStringInteger extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_int;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extension of `NCollection_DataMap<TCollection_ExtendedString, double>` class to be manipulated by handle
TDataStd_HDataMapOfStringReal: declare class TDataStd_HDataMapOfStringReal extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_double;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extension of `NCollection_DataMap<TCollection_ExtendedString, TCollection_ExtendedString>` class to be manipulated by handle
TDataStd_HDataMapOfStringString: declare class TDataStd_HDataMapOfStringString extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Attribute for storing TColStd_PackedMapOfInteger
TDataStd_IntPackedMap: declare class TDataStd_IntPackedMap extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// **class methods**
static GetID(): Standard_GUID;

// Finds or creates an integer map attribute on the given label
static Set(label: TDF_Label, isDelta?: boolean): TDataStd_IntPackedMap;

ChangeMap(theMap: TColStd_HPackedMapOfInteger): boolean;
ChangeMap(theMap: TColStd_PackedMapOfInteger): boolean;
ChangeMap(theMap: TColStd_HPackedMapOfInteger): boolean;
ChangeMap(theMap: TColStd_PackedMapOfInteger): boolean;

GetMap(): TColStd_PackedMapOfInteger;

GetHMap(): TColStd_HPackedMapOfInteger;

Clear(): boolean;

Add(theKey: number): boolean;

Remove(theKey: number): boolean;

Contains(theKey: number): boolean;

Extent(): number;

IsEmpty(): boolean;

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

// The basis to define an integer attribute
TDataStd_Integer: declare class TDataStd_Integer extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Finds, or creates, an Integer attribute and sets the Integer attribute is returned
static Set(label: TDF_Label, value: number): TDataStd_Integer;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Integer;
static Set(label: TDF_Label, value: number): TDataStd_Integer;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Integer;
Set(V: number): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Returns the integer value contained in the attribute
Get(): number;

// Returns True if there is a reference on the same label
IsCaptured(): boolean;

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

// Contains an array of integers
TDataStd_IntegerArray: declare class TDataStd_IntegerArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// **class methods**
static GetID(): Standard_GUID;

// Finds or creates on the <label> an integer array attribute with the specified <lower> and <upper> boundaries
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;

// Initialize the inner array with bounds from <lower> to <upper>
Init(lower: number, upper: number): void;

// Sets the <Index>th element of the array to OutOfRange exception is raised if <Index> doesn't respect Lower and Upper bounds of the internal array
SetValue(Index: number, Value: number): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Return the value of the <Index>th element of the array
Value(Index: number): number;

// Returns the lower boundary of this array of integers
Lower(): number;

// Return the upper boundary of this array of integers
Upper(): number;

// Returns the length of this array of integers in terms of the number of elements it contains
Length(): number;

// Sets the inner array <myValue> of the IntegerArray attribute to <newArray>
ChangeArray(newArray: NCollection_HArray1_int, isCheckItems?: boolean): void;

// Return the inner array of the IntegerArray attribute
Array(): NCollection_HArray1_int;

GetDelta(): boolean;

// for internal use only!
SetDelta(isDelta: boolean): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Note
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Makes a DeltaOnModification between <me> and <anOldAttribute>
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains a list of integers
TDataStd_IntegerList: declare class TDataStd_IntegerList extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates a list of integer values attribute
static Set(label: TDF_Label): TDataStd_IntegerList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_IntegerList;
static Set(label: TDF_Label): TDataStd_IntegerList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_IntegerList;

IsEmpty(): boolean;

Extent(): number;

Prepend(value: number): void;

Append(value: number): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Inserts the before the first meet of <before_value>
InsertBefore(value: number, before_value: number): boolean;

// Inserts the before the <index> position
InsertBeforeByIndex(index: number, before_value: number): boolean;

// Inserts the after the first meet of <after_value>
InsertAfter(value: number, after_value: number): boolean;

// Inserts the after the <index> position
InsertAfterByIndex(index: number, after_value: number): boolean;

// Removes the first meet of the
Remove(value: number): boolean;

// Removes a value at <index> position
RemoveByIndex(index: number): boolean;

Clear(): void;

First(): number;

Last(): number;

List(): NCollection_List_int;

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

// Used to define a name attribute containing a string which specifies the name
TDataStd_Name: declare class TDataStd_Name extends TDataStd_GenericExtString

constructor

// **class methods working on the name itself**
static GetID(): Standard_GUID;

// Creates (if does not exist) and sets the name in the name attribute
static Set(label: TDF*Label, string*: TCollection*ExtendedString): TDataStd_Name;
static Set(label: TDF_Label, guid: Standard_GUID, string*: TCollection*ExtendedString): TDataStd_Name;
static Set(label: TDF_Label, string*: TCollection*ExtendedString): TDataStd_Name;
static Set(label: TDF_Label, guid: Standard_GUID, string*: TCollection_ExtendedString): TDataStd_Name;
Set(S: TCollection_ExtendedString): void;

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
