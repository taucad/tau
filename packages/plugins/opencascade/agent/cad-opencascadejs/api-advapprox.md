# libcascade — AdvApprox

7 top-level symbols. Signatures are verbatim typescript.

AdvApprox_ApproxAFunction: declare class AdvApprox_ApproxAFunction

constructor

static Approximation(TotalDimension: number, TotalNumSS: number, LocalDimension: NCollection_Array1_int, First: number, Last: number, Evaluator: AdvApprox_EvaluatorFunction, CutTool: AdvApprox_Cutting, ContinuityOrder: number, NumMaxCoeffs: number, MaxSegments: number, TolerancesArray: NCollection_Array1_double, code_precis: number, NumCurves: number, NumCoeffPerCurveArray: NCollection_Array1_int, LocalCoefficientArray: NCollection_Array1_double, IntervalsArray: NCollection_Array1_double, ErrorMaxArray: NCollection_Array1_double, AverageErrorArray: NCollection_Array1_double, ErrorCode?: number): { NumCurves: number; ErrorCode: number };

IsDone(): boolean;

HasResult(): boolean;

Poles1d(): NCollection_HArray2_double;
Poles1d(Index: number, P: NCollection_Array1_double): void;
Poles1d(): NCollection_HArray2_double;
Poles1d(Index: number, P: NCollection_Array1_double): void;

Poles2d(): NCollection_HArray2_gp_Pnt2d;
Poles2d(Index: number, P: NCollection_Array1_gp_Pnt2d): void;
Poles2d(): NCollection_HArray2_gp_Pnt2d;
Poles2d(Index: number, P: NCollection_Array1_gp_Pnt2d): void;

Poles(): NCollection_HArray2_gp_Pnt;
Poles(Index: number, P: NCollection_Array1_gp_Pnt): void;
Poles(): NCollection_HArray2_gp_Pnt;
Poles(Index: number, P: NCollection_Array1_gp_Pnt): void;

NbPoles(): number;

Degree(): number;

NbKnots(): number;

NumSubSpaces(Dimension: number): number;

Knots(): NCollection_HArray1_double;

Multiplicities(): NCollection_HArray1_int;

MaxError(Dimension: number): NCollection_HArray1_double;
MaxError(Dimension: number, Index: number): number;
MaxError(Dimension: number): NCollection_HArray1_double;
MaxError(Dimension: number, Index: number): number;

AverageError(Dimension: number): NCollection_HArray1_double;
AverageError(Dimension: number, Index: number): number;
AverageError(Dimension: number): NCollection_HArray1_double;
AverageError(Dimension: number, Index: number): number;

delete(): void;

[Symbol.dispose](): void;

AdvApprox_Cutting: declare class AdvApprox_Cutting

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

delete(): void;

[Symbol.dispose](): void;

AdvApprox_DichoCutting: declare class AdvApprox_DichoCutting extends AdvApprox_Cutting

constructor

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

delete(): void;

[Symbol.dispose](): void;

AdvApprox_EvaluatorFunction: declare class AdvApprox_EvaluatorFunction

Evaluate(Dimension: number, StartEnd: [number, number], Parameter: number, DerivativeRequest: number, Result: number, ErrorCode: number): void;

delete(): void;

[Symbol.dispose](): void;

AdvApprox_PrefAndRec: declare class AdvApprox_PrefAndRec extends AdvApprox_Cutting

constructor

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

delete(): void;

[Symbol.dispose](): void;

AdvApprox_PrefCutting: declare class AdvApprox_PrefCutting extends AdvApprox_Cutting

constructor

Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

delete(): void;

[Symbol.dispose](): void;

AdvApprox_SimpleApprox: declare class AdvApprox_SimpleApprox

constructor

Perform(LocalDimension: NCollection_Array1_int, LocalTolerancesArray: NCollection_Array1_double, First: number, Last: number, MaxDegree: number): void;

IsDone(): boolean;

Degree(): number;

Coefficients(): NCollection_HArray1_double;

FirstConstr(): NCollection_HArray2_double;

LastConstr(): NCollection_HArray2_double;

SomTab(): NCollection_HArray1_double;

DifTab(): NCollection_HArray1_double;

MaxError(Index: number): number;

AverageError(Index: number): number;

delete(): void;

[Symbol.dispose](): void;
