# libcascade — LocalAnalysis

4 top-level symbols. Signatures are verbatim typescript.

LocalAnalysis: declare class LocalAnalysis

  // LocalAnalysis.constructor (constructor)
  constructor();

  // LocalAnalysis.delete (method)
  delete(): void;

  // LocalAnalysis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocalAnalysis_CurveContinuity: declare class LocalAnalysis_CurveContinuity

  // LocalAnalysis_CurveContinuity.constructor (constructor)
  constructor(Curv1: Geom_Curve, u1: number, Curv2: Geom_Curve, u2: number, Order: GeomAbs_Shape, EpsNul?: number, EpsC0?: number, EpsC1?: number, EpsC2?: number, EpsG1?: number, EpsG2?: number, Percent?: number, Maxlen?: number);

  // LocalAnalysis_CurveContinuity.IsDone (method)
  IsDone(): boolean;

  // LocalAnalysis_CurveContinuity.StatusError (method)
  StatusError(): LocalAnalysis_StatusErrorType;

  // LocalAnalysis_CurveContinuity.ContinuityStatus (method)
  ContinuityStatus(): GeomAbs_Shape;

  // LocalAnalysis_CurveContinuity.C0Value (method)
  C0Value(): number;

  // LocalAnalysis_CurveContinuity.C1Angle (method)
  C1Angle(): number;

  // LocalAnalysis_CurveContinuity.C1Ratio (method)
  C1Ratio(): number;

  // LocalAnalysis_CurveContinuity.C2Angle (method)
  C2Angle(): number;

  // LocalAnalysis_CurveContinuity.C2Ratio (method)
  C2Ratio(): number;

  // LocalAnalysis_CurveContinuity.G1Angle (method)
  G1Angle(): number;

  // LocalAnalysis_CurveContinuity.G2Angle (method)
  G2Angle(): number;

  // LocalAnalysis_CurveContinuity.G2CurvatureVariation (method)
  G2CurvatureVariation(): number;

  // LocalAnalysis_CurveContinuity.IsC0 (method)
  IsC0(): boolean;

  // LocalAnalysis_CurveContinuity.IsC1 (method)
  IsC1(): boolean;

  // LocalAnalysis_CurveContinuity.IsC2 (method)
  IsC2(): boolean;

  // LocalAnalysis_CurveContinuity.IsG1 (method)
  IsG1(): boolean;

  // LocalAnalysis_CurveContinuity.IsG2 (method)
  IsG2(): boolean;

  // LocalAnalysis_CurveContinuity.delete (method)
  delete(): void;

  // LocalAnalysis_CurveContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LocalAnalysis_StatusErrorType: typeof LocalAnalysis_StatusErrorType[keyof typeof LocalAnalysis_StatusErrorType]

  readonly LocalAnalysis_NullFirstDerivative: 'LocalAnalysis_NullFirstDerivative'

  readonly LocalAnalysis_NullSecondDerivative: 'LocalAnalysis_NullSecondDerivative'

  readonly LocalAnalysis_TangentNotDefined: 'LocalAnalysis_TangentNotDefined'

  readonly LocalAnalysis_NormalNotDefined: 'LocalAnalysis_NormalNotDefined'

  readonly LocalAnalysis_CurvatureNotDefined: 'LocalAnalysis_CurvatureNotDefined'

LocalAnalysis_SurfaceContinuity: declare class LocalAnalysis_SurfaceContinuity

  // LocalAnalysis_SurfaceContinuity.constructor (constructor)
  constructor(EpsNul?: number, EpsC0?: number, EpsC1?: number, EpsC2?: number, EpsG1?: number, Percent?: number, Maxlen?: number);
  constructor(curv1: Geom2d_Curve, curv2: Geom2d_Curve, U: number, Surf1: Geom_Surface, Surf2: Geom_Surface, Order: GeomAbs_Shape, EpsNul?: number, EpsC0?: number, EpsC1?: number, EpsC2?: number, EpsG1?: number, Percent?: number, Maxlen?: number);
  constructor(Surf1: Geom_Surface, u1: number, v1: number, Surf2: Geom_Surface, u2: number, v2: number, Order: GeomAbs_Shape, EpsNul?: number, EpsC0?: number, EpsC1?: number, EpsC2?: number, EpsG1?: number, Percent?: number, Maxlen?: number);

  // LocalAnalysis_SurfaceContinuity.ComputeAnalysis (method)
  ComputeAnalysis(Surf1: GeomLProp_SLProps, Surf2: GeomLProp_SLProps, Order: GeomAbs_Shape): void;

  // LocalAnalysis_SurfaceContinuity.IsDone (method)
  IsDone(): boolean;

  // LocalAnalysis_SurfaceContinuity.ContinuityStatus (method)
  ContinuityStatus(): GeomAbs_Shape;

  // LocalAnalysis_SurfaceContinuity.StatusError (method)
  StatusError(): LocalAnalysis_StatusErrorType;

  // LocalAnalysis_SurfaceContinuity.C0Value (method)
  C0Value(): number;

  // LocalAnalysis_SurfaceContinuity.C1UAngle (method)
  C1UAngle(): number;

  // LocalAnalysis_SurfaceContinuity.C1URatio (method)
  C1URatio(): number;

  // LocalAnalysis_SurfaceContinuity.C1VAngle (method)
  C1VAngle(): number;

  // LocalAnalysis_SurfaceContinuity.C1VRatio (method)
  C1VRatio(): number;

  // LocalAnalysis_SurfaceContinuity.C2UAngle (method)
  C2UAngle(): number;

  // LocalAnalysis_SurfaceContinuity.C2URatio (method)
  C2URatio(): number;

  // LocalAnalysis_SurfaceContinuity.C2VAngle (method)
  C2VAngle(): number;

  // LocalAnalysis_SurfaceContinuity.C2VRatio (method)
  C2VRatio(): number;

  // LocalAnalysis_SurfaceContinuity.G1Angle (method)
  G1Angle(): number;

  // LocalAnalysis_SurfaceContinuity.G2CurvatureGap (method)
  G2CurvatureGap(): number;

  // LocalAnalysis_SurfaceContinuity.IsC0 (method)
  IsC0(): boolean;

  // LocalAnalysis_SurfaceContinuity.IsC1 (method)
  IsC1(): boolean;

  // LocalAnalysis_SurfaceContinuity.IsC2 (method)
  IsC2(): boolean;

  // LocalAnalysis_SurfaceContinuity.IsG1 (method)
  IsG1(): boolean;

  // LocalAnalysis_SurfaceContinuity.IsG2 (method)
  IsG2(): boolean;

  // LocalAnalysis_SurfaceContinuity.delete (method)
  delete(): void;

  // LocalAnalysis_SurfaceContinuity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
