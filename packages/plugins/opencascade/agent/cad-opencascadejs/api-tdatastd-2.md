# libcascade — TDataStd (2)

19 top-level symbols. Signatures are verbatim typescript.

TDataStd_IntegerList: declare class TDataStd_IntegerList extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_IntegerList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_IntegerList;
  static Set(label: TDF_Label): TDataStd_IntegerList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_IntegerList;

  IsEmpty(): boolean;

  Extent(): number;

  Prepend(value: number): void;

  Append(value: number): void;

  SetID(argNo0: Standard_GUID): void;
  SetID(): void;
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  InsertBefore(value: number, before_value: number): boolean;

  InsertBeforeByIndex(index: number, before_value: number): boolean;

  InsertAfter(value: number, after_value: number): boolean;

  InsertAfterByIndex(index: number, after_value: number): boolean;

  Remove(value: number): boolean;

  RemoveByIndex(index: number): boolean;

  Clear(): void;

  First(): number;

  Last(): number;

  List(): NCollection_List_int;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_Name: declare class TDataStd_Name extends TDataStd_GenericExtString

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, string_: TCollection_ExtendedString): TDataStd_Name;
  static Set(label: TDF_Label, guid: Standard_GUID, string_: TCollection_ExtendedString): TDataStd_Name;
  static Set(label: TDF_Label, string_: TCollection_ExtendedString): TDataStd_Name;
  static Set(label: TDF_Label, guid: Standard_GUID, string_: TCollection_ExtendedString): TDataStd_Name;
  Set(S: TCollection_ExtendedString): void;

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

TDataStd_NamedData: declare class TDataStd_NamedData extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_NamedData;

  HasIntegers(): boolean;

  HasInteger(theName: TCollection_ExtendedString): boolean;

  GetInteger(theName: TCollection_ExtendedString): number;

  SetInteger(theName: TCollection_ExtendedString, theInteger: number): void;

  GetIntegersContainer(): NCollection_DataMap_TCollection_ExtendedString_int;

  ChangeIntegers(theIntegers: NCollection_DataMap_TCollection_ExtendedString_int): void;

  HasReals(): boolean;

  HasReal(theName: TCollection_ExtendedString): boolean;

  GetReal(theName: TCollection_ExtendedString): number;

  SetReal(theName: TCollection_ExtendedString, theReal: number): void;

  GetRealsContainer(): NCollection_DataMap_TCollection_ExtendedString_double;

  ChangeReals(theReals: NCollection_DataMap_TCollection_ExtendedString_double): void;

  HasStrings(): boolean;

  HasString(theName: TCollection_ExtendedString): boolean;

  GetString(theName: TCollection_ExtendedString): TCollection_ExtendedString;

  SetString(theName: TCollection_ExtendedString, theString: TCollection_ExtendedString): void;

  GetStringsContainer(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

  ChangeStrings(theStrings: NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString): void;

  HasBytes(): boolean;

  HasByte(theName: TCollection_ExtendedString): boolean;

  GetByte(theName: TCollection_ExtendedString): number;

  SetByte(theName: TCollection_ExtendedString, theByte: number): void;

  GetBytesContainer(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

  ChangeBytes(theBytes: NCollection_DataMap_TCollection_ExtendedString_uint8_t): void;

  HasArraysOfIntegers(): boolean;

  HasArrayOfIntegers(theName: TCollection_ExtendedString): boolean;

  GetArrayOfIntegers(theName: TCollection_ExtendedString): NCollection_HArray1_int;

  SetArrayOfIntegers(theName: TCollection_ExtendedString, theArrayOfIntegers: NCollection_HArray1_int): void;

  GetArraysOfIntegersContainer(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

  ChangeArraysOfIntegers(theArraysOfIntegers: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int): void;

  HasArraysOfReals(): boolean;

  HasArrayOfReals(theName: TCollection_ExtendedString): boolean;

  GetArrayOfReals(theName: TCollection_ExtendedString): NCollection_HArray1_double;

  SetArrayOfReals(theName: TCollection_ExtendedString, theArrayOfReals: NCollection_HArray1_double): void;

  GetArraysOfRealsContainer(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

  ChangeArraysOfReals(theArraysOfReals: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double): void;

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

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_NoteBook: declare class TDataStd_NoteBook extends TDataStd_GenericEmpty

  constructor

  static Find(current: TDF_Label): { returnValue: boolean; N: TDataStd_NoteBook; [Symbol.dispose](): void };

  static New(label: TDF_Label): TDataStd_NoteBook;

  static GetID(): Standard_GUID;

  Append(value: number, isExported: boolean): TDataStd_Real;
  Append(value: number, isExported: boolean): TDataStd_Integer;
  Append(value: number, isExported: boolean): TDataStd_Real;
  Append(value: number, isExported: boolean): TDataStd_Integer;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_Real: declare class TDataStd_Real extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, value: number): TDataStd_Real;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
  static Set(label: TDF_Label, value: number): TDataStd_Real;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
  Set(V: number): void;

  // DEPRECATED
  SetDimension(DIM: TDataStd_RealEnum): void;

  // DEPRECATED
  GetDimension(): TDataStd_RealEnum;

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

TDataStd_RealArray: declare class TDataStd_RealArray extends TDF_Attribute

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
  static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;

  Init(lower: number, upper: number): void;

  SetID(argNo0: Standard_GUID): void;
  SetID(): void;
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  SetValue(Index: number, Value: number): void;

  Value(Index: number): number;

  Lower(): number;

  Upper(): number;

  Length(): number;

  ChangeArray(newArray: NCollection_HArray1_double, isCheckItems?: boolean): void;

  Array(): NCollection_HArray1_double;

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

TDataStd_RealEnum: typeof TDataStd_RealEnum[keyof typeof TDataStd_RealEnum]

TDataStd_RealList: declare class TDataStd_RealList extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_RealList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_RealList;
  static Set(label: TDF_Label): TDataStd_RealList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_RealList;

  IsEmpty(): boolean;

  Extent(): number;

  Prepend(value: number): void;

  Append(value: number): void;

  SetID(argNo0: Standard_GUID): void;
  SetID(): void;
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  InsertBefore(value: number, before_value: number): boolean;

  InsertBeforeByIndex(index: number, before_value: number): boolean;

  InsertAfter(value: number, after_value: number): boolean;

  InsertAfterByIndex(index: number, after_value: number): boolean;

  Remove(value: number): boolean;

  RemoveByIndex(index: number): boolean;

  Clear(): void;

  First(): number;

  Last(): number;

  List(): NCollection_List_double;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_ReferenceArray: declare class TDataStd_ReferenceArray extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label, lower: number, upper: number): TDataStd_ReferenceArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_ReferenceArray;
  static Set(label: TDF_Label, lower: number, upper: number): TDataStd_ReferenceArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_ReferenceArray;

  Init(lower: number, upper: number): void;

  SetValue(index: number, value: TDF_Label): void;

  SetID(argNo0: Standard_GUID): void;
  SetID(): void;
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  Value(Index: number): TDF_Label;

  Lower(): number;

  Upper(): number;

  Length(): number;

  InternalArray(): NCollection_HArray1_TDF_Label;

  SetInternalArray(values: NCollection_HArray1_TDF_Label, isCheckItems?: boolean): void;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_ReferenceList: declare class TDataStd_ReferenceList extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_ReferenceList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ReferenceList;
  static Set(label: TDF_Label): TDataStd_ReferenceList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ReferenceList;

  IsEmpty(): boolean;

  Extent(): number;

  Prepend(value: TDF_Label): void;

  Append(value: TDF_Label): void;

  SetID(argNo0: Standard_GUID): void;
  SetID(): void;
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  InsertBefore(value: TDF_Label, before_value: TDF_Label): boolean;
  InsertBefore(index: number, before_value: TDF_Label): boolean;
  InsertBefore(value: TDF_Label, before_value: TDF_Label): boolean;
  InsertBefore(index: number, before_value: TDF_Label): boolean;

  InsertAfter(value: TDF_Label, after_value: TDF_Label): boolean;
  InsertAfter(index: number, after_value: TDF_Label): boolean;
  InsertAfter(value: TDF_Label, after_value: TDF_Label): boolean;
  InsertAfter(index: number, after_value: TDF_Label): boolean;

  Remove(value: TDF_Label): boolean;
  Remove(index: number): boolean;
  Remove(value: TDF_Label): boolean;
  Remove(index: number): boolean;

  Clear(): void;

  First(): TDF_Label;

  Last(): TDF_Label;

  List(): NCollection_List_TDF_Label;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_Relation: declare class TDataStd_Relation extends TDataStd_Expression

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_Relation;

  SetRelation(E: TCollection_ExtendedString): void;

  GetRelation(): TCollection_ExtendedString;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_Tick: declare class TDataStd_Tick extends TDataStd_GenericEmpty

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_Tick;

  ID(): Standard_GUID;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_TreeNode: declare class TDataStd_TreeNode extends TDF_Attribute

  constructor

  static Find(L: TDF_Label): { returnValue: boolean; T: TDataStd_TreeNode; [Symbol.dispose](): void };

  static Set(L: TDF_Label): TDataStd_TreeNode;
  static Set(L: TDF_Label, ExplicitTreeID: Standard_GUID): TDataStd_TreeNode;
  static Set(L: TDF_Label): TDataStd_TreeNode;
  static Set(L: TDF_Label, ExplicitTreeID: Standard_GUID): TDataStd_TreeNode;

  static GetDefaultTreeID(): Standard_GUID;

  Append(Child: TDataStd_TreeNode): boolean;

  Prepend(Child: TDataStd_TreeNode): boolean;

  InsertBefore(Node: TDataStd_TreeNode): boolean;

  InsertAfter(Node: TDataStd_TreeNode): boolean;

  Remove(): boolean;

  Depth(): number;

  NbChildren(allLevels?: boolean): number;

  IsAscendant(of_: TDataStd_TreeNode): boolean;

  IsDescendant(of_: TDataStd_TreeNode): boolean;

  IsRoot(): boolean;

  Root(): TDataStd_TreeNode;

  IsFather(of_: TDataStd_TreeNode): boolean;

  IsChild(of_: TDataStd_TreeNode): boolean;

  HasFather(): boolean;

  Father(): TDataStd_TreeNode;

  HasNext(): boolean;

  Next(): TDataStd_TreeNode;

  HasPrevious(): boolean;

  Previous(): TDataStd_TreeNode;

  HasFirst(): boolean;

  First(): TDataStd_TreeNode;

  HasLast(): boolean;

  Last(): TDataStd_TreeNode;

  FindLast(): TDataStd_TreeNode;

  SetTreeID(explicitID: Standard_GUID): void;

  SetFather(F: TDataStd_TreeNode): void;

  SetNext(F: TDataStd_TreeNode): void;

  SetPrevious(F: TDataStd_TreeNode): void;

  SetFirst(F: TDataStd_TreeNode): void;

  SetLast(F: TDataStd_TreeNode): void;

  AfterAddition(): void;

  BeforeForget(): void;

  AfterResume(): void;

  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  NewEmpty(): TDF_Attribute;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_UAttribute: declare class TDataStd_UAttribute extends TDF_Attribute

  constructor

  static Set(label: TDF_Label, LocalID: Standard_GUID): TDataStd_UAttribute;

  SetID(argNo0: Standard_GUID): void;
  SetID(): void;
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_Variable: declare class TDataStd_Variable extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static Set(label: TDF_Label): TDataStd_Variable;
  Set(value: number): void;
  Set(value: number, dimension: TDataStd_RealEnum): void;
  Set(value: number): void;
  Set(value: number, dimension: TDataStd_RealEnum): void;

  Name(string_: TCollection_ExtendedString): void;
  Name(): TCollection_ExtendedString;
  Name(string_: TCollection_ExtendedString): void;
  Name(): TCollection_ExtendedString;

  IsValued(): boolean;

  Get(): number;

  Real(): TDataStd_Real;

  IsAssigned(): boolean;

  Assign(): TDataStd_Expression;

  Desassign(): void;

  Expression(): TDataStd_Expression;

  IsCaptured(): boolean;

  IsConstant(): boolean;

  Unit(unit: TCollection_AsciiString): void;
  Unit(): TCollection_AsciiString;
  Unit(unit: TCollection_AsciiString): void;
  Unit(): TCollection_AsciiString;

  Constant(status: boolean): void;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  References(aDataSet: TDF_DataSet): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDataStd_HLabelArray1: NCollection_HArray1_TDF_Label

TDataStd_LabelArray1: NCollection_Array1_TDF_Label

TDataStd_ListOfByte: NCollection_List_uint8_t

TDataStd_ListOfExtendedString: NCollection_List_TCollection_ExtendedString
