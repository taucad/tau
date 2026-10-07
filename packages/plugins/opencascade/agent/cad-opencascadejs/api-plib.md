# libcascade — PLib

3 top-level symbols. Signatures are verbatim typescript.

PLib: declare class PLib

  // PLib.constructor (constructor)
  constructor();

  // PLib.NoWeights (method)
  static NoWeights(): NCollection_Array1_double;

  // PLib.NoWeights2 (method)
  static NoWeights2(): NCollection_Array2_double;

  // PLib.SetPoles (method)
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;

  // PLib.GetPoles (method)
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double): void;

  // PLib.Bin (method)
  static Bin(N: number, P: number): number;

  // PLib.RationalDerivative (method)
  static RationalDerivative(Degree: number, N: number, Dimension: number, Ders: number, RDers: number, All: boolean): { Ders: number; RDers: number };

  // PLib.RationalDerivatives (method)
  static RationalDerivatives(DerivativesRequest: number, Dimension: number, PolesDerivatives?: number, WeightsDerivatives?: number, RationalDerivates?: number): { PolesDerivatives: number; WeightsDerivatives: number; RationalDerivates: number };

  // PLib.EvalPolynomial (method)
  static EvalPolynomial(U: number, DerivativeOrder: number, Degree: number, Dimension: number, PolynomialCoeff: number, Results?: number): { Results: number };

  // PLib.NoDerivativeEvalPolynomial (method)
  static NoDerivativeEvalPolynomial(U: number, Degree: number, Dimension: number, DegreeDimension: number, PolynomialCoeff: number, Results?: number): { Results: number };

  // PLib.EvalPoly2Var (method)
  static EvalPoly2Var(U: number, V: number, UDerivativeOrder: number, VDerivativeOrder: number, UDegree: number, VDegree: number, Dimension: number, PolynomialCoeff?: number, Results?: number): { PolynomialCoeff: number; Results: number };

  // PLib.EvalLagrange (method)
  static EvalLagrange(U: number, DerivativeOrder: number, Degree: number, Dimension: number, ValueArray?: number, ParameterArray?: number, Results?: number): { returnValue: number; ValueArray: number; ParameterArray: number; Results: number };

  // PLib.EvalCubicHermite (method)
  static EvalCubicHermite(U: number, DerivativeOrder: number, Dimension: number, ValueArray?: number, DerivativeArray?: number, ParameterArray?: number, Results?: number): { returnValue: number; ValueArray: number; DerivativeArray: number; ParameterArray: number; Results: number };

  // PLib.HermiteCoefficients (method)
  static HermiteCoefficients(FirstParameter: number, LastParameter: number, FirstOrder: number, LastOrder: number, MatrixCoefs: math_Matrix): boolean;

  // PLib.CoefficientsPoles (method)
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt2d, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array2_gp_Pnt, WCoefs: NCollection_Array2_double, Poles: NCollection_Array2_gp_Pnt, WPoles: NCollection_Array2_double): void;
  static CoefficientsPoles(dim: number, Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;

  // PLib.Trimming (method)
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt2d, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, dim: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;

  // PLib.UTrimming (method)
  static UTrimming(U1: number, U2: number, Coeffs: NCollection_Array2_gp_Pnt, WCoeffs: NCollection_Array2_double): void;

  // PLib.VTrimming (method)
  static VTrimming(V1: number, V2: number, Coeffs: NCollection_Array2_gp_Pnt, WCoeffs: NCollection_Array2_double): void;

  // PLib.HermiteInterpolate (method)
  static HermiteInterpolate(Dimension: number, FirstParameter: number, LastParameter: number, FirstOrder: number, LastOrder: number, FirstConstr: NCollection_Array2_double, LastConstr: NCollection_Array2_double, Coefficients: NCollection_Array1_double): boolean;

  // PLib.JacobiParameters (method)
  static JacobiParameters(ConstraintOrder: GeomAbs_Shape, MaxDegree: number, Code: number, NbGaussPoints?: number, WorkDegree?: number): { NbGaussPoints: number; WorkDegree: number };

  // PLib.NivConstr (method)
  static NivConstr(ConstraintOrder: GeomAbs_Shape): number;

  // PLib.ConstraintOrder (method)
  static ConstraintOrder(NivConstr: number): GeomAbs_Shape;

  // PLib.EvalLength (method)
  static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Length?: number): { PolynomialCoeff: number; Length: number };
  static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Tol: number, Length?: number, Error?: number): { PolynomialCoeff: number; Length: number; Error: number };

  // PLib.delete (method)
  delete(): void;

  // PLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PLib_HermitJacobi: declare class PLib_HermitJacobi

  // PLib_HermitJacobi.constructor (constructor)
  constructor(WorkDegree: number, ConstraintOrder: GeomAbs_Shape);

  // PLib_HermitJacobi.MaxError (method)
  MaxError(Dimension: number, HermJacCoeff: number, NewDegree: number): { returnValue: number; HermJacCoeff: number };

  // PLib_HermitJacobi.ReduceDegree (method)
  ReduceDegree(Dimension: number, MaxDegree: number, Tol: number, HermJacCoeff?: number, NewDegree?: number, MaxError?: number): { HermJacCoeff: number; NewDegree: number; MaxError: number };

  // PLib_HermitJacobi.AverageError (method)
  AverageError(Dimension: number, HermJacCoeff: number, NewDegree: number): { returnValue: number; HermJacCoeff: number };

  // PLib_HermitJacobi.ToCoefficients (method)
  ToCoefficients(Dimension: number, Degree: number, HermJacCoeff: NCollection_Array1_double, Coefficients: NCollection_Array1_double): void;

  // PLib_HermitJacobi.D0 (method)
  D0(U: number, BasisValue: NCollection_Array1_double): void;

  // PLib_HermitJacobi.D1 (method)
  D1(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double): void;

  // PLib_HermitJacobi.D2 (method)
  D2(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double, BasisD2: NCollection_Array1_double): void;

  // PLib_HermitJacobi.D3 (method)
  D3(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double, BasisD2: NCollection_Array1_double, BasisD3: NCollection_Array1_double): void;

  // PLib_HermitJacobi.WorkDegree (method)
  WorkDegree(): number;

  // PLib_HermitJacobi.NivConstr (method)
  NivConstr(): number;

  // PLib_HermitJacobi.delete (method)
  delete(): void;

  // PLib_HermitJacobi.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PLib_JacobiPolynomial: declare class PLib_JacobiPolynomial

  // PLib_JacobiPolynomial.constructor (constructor)
  constructor(theWorkDegree: number, theConstraintOrder: GeomAbs_Shape);

  // PLib_JacobiPolynomial.Points (method)
  Points(theNbGaussPoints: number, theTabPoints: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.Weights (method)
  Weights(theNbGaussPoints: number, theTabWeights: NCollection_Array2_double): void;

  // PLib_JacobiPolynomial.MaxValue (method)
  MaxValue(theTabMax: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.MaxError (method)
  MaxError(theDimension: number, theJacCoeff: number, theNewDegree: number): { returnValue: number; theJacCoeff: number };

  // PLib_JacobiPolynomial.ReduceDegree (method)
  ReduceDegree(theDimension: number, theMaxDegree: number, theTol: number, theJacCoeff?: number, theNewDegree?: number, theMaxError?: number): { theJacCoeff: number; theNewDegree: number; theMaxError: number };

  // PLib_JacobiPolynomial.AverageError (method)
  AverageError(theDimension: number, theJacCoeff: number, theNewDegree: number): { returnValue: number; theJacCoeff: number };

  // PLib_JacobiPolynomial.ToCoefficients (method)
  ToCoefficients(theDimension: number, theDegree: number, theJacCoeff: NCollection_Array1_double, theCoefficients: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.D0 (method)
  D0(theU: number, theBasisValue: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.D1 (method)
  D1(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.D2 (method)
  D2(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double, theBasisD2: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.D3 (method)
  D3(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double, theBasisD2: NCollection_Array1_double, theBasisD3: NCollection_Array1_double): void;

  // PLib_JacobiPolynomial.WorkDegree (method)
  WorkDegree(): number;

  // PLib_JacobiPolynomial.NivConstr (method)
  NivConstr(): number;

  // PLib_JacobiPolynomial.delete (method)
  delete(): void;

  // PLib_JacobiPolynomial.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
