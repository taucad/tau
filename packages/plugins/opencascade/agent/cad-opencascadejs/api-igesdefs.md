# libcascade — IGESDefs

22 top-level symbols. Signatures are verbatim typescript.

IGESDefs: declare class IGESDefs

constructor

static Init(): void;

static Protocol(): IGESDefs_Protocol;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_AssociativityDef: declare class IGESDefs_AssociativityDef extends IGESData_IGESEntity

constructor

Init(requirements: NCollection_HArray1_int, orders: NCollection_HArray1_int, numItems: NCollection_HArray1_int, items: IGESBasic_HArray1OfHArray1OfInteger): void;

SetFormNumber(form: number): void;

NbClassDefs(): number;

IsBackPointerReq(ClassNum: number): boolean;

BackPointerReq(ClassNum: number): number;

IsOrdered(ClassNum: number): boolean;

ClassOrder(ClassNum: number): number;

NbItemsPerClass(ClassNum: number): number;

Item(ClassNum: number, ItemNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_AttributeDef: declare class IGESDefs_AttributeDef extends IGESData_IGESEntity

constructor

Init(aName: TCollection_HAsciiString, aListType: number, attrTypes: NCollection_HArray1_int, attrValueDataTypes: NCollection_HArray1_int, attrValueCounts: NCollection_HArray1_int, attrValues: NCollection_HArray1_handle_Standard_Transient, attrValuePointers: IGESDefs_HArray1OfHArray1OfTextDisplayTemplate): void;

HasTableName(): boolean;

TableName(): TCollection_HAsciiString;

ListType(): number;

NbAttributes(): number;

AttributeType(num: number): number;

AttributeValueDataType(num: number): number;

AttributeValueCount(num: number): number;

HasValues(): boolean;

HasTextDisplay(): boolean;

AttributeTextDisplay(AttrNum: number, PointerNum: number): IGESGraph_TextDisplayTemplate;

AttributeList(AttrNum: number): Standard_Transient;

AttributeAsInteger(AttrNum: number, ValueNum: number): number;

AttributeAsReal(AttrNum: number, ValueNum: number): number;

AttributeAsString(AttrNum: number, ValueNum: number): TCollection_HAsciiString;

AttributeAsEntity(AttrNum: number, ValueNum: number): IGESData_IGESEntity;

AttributeAsLogical(AttrNum: number, ValueNum: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_AttributeTable: declare class IGESDefs_AttributeTable extends IGESData_IGESEntity

constructor

Init(attributes: NCollection_HArray2_handle_Standard_Transient): void;

SetDefinition(def: IGESDefs_AttributeDef): void;

Definition(): IGESDefs_AttributeDef;

NbRows(): number;

NbAttributes(): number;

DataType(Atnum: number): number;

ValueCount(Atnum: number): number;

AttributeList(Attribnum: number, Rownum: number): Standard_Transient;

AttributeAsInteger(AtNum: number, Rownum: number, ValNum: number): number;

AttributeAsReal(AtNum: number, Rownum: number, ValNum: number): number;

AttributeAsString(AtNum: number, Rownum: number, ValNum: number): TCollection_HAsciiString;

AttributeAsEntity(AtNum: number, Rownum: number, ValNum: number): IGESData_IGESEntity;

AttributeAsLogical(AtNum: number, Rownum: number, ValNum: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_GeneralModule: declare class IGESDefs_GeneralModule extends IGESData_GeneralModule

constructor

DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_GenericData: declare class IGESDefs_GenericData extends IGESData_IGESEntity

constructor

Init(nbPropVal: number, aName: TCollection_HAsciiString, allTypes: NCollection_HArray1_int, allValues: NCollection_HArray1_handle_Standard_Transient): void;

NbPropertyValues(): number;

Name(): TCollection_HAsciiString;

NbTypeValuePairs(): number;

Type(Index: number): number;

Value(Index: number): Standard_Transient;

ValueAsInteger(ValueNum: number): number;

ValueAsReal(ValueNum: number): number;

ValueAsString(ValueNum: number): TCollection_HAsciiString;

ValueAsEntity(ValueNum: number): IGESData_IGESEntity;

ValueAsLogical(ValueNum: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

IGESDefs_MacroDef: declare class IGESDefs_MacroDef extends IGESData_IGESEntity

constructor

Init(macro: TCollection_HAsciiString, entityTypeID: number, langStatements: NCollection_HArray1_handle_TCollection_HAsciiString, endMacro: TCollection_HAsciiString): void;

NbStatements(): number;

MACRO(): TCollection_HAsciiString;

EntityTypeID(): number;

LanguageStatement(StatNum: number): TCollection_HAsciiString;

ENDMACRO(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_Protocol: declare class IGESDefs_Protocol extends IGESData_Protocol

constructor

NbResources(): number;

Resource(num: number): Interface_Protocol;

TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ReadWriteModule: declare class IGESDefs_ReadWriteModule extends IGESData_ReadWriteModule

constructor

CaseIGES(typenum: number, formnum: number): number;

WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_SpecificModule: declare class IGESDefs_SpecificModule extends IGESData_SpecificModule

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_TabularData: declare class IGESDefs_TabularData extends IGESData_IGESEntity

constructor

Init(nbProps: number, propType: number, typesInd: NCollection_HArray1_int, nbValuesInd: NCollection_HArray1_int, valuesInd: IGESBasic_HArray1OfHArray1OfReal, valuesDep: IGESBasic_HArray1OfHArray1OfReal): void;

NbPropertyValues(): number;

ComputedNbPropertyValues(): number;

OwnCorrect(): boolean;

PropertyType(): number;

NbDependents(): number;

NbIndependents(): number;

TypeOfIndependents(num: number): number;

NbValues(num: number): number;

IndependentValue(variablenum: number, valuenum: number): number;

DependentValues(num: number): NCollection_HArray1_double;

DependentValue(variablenum: number, valuenum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolAssociativityDef: declare class IGESDefs_ToolAssociativityDef

constructor

WriteOwnParams(ent: IGESDefs_AssociativityDef, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_AssociativityDef): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_AssociativityDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_AssociativityDef, entto: IGESDefs_AssociativityDef, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolAttributeDef: declare class IGESDefs_ToolAttributeDef

constructor

WriteOwnParams(ent: IGESDefs_AttributeDef, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_AttributeDef): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_AttributeDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_AttributeDef, entto: IGESDefs_AttributeDef, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolAttributeTable: declare class IGESDefs_ToolAttributeTable

constructor

WriteOwnParams(ent: IGESDefs_AttributeTable, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_AttributeTable): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_AttributeTable, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_AttributeTable, entto: IGESDefs_AttributeTable, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolGenericData: declare class IGESDefs_ToolGenericData

constructor

WriteOwnParams(ent: IGESDefs_GenericData, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_GenericData): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_GenericData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_GenericData, entto: IGESDefs_GenericData, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolMacroDef: declare class IGESDefs_ToolMacroDef

constructor

WriteOwnParams(ent: IGESDefs_MacroDef, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_MacroDef): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_MacroDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_MacroDef, entto: IGESDefs_MacroDef, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolTabularData: declare class IGESDefs_ToolTabularData

constructor

WriteOwnParams(ent: IGESDefs_TabularData, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_TabularData): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_TabularData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_TabularData, entto: IGESDefs_TabularData, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_ToolUnitsData: declare class IGESDefs_ToolUnitsData

constructor

WriteOwnParams(ent: IGESDefs_UnitsData, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDefs_UnitsData): IGESData_DirChecker;

OwnCheck(ent: IGESDefs_UnitsData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDefs_UnitsData, entto: IGESDefs_UnitsData, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_UnitsData: declare class IGESDefs_UnitsData extends IGESData_IGESEntity

constructor

Init(unitTypes: NCollection_HArray1_handle_TCollection_HAsciiString, unitValues: NCollection_HArray1_handle_TCollection_HAsciiString, unitScales: NCollection_HArray1_double): void;

NbUnits(): number;

UnitType(UnitNum: number): TCollection_HAsciiString;

UnitValue(UnitNum: number): TCollection_HAsciiString;

ScaleFactor(UnitNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDefs_Array1OfTabularData: NCollection_Array1_handle_IGESDefs_TabularData

IGESDefs_HArray1OfTabularData: NCollection_HArray1_handle_IGESDefs_TabularData
