# libcascade — TDataStd (2)

17 top-level symbols. Signatures are verbatim typescript.

TDataStd_NamedData: declare class TDataStd_NamedData extends TDF_Attribute

  // TDataStd_NamedData.constructor (constructor)
  constructor();

  // TDataStd_NamedData.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_NamedData.Set (method)
  static Set(label: TDF_Label): TDataStd_NamedData;

  // TDataStd_NamedData.HasIntegers (method)
  HasIntegers(): boolean;

  // TDataStd_NamedData.HasInteger (method)
  HasInteger(theName: TCollection_ExtendedString): boolean;

  // TDataStd_NamedData.GetInteger (method)
  GetInteger(theName: TCollection_ExtendedString): number;

  // TDataStd_NamedData.SetInteger (method)
  SetInteger(theName: TCollection_ExtendedString, theInteger: number): void;

  // TDataStd_NamedData.GetIntegersContainer (method)
  GetIntegersContainer(): NCollection_DataMap_TCollection_ExtendedString_int;

  // TDataStd_NamedData.ChangeIntegers (method)
  ChangeIntegers(theIntegers: NCollection_DataMap_TCollection_ExtendedString_int): void;

  // TDataStd_NamedData.HasReals (method)
  HasReals(): boolean;

  // TDataStd_NamedData.HasReal (method)
  HasReal(theName: TCollection_ExtendedString): boolean;

  // TDataStd_NamedData.GetReal (method)
  GetReal(theName: TCollection_ExtendedString): number;

  // TDataStd_NamedData.SetReal (method)
  SetReal(theName: TCollection_ExtendedString, theReal: number): void;

  // TDataStd_NamedData.GetRealsContainer (method)
  GetRealsContainer(): NCollection_DataMap_TCollection_ExtendedString_double;

  // TDataStd_NamedData.ChangeReals (method)
  ChangeReals(theReals: NCollection_DataMap_TCollection_ExtendedString_double): void;

  // TDataStd_NamedData.HasStrings (method)
  HasStrings(): boolean;

  // TDataStd_NamedData.HasString (method)
  HasString(theName: TCollection_ExtendedString): boolean;

  // TDataStd_NamedData.GetString (method)
  GetString(theName: TCollection_ExtendedString): TCollection_ExtendedString;

  // TDataStd_NamedData.SetString (method)
  SetString(theName: TCollection_ExtendedString, theString: TCollection_ExtendedString): void;

  // TDataStd_NamedData.GetStringsContainer (method)
  GetStringsContainer(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

  // TDataStd_NamedData.ChangeStrings (method)
  ChangeStrings(theStrings: NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString): void;

  // TDataStd_NamedData.HasBytes (method)
  HasBytes(): boolean;

  // TDataStd_NamedData.HasByte (method)
  HasByte(theName: TCollection_ExtendedString): boolean;

  // TDataStd_NamedData.GetByte (method)
  GetByte(theName: TCollection_ExtendedString): number;

  // TDataStd_NamedData.SetByte (method)
  SetByte(theName: TCollection_ExtendedString, theByte: number): void;

  // TDataStd_NamedData.GetBytesContainer (method)
  GetBytesContainer(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

  // TDataStd_NamedData.ChangeBytes (method)
  ChangeBytes(theBytes: NCollection_DataMap_TCollection_ExtendedString_uint8_t): void;

  // TDataStd_NamedData.HasArraysOfIntegers (method)
  HasArraysOfIntegers(): boolean;

  // TDataStd_NamedData.HasArrayOfIntegers (method)
  HasArrayOfIntegers(theName: TCollection_ExtendedString): boolean;

  // TDataStd_NamedData.GetArrayOfIntegers (method)
  GetArrayOfIntegers(theName: TCollection_ExtendedString): NCollection_HArray1_int;

  // TDataStd_NamedData.SetArrayOfIntegers (method)
  SetArrayOfIntegers(theName: TCollection_ExtendedString, theArrayOfIntegers: NCollection_HArray1_int): void;

  // TDataStd_NamedData.GetArraysOfIntegersContainer (method)
  GetArraysOfIntegersContainer(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

  // TDataStd_NamedData.ChangeArraysOfIntegers (method)
  ChangeArraysOfIntegers(theArraysOfIntegers: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int): void;

  // TDataStd_NamedData.HasArraysOfReals (method)
  HasArraysOfReals(): boolean;

  // TDataStd_NamedData.HasArrayOfReals (method)
  HasArrayOfReals(theName: TCollection_ExtendedString): boolean;

  // TDataStd_NamedData.GetArrayOfReals (method)
  GetArrayOfReals(theName: TCollection_ExtendedString): NCollection_HArray1_double;

  // TDataStd_NamedData.SetArrayOfReals (method)
  SetArrayOfReals(theName: TCollection_ExtendedString, theArrayOfReals: NCollection_HArray1_double): void;

  // TDataStd_NamedData.GetArraysOfRealsContainer (method)
  GetArraysOfRealsContainer(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

  // TDataStd_NamedData.ChangeArraysOfReals (method)
  ChangeArraysOfReals(theArraysOfReals: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double): void;

  // TDataStd_NamedData.Clear (method)
  Clear(): void;

  // TDataStd_NamedData.HasDeferredData (method)
  HasDeferredData(): boolean;

  // TDataStd_NamedData.LoadDeferredData (method)
  LoadDeferredData(theToKeepDeferred?: boolean): boolean;

  // TDataStd_NamedData.UnloadDeferredData (method)
  UnloadDeferredData(): boolean;

  // TDataStd_NamedData.clear (method)
  clear(): void;

  // TDataStd_NamedData.setInteger (method)
  setInteger(theName: TCollection_ExtendedString, theInteger: number): void;

  // TDataStd_NamedData.setReal (method)
  setReal(theName: TCollection_ExtendedString, theReal: number): void;

  // TDataStd_NamedData.setString (method)
  setString(theName: TCollection_ExtendedString, theString: TCollection_ExtendedString): void;

  // TDataStd_NamedData.setByte (method)
  setByte(theName: TCollection_ExtendedString, theByte: number): void;

  // TDataStd_NamedData.setArrayOfIntegers (method)
  setArrayOfIntegers(theName: TCollection_ExtendedString, theArrayOfIntegers: NCollection_HArray1_int): void;

  // TDataStd_NamedData.setArrayOfReals (method)
  setArrayOfReals(theName: TCollection_ExtendedString, theArrayOfReals: NCollection_HArray1_double): void;

  // TDataStd_NamedData.ID (method)
  ID(): Standard_GUID;

  // TDataStd_NamedData.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_NamedData.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_NamedData.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_NamedData.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_NamedData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_NamedData.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_NamedData.delete (method)
  delete(): void;

  // TDataStd_NamedData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_NoteBook: declare class TDataStd_NoteBook extends TDataStd_GenericEmpty

  // TDataStd_NoteBook.constructor (constructor)
  constructor();

  // TDataStd_NoteBook.Find (method)
  static Find(current: TDF_Label): { returnValue: boolean; N: TDataStd_NoteBook; [Symbol.dispose](): void };

  // TDataStd_NoteBook.New (method)
  static New(label: TDF_Label): TDataStd_NoteBook;

  // TDataStd_NoteBook.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_NoteBook.Append (method)
  Append(value: number, isExported: boolean): TDataStd_Real;
  Append(value: number, isExported: boolean): TDataStd_Integer;

  // TDataStd_NoteBook.ID (method)
  ID(): Standard_GUID;

  // TDataStd_NoteBook.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_NoteBook.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_NoteBook.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_NoteBook.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_NoteBook.delete (method)
  delete(): void;

  // TDataStd_NoteBook.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Real: declare class TDataStd_Real extends TDF_Attribute

  // TDataStd_Real.constructor (constructor)
  constructor();

  // TDataStd_Real.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Real.Set (method)
  static Set(label: TDF_Label, value: number): TDataStd_Real;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
  Set(V: number): void;

  // DEPRECATED
  // TDataStd_Real.SetDimension (method)
  SetDimension(DIM: TDataStd_RealEnum): void;

  // DEPRECATED
  // TDataStd_Real.GetDimension (method)
  GetDimension(): TDataStd_RealEnum;

  // TDataStd_Real.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_Real.Get (method)
  Get(): number;

  // TDataStd_Real.IsCaptured (method)
  IsCaptured(): boolean;

  // TDataStd_Real.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Real.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_Real.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Real.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_Real.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Real.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Real.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Real.delete (method)
  delete(): void;

  // TDataStd_Real.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_RealArray: declare class TDataStd_RealArray extends TDF_Attribute

  // TDataStd_RealArray.constructor (constructor)
  constructor();

  // TDataStd_RealArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_RealArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_RealArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_RealArray.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_RealArray.Set (method)
  static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_RealArray;

  // TDataStd_RealArray.Init (method)
  Init(lower: number, upper: number): void;

  // TDataStd_RealArray.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_RealArray.SetValue (method)
  SetValue(Index: number, Value: number): void;

  // TDataStd_RealArray.Value (method)
  Value(Index: number): number;

  // TDataStd_RealArray.Lower (method)
  Lower(): number;

  // TDataStd_RealArray.Upper (method)
  Upper(): number;

  // TDataStd_RealArray.Length (method)
  Length(): number;

  // TDataStd_RealArray.ChangeArray (method)
  ChangeArray(newArray: NCollection_HArray1_double, isCheckItems?: boolean): void;

  // TDataStd_RealArray.Array (method)
  Array(): NCollection_HArray1_double;

  // TDataStd_RealArray.GetDelta (method)
  GetDelta(): boolean;

  // TDataStd_RealArray.SetDelta (method)
  SetDelta(isDelta: boolean): void;

  // TDataStd_RealArray.ID (method)
  ID(): Standard_GUID;

  // TDataStd_RealArray.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_RealArray.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_RealArray.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_RealArray.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TDataStd_RealArray.delete (method)
  delete(): void;

  // TDataStd_RealArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_RealEnum: typeof TDataStd_RealEnum[keyof typeof TDataStd_RealEnum]

  readonly TDataStd_SCALAR: 'TDataStd_SCALAR'

  readonly TDataStd_LENGTH: 'TDataStd_LENGTH'

  readonly TDataStd_ANGULAR: 'TDataStd_ANGULAR'

TDataStd_RealList: declare class TDataStd_RealList extends TDF_Attribute

  // TDataStd_RealList.constructor (constructor)
  constructor();

  // TDataStd_RealList.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_RealList.Set (method)
  static Set(label: TDF_Label): TDataStd_RealList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_RealList;

  // TDataStd_RealList.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_RealList.Extent (method)
  Extent(): number;

  // TDataStd_RealList.Prepend (method)
  Prepend(value: number): void;

  // TDataStd_RealList.Append (method)
  Append(value: number): void;

  // TDataStd_RealList.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_RealList.InsertBefore (method)
  InsertBefore(value: number, before_value: number): boolean;

  // TDataStd_RealList.InsertBeforeByIndex (method)
  InsertBeforeByIndex(index: number, before_value: number): boolean;

  // TDataStd_RealList.InsertAfter (method)
  InsertAfter(value: number, after_value: number): boolean;

  // TDataStd_RealList.InsertAfterByIndex (method)
  InsertAfterByIndex(index: number, after_value: number): boolean;

  // TDataStd_RealList.Remove (method)
  Remove(value: number): boolean;

  // TDataStd_RealList.RemoveByIndex (method)
  RemoveByIndex(index: number): boolean;

  // TDataStd_RealList.Clear (method)
  Clear(): void;

  // TDataStd_RealList.First (method)
  First(): number;

  // TDataStd_RealList.Last (method)
  Last(): number;

  // TDataStd_RealList.List (method)
  List(): NCollection_List_double;

  // TDataStd_RealList.ID (method)
  ID(): Standard_GUID;

  // TDataStd_RealList.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_RealList.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_RealList.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_RealList.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_RealList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_RealList.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_RealList.delete (method)
  delete(): void;

  // TDataStd_RealList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_ReferenceArray: declare class TDataStd_ReferenceArray extends TDF_Attribute

  // TDataStd_ReferenceArray.constructor (constructor)
  constructor();

  // TDataStd_ReferenceArray.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_ReferenceArray.Set (method)
  static Set(label: TDF_Label, lower: number, upper: number): TDataStd_ReferenceArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_ReferenceArray;

  // TDataStd_ReferenceArray.Init (method)
  Init(lower: number, upper: number): void;

  // TDataStd_ReferenceArray.SetValue (method)
  SetValue(index: number, value: TDF_Label): void;

  // TDataStd_ReferenceArray.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_ReferenceArray.Value (method)
  Value(Index: number): TDF_Label;

  // TDataStd_ReferenceArray.Lower (method)
  Lower(): number;

  // TDataStd_ReferenceArray.Upper (method)
  Upper(): number;

  // TDataStd_ReferenceArray.Length (method)
  Length(): number;

  // TDataStd_ReferenceArray.InternalArray (method)
  InternalArray(): NCollection_HArray1_TDF_Label;

  // TDataStd_ReferenceArray.SetInternalArray (method)
  SetInternalArray(values: NCollection_HArray1_TDF_Label, isCheckItems?: boolean): void;

  // TDataStd_ReferenceArray.ID (method)
  ID(): Standard_GUID;

  // TDataStd_ReferenceArray.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_ReferenceArray.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_ReferenceArray.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_ReferenceArray.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataStd_ReferenceArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_ReferenceArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_ReferenceArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_ReferenceArray.delete (method)
  delete(): void;

  // TDataStd_ReferenceArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_ReferenceList: declare class TDataStd_ReferenceList extends TDF_Attribute

  // TDataStd_ReferenceList.constructor (constructor)
  constructor();

  // TDataStd_ReferenceList.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_ReferenceList.Set (method)
  static Set(label: TDF_Label): TDataStd_ReferenceList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ReferenceList;

  // TDataStd_ReferenceList.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_ReferenceList.Extent (method)
  Extent(): number;

  // TDataStd_ReferenceList.Prepend (method)
  Prepend(value: TDF_Label): void;

  // TDataStd_ReferenceList.Append (method)
  Append(value: TDF_Label): void;

  // TDataStd_ReferenceList.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_ReferenceList.InsertBefore (method)
  InsertBefore(value: TDF_Label, before_value: TDF_Label): boolean;
  InsertBefore(index: number, before_value: TDF_Label): boolean;

  // TDataStd_ReferenceList.InsertAfter (method)
  InsertAfter(value: TDF_Label, after_value: TDF_Label): boolean;
  InsertAfter(index: number, after_value: TDF_Label): boolean;

  // TDataStd_ReferenceList.Remove (method)
  Remove(value: TDF_Label): boolean;
  Remove(index: number): boolean;

  // TDataStd_ReferenceList.Clear (method)
  Clear(): void;

  // TDataStd_ReferenceList.First (method)
  First(): TDF_Label;

  // TDataStd_ReferenceList.Last (method)
  Last(): TDF_Label;

  // TDataStd_ReferenceList.List (method)
  List(): NCollection_List_TDF_Label;

  // TDataStd_ReferenceList.ID (method)
  ID(): Standard_GUID;

  // TDataStd_ReferenceList.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_ReferenceList.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_ReferenceList.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_ReferenceList.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataStd_ReferenceList.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_ReferenceList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_ReferenceList.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_ReferenceList.delete (method)
  delete(): void;

  // TDataStd_ReferenceList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Relation: declare class TDataStd_Relation extends TDataStd_Expression

  // TDataStd_Relation.constructor (constructor)
  constructor();

  // TDataStd_Relation.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Relation.Set (method)
  static Set(label: TDF_Label): TDataStd_Relation;

  // TDataStd_Relation.SetRelation (method)
  SetRelation(E: TCollection_ExtendedString): void;

  // TDataStd_Relation.GetRelation (method)
  GetRelation(): TCollection_ExtendedString;

  // TDataStd_Relation.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Relation.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Relation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Relation.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Relation.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Relation.delete (method)
  delete(): void;

  // TDataStd_Relation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Tick: declare class TDataStd_Tick extends TDataStd_GenericEmpty

  // TDataStd_Tick.constructor (constructor)
  constructor();

  // TDataStd_Tick.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Tick.Set (method)
  static Set(label: TDF_Label): TDataStd_Tick;

  // TDataStd_Tick.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Tick.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Tick.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Tick.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Tick.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Tick.delete (method)
  delete(): void;

  // TDataStd_Tick.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_TreeNode: declare class TDataStd_TreeNode extends TDF_Attribute

  // TDataStd_TreeNode.constructor (constructor)
  constructor();

  // TDataStd_TreeNode.Find (method)
  static Find(L: TDF_Label): { returnValue: boolean; T: TDataStd_TreeNode; [Symbol.dispose](): void };

  // TDataStd_TreeNode.Set (method)
  static Set(L: TDF_Label): TDataStd_TreeNode;
  static Set(L: TDF_Label, ExplicitTreeID: Standard_GUID): TDataStd_TreeNode;

  // TDataStd_TreeNode.GetDefaultTreeID (method)
  static GetDefaultTreeID(): Standard_GUID;

  // TDataStd_TreeNode.Append (method)
  Append(Child: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.Prepend (method)
  Prepend(Child: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.InsertBefore (method)
  InsertBefore(Node: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.InsertAfter (method)
  InsertAfter(Node: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.Remove (method)
  Remove(): boolean;

  // TDataStd_TreeNode.Depth (method)
  Depth(): number;

  // TDataStd_TreeNode.NbChildren (method)
  NbChildren(allLevels?: boolean): number;

  // TDataStd_TreeNode.IsAscendant (method)
  IsAscendant(of_: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.IsDescendant (method)
  IsDescendant(of_: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.IsRoot (method)
  IsRoot(): boolean;

  // TDataStd_TreeNode.Root (method)
  Root(): TDataStd_TreeNode;

  // TDataStd_TreeNode.IsFather (method)
  IsFather(of_: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.IsChild (method)
  IsChild(of_: TDataStd_TreeNode): boolean;

  // TDataStd_TreeNode.HasFather (method)
  HasFather(): boolean;

  // TDataStd_TreeNode.Father (method)
  Father(): TDataStd_TreeNode;

  // TDataStd_TreeNode.HasNext (method)
  HasNext(): boolean;

  // TDataStd_TreeNode.Next (method)
  Next(): TDataStd_TreeNode;

  // TDataStd_TreeNode.HasPrevious (method)
  HasPrevious(): boolean;

  // TDataStd_TreeNode.Previous (method)
  Previous(): TDataStd_TreeNode;

  // TDataStd_TreeNode.HasFirst (method)
  HasFirst(): boolean;

  // TDataStd_TreeNode.First (method)
  First(): TDataStd_TreeNode;

  // TDataStd_TreeNode.HasLast (method)
  HasLast(): boolean;

  // TDataStd_TreeNode.Last (method)
  Last(): TDataStd_TreeNode;

  // TDataStd_TreeNode.FindLast (method)
  FindLast(): TDataStd_TreeNode;

  // TDataStd_TreeNode.SetTreeID (method)
  SetTreeID(explicitID: Standard_GUID): void;

  // TDataStd_TreeNode.SetFather (method)
  SetFather(F: TDataStd_TreeNode): void;

  // TDataStd_TreeNode.SetNext (method)
  SetNext(F: TDataStd_TreeNode): void;

  // TDataStd_TreeNode.SetPrevious (method)
  SetPrevious(F: TDataStd_TreeNode): void;

  // TDataStd_TreeNode.SetFirst (method)
  SetFirst(F: TDataStd_TreeNode): void;

  // TDataStd_TreeNode.SetLast (method)
  SetLast(F: TDataStd_TreeNode): void;

  // TDataStd_TreeNode.AfterAddition (method)
  AfterAddition(): void;

  // TDataStd_TreeNode.BeforeForget (method)
  BeforeForget(): void;

  // TDataStd_TreeNode.AfterResume (method)
  AfterResume(): void;

  // TDataStd_TreeNode.BeforeUndo (method)
  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TDataStd_TreeNode.AfterUndo (method)
  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TDataStd_TreeNode.ID (method)
  ID(): Standard_GUID;

  // TDataStd_TreeNode.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_TreeNode.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_TreeNode.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_TreeNode.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataStd_TreeNode.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_TreeNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_TreeNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_TreeNode.delete (method)
  delete(): void;

  // TDataStd_TreeNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_UAttribute: declare class TDataStd_UAttribute extends TDF_Attribute

  // TDataStd_UAttribute.constructor (constructor)
  constructor();

  // TDataStd_UAttribute.Set (method)
  static Set(label: TDF_Label, LocalID: Standard_GUID): TDataStd_UAttribute;

  // TDataStd_UAttribute.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_UAttribute.ID (method)
  ID(): Standard_GUID;

  // TDataStd_UAttribute.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_UAttribute.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_UAttribute.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_UAttribute.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataStd_UAttribute.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_UAttribute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_UAttribute.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_UAttribute.delete (method)
  delete(): void;

  // TDataStd_UAttribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Variable: declare class TDataStd_Variable extends TDF_Attribute

  // TDataStd_Variable.constructor (constructor)
  constructor();

  // TDataStd_Variable.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Variable.Set (method)
  static Set(label: TDF_Label): TDataStd_Variable;
  Set(value: number): void;
  Set(value: number, dimension: TDataStd_RealEnum): void;

  // TDataStd_Variable.Name (method)
  Name(string_: TCollection_ExtendedString): void;
  Name(): TCollection_ExtendedString;

  // TDataStd_Variable.IsValued (method)
  IsValued(): boolean;

  // TDataStd_Variable.Get (method)
  Get(): number;

  // TDataStd_Variable.Real (method)
  Real(): TDataStd_Real;

  // TDataStd_Variable.IsAssigned (method)
  IsAssigned(): boolean;

  // TDataStd_Variable.Assign (method)
  Assign(): TDataStd_Expression;

  // TDataStd_Variable.Desassign (method)
  Desassign(): void;

  // TDataStd_Variable.Expression (method)
  Expression(): TDataStd_Expression;

  // TDataStd_Variable.IsCaptured (method)
  IsCaptured(): boolean;

  // TDataStd_Variable.IsConstant (method)
  IsConstant(): boolean;

  // TDataStd_Variable.Unit (method)
  Unit(unit: TCollection_AsciiString): void;
  Unit(): TCollection_AsciiString;

  // TDataStd_Variable.Constant (method)
  Constant(status: boolean): void;

  // TDataStd_Variable.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Variable.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_Variable.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Variable.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_Variable.References (method)
  References(aDataSet: TDF_DataSet): void;

  // TDataStd_Variable.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Variable.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Variable.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Variable.delete (method)
  delete(): void;

  // TDataStd_Variable.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HLabelArray1: NCollection_HArray1_TDF_Label

TDataStd_LabelArray1: NCollection_Array1_TDF_Label

TDataStd_ListOfByte: NCollection_List_uint8_t

TDataStd_ListOfExtendedString: NCollection_List_TCollection_ExtendedString
