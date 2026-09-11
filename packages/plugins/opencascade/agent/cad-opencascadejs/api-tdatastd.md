# libcascade — TDataStd

28 top-level symbols. Signatures are verbatim typescript.

TDataStd: declare class TDataStd

constructor

static IDList(anIDList: NCollection_List_Standard_GUID): void;

delete(): void;

[Symbol.dispose](): void;

TDataStd_AsciiString: declare class TDataStd_AsciiString extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF*Label, string*: TCollection*AsciiString): TDataStd_AsciiString;
static Set(label: TDF_Label, guid: Standard_GUID, string*: TCollection*AsciiString): TDataStd_AsciiString;
static Set(label: TDF_Label, string*: TCollection*AsciiString): TDataStd_AsciiString;
static Set(label: TDF_Label, guid: Standard_GUID, string*: TCollection_AsciiString): TDataStd_AsciiString;
Set(S: TCollection_AsciiString): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Get(): TCollection_AsciiString;

IsEmpty(): boolean;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_BooleanArray: declare class TDataStd_BooleanArray extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, lower: number, upper: number): TDataStd_BooleanArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_BooleanArray;
static Set(label: TDF_Label, lower: number, upper: number): TDataStd_BooleanArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_BooleanArray;

Init(lower: number, upper: number): void;

SetValue(index: number, value: boolean): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Value(Index: number): boolean;

Lower(): number;

Upper(): number;

Length(): number;

InternalArray(): TColStd_HArray1OfByte;

SetInternalArray(values: TColStd_HArray1OfByte): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_BooleanList: declare class TDataStd_BooleanList extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

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

List(): NCollection_List_uint8_t;

InsertBefore(index: number, before_value: boolean): boolean;

InsertAfter(index: number, after_value: boolean): boolean;

Remove(index: number): boolean;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_ByteArray: declare class TDataStd_ByteArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static GetID(): Standard_GUID;

static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;

Init(lower: number, upper: number): void;

SetValue(index: number, value: number): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Value(Index: number): number;

Lower(): number;

Upper(): number;

Length(): number;

InternalArray(): TColStd_HArray1OfByte;

ChangeArray(newArray: TColStd_HArray1OfByte, isCheckItems?: boolean): void;

GetDelta(): boolean;

SetDelta(isDelta: boolean): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

delete(): void;

[Symbol.dispose](): void;

TDataStd_ChildNodeIterator: declare class TDataStd_ChildNodeIterator

constructor

Initialize(aTreeNode: TDataStd_TreeNode, allLevels?: boolean): void;

More(): boolean;

Next(): void;

NextBrother(): void;

Value(): TDataStd_TreeNode;

delete(): void;

[Symbol.dispose](): void;

TDataStd_Comment: declare class TDataStd_Comment extends TDataStd_GenericExtString

constructor

static GetID(): Standard_GUID;

static Set(label: TDF*Label): TDataStd_Comment;
static Set(label: TDF_Label, string*: TCollection*ExtendedString): TDataStd_Comment;
Set(S: TCollection_ExtendedString): void;
static Set(label: TDF_Label): TDataStd_Comment;
static Set(label: TDF_Label, string*: TCollection_ExtendedString): TDataStd_Comment;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

TDataStd_Current: declare class TDataStd_Current extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(L: TDF_Label): void;

static Get(acces: TDF_Label): TDF_Label;

static Has(acces: TDF_Label): boolean;

SetLabel(current: TDF_Label): void;

GetLabel(): TDF_Label;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfByteArray: declare class TDataStd_DeltaOnModificationOfByteArray extends TDF_DeltaOnModification

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfExtStringArray: declare class TDataStd_DeltaOnModificationOfExtStringArray extends TDF_DeltaOnModification

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfIntArray: declare class TDataStd_DeltaOnModificationOfIntArray extends TDF_DeltaOnModification

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfIntPackedMap: declare class TDataStd_DeltaOnModificationOfIntPackedMap extends TDF_DeltaOnModification

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfRealArray: declare class TDataStd_DeltaOnModificationOfRealArray extends TDF_DeltaOnModification

constructor

Apply(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_Directory: declare class TDataStd_Directory extends TDataStd_GenericEmpty

constructor

static Find(current: TDF_Label): { returnValue: boolean; D: TDataStd_Directory; [Symbol.dispose](): void };

static New(label: TDF_Label): TDataStd_Directory;

static AddDirectory(dir: TDataStd_Directory): TDataStd_Directory;

static MakeObjectLabel(dir: TDataStd_Directory): TDF_Label;

static GetID(): Standard_GUID;

ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

TDataStd_Expression: declare class TDataStd_Expression extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label): TDataStd_Expression;

Name(): TCollection_ExtendedString;

SetExpression(E: TCollection_ExtendedString): void;

GetExpression(): TCollection_ExtendedString;

GetVariables(): NCollection_List_handle_TDF_Attribute;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_ExtStringArray: declare class TDataStd_ExtStringArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static GetID(): Standard_GUID;

static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;

Init(lower: number, upper: number): void;

SetValue(Index: number, Value: TCollection_ExtendedString): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Value(Index: number): TCollection_ExtendedString;

Lower(): number;

Upper(): number;

Length(): number;

ChangeArray(newArray: NCollection_HArray1_TCollection_ExtendedString, isCheckItems?: boolean): void;

Array(): NCollection_HArray1_TCollection_ExtendedString;

GetDelta(): boolean;

SetDelta(isDelta: boolean): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

delete(): void;

[Symbol.dispose](): void;

TDataStd_ExtStringList: declare class TDataStd_ExtStringList extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label): TDataStd_ExtStringList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ExtStringList;
static Set(label: TDF_Label): TDataStd_ExtStringList;
static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ExtStringList;

IsEmpty(): boolean;

Extent(): number;

Prepend(value: TCollection_ExtendedString): void;

Append(value: TCollection_ExtendedString): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

InsertBefore(value: TCollection_ExtendedString, before_value: TCollection_ExtendedString): boolean;
InsertBefore(index: number, before_value: TCollection_ExtendedString): boolean;
InsertBefore(value: TCollection_ExtendedString, before_value: TCollection_ExtendedString): boolean;
InsertBefore(index: number, before_value: TCollection_ExtendedString): boolean;

InsertAfter(value: TCollection_ExtendedString, after_value: TCollection_ExtendedString): boolean;
InsertAfter(index: number, after_value: TCollection_ExtendedString): boolean;
InsertAfter(value: TCollection_ExtendedString, after_value: TCollection_ExtendedString): boolean;
InsertAfter(index: number, after_value: TCollection_ExtendedString): boolean;

Remove(value: TCollection_ExtendedString): boolean;
Remove(index: number): boolean;
Remove(value: TCollection_ExtendedString): boolean;
Remove(index: number): boolean;

Clear(): void;

First(): TCollection_ExtendedString;

Last(): TCollection_ExtendedString;

List(): NCollection_List_TCollection_ExtendedString;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_GenericEmpty: declare class TDataStd_GenericEmpty extends TDF_Attribute

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_GenericExtString: declare class TDataStd_GenericExtString extends TDF_Attribute

Set(S: TCollection_ExtendedString): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Get(): TCollection_ExtendedString;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_HDataMapOfStringByte: declare class TDataStd_HDataMapOfStringByte extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

delete(): void;

[Symbol.dispose](): void;

TDataStd_HDataMapOfStringHArray1OfInteger: declare class TDataStd_HDataMapOfStringHArray1OfInteger extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

delete(): void;

[Symbol.dispose](): void;

TDataStd_HDataMapOfStringHArray1OfReal: declare class TDataStd_HDataMapOfStringHArray1OfReal extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

delete(): void;

[Symbol.dispose](): void;

TDataStd_HDataMapOfStringInteger: declare class TDataStd_HDataMapOfStringInteger extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_int;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_int;

delete(): void;

[Symbol.dispose](): void;

TDataStd_HDataMapOfStringReal: declare class TDataStd_HDataMapOfStringReal extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_double;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_double;

delete(): void;

[Symbol.dispose](): void;

TDataStd_HDataMapOfStringString: declare class TDataStd_HDataMapOfStringString extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Map(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

delete(): void;

[Symbol.dispose](): void;

TDataStd_IntPackedMap: declare class TDataStd_IntPackedMap extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static GetID(): Standard_GUID;

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

SetDelta(isDelta: boolean): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

delete(): void;

[Symbol.dispose](): void;

TDataStd_Integer: declare class TDataStd_Integer extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, value: number): TDataStd_Integer;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Integer;
static Set(label: TDF_Label, value: number): TDataStd_Integer;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Integer;
Set(V: number): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Get(): number;

IsCaptured(): boolean;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TDataStd_IntegerArray: declare class TDataStd_IntegerArray extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static GetID(): Standard_GUID;

static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;

Init(lower: number, upper: number): void;

SetValue(Index: number, Value: number): void;

SetID(argNo0: Standard_GUID): void;
SetID(): void;
SetID(argNo0: Standard_GUID): void;
SetID(): void;

Value(Index: number): number;

Lower(): number;

Upper(): number;

Length(): number;

ChangeArray(newArray: NCollection_HArray1_int, isCheckItems?: boolean): void;

Array(): NCollection_HArray1_int;

GetDelta(): boolean;

SetDelta(isDelta: boolean): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;
DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

delete(): void;

[Symbol.dispose](): void;
