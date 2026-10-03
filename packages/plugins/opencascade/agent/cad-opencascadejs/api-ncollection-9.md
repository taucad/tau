# libcascade — NCollection (9)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Array1_handle_IGESAppli_Node: declare class NCollection_Array1_handle_IGESAppli_Node

  // NCollection_Array1_handle_IGESAppli_Node.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESAppli_Node);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESAppli_Node, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESAppli_Node, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESAppli_Node.Init (method)
  Init(theValue: IGESAppli_Node): void;

  // NCollection_Array1_handle_IGESAppli_Node.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESAppli_Node.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESAppli_Node.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESAppli_Node.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESAppli_Node.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESAppli_Node.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESAppli_Node): NCollection_Array1_handle_IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESAppli_Node): NCollection_Array1_handle_IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESAppli_Node): NCollection_Array1_handle_IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.First (method)
  First(): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.ChangeFirst (method)
  ChangeFirst(): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.Last (method)
  Last(): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.ChangeLast (method)
  ChangeLast(): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.Value (method)
  Value(theIndex: number): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.ChangeValue (method)
  ChangeValue(theIndex: number): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.At (method)
  At(theIndex: number): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.ChangeAt (method)
  ChangeAt(theIndex: number): IGESAppli_Node;

  // NCollection_Array1_handle_IGESAppli_Node.SetValue (method)
  SetValue(theIndex: number, theItem: IGESAppli_Node): void;

  // NCollection_Array1_handle_IGESAppli_Node.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESAppli_Node.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESAppli_Node.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESAppli_Node.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESAppli_Node.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESAppli_Node.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESData_IGESEntity: declare class NCollection_Array1_handle_IGESData_IGESEntity

  // NCollection_Array1_handle_IGESData_IGESEntity.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESData_IGESEntity);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESData_IGESEntity, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESData_IGESEntity, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESData_IGESEntity.Init (method)
  Init(theValue: IGESData_IGESEntity): void;

  // NCollection_Array1_handle_IGESData_IGESEntity.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESData_IGESEntity.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESData_IGESEntity.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESData_IGESEntity.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESData_IGESEntity.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESData_IGESEntity.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESData_IGESEntity): NCollection_Array1_handle_IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESData_IGESEntity): NCollection_Array1_handle_IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESData_IGESEntity): NCollection_Array1_handle_IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.First (method)
  First(): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.ChangeFirst (method)
  ChangeFirst(): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.Last (method)
  Last(): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.ChangeLast (method)
  ChangeLast(): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.Value (method)
  Value(theIndex: number): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.ChangeValue (method)
  ChangeValue(theIndex: number): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.At (method)
  At(theIndex: number): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.ChangeAt (method)
  ChangeAt(theIndex: number): IGESData_IGESEntity;

  // NCollection_Array1_handle_IGESData_IGESEntity.SetValue (method)
  SetValue(theIndex: number, theItem: IGESData_IGESEntity): void;

  // NCollection_Array1_handle_IGESData_IGESEntity.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESData_IGESEntity.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESData_IGESEntity.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESData_IGESEntity.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESData_IGESEntity.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESData_IGESEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESData_LineFontEntity: declare class NCollection_Array1_handle_IGESData_LineFontEntity

  // NCollection_Array1_handle_IGESData_LineFontEntity.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESData_LineFontEntity);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESData_LineFontEntity, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESData_LineFontEntity, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESData_LineFontEntity.Init (method)
  Init(theValue: IGESData_LineFontEntity): void;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESData_LineFontEntity.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESData_LineFontEntity): NCollection_Array1_handle_IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESData_LineFontEntity): NCollection_Array1_handle_IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESData_LineFontEntity): NCollection_Array1_handle_IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.First (method)
  First(): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.ChangeFirst (method)
  ChangeFirst(): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Last (method)
  Last(): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.ChangeLast (method)
  ChangeLast(): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Value (method)
  Value(theIndex: number): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.ChangeValue (method)
  ChangeValue(theIndex: number): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.At (method)
  At(theIndex: number): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.ChangeAt (method)
  ChangeAt(theIndex: number): IGESData_LineFontEntity;

  // NCollection_Array1_handle_IGESData_LineFontEntity.SetValue (method)
  SetValue(theIndex: number, theItem: IGESData_LineFontEntity): void;

  // NCollection_Array1_handle_IGESData_LineFontEntity.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESData_LineFontEntity.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESData_LineFontEntity.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESData_LineFontEntity.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESData_LineFontEntity.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESData_LineFontEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESData_ViewKindEntity: declare class NCollection_Array1_handle_IGESData_ViewKindEntity

  // NCollection_Array1_handle_IGESData_ViewKindEntity.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESData_ViewKindEntity, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESData_ViewKindEntity, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Init (method)
  Init(theValue: IGESData_ViewKindEntity): void;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity): NCollection_Array1_handle_IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity): NCollection_Array1_handle_IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESData_ViewKindEntity): NCollection_Array1_handle_IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.First (method)
  First(): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.ChangeFirst (method)
  ChangeFirst(): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Last (method)
  Last(): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.ChangeLast (method)
  ChangeLast(): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Value (method)
  Value(theIndex: number): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.ChangeValue (method)
  ChangeValue(theIndex: number): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.At (method)
  At(theIndex: number): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.ChangeAt (method)
  ChangeAt(theIndex: number): IGESData_ViewKindEntity;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.SetValue (method)
  SetValue(theIndex: number, theItem: IGESData_ViewKindEntity): void;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESData_ViewKindEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESDefs_TabularData: declare class NCollection_Array1_handle_IGESDefs_TabularData

  // NCollection_Array1_handle_IGESDefs_TabularData.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESDefs_TabularData);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESDefs_TabularData, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESDefs_TabularData, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESDefs_TabularData.Init (method)
  Init(theValue: IGESDefs_TabularData): void;

  // NCollection_Array1_handle_IGESDefs_TabularData.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESDefs_TabularData.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESDefs_TabularData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESDefs_TabularData.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESDefs_TabularData.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESDefs_TabularData.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESDefs_TabularData): NCollection_Array1_handle_IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESDefs_TabularData): NCollection_Array1_handle_IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESDefs_TabularData): NCollection_Array1_handle_IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.First (method)
  First(): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.ChangeFirst (method)
  ChangeFirst(): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.Last (method)
  Last(): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.ChangeLast (method)
  ChangeLast(): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.Value (method)
  Value(theIndex: number): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.ChangeValue (method)
  ChangeValue(theIndex: number): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.At (method)
  At(theIndex: number): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.ChangeAt (method)
  ChangeAt(theIndex: number): IGESDefs_TabularData;

  // NCollection_Array1_handle_IGESDefs_TabularData.SetValue (method)
  SetValue(theIndex: number, theItem: IGESDefs_TabularData): void;

  // NCollection_Array1_handle_IGESDefs_TabularData.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESDefs_TabularData.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESDefs_TabularData.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESDefs_TabularData.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESDefs_TabularData.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESDefs_TabularData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESDimen_GeneralNote: declare class NCollection_Array1_handle_IGESDimen_GeneralNote

  // NCollection_Array1_handle_IGESDimen_GeneralNote.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESDimen_GeneralNote, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESDimen_GeneralNote, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Init (method)
  Init(theValue: IGESDimen_GeneralNote): void;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote): NCollection_Array1_handle_IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote): NCollection_Array1_handle_IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESDimen_GeneralNote): NCollection_Array1_handle_IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.First (method)
  First(): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.ChangeFirst (method)
  ChangeFirst(): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Last (method)
  Last(): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.ChangeLast (method)
  ChangeLast(): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Value (method)
  Value(theIndex: number): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.ChangeValue (method)
  ChangeValue(theIndex: number): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.At (method)
  At(theIndex: number): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.ChangeAt (method)
  ChangeAt(theIndex: number): IGESDimen_GeneralNote;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.SetValue (method)
  SetValue(theIndex: number, theItem: IGESDimen_GeneralNote): void;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESDimen_GeneralNote.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESDimen_LeaderArrow: declare class NCollection_Array1_handle_IGESDimen_LeaderArrow

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESDimen_LeaderArrow, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESDimen_LeaderArrow, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Init (method)
  Init(theValue: IGESDimen_LeaderArrow): void;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow): NCollection_Array1_handle_IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow): NCollection_Array1_handle_IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESDimen_LeaderArrow): NCollection_Array1_handle_IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.First (method)
  First(): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.ChangeFirst (method)
  ChangeFirst(): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Last (method)
  Last(): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.ChangeLast (method)
  ChangeLast(): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Value (method)
  Value(theIndex: number): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.ChangeValue (method)
  ChangeValue(theIndex: number): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.At (method)
  At(theIndex: number): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.ChangeAt (method)
  ChangeAt(theIndex: number): IGESDimen_LeaderArrow;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.SetValue (method)
  SetValue(theIndex: number, theItem: IGESDimen_LeaderArrow): void;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESDimen_LeaderArrow.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESDraw_ConnectPoint: declare class NCollection_Array1_handle_IGESDraw_ConnectPoint

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: unknown);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESDraw_ConnectPoint, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESDraw_ConnectPoint, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Init (method)
  Init(theValue: IGESDraw_ConnectPoint): void;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.CopyValues (method)
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Move (method)
  Move(theOther: unknown): unknown;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.First (method)
  First(): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.ChangeFirst (method)
  ChangeFirst(): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Last (method)
  Last(): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.ChangeLast (method)
  ChangeLast(): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Value (method)
  Value(theIndex: number): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.ChangeValue (method)
  ChangeValue(theIndex: number): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.At (method)
  At(theIndex: number): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.ChangeAt (method)
  ChangeAt(theIndex: number): IGESDraw_ConnectPoint;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.SetValue (method)
  SetValue(theIndex: number, theItem: IGESDraw_ConnectPoint): void;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESDraw_ConnectPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESGeom_Boundary: declare class NCollection_Array1_handle_IGESGeom_Boundary

  // NCollection_Array1_handle_IGESGeom_Boundary.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESGeom_Boundary);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESGeom_Boundary, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESGeom_Boundary, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESGeom_Boundary.Init (method)
  Init(theValue: IGESGeom_Boundary): void;

  // NCollection_Array1_handle_IGESGeom_Boundary.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESGeom_Boundary.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESGeom_Boundary.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESGeom_Boundary.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESGeom_Boundary.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESGeom_Boundary.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESGeom_Boundary): NCollection_Array1_handle_IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESGeom_Boundary): NCollection_Array1_handle_IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESGeom_Boundary): NCollection_Array1_handle_IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.First (method)
  First(): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.ChangeFirst (method)
  ChangeFirst(): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.Last (method)
  Last(): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.ChangeLast (method)
  ChangeLast(): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.Value (method)
  Value(theIndex: number): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.ChangeValue (method)
  ChangeValue(theIndex: number): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.At (method)
  At(theIndex: number): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.ChangeAt (method)
  ChangeAt(theIndex: number): IGESGeom_Boundary;

  // NCollection_Array1_handle_IGESGeom_Boundary.SetValue (method)
  SetValue(theIndex: number, theItem: IGESGeom_Boundary): void;

  // NCollection_Array1_handle_IGESGeom_Boundary.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESGeom_Boundary.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESGeom_Boundary.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESGeom_Boundary.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESGeom_Boundary.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESGeom_Boundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESGeom_CurveOnSurface: declare class NCollection_Array1_handle_IGESGeom_CurveOnSurface

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESGeom_CurveOnSurface, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESGeom_CurveOnSurface, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Init (method)
  Init(theValue: IGESGeom_CurveOnSurface): void;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface): NCollection_Array1_handle_IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface): NCollection_Array1_handle_IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface): NCollection_Array1_handle_IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.First (method)
  First(): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.ChangeFirst (method)
  ChangeFirst(): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Last (method)
  Last(): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.ChangeLast (method)
  ChangeLast(): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Value (method)
  Value(theIndex: number): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.ChangeValue (method)
  ChangeValue(theIndex: number): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.At (method)
  At(theIndex: number): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.ChangeAt (method)
  ChangeAt(theIndex: number): IGESGeom_CurveOnSurface;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.SetValue (method)
  SetValue(theIndex: number, theItem: IGESGeom_CurveOnSurface): void;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESGeom_CurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESGeom_TransformationMatrix: declare class NCollection_Array1_handle_IGESGeom_TransformationMatrix

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESGeom_TransformationMatrix, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESGeom_TransformationMatrix, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Init (method)
  Init(theValue: IGESGeom_TransformationMatrix): void;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix): NCollection_Array1_handle_IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix): NCollection_Array1_handle_IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix): NCollection_Array1_handle_IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.First (method)
  First(): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.ChangeFirst (method)
  ChangeFirst(): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Last (method)
  Last(): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.ChangeLast (method)
  ChangeLast(): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Value (method)
  Value(theIndex: number): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.ChangeValue (method)
  ChangeValue(theIndex: number): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.At (method)
  At(theIndex: number): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.ChangeAt (method)
  ChangeAt(theIndex: number): IGESGeom_TransformationMatrix;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.SetValue (method)
  SetValue(theIndex: number, theItem: IGESGeom_TransformationMatrix): void;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESGeom_TransformationMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESGraph_Color: declare class NCollection_Array1_handle_IGESGraph_Color

  // NCollection_Array1_handle_IGESGraph_Color.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESGraph_Color);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESGraph_Color, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESGraph_Color, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESGraph_Color.Init (method)
  Init(theValue: IGESGraph_Color): void;

  // NCollection_Array1_handle_IGESGraph_Color.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESGraph_Color.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESGraph_Color.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESGraph_Color.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESGraph_Color.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESGraph_Color.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESGraph_Color): NCollection_Array1_handle_IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESGraph_Color): NCollection_Array1_handle_IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESGraph_Color): NCollection_Array1_handle_IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.First (method)
  First(): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.ChangeFirst (method)
  ChangeFirst(): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.Last (method)
  Last(): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.ChangeLast (method)
  ChangeLast(): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.Value (method)
  Value(theIndex: number): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.ChangeValue (method)
  ChangeValue(theIndex: number): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.At (method)
  At(theIndex: number): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.ChangeAt (method)
  ChangeAt(theIndex: number): IGESGraph_Color;

  // NCollection_Array1_handle_IGESGraph_Color.SetValue (method)
  SetValue(theIndex: number, theItem: IGESGraph_Color): void;

  // NCollection_Array1_handle_IGESGraph_Color.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESGraph_Color.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESGraph_Color.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESGraph_Color.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESGraph_Color.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESGraph_Color.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_handle_IGESGraph_TextDisplayTemplate: declare class NCollection_Array1_handle_IGESGraph_TextDisplayTemplate

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: IGESGraph_TextDisplayTemplate, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: IGESGraph_TextDisplayTemplate, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Init (method)
  Init(theValue: IGESGraph_TextDisplayTemplate): void;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Size (method)
  Size(): number;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Length (method)
  Length(): number;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Lower (method)
  Lower(): number;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Upper (method)
  Upper(): number;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Assign (method)
  Assign(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate): NCollection_Array1_handle_IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate): NCollection_Array1_handle_IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Move (method)
  Move(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate): NCollection_Array1_handle_IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.First (method)
  First(): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.ChangeFirst (method)
  ChangeFirst(): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Last (method)
  Last(): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.ChangeLast (method)
  ChangeLast(): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Value (method)
  Value(theIndex: number): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.ChangeValue (method)
  ChangeValue(theIndex: number): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.At (method)
  At(theIndex: number): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.ChangeAt (method)
  ChangeAt(theIndex: number): IGESGraph_TextDisplayTemplate;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.SetValue (method)
  SetValue(theIndex: number, theItem: IGESGraph_TextDisplayTemplate): void;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.delete (method)
  delete(): void;

  // NCollection_Array1_handle_IGESGraph_TextDisplayTemplate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
