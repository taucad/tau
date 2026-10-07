# libcascade — TDataStd

30 top-level symbols. Signatures are verbatim typescript.

TDataStd: declare class TDataStd

  // TDataStd.constructor (constructor)
  constructor();

  // TDataStd.IDList (method)
  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  // TDataStd.delete (method)
  delete(): void;

  // TDataStd.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_AsciiString: declare class TDataStd_AsciiString extends TDF_Attribute

  // TDataStd_AsciiString.constructor (constructor)
  constructor();

  // TDataStd_AsciiString.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_AsciiString.Set (method)
  static Set(label: TDF_Label, string_: TCollection_AsciiString): TDataStd_AsciiString;
  static Set(label: TDF_Label, guid: Standard_GUID, string_: TCollection_AsciiString): TDataStd_AsciiString;
  Set(S: TCollection_AsciiString): void;

  // TDataStd_AsciiString.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_AsciiString.Get (method)
  Get(): TCollection_AsciiString;

  // TDataStd_AsciiString.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_AsciiString.ID (method)
  ID(): Standard_GUID;

  // TDataStd_AsciiString.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_AsciiString.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_AsciiString.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_AsciiString.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_AsciiString.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_AsciiString.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_AsciiString.delete (method)
  delete(): void;

  // TDataStd_AsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_BooleanArray: declare class TDataStd_BooleanArray extends TDF_Attribute

  // TDataStd_BooleanArray.constructor (constructor)
  constructor();

  // TDataStd_BooleanArray.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_BooleanArray.Set (method)
  static Set(label: TDF_Label, lower: number, upper: number): TDataStd_BooleanArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number): TDataStd_BooleanArray;

  // TDataStd_BooleanArray.Init (method)
  Init(lower: number, upper: number): void;

  // TDataStd_BooleanArray.SetValue (method)
  SetValue(index: number, value: boolean): void;

  // TDataStd_BooleanArray.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_BooleanArray.Value (method)
  Value(Index: number): boolean;

  // TDataStd_BooleanArray.Lower (method)
  Lower(): number;

  // TDataStd_BooleanArray.Upper (method)
  Upper(): number;

  // TDataStd_BooleanArray.Length (method)
  Length(): number;

  // TDataStd_BooleanArray.InternalArray (method)
  InternalArray(): TColStd_HArray1OfByte;

  // TDataStd_BooleanArray.SetInternalArray (method)
  SetInternalArray(values: TColStd_HArray1OfByte): void;

  // TDataStd_BooleanArray.ID (method)
  ID(): Standard_GUID;

  // TDataStd_BooleanArray.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_BooleanArray.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_BooleanArray.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_BooleanArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_BooleanArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_BooleanArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_BooleanArray.delete (method)
  delete(): void;

  // TDataStd_BooleanArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_BooleanList: declare class TDataStd_BooleanList extends TDF_Attribute

  // TDataStd_BooleanList.constructor (constructor)
  constructor();

  // TDataStd_BooleanList.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_BooleanList.Set (method)
  static Set(label: TDF_Label): TDataStd_BooleanList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_BooleanList;

  // TDataStd_BooleanList.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_BooleanList.Extent (method)
  Extent(): number;

  // TDataStd_BooleanList.Prepend (method)
  Prepend(value: boolean): void;

  // TDataStd_BooleanList.Append (method)
  Append(value: boolean): void;

  // TDataStd_BooleanList.Clear (method)
  Clear(): void;

  // TDataStd_BooleanList.First (method)
  First(): boolean;

  // TDataStd_BooleanList.Last (method)
  Last(): boolean;

  // TDataStd_BooleanList.List (method)
  List(): NCollection_List_uint8_t;

  // TDataStd_BooleanList.InsertBefore (method)
  InsertBefore(index: number, before_value: boolean): boolean;

  // TDataStd_BooleanList.InsertAfter (method)
  InsertAfter(index: number, after_value: boolean): boolean;

  // TDataStd_BooleanList.Remove (method)
  Remove(index: number): boolean;

  // TDataStd_BooleanList.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_BooleanList.ID (method)
  ID(): Standard_GUID;

  // TDataStd_BooleanList.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_BooleanList.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_BooleanList.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_BooleanList.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_BooleanList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_BooleanList.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_BooleanList.delete (method)
  delete(): void;

  // TDataStd_BooleanList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_ByteArray: declare class TDataStd_ByteArray extends TDF_Attribute

  // TDataStd_ByteArray.constructor (constructor)
  constructor();

  // TDataStd_ByteArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_ByteArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_ByteArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_ByteArray.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_ByteArray.Set (method)
  static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ByteArray;

  // TDataStd_ByteArray.Init (method)
  Init(lower: number, upper: number): void;

  // TDataStd_ByteArray.SetValue (method)
  SetValue(index: number, value: number): void;

  // TDataStd_ByteArray.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_ByteArray.Value (method)
  Value(Index: number): number;

  // TDataStd_ByteArray.Lower (method)
  Lower(): number;

  // TDataStd_ByteArray.Upper (method)
  Upper(): number;

  // TDataStd_ByteArray.Length (method)
  Length(): number;

  // TDataStd_ByteArray.InternalArray (method)
  InternalArray(): TColStd_HArray1OfByte;

  // TDataStd_ByteArray.ChangeArray (method)
  ChangeArray(newArray: TColStd_HArray1OfByte, isCheckItems?: boolean): void;

  // TDataStd_ByteArray.GetDelta (method)
  GetDelta(): boolean;

  // TDataStd_ByteArray.SetDelta (method)
  SetDelta(isDelta: boolean): void;

  // TDataStd_ByteArray.ID (method)
  ID(): Standard_GUID;

  // TDataStd_ByteArray.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_ByteArray.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_ByteArray.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_ByteArray.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TDataStd_ByteArray.delete (method)
  delete(): void;

  // TDataStd_ByteArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_ChildNodeIterator: declare class TDataStd_ChildNodeIterator

  // TDataStd_ChildNodeIterator.constructor (constructor)
  constructor();
  constructor(aTreeNode: TDataStd_TreeNode, allLevels?: boolean);

  // TDataStd_ChildNodeIterator.Initialize (method)
  Initialize(aTreeNode: TDataStd_TreeNode, allLevels?: boolean): void;

  // TDataStd_ChildNodeIterator.More (method)
  More(): boolean;

  // TDataStd_ChildNodeIterator.Next (method)
  Next(): void;

  // TDataStd_ChildNodeIterator.NextBrother (method)
  NextBrother(): void;

  // TDataStd_ChildNodeIterator.Value (method)
  Value(): TDataStd_TreeNode;

  // TDataStd_ChildNodeIterator.delete (method)
  delete(): void;

  // TDataStd_ChildNodeIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Comment: declare class TDataStd_Comment extends TDataStd_GenericExtString

  // TDataStd_Comment.constructor (constructor)
  constructor();

  // TDataStd_Comment.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Comment.Set (method)
  static Set(label: TDF_Label): TDataStd_Comment;
  static Set(label: TDF_Label, string_: TCollection_ExtendedString): TDataStd_Comment;
  Set(S: TCollection_ExtendedString): void;

  // TDataStd_Comment.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_Comment.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Comment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Comment.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Comment.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Comment.delete (method)
  delete(): void;

  // TDataStd_Comment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Current: declare class TDataStd_Current extends TDF_Attribute

  // TDataStd_Current.constructor (constructor)
  constructor();

  // TDataStd_Current.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Current.Set (method)
  static Set(L: TDF_Label): void;

  // TDataStd_Current.Get (method)
  static Get(acces: TDF_Label): TDF_Label;

  // TDataStd_Current.Has (method)
  static Has(acces: TDF_Label): boolean;

  // TDataStd_Current.SetLabel (method)
  SetLabel(current: TDF_Label): void;

  // TDataStd_Current.GetLabel (method)
  GetLabel(): TDF_Label;

  // TDataStd_Current.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Current.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_Current.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Current.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_Current.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Current.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Current.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Current.delete (method)
  delete(): void;

  // TDataStd_Current.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfByteArray: declare class TDataStd_DeltaOnModificationOfByteArray extends TDF_DeltaOnModification

  // TDataStd_DeltaOnModificationOfByteArray.constructor (constructor)
  constructor(Arr: TDataStd_ByteArray);

  // TDataStd_DeltaOnModificationOfByteArray.Apply (method)
  Apply(): void;

  // TDataStd_DeltaOnModificationOfByteArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_DeltaOnModificationOfByteArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_DeltaOnModificationOfByteArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_DeltaOnModificationOfByteArray.delete (method)
  delete(): void;

  // TDataStd_DeltaOnModificationOfByteArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfExtStringArray: declare class TDataStd_DeltaOnModificationOfExtStringArray extends TDF_DeltaOnModification

  // TDataStd_DeltaOnModificationOfExtStringArray.constructor (constructor)
  constructor(Arr: TDataStd_ExtStringArray);

  // TDataStd_DeltaOnModificationOfExtStringArray.Apply (method)
  Apply(): void;

  // TDataStd_DeltaOnModificationOfExtStringArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_DeltaOnModificationOfExtStringArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_DeltaOnModificationOfExtStringArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_DeltaOnModificationOfExtStringArray.delete (method)
  delete(): void;

  // TDataStd_DeltaOnModificationOfExtStringArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfIntArray: declare class TDataStd_DeltaOnModificationOfIntArray extends TDF_DeltaOnModification

  // TDataStd_DeltaOnModificationOfIntArray.constructor (constructor)
  constructor(Arr: TDataStd_IntegerArray);

  // TDataStd_DeltaOnModificationOfIntArray.Apply (method)
  Apply(): void;

  // TDataStd_DeltaOnModificationOfIntArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_DeltaOnModificationOfIntArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_DeltaOnModificationOfIntArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_DeltaOnModificationOfIntArray.delete (method)
  delete(): void;

  // TDataStd_DeltaOnModificationOfIntArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfIntPackedMap: declare class TDataStd_DeltaOnModificationOfIntPackedMap extends TDF_DeltaOnModification

  // TDataStd_DeltaOnModificationOfIntPackedMap.constructor (constructor)
  constructor(Arr: TDataStd_IntPackedMap);

  // TDataStd_DeltaOnModificationOfIntPackedMap.Apply (method)
  Apply(): void;

  // TDataStd_DeltaOnModificationOfIntPackedMap.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_DeltaOnModificationOfIntPackedMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_DeltaOnModificationOfIntPackedMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_DeltaOnModificationOfIntPackedMap.delete (method)
  delete(): void;

  // TDataStd_DeltaOnModificationOfIntPackedMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_DeltaOnModificationOfRealArray: declare class TDataStd_DeltaOnModificationOfRealArray extends TDF_DeltaOnModification

  // TDataStd_DeltaOnModificationOfRealArray.constructor (constructor)
  constructor(Arr: TDataStd_RealArray);

  // TDataStd_DeltaOnModificationOfRealArray.Apply (method)
  Apply(): void;

  // TDataStd_DeltaOnModificationOfRealArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_DeltaOnModificationOfRealArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_DeltaOnModificationOfRealArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_DeltaOnModificationOfRealArray.delete (method)
  delete(): void;

  // TDataStd_DeltaOnModificationOfRealArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Directory: declare class TDataStd_Directory extends TDataStd_GenericEmpty

  // TDataStd_Directory.constructor (constructor)
  constructor();

  // TDataStd_Directory.Find (method)
  static Find(current: TDF_Label): { returnValue: boolean; D: TDataStd_Directory; [Symbol.dispose](): void };

  // TDataStd_Directory.New (method)
  static New(label: TDF_Label): TDataStd_Directory;

  // TDataStd_Directory.AddDirectory (method)
  static AddDirectory(dir: TDataStd_Directory): TDataStd_Directory;

  // TDataStd_Directory.MakeObjectLabel (method)
  static MakeObjectLabel(dir: TDataStd_Directory): TDF_Label;

  // TDataStd_Directory.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Directory.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Directory.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Directory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Directory.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Directory.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Directory.delete (method)
  delete(): void;

  // TDataStd_Directory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Expression: declare class TDataStd_Expression extends TDF_Attribute

  // TDataStd_Expression.constructor (constructor)
  constructor();

  // TDataStd_Expression.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Expression.Set (method)
  static Set(label: TDF_Label): TDataStd_Expression;

  // TDataStd_Expression.Name (method)
  Name(): TCollection_ExtendedString;

  // TDataStd_Expression.SetExpression (method)
  SetExpression(E: TCollection_ExtendedString): void;

  // TDataStd_Expression.GetExpression (method)
  GetExpression(): TCollection_ExtendedString;

  // TDataStd_Expression.GetVariables (method)
  GetVariables(): NCollection_List_handle_TDF_Attribute;

  // TDataStd_Expression.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Expression.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_Expression.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Expression.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_Expression.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Expression.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Expression.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Expression.delete (method)
  delete(): void;

  // TDataStd_Expression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_ExtStringArray: declare class TDataStd_ExtStringArray extends TDF_Attribute

  // TDataStd_ExtStringArray.constructor (constructor)
  constructor();

  // TDataStd_ExtStringArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_ExtStringArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_ExtStringArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_ExtStringArray.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_ExtStringArray.Set (method)
  static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_ExtStringArray;

  // TDataStd_ExtStringArray.Init (method)
  Init(lower: number, upper: number): void;

  // TDataStd_ExtStringArray.SetValue (method)
  SetValue(Index: number, Value: TCollection_ExtendedString): void;

  // TDataStd_ExtStringArray.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_ExtStringArray.Value (method)
  Value(Index: number): TCollection_ExtendedString;

  // TDataStd_ExtStringArray.Lower (method)
  Lower(): number;

  // TDataStd_ExtStringArray.Upper (method)
  Upper(): number;

  // TDataStd_ExtStringArray.Length (method)
  Length(): number;

  // TDataStd_ExtStringArray.ChangeArray (method)
  ChangeArray(newArray: NCollection_HArray1_TCollection_ExtendedString, isCheckItems?: boolean): void;

  // TDataStd_ExtStringArray.Array (method)
  Array(): NCollection_HArray1_TCollection_ExtendedString;

  // TDataStd_ExtStringArray.GetDelta (method)
  GetDelta(): boolean;

  // TDataStd_ExtStringArray.SetDelta (method)
  SetDelta(isDelta: boolean): void;

  // TDataStd_ExtStringArray.ID (method)
  ID(): Standard_GUID;

  // TDataStd_ExtStringArray.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_ExtStringArray.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_ExtStringArray.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_ExtStringArray.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TDataStd_ExtStringArray.delete (method)
  delete(): void;

  // TDataStd_ExtStringArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_ExtStringList: declare class TDataStd_ExtStringList extends TDF_Attribute

  // TDataStd_ExtStringList.constructor (constructor)
  constructor();

  // TDataStd_ExtStringList.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_ExtStringList.Set (method)
  static Set(label: TDF_Label): TDataStd_ExtStringList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_ExtStringList;

  // TDataStd_ExtStringList.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_ExtStringList.Extent (method)
  Extent(): number;

  // TDataStd_ExtStringList.Prepend (method)
  Prepend(value: TCollection_ExtendedString): void;

  // TDataStd_ExtStringList.Append (method)
  Append(value: TCollection_ExtendedString): void;

  // TDataStd_ExtStringList.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_ExtStringList.InsertBefore (method)
  InsertBefore(value: TCollection_ExtendedString, before_value: TCollection_ExtendedString): boolean;
  InsertBefore(index: number, before_value: TCollection_ExtendedString): boolean;

  // TDataStd_ExtStringList.InsertAfter (method)
  InsertAfter(value: TCollection_ExtendedString, after_value: TCollection_ExtendedString): boolean;
  InsertAfter(index: number, after_value: TCollection_ExtendedString): boolean;

  // TDataStd_ExtStringList.Remove (method)
  Remove(value: TCollection_ExtendedString): boolean;
  Remove(index: number): boolean;

  // TDataStd_ExtStringList.Clear (method)
  Clear(): void;

  // TDataStd_ExtStringList.First (method)
  First(): TCollection_ExtendedString;

  // TDataStd_ExtStringList.Last (method)
  Last(): TCollection_ExtendedString;

  // TDataStd_ExtStringList.List (method)
  List(): NCollection_List_TCollection_ExtendedString;

  // TDataStd_ExtStringList.ID (method)
  ID(): Standard_GUID;

  // TDataStd_ExtStringList.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_ExtStringList.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_ExtStringList.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_ExtStringList.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_ExtStringList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_ExtStringList.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_ExtStringList.delete (method)
  delete(): void;

  // TDataStd_ExtStringList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_GenericEmpty: declare class TDataStd_GenericEmpty extends TDF_Attribute

  // TDataStd_GenericEmpty.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_GenericEmpty.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_GenericEmpty.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_GenericEmpty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_GenericEmpty.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_GenericEmpty.delete (method)
  delete(): void;

  // TDataStd_GenericEmpty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_GenericExtString: declare class TDataStd_GenericExtString extends TDF_Attribute

  // TDataStd_GenericExtString.Set (method)
  Set(S: TCollection_ExtendedString): void;

  // TDataStd_GenericExtString.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_GenericExtString.Get (method)
  Get(): TCollection_ExtendedString;

  // TDataStd_GenericExtString.ID (method)
  ID(): Standard_GUID;

  // TDataStd_GenericExtString.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_GenericExtString.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_GenericExtString.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_GenericExtString.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_GenericExtString.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_GenericExtString.delete (method)
  delete(): void;

  // TDataStd_GenericExtString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HDataMapOfStringByte: declare class TDataStd_HDataMapOfStringByte extends Standard_Transient

  // TDataStd_HDataMapOfStringByte.constructor (constructor)
  constructor(NbBuckets?: number);
  constructor(theOther: NCollection_DataMap_TCollection_ExtendedString_uint8_t);

  // TDataStd_HDataMapOfStringByte.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_HDataMapOfStringByte.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_HDataMapOfStringByte.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_HDataMapOfStringByte.Map (method)
  Map(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

  // TDataStd_HDataMapOfStringByte.ChangeMap (method)
  ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_uint8_t;

  // TDataStd_HDataMapOfStringByte.delete (method)
  delete(): void;

  // TDataStd_HDataMapOfStringByte.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HDataMapOfStringHArray1OfInteger: declare class TDataStd_HDataMapOfStringHArray1OfInteger extends Standard_Transient

  // TDataStd_HDataMapOfStringHArray1OfInteger.constructor (constructor)
  constructor(NbBuckets?: number);
  constructor(theOther: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int);

  // TDataStd_HDataMapOfStringHArray1OfInteger.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_HDataMapOfStringHArray1OfInteger.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_HDataMapOfStringHArray1OfInteger.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_HDataMapOfStringHArray1OfInteger.Map (method)
  Map(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

  // TDataStd_HDataMapOfStringHArray1OfInteger.ChangeMap (method)
  ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int;

  // TDataStd_HDataMapOfStringHArray1OfInteger.delete (method)
  delete(): void;

  // TDataStd_HDataMapOfStringHArray1OfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HDataMapOfStringHArray1OfReal: declare class TDataStd_HDataMapOfStringHArray1OfReal extends Standard_Transient

  // TDataStd_HDataMapOfStringHArray1OfReal.constructor (constructor)
  constructor(NbBuckets?: number);
  constructor(theOther: NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double);

  // TDataStd_HDataMapOfStringHArray1OfReal.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_HDataMapOfStringHArray1OfReal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_HDataMapOfStringHArray1OfReal.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_HDataMapOfStringHArray1OfReal.Map (method)
  Map(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

  // TDataStd_HDataMapOfStringHArray1OfReal.ChangeMap (method)
  ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double;

  // TDataStd_HDataMapOfStringHArray1OfReal.delete (method)
  delete(): void;

  // TDataStd_HDataMapOfStringHArray1OfReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HDataMapOfStringInteger: declare class TDataStd_HDataMapOfStringInteger extends Standard_Transient

  // TDataStd_HDataMapOfStringInteger.constructor (constructor)
  constructor(NbBuckets?: number);
  constructor(theOther: NCollection_DataMap_TCollection_ExtendedString_int);

  // TDataStd_HDataMapOfStringInteger.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_HDataMapOfStringInteger.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_HDataMapOfStringInteger.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_HDataMapOfStringInteger.Map (method)
  Map(): NCollection_DataMap_TCollection_ExtendedString_int;

  // TDataStd_HDataMapOfStringInteger.ChangeMap (method)
  ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_int;

  // TDataStd_HDataMapOfStringInteger.delete (method)
  delete(): void;

  // TDataStd_HDataMapOfStringInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HDataMapOfStringReal: declare class TDataStd_HDataMapOfStringReal extends Standard_Transient

  // TDataStd_HDataMapOfStringReal.constructor (constructor)
  constructor(NbBuckets?: number);
  constructor(theOther: NCollection_DataMap_TCollection_ExtendedString_double);

  // TDataStd_HDataMapOfStringReal.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_HDataMapOfStringReal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_HDataMapOfStringReal.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_HDataMapOfStringReal.Map (method)
  Map(): NCollection_DataMap_TCollection_ExtendedString_double;

  // TDataStd_HDataMapOfStringReal.ChangeMap (method)
  ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_double;

  // TDataStd_HDataMapOfStringReal.delete (method)
  delete(): void;

  // TDataStd_HDataMapOfStringReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_HDataMapOfStringString: declare class TDataStd_HDataMapOfStringString extends Standard_Transient

  // TDataStd_HDataMapOfStringString.constructor (constructor)
  constructor(NbBuckets?: number);
  constructor(theOther: NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString);

  // TDataStd_HDataMapOfStringString.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_HDataMapOfStringString.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_HDataMapOfStringString.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_HDataMapOfStringString.Map (method)
  Map(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

  // TDataStd_HDataMapOfStringString.ChangeMap (method)
  ChangeMap(): NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString;

  // TDataStd_HDataMapOfStringString.delete (method)
  delete(): void;

  // TDataStd_HDataMapOfStringString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_IntPackedMap: declare class TDataStd_IntPackedMap extends TDF_Attribute

  // TDataStd_IntPackedMap.constructor (constructor)
  constructor();

  // TDataStd_IntPackedMap.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_IntPackedMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_IntPackedMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_IntPackedMap.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_IntPackedMap.Set (method)
  static Set(label: TDF_Label, isDelta?: boolean): TDataStd_IntPackedMap;

  // TDataStd_IntPackedMap.ChangeMap (method)
  ChangeMap(theMap: TColStd_HPackedMapOfInteger): boolean;
  ChangeMap(theMap: TColStd_PackedMapOfInteger): boolean;

  // TDataStd_IntPackedMap.GetMap (method)
  GetMap(): TColStd_PackedMapOfInteger;

  // TDataStd_IntPackedMap.GetHMap (method)
  GetHMap(): TColStd_HPackedMapOfInteger;

  // TDataStd_IntPackedMap.Clear (method)
  Clear(): boolean;

  // TDataStd_IntPackedMap.Add (method)
  Add(theKey: number): boolean;

  // TDataStd_IntPackedMap.Remove (method)
  Remove(theKey: number): boolean;

  // TDataStd_IntPackedMap.Contains (method)
  Contains(theKey: number): boolean;

  // TDataStd_IntPackedMap.Extent (method)
  Extent(): number;

  // TDataStd_IntPackedMap.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_IntPackedMap.GetDelta (method)
  GetDelta(): boolean;

  // TDataStd_IntPackedMap.SetDelta (method)
  SetDelta(isDelta: boolean): void;

  // TDataStd_IntPackedMap.ID (method)
  ID(): Standard_GUID;

  // TDataStd_IntPackedMap.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_IntPackedMap.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_IntPackedMap.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_IntPackedMap.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TDataStd_IntPackedMap.delete (method)
  delete(): void;

  // TDataStd_IntPackedMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Integer: declare class TDataStd_Integer extends TDF_Attribute

  // TDataStd_Integer.constructor (constructor)
  constructor();

  // TDataStd_Integer.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Integer.Set (method)
  static Set(label: TDF_Label, value: number): TDataStd_Integer;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Integer;
  Set(V: number): void;

  // TDataStd_Integer.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_Integer.Get (method)
  Get(): number;

  // TDataStd_Integer.IsCaptured (method)
  IsCaptured(): boolean;

  // TDataStd_Integer.ID (method)
  ID(): Standard_GUID;

  // TDataStd_Integer.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_Integer.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Integer.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_Integer.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Integer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Integer.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Integer.delete (method)
  delete(): void;

  // TDataStd_Integer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_IntegerArray: declare class TDataStd_IntegerArray extends TDF_Attribute

  // TDataStd_IntegerArray.constructor (constructor)
  constructor();

  // TDataStd_IntegerArray.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_IntegerArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_IntegerArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_IntegerArray.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_IntegerArray.Set (method)
  static Set(label: TDF_Label, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;
  static Set(label: TDF_Label, theGuid: Standard_GUID, lower: number, upper: number, isDelta: boolean): TDataStd_IntegerArray;

  // TDataStd_IntegerArray.Init (method)
  Init(lower: number, upper: number): void;

  // TDataStd_IntegerArray.SetValue (method)
  SetValue(Index: number, Value: number): void;

  // TDataStd_IntegerArray.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_IntegerArray.Value (method)
  Value(Index: number): number;

  // TDataStd_IntegerArray.Lower (method)
  Lower(): number;

  // TDataStd_IntegerArray.Upper (method)
  Upper(): number;

  // TDataStd_IntegerArray.Length (method)
  Length(): number;

  // TDataStd_IntegerArray.ChangeArray (method)
  ChangeArray(newArray: NCollection_HArray1_int, isCheckItems?: boolean): void;

  // TDataStd_IntegerArray.Array (method)
  Array(): NCollection_HArray1_int;

  // TDataStd_IntegerArray.GetDelta (method)
  GetDelta(): boolean;

  // TDataStd_IntegerArray.SetDelta (method)
  SetDelta(isDelta: boolean): void;

  // TDataStd_IntegerArray.ID (method)
  ID(): Standard_GUID;

  // TDataStd_IntegerArray.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_IntegerArray.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_IntegerArray.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_IntegerArray.DeltaOnModification (method)
  DeltaOnModification(anOldAttribute: TDF_Attribute): TDF_DeltaOnModification;
  DeltaOnModification(aDelta: TDF_DeltaOnModification): void;

  // TDataStd_IntegerArray.delete (method)
  delete(): void;

  // TDataStd_IntegerArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_IntegerList: declare class TDataStd_IntegerList extends TDF_Attribute

  // TDataStd_IntegerList.constructor (constructor)
  constructor();

  // TDataStd_IntegerList.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_IntegerList.Set (method)
  static Set(label: TDF_Label): TDataStd_IntegerList;
  static Set(label: TDF_Label, theGuid: Standard_GUID): TDataStd_IntegerList;

  // TDataStd_IntegerList.IsEmpty (method)
  IsEmpty(): boolean;

  // TDataStd_IntegerList.Extent (method)
  Extent(): number;

  // TDataStd_IntegerList.Prepend (method)
  Prepend(value: number): void;

  // TDataStd_IntegerList.Append (method)
  Append(value: number): void;

  // TDataStd_IntegerList.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_IntegerList.InsertBefore (method)
  InsertBefore(value: number, before_value: number): boolean;

  // TDataStd_IntegerList.InsertBeforeByIndex (method)
  InsertBeforeByIndex(index: number, before_value: number): boolean;

  // TDataStd_IntegerList.InsertAfter (method)
  InsertAfter(value: number, after_value: number): boolean;

  // TDataStd_IntegerList.InsertAfterByIndex (method)
  InsertAfterByIndex(index: number, after_value: number): boolean;

  // TDataStd_IntegerList.Remove (method)
  Remove(value: number): boolean;

  // TDataStd_IntegerList.RemoveByIndex (method)
  RemoveByIndex(index: number): boolean;

  // TDataStd_IntegerList.Clear (method)
  Clear(): void;

  // TDataStd_IntegerList.First (method)
  First(): number;

  // TDataStd_IntegerList.Last (method)
  Last(): number;

  // TDataStd_IntegerList.List (method)
  List(): NCollection_List_int;

  // TDataStd_IntegerList.ID (method)
  ID(): Standard_GUID;

  // TDataStd_IntegerList.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDataStd_IntegerList.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_IntegerList.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDataStd_IntegerList.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_IntegerList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_IntegerList.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_IntegerList.delete (method)
  delete(): void;

  // TDataStd_IntegerList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDataStd_Name: declare class TDataStd_Name extends TDataStd_GenericExtString

  // TDataStd_Name.constructor (constructor)
  constructor();

  // TDataStd_Name.GetID (method)
  static GetID(): Standard_GUID;

  // TDataStd_Name.Set (method)
  static Set(label: TDF_Label, string_: TCollection_ExtendedString): TDataStd_Name;
  static Set(label: TDF_Label, guid: Standard_GUID, string_: TCollection_ExtendedString): TDataStd_Name;
  Set(S: TCollection_ExtendedString): void;

  // TDataStd_Name.SetID (method)
  SetID(argNo0: Standard_GUID): void;
  SetID(): void;

  // TDataStd_Name.get_type_name (method)
  static get_type_name(): string;

  // TDataStd_Name.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDataStd_Name.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDataStd_Name.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDataStd_Name.delete (method)
  delete(): void;

  // TDataStd_Name.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
