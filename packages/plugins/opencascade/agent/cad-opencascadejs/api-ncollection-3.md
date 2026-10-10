# libcascade — NCollection (3)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Array1_StepAP203_ClassifiedItem: declare class NCollection_Array1_StepAP203_ClassifiedItem

  // NCollection_Array1_StepAP203_ClassifiedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_ClassifiedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_ClassifiedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_ClassifiedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_ClassifiedItem.Init (method)
  Init(theValue: StepAP203_ClassifiedItem): void;

  // NCollection_Array1_StepAP203_ClassifiedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_ClassifiedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_ClassifiedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_ClassifiedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_ClassifiedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_ClassifiedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_ClassifiedItem): NCollection_Array1_StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_ClassifiedItem): NCollection_Array1_StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_ClassifiedItem): NCollection_Array1_StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.First (method)
  First(): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.Last (method)
  Last(): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.ChangeLast (method)
  ChangeLast(): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.Value (method)
  Value(theIndex: number): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.At (method)
  At(theIndex: number): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_ClassifiedItem;

  // NCollection_Array1_StepAP203_ClassifiedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_ClassifiedItem): void;

  // NCollection_Array1_StepAP203_ClassifiedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_ClassifiedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_ClassifiedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_ClassifiedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_ClassifiedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_ClassifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_ContractedItem: declare class NCollection_Array1_StepAP203_ContractedItem

  // NCollection_Array1_StepAP203_ContractedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_ContractedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_ContractedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_ContractedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_ContractedItem.Init (method)
  Init(theValue: StepAP203_ContractedItem): void;

  // NCollection_Array1_StepAP203_ContractedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_ContractedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_ContractedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_ContractedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_ContractedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_ContractedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_ContractedItem): NCollection_Array1_StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_ContractedItem): NCollection_Array1_StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_ContractedItem): NCollection_Array1_StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.First (method)
  First(): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.Last (method)
  Last(): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.ChangeLast (method)
  ChangeLast(): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.Value (method)
  Value(theIndex: number): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.At (method)
  At(theIndex: number): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_ContractedItem;

  // NCollection_Array1_StepAP203_ContractedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_ContractedItem): void;

  // NCollection_Array1_StepAP203_ContractedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_ContractedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_ContractedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_ContractedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_ContractedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_ContractedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_DateTimeItem: declare class NCollection_Array1_StepAP203_DateTimeItem

  // NCollection_Array1_StepAP203_DateTimeItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_DateTimeItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_DateTimeItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_DateTimeItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_DateTimeItem.Init (method)
  Init(theValue: StepAP203_DateTimeItem): void;

  // NCollection_Array1_StepAP203_DateTimeItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_DateTimeItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_DateTimeItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_DateTimeItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_DateTimeItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_DateTimeItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_DateTimeItem): NCollection_Array1_StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_DateTimeItem): NCollection_Array1_StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_DateTimeItem): NCollection_Array1_StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.First (method)
  First(): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.Last (method)
  Last(): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.ChangeLast (method)
  ChangeLast(): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.Value (method)
  Value(theIndex: number): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.At (method)
  At(theIndex: number): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_DateTimeItem;

  // NCollection_Array1_StepAP203_DateTimeItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_DateTimeItem): void;

  // NCollection_Array1_StepAP203_DateTimeItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_DateTimeItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_DateTimeItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_DateTimeItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_DateTimeItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_DateTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_PersonOrganizationItem: declare class NCollection_Array1_StepAP203_PersonOrganizationItem

  // NCollection_Array1_StepAP203_PersonOrganizationItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_PersonOrganizationItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_PersonOrganizationItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Init (method)
  Init(theValue: StepAP203_PersonOrganizationItem): void;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem): NCollection_Array1_StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem): NCollection_Array1_StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem): NCollection_Array1_StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.First (method)
  First(): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Last (method)
  Last(): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.ChangeLast (method)
  ChangeLast(): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Value (method)
  Value(theIndex: number): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.At (method)
  At(theIndex: number): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_PersonOrganizationItem;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_PersonOrganizationItem): void;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_PersonOrganizationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_SpecifiedItem: declare class NCollection_Array1_StepAP203_SpecifiedItem

  // NCollection_Array1_StepAP203_SpecifiedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_SpecifiedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_SpecifiedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_SpecifiedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_SpecifiedItem.Init (method)
  Init(theValue: StepAP203_SpecifiedItem): void;

  // NCollection_Array1_StepAP203_SpecifiedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_SpecifiedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_SpecifiedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_SpecifiedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_SpecifiedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_SpecifiedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_SpecifiedItem): NCollection_Array1_StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_SpecifiedItem): NCollection_Array1_StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_SpecifiedItem): NCollection_Array1_StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.First (method)
  First(): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.Last (method)
  Last(): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.ChangeLast (method)
  ChangeLast(): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.Value (method)
  Value(theIndex: number): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.At (method)
  At(theIndex: number): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_SpecifiedItem;

  // NCollection_Array1_StepAP203_SpecifiedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_SpecifiedItem): void;

  // NCollection_Array1_StepAP203_SpecifiedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_SpecifiedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_SpecifiedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_SpecifiedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_SpecifiedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_SpecifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_StartRequestItem: declare class NCollection_Array1_StepAP203_StartRequestItem

  // NCollection_Array1_StepAP203_StartRequestItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_StartRequestItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_StartRequestItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_StartRequestItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_StartRequestItem.Init (method)
  Init(theValue: StepAP203_StartRequestItem): void;

  // NCollection_Array1_StepAP203_StartRequestItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_StartRequestItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_StartRequestItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_StartRequestItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_StartRequestItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_StartRequestItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_StartRequestItem): NCollection_Array1_StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_StartRequestItem): NCollection_Array1_StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_StartRequestItem): NCollection_Array1_StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.First (method)
  First(): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.Last (method)
  Last(): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.ChangeLast (method)
  ChangeLast(): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.Value (method)
  Value(theIndex: number): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.At (method)
  At(theIndex: number): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_StartRequestItem;

  // NCollection_Array1_StepAP203_StartRequestItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_StartRequestItem): void;

  // NCollection_Array1_StepAP203_StartRequestItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_StartRequestItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_StartRequestItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_StartRequestItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_StartRequestItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_StartRequestItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_WorkItem: declare class NCollection_Array1_StepAP203_WorkItem

  // NCollection_Array1_StepAP203_WorkItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_WorkItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_WorkItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_WorkItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_WorkItem.Init (method)
  Init(theValue: StepAP203_WorkItem): void;

  // NCollection_Array1_StepAP203_WorkItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_WorkItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_WorkItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_WorkItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_WorkItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_WorkItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_WorkItem): NCollection_Array1_StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_WorkItem): NCollection_Array1_StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_WorkItem): NCollection_Array1_StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.First (method)
  First(): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.Last (method)
  Last(): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.ChangeLast (method)
  ChangeLast(): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.Value (method)
  Value(theIndex: number): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.At (method)
  At(theIndex: number): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_WorkItem;

  // NCollection_Array1_StepAP203_WorkItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_WorkItem): void;

  // NCollection_Array1_StepAP203_WorkItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_WorkItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_WorkItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_WorkItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_WorkItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_WorkItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP214_ApprovalItem: declare class NCollection_Array1_StepAP214_ApprovalItem

  // NCollection_Array1_StepAP214_ApprovalItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP214_ApprovalItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP214_ApprovalItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP214_ApprovalItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP214_ApprovalItem.Init (method)
  Init(theValue: StepAP214_ApprovalItem): void;

  // NCollection_Array1_StepAP214_ApprovalItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP214_ApprovalItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP214_ApprovalItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP214_ApprovalItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP214_ApprovalItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP214_ApprovalItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP214_ApprovalItem): NCollection_Array1_StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP214_ApprovalItem): NCollection_Array1_StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP214_ApprovalItem): NCollection_Array1_StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.First (method)
  First(): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.ChangeFirst (method)
  ChangeFirst(): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.Last (method)
  Last(): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.ChangeLast (method)
  ChangeLast(): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.Value (method)
  Value(theIndex: number): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.At (method)
  At(theIndex: number): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP214_ApprovalItem;

  // NCollection_Array1_StepAP214_ApprovalItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP214_ApprovalItem): void;

  // NCollection_Array1_StepAP214_ApprovalItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP214_ApprovalItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP214_ApprovalItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP214_ApprovalItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP214_ApprovalItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP214_ApprovalItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem: declare class NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP214_AutoDesignDateAndPersonItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP214_AutoDesignDateAndPersonItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Init (method)
  Init(theValue: StepAP214_AutoDesignDateAndPersonItem): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.First (method)
  First(): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.ChangeFirst (method)
  ChangeFirst(): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Last (method)
  Last(): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.ChangeLast (method)
  ChangeLast(): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Value (method)
  Value(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.At (method)
  At(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP214_AutoDesignDateAndPersonItem): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem: declare class NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP214_AutoDesignDateAndTimeItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP214_AutoDesignDateAndTimeItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Init (method)
  Init(theValue: StepAP214_AutoDesignDateAndTimeItem): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.First (method)
  First(): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.ChangeFirst (method)
  ChangeFirst(): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Last (method)
  Last(): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.ChangeLast (method)
  ChangeLast(): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Value (method)
  Value(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.At (method)
  At(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP214_AutoDesignDateAndTimeItem): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP214_AutoDesignDatedItem: declare class NCollection_Array1_StepAP214_AutoDesignDatedItem

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP214_AutoDesignDatedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP214_AutoDesignDatedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Init (method)
  Init(theValue: StepAP214_AutoDesignDatedItem): void;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem): NCollection_Array1_StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem): NCollection_Array1_StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem): NCollection_Array1_StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.First (method)
  First(): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.ChangeFirst (method)
  ChangeFirst(): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Last (method)
  Last(): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.ChangeLast (method)
  ChangeLast(): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Value (method)
  Value(theIndex: number): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.At (method)
  At(theIndex: number): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP214_AutoDesignDatedItem;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP214_AutoDesignDatedItem): void;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP214_AutoDesignDatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem: declare class NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP214_AutoDesignGeneralOrgItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP214_AutoDesignGeneralOrgItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Init (method)
  Init(theValue: StepAP214_AutoDesignGeneralOrgItem): void;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.First (method)
  First(): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.ChangeFirst (method)
  ChangeFirst(): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Last (method)
  Last(): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.ChangeLast (method)
  ChangeLast(): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Value (method)
  Value(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.At (method)
  At(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP214_AutoDesignGeneralOrgItem): void;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP214_AutoDesignGroupedItem: declare class NCollection_Array1_StepAP214_AutoDesignGroupedItem

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP214_AutoDesignGroupedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP214_AutoDesignGroupedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Init (method)
  Init(theValue: StepAP214_AutoDesignGroupedItem): void;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.First (method)
  First(): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.ChangeFirst (method)
  ChangeFirst(): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Last (method)
  Last(): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.ChangeLast (method)
  ChangeLast(): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Value (method)
  Value(theIndex: number): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.At (method)
  At(theIndex: number): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP214_AutoDesignGroupedItem;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP214_AutoDesignGroupedItem): void;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP214_AutoDesignGroupedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
