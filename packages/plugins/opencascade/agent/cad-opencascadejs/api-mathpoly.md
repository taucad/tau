# libcascade — MathPoly

1 top-level symbols. Signatures are verbatim typescript.

MathPoly_GeneralPolyResult: declare class MathPoly_GeneralPolyResult

  constructor

  Status: MathUtils_Status

  Roots: number[]

  ComplexRoots: any[]

  NbRoots: number

  NbComplexRoots: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
