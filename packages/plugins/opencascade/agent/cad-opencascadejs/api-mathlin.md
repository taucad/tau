# libcascade — MathLin

7 top-level symbols. Signatures are verbatim typescript.

MathLin_CroutResult: declare class MathLin_CroutResult

  constructor

  Status: MathUtils_Status

  L: math_Matrix | null | undefined

  D: math_VectorBase_double | null | undefined

  Inverse: math_Matrix | null | undefined

  Determinant: number | null | undefined

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathLin_EigenResult: declare class MathLin_EigenResult

  constructor

  Status: MathUtils_Status

  EigenValues: math_VectorBase_double | null | undefined

  EigenVectors: math_Matrix | null | undefined

  Dimension: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathLin_LUResult: declare class MathLin_LUResult

  constructor

  Status: MathUtils_Status

  LU: math_Matrix | null | undefined

  Pivot: math_VectorBase_int | null | undefined

  Determinant: number | null | undefined

  Sign: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathLin_QRResult: declare class MathLin_QRResult

  constructor

  Status: MathUtils_Status

  Q: math_Matrix | null | undefined

  R: math_Matrix | null | undefined

  Rank: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathLin_LeastSquaresMethod: typeof MathLin_LeastSquaresMethod[keyof typeof MathLin_LeastSquaresMethod]

MathLin_LeastSquaresResult: declare class MathLin_LeastSquaresResult

  constructor

  Status: MathUtils_Status

  Solution: math_VectorBase_double | null | undefined

  Residual: number | null | undefined

  ResidualSq: number | null | undefined

  Rank: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

MathLin_SVDResult: declare class MathLin_SVDResult

  constructor

  Status: MathUtils_Status

  U: math_Matrix | null | undefined

  SingularValues: math_VectorBase_double | null | undefined

  V: math_Matrix | null | undefined

  Rank: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
