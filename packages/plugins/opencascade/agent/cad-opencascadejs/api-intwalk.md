# libcascade — IntWalk

5 top-level symbols. Signatures are verbatim typescript.

IntWalk_StatusDeflection: typeof IntWalk_StatusDeflection[keyof typeof IntWalk_StatusDeflection]

  readonly IntWalk_PasTropGrand: 'IntWalk_PasTropGrand'

  readonly IntWalk_StepTooSmall: 'IntWalk_StepTooSmall'

  readonly IntWalk_PointConfondu: 'IntWalk_PointConfondu'

  readonly IntWalk_ArretSurPointPrecedent: 'IntWalk_ArretSurPointPrecedent'

  readonly IntWalk_ArretSurPoint: 'IntWalk_ArretSurPoint'

  readonly IntWalk_OK: 'IntWalk_OK'

IntWalk_TheInt2S: declare class IntWalk_TheInt2S

  // IntWalk_TheInt2S.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, TolTangency: number);
  constructor(Param: NCollection_Array1_double, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, TolTangency: number);

  // IntWalk_TheInt2S.Perform (method)
  Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
  Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

  // IntWalk_TheInt2S.IsDone (method)
  IsDone(): boolean;

  // IntWalk_TheInt2S.IsEmpty (method)
  IsEmpty(): boolean;

  // IntWalk_TheInt2S.Point (method)
  Point(): IntSurf_PntOn2S;

  // IntWalk_TheInt2S.IsTangent (method)
  IsTangent(): boolean;

  // IntWalk_TheInt2S.Direction (method)
  Direction(): gp_Dir;

  // IntWalk_TheInt2S.DirectionOnS1 (method)
  DirectionOnS1(): gp_Dir2d;

  // IntWalk_TheInt2S.DirectionOnS2 (method)
  DirectionOnS2(): gp_Dir2d;

  // IntWalk_TheInt2S.ChangePoint (method)
  ChangePoint(): IntSurf_PntOn2S;

  // IntWalk_TheInt2S.delete (method)
  delete(): void;

  // IntWalk_TheInt2S.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntWalk_VectorOfInteger: declare class IntWalk_VectorOfInteger

  // IntWalk_VectorOfInteger.constructor (constructor)
  constructor();
  constructor(theCapacity: number);
  constructor(theOther: IntWalk_VectorOfInteger);
  constructor(theSize: number, theValue: number);

  // IntWalk_VectorOfInteger.Data (method)
  Data(): number;

  // IntWalk_VectorOfInteger.HasData (method)
  HasData(): boolean;

  // IntWalk_VectorOfInteger.Empty (method)
  Empty(): boolean;

  // IntWalk_VectorOfInteger.MaxSize (method)
  static MaxSize(): number;

  // IntWalk_VectorOfInteger.Size (method)
  Size(): number;

  // IntWalk_VectorOfInteger.IsEmpty (method)
  IsEmpty(): boolean;

  // IntWalk_VectorOfInteger.Capacity (method)
  Capacity(): number;

  // IntWalk_VectorOfInteger.Reserve (method)
  Reserve(theCapacity: number): void;

  // IntWalk_VectorOfInteger.Resize (method)
  Resize(theSize: number): void;
  Resize(theSize: number, theValue: number): void;

  // IntWalk_VectorOfInteger.Value (method)
  Value(theIndex: number): number;

  // IntWalk_VectorOfInteger.ChangeValue (method)
  ChangeValue(theIndex: number): number;

  // IntWalk_VectorOfInteger.First (method)
  First(): number;

  // IntWalk_VectorOfInteger.ChangeFirst (method)
  ChangeFirst(): number;

  // IntWalk_VectorOfInteger.Last (method)
  Last(): number;

  // IntWalk_VectorOfInteger.ChangeLast (method)
  ChangeLast(): number;

  // IntWalk_VectorOfInteger.Append (method)
  Append(theValue: number): number;

  // IntWalk_VectorOfInteger.Appended (method)
  Appended(): number;

  // IntWalk_VectorOfInteger.SetValue (method)
  SetValue(theIndex: number, theValue: number): number;

  // IntWalk_VectorOfInteger.InsertBefore (method)
  InsertBefore(theIndex: number, theValue: number): void;

  // IntWalk_VectorOfInteger.InsertAfter (method)
  InsertAfter(theIndex: number, theValue: number): void;

  // IntWalk_VectorOfInteger.EraseLast (method)
  EraseLast(): void;

  // IntWalk_VectorOfInteger.Erase (method)
  Erase(theIndex: number): void;
  Erase(theFrom: number, theTo: number): void;

  // IntWalk_VectorOfInteger.Clear (method)
  Clear(theReleaseMemory?: boolean): void;

  // IntWalk_VectorOfInteger.ToArray1 (method)
  ToArray1(): NCollection_Array1_int;

  // IntWalk_VectorOfInteger.delete (method)
  delete(): void;

  // IntWalk_VectorOfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntWalk_VectorOfWalkingData: declare class IntWalk_VectorOfWalkingData

  // IntWalk_VectorOfWalkingData.constructor (constructor)
  constructor();
  constructor(theCapacity: number);
  constructor(theOther: IntWalk_VectorOfWalkingData);
  constructor(theSize: number, theValue: IntWalk_WalkingData);

  // IntWalk_VectorOfWalkingData.Data (method)
  Data(): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.HasData (method)
  HasData(): boolean;

  // IntWalk_VectorOfWalkingData.Empty (method)
  Empty(): boolean;

  // IntWalk_VectorOfWalkingData.MaxSize (method)
  static MaxSize(): number;

  // IntWalk_VectorOfWalkingData.Size (method)
  Size(): number;

  // IntWalk_VectorOfWalkingData.IsEmpty (method)
  IsEmpty(): boolean;

  // IntWalk_VectorOfWalkingData.Capacity (method)
  Capacity(): number;

  // IntWalk_VectorOfWalkingData.Reserve (method)
  Reserve(theCapacity: number): void;

  // IntWalk_VectorOfWalkingData.Resize (method)
  Resize(theSize: number): void;
  Resize(theSize: number, theValue: IntWalk_WalkingData): void;

  // IntWalk_VectorOfWalkingData.Value (method)
  Value(theIndex: number): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.ChangeValue (method)
  ChangeValue(theIndex: number): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.First (method)
  First(): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.ChangeFirst (method)
  ChangeFirst(): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.Last (method)
  Last(): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.ChangeLast (method)
  ChangeLast(): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.Append (method)
  Append(theValue: IntWalk_WalkingData): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.Appended (method)
  Appended(): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.SetValue (method)
  SetValue(theIndex: number, theValue: IntWalk_WalkingData): IntWalk_WalkingData;

  // IntWalk_VectorOfWalkingData.InsertBefore (method)
  InsertBefore(theIndex: number, theValue: IntWalk_WalkingData): void;

  // IntWalk_VectorOfWalkingData.InsertAfter (method)
  InsertAfter(theIndex: number, theValue: IntWalk_WalkingData): void;

  // IntWalk_VectorOfWalkingData.EraseLast (method)
  EraseLast(): void;

  // IntWalk_VectorOfWalkingData.Erase (method)
  Erase(theIndex: number): void;
  Erase(theFrom: number, theTo: number): void;

  // IntWalk_VectorOfWalkingData.Clear (method)
  Clear(theReleaseMemory?: boolean): void;

  // IntWalk_VectorOfWalkingData.ToArray1 (method)
  ToArray1(): any;

  // IntWalk_VectorOfWalkingData.delete (method)
  delete(): void;

  // IntWalk_VectorOfWalkingData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntWalk_WalkingData: declare class IntWalk_WalkingData

  // IntWalk_WalkingData.constructor (constructor)
  constructor();

  ustart: number

  vstart: number

  etat: number

  // IntWalk_WalkingData.delete (method)
  delete(): void;

  // IntWalk_WalkingData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
