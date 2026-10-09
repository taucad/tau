# libcascade — LProp

9 top-level symbols. Signatures are verbatim typescript.

LProp_SurfaceUtils_DirectAccess: declare class LProp_SurfaceUtils_DirectAccess

  // LProp_SurfaceUtils_DirectAccess.constructor (constructor)
  constructor();

  // LProp_SurfaceUtils_DirectAccess.delete (method)
  delete(): void;

  // LProp_SurfaceUtils_DirectAccess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_BadContinuity: declare class LProp_BadContinuity extends Standard_Failure

  // LProp_BadContinuity.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // LProp_BadContinuity.ExceptionType (method)
  ExceptionType(): string;

  // LProp_BadContinuity.delete (method)
  delete(): void;

  // LProp_BadContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_CIType: typeof LProp_CIType[keyof typeof LProp_CIType]

  readonly LProp_Inflection: 'LProp_Inflection'

  readonly LProp_MinCur: 'LProp_MinCur'

  readonly LProp_MaxCur: 'LProp_MaxCur'

LProp_CLProps3d: declare class LProp_CLProps3d

  // LProp_CLProps3d.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(C: Adaptor3d_Curve, N: number, Resolution: number);
  constructor(C: Adaptor3d_Curve, U: number, N: number, Resolution: number);

  // LProp_CLProps3d.SetParameter (method)
  SetParameter(U: number): void;

  // LProp_CLProps3d.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): void;

  // LProp_CLProps3d.Value (method)
  Value(): gp_Pnt;

  // LProp_CLProps3d.D1 (method)
  D1(): gp_Vec;

  // LProp_CLProps3d.D2 (method)
  D2(): gp_Vec;

  // LProp_CLProps3d.D3 (method)
  D3(): gp_Vec;

  // LProp_CLProps3d.IsTangentDefined (method)
  IsTangentDefined(): boolean;

  // LProp_CLProps3d.Tangent (method)
  Tangent(D: gp_Dir): void;

  // LProp_CLProps3d.Curvature (method)
  Curvature(): number;

  // LProp_CLProps3d.Normal (method)
  Normal(N: gp_Dir): void;

  // LProp_CLProps3d.CentreOfCurvature (method)
  CentreOfCurvature(P: gp_Pnt): void;

  // LProp_CLProps3d.delete (method)
  delete(): void;

  // LProp_CLProps3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_CurAndInf: declare class LProp_CurAndInf

  // LProp_CurAndInf.constructor (constructor)
  constructor();

  // LProp_CurAndInf.AddInflection (method)
  AddInflection(Param: number): void;

  // LProp_CurAndInf.AddExtCur (method)
  AddExtCur(Param: number, IsMin: boolean): void;

  // LProp_CurAndInf.Clear (method)
  Clear(): void;

  // LProp_CurAndInf.IsEmpty (method)
  IsEmpty(): boolean;

  // LProp_CurAndInf.NbPoints (method)
  NbPoints(): number;

  // LProp_CurAndInf.Parameter (method)
  Parameter(N: number): number;

  // LProp_CurAndInf.Type (method)
  Type(N: number): LProp_CIType;

  // LProp_CurAndInf.delete (method)
  delete(): void;

  // LProp_CurAndInf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_CurveUtils_DirectAccess: declare class LProp_CurveUtils_DirectAccess

  // LProp_CurveUtils_DirectAccess.constructor (constructor)
  constructor();

  // LProp_CurveUtils_DirectAccess.delete (method)
  delete(): void;

  // LProp_CurveUtils_DirectAccess.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_NotDefined: declare class LProp_NotDefined extends Standard_Failure

  // LProp_NotDefined.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // LProp_NotDefined.ExceptionType (method)
  ExceptionType(): string;

  // LProp_NotDefined.delete (method)
  delete(): void;

  // LProp_NotDefined.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_SLProps3d: declare class LProp_SLProps3d

  // LProp_SLProps3d.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(S: Adaptor3d_Surface, N: number, Resolution: number);
  constructor(S: Adaptor3d_Surface, U: number, V: number, N: number, Resolution: number);

  // LProp_SLProps3d.SetSurface (method)
  SetSurface(S: Adaptor3d_Surface): void;

  // LProp_SLProps3d.SetParameters (method)
  SetParameters(U: number, V: number): void;

  // LProp_SLProps3d.Value (method)
  Value(): gp_Pnt;

  // LProp_SLProps3d.D1U (method)
  D1U(): gp_Vec;

  // LProp_SLProps3d.D1V (method)
  D1V(): gp_Vec;

  // LProp_SLProps3d.D2U (method)
  D2U(): gp_Vec;

  // LProp_SLProps3d.D2V (method)
  D2V(): gp_Vec;

  // LProp_SLProps3d.DUV (method)
  DUV(): gp_Vec;

  // LProp_SLProps3d.IsTangentUDefined (method)
  IsTangentUDefined(): boolean;

  // LProp_SLProps3d.TangentU (method)
  TangentU(D: gp_Dir): void;

  // LProp_SLProps3d.IsTangentVDefined (method)
  IsTangentVDefined(): boolean;

  // LProp_SLProps3d.TangentV (method)
  TangentV(D: gp_Dir): void;

  // LProp_SLProps3d.IsNormalDefined (method)
  IsNormalDefined(): boolean;

  // LProp_SLProps3d.Normal (method)
  Normal(): gp_Dir;

  // LProp_SLProps3d.IsCurvatureDefined (method)
  IsCurvatureDefined(): boolean;

  // LProp_SLProps3d.IsUmbilic (method)
  IsUmbilic(): boolean;

  // LProp_SLProps3d.MaxCurvature (method)
  MaxCurvature(): number;

  // LProp_SLProps3d.MinCurvature (method)
  MinCurvature(): number;

  // LProp_SLProps3d.CurvatureDirections (method)
  CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

  // LProp_SLProps3d.MeanCurvature (method)
  MeanCurvature(): number;

  // LProp_SLProps3d.GaussianCurvature (method)
  GaussianCurvature(): number;

  // LProp_SLProps3d.delete (method)
  delete(): void;

  // LProp_SLProps3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LProp_Status: typeof LProp_Status[keyof typeof LProp_Status]

  readonly LProp_Undecided: 'LProp_Undecided'

  readonly LProp_Undefined: 'LProp_Undefined'

  readonly LProp_Defined: 'LProp_Defined'

  readonly LProp_Computed: 'LProp_Computed'
