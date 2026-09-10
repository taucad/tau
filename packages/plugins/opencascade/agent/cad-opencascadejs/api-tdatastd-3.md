# libcascade — TDataStd (3)

10 top-level symbols. Signatures are verbatim typescript.

// Contains a named data
TDataStd_NamedData: declare class TDataStd_NamedData extends TDF_Attribute

constructor

// Returns the ID of the named data attribute
static GetID(): Standard_GUID;

// Finds or creates a named data attribute
static Set(label: TDF_Label): TDataStd_NamedData;

// Returns true if at least one named integer value is kept in the attribute
HasIntegers(): boolean;

// Returns true if the attribute contains specified by Name integer value
HasInteger(theName: TCollection_ExtendedString): boolean;

// Returns the integer value specified by the Name
GetInteger(theName: TCollection_ExtendedString): number;

// Defines a named integer
SetInteger(theName: TCollection_ExtendedString, theInteger: number): void;

// Returns the internal container of named integers
GetIntegersContainer(): NCollection_DataMap_TCollection_ExtendedString_int;

// Replace the container content by new content of the <theIntegers>
ChangeIntegers(theIntegers: NCollection_DataMap_TCollection_ExtendedString_int): void;

// Returns true if at least one named real value is kept in the attribute
HasReals(): boolean;

// Returns true if the attribute contains a real specified by Name
HasReal(theName: TCollection_ExtendedString): boolean;

// Returns the named real
GetReal(theName: TCollection_ExtendedString): number;

// Defines a named real
SetReal(theName: TCollection_ExtendedString, theReal: number): void;

// Returns the internal container of named reals
GetRealsContainer(): NCollection_DataMap_TCollection_ExtendedString_double;

// Replace the container content by new content of the <theReals>
ChangeReals(theReals: NCollection_DataMap_TCollection_ExtendedString_double): void;

// Returns true if there are some named strings in the attribute
HasStrings(): boolean;

// Returns true if the attribute contains this named string
HasString(theName: TCollection_ExtendedString): boolean;

// Returns the named string
GetString(theName: TCollection_ExtendedString): TCollection_ExtendedString;

// Defines a named string
SetString(theName: TCollection_ExtendedString, theString: TCollection_ExtendedString): void;

// Returns the internal container of named strings
GetStringsContainer(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

// Replace the container content by new content of the <theStrings>
ChangeStrings(theStrings: NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString): void;

// Returns true if there are some named bytes in the attribute
HasBytes(): boolean;

// Returns true if the attribute contains this named byte
HasByte(theName: TCollection_ExtendedString): boolean;

// Returns the named byte
GetByte(theName: TCollection_ExtendedString): number;

// Defines a named byte
SetByte(theName: TCollection_ExtendedString, theByte: number): void;

// Returns the internal container of named bytes
GetBytesContainer(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

// Replace the container content by new content of the <theBytes>
ChangeBytes(theBytes: NCollection_DataMap_TCollection_ExtendedString_uint8_t): void;

// Returns true if there are some named arrays of integer values in the attribute
HasArraysOfIntegers(): boolean;

// Returns true if the attribute contains this named array of integer values
HasArrayOfIntegers(theName: TCollection_ExtendedString): boolean;

// Returns the named array of integer values
GetArrayOfIntegers(theName: TCollection_ExtendedString): NCollection_HArray1_int;

// Defines a named array of integer values
SetArrayOfIntegers(theName: TCollection_ExtendedString, theArrayOfIntegers: NCollection_HArray1_int): void;
// theName: key
// theArrayOfIntegers: new value, overrides existing (passed array will be copied by value!)

// Returns the internal container of named arrays of integer values
GetArraysOfIntegersContainer(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

// Replace the container content by new content of the <theArraysOfIntegers>
ChangeArraysOfIntegers(theArraysOfIntegers: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int): void;

// Returns true if there are some named arrays of real values in the attribute
HasArraysOfReals(): boolean;

// Returns true if the attribute contains this named array of real values
HasArrayOfReals(theName: TCollection_ExtendedString): boolean;

// Returns the named array of real values
GetArrayOfReals(theName: TCollection_ExtendedString): NCollection_HArray1_double;

// Defines a named array of real values
SetArrayOfReals(theName: TCollection_ExtendedString, theArrayOfReals: NCollection_HArray1_double): void;
// theName: key
// theArrayOfReals: new value, overrides existing (passed array will be copied by value!)

// Returns the internal container of named arrays of real values
GetArraysOfRealsContainer(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

// Replace the container content by new content of the <theArraysOfReals>
ChangeArraysOfReals(theArraysOfReals: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double): void;

// Clear data
Clear(): void;

HasDeferredData(): boolean;

LoadDeferredData(theToKeepDeferred?: boolean): boolean;

UnloadDeferredData(): boolean;

clear(): void;

setInteger(theName: TCollection_ExtendedString, theInteger: number): void;

setReal(theName: TCollection_ExtendedString, theReal: number): void;

setString(theName: TCollection_ExtendedString, theString: TCollection_ExtendedString): void;

setByte(theName: TCollection_ExtendedString, theByte: number): void;

setArrayOfIntegers(theName: TCollection_ExtendedString, theArrayOfIntegers: NCollection_HArray1_int): void;

setArrayOfReals(theName: TCollection_ExtendedString, theArrayOfReals: NCollection_HArray1_double): void;

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

// NoteBook Object attribute
TDataStd_NoteBook: declare class TDataStd_NoteBook extends TDataStd_GenericEmpty

constructor

// **class methods**
static Find(current: TDF_Label): { returnValue: boolean; N: TDataStd_NoteBook; [Symbol.dispose](): void };

// Create an enpty NoteBook attribute, located at <label>
static New(label: TDF_Label): TDataStd_NoteBook;

// **NoteBook methods**
static GetID(): Standard_GUID;

// Tool to Create an Integer attribute from , Insert it in a new son label of <me>
Append(value: number, isExported: boolean): TDataStd_Real;
Append(value: number, isExported: boolean): TDataStd_Integer;
Append(value: number, isExported: boolean): TDataStd_Real;
Append(value: number, isExported: boolean): TDataStd_Integer;

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

// The basis to define a real number attribute
TDataStd_Real: declare class TDataStd_Real extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

// Finds, or creates, a Real attribute with default GUID and sets
static Set(label: TDF_Label, value: number): TDataStd_Real;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
static Set(label: TDF_Label, value: number): TDataStd_Real;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
Set(V: number): void;

// Obsolete method that will be removed in next versions
// DEPRECATED
SetDimension(DIM: TDataStd_RealEnum): void;

// Obsolete method that will be removed in next versions
// DEPRECATED
GetDimension(): TDataStd_RealEnum;

// Sets the explicit GUID for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Returns the real number value contained in the attribute
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

// A framework for an attribute composed of a real number array
TDataStd_RealArray: declare class TDataStd_RealArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// **class methods**
static GetID(): Standard_GUID;

// Finds or creates on the <label> a real array attribute with the specified <lower> and <upper> boundaries
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;

// Initialize the inner array with bounds from <lower> to <upper>
Init(lower: number, upper: number): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Sets the <Index>th element of the array to OutOfRange exception is raised if <Index> doesn't respect Lower and Upper bounds of the internal array
SetValue(Index: number, Value: number): void;

// Return the value of the <Index>th element of the array
Value(Index: number): number;

// Returns the lower boundary of the array
Lower(): number;

// Returns the upper boundary of the array
Upper(): number;

// Returns the number of elements of the array of reals in terms of the number of elements it contains
Length(): number;

// Sets the inner array <myValue> of the RealArray attribute to <newArray>
ChangeArray(newArray: NCollection_HArray1_double, isCheckItems?: boolean): void;

// Returns the handle of this array of reals
Array(): NCollection_HArray1_double;

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

// The terms of this enumeration define the semantics of a real number value
TDataStd_RealEnum: typeof TDataStd_RealEnum[keyof typeof TDataStd_RealEnum]

// Contains a list of doubles
TDataStd_RealList: declare class TDataStd_RealList extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates a list of double values attribute
static Set(label: TDF_Label): TDataStd_RealList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_RealList;
static Set(label: TDF_Label): TDataStd_RealList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_RealList;

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

List(): NCollection_List_double;

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

// Contains an array of references to the labels
TDataStd_ReferenceArray: declare class TDataStd_ReferenceArray extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates an array of reference values (labels) attribute
static Set(label: TDF_Label, lower: number, upper: number): TDataStd_ReferenceArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_ReferenceArray;
static Set(label: TDF_Label, lower: number, upper: number): TDataStd_ReferenceArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_ReferenceArray;

// Initialize the inner array with bounds from <lower> to <upper>
Init(lower: number, upper: number): void;

// Sets the <Index>th element of the array to OutOfRange exception is raised if <Index> doesn't respect Lower and Upper bounds of the internal array
SetValue(index: number, value: TDF_Label): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Returns the value of the <Index>th element of the array
Value(Index: number): TDF_Label;

// Returns the lower boundary of the array
Lower(): number;

// Returns the upper boundary of the array
Upper(): number;

// Returns the number of elements in the array
Length(): number;

InternalArray(): NCollection_HArray1_TDF_Label;

SetInternalArray(values: NCollection_HArray1_TDF_Label, isCheckItems?: boolean): void;

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

// Contains a list of references
TDataStd_ReferenceList: declare class TDataStd_ReferenceList extends TDF_Attribute

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Finds or creates a list of reference values (labels) attribute
static Set(label: TDF_Label): TDataStd_ReferenceList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ReferenceList;
static Set(label: TDF_Label): TDataStd_ReferenceList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ReferenceList;

IsEmpty(): boolean;

Extent(): number;

Prepend(value: TDF_Label): void;

Append(value: TDF_Label): void;

// Sets the explicit GUID (user defined) for the attribute
SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

// Inserts the before the first meet of <before_value>
InsertBefore(value: TDF_Label, before_value: TDF_Label): boolean;
InsertBefore(index: number, before_value: TDF_Label): boolean;
InsertBefore(value: TDF_Label, before_value: TDF_Label): boolean;
InsertBefore(index: number, before_value: TDF_Label): boolean;

// Inserts the after the first meet of <after_value>
InsertAfter(value: TDF_Label, after_value: TDF_Label): boolean;
InsertAfter(index: number, after_value: TDF_Label): boolean;
InsertAfter(value: TDF_Label, after_value: TDF_Label): boolean;
InsertAfter(index: number, after_value: TDF_Label): boolean;

// Removes the first meet of the
Remove(value: TDF_Label): boolean;
Remove(index: number): boolean;
Remove(value: TDF_Label): boolean;
Remove(index: number): boolean;

Clear(): void;

First(): TDF_Label;

Last(): TDF_Label;

List(): NCollection_List_TDF_Label;

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

// **Relation attribute.**
TDataStd_Relation: declare class TDataStd_Relation extends TDataStd_Expression

constructor

// **class methods**
static GetID(): Standard_GUID;

// Find, or create, an Relation attribute
static Set(label: TDF_Label): TDataStd_Relation;

SetRelation(E: TCollection_ExtendedString): void;

GetRelation(): TCollection_ExtendedString;

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

// Defines a boolean attribute
TDataStd_Tick: declare class TDataStd_Tick extends TDataStd_GenericEmpty

constructor

// **Static methods**
static GetID(): Standard_GUID;

// Find, or create, a Tick attribute
static Set(label: TDF_Label): TDataStd_Tick;

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
