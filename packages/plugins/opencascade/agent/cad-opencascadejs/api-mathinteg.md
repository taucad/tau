# libcascade — MathInteg

4 top-level symbols. Signatures are verbatim typescript.

MathInteg_DoubleExpConfig: declare class MathInteg_DoubleExpConfig extends MathUtils_IntegConfig

  // MathInteg_DoubleExpConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  NbLevels: number

  StepFactor: number

  // MathInteg_DoubleExpConfig.delete (method)
  delete(): void;

  // MathInteg_DoubleExpConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathInteg_KronrodConfig: declare class MathInteg_KronrodConfig extends MathUtils_IntegConfig

  // MathInteg_KronrodConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  NbGaussPoints: number

  Adaptive: boolean

  // MathInteg_KronrodConfig.delete (method)
  delete(): void;

  // MathInteg_KronrodConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathInteg_MultipleConfig: declare class MathInteg_MultipleConfig

  // MathInteg_MultipleConfig.constructor (constructor)
  constructor();

  MaxOrder: number

  // MathInteg_MultipleConfig.delete (method)
  delete(): void;

  // MathInteg_MultipleConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathInteg_SetResult: declare class MathInteg_SetResult

  // MathInteg_SetResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Values: math_VectorBase_double | null | undefined

  NbEquations: number

  // MathInteg_SetResult.IsDone (method)
  IsDone(): boolean;

  // MathInteg_SetResult.delete (method)
  delete(): void;

  // MathInteg_SetResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
