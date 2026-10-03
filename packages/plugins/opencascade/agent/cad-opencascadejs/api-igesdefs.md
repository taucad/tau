# libcascade — IGESDefs

22 top-level symbols. Signatures are verbatim typescript.

IGESDefs: declare class IGESDefs

  // IGESDefs.constructor (constructor)
  constructor();

  // IGESDefs.Init (method)
  static Init(): void;

  // IGESDefs.Protocol (method)
  static Protocol(): IGESDefs_Protocol;

  // IGESDefs.delete (method)
  delete(): void;

  // IGESDefs.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_AssociativityDef: declare class IGESDefs_AssociativityDef extends IGESData_IGESEntity

  // IGESDefs_AssociativityDef.constructor (constructor)
  constructor();

  // IGESDefs_AssociativityDef.Init (method)
  Init(requirements: NCollection_HArray1_int, orders: NCollection_HArray1_int, numItems: NCollection_HArray1_int, items: IGESBasic_HArray1OfHArray1OfInteger): void;

  // IGESDefs_AssociativityDef.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESDefs_AssociativityDef.NbClassDefs (method)
  NbClassDefs(): number;

  // IGESDefs_AssociativityDef.IsBackPointerReq (method)
  IsBackPointerReq(ClassNum: number): boolean;

  // IGESDefs_AssociativityDef.BackPointerReq (method)
  BackPointerReq(ClassNum: number): number;

  // IGESDefs_AssociativityDef.IsOrdered (method)
  IsOrdered(ClassNum: number): boolean;

  // IGESDefs_AssociativityDef.ClassOrder (method)
  ClassOrder(ClassNum: number): number;

  // IGESDefs_AssociativityDef.NbItemsPerClass (method)
  NbItemsPerClass(ClassNum: number): number;

  // IGESDefs_AssociativityDef.Item (method)
  Item(ClassNum: number, ItemNum: number): number;

  // IGESDefs_AssociativityDef.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_AssociativityDef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_AssociativityDef.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_AssociativityDef.delete (method)
  delete(): void;

  // IGESDefs_AssociativityDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_AttributeDef: declare class IGESDefs_AttributeDef extends IGESData_IGESEntity

  // IGESDefs_AttributeDef.constructor (constructor)
  constructor();

  // IGESDefs_AttributeDef.Init (method)
  Init(aName: TCollection_HAsciiString, aListType: number, attrTypes: NCollection_HArray1_int, attrValueDataTypes: NCollection_HArray1_int, attrValueCounts: NCollection_HArray1_int, attrValues: NCollection_HArray1_handle_Standard_Transient, attrValuePointers: IGESDefs_HArray1OfHArray1OfTextDisplayTemplate): void;

  // IGESDefs_AttributeDef.HasTableName (method)
  HasTableName(): boolean;

  // IGESDefs_AttributeDef.TableName (method)
  TableName(): TCollection_HAsciiString;

  // IGESDefs_AttributeDef.ListType (method)
  ListType(): number;

  // IGESDefs_AttributeDef.NbAttributes (method)
  NbAttributes(): number;

  // IGESDefs_AttributeDef.AttributeType (method)
  AttributeType(num: number): number;

  // IGESDefs_AttributeDef.AttributeValueDataType (method)
  AttributeValueDataType(num: number): number;

  // IGESDefs_AttributeDef.AttributeValueCount (method)
  AttributeValueCount(num: number): number;

  // IGESDefs_AttributeDef.HasValues (method)
  HasValues(): boolean;

  // IGESDefs_AttributeDef.HasTextDisplay (method)
  HasTextDisplay(): boolean;

  // IGESDefs_AttributeDef.AttributeTextDisplay (method)
  AttributeTextDisplay(AttrNum: number, PointerNum: number): IGESGraph_TextDisplayTemplate;

  // IGESDefs_AttributeDef.AttributeList (method)
  AttributeList(AttrNum: number): Standard_Transient;

  // IGESDefs_AttributeDef.AttributeAsInteger (method)
  AttributeAsInteger(AttrNum: number, ValueNum: number): number;

  // IGESDefs_AttributeDef.AttributeAsReal (method)
  AttributeAsReal(AttrNum: number, ValueNum: number): number;

  // IGESDefs_AttributeDef.AttributeAsString (method)
  AttributeAsString(AttrNum: number, ValueNum: number): TCollection_HAsciiString;

  // IGESDefs_AttributeDef.AttributeAsEntity (method)
  AttributeAsEntity(AttrNum: number, ValueNum: number): IGESData_IGESEntity;

  // IGESDefs_AttributeDef.AttributeAsLogical (method)
  AttributeAsLogical(AttrNum: number, ValueNum: number): boolean;

  // IGESDefs_AttributeDef.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_AttributeDef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_AttributeDef.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_AttributeDef.delete (method)
  delete(): void;

  // IGESDefs_AttributeDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_AttributeTable: declare class IGESDefs_AttributeTable extends IGESData_IGESEntity

  // IGESDefs_AttributeTable.constructor (constructor)
  constructor();

  // IGESDefs_AttributeTable.Init (method)
  Init(attributes: NCollection_HArray2_handle_Standard_Transient): void;

  // IGESDefs_AttributeTable.SetDefinition (method)
  SetDefinition(def: IGESDefs_AttributeDef): void;

  // IGESDefs_AttributeTable.Definition (method)
  Definition(): IGESDefs_AttributeDef;

  // IGESDefs_AttributeTable.NbRows (method)
  NbRows(): number;

  // IGESDefs_AttributeTable.NbAttributes (method)
  NbAttributes(): number;

  // IGESDefs_AttributeTable.DataType (method)
  DataType(Atnum: number): number;

  // IGESDefs_AttributeTable.ValueCount (method)
  ValueCount(Atnum: number): number;

  // IGESDefs_AttributeTable.AttributeList (method)
  AttributeList(Attribnum: number, Rownum: number): Standard_Transient;

  // IGESDefs_AttributeTable.AttributeAsInteger (method)
  AttributeAsInteger(AtNum: number, Rownum: number, ValNum: number): number;

  // IGESDefs_AttributeTable.AttributeAsReal (method)
  AttributeAsReal(AtNum: number, Rownum: number, ValNum: number): number;

  // IGESDefs_AttributeTable.AttributeAsString (method)
  AttributeAsString(AtNum: number, Rownum: number, ValNum: number): TCollection_HAsciiString;

  // IGESDefs_AttributeTable.AttributeAsEntity (method)
  AttributeAsEntity(AtNum: number, Rownum: number, ValNum: number): IGESData_IGESEntity;

  // IGESDefs_AttributeTable.AttributeAsLogical (method)
  AttributeAsLogical(AtNum: number, Rownum: number, ValNum: number): boolean;

  // IGESDefs_AttributeTable.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_AttributeTable.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_AttributeTable.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_AttributeTable.delete (method)
  delete(): void;

  // IGESDefs_AttributeTable.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_GeneralModule: declare class IGESDefs_GeneralModule extends IGESData_GeneralModule

  // IGESDefs_GeneralModule.constructor (constructor)
  constructor();

  // IGESDefs_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESDefs_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESDefs_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESDefs_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESDefs_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_GeneralModule.delete (method)
  delete(): void;

  // IGESDefs_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_GenericData: declare class IGESDefs_GenericData extends IGESData_IGESEntity

  // IGESDefs_GenericData.constructor (constructor)
  constructor();

  // IGESDefs_GenericData.Init (method)
  Init(nbPropVal: number, aName: TCollection_HAsciiString, allTypes: NCollection_HArray1_int, allValues: NCollection_HArray1_handle_Standard_Transient): void;

  // IGESDefs_GenericData.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESDefs_GenericData.Name (method)
  Name(): TCollection_HAsciiString;

  // IGESDefs_GenericData.NbTypeValuePairs (method)
  NbTypeValuePairs(): number;

  // IGESDefs_GenericData.Type (method)
  Type(Index: number): number;

  // IGESDefs_GenericData.Value (method)
  Value(Index: number): Standard_Transient;

  // IGESDefs_GenericData.ValueAsInteger (method)
  ValueAsInteger(ValueNum: number): number;

  // IGESDefs_GenericData.ValueAsReal (method)
  ValueAsReal(ValueNum: number): number;

  // IGESDefs_GenericData.ValueAsString (method)
  ValueAsString(ValueNum: number): TCollection_HAsciiString;

  // IGESDefs_GenericData.ValueAsEntity (method)
  ValueAsEntity(ValueNum: number): IGESData_IGESEntity;

  // IGESDefs_GenericData.ValueAsLogical (method)
  ValueAsLogical(ValueNum: number): boolean;

  // IGESDefs_GenericData.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_GenericData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_GenericData.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_GenericData.delete (method)
  delete(): void;

  // IGESDefs_GenericData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_HArray1OfHArray1OfTextDisplayTemplate: declare class IGESDefs_HArray1OfHArray1OfTextDisplayTemplate extends Standard_Transient

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.constructor (constructor)
  constructor(low: number, up: number);

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.Lower (method)
  Lower(): number;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.Upper (method)
  Upper(): number;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.Length (method)
  Length(): number;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.SetValue (method)
  SetValue(num: number, val: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate): void;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.Value (method)
  Value(num: number): NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.delete (method)
  delete(): void;

  // IGESDefs_HArray1OfHArray1OfTextDisplayTemplate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_MacroDef: declare class IGESDefs_MacroDef extends IGESData_IGESEntity

  // IGESDefs_MacroDef.constructor (constructor)
  constructor();

  // IGESDefs_MacroDef.Init (method)
  Init(macro: TCollection_HAsciiString, entityTypeID: number, langStatements: NCollection_HArray1_handle_TCollection_HAsciiString, endMacro: TCollection_HAsciiString): void;

  // IGESDefs_MacroDef.NbStatements (method)
  NbStatements(): number;

  // IGESDefs_MacroDef.MACRO (method)
  MACRO(): TCollection_HAsciiString;

  // IGESDefs_MacroDef.EntityTypeID (method)
  EntityTypeID(): number;

  // IGESDefs_MacroDef.LanguageStatement (method)
  LanguageStatement(StatNum: number): TCollection_HAsciiString;

  // IGESDefs_MacroDef.ENDMACRO (method)
  ENDMACRO(): TCollection_HAsciiString;

  // IGESDefs_MacroDef.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_MacroDef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_MacroDef.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_MacroDef.delete (method)
  delete(): void;

  // IGESDefs_MacroDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_Protocol: declare class IGESDefs_Protocol extends IGESData_Protocol

  // IGESDefs_Protocol.constructor (constructor)
  constructor();

  // IGESDefs_Protocol.NbResources (method)
  NbResources(): number;

  // IGESDefs_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESDefs_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESDefs_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_Protocol.delete (method)
  delete(): void;

  // IGESDefs_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ReadWriteModule: declare class IGESDefs_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESDefs_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESDefs_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESDefs_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESDefs_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_ReadWriteModule.delete (method)
  delete(): void;

  // IGESDefs_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_SpecificModule: declare class IGESDefs_SpecificModule extends IGESData_SpecificModule

  // IGESDefs_SpecificModule.constructor (constructor)
  constructor();

  // IGESDefs_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_SpecificModule.delete (method)
  delete(): void;

  // IGESDefs_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_TabularData: declare class IGESDefs_TabularData extends IGESData_IGESEntity

  // IGESDefs_TabularData.constructor (constructor)
  constructor();

  // IGESDefs_TabularData.Init (method)
  Init(nbProps: number, propType: number, typesInd: NCollection_HArray1_int, nbValuesInd: NCollection_HArray1_int, valuesInd: IGESBasic_HArray1OfHArray1OfReal, valuesDep: IGESBasic_HArray1OfHArray1OfReal): void;

  // IGESDefs_TabularData.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESDefs_TabularData.ComputedNbPropertyValues (method)
  ComputedNbPropertyValues(): number;

  // IGESDefs_TabularData.OwnCorrect (method)
  OwnCorrect(): boolean;

  // IGESDefs_TabularData.PropertyType (method)
  PropertyType(): number;

  // IGESDefs_TabularData.NbDependents (method)
  NbDependents(): number;

  // IGESDefs_TabularData.NbIndependents (method)
  NbIndependents(): number;

  // IGESDefs_TabularData.TypeOfIndependents (method)
  TypeOfIndependents(num: number): number;

  // IGESDefs_TabularData.NbValues (method)
  NbValues(num: number): number;

  // IGESDefs_TabularData.IndependentValue (method)
  IndependentValue(variablenum: number, valuenum: number): number;

  // IGESDefs_TabularData.DependentValues (method)
  DependentValues(num: number): NCollection_HArray1_double;

  // IGESDefs_TabularData.DependentValue (method)
  DependentValue(variablenum: number, valuenum: number): number;

  // IGESDefs_TabularData.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_TabularData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_TabularData.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_TabularData.delete (method)
  delete(): void;

  // IGESDefs_TabularData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolAssociativityDef: declare class IGESDefs_ToolAssociativityDef

  // IGESDefs_ToolAssociativityDef.constructor (constructor)
  constructor();

  // IGESDefs_ToolAssociativityDef.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_AssociativityDef, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolAssociativityDef.DirChecker (method)
  DirChecker(ent: IGESDefs_AssociativityDef): IGESData_DirChecker;

  // IGESDefs_ToolAssociativityDef.OwnCheck (method)
  OwnCheck(ent: IGESDefs_AssociativityDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolAssociativityDef.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_AssociativityDef, entto: IGESDefs_AssociativityDef, TC: Interface_CopyTool): void;

  // IGESDefs_ToolAssociativityDef.delete (method)
  delete(): void;

  // IGESDefs_ToolAssociativityDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolAttributeDef: declare class IGESDefs_ToolAttributeDef

  // IGESDefs_ToolAttributeDef.constructor (constructor)
  constructor();

  // IGESDefs_ToolAttributeDef.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_AttributeDef, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolAttributeDef.DirChecker (method)
  DirChecker(ent: IGESDefs_AttributeDef): IGESData_DirChecker;

  // IGESDefs_ToolAttributeDef.OwnCheck (method)
  OwnCheck(ent: IGESDefs_AttributeDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolAttributeDef.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_AttributeDef, entto: IGESDefs_AttributeDef, TC: Interface_CopyTool): void;

  // IGESDefs_ToolAttributeDef.delete (method)
  delete(): void;

  // IGESDefs_ToolAttributeDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolAttributeTable: declare class IGESDefs_ToolAttributeTable

  // IGESDefs_ToolAttributeTable.constructor (constructor)
  constructor();

  // IGESDefs_ToolAttributeTable.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_AttributeTable, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolAttributeTable.DirChecker (method)
  DirChecker(ent: IGESDefs_AttributeTable): IGESData_DirChecker;

  // IGESDefs_ToolAttributeTable.OwnCheck (method)
  OwnCheck(ent: IGESDefs_AttributeTable, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolAttributeTable.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_AttributeTable, entto: IGESDefs_AttributeTable, TC: Interface_CopyTool): void;

  // IGESDefs_ToolAttributeTable.delete (method)
  delete(): void;

  // IGESDefs_ToolAttributeTable.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolGenericData: declare class IGESDefs_ToolGenericData

  // IGESDefs_ToolGenericData.constructor (constructor)
  constructor();

  // IGESDefs_ToolGenericData.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_GenericData, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolGenericData.DirChecker (method)
  DirChecker(ent: IGESDefs_GenericData): IGESData_DirChecker;

  // IGESDefs_ToolGenericData.OwnCheck (method)
  OwnCheck(ent: IGESDefs_GenericData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolGenericData.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_GenericData, entto: IGESDefs_GenericData, TC: Interface_CopyTool): void;

  // IGESDefs_ToolGenericData.delete (method)
  delete(): void;

  // IGESDefs_ToolGenericData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolMacroDef: declare class IGESDefs_ToolMacroDef

  // IGESDefs_ToolMacroDef.constructor (constructor)
  constructor();

  // IGESDefs_ToolMacroDef.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_MacroDef, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolMacroDef.DirChecker (method)
  DirChecker(ent: IGESDefs_MacroDef): IGESData_DirChecker;

  // IGESDefs_ToolMacroDef.OwnCheck (method)
  OwnCheck(ent: IGESDefs_MacroDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolMacroDef.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_MacroDef, entto: IGESDefs_MacroDef, TC: Interface_CopyTool): void;

  // IGESDefs_ToolMacroDef.delete (method)
  delete(): void;

  // IGESDefs_ToolMacroDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolTabularData: declare class IGESDefs_ToolTabularData

  // IGESDefs_ToolTabularData.constructor (constructor)
  constructor();

  // IGESDefs_ToolTabularData.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_TabularData, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolTabularData.DirChecker (method)
  DirChecker(ent: IGESDefs_TabularData): IGESData_DirChecker;

  // IGESDefs_ToolTabularData.OwnCheck (method)
  OwnCheck(ent: IGESDefs_TabularData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolTabularData.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_TabularData, entto: IGESDefs_TabularData, TC: Interface_CopyTool): void;

  // IGESDefs_ToolTabularData.delete (method)
  delete(): void;

  // IGESDefs_ToolTabularData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_ToolUnitsData: declare class IGESDefs_ToolUnitsData

  // IGESDefs_ToolUnitsData.constructor (constructor)
  constructor();

  // IGESDefs_ToolUnitsData.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDefs_UnitsData, IW: IGESData_IGESWriter): void;

  // IGESDefs_ToolUnitsData.DirChecker (method)
  DirChecker(ent: IGESDefs_UnitsData): IGESData_DirChecker;

  // IGESDefs_ToolUnitsData.OwnCheck (method)
  OwnCheck(ent: IGESDefs_UnitsData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDefs_ToolUnitsData.OwnCopy (method)
  OwnCopy(entfrom: IGESDefs_UnitsData, entto: IGESDefs_UnitsData, TC: Interface_CopyTool): void;

  // IGESDefs_ToolUnitsData.delete (method)
  delete(): void;

  // IGESDefs_ToolUnitsData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_UnitsData: declare class IGESDefs_UnitsData extends IGESData_IGESEntity

  // IGESDefs_UnitsData.constructor (constructor)
  constructor();

  // IGESDefs_UnitsData.Init (method)
  Init(unitTypes: NCollection_HArray1_handle_TCollection_HAsciiString, unitValues: NCollection_HArray1_handle_TCollection_HAsciiString, unitScales: NCollection_HArray1_double): void;

  // IGESDefs_UnitsData.NbUnits (method)
  NbUnits(): number;

  // IGESDefs_UnitsData.UnitType (method)
  UnitType(UnitNum: number): TCollection_HAsciiString;

  // IGESDefs_UnitsData.UnitValue (method)
  UnitValue(UnitNum: number): TCollection_HAsciiString;

  // IGESDefs_UnitsData.ScaleFactor (method)
  ScaleFactor(UnitNum: number): number;

  // IGESDefs_UnitsData.get_type_name (method)
  static get_type_name(): string;

  // IGESDefs_UnitsData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDefs_UnitsData.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDefs_UnitsData.delete (method)
  delete(): void;

  // IGESDefs_UnitsData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDefs_Array1OfTabularData: NCollection_Array1_handle_IGESDefs_TabularData

IGESDefs_HArray1OfTabularData: NCollection_HArray1_handle_IGESDefs_TabularData
