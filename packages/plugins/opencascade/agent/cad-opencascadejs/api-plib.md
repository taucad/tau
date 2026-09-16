# libcascade — PLib

3 top-level symbols. Signatures are verbatim typescript.

PLib: declare class PLib

  constructor

  static NoWeights(): NCollection_Array1_double;

  static NoWeights2(): NCollection_Array2_double;

  static SetPoles(Poles: NCollection_Array1_gp_Pnt, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;
  static SetPoles(Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double, FP: NCollection_Array1_double): void;

  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, Weights: NCollection_Array1_double): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, Weights: NCollection_Array1_double): void;

  static Bin(N: number, P: number): number;

  static RationalDerivative(Degree: number, N: number, Dimension: number, Ders: number, RDers: number, All: boolean): { Ders: number; RDers: number };

  static RationalDerivatives(DerivativesRequest: number, Dimension: number, PolesDerivatives?: number, WeightsDerivatives?: number, RationalDerivates?: number): { PolesDerivatives: number; WeightsDerivatives: number; RationalDerivates: number };

  static EvalPolynomial(U: number, DerivativeOrder: number, Degree: number, Dimension: number, PolynomialCoeff: number, Results?: number): { Results: number };

  static NoDerivativeEvalPolynomial(U: number, Degree: number, Dimension: number, DegreeDimension: number, PolynomialCoeff: number, Results?: number): { Results: number };

  static EvalPoly2Var(U: number, V: number, UDerivativeOrder: number, VDerivativeOrder: number, UDegree: number, VDegree: number, Dimension: number, PolynomialCoeff?: number, Results?: number): { PolynomialCoeff: number; Results: number };

  static EvalLagrange(U: number, DerivativeOrder: number, Degree: number, Dimension: number, ValueArray?: number, ParameterArray?: number, Results?: number): { returnValue: number; ValueArray: number; ParameterArray: number; Results: number };

  static EvalCubicHermite(U: number, DerivativeOrder: number, Dimension: number, ValueArray?: number, DerivativeArray?: number, ParameterArray?: number, Results?: number): { returnValue: number; ValueArray: number; DerivativeArray: number; ParameterArray: number; Results: number };

  static HermiteCoefficients(FirstParameter: number, LastParameter: number, FirstOrder: number, LastOrder: number, MatrixCoefs: math_Matrix): boolean;

  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt2d, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array2_gp_Pnt, WCoefs: NCollection_Array2_double, Poles: NCollection_Array2_gp_Pnt, WPoles: NCollection_Array2_double): void;
  static CoefficientsPoles(dim: number, Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt2d, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array2_gp_Pnt, WCoefs: NCollection_Array2_double, Poles: NCollection_Array2_gp_Pnt, WPoles: NCollection_Array2_double): void;
  static CoefficientsPoles(dim: number, Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt2d, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array2_gp_Pnt, WCoefs: NCollection_Array2_double, Poles: NCollection_Array2_gp_Pnt, WPoles: NCollection_Array2_double): void;
  static CoefficientsPoles(dim: number, Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt2d, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array2_gp_Pnt, WCoefs: NCollection_Array2_double, Poles: NCollection_Array2_gp_Pnt, WPoles: NCollection_Array2_double): void;
  static CoefficientsPoles(dim: number, Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_gp_Pnt2d, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_gp_Pnt2d, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;
  static CoefficientsPoles(Coefs: NCollection_Array2_gp_Pnt, WCoefs: NCollection_Array2_double, Poles: NCollection_Array2_gp_Pnt, WPoles: NCollection_Array2_double): void;
  static CoefficientsPoles(dim: number, Coefs: NCollection_Array1_double, WCoefs: NCollection_Array1_double, Poles: NCollection_Array1_double, WPoles: NCollection_Array1_double): void;

  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt2d, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, dim: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt2d, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, dim: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt2d, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, dim: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_gp_Pnt2d, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;
  static Trimming(U1: number, U2: number, dim: number, Coeffs: NCollection_Array1_double, WCoeffs: NCollection_Array1_double): void;

  static UTrimming(U1: number, U2: number, Coeffs: NCollection_Array2_gp_Pnt, WCoeffs: NCollection_Array2_double): void;

  static VTrimming(V1: number, V2: number, Coeffs: NCollection_Array2_gp_Pnt, WCoeffs: NCollection_Array2_double): void;

  static HermiteInterpolate(Dimension: number, FirstParameter: number, LastParameter: number, FirstOrder: number, LastOrder: number, FirstConstr: NCollection_Array2_double, LastConstr: NCollection_Array2_double, Coefficients: NCollection_Array1_double): boolean;

  static JacobiParameters(ConstraintOrder: GeomAbs_Shape, MaxDegree: number, Code: number, NbGaussPoints?: number, WorkDegree?: number): { NbGaussPoints: number; WorkDegree: number };

  static NivConstr(ConstraintOrder: GeomAbs_Shape): number;

  static ConstraintOrder(NivConstr: number): GeomAbs_Shape;

  static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Length?: number): { PolynomialCoeff: number; Length: number };
  static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Tol: number, Length?: number, Error?: number): { PolynomialCoeff: number; Length: number; Error: number };
  static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Length?: number): { PolynomialCoeff: number; Length: number };
  static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Tol: number, Length?: number, Error?: number): { PolynomialCoeff: number; Length: number; Error: number };

  delete(): void;

  [Symbol.dispose](): void;

PLib_HermitJacobi: declare class PLib_HermitJacobi

  constructor

  MaxError(Dimension: number, HermJacCoeff: number, NewDegree: number): { returnValue: number; HermJacCoeff: number };

  ReduceDegree(Dimension: number, MaxDegree: number, Tol: number, HermJacCoeff?: number, NewDegree?: number, MaxError?: number): { HermJacCoeff: number; NewDegree: number; MaxError: number };

  AverageError(Dimension: number, HermJacCoeff: number, NewDegree: number): { returnValue: number; HermJacCoeff: number };

  ToCoefficients(Dimension: number, Degree: number, HermJacCoeff: NCollection_Array1_double, Coefficients: NCollection_Array1_double): void;

  D0(U: number, BasisValue: NCollection_Array1_double): void;

  D1(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double): void;

  D2(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double, BasisD2: NCollection_Array1_double): void;

  D3(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double, BasisD2: NCollection_Array1_double, BasisD3: NCollection_Array1_double): void;

  WorkDegree(): number;

  NivConstr(): number;

  delete(): void;

  [Symbol.dispose](): void;

PLib_JacobiPolynomial: declare class PLib_JacobiPolynomial

  constructor

  Points(theNbGaussPoints: number, theTabPoints: NCollection_Array1_double): void;

  Weights(theNbGaussPoints: number, theTabWeights: NCollection_Array2_double): void;

  MaxValue(theTabMax: NCollection_Array1_double): void;

  MaxError(theDimension: number, theJacCoeff: number, theNewDegree: number): { returnValue: number; theJacCoeff: number };

  ReduceDegree(theDimension: number, theMaxDegree: number, theTol: number, theJacCoeff?: number, theNewDegree?: number, theMaxError?: number): { theJacCoeff: number; theNewDegree: number; theMaxError: number };

  AverageError(theDimension: number, theJacCoeff: number, theNewDegree: number): { returnValue: number; theJacCoeff: number };

  ToCoefficients(theDimension: number, theDegree: number, theJacCoeff: NCollection_Array1_double, theCoefficients: NCollection_Array1_double): void;

  D0(theU: number, theBasisValue: NCollection_Array1_double): void;

  D1(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double): void;

  D2(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double, theBasisD2: NCollection_Array1_double): void;

  D3(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double, theBasisD2: NCollection_Array1_double, theBasisD3: NCollection_Array1_double): void;

  WorkDegree(): number;

  NivConstr(): number;

  delete(): void;

  [Symbol.dispose](): void;
