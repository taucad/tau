# libcascade — MathUtils

40 top-level symbols. Signatures are verbatim typescript.

MathUtils_BracketResult: declare class MathUtils_BracketResult

  // MathUtils_BracketResult.constructor (constructor)
  constructor();

  IsValid: boolean

  A: number

  B: number

  Fa: number

  Fb: number

  // MathUtils_BracketResult.delete (method)
  delete(): void;

  // MathUtils_BracketResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_MinBracketOptions: declare class MathUtils_MinBracketOptions

  // MathUtils_MinBracketOptions.constructor (constructor)
  constructor();

  MaxIterations: number

  UseLimits: boolean

  LeftLimit: number

  RightLimit: number

  HasFA: boolean

  HasFB: boolean

  FA: number

  FB: number

  // MathUtils_MinBracketOptions.delete (method)
  delete(): void;

  // MathUtils_MinBracketOptions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_MinBracketResult: declare class MathUtils_MinBracketResult

  // MathUtils_MinBracketResult.constructor (constructor)
  constructor();

  IsValid: boolean

  A: number

  B: number

  C: number

  Fa: number

  Fb: number

  Fc: number

  // MathUtils_MinBracketResult.delete (method)
  delete(): void;

  // MathUtils_MinBracketResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_BoundedConfig: declare class MathUtils_BoundedConfig extends MathUtils_Config

  // MathUtils_BoundedConfig.constructor (constructor)
  constructor();
  constructor(theLower: number, theUpper: number, theTolerance?: number, theMaxIter?: number);

  LowerBound: number

  UpperBound: number

  // MathUtils_BoundedConfig.delete (method)
  delete(): void;

  // MathUtils_BoundedConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Config: declare class MathUtils_Config

  // MathUtils_Config.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  MaxIterations: number

  Tolerance: number

  XTolerance: number

  FTolerance: number

  StepMin: number

  // MathUtils_Config.delete (method)
  delete(): void;

  // MathUtils_Config.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_IntegConfig: declare class MathUtils_IntegConfig

  // MathUtils_IntegConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  InitialOrder: number

  MaxOrder: number

  MaxIterations: number

  Tolerance: number

  // MathUtils_IntegConfig.delete (method)
  delete(): void;

  // MathUtils_IntegConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_LinConfig: declare class MathUtils_LinConfig

  // MathUtils_LinConfig.constructor (constructor)
  constructor();

  SingularityTolerance: number

  UsePivoting: boolean

  // MathUtils_LinConfig.delete (method)
  delete(): void;

  // MathUtils_LinConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_NDimConfig: declare class MathUtils_NDimConfig extends MathUtils_Config

  // MathUtils_NDimConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number, theUseBounds?: boolean);

  UseBounds: boolean

  // MathUtils_NDimConfig.delete (method)
  delete(): void;

  // MathUtils_NDimConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Domain1D: declare class MathUtils_Domain1D

  // MathUtils_Domain1D.constructor (constructor)
  constructor();
  constructor(theMin: number, theMax: number);

  Min: number

  Max: number

  // MathUtils_Domain1D.Length (method)
  Length(): number;

  // MathUtils_Domain1D.Mid (method)
  Mid(): number;

  // MathUtils_Domain1D.Contains (method)
  Contains(theU: number, theTol?: number): boolean;

  // MathUtils_Domain1D.Clamp (method)
  Clamp(theU: number): number;

  // MathUtils_Domain1D.IsLarge (method)
  IsLarge(theThreshold?: number): boolean;

  // MathUtils_Domain1D.IsFullPeriod (method)
  IsFullPeriod(thePeriod: number, theTol?: number): boolean;

  // MathUtils_Domain1D.Lerp (method)
  Lerp(theT: number): number;

  // MathUtils_Domain1D.Normalize (method)
  Normalize(theU: number): number;

  // MathUtils_Domain1D.IsFinite (method)
  IsFinite(theInfLimit?: number): boolean;

  // MathUtils_Domain1D.IsEqual (method)
  IsEqual(theOther: MathUtils_Domain1D, theTol?: number): boolean;

  // MathUtils_Domain1D.delete (method)
  delete(): void;

  // MathUtils_Domain1D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Domain2D: declare class MathUtils_Domain2D

  // MathUtils_Domain2D.constructor (constructor)
  constructor();
  constructor(theUDomain: MathUtils_Domain1D, theVDomain: MathUtils_Domain1D);
  constructor(theUMin: number, theUMax: number, theVMin: number, theVMax: number);

  UMin: number

  UMax: number

  VMin: number

  VMax: number

  // MathUtils_Domain2D.U (method)
  U(): MathUtils_Domain1D;

  // MathUtils_Domain2D.V (method)
  V(): MathUtils_Domain1D;

  // MathUtils_Domain2D.ULength (method)
  ULength(): number;

  // MathUtils_Domain2D.VLength (method)
  VLength(): number;

  // MathUtils_Domain2D.UMid (method)
  UMid(): number;

  // MathUtils_Domain2D.VMid (method)
  VMid(): number;

  // MathUtils_Domain2D.Contains (method)
  Contains(theU: number, theV: number, theTol?: number): boolean;

  // MathUtils_Domain2D.Clamp (method)
  Clamp(theU?: number, theV?: number): { theU: number; theV: number };

  // MathUtils_Domain2D.IsLarge (method)
  IsLarge(theThreshold?: number): boolean;

  // MathUtils_Domain2D.IsUFullPeriod (method)
  IsUFullPeriod(thePeriod: number, theTol?: number): boolean;

  // MathUtils_Domain2D.IsVFullPeriod (method)
  IsVFullPeriod(thePeriod: number, theTol?: number): boolean;

  // MathUtils_Domain2D.IsFinite (method)
  IsFinite(theInfLimit?: number): boolean;

  // MathUtils_Domain2D.delete (method)
  delete(): void;

  // MathUtils_Domain2D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Constant: declare class MathUtils_Constant

  // MathUtils_Constant.constructor (constructor)
  constructor(theValue: number);

  // MathUtils_Constant.Value (method)
  Value(argNo0: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Constant.Values (method)
  Values(argNo0: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Constant.delete (method)
  delete(): void;

  // MathUtils_Constant.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Cosine: declare class MathUtils_Cosine

  // MathUtils_Cosine.constructor (constructor)
  constructor(theAmplitude?: number, theFrequency?: number, thePhase?: number, theOffset?: number);

  // MathUtils_Cosine.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Cosine.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Cosine.delete (method)
  delete(): void;

  // MathUtils_Cosine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Exponential: declare class MathUtils_Exponential

  // MathUtils_Exponential.constructor (constructor)
  constructor(theScale?: number, theRate?: number, theOffset?: number);

  // MathUtils_Exponential.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Exponential.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Exponential.delete (method)
  delete(): void;

  // MathUtils_Exponential.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Gaussian: declare class MathUtils_Gaussian

  // MathUtils_Gaussian.constructor (constructor)
  constructor(theAmplitude?: number, theMean?: number, theSigma?: number);

  // MathUtils_Gaussian.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Gaussian.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Gaussian.delete (method)
  delete(): void;

  // MathUtils_Gaussian.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Linear: declare class MathUtils_Linear

  // MathUtils_Linear.constructor (constructor)
  constructor(theSlope: number, theIntercept: number);

  // MathUtils_Linear.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Linear.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Linear.delete (method)
  delete(): void;

  // MathUtils_Linear.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Polynomial: declare class MathUtils_Polynomial

  // MathUtils_Polynomial.constructor (constructor)
  constructor(theCoeffs: number[]);
  constructor(theCoeffs: math_VectorBase_double);

  // MathUtils_Polynomial.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Polynomial.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Polynomial.Degree (method)
  Degree(): number;

  // MathUtils_Polynomial.Coefficient (method)
  Coefficient(theIndex: number): number;

  // MathUtils_Polynomial.delete (method)
  delete(): void;

  // MathUtils_Polynomial.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Power: declare class MathUtils_Power

  // MathUtils_Power.constructor (constructor)
  constructor(theExponent: number, theScale?: number, theOffset?: number);

  // MathUtils_Power.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Power.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Power.delete (method)
  delete(): void;

  // MathUtils_Power.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Rational: declare class MathUtils_Rational

  // MathUtils_Rational.constructor (constructor)
  constructor(theNum: math_VectorBase_double, theDenom: math_VectorBase_double);
  constructor(theNum: number[], theDenom: number[]);

  // MathUtils_Rational.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Rational.delete (method)
  delete(): void;

  // MathUtils_Rational.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Sine: declare class MathUtils_Sine

  // MathUtils_Sine.constructor (constructor)
  constructor(theAmplitude?: number, theFrequency?: number, thePhase?: number, theOffset?: number);

  // MathUtils_Sine.Value (method)
  Value(theX: number, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Sine.Values (method)
  Values(theX: number, theY?: number, theDY?: number): { returnValue: boolean; theY: number; theDY: number };

  // MathUtils_Sine.delete (method)
  delete(): void;

  // MathUtils_Sine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Ackley: declare class MathUtils_Ackley

  // MathUtils_Ackley.constructor (constructor)
  constructor(theA?: number, theB?: number, theC?: number);

  // MathUtils_Ackley.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Ackley.delete (method)
  delete(): void;

  // MathUtils_Ackley.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Beale: declare class MathUtils_Beale

  // MathUtils_Beale.constructor (constructor)
  constructor();

  // MathUtils_Beale.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Beale.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_Beale.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_Beale.delete (method)
  delete(): void;

  // MathUtils_Beale.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Booth: declare class MathUtils_Booth

  // MathUtils_Booth.constructor (constructor)
  constructor();

  // MathUtils_Booth.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Booth.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_Booth.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_Booth.delete (method)
  delete(): void;

  // MathUtils_Booth.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Himmelblau: declare class MathUtils_Himmelblau

  // MathUtils_Himmelblau.constructor (constructor)
  constructor();

  // MathUtils_Himmelblau.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Himmelblau.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_Himmelblau.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_Himmelblau.delete (method)
  delete(): void;

  // MathUtils_Himmelblau.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_LinearResidual: declare class MathUtils_LinearResidual

  // MathUtils_LinearResidual.constructor (constructor)
  constructor(theA: math_Matrix, theB: math_VectorBase_double);

  // MathUtils_LinearResidual.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_LinearResidual.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_LinearResidual.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_LinearResidual.delete (method)
  delete(): void;

  // MathUtils_LinearResidual.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_QuadraticForm: declare class MathUtils_QuadraticForm

  // MathUtils_QuadraticForm.constructor (constructor)
  constructor(theA: math_Matrix, theB: math_VectorBase_double, theC: number);

  // MathUtils_QuadraticForm.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_QuadraticForm.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_QuadraticForm.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_QuadraticForm.delete (method)
  delete(): void;

  // MathUtils_QuadraticForm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Rastrigin: declare class MathUtils_Rastrigin

  // MathUtils_Rastrigin.constructor (constructor)
  constructor(theA?: number);

  // MathUtils_Rastrigin.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Rastrigin.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_Rastrigin.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_Rastrigin.delete (method)
  delete(): void;

  // MathUtils_Rastrigin.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Rosenbrock: declare class MathUtils_Rosenbrock

  // MathUtils_Rosenbrock.constructor (constructor)
  constructor(theA?: number, theB?: number);

  // MathUtils_Rosenbrock.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Rosenbrock.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_Rosenbrock.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_Rosenbrock.delete (method)
  delete(): void;

  // MathUtils_Rosenbrock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Sphere: declare class MathUtils_Sphere

  // MathUtils_Sphere.constructor (constructor)
  constructor();

  // MathUtils_Sphere.Value (method)
  Value(theX: math_VectorBase_double, theY?: number): { returnValue: boolean; theY: number };

  // MathUtils_Sphere.Gradient (method)
  Gradient(theX: math_VectorBase_double, theG: math_VectorBase_double): boolean;

  // MathUtils_Sphere.Values (method)
  Values(theX: math_VectorBase_double, theY: number, theG: math_VectorBase_double): { returnValue: boolean; theY: number };

  // MathUtils_Sphere.delete (method)
  delete(): void;

  // MathUtils_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_LineSearchResult: declare class MathUtils_LineSearchResult

  // MathUtils_LineSearchResult.constructor (constructor)
  constructor();

  IsValid: boolean

  Alpha: number

  FNew: number

  NbEvals: number

  // MathUtils_LineSearchResult.delete (method)
  delete(): void;

  // MathUtils_LineSearchResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_RandomGenerator: declare class MathUtils_RandomGenerator

  // MathUtils_RandomGenerator.constructor (constructor)
  constructor(theSeed?: number);

  // MathUtils_RandomGenerator.SetSeed (method)
  SetSeed(theSeed: number): void;

  // MathUtils_RandomGenerator.NextInt (method)
  NextInt(): number;

  // MathUtils_RandomGenerator.NextReal (method)
  NextReal(): number;

  // MathUtils_RandomGenerator.delete (method)
  delete(): void;

  // MathUtils_RandomGenerator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_DecompResult: declare class MathUtils_DecompResult

  // MathUtils_DecompResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  L: math_Matrix | null | undefined

  U: math_Matrix | null | undefined

  D: math_VectorBase_double | null | undefined

  Determinant: number | null | undefined

  // MathUtils_DecompResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_DecompResult.delete (method)
  delete(): void;

  // MathUtils_DecompResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_EigenResult: declare class MathUtils_EigenResult

  // MathUtils_EigenResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  NbIterations: number

  EigenValues: math_VectorBase_double | null | undefined

  EigenVectors: math_Matrix | null | undefined

  // MathUtils_EigenResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_EigenResult.delete (method)
  delete(): void;

  // MathUtils_EigenResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_IntegResult: declare class MathUtils_IntegResult

  // MathUtils_IntegResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  NbIterations: number

  NbPoints: number

  Value: number | null | undefined

  AbsoluteError: number | null | undefined

  RelativeError: number | null | undefined

  // MathUtils_IntegResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_IntegResult.delete (method)
  delete(): void;

  // MathUtils_IntegResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_InverseResult: declare class MathUtils_InverseResult

  // MathUtils_InverseResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Inverse: math_Matrix | null | undefined

  Determinant: number | null | undefined

  // MathUtils_InverseResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_InverseResult.delete (method)
  delete(): void;

  // MathUtils_InverseResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_LinearMultipleResult: declare class MathUtils_LinearMultipleResult

  // MathUtils_LinearMultipleResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Solutions: math_Matrix | null | undefined

  Determinant: number | null | undefined

  // MathUtils_LinearMultipleResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_LinearMultipleResult.delete (method)
  delete(): void;

  // MathUtils_LinearMultipleResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_LinearResult: declare class MathUtils_LinearResult

  // MathUtils_LinearResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Solution: math_VectorBase_double | null | undefined

  Determinant: number | null | undefined

  // MathUtils_LinearResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_LinearResult.delete (method)
  delete(): void;

  // MathUtils_LinearResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_PolyResult: declare class MathUtils_PolyResult

  // MathUtils_PolyResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  NbRoots: number

  Roots: [number, number, number, number]

  // MathUtils_PolyResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_PolyResult.delete (method)
  delete(): void;

  // MathUtils_PolyResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_ScalarResult: declare class MathUtils_ScalarResult

  // MathUtils_ScalarResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  NbIterations: number

  Root: number | null | undefined

  Value: number | null | undefined

  Derivative: number | null | undefined

  // MathUtils_ScalarResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_ScalarResult.delete (method)
  delete(): void;

  // MathUtils_ScalarResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathUtils_Status: typeof MathUtils_Status[keyof typeof MathUtils_Status]

  readonly OK: 'OK'

  readonly NotConverged: 'NotConverged'

  readonly MaxIterations: 'MaxIterations'

  readonly NumericalError: 'NumericalError'

  readonly InvalidInput: 'InvalidInput'

  readonly InfiniteSolutions: 'InfiniteSolutions'

  readonly NoSolution: 'NoSolution'

  readonly NotPositiveDefinite: 'NotPositiveDefinite'

  readonly Singular: 'Singular'

  readonly NonDescentDirection: 'NonDescentDirection'

MathUtils_VectorResult: declare class MathUtils_VectorResult

  // MathUtils_VectorResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  NbIterations: number

  Solution: math_VectorBase_double | null | undefined

  Value: number | null | undefined

  Gradient: math_VectorBase_double | null | undefined

  Jacobian: math_Matrix | null | undefined

  // MathUtils_VectorResult.IsDone (method)
  IsDone(): boolean;

  // MathUtils_VectorResult.delete (method)
  delete(): void;

  // MathUtils_VectorResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
