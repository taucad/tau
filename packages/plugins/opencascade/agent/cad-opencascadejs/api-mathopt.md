# libcascade — MathOpt

13 top-level symbols. Signatures are verbatim typescript.

MathOpt_ConjugateGradientFormula: typeof MathOpt_ConjugateGradientFormula[keyof typeof MathOpt_ConjugateGradientFormula]

  readonly FletcherReeves: 'FletcherReeves'

  readonly PolakRibiere: 'PolakRibiere'

  readonly HestenesStiefel: 'HestenesStiefel'

  readonly DaiYuan: 'DaiYuan'

MathOpt_FRPRConfig: declare class MathOpt_FRPRConfig extends MathUtils_Config

  // MathOpt_FRPRConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  Formula: MathOpt_ConjugateGradientFormula

  RestartInterval: number

  // MathOpt_FRPRConfig.delete (method)
  delete(): void;

  // MathOpt_FRPRConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_GlobalConfig: declare class MathOpt_GlobalConfig extends MathUtils_NDimConfig

  // MathOpt_GlobalConfig.constructor (constructor)
  constructor();
  constructor(theStrategy: MathOpt_GlobalStrategy, theMaxIter?: number);

  Strategy: MathOpt_GlobalStrategy

  NbPopulation: number

  NbStarts: number

  MutationScale: number

  CrossoverProb: number

  Seed: number

  PolishBudgetPerDim: number

  // MathOpt_GlobalConfig.delete (method)
  delete(): void;

  // MathOpt_GlobalConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_GlobalStrategy: typeof MathOpt_GlobalStrategy[keyof typeof MathOpt_GlobalStrategy]

  readonly PSO: 'PSO'

  readonly MultiStart: 'MultiStart'

  readonly PSOHybrid: 'PSOHybrid'

  readonly DifferentialEvolution: 'DifferentialEvolution'

MathOpt_NewtonConfig: declare class MathOpt_NewtonConfig extends MathUtils_Config

  // MathOpt_NewtonConfig.constructor (constructor)
  constructor();
  constructor(theTolerance: number, theMaxIter?: number);

  Regularization: number

  UseLineSearch: boolean

  // MathOpt_NewtonConfig.delete (method)
  delete(): void;

  // MathOpt_NewtonConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_PSOBoundaryMode: typeof MathOpt_PSOBoundaryMode[keyof typeof MathOpt_PSOBoundaryMode]

  readonly Clamp: 'Clamp'

  readonly Reflect: 'Reflect'

  readonly Wrap: 'Wrap'

MathOpt_PSOConfig: declare class MathOpt_PSOConfig extends MathUtils_NDimConfig

  // MathOpt_PSOConfig.constructor (constructor)
  constructor();
  constructor(theNbParticles: number, theMaxIter?: number, theTolerance?: number);

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

  // MathOpt_PSOConfig.delete (method)
  delete(): void;

  // MathOpt_PSOConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_PSOInertiaSchedule: typeof MathOpt_PSOInertiaSchedule[keyof typeof MathOpt_PSOInertiaSchedule]

  readonly Constant: 'Constant'

  readonly LinearDecay: 'LinearDecay'

MathOpt_PSOInitMode: typeof MathOpt_PSOInitMode[keyof typeof MathOpt_PSOInitMode]

  readonly RandomOnly: 'RandomOnly'

  readonly SeededOnly: 'SeededOnly'

  readonly SeededPlusRandom: 'SeededPlusRandom'

MathOpt_PSOSeedParticle: declare class MathOpt_PSOSeedParticle

  // MathOpt_PSOSeedParticle.constructor (constructor)
  constructor(thePos: math_VectorBase_double);
  constructor(thePos: math_VectorBase_double, theValue: number);

  Position: math_VectorBase_double

  Value: number | null | undefined

  Velocity: math_VectorBase_double | null | undefined

  // MathOpt_PSOSeedParticle.delete (method)
  delete(): void;

  // MathOpt_PSOSeedParticle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_PSOStats: declare class MathOpt_PSOStats

  // MathOpt_PSOStats.constructor (constructor)
  constructor();

  NbFunctionEvals: number

  NbIterations: number

  NbBoundaryCorrections: number

  NbStagnationEvents: number

  NbRestarts: number

  InitialBest: number

  FinalBest: number

  // MathOpt_PSOStats.delete (method)
  delete(): void;

  // MathOpt_PSOStats.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_UzawaConfig: declare class MathOpt_UzawaConfig

  // MathOpt_UzawaConfig.constructor (constructor)
  constructor();

  EpsLix: number

  EpsLic: number

  MaxIterations: number

  // MathOpt_UzawaConfig.delete (method)
  delete(): void;

  // MathOpt_UzawaConfig.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

MathOpt_UzawaResult: declare class MathOpt_UzawaResult

  // MathOpt_UzawaResult.constructor (constructor)
  constructor();

  Status: MathUtils_Status

  Solution: math_VectorBase_double | null | undefined

  Dual: math_VectorBase_double | null | undefined

  Error: math_VectorBase_double | null | undefined

  InitialError: math_VectorBase_double | null | undefined

  InverseCTC: math_Matrix | null | undefined

  NbIterations: number

  // MathOpt_UzawaResult.IsDone (method)
  IsDone(): boolean;

  // MathOpt_UzawaResult.delete (method)
  delete(): void;

  // MathOpt_UzawaResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
