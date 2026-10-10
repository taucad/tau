# libcascade — GCPnts

10 top-level symbols. Signatures are verbatim typescript.

GCPnts_AbscissaPoint: declare class GCPnts_AbscissaPoint

  // GCPnts_AbscissaPoint.constructor (constructor)
  constructor();
  constructor(theC: Adaptor3d_Curve, theAbscissa: number, theU0: number);
  constructor(theC: Adaptor2d_Curve2d, theAbscissa: number, theU0: number);
  constructor(theTol: number, theC: Adaptor3d_Curve, theAbscissa: number, theU0: number);
  constructor(theTol: number, theC: Adaptor2d_Curve2d, theAbscissa: number, theU0: number);
  constructor(theC: Adaptor3d_Curve, theAbscissa: number, theU0: number, theUi: number);
  constructor(theC: Adaptor2d_Curve2d, theAbscissa: number, theU0: number, theUi: number);
  constructor(theC: Adaptor3d_Curve, theAbscissa: number, theU0: number, theUi: number, theTol: number);
  constructor(theC: Adaptor2d_Curve2d, theAbscissa: number, theU0: number, theUi: number, theTol: number);

  // GCPnts_AbscissaPoint.Length (method)
  static Length(theC: Adaptor3d_Curve): number;
  static Length(theC: Adaptor2d_Curve2d): number;
  static Length(theC: Adaptor3d_Curve, theTol: number): number;
  static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
  static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
  static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
  static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
  static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;

  // GCPnts_AbscissaPoint.IsDone (method)
  IsDone(): boolean;

  // GCPnts_AbscissaPoint.Parameter (method)
  Parameter(): number;

  // GCPnts_AbscissaPoint.delete (method)
  delete(): void;

  // GCPnts_AbscissaPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_AbscissaType: typeof GCPnts_AbscissaType[keyof typeof GCPnts_AbscissaType]

  readonly GCPnts_LengthParametrized: 'GCPnts_LengthParametrized'

  readonly GCPnts_Parametrized: 'GCPnts_Parametrized'

  readonly GCPnts_AbsComposite: 'GCPnts_AbsComposite'

GCPnts_DeflectionType: typeof GCPnts_DeflectionType[keyof typeof GCPnts_DeflectionType]

  readonly GCPnts_Linear: 'GCPnts_Linear'

  readonly GCPnts_Circular: 'GCPnts_Circular'

  readonly GCPnts_Curved: 'GCPnts_Curved'

  readonly GCPnts_DefComposite: 'GCPnts_DefComposite'

GCPnts_DistFunctionMV: declare class GCPnts_DistFunctionMV extends math_MultipleVarFunction

  // GCPnts_DistFunctionMV.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GCPnts_DistFunctionMV.NbVariables (method)
  NbVariables(): number;

  // GCPnts_DistFunctionMV.delete (method)
  delete(): void;

  // GCPnts_DistFunctionMV.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_DistFunction2dMV: declare class GCPnts_DistFunction2dMV extends math_MultipleVarFunction

  // GCPnts_DistFunction2dMV.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GCPnts_DistFunction2dMV.NbVariables (method)
  NbVariables(): number;

  // GCPnts_DistFunction2dMV.delete (method)
  delete(): void;

  // GCPnts_DistFunction2dMV.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_QuasiUniformAbscissa: declare class GCPnts_QuasiUniformAbscissa

  // GCPnts_QuasiUniformAbscissa.constructor (constructor)
  constructor();
  constructor(theC: Adaptor3d_Curve, theNbPoints: number);
  constructor(theC: Adaptor2d_Curve2d, theNbPoints: number);
  constructor(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number);
  constructor(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number);

  // GCPnts_QuasiUniformAbscissa.Initialize (method)
  Initialize(theC: Adaptor3d_Curve, theNbPoints: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number): void;
  Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number): void;

  // GCPnts_QuasiUniformAbscissa.IsDone (method)
  IsDone(): boolean;

  // GCPnts_QuasiUniformAbscissa.NbPoints (method)
  NbPoints(): number;

  // GCPnts_QuasiUniformAbscissa.Parameter (method)
  Parameter(Index: number): number;

  // GCPnts_QuasiUniformAbscissa.delete (method)
  delete(): void;

  // GCPnts_QuasiUniformAbscissa.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_QuasiUniformDeflection: declare class GCPnts_QuasiUniformDeflection

  // GCPnts_QuasiUniformDeflection.constructor (constructor)
  constructor();
  constructor(theC: Adaptor3d_Curve, theDeflection: number, theContinuity?: GeomAbs_Shape);
  constructor(theC: Adaptor2d_Curve2d, theDeflection: number, theContinuity?: GeomAbs_Shape);
  constructor(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theContinuity?: GeomAbs_Shape);
  constructor(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theContinuity?: GeomAbs_Shape);

  // GCPnts_QuasiUniformDeflection.Initialize (method)
  Initialize(theC: Adaptor3d_Curve, theDeflection: number, theContinuity: GeomAbs_Shape): void;
  Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theContinuity: GeomAbs_Shape): void;
  Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
  Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;

  // GCPnts_QuasiUniformDeflection.IsDone (method)
  IsDone(): boolean;

  // GCPnts_QuasiUniformDeflection.NbPoints (method)
  NbPoints(): number;

  // GCPnts_QuasiUniformDeflection.Parameter (method)
  Parameter(Index: number): number;

  // GCPnts_QuasiUniformDeflection.Value (method)
  Value(Index: number): gp_Pnt;

  // GCPnts_QuasiUniformDeflection.Deflection (method)
  Deflection(): number;

  // GCPnts_QuasiUniformDeflection.delete (method)
  delete(): void;

  // GCPnts_QuasiUniformDeflection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_TangentialDeflection: declare class GCPnts_TangentialDeflection

  // GCPnts_TangentialDeflection.constructor (constructor)
  constructor();
  constructor(theC: Adaptor3d_Curve, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints?: number, theUTol?: number, theMinLen?: number);
  constructor(theC: Adaptor2d_Curve2d, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints?: number, theUTol?: number, theMinLen?: number);
  constructor(theC: Adaptor3d_Curve, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints?: number, theUTol?: number, theMinLen?: number);
  constructor(theC: Adaptor2d_Curve2d, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints?: number, theUTol?: number, theMinLen?: number);

  // GCPnts_TangentialDeflection.Initialize (method)
  Initialize(theC: Adaptor3d_Curve, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
  Initialize(theC: Adaptor3d_Curve, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;

  // GCPnts_TangentialDeflection.AddPoint (method)
  AddPoint(thePnt: gp_Pnt, theParam: number, theIsReplace?: boolean): number;

  // GCPnts_TangentialDeflection.NbPoints (method)
  NbPoints(): number;

  // GCPnts_TangentialDeflection.Parameter (method)
  Parameter(I: number): number;

  // GCPnts_TangentialDeflection.Value (method)
  Value(I: number): gp_Pnt;

  // GCPnts_TangentialDeflection.ArcAngularStep (method)
  static ArcAngularStep(theRadius: number, theLinearDeflection: number, theAngularDeflection: number, theMinLength: number): number;

  // GCPnts_TangentialDeflection.delete (method)
  delete(): void;

  // GCPnts_TangentialDeflection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_UniformAbscissa: declare class GCPnts_UniformAbscissa

  // GCPnts_UniformAbscissa.constructor (constructor)
  constructor();
  constructor(theC: Adaptor3d_Curve, theAbscissa: number, theToler?: number);
  constructor(theC: Adaptor3d_Curve, theNbPoints: number, theToler?: number);
  constructor(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler?: number);
  constructor(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler?: number);
  constructor(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler?: number);
  constructor(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler?: number);
  constructor(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler?: number);
  constructor(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler?: number);

  // GCPnts_UniformAbscissa.Initialize (method)
  Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
  Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
  Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
  Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
  Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;

  // GCPnts_UniformAbscissa.IsDone (method)
  IsDone(): boolean;

  // GCPnts_UniformAbscissa.NbPoints (method)
  NbPoints(): number;

  // GCPnts_UniformAbscissa.Parameter (method)
  Parameter(Index: number): number;

  // GCPnts_UniformAbscissa.Abscissa (method)
  Abscissa(): number;

  // GCPnts_UniformAbscissa.delete (method)
  delete(): void;

  // GCPnts_UniformAbscissa.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GCPnts_UniformDeflection: declare class GCPnts_UniformDeflection

  // GCPnts_UniformDeflection.constructor (constructor)
  constructor();
  constructor(theC: Adaptor3d_Curve, theDeflection: number, theWithControl?: boolean);
  constructor(theC: Adaptor2d_Curve2d, theDeflection: number, theWithControl?: boolean);
  constructor(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theWithControl?: boolean);
  constructor(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theWithControl?: boolean);

  // GCPnts_UniformDeflection.Initialize (method)
  Initialize(theC: Adaptor3d_Curve, theDeflection: number, theWithControl: boolean): void;
  Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theWithControl: boolean): void;
  Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
  Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;

  // GCPnts_UniformDeflection.IsDone (method)
  IsDone(): boolean;

  // GCPnts_UniformDeflection.NbPoints (method)
  NbPoints(): number;

  // GCPnts_UniformDeflection.Parameter (method)
  Parameter(Index: number): number;

  // GCPnts_UniformDeflection.Value (method)
  Value(Index: number): gp_Pnt;

  // GCPnts_UniformDeflection.Deflection (method)
  Deflection(): number;

  // GCPnts_UniformDeflection.delete (method)
  delete(): void;

  // GCPnts_UniformDeflection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
