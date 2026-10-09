# libcascade — NCollection

30 top-level symbols. Signatures are verbatim typescript.

NCollection_AccAllocator: declare class NCollection_AccAllocator extends NCollection_BaseAllocator

  // NCollection_AccAllocator.constructor (constructor)
  constructor(theBlockSize?: number);

  // NCollection_AccAllocator.get_type_name (method)
  static get_type_name(): string;

  // NCollection_AccAllocator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_AccAllocator.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_AccAllocator.delete (method)
  delete(): void;

  // NCollection_AccAllocator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_AlignedAllocator: declare class NCollection_AlignedAllocator extends NCollection_BaseAllocator

  // NCollection_AlignedAllocator.constructor (constructor)
  constructor(theAlignment: number);

  // NCollection_AlignedAllocator.get_type_name (method)
  static get_type_name(): string;

  // NCollection_AlignedAllocator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_AlignedAllocator.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_AlignedAllocator.delete (method)
  delete(): void;

  // NCollection_AlignedAllocator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseAllocator: declare class NCollection_BaseAllocator extends Standard_Transient

  // NCollection_BaseAllocator.CommonBaseAllocator (method)
  static CommonBaseAllocator(): NCollection_BaseAllocator;

  // NCollection_BaseAllocator.get_type_name (method)
  static get_type_name(): string;

  // NCollection_BaseAllocator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_BaseAllocator.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_BaseAllocator.delete (method)
  delete(): void;

  // NCollection_BaseAllocator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseList: declare class NCollection_BaseList

  // NCollection_BaseList.Extent (method)
  Extent(): number;

  // NCollection_BaseList.Length (method)
  Length(): number;

  // NCollection_BaseList.Size (method)
  Size(): number;

  // NCollection_BaseList.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_BaseList.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // NCollection_BaseList.delete (method)
  delete(): void;

  // NCollection_BaseList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseList_Iterator: declare class NCollection_BaseList_Iterator

  // NCollection_BaseList_Iterator.constructor (constructor)
  constructor();
  constructor(theList: NCollection_BaseList);

  // NCollection_BaseList_Iterator.Init (method)
  Init(theList: NCollection_BaseList): void;

  // NCollection_BaseList_Iterator.Initialize (method)
  Initialize(theList: NCollection_BaseList): void;

  // NCollection_BaseList_Iterator.More (method)
  More(): boolean;

  // NCollection_BaseList_Iterator.delete (method)
  delete(): void;

  // NCollection_BaseList_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseMap: declare class NCollection_BaseMap

  // NCollection_BaseMap.NbBuckets (method)
  NbBuckets(): number;

  // NCollection_BaseMap.Extent (method)
  Extent(): number;

  // NCollection_BaseMap.Length (method)
  Length(): number;

  // NCollection_BaseMap.Size (method)
  Size(): number;

  // NCollection_BaseMap.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_BaseMap.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // NCollection_BaseMap.delete (method)
  delete(): void;

  // NCollection_BaseMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseMap_Iterator: declare class NCollection_BaseMap_Iterator

  // NCollection_BaseMap_Iterator.Initialize (method)
  Initialize(theMap: NCollection_BaseMap): void;

  // NCollection_BaseMap_Iterator.Reset (method)
  Reset(): void;

  // NCollection_BaseMap_Iterator.delete (method)
  delete(): void;

  // NCollection_BaseMap_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseSequence: declare class NCollection_BaseSequence

  // NCollection_BaseSequence.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_BaseSequence.Length (method)
  Length(): number;

  // NCollection_BaseSequence.Size (method)
  Size(): number;

  // NCollection_BaseSequence.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // NCollection_BaseSequence.delete (method)
  delete(): void;

  // NCollection_BaseSequence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_BaseSequence_Iterator: declare class NCollection_BaseSequence_Iterator

  // NCollection_BaseSequence_Iterator.constructor (constructor)
  constructor();
  constructor(theSeq: NCollection_BaseSequence, isStart: boolean);

  // NCollection_BaseSequence_Iterator.Init (method)
  Init(theSeq: NCollection_BaseSequence, isStart?: boolean): void;

  // NCollection_BaseSequence_Iterator.Previous (method)
  Previous(): void;

  // NCollection_BaseSequence_Iterator.delete (method)
  delete(): void;

  // NCollection_BaseSequence_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Buffer: declare class NCollection_Buffer extends Standard_Transient

  // NCollection_Buffer.constructor (constructor)
  constructor(theAlloc: NCollection_BaseAllocator, theSize?: number, theData?: number);

  // NCollection_Buffer.Data (method)
  Data(): number;

  // NCollection_Buffer.ChangeData (method)
  ChangeData(): number;

  // NCollection_Buffer.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Buffer.Size (method)
  Size(): number;

  // NCollection_Buffer.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // NCollection_Buffer.SetAllocator (method)
  SetAllocator(theAlloc: NCollection_BaseAllocator): void;

  // NCollection_Buffer.Allocate (method)
  Allocate(theSize: number): boolean;

  // NCollection_Buffer.Free (method)
  Free(): void;

  // NCollection_Buffer.get_type_name (method)
  static get_type_name(): string;

  // NCollection_Buffer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_Buffer.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_Buffer.delete (method)
  delete(): void;

  // NCollection_Buffer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_CellFilter_Action: typeof NCollection_CellFilter_Action[keyof typeof NCollection_CellFilter_Action]

  readonly CellFilter_Keep: 'CellFilter_Keep'

  readonly CellFilter_Purge: 'CellFilter_Purge'

NCollection_ForwardRangeSentinel: declare class NCollection_ForwardRangeSentinel

  // NCollection_ForwardRangeSentinel.constructor (constructor)
  constructor();

  // NCollection_ForwardRangeSentinel.delete (method)
  delete(): void;

  // NCollection_ForwardRangeSentinel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HeapAllocator: declare class NCollection_HeapAllocator extends NCollection_BaseAllocator

  // NCollection_HeapAllocator.GlobalHeapAllocator (method)
  static GlobalHeapAllocator(): NCollection_HeapAllocator;

  // NCollection_HeapAllocator.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HeapAllocator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HeapAllocator.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HeapAllocator.delete (method)
  delete(): void;

  // NCollection_HeapAllocator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_IncAllocator: declare class NCollection_IncAllocator extends NCollection_BaseAllocator

  // NCollection_IncAllocator.constructor (constructor)
  constructor(theBlockSize?: number);

  // NCollection_IncAllocator.SetThreadSafe (method)
  SetThreadSafe(theIsThreadSafe?: boolean): void;

  // NCollection_IncAllocator.Reset (method)
  Reset(theReleaseMemory?: boolean): void;

  // NCollection_IncAllocator.get_type_name (method)
  static get_type_name(): string;

  // NCollection_IncAllocator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_IncAllocator.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_IncAllocator.delete (method)
  delete(): void;

  // NCollection_IncAllocator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_IncAllocator_IBlock: interface NCollection_IncAllocator_IBlock

  CurPointer: any

  AvailableSize: any

  NextBlock: NCollection_IncAllocator_IBlock

  NextOrderedBlock: NCollection_IncAllocator_IBlock

  CurPointer: any

  AvailableSize: any

  // NCollection_IncAllocator_IBlock.delete (method)
  delete(): void;

  // NCollection_IncAllocator_IBlock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_IncAllocator_IBlockSizeLevel: typeof NCollection_IncAllocator_IBlockSizeLevel[keyof typeof NCollection_IncAllocator_IBlockSizeLevel]

  readonly Min: 'Min'

  readonly Small: 'Small'

  readonly Medium: 'Medium'

  readonly Large: 'Large'

  readonly Max: 'Max'

NCollection_SparseArrayBase: declare class NCollection_SparseArrayBase

  // NCollection_SparseArrayBase.Size (method)
  Size(): number;

  // NCollection_SparseArrayBase.HasValue (method)
  HasValue(theIndex: number): boolean;

  // NCollection_SparseArrayBase.delete (method)
  delete(): void;

  // NCollection_SparseArrayBase.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_SparseArrayBase_Iterator: declare class NCollection_SparseArrayBase_Iterator

  // NCollection_SparseArrayBase_Iterator.Restart (method)
  Restart(): void;

  // NCollection_SparseArrayBase_Iterator.More (method)
  More(): boolean;

  // NCollection_SparseArrayBase_Iterator.Next (method)
  Next(): void;

  // NCollection_SparseArrayBase_Iterator.Index (method)
  Index(): number;

  // NCollection_SparseArrayBase_Iterator.delete (method)
  delete(): void;

  // NCollection_SparseArrayBase_Iterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_String: declare class NCollection_String

  // NCollection_String.constructor (constructor)
  constructor();
  constructor(theCopy: NCollection_String);
  constructor(theCopyUtf8: string, theLength?: number);

  // NCollection_String.Size (method)
  Size(): number;

  // NCollection_String.Length (method)
  Length(): number;

  // NCollection_String.GetChar (method)
  GetChar(theCharIndex: number): string;

  // NCollection_String.GetCharBuffer (method)
  GetCharBuffer(theCharIndex: number): string;

  // NCollection_String.FromLocale (method)
  FromLocale(theString: string, theLength?: number): void;

  // NCollection_String.IsEqual (method)
  IsEqual(theCompare: NCollection_String): boolean;

  // NCollection_String.SubString (method)
  SubString(theStart: number, theEnd: number): NCollection_String;

  // NCollection_String.ToCString (method)
  ToCString(): string;

  // NCollection_String.ToUtf8 (method)
  ToUtf8(): string;

  // NCollection_String.ToUtf16 (method)
  ToUtf16(): string;

  // NCollection_String.ToUtf32 (method)
  ToUtf32(): string;

  // NCollection_String.ToUtfWide (method)
  ToUtfWide(): string;

  // NCollection_String.ToLocale (method)
  ToLocale(theBuffer: string, theSizeBytes: number): boolean;

  // NCollection_String.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_String.Clear (method)
  Clear(): void;

  // NCollection_String.Assign (method)
  Assign(theOther: NCollection_String): NCollection_String;

  // NCollection_String.Swap (method)
  Swap(theOther: NCollection_String): void;

  // NCollection_String.delete (method)
  delete(): void;

  // NCollection_String.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_UtfStringTool: declare class NCollection_UtfStringTool

  // NCollection_UtfStringTool.constructor (constructor)
  constructor();

  // NCollection_UtfStringTool.FromLocale (method)
  FromLocale(theString: string): string;

  // NCollection_UtfStringTool.ToLocale (method)
  static ToLocale(theWideString: string, theBuffer: string, theSizeBytes: number): boolean;

  // NCollection_UtfStringTool.delete (method)
  delete(): void;

  // NCollection_UtfStringTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_WinHeapAllocator: declare class NCollection_WinHeapAllocator extends NCollection_BaseAllocator

  // NCollection_WinHeapAllocator.constructor (constructor)
  constructor(theInitSizeBytes?: number);

  // NCollection_WinHeapAllocator.get_type_name (method)
  static get_type_name(): string;

  // NCollection_WinHeapAllocator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_WinHeapAllocator.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_WinHeapAllocator.delete (method)
  delete(): void;

  // NCollection_WinHeapAllocator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_AppParCurves_ConstraintCouple: declare class NCollection_Array1_AppParCurves_ConstraintCouple

  // NCollection_Array1_AppParCurves_ConstraintCouple.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_AppParCurves_ConstraintCouple);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: AppParCurves_ConstraintCouple, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: AppParCurves_ConstraintCouple, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_AppParCurves_ConstraintCouple.Init (method)
  Init(theValue: AppParCurves_ConstraintCouple): void;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Size (method)
  Size(): number;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Length (method)
  Length(): number;

  // NCollection_Array1_AppParCurves_ConstraintCouple.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Lower (method)
  Lower(): number;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Upper (method)
  Upper(): number;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Assign (method)
  Assign(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Move (method)
  Move(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.First (method)
  First(): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.ChangeFirst (method)
  ChangeFirst(): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Last (method)
  Last(): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.ChangeLast (method)
  ChangeLast(): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Value (method)
  Value(theIndex: number): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.ChangeValue (method)
  ChangeValue(theIndex: number): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.At (method)
  At(theIndex: number): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.ChangeAt (method)
  ChangeAt(theIndex: number): AppParCurves_ConstraintCouple;

  // NCollection_Array1_AppParCurves_ConstraintCouple.SetValue (method)
  SetValue(theIndex: number, theItem: AppParCurves_ConstraintCouple): void;

  // NCollection_Array1_AppParCurves_ConstraintCouple.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_AppParCurves_ConstraintCouple.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_AppParCurves_ConstraintCouple.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_AppParCurves_ConstraintCouple.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_AppParCurves_ConstraintCouple.delete (method)
  delete(): void;

  // NCollection_Array1_AppParCurves_ConstraintCouple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_AppParCurves_MultiPoint: declare class NCollection_Array1_AppParCurves_MultiPoint

  // NCollection_Array1_AppParCurves_MultiPoint.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: unknown);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: AppParCurves_MultiPoint, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: AppParCurves_MultiPoint, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_AppParCurves_MultiPoint.Init (method)
  Init(theValue: AppParCurves_MultiPoint): void;

  // NCollection_Array1_AppParCurves_MultiPoint.Size (method)
  Size(): number;

  // NCollection_Array1_AppParCurves_MultiPoint.Length (method)
  Length(): number;

  // NCollection_Array1_AppParCurves_MultiPoint.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_AppParCurves_MultiPoint.Lower (method)
  Lower(): number;

  // NCollection_Array1_AppParCurves_MultiPoint.Upper (method)
  Upper(): number;

  // NCollection_Array1_AppParCurves_MultiPoint.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_Array1_AppParCurves_MultiPoint.CopyValues (method)
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array1_AppParCurves_MultiPoint.Move (method)
  Move(theOther: unknown): unknown;

  // NCollection_Array1_AppParCurves_MultiPoint.First (method)
  First(): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.ChangeFirst (method)
  ChangeFirst(): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.Last (method)
  Last(): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.ChangeLast (method)
  ChangeLast(): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.Value (method)
  Value(theIndex: number): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.ChangeValue (method)
  ChangeValue(theIndex: number): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.At (method)
  At(theIndex: number): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.ChangeAt (method)
  ChangeAt(theIndex: number): AppParCurves_MultiPoint;

  // NCollection_Array1_AppParCurves_MultiPoint.SetValue (method)
  SetValue(theIndex: number, theItem: AppParCurves_MultiPoint): void;

  // NCollection_Array1_AppParCurves_MultiPoint.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_AppParCurves_MultiPoint.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_AppParCurves_MultiPoint.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_AppParCurves_MultiPoint.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_AppParCurves_MultiPoint.delete (method)
  delete(): void;

  // NCollection_Array1_AppParCurves_MultiPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_ChildRefId: declare class NCollection_Array1_BRepGraph_ChildRefId

  // NCollection_Array1_BRepGraph_ChildRefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_ChildRefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_ChildRefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_ChildRefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_ChildRefId.Init (method)
  Init(theValue: BRepGraph_ChildRefId): void;

  // NCollection_Array1_BRepGraph_ChildRefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_ChildRefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_ChildRefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_ChildRefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_ChildRefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_ChildRefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.First (method)
  First(): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.Last (method)
  Last(): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.ChangeLast (method)
  ChangeLast(): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.Value (method)
  Value(theIndex: number): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.At (method)
  At(theIndex: number): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_ChildRefId;

  // NCollection_Array1_BRepGraph_ChildRefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_ChildRefId): void;

  // NCollection_Array1_BRepGraph_ChildRefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_ChildRefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_ChildRefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_ChildRefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_ChildRefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_ChildRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_CoEdgeId: declare class NCollection_Array1_BRepGraph_CoEdgeId

  // NCollection_Array1_BRepGraph_CoEdgeId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_CoEdgeId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_CoEdgeId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_CoEdgeId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_CoEdgeId.Init (method)
  Init(theValue: BRepGraph_CoEdgeId): void;

  // NCollection_Array1_BRepGraph_CoEdgeId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_CoEdgeId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_CoEdgeId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_CoEdgeId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_CoEdgeId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_CoEdgeId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.First (method)
  First(): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.Last (method)
  Last(): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.ChangeLast (method)
  ChangeLast(): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.Value (method)
  Value(theIndex: number): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.At (method)
  At(theIndex: number): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_CoEdgeId;

  // NCollection_Array1_BRepGraph_CoEdgeId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_CoEdgeId): void;

  // NCollection_Array1_BRepGraph_CoEdgeId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_CoEdgeId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_CoEdgeId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_CoEdgeId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_CoEdgeId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_CoEdgeId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_FaceRefId: declare class NCollection_Array1_BRepGraph_FaceRefId

  // NCollection_Array1_BRepGraph_FaceRefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_FaceRefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_FaceRefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_FaceRefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_FaceRefId.Init (method)
  Init(theValue: BRepGraph_FaceRefId): void;

  // NCollection_Array1_BRepGraph_FaceRefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_FaceRefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_FaceRefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_FaceRefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_FaceRefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_FaceRefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.First (method)
  First(): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.Last (method)
  Last(): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.ChangeLast (method)
  ChangeLast(): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.Value (method)
  Value(theIndex: number): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.At (method)
  At(theIndex: number): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_FaceRefId;

  // NCollection_Array1_BRepGraph_FaceRefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_FaceRefId): void;

  // NCollection_Array1_BRepGraph_FaceRefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_FaceRefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_FaceRefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_FaceRefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_FaceRefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_FaceRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_ItemUID: declare class NCollection_Array1_BRepGraph_ItemUID

  // NCollection_Array1_BRepGraph_ItemUID.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_ItemUID);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_ItemUID, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_ItemUID, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_ItemUID.Init (method)
  Init(theValue: BRepGraph_ItemUID): void;

  // NCollection_Array1_BRepGraph_ItemUID.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_ItemUID.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_ItemUID.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_ItemUID.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_ItemUID.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_ItemUID.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.First (method)
  First(): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.ChangeFirst (method)
  ChangeFirst(): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.Last (method)
  Last(): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.ChangeLast (method)
  ChangeLast(): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.Value (method)
  Value(theIndex: number): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.At (method)
  At(theIndex: number): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_ItemUID;

  // NCollection_Array1_BRepGraph_ItemUID.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_ItemUID): void;

  // NCollection_Array1_BRepGraph_ItemUID.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_ItemUID.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_ItemUID.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_ItemUID.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_ItemUID.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_ItemUID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_NodeId: declare class NCollection_Array1_BRepGraph_NodeId

  // NCollection_Array1_BRepGraph_NodeId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_NodeId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_NodeId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_NodeId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_NodeId.Init (method)
  Init(theValue: BRepGraph_NodeId): void;

  // NCollection_Array1_BRepGraph_NodeId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_NodeId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_NodeId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_NodeId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_NodeId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_NodeId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.First (method)
  First(): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.Last (method)
  Last(): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.ChangeLast (method)
  ChangeLast(): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.Value (method)
  Value(theIndex: number): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.At (method)
  At(theIndex: number): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_NodeId;

  // NCollection_Array1_BRepGraph_NodeId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_NodeId): void;

  // NCollection_Array1_BRepGraph_NodeId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_NodeId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_NodeId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_NodeId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_NodeId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_NodeId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_OccurrenceRefId: declare class NCollection_Array1_BRepGraph_OccurrenceRefId

  // NCollection_Array1_BRepGraph_OccurrenceRefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_OccurrenceRefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_OccurrenceRefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Init (method)
  Init(theValue: BRepGraph_OccurrenceRefId): void;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.First (method)
  First(): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Last (method)
  Last(): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.ChangeLast (method)
  ChangeLast(): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Value (method)
  Value(theIndex: number): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.At (method)
  At(theIndex: number): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_OccurrenceRefId;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_OccurrenceRefId): void;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_OccurrenceRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_BRepGraph_RefId: declare class NCollection_Array1_BRepGraph_RefId

  // NCollection_Array1_BRepGraph_RefId.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_BRepGraph_RefId);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: BRepGraph_RefId, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: BRepGraph_RefId, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_BRepGraph_RefId.Init (method)
  Init(theValue: BRepGraph_RefId): void;

  // NCollection_Array1_BRepGraph_RefId.Size (method)
  Size(): number;

  // NCollection_Array1_BRepGraph_RefId.Length (method)
  Length(): number;

  // NCollection_Array1_BRepGraph_RefId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_BRepGraph_RefId.Lower (method)
  Lower(): number;

  // NCollection_Array1_BRepGraph_RefId.Upper (method)
  Upper(): number;

  // NCollection_Array1_BRepGraph_RefId.Assign (method)
  Assign(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.Move (method)
  Move(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.First (method)
  First(): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.ChangeFirst (method)
  ChangeFirst(): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.Last (method)
  Last(): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.ChangeLast (method)
  ChangeLast(): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.Value (method)
  Value(theIndex: number): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.At (method)
  At(theIndex: number): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.ChangeAt (method)
  ChangeAt(theIndex: number): BRepGraph_RefId;

  // NCollection_Array1_BRepGraph_RefId.SetValue (method)
  SetValue(theIndex: number, theItem: BRepGraph_RefId): void;

  // NCollection_Array1_BRepGraph_RefId.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_BRepGraph_RefId.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_BRepGraph_RefId.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_BRepGraph_RefId.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_BRepGraph_RefId.delete (method)
  delete(): void;

  // NCollection_Array1_BRepGraph_RefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
