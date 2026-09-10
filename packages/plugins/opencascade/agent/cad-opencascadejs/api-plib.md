# libcascade — PLib

3 top-level symbols. Signatures are verbatim typescript.

// {@link PLib`PLib`} means Polynomial functions library
PLib: declare class PLib

constructor

// Used as argument for a non rational functions
static NoWeights(): NCollection_Array1_double;

// Used as argument for a non rational functions
static NoWeights2(): NCollection_Array2_double;

// Copy in FP the coordinates of the poles
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
// FP: Mutated in place

// Get from FP the coordinates of the poles
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
// Poles: Mutated in place

// Returns the Binomial Cnp
static Bin(N: number, P: number): number;

// Computes the derivatives of a ratio at order <N> in dimension <Dimension>
static RationalDerivative(Degree: number, N: number, Dimension: number, Ders: number, RDers: number, All: boolean): { Ders: number; RDers: number };

// Computes DerivativesRequest derivatives of a ratio at of a BSpline function of degree <Degree> dimension <Dimension>
static RationalDerivatives(DerivativesRequest: number, Dimension: number, PolesDerivatives?: number, WeightsDerivatives?: number, RationalDerivates?: number): { PolesDerivatives: number; WeightsDerivatives: number; RationalDerivates: number };

// Performs Horner method with synthetic division for derivatives parameter , with <Degree> and <Dimension>
static EvalPolynomial(U: number, DerivativeOrder: number, Degree: number, Dimension: number, PolynomialCoeff: number, Results?: number): { Results: number };

// Same as above with DerivativeOrder = 0;
static NoDerivativeEvalPolynomial(U: number, Degree: number, Dimension: number, DegreeDimension: number, PolynomialCoeff: number, Results?: number): { Results: number };

// Applies EvalPolynomial twice to evaluate the derivative of orders UDerivativeOrder in U, VDerivativeOrder in V at parameters U,V
static EvalPoly2Var(U: number, V: number, UDerivativeOrder: number, VDerivativeOrder: number, UDegree: number, VDegree: number, Dimension: number, PolynomialCoeff?: number, Results?: number): { PolynomialCoeff: number; Results: number };

// Performs the Lagrange Interpolation of given series of points with given parameters with the requested derivative order Results will store things in the following format with d = DerivativeOrder
static EvalLagrange(U: number, DerivativeOrder: number, Degree: number, Dimension: number, ValueArray?: number, ParameterArray?: number, Results?: number): { returnValue: number; ValueArray: number; ParameterArray: number; Results: number };

// Performs the Cubic Hermite Interpolation of given series of points with given parameters with the requested derivative order
static EvalCubicHermite(U: number, DerivativeOrder: number, Dimension: number, ValueArray?: number, DerivativeArray?: number, ParameterArray?: number, Results?: number): { returnValue: number; ValueArray: number; DerivativeArray: number; ParameterArray: number; Results: number };

// This build the coefficient of Hermite's polynomes on [FirstParameter, LastParameter]
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

// Compute the coefficients in the canonical base of the polynomial satisfying the given constraints at the given parameters The array FirstContr(i,j) i=1,Dimension j=0,FirstOrder contains the values of the constraint at parameter FirstParameter idem for LastConstr
static HermiteInterpolate(Dimension: number, FirstParameter: number, LastParameter: number, FirstOrder: number, LastOrder: number, FirstConstr: NCollection_Array2_double, LastConstr: NCollection_Array2_double, Coefficients: NCollection_Array1_double): boolean;
// Coefficients: Mutated in place

// Compute the number of points used for integral computations (NbGaussPoints) and the degree of Jacobi Polynomial (WorkDegree)
static JacobiParameters(ConstraintOrder: GeomAbs_Shape, MaxDegree: number, Code: number, NbGaussPoints?: number, WorkDegree?: number): { NbGaussPoints: number; WorkDegree: number };

// translates from GeomAbs_Shape to Integer
static NivConstr(ConstraintOrder: GeomAbs_Shape): number;

// translates from Integer to GeomAbs_Shape
static ConstraintOrder(NivConstr: number): GeomAbs_Shape;

static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Length?: number): { PolynomialCoeff: number; Length: number };
static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Tol: number, Length?: number, Error?: number): { PolynomialCoeff: number; Length: number; Error: number };
static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Length?: number): { PolynomialCoeff: number; Length: number };
static EvalLength(Degree: number, Dimension: number, PolynomialCoeff: number, U1: number, U2: number, Tol: number, Length?: number, Error?: number): { PolynomialCoeff: number; Length: number; Error: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides method to work with Jacobi Polynomials relatively to an order of constraint q = myWorkDegree-2\*(myNivConstr+1) Jk(t) for k=0,q compose the Jacobi Polynomial base relatively to the weight W(t) iorder is the integer value for the constraints
PLib_HermitJacobi: declare class PLib_HermitJacobi

constructor

// This method computes the maximum error on the polynomial W(t) Q(t) obtained by missing the coefficients of JacCoeff from NewDegree +1 to Degree
MaxError(Dimension: number, HermJacCoeff: number, NewDegree: number): { returnValue: number; HermJacCoeff: number };

// Compute NewDegree <= MaxDegree so that MaxError is lower than Tol
ReduceDegree(Dimension: number, MaxDegree: number, Tol: number, HermJacCoeff?: number, NewDegree?: number, MaxError?: number): { HermJacCoeff: number; NewDegree: number; MaxError: number };

AverageError(Dimension: number, HermJacCoeff: number, NewDegree: number): { returnValue: number; HermJacCoeff: number };

// Convert the polynomial P(t) = H(t) + W(t) Q(t) in the canonical base
ToCoefficients(Dimension: number, Degree: number, HermJacCoeff: NCollection_Array1_double, Coefficients: NCollection_Array1_double): void;
// Coefficients: Mutated in place

// Compute the values of the basis functions in u
D0(U: number, BasisValue: NCollection_Array1_double): void;
// BasisValue: Mutated in place

// Compute the values and the derivatives values of the basis functions in u
D1(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double): void;
// BasisValue: Mutated in place
// BasisD1: Mutated in place

// Compute the values and the derivatives values of the basis functions in u
D2(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double, BasisD2: NCollection_Array1_double): void;
// BasisValue: Mutated in place
// BasisD1: Mutated in place
// BasisD2: Mutated in place

// Compute the values and the derivatives values of the basis functions in u
D3(U: number, BasisValue: NCollection_Array1_double, BasisD1: NCollection_Array1_double, BasisD2: NCollection_Array1_double, BasisD3: NCollection_Array1_double): void;
// BasisValue: Mutated in place
// BasisD1: Mutated in place
// BasisD2: Mutated in place
// BasisD3: Mutated in place

// returns WorkDegree
WorkDegree(): number;

// returns NivConstr
NivConstr(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides method to work with Jacobi Polynomials relatively to an order of constraint q = myWorkDegree-2\*(myNivConstr+1) Jk(t) for k=0,q compose the Jacobi Polynomial base relatively to the weight W(t) iorder is the integer value for the constraints
PLib_JacobiPolynomial: declare class PLib_JacobiPolynomial

constructor

// returns the Jacobi Points for Gauss integration ie the positive values of the Legendre roots by increasing values NbGaussPoints is the number of points chosen for the integral computation
Points(theNbGaussPoints: number, theTabPoints: NCollection_Array1_double): void;
// theTabPoints: Mutated in place

// returns the Jacobi weights for Gauss integration only for the positive values of the Legendre roots in the order they are given by the method Points NbGaussPoints is the number of points chosen for the integral computation
Weights(theNbGaussPoints: number, theTabWeights: NCollection_Array2_double): void;
// theTabWeights: Mutated in place

// this method loads for k=0,q the maximum value of abs ( W(t)_Jk(t) ) for t bellonging to [-1,1] This values are loaded is the array TabMax(0,myWorkDegree-2_(myNivConst+1)) MaxValue ( me
MaxValue(theTabMax: NCollection_Array1_double): void;
// theTabMax: Mutated in place

// This method computes the maximum error on the polynomial W(t) Q(t) obtained by missing the coefficients of JacCoeff from NewDegree +1 to Degree
MaxError(theDimension: number, theJacCoeff: number, theNewDegree: number): { returnValue: number; theJacCoeff: number };

// Compute NewDegree <= MaxDegree so that MaxError is lower than Tol
ReduceDegree(theDimension: number, theMaxDegree: number, theTol: number, theJacCoeff?: number, theNewDegree?: number, theMaxError?: number): { theJacCoeff: number; theNewDegree: number; theMaxError: number };

AverageError(theDimension: number, theJacCoeff: number, theNewDegree: number): { returnValue: number; theJacCoeff: number };

// Convert the polynomial P(t) = R(t) + W(t) Q(t) in the canonical base
ToCoefficients(theDimension: number, theDegree: number, theJacCoeff: NCollection_Array1_double, theCoefficients: NCollection_Array1_double): void;
// theCoefficients: Mutated in place

// Compute the values of the basis functions in u
D0(theU: number, theBasisValue: NCollection_Array1_double): void;
// theBasisValue: Mutated in place

// Compute the values and the derivatives values of the basis functions in u
D1(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double): void;
// theBasisValue: Mutated in place
// theBasisD1: Mutated in place

// Compute the values and the derivatives values of the basis functions in u
D2(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double, theBasisD2: NCollection_Array1_double): void;
// theBasisValue: Mutated in place
// theBasisD1: Mutated in place
// theBasisD2: Mutated in place

// Compute the values and the derivatives values of the basis functions in u
D3(theU: number, theBasisValue: NCollection_Array1_double, theBasisD1: NCollection_Array1_double, theBasisD2: NCollection_Array1_double, theBasisD3: NCollection_Array1_double): void;
// theBasisValue: Mutated in place
// theBasisD1: Mutated in place
// theBasisD2: Mutated in place
// theBasisD3: Mutated in place

// returns WorkDegree
WorkDegree(): number;

// returns NivConstr
NivConstr(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
