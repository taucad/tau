# libcascade — BSplCLib

4 top-level symbols. Signatures are verbatim typescript.

BSplCLib_Cache: declare class BSplCLib_Cache extends Standard_Transient

  // BSplCLib_Cache.constructor (constructor)
  constructor(theDegree: number, thePeriodic: boolean, theFlatKnots: NCollection_Array1_double, thePoles2d: NCollection_Array1_gp_Pnt2d, theWeights?: NCollection_Array1_double);
  constructor(theDegree: number, thePeriodic: boolean, theFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array1_gp_Pnt, theWeights?: NCollection_Array1_double);

  // BSplCLib_Cache.IsCacheValid (method)
  IsCacheValid(theParameter: number): boolean;

  // BSplCLib_Cache.BuildCache (method)
  BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles2d: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double): void;
  BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double): void;

  // BSplCLib_Cache.D0 (method)
  D0(theParameter: number, thePoint: gp_Pnt2d): void;
  D0(theParameter: number, thePoint: gp_Pnt): void;

  // BSplCLib_Cache.D1 (method)
  D1(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
  D1(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;

  // BSplCLib_Cache.D2 (method)
  D2(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
  D2(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;

  // BSplCLib_Cache.D3 (method)
  D3(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
  D3(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;

  // BSplCLib_Cache.D0Local (method)
  D0Local(theLocalParam: number, thePoint: gp_Pnt): void;
  D0Local(theLocalParam: number, thePoint: gp_Pnt2d): void;

  // BSplCLib_Cache.D1Local (method)
  D1Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
  D1Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;

  // BSplCLib_Cache.D2Local (method)
  D2Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
  D2Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;

  // BSplCLib_Cache.D3Local (method)
  D3Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
  D3Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;

  // BSplCLib_Cache.get_type_name (method)
  static get_type_name(): string;

  // BSplCLib_Cache.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BSplCLib_Cache.DynamicType (method)
  DynamicType(): Standard_Type;

  // BSplCLib_Cache.delete (method)
  delete(): void;

  // BSplCLib_Cache.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BSplCLib_EvaluatorFunction: declare class BSplCLib_EvaluatorFunction

  // BSplCLib_EvaluatorFunction.Evaluate (method)
  Evaluate(theDerivativeRequest: number, theStartEnd: number, theParameter: number, theResult: number, theErrorCode: number): { theResult: number; theErrorCode: number };

  // BSplCLib_EvaluatorFunction.delete (method)
  delete(): void;

  // BSplCLib_EvaluatorFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BSplCLib_KnotDistribution: typeof BSplCLib_KnotDistribution[keyof typeof BSplCLib_KnotDistribution]

  readonly BSplCLib_NonUniform: 'BSplCLib_NonUniform'

  readonly BSplCLib_Uniform: 'BSplCLib_Uniform'

BSplCLib_MultDistribution: typeof BSplCLib_MultDistribution[keyof typeof BSplCLib_MultDistribution]

  readonly BSplCLib_NonConstant: 'BSplCLib_NonConstant'

  readonly BSplCLib_Constant: 'BSplCLib_Constant'

  readonly BSplCLib_QuasiConstant: 'BSplCLib_QuasiConstant'
