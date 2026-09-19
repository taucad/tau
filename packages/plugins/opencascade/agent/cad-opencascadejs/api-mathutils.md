# libcascade — MathUtils

40 top-level symbols. Signatures are verbatim typescript.

MathUtils_BracketResult: declare class MathUtils_BracketResult

  constructor

  IsValid: boolean

  A: number

  B: number

  Fa: number

  Fb: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_MinBracketOptions: declare class MathUtils_MinBracketOptions

  constructor

  MaxIterations: number

  UseLimits: boolean

  LeftLimit: number

  RightLimit: number

  HasFA: boolean

  HasFB: boolean

  FA: number

  FB: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_MinBracketResult: declare class MathUtils_MinBracketResult

  constructor

  IsValid: boolean

  A: number

  B: number

  C: number

  Fa: number

  Fb: number

  Fc: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_BoundedConfig: declare class MathUtils_BoundedConfig extends MathUtils_Config

  constructor

  LowerBound: number

  UpperBound: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Config: declare class MathUtils_Config

  constructor

  MaxIterations: number

  Tolerance: number

  XTolerance: number

  FTolerance: number

  StepMin: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_IntegConfig: declare class MathUtils_IntegConfig

  constructor

  InitialOrder: number

  MaxOrder: number

  MaxIterations: number

  Tolerance: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_LinConfig: declare class MathUtils_LinConfig

  constructor

  SingularityTolerance: number

  UsePivoting: boolean

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_NDimConfig: declare class MathUtils_NDimConfig extends MathUtils_Config

  constructor

  UseBounds: boolean

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Domain1D: declare class MathUtils_Domain1D

  constructor

  Min: number

  Max: number

  Length(): number;

  Mid(): number;

  Contains(theU: number, theTol?: number): boolean;

  Clamp(theU: number): number;

  IsLarge(theThreshold?: number): boolean;

  IsFullPeriod(thePeriod: number, theTol?: number): boolean;

  Lerp(theT: number): number;

  Normalize(theU: number): number;

  IsFinite(theInfLimit?: number): boolean;

  IsEqual(theOther: MathUtils_Domain1D, theTol?: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Domain2D: declare class MathUtils_Domain2D

  constructor

  UMin: number

  UMax: number

  VMin: number

  VMax: number

  U(): MathUtils_Domain1D;

  V(): MathUtils_Domain1D;

  ULength(): number;

  VLength(): number;

  UMid(): number;

  VMid(): number;

  Contains(theU: number, theV: number, theTol?: number): boolean;

  Clamp(theU?: number, theV?: number): { theU: number; theV: number };

  IsLarge(theThreshold?: number): boolean;

  IsUFullPeriod(thePeriod: number, theTol?: number): boolean;

  IsVFullPeriod(thePeriod: number, theTol?: number): boolean;

  IsFinite(theInfLimit?: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Constant: declare class MathUtils_Constant

  constructor

  Value(argNo0: number, theY?: number): { returnValue: boolean; theY: number };

  Values(argNo0: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Cosine: declare class MathUtils_Cosine

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Exponential: declare class MathUtils_Exponential

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Gaussian: declare class MathUtils_Gaussian

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Linear: declare class MathUtils_Linear

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Polynomial: declare class MathUtils_Polynomial

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  Degree(): number;

  Coefficient(theIndex: number): number;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Power: declare class MathUtils_Power

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Rational: declare class MathUtils_Rational

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Sine: declare class MathUtils_Sine

  constructor

  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Ackley: declare class MathUtils_Ackley

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Beale: declare class MathUtils_Beale

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Booth: declare class MathUtils_Booth

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Himmelblau: declare class MathUtils_Himmelblau

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_LinearResidual: declare class MathUtils_LinearResidual

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_QuadraticForm: declare class MathUtils_QuadraticForm

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Rastrigin: declare class MathUtils_Rastrigin

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Rosenbrock: declare class MathUtils_Rosenbrock

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Sphere: declare class MathUtils_Sphere

  constructor

  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_LineSearchResult: declare class MathUtils_LineSearchResult

  constructor

  IsValid: boolean

  Alpha: number

  FNew: number

  NbEvals: number

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_RandomGenerator: declare class MathUtils_RandomGenerator

  constructor

  SetSeed(theSeed: number): void;

  NextInt(): number;

  NextReal(): number;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_DecompResult: declare class MathUtils_DecompResult

  constructor

  Status: MathUtils_Status

  L: math_Matrix | null | undefined

  U: math_Matrix | null | undefined

  D: math_VectorBase_double | null | undefined

  Determinant: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_EigenResult: declare class MathUtils_EigenResult

  constructor

  Status: MathUtils_Status

  NbIterations: number

  EigenValues: math_VectorBase_double | null | undefined

  EigenVectors: math_Matrix | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_IntegResult: declare class MathUtils_IntegResult

  constructor

  Status: MathUtils_Status

  NbIterations: number

  NbPoints: number

  Value: number | null | undefined

  AbsoluteError: number | null | undefined

  RelativeError: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_InverseResult: declare class MathUtils_InverseResult

  constructor

  Status: MathUtils_Status

  Inverse: math_Matrix | null | undefined

  Determinant: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_LinearMultipleResult: declare class MathUtils_LinearMultipleResult

  constructor

  Status: MathUtils_Status

  Solutions: math_Matrix | null | undefined

  Determinant: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_LinearResult: declare class MathUtils_LinearResult

  constructor

  Status: MathUtils_Status

  Solution: math_VectorBase_double | null | undefined

  Determinant: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_PolyResult: declare class MathUtils_PolyResult

  constructor

  Status: MathUtils_Status

  NbRoots: number

  Roots: [number, number, number, number]

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_ScalarResult: declare class MathUtils_ScalarResult

  constructor

  Status: MathUtils_Status

  NbIterations: number

  Root: number | null | undefined

  Value: number | null | undefined

  Derivative: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathUtils_Status: typeof MathUtils_Status[keyof typeof MathUtils_Status]

MathUtils_VectorResult: declare class MathUtils_VectorResult

  constructor

  Status: MathUtils_Status

  NbIterations: number

  Solution: math_VectorBase_double | null | undefined

  Value: number | null | undefined

  Gradient: math_VectorBase_double | null | undefined

  Jacobian: math_Matrix | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
