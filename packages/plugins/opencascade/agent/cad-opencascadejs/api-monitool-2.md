# libcascade — MoniTool (2)

3 top-level symbols. Signatures are verbatim typescript.

// This class allows to dynamically manage .
MoniTool_TypedValue: declare class MoniTool_TypedValue extends Standard_Transient

constructor

// Returns the name
Name(): string;

// Returns the type of the value
ValueType(): MoniTool_ValueType;

// Returns the Definition By priority, the enforced one, else an automatic one, computed from the specification
Definition(): TCollection_AsciiString;

// Enforces a Definition
SetDefinition(deftext: string): void;

// Completes the definition of a TypedValue by command <initext>, once created with its type Returns True if done, False if could not be interpreted <initext> may be
AddDef(initext: string): boolean;

// Sets a label, which can then be displayed
SetLabel(label: string): void;

// Returns the label, if set
Label(): string;

// Sets a maximum length for a text (active only for a free text)
SetMaxLength(max: number): void;

// Returns the maximum length, 0 if not set
MaxLength(): number;

// Sets an Integer limit (included) to <val>, the upper limit if <max> is True, the lower limit if <max> is False
SetIntegerLimit(max: boolean, val: number): void;

// Gives an Integer Limit (upper if <max> True, lower if <max> False)
IntegerLimit(max: boolean, val?: number): { returnValue: boolean; val: number };

// Sets a Real limit (included) to <val>, the upper limit if <max> is True, the lower limit if <max> is False
SetRealLimit(max: boolean, val: number): void;

// Gives an Real Limit (upper if <max> True, lower if <max> False)
RealLimit(max: boolean, val?: number): { returnValue: boolean; val: number };

// Sets (Clears if <def> empty) a unit definition, as an equation of dimensions
SetUnitDef(def: string): void;

// Returns the recorded unit definition, empty if not set
UnitDef(): string;

// For an enumeration, precises the starting value (default 0) and the match condition
StartEnum(start?: number, match?: boolean): void;

// Adds enumerative definitions
AddEnum(v1?: string, v2?: string, v3?: string, v4?: string, v5?: string, v6?: string, v7?: string, v8?: string, v9?: string, v10?: string): void;

// Adds an enumeration definition, by its string and numeric values
AddEnumValue(val: string, num: number): void;

// Gives the Enum definitions
EnumDef(startcase?: number, endcase?: number, match?: boolean): { returnValue: boolean; startcase: number; endcase: number; match: boolean };

// Returns the value of an enumerative definition, from its rank Empty string if out of range or not an Enum
EnumVal(num: number): string;

// Returns the case number which corresponds to a string value Works with main and additional values Returns (StartEnum - 1) if not OK, -1 if not an Enum
EnumCase(val: string): number;

// Sets type of which an Object TypedValue must be kind of Error for a TypedValue not an Object (Entity)
SetObjectType(typ: Standard_Type): void;

// Returns the type of which an Object TypedValue must be kind of Default is {@link Standard_Transient`Standard_Transient`} Null for a TypedValue not an Object
ObjectType(): Standard_Type;

// Sets a specific Interpret function
SetInterpret(func: ((arg0: MoniTool_TypedValue, arg1: TCollection_HAsciiString, arg2: boolean) => TCollection_HAsciiString)): void;

// Tells if a TypedValue has an Interpret
HasInterpret(): boolean;

// Sets a specific Satisfies function
SetSatisfies(func: ((arg0: TCollection_HAsciiString) => boolean), name: string): void;

// Returns name of specific satisfy, empty string if none
SatisfiesName(): string;

// Returns True if the value is set (not empty/not null object)
IsSetValue(): boolean;

// Returns the value, as a cstring
CStringValue(): string;

// Returns the value, as a Handle (can then be shared) Null if not defined
HStringValue(): TCollection_HAsciiString;

// Interprets a value
Interpret(hval: TCollection_HAsciiString, native: boolean): TCollection_HAsciiString;

// Returns True if a value statifies the specification (remark
Satisfies(hval: TCollection_HAsciiString): boolean;

// Clears the recorded Value
ClearValue(): void;

// Changes the value
SetCStringValue(val: string): boolean;

// Forces a new Handle for the Value It can be empty, else (if Type is not free Text), it must satisfy the specification
SetHStringValue(hval: TCollection_HAsciiString): boolean;

// Returns the value as integer, i.e
IntegerValue(): number;

// Changes the value as an integer, only for Integer or Enum
SetIntegerValue(ival: number): boolean;

// Returns the value as real, for a Real type TypedValue Else, returns 0
RealValue(): number;

// Changes the value as a real, only for Real
SetRealValue(rval: number): boolean;

// Returns the value as Transient Object, only for Object/Entity Remark that the "HString value" is IGNORED here Null if not set
ObjectValue(): Standard_Transient;

// Same as ObjectValue, but avoids DownCast
GetObjectValue(): { val: Standard_Transient; [Symbol.dispose](): void };

// Changes the value as Transient Object, only for Object/Entity Returns False if DynamicType does not satisfy ObjectType Can be redefined to be managed (in a subclass)
SetObjectValue(obj: Standard_Transient): boolean;

// Returns the type name of the ObjectValue, or an empty string if not set
ObjectTypeName(): string;

// Adds a TypedValue in the library
static AddLib(tv: MoniTool_TypedValue, def?: string): boolean;

// Returns the TypedValue bound with a given Name Null Handle if none recorded Warning
static Lib(def: string): MoniTool_TypedValue;

// Returns a COPY of the TypedValue bound with a given Name Null Handle if none recorded
static FromLib(def: string): MoniTool_TypedValue;

// Returns the list of names of items of the Library of Types Library of TypedValue as Valued Parameters, accessed by parameter name for use by management of Static Parameters
static LibList(): NCollection_HSequence_TCollection_AsciiString;

// Returns a static value from its name, null if unknown
static StaticValue(name: string): MoniTool_TypedValue;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

MoniTool_ValueType: typeof MoniTool_ValueType[keyof typeof MoniTool_ValueType]

MoniTool_DataMapOfShapeTransient: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher
