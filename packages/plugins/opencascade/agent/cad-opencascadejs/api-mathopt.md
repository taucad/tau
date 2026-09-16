# libcascade — MathOpt

13 top-level symbols. Signatures are verbatim typescript.

MathOpt_ConjugateGradientFormula: typeof MathOpt_ConjugateGradientFormula[keyof typeof MathOpt_ConjugateGradientFormula]

MathOpt_FRPRConfig: declare class MathOpt_FRPRConfig extends MathUtils_Config

  constructor

  Formula: MathOpt_ConjugateGradientFormula

  RestartInterval: number

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_GlobalConfig: declare class MathOpt_GlobalConfig extends MathUtils_NDimConfig

  constructor

  Strategy: MathOpt_GlobalStrategy

  NbPopulation: number

  NbStarts: number

  MutationScale: number

  CrossoverProb: number

  Seed: number

  PolishBudgetPerDim: number

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_GlobalStrategy: typeof MathOpt_GlobalStrategy[keyof typeof MathOpt_GlobalStrategy]

MathOpt_NewtonConfig: declare class MathOpt_NewtonConfig extends MathUtils_Config

  constructor

  Regularization: number

  UseLineSearch: boolean

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_PSOBoundaryMode: typeof MathOpt_PSOBoundaryMode[keyof typeof MathOpt_PSOBoundaryMode]

MathOpt_PSOConfig: declare class MathOpt_PSOConfig extends MathUtils_NDimConfig

  constructor

  NbParticles: number

  Omega: number

  PhiPersonal: number

  PhiGlobal: number

  VelocityClamp: number

  Seed: number

  InitMode: MathOpt_PSOInitMode

  BoundaryMode: MathOpt_PSOBoundaryMode

  InertiaSchedule: MathOpt_PSOInertiaSchedule

  OmegaMin: number

  MinIterations: number

  TargetValue: number | null | undefined

  NoImproveTol: number

  NoImproveIters: number

  RestartFraction: number

  MaxRestarts: number

  PolishBudgetPerDim: number

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_PSOInertiaSchedule: typeof MathOpt_PSOInertiaSchedule[keyof typeof MathOpt_PSOInertiaSchedule]

MathOpt_PSOInitMode: typeof MathOpt_PSOInitMode[keyof typeof MathOpt_PSOInitMode]

MathOpt_PSOSeedParticle: declare class MathOpt_PSOSeedParticle

  constructor

  Position: math_VectorBase_double

  Value: number | null | undefined

  Velocity: math_VectorBase_double | null | undefined

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_PSOStats: declare class MathOpt_PSOStats

  constructor

  NbFunctionEvals: number

  NbIterations: number

  NbBoundaryCorrections: number

  NbStagnationEvents: number

  NbRestarts: number

  InitialBest: number

  FinalBest: number

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_UzawaConfig: declare class MathOpt_UzawaConfig

  constructor

  EpsLix: number

  EpsLic: number

  MaxIterations: number

  delete(): void;

  [Symbol.dispose](): void;

MathOpt_UzawaResult: declare class MathOpt_UzawaResult

  constructor

  Status: MathUtils_Status

  Solution: math_VectorBase_double | null | undefined

  Dual: math_VectorBase_double | null | undefined

  Error: math_VectorBase_double | null | undefined

  InitialError: math_VectorBase_double | null | undefined

  InverseCTC: math_Matrix | null | undefined

  NbIterations: number

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
