# libcascade — AdvApprox

7 top-level symbols. Signatures are verbatim typescript.

// this approximate a given function
AdvApprox_ApproxAFunction: declare class AdvApprox_ApproxAFunction

constructor

static Approximation(TotalDimension: number, TotalNumSS: number, LocalDimension: NCollection_Array1_int, First: number, Last: number, Evaluator: AdvApprox_EvaluatorFunction, CutTool: AdvApprox_Cutting, ContinuityOrder: number, NumMaxCoeffs: number, MaxSegments: number, TolerancesArray: NCollection_Array1_double, code_precis: number, NumCurves: number, NumCoeffPerCurveArray: NCollection_Array1_int, LocalCoefficientArray: NCollection_Array1_double, IntervalsArray: NCollection_Array1_double, ErrorMaxArray: NCollection_Array1_double, AverageErrorArray: NCollection_Array1_double, ErrorCode?: number): { NumCurves: number; ErrorCode: number };

IsDone(): boolean;

HasResult(): boolean;

// returns the poles from the algorithms as is returns the poles at Index from the 1d subspace
Poles1d(): NCollection_HArray2_double;
Poles1d(Index: number, P: NCollection_Array1_double): void;
Poles1d(): NCollection_HArray2_double;
Poles1d(Index: number, P: NCollection_Array1_double): void;

// returns the poles from the algorithms as is returns the poles at Index from the 2d subspace
Poles2d(): NCollection_HArray2_gp_Pnt2d;
Poles2d(Index: number, P: NCollection_Array1_gp_Pnt2d): void;
Poles2d(): NCollection_HArray2_gp_Pnt2d;
Poles2d(Index: number, P: NCollection_Array1_gp_Pnt2d): void;

// - returns the poles from the algorithms as is returns the poles at Index from the 3d subspace
Poles(): NCollection_HArray2_gp_Pnt;
Poles(Index: number, P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_HArray2_gp_Pnt;
Poles(Index: number, P: NCollection_Array1_gp_Pnt): void;

// as the name says
NbPoles(): number;

Degree(): number;

NbKnots(): number;

NumSubSpaces(Dimension: number): number;

Knots(): NCollection_HArray1_double;

Multiplicities(): NCollection_HArray1_int;

// returns the error as is in the algorithms
MaxError(Dimension: number): NCollection_HArray1_double;
MaxError(Dimension: number, Index: number): number;
MaxError(Dimension: number): NCollection_HArray1_double;
MaxError(Dimension: number, Index: number): number;

// returns the error as is in the algorithms
AverageError(Dimension: number): NCollection_HArray1_double;
AverageError(Dimension: number, Index: number): number;
AverageError(Dimension: number): NCollection_HArray1_double;
AverageError(Dimension: number, Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// to choose the way of cutting in approximation
AdvApprox_Cutting: declare class AdvApprox_Cutting

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// if Cutting is necessary in [a,b], we cut at (a+b) / 2
AdvApprox_DichoCutting: declare class AdvApprox_DichoCutting extends AdvApprox_Cutting

constructor

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface for a class implementing a function to be approximated by {@link AdvApprox_ApproxAFunction`AdvApprox_ApproxAFunction`}
AdvApprox_EvaluatorFunction: declare class AdvApprox_EvaluatorFunction

// Function evaluation method to be defined by descendant
Evaluate(Dimension: number, StartEnd: [number, number], Parameter: number, DerivativeRequest: number, Result: number, ErrorCode: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// inherits class Cutting
AdvApprox_PrefAndRec: declare class AdvApprox_PrefAndRec extends AdvApprox_Cutting

constructor

// cuting value is
Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// inherits class Cutting
AdvApprox_PrefCutting: declare class AdvApprox_PrefCutting extends AdvApprox_Cutting

constructor

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximate a function on an interval [First,Last] The result is a simple polynomial whose degree is as low as possible to satisfy the required tolerance and the maximum degree
AdvApprox_SimpleApprox: declare class AdvApprox_SimpleApprox

constructor

// Constructs approximator tool
Perform(LocalDimension: NCollection_Array1_int, LocalTolerancesArray: NCollection_Array1_double, First: number, Last: number, MaxDegree: number): void;

IsDone(): boolean;

Degree(): number;

// returns the coefficients in the Jacobi Base
Coefficients(): NCollection_HArray1_double;

// returns the constraints at First
FirstConstr(): NCollection_HArray2_double;

// returns the constraints at Last
LastConstr(): NCollection_HArray2_double;

SomTab(): NCollection_HArray1_double;

DifTab(): NCollection_HArray1_double;

MaxError(Index: number): number;

AverageError(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
