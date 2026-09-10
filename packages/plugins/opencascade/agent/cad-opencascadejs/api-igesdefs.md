# libcascade — IGESDefs

22 top-level symbols. Signatures are verbatim typescript.

// To embody general definitions of Entities (Parameters, Tables ...)
IGESDefs: declare class IGESDefs

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESDefs_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Associativity Definition Entity, Type <302> Form <5001 - 9999> in package {@link IGESDefs`IGESDefs`}
IGESDefs_AssociativityDef: declare class IGESDefs_AssociativityDef extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class AssociativityDef
Init(requirements: NCollection_HArray1_int, orders: NCollection_HArray1_int, numItems: NCollection_HArray1_int, items: IGESBasic_HArray1OfHArray1OfInteger): void;

SetFormNumber(form: number): void;

// returns the Number of class definitions
NbClassDefs(): number;

// returns 1 if the theBackPointerReqs(ClassNum) = 1 returns 0 if the theBackPointerReqs(ClassNum) = 2 raises exception if ClassNum <= 0 or ClassNum > `NbClassDefs()`
IsBackPointerReq(ClassNum: number): boolean;

// returns 1 or 2 raises exception if ClassNum <= 0 or ClassNum > `NbClassDefs()`
BackPointerReq(ClassNum: number): number;

// returns 1 if theClassOrders(ClassNum) = 1 (ordered class) returns 0 if theClassOrders(ClassNum) = 2 (unordered class) raises exception if ClassNum <= 0 or ClassNum > `NbClassDefs()`
IsOrdered(ClassNum: number): boolean;

// returns 1 or 2 raises exception if ClassNum <= 0 or ClassNum > `NbClassDefs()`
ClassOrder(ClassNum: number): number;

// returns no
NbItemsPerClass(ClassNum: number): number;

// returns ItemNum'th Item of ClassNum'th Class raises exception if ClassNum <= 0 or ClassNum > `NbClassDefs()` ItemNum <= 0 or ItemNum > NbItemsPerClass(ClassNum)
Item(ClassNum: number, ItemNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Attribute Table Definition Entity, Type <322> Form [0, 1, 2] in package {@link IGESDefs`IGESDefs`}
IGESDefs_AttributeDef: declare class IGESDefs_AttributeDef extends IGESData_IGESEntity

constructor

Init(aName: TCollection_HAsciiString, aListType: number, attrTypes: NCollection_HArray1_int, attrValueDataTypes: NCollection_HArray1_int, attrValueCounts: NCollection_HArray1_int, attrValues: NCollection_HArray1_handle_Standard_Transient, attrValuePointers: IGESDefs_HArray1OfHArray1OfTextDisplayTemplate): void;

// Returns True if a Table Name is defined
HasTableName(): boolean;

// returns the Attribute Table name, or comment (default = null, no name
TableName(): TCollection_HAsciiString;

// returns the Attribute List Type
ListType(): number;

// returns the Number of Attributes
NbAttributes(): number;

// returns the num'th Attribute Type raises exception if num <= 0 or num > `NbAttributes()`
AttributeType(num: number): number;

// returns the num'th Attribute value data type raises exception if num <= 0 or num > `NbAttributes()`
AttributeValueDataType(num: number): number;

// returns the num'th Attribute value count raises exception if num <= 0 or num > `NbAttributes()`
AttributeValueCount(num: number): number;

// returns false if Values are defined (i.e
HasValues(): boolean;

// returns false if TextDisplays are defined (i.e
HasTextDisplay(): boolean;

AttributeTextDisplay(AttrNum: number, PointerNum: number): IGESGraph_TextDisplayTemplate;

// Returns the List of Attributes <AttrNum>, as a Transient
AttributeList(AttrNum: number): Standard_Transient;

// Returns Attribute Value <AttrNum, rank ValueNum> as an Integer Error if Indices out of Range, or no Value defined, or not an Integer
AttributeAsInteger(AttrNum: number, ValueNum: number): number;

// Returns Attribute Value <AttrNum, rank ValueNum> as a Real Error if Indices out of Range, or no Value defined, or not a Real
AttributeAsReal(AttrNum: number, ValueNum: number): number;

// Returns Attribute Value <AttrNum, rank ValueNum> as an Integer
AttributeAsString(AttrNum: number, ValueNum: number): TCollection_HAsciiString;

// Returns Attribute Value <AttrNum, rank ValueNum> as an Entity Error if Indices out of Range, or no Value defined, or not a Entity
AttributeAsEntity(AttrNum: number, ValueNum: number): IGESData_IGESEntity;

// Returns Attribute Value <AttrNum, rank ValueNum> as a Boolean Error if Indices out of Range, or no Value defined, or not a Logical
AttributeAsLogical(AttrNum: number, ValueNum: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Attribute Table, Type <422> Form <0, 1> in package {@link IGESDefs`IGESDefs`} This class is used to represent an occurrence of Attribute Table
IGESDefs_AttributeTable: declare class IGESDefs_AttributeTable extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class AttributeTable
Init(attributes: NCollection_HArray2_handle_Standard_Transient): void;

// Sets a Definition as Structure information (works by calling InitMisc)
SetDefinition(def: IGESDefs_AttributeDef): void;

// Return the Structure information in Directory Entry, casted as an AttributeDef
Definition(): IGESDefs_AttributeDef;

// returns Number of Rows
NbRows(): number;

// returns Number of Attributes
NbAttributes(): number;

// returns the Type of an Attribute, given its No
DataType(Atnum: number): number;

// returns the Count of Value for an Attribute, given its No
ValueCount(Atnum: number): number;

AttributeList(Attribnum: number, Rownum: number): Standard_Transient;

// Returns Attribute Value <AtNum, Rownum, rank ValNum> as an Integer Error if Indices out of Range, or no Value defined, or not an Integer
AttributeAsInteger(AtNum: number, Rownum: number, ValNum: number): number;

// Returns Attribute Value <AtNum, Rownum, rank ValNum> as a Real Error if Indices out of Range, or no Value defined, or not a Real
AttributeAsReal(AtNum: number, Rownum: number, ValNum: number): number;

// Returns Attribute Value <AtNum, Rownum, rank ValNum> as an Integer
AttributeAsString(AtNum: number, Rownum: number, ValNum: number): TCollection_HAsciiString;

// Returns Attribute Value <AtNum, Rownum, rank ValNum> as an Entity Error if Indices out of Range, or no Value defined, or not an Entity
AttributeAsEntity(AtNum: number, Rownum: number, ValNum: number): IGESData_IGESEntity;

// Returns Attribute Value <AtNum, Rownum, rank ValNum> as a Boolean Error if Indices out of Range, or no Value defined, or not a Logical
AttributeAsLogical(AtNum: number, Rownum: number, ValNum: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESDefs`IGESDefs`} (specific part) This Services comprise
IGESDefs_GeneralModule: declare class IGESDefs_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity Auxiliary for all
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Generic Data, Type <406> Form <27> in package {@link IGESDefs`IGESDefs`} Used to communicate information defined by the system operator while creating the model
IGESDefs_GenericData: declare class IGESDefs_GenericData extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class GenericData
Init(nbPropVal: number, aName: TCollection_HAsciiString, allTypes: NCollection_HArray1_int, allValues: NCollection_HArray1_handle_Standard_Transient): void;

// returns the number of property values
NbPropertyValues(): number;

// returns property name
Name(): TCollection_HAsciiString;

// returns the number of TYPE/VALUE pairs
NbTypeValuePairs(): number;

// returns the Index'th property value data type raises exception if Index <= 0 or Index > `NbTypeValuePairs()`
Type(Index: number): number;

// HArray1OfInteger (length 1), HArray1OfReal (length 1) for Integer, Real, Boolean (= Integer 0/1), HAsciiString for String (the value itself), IGESEntity for Entity (the value itself)
Value(Index: number): Standard_Transient;

// Returns Attribute Value <AttrNum, rank ValueNum> as an Integer Error if Index out of Range, or not an Integer
ValueAsInteger(ValueNum: number): number;

// Returns Attribute Value <AttrNum, rank ValueNum> as a Real Error if Index out of Range, or not a Real
ValueAsReal(ValueNum: number): number;

// Returns Attribute Value <AttrNum, rank ValueNum> as an Integer
ValueAsString(ValueNum: number): TCollection_HAsciiString;

// Returns Attribute Value <AttrNum, rank ValueNum> as an Entity Error if Index out of Range, or not a Entity
ValueAsEntity(ValueNum: number): IGESData_IGESEntity;

// Returns Attribute Value <AttrNum, rank ValueNum> as a Boolean Error if Index out of Range, or not a Logical
ValueAsLogical(ValueNum: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESDefs_HArray1OfHArray1OfTextDisplayTemplate: declare class IGESDefs_HArray1OfHArray1OfTextDisplayTemplate extends Standard_Transient

constructor

Lower(): number;

Upper(): number;

Length(): number;

SetValue(num: number, val: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate): void;

Value(num: number): NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Macro Definition Entity, Type <306> Form <0> in package {@link IGESDefs`IGESDefs`} This Class specifies the action of a specific MACRO
IGESDefs_MacroDef: declare class IGESDefs_MacroDef extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class MacroDef
Init(macro: TCollection_HAsciiString, entityTypeID: number, langStatements: NCollection_HArray1_handle_TCollection_HAsciiString, endMacro: TCollection_HAsciiString): void;

// returns the number of language statements
NbStatements(): number;

// returns the MACRO(Literal)
MACRO(): TCollection_HAsciiString;

// returns the Entity Type ID
EntityTypeID(): number;

LanguageStatement(StatNum: number): TCollection_HAsciiString;

// returns the ENDM(Literal)
ENDMACRO(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESDefs`IGESDefs`}
IGESDefs_Protocol: declare class IGESDefs_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Defs File Access Module for {@link IGESDefs`IGESDefs`} (specific parts) Specific actions concern
IGESDefs_ReadWriteModule: declare class IGESDefs_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESDefs`IGESDefs`}
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESDefs_SpecificModule: declare class IGESDefs_SpecificModule extends IGESData_SpecificModule

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Tabular Data, Type <406> Form <11>, in package {@link IGESDefs`IGESDefs`} This Class is used to provide a Structure to accommodate point form data
IGESDefs_TabularData: declare class IGESDefs_TabularData extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class TabularData
Init(nbProps: number, propType: number, typesInd: NCollection_HArray1_int, nbValuesInd: NCollection_HArray1_int, valuesInd: IGESBasic_HArray1OfHArray1OfReal, valuesDep: IGESBasic_HArray1OfHArray1OfReal): void;

// returns the number of property values (recorded)
NbPropertyValues(): number;

// determines the number of property values required
ComputedNbPropertyValues(): number;

// checks, and correct as necessary, the number of property values
OwnCorrect(): boolean;

// returns the property type
PropertyType(): number;

// returns the number of dependent variables
NbDependents(): number;

// returns the number of independent variables
NbIndependents(): number;

// returns the type of the num'th independent variable raises exception if num <= 0 or num > `NbIndependents()`
TypeOfIndependents(num: number): number;

// returns the number of different values of the num'th indep
NbValues(num: number): number;

IndependentValue(variablenum: number, valuenum: number): number;

DependentValues(num: number): NCollection_HArray1_double;

DependentValue(variablenum: number, valuenum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a AssociativityDef
IGESDefs_ToolAssociativityDef: declare class IGESDefs_ToolAssociativityDef

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_AssociativityDef, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_AssociativityDef): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_AssociativityDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_AssociativityDef, entto: IGESDefs_AssociativityDef, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a AttributeDef
IGESDefs_ToolAttributeDef: declare class IGESDefs_ToolAttributeDef

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_AttributeDef, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_AttributeDef): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_AttributeDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_AttributeDef, entto: IGESDefs_AttributeDef, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a AttributeTable
IGESDefs_ToolAttributeTable: declare class IGESDefs_ToolAttributeTable

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_AttributeTable, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_AttributeTable): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_AttributeTable, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_AttributeTable, entto: IGESDefs_AttributeTable, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a GenericData
IGESDefs_ToolGenericData: declare class IGESDefs_ToolGenericData

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_GenericData, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_GenericData): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_GenericData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_GenericData, entto: IGESDefs_GenericData, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a MacroDef
IGESDefs_ToolMacroDef: declare class IGESDefs_ToolMacroDef

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_MacroDef, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_MacroDef): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_MacroDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_MacroDef, entto: IGESDefs_MacroDef, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a TabularData
IGESDefs_ToolTabularData: declare class IGESDefs_ToolTabularData

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_TabularData, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_TabularData): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_TabularData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_TabularData, entto: IGESDefs_TabularData, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a UnitsData
IGESDefs_ToolUnitsData: declare class IGESDefs_ToolUnitsData

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDefs_UnitsData, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDefs_UnitsData): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDefs_UnitsData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDefs_UnitsData, entto: IGESDefs_UnitsData, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES UnitsData Entity, Type <316> Form <0> in package {@link IGESDefs`IGESDefs`} This class stores data about a model's fundamental units
IGESDefs_UnitsData: declare class IGESDefs_UnitsData extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class UnitsData
Init(unitTypes: NCollection_HArray1_handle_TCollection_HAsciiString, unitValues: NCollection_HArray1_handle_TCollection_HAsciiString, unitScales: NCollection_HArray1_double): void;

// returns the Number of units defined by this entity
NbUnits(): number;

// returns the Type of the UnitNum'th unit being defined raises exception if UnitNum <= 0 or UnitNum > `NbUnits()`
UnitType(UnitNum: number): TCollection_HAsciiString;

// returns the {@link Units `Units`} of the UnitNum'th unit being defined raises exception if UnitNum <= 0 or UnitNum > `NbUnits()`
UnitValue(UnitNum: number): TCollection_HAsciiString;

// returns the multiplicative scale factor to be applied to the UnitNum'th unit being defined raises exception if UnitNum <= 0 or UnitNum > `NbUnits()`
ScaleFactor(UnitNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESDefs_Array1OfTabularData: NCollection_Array1_handle_IGESDefs_TabularData

IGESDefs_HArray1OfTabularData: NCollection_HArray1_handle_IGESDefs_TabularData
