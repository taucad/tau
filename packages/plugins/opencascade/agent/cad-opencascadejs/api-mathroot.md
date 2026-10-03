# libcascade — MathRoot

6 top-level symbols. Signatures are verbatim typescript.

MathRoot_AllRootsResult: declare class MathRoot_AllRootsResult

  // MathRoot_AllRootsResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Roots: NCollection_DynamicArray_double

  RootStates: NCollection_DynamicArray_int

  NullIntervals: NCollection_DynamicArray_MathRoot_NullInterval

  // MathRoot_AllRootsResult.IsDone (method)
  IsDone(): boolean;

  // MathRoot_AllRootsResult.NbRoots (method)
  NbRoots(): number;

  // MathRoot_AllRootsResult.NbIntervals (method)
  NbIntervals(): number;

  // MathRoot_AllRootsResult.delete (method)
  delete(): void;

  // MathRoot_AllRootsResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathRoot_NullInterval: declare class MathRoot_NullInterval

  // MathRoot_NullInterval.constructor (constructor)
  constructor();

  A: number

  B: number

  State: number

  // MathRoot_NullInterval.delete (method)
  delete(): void;

  // MathRoot_NullInterval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathRoot_MultipleConfig: declare class MathRoot_MultipleConfig

  // MathRoot_MultipleConfig.constructor (constructor)
  constructor();

  NbSamples: number

  XTolerance: number

  FTolerance: number

  NullTolerance: number

  MaxIterations: number

  Offset: number

  // MathRoot_MultipleConfig.delete (method)
  delete(): void;

  // MathRoot_MultipleConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathRoot_MultipleNoExtraHandler: declare class MathRoot_MultipleNoExtraHandler

  // MathRoot_MultipleNoExtraHandler.constructor (constructor)
  constructor();

  // MathRoot_MultipleNoExtraHandler.delete (method)
  delete(): void;

  // MathRoot_MultipleNoExtraHandler.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathRoot_MultipleResult: declare class MathRoot_MultipleResult

  // MathRoot_MultipleResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  NbIterations: number

  Roots: NCollection_DynamicArray_double

  Values: NCollection_DynamicArray_double

  IsAllNull: boolean

  // MathRoot_MultipleResult.IsDone (method)
  IsDone(): boolean;

  // MathRoot_MultipleResult.NbRoots (method)
  NbRoots(): number;

  // MathRoot_MultipleResult.delete (method)
  delete(): void;

  // MathRoot_MultipleResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathRoot_TrigResult: declare class MathRoot_TrigResult

  // MathRoot_TrigResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Roots: [number, number, number, number]

  NbRoots: number

  InfiniteRoots: boolean

  // MathRoot_TrigResult.IsDone (method)
  IsDone(): boolean;

  // MathRoot_TrigResult.delete (method)
  delete(): void;

  // MathRoot_TrigResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
