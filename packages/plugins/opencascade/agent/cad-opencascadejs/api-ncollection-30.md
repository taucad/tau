# libcascade — NCollection (30)

11 top-level symbols. Signatures are verbatim typescript.

NCollection_Sequence_handle_StepFEA_ElementRepresentation: declare class NCollection_Sequence_handle_StepFEA_ElementRepresentation extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_StepFEA_ElementRepresentation): NCollection_Sequence_handle_StepFEA_ElementRepresentation;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: StepFEA_ElementRepresentation): void;
  Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
  Append(theItem: StepFEA_ElementRepresentation): void;
  Append(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  Prepend(theItem: StepFEA_ElementRepresentation): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
  Prepend(theItem: StepFEA_ElementRepresentation): void;
  Prepend(theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  InsertBefore(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
  InsertBefore(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
  InsertAfter(theIndex: number, theItem: StepFEA_ElementRepresentation): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;
  InsertAfter(theIndex: number, theItem: StepFEA_ElementRepresentation): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_StepFEA_ElementRepresentation): void;

  First(): StepFEA_ElementRepresentation;

  ChangeFirst(): StepFEA_ElementRepresentation;

  Last(): StepFEA_ElementRepresentation;

  ChangeLast(): StepFEA_ElementRepresentation;

  Value(theIndex: number): StepFEA_ElementRepresentation;

  ChangeValue(theIndex: number): StepFEA_ElementRepresentation;

  SetValue(theIndex: number, theItem: StepFEA_ElementRepresentation): void;

  At(theIndex: number): StepFEA_ElementRepresentation;

  ChangeAt(theIndex: number): StepFEA_ElementRepresentation;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Storage_Root: declare class NCollection_Sequence_handle_Storage_Root extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Storage_Root): NCollection_Sequence_handle_Storage_Root;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Storage_Root): void;
  Append(theSeq: NCollection_Sequence_handle_Storage_Root): void;
  Append(theItem: Storage_Root): void;
  Append(theSeq: NCollection_Sequence_handle_Storage_Root): void;

  Prepend(theItem: Storage_Root): void;
  Prepend(theSeq: NCollection_Sequence_handle_Storage_Root): void;
  Prepend(theItem: Storage_Root): void;
  Prepend(theSeq: NCollection_Sequence_handle_Storage_Root): void;

  InsertBefore(theIndex: number, theItem: Storage_Root): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
  InsertBefore(theIndex: number, theItem: Storage_Root): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
  InsertAfter(theIndex: number, theItem: Storage_Root): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;
  InsertAfter(theIndex: number, theItem: Storage_Root): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Storage_Root): void;

  First(): Storage_Root;

  ChangeFirst(): Storage_Root;

  Last(): Storage_Root;

  ChangeLast(): Storage_Root;

  Value(theIndex: number): Storage_Root;

  ChangeValue(theIndex: number): Storage_Root;

  SetValue(theIndex: number, theItem: Storage_Root): void;

  At(theIndex: number): Storage_Root;

  ChangeAt(theIndex: number): Storage_Root;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_TCollection_HAsciiString: declare class NCollection_Sequence_handle_TCollection_HAsciiString extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_TCollection_HAsciiString): NCollection_Sequence_handle_TCollection_HAsciiString;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: TCollection_HAsciiString): void;
  Append(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  Append(theItem: TCollection_HAsciiString): void;
  Append(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  Prepend(theItem: TCollection_HAsciiString): void;
  Prepend(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  Prepend(theItem: TCollection_HAsciiString): void;
  Prepend(theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  InsertBefore(theIndex: number, theItem: TCollection_HAsciiString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  InsertBefore(theIndex: number, theItem: TCollection_HAsciiString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  InsertAfter(theIndex: number, theItem: TCollection_HAsciiString): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;
  InsertAfter(theIndex: number, theItem: TCollection_HAsciiString): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  First(): TCollection_HAsciiString;

  ChangeFirst(): TCollection_HAsciiString;

  Last(): TCollection_HAsciiString;

  ChangeLast(): TCollection_HAsciiString;

  Value(theIndex: number): TCollection_HAsciiString;

  ChangeValue(theIndex: number): TCollection_HAsciiString;

  SetValue(theIndex: number, theItem: TCollection_HAsciiString): void;

  At(theIndex: number): TCollection_HAsciiString;

  ChangeAt(theIndex: number): TCollection_HAsciiString;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_TCollection_HExtendedString: declare class NCollection_Sequence_handle_TCollection_HExtendedString extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_TCollection_HExtendedString): NCollection_Sequence_handle_TCollection_HExtendedString;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: TCollection_HExtendedString): void;
  Append(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
  Append(theItem: TCollection_HExtendedString): void;
  Append(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  Prepend(theItem: TCollection_HExtendedString): void;
  Prepend(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
  Prepend(theItem: TCollection_HExtendedString): void;
  Prepend(theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  InsertBefore(theIndex: number, theItem: TCollection_HExtendedString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
  InsertBefore(theIndex: number, theItem: TCollection_HExtendedString): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
  InsertAfter(theIndex: number, theItem: TCollection_HExtendedString): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;
  InsertAfter(theIndex: number, theItem: TCollection_HExtendedString): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TCollection_HExtendedString): void;

  First(): TCollection_HExtendedString;

  ChangeFirst(): TCollection_HExtendedString;

  Last(): TCollection_HExtendedString;

  ChangeLast(): TCollection_HExtendedString;

  Value(theIndex: number): TCollection_HExtendedString;

  ChangeValue(theIndex: number): TCollection_HExtendedString;

  SetValue(theIndex: number, theItem: TCollection_HExtendedString): void;

  At(theIndex: number): TCollection_HExtendedString;

  ChangeAt(theIndex: number): TCollection_HExtendedString;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_TDF_Attribute: declare class NCollection_Sequence_handle_TDF_Attribute extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_TDF_Attribute): NCollection_Sequence_handle_TDF_Attribute;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: TDF_Attribute): void;
  Append(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
  Append(theItem: TDF_Attribute): void;
  Append(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  Prepend(theItem: TDF_Attribute): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
  Prepend(theItem: TDF_Attribute): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  InsertBefore(theIndex: number, theItem: TDF_Attribute): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
  InsertBefore(theIndex: number, theItem: TDF_Attribute): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
  InsertAfter(theIndex: number, theItem: TDF_Attribute): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;
  InsertAfter(theIndex: number, theItem: TDF_Attribute): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDF_Attribute): void;

  First(): TDF_Attribute;

  ChangeFirst(): TDF_Attribute;

  Last(): TDF_Attribute;

  ChangeLast(): TDF_Attribute;

  Value(theIndex: number): TDF_Attribute;

  ChangeValue(theIndex: number): TDF_Attribute;

  SetValue(theIndex: number, theItem: TDF_Attribute): void;

  At(theIndex: number): TDF_Attribute;

  ChangeAt(theIndex: number): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_TDocStd_ApplicationDelta: declare class NCollection_Sequence_handle_TDocStd_ApplicationDelta extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_TDocStd_ApplicationDelta): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: TDocStd_ApplicationDelta): void;
  Append(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
  Append(theItem: TDocStd_ApplicationDelta): void;
  Append(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  Prepend(theItem: TDocStd_ApplicationDelta): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
  Prepend(theItem: TDocStd_ApplicationDelta): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  InsertBefore(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
  InsertBefore(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
  InsertAfter(theIndex: number, theItem: TDocStd_ApplicationDelta): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;
  InsertAfter(theIndex: number, theItem: TDocStd_ApplicationDelta): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_ApplicationDelta): void;

  First(): TDocStd_ApplicationDelta;

  ChangeFirst(): TDocStd_ApplicationDelta;

  Last(): TDocStd_ApplicationDelta;

  ChangeLast(): TDocStd_ApplicationDelta;

  Value(theIndex: number): TDocStd_ApplicationDelta;

  ChangeValue(theIndex: number): TDocStd_ApplicationDelta;

  SetValue(theIndex: number, theItem: TDocStd_ApplicationDelta): void;

  At(theIndex: number): TDocStd_ApplicationDelta;

  ChangeAt(theIndex: number): TDocStd_ApplicationDelta;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_TDocStd_Document: declare class NCollection_Sequence_handle_TDocStd_Document extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_TDocStd_Document): NCollection_Sequence_handle_TDocStd_Document;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: TDocStd_Document): void;
  Append(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
  Append(theItem: TDocStd_Document): void;
  Append(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  Prepend(theItem: TDocStd_Document): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
  Prepend(theItem: TDocStd_Document): void;
  Prepend(theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  InsertBefore(theIndex: number, theItem: TDocStd_Document): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
  InsertBefore(theIndex: number, theItem: TDocStd_Document): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
  InsertAfter(theIndex: number, theItem: TDocStd_Document): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;
  InsertAfter(theIndex: number, theItem: TDocStd_Document): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_TDocStd_Document): void;

  First(): TDocStd_Document;

  ChangeFirst(): TDocStd_Document;

  Last(): TDocStd_Document;

  ChangeLast(): TDocStd_Document;

  Value(theIndex: number): TDocStd_Document;

  ChangeValue(theIndex: number): TDocStd_Document;

  SetValue(theIndex: number, theItem: TDocStd_Document): void;

  At(theIndex: number): TDocStd_Document;

  ChangeAt(theIndex: number): TDocStd_Document;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Transfer_Finder: declare class NCollection_Sequence_handle_Transfer_Finder extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Transfer_Finder): NCollection_Sequence_handle_Transfer_Finder;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Transfer_Finder): void;
  Append(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
  Append(theItem: Transfer_Finder): void;
  Append(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  Prepend(theItem: Transfer_Finder): void;
  Prepend(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
  Prepend(theItem: Transfer_Finder): void;
  Prepend(theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  InsertBefore(theIndex: number, theItem: Transfer_Finder): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
  InsertBefore(theIndex: number, theItem: Transfer_Finder): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
  InsertAfter(theIndex: number, theItem: Transfer_Finder): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;
  InsertAfter(theIndex: number, theItem: Transfer_Finder): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Transfer_Finder): void;

  First(): Transfer_Finder;

  ChangeFirst(): Transfer_Finder;

  Last(): Transfer_Finder;

  ChangeLast(): Transfer_Finder;

  Value(theIndex: number): Transfer_Finder;

  ChangeValue(theIndex: number): Transfer_Finder;

  SetValue(theIndex: number, theItem: Transfer_Finder): void;

  At(theIndex: number): Transfer_Finder;

  ChangeAt(theIndex: number): Transfer_Finder;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Units_Quantity: declare class NCollection_Sequence_handle_Units_Quantity extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Units_Quantity): NCollection_Sequence_handle_Units_Quantity;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Units_Quantity): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Quantity): void;
  Append(theItem: Units_Quantity): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  Prepend(theItem: Units_Quantity): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Quantity): void;
  Prepend(theItem: Units_Quantity): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  InsertBefore(theIndex: number, theItem: Units_Quantity): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
  InsertBefore(theIndex: number, theItem: Units_Quantity): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
  InsertAfter(theIndex: number, theItem: Units_Quantity): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;
  InsertAfter(theIndex: number, theItem: Units_Quantity): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Quantity): void;

  First(): Units_Quantity;

  ChangeFirst(): Units_Quantity;

  Last(): Units_Quantity;

  ChangeLast(): Units_Quantity;

  Value(theIndex: number): Units_Quantity;

  ChangeValue(theIndex: number): Units_Quantity;

  SetValue(theIndex: number, theItem: Units_Quantity): void;

  At(theIndex: number): Units_Quantity;

  ChangeAt(theIndex: number): Units_Quantity;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Units_Token: declare class NCollection_Sequence_handle_Units_Token extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Units_Token): NCollection_Sequence_handle_Units_Token;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Units_Token): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Token): void;
  Append(theItem: Units_Token): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Token): void;

  Prepend(theItem: Units_Token): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Token): void;
  Prepend(theItem: Units_Token): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Token): void;

  InsertBefore(theIndex: number, theItem: Units_Token): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
  InsertBefore(theIndex: number, theItem: Units_Token): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
  InsertAfter(theIndex: number, theItem: Units_Token): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;
  InsertAfter(theIndex: number, theItem: Units_Token): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Token): void;

  First(): Units_Token;

  ChangeFirst(): Units_Token;

  Last(): Units_Token;

  ChangeLast(): Units_Token;

  Value(theIndex: number): Units_Token;

  ChangeValue(theIndex: number): Units_Token;

  SetValue(theIndex: number, theItem: Units_Token): void;

  At(theIndex: number): Units_Token;

  ChangeAt(theIndex: number): Units_Token;

  delete(): void;

  [Symbol.dispose](): void;

NCollection_Sequence_handle_Units_Unit: declare class NCollection_Sequence_handle_Units_Unit extends NCollection_BaseSequence

  constructor

  static Lower(): number;

  Upper(): number;

  IsEmpty(): boolean;

  Reverse(): void;

  Exchange(I: number, J: number): void;

  Clear(theAllocator?: NCollection_BaseAllocator): void;

  Assign(theOther: NCollection_Sequence_handle_Units_Unit): NCollection_Sequence_handle_Units_Unit;

  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;
  Remove(theIndex: number): void;
  Remove(theFromIndex: number, theToIndex: number): void;

  Append(theItem: Units_Unit): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Unit): void;
  Append(theItem: Units_Unit): void;
  Append(theSeq: NCollection_Sequence_handle_Units_Unit): void;

  Prepend(theItem: Units_Unit): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Unit): void;
  Prepend(theItem: Units_Unit): void;
  Prepend(theSeq: NCollection_Sequence_handle_Units_Unit): void;

  InsertBefore(theIndex: number, theItem: Units_Unit): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
  InsertBefore(theIndex: number, theItem: Units_Unit): void;
  InsertBefore(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;

  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
  InsertAfter(theIndex: number, theItem: Units_Unit): void;
  InsertAfter(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;
  InsertAfter(theIndex: number, theItem: Units_Unit): void;

  Split(theIndex: number, theSeq: NCollection_Sequence_handle_Units_Unit): void;

  First(): Units_Unit;

  ChangeFirst(): Units_Unit;

  Last(): Units_Unit;

  ChangeLast(): Units_Unit;

  Value(theIndex: number): Units_Unit;

  ChangeValue(theIndex: number): Units_Unit;

  SetValue(theIndex: number, theItem: Units_Unit): void;

  At(theIndex: number): Units_Unit;

  ChangeAt(theIndex: number): Units_Unit;

  delete(): void;

  [Symbol.dispose](): void;
