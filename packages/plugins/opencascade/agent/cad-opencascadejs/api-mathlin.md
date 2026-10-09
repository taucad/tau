# libcascade — MathLin

7 top-level symbols. Signatures are verbatim typescript.

MathLin_CroutResult: declare class MathLin_CroutResult

  // MathLin_CroutResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  L: math_Matrix | null | undefined

  D: math_VectorBase_double | null | undefined

  Inverse: math_Matrix | null | undefined

  Determinant: number | null | undefined

  // MathLin_CroutResult.IsDone (method)
  IsDone(): boolean;

  // MathLin_CroutResult.delete (method)
  delete(): void;

  // MathLin_CroutResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathLin_EigenResult: declare class MathLin_EigenResult

  // MathLin_EigenResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  EigenValues: math_VectorBase_double | null | undefined

  EigenVectors: math_Matrix | null | undefined

  Dimension: number

  // MathLin_EigenResult.IsDone (method)
  IsDone(): boolean;

  // MathLin_EigenResult.delete (method)
  delete(): void;

  // MathLin_EigenResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathLin_LUResult: declare class MathLin_LUResult

  // MathLin_LUResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  LU: math_Matrix | null | undefined

  Pivot: math_VectorBase_int | null | undefined

  Determinant: number | null | undefined

  Sign: number

  // MathLin_LUResult.IsDone (method)
  IsDone(): boolean;

  // MathLin_LUResult.delete (method)
  delete(): void;

  // MathLin_LUResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathLin_QRResult: declare class MathLin_QRResult

  // MathLin_QRResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Q: math_Matrix | null | undefined

  R: math_Matrix | null | undefined

  Rank: number

  // MathLin_QRResult.IsDone (method)
  IsDone(): boolean;

  // MathLin_QRResult.delete (method)
  delete(): void;

  // MathLin_QRResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathLin_LeastSquaresMethod: typeof MathLin_LeastSquaresMethod[keyof typeof MathLin_LeastSquaresMethod]

  readonly NormalEquations: 'NormalEquations'

  readonly QR: 'QR'

  readonly SVD: 'SVD'

MathLin_LeastSquaresResult: declare class MathLin_LeastSquaresResult

  // MathLin_LeastSquaresResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Solution: math_VectorBase_double | null | undefined

  Residual: number | null | undefined

  ResidualSq: number | null | undefined

  Rank: number

  // MathLin_LeastSquaresResult.IsDone (method)
  IsDone(): boolean;

  // MathLin_LeastSquaresResult.delete (method)
  delete(): void;

  // MathLin_LeastSquaresResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathLin_SVDResult: declare class MathLin_SVDResult

  // MathLin_SVDResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  U: math_Matrix | null | undefined

  SingularValues: math_VectorBase_double | null | undefined

  V: math_Matrix | null | undefined

  Rank: number

  // MathLin_SVDResult.IsDone (method)
  IsDone(): boolean;

  // MathLin_SVDResult.delete (method)
  delete(): void;

  // MathLin_SVDResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
