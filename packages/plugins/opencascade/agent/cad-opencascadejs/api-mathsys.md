# libcascade — MathSys

2 top-level symbols. Signatures are verbatim typescript.

MathSys_LMConfig: declare class MathSys_LMConfig extends MathUtils_Config

  // MathSys_LMConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  LambdaInit: number

  LambdaIncrease: number

  LambdaDecrease: number

  LambdaMax: number

  LambdaMin: number

  // MathSys_LMConfig.delete (method)
  delete(): void;

  // MathSys_LMConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathSys_NewtonOptions: declare class MathSys_NewtonOptions extends MathUtils_Config

  // MathSys_NewtonOptions.constructor (constructor)
  constructor();

  MaxStepRatio: number

  EnableLineSearch: boolean

  AllowSoftBounds: boolean

  SoftBoundsExtension: number

  // MathSys_NewtonOptions.delete (method)
  delete(): void;

  // MathSys_NewtonOptions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
