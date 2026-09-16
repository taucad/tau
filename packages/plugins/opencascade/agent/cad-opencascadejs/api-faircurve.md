# libcascade — FairCurve

12 top-level symbols. Signatures are verbatim typescript.

FairCurve_AnalysisCode: typeof FairCurve_AnalysisCode[keyof typeof FairCurve_AnalysisCode]

FairCurve_Batten: declare class FairCurve_Batten

  constructor

  SetFreeSliding(FreeSliding: boolean): void;

  SetConstraintOrder1(ConstraintOrder: number): void;

  SetConstraintOrder2(ConstraintOrder: number): void;

  SetP1(P1: gp_Pnt2d): void;

  SetP2(P2: gp_Pnt2d): void;

  SetAngle1(Angle1: number): void;

  SetAngle2(Angle2: number): void;

  SetHeight(Height: number): void;

  SetSlope(Slope: number): void;

  SetSlidingFactor(SlidingFactor: number): void;

  Compute(Code: FairCurve_AnalysisCode, NbIterations: number, Tolerance: number): { returnValue: boolean; Code: FairCurve_AnalysisCode };

  SlidingOfReference(): number;

  GetFreeSliding(): boolean;

  GetConstraintOrder1(): number;

  GetConstraintOrder2(): number;

  GetP1(): gp_Pnt2d;

  GetP2(): gp_Pnt2d;

  GetAngle1(): number;

  GetAngle2(): number;

  GetHeight(): number;

  GetSlope(): number;

  GetSlidingFactor(): number;

  Curve(): Geom2d_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_BattenLaw: declare class FairCurve_BattenLaw extends math_Function

  constructor

  SetSliding(Sliding: number): void;

  SetHeigth(Heigth: number): void;

  SetSlope(Slope: number): void;

  Value(X: number, F: number): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_DistributionOfEnergy: declare class FairCurve_DistributionOfEnergy extends math_FunctionSet

  NbVariables(): number;

  NbEquations(): number;

  SetDerivativeOrder(DerivativeOrder: number): void;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_DistributionOfJerk: declare class FairCurve_DistributionOfJerk extends FairCurve_DistributionOfEnergy

  constructor

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_DistributionOfSagging: declare class FairCurve_DistributionOfSagging extends FairCurve_DistributionOfEnergy

  constructor

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_DistributionOfTension: declare class FairCurve_DistributionOfTension extends FairCurve_DistributionOfEnergy

  constructor

  SetLengthSliding(LengthSliding: number): void;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_Energy: declare class FairCurve_Energy extends math_MultipleVarFunctionWithHessian

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  Variable(X: math_VectorBase_double): boolean;

  Poles(): NCollection_HArray1_gp_Pnt2d;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_EnergyOfBatten: declare class FairCurve_EnergyOfBatten extends FairCurve_Energy

  constructor

  LengthSliding(): number;

  Status(): FairCurve_AnalysisCode;

  Variable(X: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_EnergyOfMVC: declare class FairCurve_EnergyOfMVC extends FairCurve_Energy

  constructor

  LengthSliding(): number;

  Status(): FairCurve_AnalysisCode;

  Variable(X: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_MinimalVariation: declare class FairCurve_MinimalVariation extends FairCurve_Batten

  constructor

  SetCurvature1(Curvature: number): void;

  SetCurvature2(Curvature: number): void;

  SetPhysicalRatio(Ratio: number): void;

  Compute(Code: FairCurve_AnalysisCode, NbIterations: number, Tolerance: number): { returnValue: boolean; Code: FairCurve_AnalysisCode };

  GetCurvature1(): number;

  GetCurvature2(): number;

  GetPhysicalRatio(): number;

  delete(): void;

  [Symbol.dispose](): void;

FairCurve_Newton: declare class FairCurve_Newton

  constructor

  IsConverged(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
