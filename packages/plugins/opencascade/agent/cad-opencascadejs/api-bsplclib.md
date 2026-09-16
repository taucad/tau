# libcascade — BSplCLib

4 top-level symbols. Signatures are verbatim typescript.

BSplCLib_Cache: declare class BSplCLib_Cache extends Standard_Transient

  constructor

  IsCacheValid(theParameter: number): boolean;

  BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles2d: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double): void;
  BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double): void;
  BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles2d: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double): void;
  BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double): void;

  D0(theParameter: number, thePoint: gp_Pnt2d): void;
  D0(theParameter: number, thePoint: gp_Pnt): void;
  D0(theParameter: number, thePoint: gp_Pnt2d): void;
  D0(theParameter: number, thePoint: gp_Pnt): void;

  D1(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
  D1(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
  D1(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
  D1(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;

  D2(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
  D2(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
  D2(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
  D2(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;

  D3(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
  D3(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
  D3(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
  D3(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;

  D0Local(theLocalParam: number, thePoint: gp_Pnt): void;
  D0Local(theLocalParam: number, thePoint: gp_Pnt2d): void;
  D0Local(theLocalParam: number, thePoint: gp_Pnt): void;
  D0Local(theLocalParam: number, thePoint: gp_Pnt2d): void;

  D1Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
  D1Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
  D1Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
  D1Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;

  D2Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
  D2Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
  D2Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
  D2Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;

  D3Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
  D3Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
  D3Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
  D3Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BSplCLib_EvaluatorFunction: declare class BSplCLib_EvaluatorFunction

  Evaluate(theDerivativeRequest: number, theStartEnd: number, theParameter: number, theResult: number, theErrorCode: number): { theResult: number; theErrorCode: number };

  delete(): void;

  [Symbol.dispose](): void;

BSplCLib_KnotDistribution: typeof BSplCLib_KnotDistribution[keyof typeof BSplCLib_KnotDistribution]

BSplCLib_MultDistribution: typeof BSplCLib_MultDistribution[keyof typeof BSplCLib_MultDistribution]
