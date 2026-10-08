# libcascade — NCollection (2)

14 top-level symbols. Signatures are verbatim typescript.

NCollection_Array1_BRepGraph_ShellRefId: declare class NCollection_Array1_BRepGraph_ShellRefId

  // NCollection_Array1_BRepGraph_ShellRefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_ShellRefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_ShellRefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_ShellRefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_ShellRefId.Init (method)
  Init(theValue: BRepGraph_ShellRefId): void;

  // NCollection_Array1_BRepGraph_ShellRefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_ShellRefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_ShellRefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_ShellRefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_ShellRefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_ShellRefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.First (method)
  First(): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.Last (method)
  Last(): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.ChangeLast (method)
  ChangeLast(): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.Value (method)
  Value(theIndex: number): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.At (method)
  At(theIndex: number): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_ShellRefId;

  // NCollection_Array1_BRepGraph_ShellRefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_ShellRefId): void;

  // NCollection_Array1_BRepGraph_ShellRefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_ShellRefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_ShellRefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_ShellRefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_ShellRefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_ShellRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_SolidRefId: declare class NCollection_Array1_BRepGraph_SolidRefId

  // NCollection_Array1_BRepGraph_SolidRefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_SolidRefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_SolidRefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_SolidRefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_SolidRefId.Init (method)
  Init(theValue: BRepGraph_SolidRefId): void;

  // NCollection_Array1_BRepGraph_SolidRefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_SolidRefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_SolidRefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_SolidRefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_SolidRefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_SolidRefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.First (method)
  First(): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.Last (method)
  Last(): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.ChangeLast (method)
  ChangeLast(): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.Value (method)
  Value(theIndex: number): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.At (method)
  At(theIndex: number): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_SolidRefId;

  // NCollection_Array1_BRepGraph_SolidRefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_SolidRefId): void;

  // NCollection_Array1_BRepGraph_SolidRefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_SolidRefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_SolidRefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_SolidRefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_SolidRefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_SolidRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_UID: declare class NCollection_Array1_BRepGraph_UID

  // NCollection_Array1_BRepGraph_UID.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_UID);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_UID, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_UID, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_UID.Init (method)
  Init(theValue: BRepGraph_UID): void;

  // NCollection_Array1_BRepGraph_UID.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_UID.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_UID.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_UID.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_UID.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_UID.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_UID): NCollection_Array1_BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_UID): NCollection_Array1_BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_UID): NCollection_Array1_BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.First (method)
  First(): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.ChangeFirst (method)
  ChangeFirst(): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.Last (method)
  Last(): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.ChangeLast (method)
  ChangeLast(): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.Value (method)
  Value(theIndex: number): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.At (method)
  At(theIndex: number): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_UID;

  // NCollection_Array1_BRepGraph_UID.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_UID): void;

  // NCollection_Array1_BRepGraph_UID.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_UID.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_UID.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_UID.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_UID.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_UID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_WireRefId: declare class NCollection_Array1_BRepGraph_WireRefId

  // NCollection_Array1_BRepGraph_WireRefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_WireRefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_WireRefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_WireRefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_WireRefId.Init (method)
  Init(theValue: BRepGraph_WireRefId): void;

  // NCollection_Array1_BRepGraph_WireRefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_WireRefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_WireRefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_WireRefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_WireRefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_WireRefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_WireRefId): NCollection_Array1_BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_WireRefId): NCollection_Array1_BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_WireRefId): NCollection_Array1_BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.First (method)
  First(): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.Last (method)
  Last(): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.ChangeLast (method)
  ChangeLast(): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.Value (method)
  Value(theIndex: number): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.At (method)
  At(theIndex: number): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_WireRefId;

  // NCollection_Array1_BRepGraph_WireRefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_WireRefId): void;

  // NCollection_Array1_BRepGraph_WireRefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_WireRefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_WireRefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_WireRefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_WireRefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_WireRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_Bnd_Box: declare class NCollection_Array1_Bnd_Box

  // NCollection_Array1_Bnd_Box.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_Bnd_Box);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Bnd_Box, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Bnd_Box, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_Bnd_Box.Init (method)
  Init(theValue: Bnd_Box): void;

  // NCollection_Array1_Bnd_Box.Size (method)
  Size(): number;

  // NCollection_Array1_Bnd_Box.Length (method)
  Length(): number;

  // NCollection_Array1_Bnd_Box.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_Bnd_Box.Lower (method)
  Lower(): number;

  // NCollection_Array1_Bnd_Box.Upper (method)
  Upper(): number;

  // NCollection_Array1_Bnd_Box.Assign (method)
  Assign(theOther: NCollection_Array1_Bnd_Box): NCollection_Array1_Bnd_Box;

  // NCollection_Array1_Bnd_Box.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_Bnd_Box): NCollection_Array1_Bnd_Box;

  // NCollection_Array1_Bnd_Box.Move (method)
  Move(theOther: NCollection_Array1_Bnd_Box): NCollection_Array1_Bnd_Box;

  // NCollection_Array1_Bnd_Box.First (method)
  First(): Bnd_Box;

  // NCollection_Array1_Bnd_Box.ChangeFirst (method)
  ChangeFirst(): Bnd_Box;

  // NCollection_Array1_Bnd_Box.Last (method)
  Last(): Bnd_Box;

  // NCollection_Array1_Bnd_Box.ChangeLast (method)
  ChangeLast(): Bnd_Box;

  // NCollection_Array1_Bnd_Box.Value (method)
  Value(theIndex: number): Bnd_Box;

  // NCollection_Array1_Bnd_Box.ChangeValue (method)
  ChangeValue(theIndex: number): Bnd_Box;

  // NCollection_Array1_Bnd_Box.At (method)
  At(theIndex: number): Bnd_Box;

  // NCollection_Array1_Bnd_Box.ChangeAt (method)
  ChangeAt(theIndex: number): Bnd_Box;

  // NCollection_Array1_Bnd_Box.SetValue (method)
  SetValue(theIndex: number, theItem: Bnd_Box): void;

  // NCollection_Array1_Bnd_Box.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_Bnd_Box.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_Bnd_Box.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_Bnd_Box.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_Bnd_Box.delete (method)
  delete(): void;

  // NCollection_Array1_Bnd_Box.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_ChFiDS_CircSection: declare class NCollection_Array1_ChFiDS_CircSection

  // NCollection_Array1_ChFiDS_CircSection.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_ChFiDS_CircSection);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: ChFiDS_CircSection, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: ChFiDS_CircSection, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_ChFiDS_CircSection.Init (method)
  Init(theValue: ChFiDS_CircSection): void;

  // NCollection_Array1_ChFiDS_CircSection.Size (method)
  Size(): number;

  // NCollection_Array1_ChFiDS_CircSection.Length (method)
  Length(): number;

  // NCollection_Array1_ChFiDS_CircSection.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_ChFiDS_CircSection.Lower (method)
  Lower(): number;

  // NCollection_Array1_ChFiDS_CircSection.Upper (method)
  Upper(): number;

  // NCollection_Array1_ChFiDS_CircSection.Assign (method)
  Assign(theOther: NCollection_Array1_ChFiDS_CircSection): NCollection_Array1_ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_ChFiDS_CircSection): NCollection_Array1_ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.Move (method)
  Move(theOther: NCollection_Array1_ChFiDS_CircSection): NCollection_Array1_ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.First (method)
  First(): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.ChangeFirst (method)
  ChangeFirst(): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.Last (method)
  Last(): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.ChangeLast (method)
  ChangeLast(): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.Value (method)
  Value(theIndex: number): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.ChangeValue (method)
  ChangeValue(theIndex: number): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.At (method)
  At(theIndex: number): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.ChangeAt (method)
  ChangeAt(theIndex: number): ChFiDS_CircSection;

  // NCollection_Array1_ChFiDS_CircSection.SetValue (method)
  SetValue(theIndex: number, theItem: ChFiDS_CircSection): void;

  // NCollection_Array1_ChFiDS_CircSection.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_ChFiDS_CircSection.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_ChFiDS_CircSection.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_ChFiDS_CircSection.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_ChFiDS_CircSection.delete (method)
  delete(): void;

  // NCollection_Array1_ChFiDS_CircSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_HLRAlgo_PolyHidingData: declare class NCollection_Array1_HLRAlgo_PolyHidingData

  // NCollection_Array1_HLRAlgo_PolyHidingData.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_HLRAlgo_PolyHidingData);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: HLRAlgo_PolyHidingData, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: HLRAlgo_PolyHidingData, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_HLRAlgo_PolyHidingData.Init (method)
  Init(theValue: HLRAlgo_PolyHidingData): void;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Size (method)
  Size(): number;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Length (method)
  Length(): number;

  // NCollection_Array1_HLRAlgo_PolyHidingData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Lower (method)
  Lower(): number;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Upper (method)
  Upper(): number;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Assign (method)
  Assign(theOther: NCollection_Array1_HLRAlgo_PolyHidingData): NCollection_Array1_HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_HLRAlgo_PolyHidingData): NCollection_Array1_HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Move (method)
  Move(theOther: NCollection_Array1_HLRAlgo_PolyHidingData): NCollection_Array1_HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.First (method)
  First(): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.ChangeFirst (method)
  ChangeFirst(): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Last (method)
  Last(): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.ChangeLast (method)
  ChangeLast(): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Value (method)
  Value(theIndex: number): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.ChangeValue (method)
  ChangeValue(theIndex: number): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.At (method)
  At(theIndex: number): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.ChangeAt (method)
  ChangeAt(theIndex: number): HLRAlgo_PolyHidingData;

  // NCollection_Array1_HLRAlgo_PolyHidingData.SetValue (method)
  SetValue(theIndex: number, theItem: HLRAlgo_PolyHidingData): void;

  // NCollection_Array1_HLRAlgo_PolyHidingData.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_HLRAlgo_PolyHidingData.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_HLRAlgo_PolyHidingData.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_HLRAlgo_PolyHidingData.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_HLRAlgo_PolyHidingData.delete (method)
  delete(): void;

  // NCollection_Array1_HLRAlgo_PolyHidingData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_HLRAlgo_TriangleData: declare class NCollection_Array1_HLRAlgo_TriangleData

  // NCollection_Array1_HLRAlgo_TriangleData.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_HLRAlgo_TriangleData);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: HLRAlgo_TriangleData, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: HLRAlgo_TriangleData, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_HLRAlgo_TriangleData.Init (method)
  Init(theValue: HLRAlgo_TriangleData): void;

  // NCollection_Array1_HLRAlgo_TriangleData.Size (method)
  Size(): number;

  // NCollection_Array1_HLRAlgo_TriangleData.Length (method)
  Length(): number;

  // NCollection_Array1_HLRAlgo_TriangleData.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_HLRAlgo_TriangleData.Lower (method)
  Lower(): number;

  // NCollection_Array1_HLRAlgo_TriangleData.Upper (method)
  Upper(): number;

  // NCollection_Array1_HLRAlgo_TriangleData.Assign (method)
  Assign(theOther: NCollection_Array1_HLRAlgo_TriangleData): NCollection_Array1_HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_HLRAlgo_TriangleData): NCollection_Array1_HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.Move (method)
  Move(theOther: NCollection_Array1_HLRAlgo_TriangleData): NCollection_Array1_HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.First (method)
  First(): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.ChangeFirst (method)
  ChangeFirst(): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.Last (method)
  Last(): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.ChangeLast (method)
  ChangeLast(): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.Value (method)
  Value(theIndex: number): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.ChangeValue (method)
  ChangeValue(theIndex: number): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.At (method)
  At(theIndex: number): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.ChangeAt (method)
  ChangeAt(theIndex: number): HLRAlgo_TriangleData;

  // NCollection_Array1_HLRAlgo_TriangleData.SetValue (method)
  SetValue(theIndex: number, theItem: HLRAlgo_TriangleData): void;

  // NCollection_Array1_HLRAlgo_TriangleData.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_HLRAlgo_TriangleData.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_HLRAlgo_TriangleData.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_HLRAlgo_TriangleData.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_HLRAlgo_TriangleData.delete (method)
  delete(): void;

  // NCollection_Array1_HLRAlgo_TriangleData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_NCollection_Vec3_float: declare class NCollection_Array1_NCollection_Vec3_float

  // NCollection_Array1_NCollection_Vec3_float.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_NCollection_Vec3_float);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: unknown, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: unknown, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_NCollection_Vec3_float.Init (method)
  Init(theValue: unknown): void;

  // NCollection_Array1_NCollection_Vec3_float.Size (method)
  Size(): number;

  // NCollection_Array1_NCollection_Vec3_float.Length (method)
  Length(): number;

  // NCollection_Array1_NCollection_Vec3_float.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_NCollection_Vec3_float.Lower (method)
  Lower(): number;

  // NCollection_Array1_NCollection_Vec3_float.Upper (method)
  Upper(): number;

  // NCollection_Array1_NCollection_Vec3_float.Assign (method)
  Assign(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;

  // NCollection_Array1_NCollection_Vec3_float.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;

  // NCollection_Array1_NCollection_Vec3_float.Move (method)
  Move(theOther: NCollection_Array1_NCollection_Vec3_float): NCollection_Array1_NCollection_Vec3_float;

  // NCollection_Array1_NCollection_Vec3_float.First (method)
  First(): unknown;

  // NCollection_Array1_NCollection_Vec3_float.ChangeFirst (method)
  ChangeFirst(): unknown;

  // NCollection_Array1_NCollection_Vec3_float.Last (method)
  Last(): unknown;

  // NCollection_Array1_NCollection_Vec3_float.ChangeLast (method)
  ChangeLast(): unknown;

  // NCollection_Array1_NCollection_Vec3_float.Value (method)
  Value(theIndex: number): unknown;

  // NCollection_Array1_NCollection_Vec3_float.ChangeValue (method)
  ChangeValue(theIndex: number): unknown;

  // NCollection_Array1_NCollection_Vec3_float.At (method)
  At(theIndex: number): unknown;

  // NCollection_Array1_NCollection_Vec3_float.ChangeAt (method)
  ChangeAt(theIndex: number): unknown;

  // NCollection_Array1_NCollection_Vec3_float.SetValue (method)
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array1_NCollection_Vec3_float.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_NCollection_Vec3_float.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_NCollection_Vec3_float.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_NCollection_Vec3_float.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_NCollection_Vec3_float.delete (method)
  delete(): void;

  // NCollection_Array1_NCollection_Vec3_float.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_Plate_PinpointConstraint: declare class NCollection_Array1_Plate_PinpointConstraint

  // NCollection_Array1_Plate_PinpointConstraint.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_Plate_PinpointConstraint);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Plate_PinpointConstraint, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Plate_PinpointConstraint, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_Plate_PinpointConstraint.Init (method)
  Init(theValue: Plate_PinpointConstraint): void;

  // NCollection_Array1_Plate_PinpointConstraint.Size (method)
  Size(): number;

  // NCollection_Array1_Plate_PinpointConstraint.Length (method)
  Length(): number;

  // NCollection_Array1_Plate_PinpointConstraint.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_Plate_PinpointConstraint.Lower (method)
  Lower(): number;

  // NCollection_Array1_Plate_PinpointConstraint.Upper (method)
  Upper(): number;

  // NCollection_Array1_Plate_PinpointConstraint.Assign (method)
  Assign(theOther: NCollection_Array1_Plate_PinpointConstraint): NCollection_Array1_Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_Plate_PinpointConstraint): NCollection_Array1_Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.Move (method)
  Move(theOther: NCollection_Array1_Plate_PinpointConstraint): NCollection_Array1_Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.First (method)
  First(): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.ChangeFirst (method)
  ChangeFirst(): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.Last (method)
  Last(): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.ChangeLast (method)
  ChangeLast(): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.Value (method)
  Value(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.ChangeValue (method)
  ChangeValue(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.At (method)
  At(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.ChangeAt (method)
  ChangeAt(theIndex: number): Plate_PinpointConstraint;

  // NCollection_Array1_Plate_PinpointConstraint.SetValue (method)
  SetValue(theIndex: number, theItem: Plate_PinpointConstraint): void;

  // NCollection_Array1_Plate_PinpointConstraint.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_Plate_PinpointConstraint.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_Plate_PinpointConstraint.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_Plate_PinpointConstraint.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_Plate_PinpointConstraint.delete (method)
  delete(): void;

  // NCollection_Array1_Plate_PinpointConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_Poly_Triangle: declare class NCollection_Array1_Poly_Triangle

  // NCollection_Array1_Poly_Triangle.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_Poly_Triangle);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: Poly_Triangle, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: Poly_Triangle, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_Poly_Triangle.Init (method)
  Init(theValue: Poly_Triangle): void;

  // NCollection_Array1_Poly_Triangle.Size (method)
  Size(): number;

  // NCollection_Array1_Poly_Triangle.Length (method)
  Length(): number;

  // NCollection_Array1_Poly_Triangle.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_Poly_Triangle.Lower (method)
  Lower(): number;

  // NCollection_Array1_Poly_Triangle.Upper (method)
  Upper(): number;

  // NCollection_Array1_Poly_Triangle.Assign (method)
  Assign(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.Move (method)
  Move(theOther: NCollection_Array1_Poly_Triangle): NCollection_Array1_Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.First (method)
  First(): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.ChangeFirst (method)
  ChangeFirst(): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.Last (method)
  Last(): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.ChangeLast (method)
  ChangeLast(): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.Value (method)
  Value(theIndex: number): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.ChangeValue (method)
  ChangeValue(theIndex: number): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.At (method)
  At(theIndex: number): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.ChangeAt (method)
  ChangeAt(theIndex: number): Poly_Triangle;

  // NCollection_Array1_Poly_Triangle.SetValue (method)
  SetValue(theIndex: number, theItem: Poly_Triangle): void;

  // NCollection_Array1_Poly_Triangle.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_Poly_Triangle.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_Poly_Triangle.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_Poly_Triangle.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_Poly_Triangle.delete (method)
  delete(): void;

  // NCollection_Array1_Poly_Triangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_ApprovedItem: declare class NCollection_Array1_StepAP203_ApprovedItem

  // NCollection_Array1_StepAP203_ApprovedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_ApprovedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_ApprovedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_ApprovedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_ApprovedItem.Init (method)
  Init(theValue: StepAP203_ApprovedItem): void;

  // NCollection_Array1_StepAP203_ApprovedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_ApprovedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_ApprovedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_ApprovedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_ApprovedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_ApprovedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_ApprovedItem): NCollection_Array1_StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_ApprovedItem): NCollection_Array1_StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_ApprovedItem): NCollection_Array1_StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.First (method)
  First(): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.Last (method)
  Last(): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.ChangeLast (method)
  ChangeLast(): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.Value (method)
  Value(theIndex: number): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.At (method)
  At(theIndex: number): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_ApprovedItem;

  // NCollection_Array1_StepAP203_ApprovedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_ApprovedItem): void;

  // NCollection_Array1_StepAP203_ApprovedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_ApprovedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_ApprovedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_ApprovedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_ApprovedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_ApprovedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_CertifiedItem: declare class NCollection_Array1_StepAP203_CertifiedItem

  // NCollection_Array1_StepAP203_CertifiedItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_CertifiedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_CertifiedItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_CertifiedItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_CertifiedItem.Init (method)
  Init(theValue: StepAP203_CertifiedItem): void;

  // NCollection_Array1_StepAP203_CertifiedItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_CertifiedItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_CertifiedItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_CertifiedItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_CertifiedItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_CertifiedItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_CertifiedItem): NCollection_Array1_StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_CertifiedItem): NCollection_Array1_StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_CertifiedItem): NCollection_Array1_StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.First (method)
  First(): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.Last (method)
  Last(): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.ChangeLast (method)
  ChangeLast(): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.Value (method)
  Value(theIndex: number): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.At (method)
  At(theIndex: number): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_CertifiedItem;

  // NCollection_Array1_StepAP203_CertifiedItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_CertifiedItem): void;

  // NCollection_Array1_StepAP203_CertifiedItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_CertifiedItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_CertifiedItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_CertifiedItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_CertifiedItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_CertifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepAP203_ChangeRequestItem: declare class NCollection_Array1_StepAP203_ChangeRequestItem

  // NCollection_Array1_StepAP203_ChangeRequestItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepAP203_ChangeRequestItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepAP203_ChangeRequestItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepAP203_ChangeRequestItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepAP203_ChangeRequestItem.Init (method)
  Init(theValue: StepAP203_ChangeRequestItem): void;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepAP203_ChangeRequestItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepAP203_ChangeRequestItem): NCollection_Array1_StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepAP203_ChangeRequestItem): NCollection_Array1_StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Move (method)
  Move(theOther: NCollection_Array1_StepAP203_ChangeRequestItem): NCollection_Array1_StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.First (method)
  First(): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.ChangeFirst (method)
  ChangeFirst(): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Last (method)
  Last(): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.ChangeLast (method)
  ChangeLast(): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Value (method)
  Value(theIndex: number): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.At (method)
  At(theIndex: number): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepAP203_ChangeRequestItem;

  // NCollection_Array1_StepAP203_ChangeRequestItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepAP203_ChangeRequestItem): void;

  // NCollection_Array1_StepAP203_ChangeRequestItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepAP203_ChangeRequestItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepAP203_ChangeRequestItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepAP203_ChangeRequestItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepAP203_ChangeRequestItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepAP203_ChangeRequestItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
