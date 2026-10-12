# libcascade — FairCurve

12 top-level symbols. Signatures are verbatim typescript.

FairCurve_AnalysisCode: typeof FairCurve_AnalysisCode[keyof typeof FairCurve_AnalysisCode]

  readonly FairCurve_OK: 'FairCurve_OK'

  readonly FairCurve_NotConverged: 'FairCurve_NotConverged'

  readonly FairCurve_InfiniteSliding: 'FairCurve_InfiniteSliding'

  readonly FairCurve_NullHeight: 'FairCurve_NullHeight'

FairCurve_Batten: declare class FairCurve_Batten

  // FairCurve_Batten.constructor (constructor)
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d, Height: number, Slope?: number);

  // FairCurve_Batten.SetFreeSliding (method)
  SetFreeSliding(FreeSliding: boolean): void;

  // FairCurve_Batten.SetConstraintOrder1 (method)
  SetConstraintOrder1(ConstraintOrder: number): void;

  // FairCurve_Batten.SetConstraintOrder2 (method)
  SetConstraintOrder2(ConstraintOrder: number): void;

  // FairCurve_Batten.SetP1 (method)
  SetP1(P1: gp_Pnt2d): void;

  // FairCurve_Batten.SetP2 (method)
  SetP2(P2: gp_Pnt2d): void;

  // FairCurve_Batten.SetAngle1 (method)
  SetAngle1(Angle1: number): void;

  // FairCurve_Batten.SetAngle2 (method)
  SetAngle2(Angle2: number): void;

  // FairCurve_Batten.SetHeight (method)
  SetHeight(Height: number): void;

  // FairCurve_Batten.SetSlope (method)
  SetSlope(Slope: number): void;

  // FairCurve_Batten.SetSlidingFactor (method)
  SetSlidingFactor(SlidingFactor: number): void;

  // FairCurve_Batten.Compute (method)
  Compute(Code: FairCurve_AnalysisCode, NbIterations: number, Tolerance: number): { returnValue: boolean; Code: FairCurve_AnalysisCode };

  // FairCurve_Batten.SlidingOfReference (method)
  SlidingOfReference(): number;

  // FairCurve_Batten.GetFreeSliding (method)
  GetFreeSliding(): boolean;

  // FairCurve_Batten.GetConstraintOrder1 (method)
  GetConstraintOrder1(): number;

  // FairCurve_Batten.GetConstraintOrder2 (method)
  GetConstraintOrder2(): number;

  // FairCurve_Batten.GetP1 (method)
  GetP1(): gp_Pnt2d;

  // FairCurve_Batten.GetP2 (method)
  GetP2(): gp_Pnt2d;

  // FairCurve_Batten.GetAngle1 (method)
  GetAngle1(): number;

  // FairCurve_Batten.GetAngle2 (method)
  GetAngle2(): number;

  // FairCurve_Batten.GetHeight (method)
  GetHeight(): number;

  // FairCurve_Batten.GetSlope (method)
  GetSlope(): number;

  // FairCurve_Batten.GetSlidingFactor (method)
  GetSlidingFactor(): number;

  // FairCurve_Batten.Curve (method)
  Curve(): Geom2d_BSplineCurve;

  // FairCurve_Batten.delete (method)
  delete(): void;

  // FairCurve_Batten.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_BattenLaw: declare class FairCurve_BattenLaw extends math_Function

  // FairCurve_BattenLaw.constructor (constructor)
  constructor(Heigth: number, Slope: number, Sliding: number);

  // FairCurve_BattenLaw.SetSliding (method)
  SetSliding(Sliding: number): void;

  // FairCurve_BattenLaw.SetHeigth (method)
  SetHeigth(Heigth: number): void;

  // FairCurve_BattenLaw.SetSlope (method)
  SetSlope(Slope: number): void;

  // FairCurve_BattenLaw.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // FairCurve_BattenLaw.delete (method)
  delete(): void;

  // FairCurve_BattenLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_DistributionOfEnergy: declare class FairCurve_DistributionOfEnergy extends math_FunctionSet

  // FairCurve_DistributionOfEnergy.NbVariables (method)
  NbVariables(): number;

  // FairCurve_DistributionOfEnergy.NbEquations (method)
  NbEquations(): number;

  // FairCurve_DistributionOfEnergy.SetDerivativeOrder (method)
  SetDerivativeOrder(DerivativeOrder: number): void;

  // FairCurve_DistributionOfEnergy.delete (method)
  delete(): void;

  // FairCurve_DistributionOfEnergy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_DistributionOfJerk: declare class FairCurve_DistributionOfJerk extends FairCurve_DistributionOfEnergy

  // FairCurve_DistributionOfJerk.constructor (constructor)
  constructor(BSplOrder: number, FlatKnots: NCollection_HArray1_double, Poles: NCollection_HArray1_gp_Pnt2d, DerivativeOrder: number, Law: FairCurve_BattenLaw, NbValAux?: number);

  // FairCurve_DistributionOfJerk.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // FairCurve_DistributionOfJerk.delete (method)
  delete(): void;

  // FairCurve_DistributionOfJerk.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_DistributionOfSagging: declare class FairCurve_DistributionOfSagging extends FairCurve_DistributionOfEnergy

  // FairCurve_DistributionOfSagging.constructor (constructor)
  constructor(BSplOrder: number, FlatKnots: NCollection_HArray1_double, Poles: NCollection_HArray1_gp_Pnt2d, DerivativeOrder: number, Law: FairCurve_BattenLaw, NbValAux?: number);

  // FairCurve_DistributionOfSagging.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // FairCurve_DistributionOfSagging.delete (method)
  delete(): void;

  // FairCurve_DistributionOfSagging.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_DistributionOfTension: declare class FairCurve_DistributionOfTension extends FairCurve_DistributionOfEnergy

  // FairCurve_DistributionOfTension.constructor (constructor)
  constructor(BSplOrder: number, FlatKnots: NCollection_HArray1_double, Poles: NCollection_HArray1_gp_Pnt2d, DerivativeOrder: number, LengthSliding: number, Law: FairCurve_BattenLaw, NbValAux?: number, Uniform?: boolean);

  // FairCurve_DistributionOfTension.SetLengthSliding (method)
  SetLengthSliding(LengthSliding: number): void;

  // FairCurve_DistributionOfTension.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // FairCurve_DistributionOfTension.delete (method)
  delete(): void;

  // FairCurve_DistributionOfTension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_Energy: declare class FairCurve_Energy extends math_MultipleVarFunctionWithHessian

  // FairCurve_Energy.NbVariables (method)
  NbVariables(): number;

  // FairCurve_Energy.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // FairCurve_Energy.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // FairCurve_Energy.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  // FairCurve_Energy.Variable (method)
  Variable(X: math_VectorBase_double): boolean;

  // FairCurve_Energy.Poles (method)
  Poles(): NCollection_HArray1_gp_Pnt2d;

  // FairCurve_Energy.delete (method)
  delete(): void;

  // FairCurve_Energy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_EnergyOfBatten: declare class FairCurve_EnergyOfBatten extends FairCurve_Energy

  // FairCurve_EnergyOfBatten.constructor (constructor)
  constructor(BSplOrder: number, FlatKnots: NCollection_HArray1_double, Poles: NCollection_HArray1_gp_Pnt2d, ContrOrder1: number, ContrOrder2: number, Law: FairCurve_BattenLaw, LengthSliding: number, FreeSliding?: boolean, Angle1?: number, Angle2?: number);

  // FairCurve_EnergyOfBatten.LengthSliding (method)
  LengthSliding(): number;

  // FairCurve_EnergyOfBatten.Status (method)
  Status(): FairCurve_AnalysisCode;

  // FairCurve_EnergyOfBatten.Variable (method)
  Variable(X: math_VectorBase_double): boolean;

  // FairCurve_EnergyOfBatten.delete (method)
  delete(): void;

  // FairCurve_EnergyOfBatten.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_EnergyOfMVC: declare class FairCurve_EnergyOfMVC extends FairCurve_Energy

  // FairCurve_EnergyOfMVC.constructor (constructor)
  constructor(BSplOrder: number, FlatKnots: NCollection_HArray1_double, Poles: NCollection_HArray1_gp_Pnt2d, ContrOrder1: number, ContrOrder2: number, Law: FairCurve_BattenLaw, PhysicalRatio: number, LengthSliding: number, FreeSliding?: boolean, Angle1?: number, Angle2?: number, Curvature1?: number, Curvature2?: number);

  // FairCurve_EnergyOfMVC.LengthSliding (method)
  LengthSliding(): number;

  // FairCurve_EnergyOfMVC.Status (method)
  Status(): FairCurve_AnalysisCode;

  // FairCurve_EnergyOfMVC.Variable (method)
  Variable(X: math_VectorBase_double): boolean;

  // FairCurve_EnergyOfMVC.delete (method)
  delete(): void;

  // FairCurve_EnergyOfMVC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_MinimalVariation: declare class FairCurve_MinimalVariation extends FairCurve_Batten

  // FairCurve_MinimalVariation.constructor (constructor)
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d, Heigth: number, Slope?: number, PhysicalRatio?: number);

  // FairCurve_MinimalVariation.SetCurvature1 (method)
  SetCurvature1(Curvature: number): void;

  // FairCurve_MinimalVariation.SetCurvature2 (method)
  SetCurvature2(Curvature: number): void;

  // FairCurve_MinimalVariation.SetPhysicalRatio (method)
  SetPhysicalRatio(Ratio: number): void;

  // FairCurve_MinimalVariation.Compute (method)
  Compute(Code: FairCurve_AnalysisCode, NbIterations: number, Tolerance: number): { returnValue: boolean; Code: FairCurve_AnalysisCode };

  // FairCurve_MinimalVariation.GetCurvature1 (method)
  GetCurvature1(): number;

  // FairCurve_MinimalVariation.GetCurvature2 (method)
  GetCurvature2(): number;

  // FairCurve_MinimalVariation.GetPhysicalRatio (method)
  GetPhysicalRatio(): number;

  // FairCurve_MinimalVariation.delete (method)
  delete(): void;

  // FairCurve_MinimalVariation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FairCurve_Newton: declare class FairCurve_Newton

  // FairCurve_Newton.constructor (constructor)
  constructor(theFunction: math_MultipleVarFunctionWithHessian, theSpatialTolerance?: number, theCriteriumTolerance?: number, theNbIterations?: number, theConvexity?: number, theWithSingularity?: boolean);

  // FairCurve_Newton.IsConverged (method)
  IsConverged(): boolean;

  // FairCurve_Newton.delete (method)
  delete(): void;

  // FairCurve_Newton.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
