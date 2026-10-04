# libcascade — MathPoly

1 top-level symbols. Signatures are verbatim typescript.

MathPoly_GeneralPolyResult: declare class MathPoly_GeneralPolyResult

  // MathPoly_GeneralPolyResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Roots: number[]

  ComplexRoots: any[]

  NbRoots: number

  NbComplexRoots: number

  // MathPoly_GeneralPolyResult.IsDone (method)
  IsDone(): boolean;

  // MathPoly_GeneralPolyResult.delete (method)
  delete(): void;

  // MathPoly_GeneralPolyResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
