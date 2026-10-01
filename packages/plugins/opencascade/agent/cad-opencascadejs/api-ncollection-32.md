# libcascade — NCollection (32)

50 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_TDF_Attribute: declare class NCollection_Sequence_handle_TDF_Attribute extends NCollection_BaseSequence

  // NCollection_Sequence_handle_TDF_Attribute.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_TDF_Attribute);

  // NCollection_Sequence_handle_TDF_Attribute.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_TDF_Attribute.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_TDF_Attribute.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_TDF_Attribute.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_TDF_Attribute.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_TDF_Attribute.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_TDF_Attribute.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_TDF_Attribute): NCollection_Sequence_handle_TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_TDF_Attribute.Append (method)
  Append(theItem: TDF_Attribute): void;
  Append(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  // NCollection_Sequence_handle_TDF_Attribute.Prepend (method)
  Prepend(theItem: TDF_Attribute): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  // NCollection_Sequence_handle_TDF_Attribute.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TDF_Attribute): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  // NCollection_Sequence_handle_TDF_Attribute.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
  InsertAfter(theIndex: number, theItem: TDF_Attribute): void;

  // NCollection_Sequence_handle_TDF_Attribute.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  // NCollection_Sequence_handle_TDF_Attribute.First (method)
  First(): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.ChangeFirst (method)
  ChangeFirst(): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.Last (method)
  Last(): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.ChangeLast (method)
  ChangeLast(): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.Value (method)
  Value(theIndex: number): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.ChangeValue (method)
  ChangeValue(theIndex: number): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.SetValue (method)
  SetValue(theIndex: number, theItem: TDF_Attribute): void;

  // NCollection_Sequence_handle_TDF_Attribute.At (method)
  At(theIndex: number): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.ChangeAt (method)
  ChangeAt(theIndex: number): TDF_Attribute;

  // NCollection_Sequence_handle_TDF_Attribute.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_TDF_Attribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_TDocStd_ApplicationDelta: declare class NCollection_Sequence_handle_TDocStd_ApplicationDelta extends NCollection_BaseSequence

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_TDocStd_ApplicationDelta);

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_TDocStd_ApplicationDelta): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Append (method)
  Append(theItem: TDocStd_ApplicationDelta): void;
  Append(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Prepend (method)
  Prepend(theItem: TDocStd_ApplicationDelta): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
  InsertAfter(theIndex: number, theItem: TDocStd_ApplicationDelta): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.First (method)
  First(): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.ChangeFirst (method)
  ChangeFirst(): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Last (method)
  Last(): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.ChangeLast (method)
  ChangeLast(): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.Value (method)
  Value(theIndex: number): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.ChangeValue (method)
  ChangeValue(theIndex: number): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.SetValue (method)
  SetValue(theIndex: number, theItem: TDocStd_ApplicationDelta): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.At (method)
  At(theIndex: number): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.ChangeAt (method)
  ChangeAt(theIndex: number): TDocStd_ApplicationDelta;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_TDocStd_ApplicationDelta.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_TDocStd_Document: declare class NCollection_Sequence_handle_TDocStd_Document extends NCollection_BaseSequence

  // NCollection_Sequence_handle_TDocStd_Document.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_TDocStd_Document);

  // NCollection_Sequence_handle_TDocStd_Document.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_TDocStd_Document.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_TDocStd_Document.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_TDocStd_Document.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_TDocStd_Document.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_TDocStd_Document.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_TDocStd_Document.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_TDocStd_Document): NCollection_Sequence_handle_TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_TDocStd_Document.Append (method)
  Append(theItem: TDocStd_Document): void;
  Append(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  // NCollection_Sequence_handle_TDocStd_Document.Prepend (method)
  Prepend(theItem: TDocStd_Document): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  // NCollection_Sequence_handle_TDocStd_Document.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: TDocStd_Document): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  // NCollection_Sequence_handle_TDocStd_Document.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
  InsertAfter(theIndex: number, theItem: TDocStd_Document): void;

  // NCollection_Sequence_handle_TDocStd_Document.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  // NCollection_Sequence_handle_TDocStd_Document.First (method)
  First(): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.ChangeFirst (method)
  ChangeFirst(): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.Last (method)
  Last(): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.ChangeLast (method)
  ChangeLast(): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.Value (method)
  Value(theIndex: number): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.ChangeValue (method)
  ChangeValue(theIndex: number): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.SetValue (method)
  SetValue(theIndex: number, theItem: TDocStd_Document): void;

  // NCollection_Sequence_handle_TDocStd_Document.At (method)
  At(theIndex: number): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.ChangeAt (method)
  ChangeAt(theIndex: number): TDocStd_Document;

  // NCollection_Sequence_handle_TDocStd_Document.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_TDocStd_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Transfer_Finder: declare class NCollection_Sequence_handle_Transfer_Finder extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Transfer_Finder.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Transfer_Finder);

  // NCollection_Sequence_handle_Transfer_Finder.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Transfer_Finder.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Transfer_Finder.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Transfer_Finder.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Transfer_Finder.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Transfer_Finder.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Transfer_Finder.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Transfer_Finder): NCollection_Sequence_handle_Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Transfer_Finder.Append (method)
  Append(theItem: Transfer_Finder): void;
  Append(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  // NCollection_Sequence_handle_Transfer_Finder.Prepend (method)
  Prepend(theItem: Transfer_Finder): void;
  Prepend(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  // NCollection_Sequence_handle_Transfer_Finder.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Transfer_Finder): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  // NCollection_Sequence_handle_Transfer_Finder.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
  InsertAfter(theIndex: number, theItem: Transfer_Finder): void;

  // NCollection_Sequence_handle_Transfer_Finder.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  // NCollection_Sequence_handle_Transfer_Finder.First (method)
  First(): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.ChangeFirst (method)
  ChangeFirst(): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.Last (method)
  Last(): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.ChangeLast (method)
  ChangeLast(): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.Value (method)
  Value(theIndex: number): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.ChangeValue (method)
  ChangeValue(theIndex: number): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.SetValue (method)
  SetValue(theIndex: number, theItem: Transfer_Finder): void;

  // NCollection_Sequence_handle_Transfer_Finder.At (method)
  At(theIndex: number): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.ChangeAt (method)
  ChangeAt(theIndex: number): Transfer_Finder;

  // NCollection_Sequence_handle_Transfer_Finder.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Transfer_Finder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Units_Quantity: declare class NCollection_Sequence_handle_Units_Quantity extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Units_Quantity.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Units_Quantity);

  // NCollection_Sequence_handle_Units_Quantity.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Units_Quantity.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Units_Quantity.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Units_Quantity.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Units_Quantity.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Units_Quantity.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Units_Quantity.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Units_Quantity): NCollection_Sequence_handle_Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Units_Quantity.Append (method)
  Append(theItem: Units_Quantity): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  // NCollection_Sequence_handle_Units_Quantity.Prepend (method)
  Prepend(theItem: Units_Quantity): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  // NCollection_Sequence_handle_Units_Quantity.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Units_Quantity): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  // NCollection_Sequence_handle_Units_Quantity.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
  InsertAfter(theIndex: number, theItem: Units_Quantity): void;

  // NCollection_Sequence_handle_Units_Quantity.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  // NCollection_Sequence_handle_Units_Quantity.First (method)
  First(): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.ChangeFirst (method)
  ChangeFirst(): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.Last (method)
  Last(): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.ChangeLast (method)
  ChangeLast(): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.Value (method)
  Value(theIndex: number): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.ChangeValue (method)
  ChangeValue(theIndex: number): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.SetValue (method)
  SetValue(theIndex: number, theItem: Units_Quantity): void;

  // NCollection_Sequence_handle_Units_Quantity.At (method)
  At(theIndex: number): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.ChangeAt (method)
  ChangeAt(theIndex: number): Units_Quantity;

  // NCollection_Sequence_handle_Units_Quantity.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Units_Quantity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Units_Token: declare class NCollection_Sequence_handle_Units_Token extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Units_Token.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Units_Token);

  // NCollection_Sequence_handle_Units_Token.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Units_Token.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Units_Token.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Units_Token.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Units_Token.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Units_Token.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Units_Token.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Units_Token): NCollection_Sequence_handle_Units_Token;

  // NCollection_Sequence_handle_Units_Token.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Units_Token.Append (method)
  Append(theItem: Units_Token): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Token): void;

  // NCollection_Sequence_handle_Units_Token.Prepend (method)
  Prepend(theItem: Units_Token): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Token): void;

  // NCollection_Sequence_handle_Units_Token.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Units_Token): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;

  // NCollection_Sequence_handle_Units_Token.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
  InsertAfter(theIndex: number, theItem: Units_Token): void;

  // NCollection_Sequence_handle_Units_Token.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;

  // NCollection_Sequence_handle_Units_Token.First (method)
  First(): Units_Token;

  // NCollection_Sequence_handle_Units_Token.ChangeFirst (method)
  ChangeFirst(): Units_Token;

  // NCollection_Sequence_handle_Units_Token.Last (method)
  Last(): Units_Token;

  // NCollection_Sequence_handle_Units_Token.ChangeLast (method)
  ChangeLast(): Units_Token;

  // NCollection_Sequence_handle_Units_Token.Value (method)
  Value(theIndex: number): Units_Token;

  // NCollection_Sequence_handle_Units_Token.ChangeValue (method)
  ChangeValue(theIndex: number): Units_Token;

  // NCollection_Sequence_handle_Units_Token.SetValue (method)
  SetValue(theIndex: number, theItem: Units_Token): void;

  // NCollection_Sequence_handle_Units_Token.At (method)
  At(theIndex: number): Units_Token;

  // NCollection_Sequence_handle_Units_Token.ChangeAt (method)
  ChangeAt(theIndex: number): Units_Token;

  // NCollection_Sequence_handle_Units_Token.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Units_Token.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_Units_Unit: declare class NCollection_Sequence_handle_Units_Unit extends NCollection_BaseSequence

  // NCollection_Sequence_handle_Units_Unit.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_Units_Unit);

  // NCollection_Sequence_handle_Units_Unit.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_Units_Unit.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_Units_Unit.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_Units_Unit.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_Units_Unit.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_Units_Unit.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_Units_Unit.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_Units_Unit): NCollection_Sequence_handle_Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_Units_Unit.Append (method)
  Append(theItem: Units_Unit): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Unit): void;

  // NCollection_Sequence_handle_Units_Unit.Prepend (method)
  Prepend(theItem: Units_Unit): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Unit): void;

  // NCollection_Sequence_handle_Units_Unit.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: Units_Unit): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;

  // NCollection_Sequence_handle_Units_Unit.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
  InsertAfter(theIndex: number, theItem: Units_Unit): void;

  // NCollection_Sequence_handle_Units_Unit.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;

  // NCollection_Sequence_handle_Units_Unit.First (method)
  First(): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.ChangeFirst (method)
  ChangeFirst(): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.Last (method)
  Last(): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.ChangeLast (method)
  ChangeLast(): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.Value (method)
  Value(theIndex: number): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.ChangeValue (method)
  ChangeValue(theIndex: number): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.SetValue (method)
  SetValue(theIndex: number, theItem: Units_Unit): void;

  // NCollection_Sequence_handle_Units_Unit.At (method)
  At(theIndex: number): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.ChangeAt (method)
  ChangeAt(theIndex: number): Units_Unit;

  // NCollection_Sequence_handle_Units_Unit.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_Units_Unit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject extends NCollection_BaseSequence

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject);

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Append (method)
  Append(theItem: XCAFDimTolObjects_DatumObject): void;
  Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Prepend (method)
  Prepend(theItem: XCAFDimTolObjects_DatumObject): void;
  Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.First (method)
  First(): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.ChangeFirst (method)
  ChangeFirst(): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Last (method)
  Last(): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.ChangeLast (method)
  ChangeLast(): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.Value (method)
  Value(theIndex: number): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.ChangeValue (method)
  ChangeValue(theIndex: number): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.SetValue (method)
  SetValue(theIndex: number, theItem: XCAFDimTolObjects_DatumObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.At (method)
  At(theIndex: number): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.ChangeAt (method)
  ChangeAt(theIndex: number): XCAFDimTolObjects_DatumObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject extends NCollection_BaseSequence

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject);

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Append (method)
  Append(theItem: XCAFDimTolObjects_DimensionObject): void;
  Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Prepend (method)
  Prepend(theItem: XCAFDimTolObjects_DimensionObject): void;
  Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.First (method)
  First(): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.ChangeFirst (method)
  ChangeFirst(): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Last (method)
  Last(): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.ChangeLast (method)
  ChangeLast(): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.Value (method)
  Value(theIndex: number): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.ChangeValue (method)
  ChangeValue(theIndex: number): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.SetValue (method)
  SetValue(theIndex: number, theItem: XCAFDimTolObjects_DimensionObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.At (method)
  At(theIndex: number): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.ChangeAt (method)
  ChangeAt(theIndex: number): XCAFDimTolObjects_DimensionObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject: declare class NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject extends NCollection_BaseSequence

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject);

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Upper (method)
  Upper(): number;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Assign (method)
  Assign(theOther: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Append (method)
  Append(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
  Append(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Prepend (method)
  Prepend(theItem: XCAFDimTolObjects_GeomToleranceObject): void;
  Prepend(theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;
  InsertAfter(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.First (method)
  First(): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.ChangeFirst (method)
  ChangeFirst(): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Last (method)
  Last(): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.ChangeLast (method)
  ChangeLast(): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.Value (method)
  Value(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.ChangeValue (method)
  ChangeValue(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.SetValue (method)
  SetValue(theIndex: number, theItem: XCAFDimTolObjects_GeomToleranceObject): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.At (method)
  At(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.ChangeAt (method)
  ChangeAt(theIndex: number): XCAFDimTolObjects_GeomToleranceObject;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.delete (method)
  delete(): void;

  // NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Sequence_int: declare class NCollection_Sequence_int extends NCollection_BaseSequence

  // NCollection_Sequence_int.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: NCollection_Sequence_int);

  // NCollection_Sequence_int.Lower (method)
  static Lower(): number;

  // NCollection_Sequence_int.Upper (method)
  Upper(): number;

  // NCollection_Sequence_int.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Sequence_int.Reverse (method)
  Reverse(): void;

  // NCollection_Sequence_int.Exchange (method)
  Exchange(I: number, J: number): void;

  // NCollection_Sequence_int.Clear (method)
  Clear(theAllocator?: NCollection_BaseAllocator): void;

  // NCollection_Sequence_int.Assign (method)
  Assign(theOther: NCollection_Sequence_int): NCollection_Sequence_int;

  // NCollection_Sequence_int.Remove (method)
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  // NCollection_Sequence_int.Append (method)
  Append(theItem: number): void;
  Append(theSeq: NCollection_Sequence_int): void;

  // NCollection_Sequence_int.Prepend (method)
  Prepend(theItem: number): void;
  Prepend(theSeq: NCollection_Sequence_int): void;

  // NCollection_Sequence_int.InsertBefore (method)
  InsertBefore(theIndex: number, theItem: number): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_int): void;

  // NCollection_Sequence_int.InsertAfter (method)
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_int): void;
  InsertAfter(theIndex: number, theItem: number): void;

  // NCollection_Sequence_int.Split (method)
  Split(theIndex: number, theSeq: NCollection_Sequence_int): void;

  // NCollection_Sequence_int.First (method)
  First(): number;

  // NCollection_Sequence_int.ChangeFirst (method)
  ChangeFirst(): number;

  // NCollection_Sequence_int.Last (method)
  Last(): number;

  // NCollection_Sequence_int.ChangeLast (method)
  ChangeLast(): number;

  // NCollection_Sequence_int.Value (method)
  Value(theIndex: number): number;

  // NCollection_Sequence_int.ChangeValue (method)
  ChangeValue(theIndex: number): number;

  // NCollection_Sequence_int.SetValue (method)
  SetValue(theIndex: number, theItem: number): void;

  // NCollection_Sequence_int.At (method)
  At(theIndex: number): number;

  // NCollection_Sequence_int.ChangeAt (method)
  ChangeAt(theIndex: number): number;

  // NCollection_Sequence_int.delete (method)
  delete(): void;

  // NCollection_Sequence_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void: declare class NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void extends Standard_Transient

  // NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void.constructor (constructor)
  constructor();

  // NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void.delete (method)
  delete(): void;

  // NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void: declare class NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void extends Standard_Transient

  // NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void.constructor (constructor)
  constructor();

  // NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void.delete (method)
  delete(): void;

  // NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Shared_Standard_Mutex_void: declare class NCollection_Shared_Standard_Mutex_void extends Standard_Transient

  // NCollection_Shared_Standard_Mutex_void.constructor (constructor)
  constructor();

  // NCollection_Shared_Standard_Mutex_void.delete (method)
  delete(): void;

  // NCollection_Shared_Standard_Mutex_void.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_TListIterator_HLRAlgo_Interference: declare class NCollection_TListIterator_HLRAlgo_Interference extends NCollection_BaseList_Iterator

  // NCollection_TListIterator_HLRAlgo_Interference.constructor (constructor)
  constructor();
  constructor(theList: NCollection_BaseList);

  // NCollection_TListIterator_HLRAlgo_Interference.More (method)
  More(): boolean;

  // NCollection_TListIterator_HLRAlgo_Interference.Next (method)
  Next(): void;

  // NCollection_TListIterator_HLRAlgo_Interference.Value (method)
  Value(): HLRAlgo_Interference;

  // NCollection_TListIterator_HLRAlgo_Interference.ChangeValue (method)
  ChangeValue(): HLRAlgo_Interference;

  // NCollection_TListIterator_HLRAlgo_Interference.delete (method)
  delete(): void;

  // NCollection_TListIterator_HLRAlgo_Interference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_NodeId_Typed_BRepGraph_NodeId_Kind_CoEdge: NCollection_Array1_BRepGraph_CoEdgeId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Child: NCollection_Array1_BRepGraph_ChildRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Face: NCollection_Array1_BRepGraph_FaceRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Occurrence: NCollection_Array1_BRepGraph_OccurrenceRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Shell: NCollection_Array1_BRepGraph_ShellRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Solid: NCollection_Array1_BRepGraph_SolidRefId

NCollection_Array1_BRepGraph_RefId_Typed_BRepGraph_RefId_Kind_Wire: NCollection_Array1_BRepGraph_WireRefId

NCollection_Array1_TFunction_DataMapOfGUIDDriver: NCollection_Array1_int

NCollection_Array1_TopOpeBRepDS_DataMapOfIntegerListOfInterference: NCollection_Array1_int

NCollection_Array1_handle_StepElement_HSequenceOfCurveElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

NCollection_Array1_handle_StepElement_HSequenceOfSurfaceElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

NCollection_Array1_uint8_t: NCollection_Array1_unsignedchar

NCollection_Array2_handle_TColStd_HArray1OfInteger: NCollection_Array2_handle_NCollection_HArray1_int

NCollection_Array2_handle_TColStd_HArray1OfReal: NCollection_Array2_handle_NCollection_HArray1_double

NCollection_DataMap_TCollection_ExtendedString_unsignedchar: NCollection_DataMap_TCollection_ExtendedString_uint8_t

NCollection_DataMap_TopoDS_Shape_Message_ListOfMsg_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher

NCollection_DataMap_TopoDS_Shape_TColStd_ListOfReal_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher

NCollection_DataMap_TopoDS_Shape_TopTools_ListOfShape_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

NCollection_DataMap_TopoDS_Shape_handle_TopTools_HArray2OfShape_TopTools_ShapeMapHasher: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher

NCollection_HArray1_TFunction_DataMapOfGUIDDriver: NCollection_HArray1_int

NCollection_HArray1_TopOpeBRepDS_DataMapOfIntegerListOfInterference: NCollection_HArray1_int

NCollection_HArray1_handle_StepElement_HSequenceOfCurveElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

NCollection_HArray1_handle_StepElement_HSequenceOfSurfaceElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

NCollection_HArray1_uint8_t: NCollection_HArray1_unsignedchar

NCollection_HArray2_handle_TColStd_HArray1OfInteger: NCollection_HArray2_handle_NCollection_HArray1_int

NCollection_HArray2_handle_TColStd_HArray1OfReal: NCollection_HArray2_handle_NCollection_HArray1_double

NCollection_HSequence_handle_TColgp_HSequenceOfPnt: NCollection_HSequence_handle_NCollection_HSequence_gp_Pnt

NCollection_IndexedDataMap_TopoDS_Shape_TopTools_ListOfShape_TopTools_ShapeMapHasher: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

NCollection_List_TopTools_ListOfShape: NCollection_List_NCollection_List_TopoDS_Shape

NCollection_List_unsignedchar: NCollection_List_uint8_t

NCollection_Sequence_TColGeom2d_SequenceOfGeometry: NCollection_Sequence_NCollection_Sequence_handle_Geom2d_Geometry

NCollection_Sequence_handle_TColgp_HSequenceOfPnt: NCollection_Sequence_handle_NCollection_HSequence_gp_Pnt

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void

NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void

NCollection_Shared_Standard_Mutex: NCollection_Shared_Standard_Mutex_void
