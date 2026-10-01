# libcascade — AdvApprox

7 top-level symbols. Signatures are verbatim typescript.

AdvApprox_ApproxAFunction: declare class AdvApprox_ApproxAFunction

  // AdvApprox_ApproxAFunction.constructor (constructor)
  constructor(Num1DSS: number, Num2DSS: number, Num3DSS: number, OneDTol: NCollection_HArray1_double, TwoDTol: NCollection_HArray1_double, ThreeDTol: NCollection_HArray1_double, First: number, Last: number, Continuity: GeomAbs_Shape, MaxDeg: number, MaxSeg: number, Func: AdvApprox_EvaluatorFunction);
  constructor(Num1DSS: number, Num2DSS: number, Num3DSS: number, OneDTol: NCollection_HArray1_double, TwoDTol: NCollection_HArray1_double, ThreeDTol: NCollection_HArray1_double, First: number, Last: number, Continuity: GeomAbs_Shape, MaxDeg: number, MaxSeg: number, Func: AdvApprox_EvaluatorFunction, CutTool: AdvApprox_Cutting);

  // AdvApprox_ApproxAFunction.Approximation (method)
  static Approximation(TotalDimension: number, TotalNumSS: number, LocalDimension: NCollection_Array1_int, First: number, Last: number, Evaluator: AdvApprox_EvaluatorFunction, CutTool: AdvApprox_Cutting, ContinuityOrder: number, NumMaxCoeffs: number, MaxSegments: number, TolerancesArray: NCollection_Array1_double, code_precis: number, NumCurves: number, NumCoeffPerCurveArray: NCollection_Array1_int, LocalCoefficientArray: NCollection_Array1_double, IntervalsArray: NCollection_Array1_double, ErrorMaxArray: NCollection_Array1_double, AverageErrorArray: NCollection_Array1_double, ErrorCode?: number): { NumCurves: number; ErrorCode: number };

  // AdvApprox_ApproxAFunction.IsDone (method)
  IsDone(): boolean;

  // AdvApprox_ApproxAFunction.HasResult (method)
  HasResult(): boolean;

  // AdvApprox_ApproxAFunction.Poles1d (method)
  Poles1d(): NCollection_HArray2_double;
  Poles1d(Index: number, P: NCollection_Array1_double): void;

  // AdvApprox_ApproxAFunction.Poles2d (method)
  Poles2d(): NCollection_HArray2_gp_Pnt2d;
  Poles2d(Index: number, P: NCollection_Array1_gp_Pnt2d): void;

  // AdvApprox_ApproxAFunction.Poles (method)
  Poles(): NCollection_HArray2_gp_Pnt;
  Poles(Index: number, P: NCollection_Array1_gp_Pnt): void;

  // AdvApprox_ApproxAFunction.NbPoles (method)
  NbPoles(): number;

  // AdvApprox_ApproxAFunction.Degree (method)
  Degree(): number;

  // AdvApprox_ApproxAFunction.NbKnots (method)
  NbKnots(): number;

  // AdvApprox_ApproxAFunction.NumSubSpaces (method)
  NumSubSpaces(Dimension: number): number;

  // AdvApprox_ApproxAFunction.Knots (method)
  Knots(): NCollection_HArray1_double;

  // AdvApprox_ApproxAFunction.Multiplicities (method)
  Multiplicities(): NCollection_HArray1_int;

  // AdvApprox_ApproxAFunction.MaxError (method)
  MaxError(Dimension: number): NCollection_HArray1_double;
  MaxError(Dimension: number, Index: number): number;

  // AdvApprox_ApproxAFunction.AverageError (method)
  AverageError(Dimension: number): NCollection_HArray1_double;
  AverageError(Dimension: number, Index: number): number;

  // AdvApprox_ApproxAFunction.delete (method)
  delete(): void;

  // AdvApprox_ApproxAFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AdvApprox_Cutting: declare class AdvApprox_Cutting

  // AdvApprox_Cutting.Value (method)
  Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

  // AdvApprox_Cutting.delete (method)
  delete(): void;

  // AdvApprox_Cutting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AdvApprox_DichoCutting: declare class AdvApprox_DichoCutting extends AdvApprox_Cutting

  // AdvApprox_DichoCutting.constructor (constructor)
  constructor();

  // AdvApprox_DichoCutting.Value (method)
  Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

  // AdvApprox_DichoCutting.delete (method)
  delete(): void;

  // AdvApprox_DichoCutting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AdvApprox_EvaluatorFunction: declare class AdvApprox_EvaluatorFunction

  // AdvApprox_EvaluatorFunction.Evaluate (method)
  Evaluate(Dimension: number, StartEnd: [number, number], Parameter: number, DerivativeRequest: number, Result: number, ErrorCode: number): void;

  // AdvApprox_EvaluatorFunction.delete (method)
  delete(): void;

  // AdvApprox_EvaluatorFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AdvApprox_PrefAndRec: declare class AdvApprox_PrefAndRec extends AdvApprox_Cutting

  // AdvApprox_PrefAndRec.constructor (constructor)
  constructor(RecomendedCut: NCollection_Array1_double, PrefferedCut: NCollection_Array1_double, Weight?: number);

  // AdvApprox_PrefAndRec.Value (method)
  Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

  // AdvApprox_PrefAndRec.delete (method)
  delete(): void;

  // AdvApprox_PrefAndRec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AdvApprox_PrefCutting: declare class AdvApprox_PrefCutting extends AdvApprox_Cutting

  // AdvApprox_PrefCutting.constructor (constructor)
  constructor(CutPnts: NCollection_Array1_double);

  // AdvApprox_PrefCutting.Value (method)
  Value(a: number, b: number, cuttingvalue: number): { returnValue: boolean; cuttingvalue: number };

  // AdvApprox_PrefCutting.delete (method)
  delete(): void;

  // AdvApprox_PrefCutting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AdvApprox_SimpleApprox: declare class AdvApprox_SimpleApprox

  // AdvApprox_SimpleApprox.constructor (constructor)
  constructor(TotalDimension: number, TotalNumSS: number, Continuity: GeomAbs_Shape, WorkDegree: number, NbGaussPoints: number, JacobiBase: PLib_JacobiPolynomial, Func: AdvApprox_EvaluatorFunction);

  // AdvApprox_SimpleApprox.Perform (method)
  Perform(LocalDimension: NCollection_Array1_int, LocalTolerancesArray: NCollection_Array1_double, First: number, Last: number, MaxDegree: number): void;

  // AdvApprox_SimpleApprox.IsDone (method)
  IsDone(): boolean;

  // AdvApprox_SimpleApprox.Degree (method)
  Degree(): number;

  // AdvApprox_SimpleApprox.Coefficients (method)
  Coefficients(): NCollection_HArray1_double;

  // AdvApprox_SimpleApprox.FirstConstr (method)
  FirstConstr(): NCollection_HArray2_double;

  // AdvApprox_SimpleApprox.LastConstr (method)
  LastConstr(): NCollection_HArray2_double;

  // AdvApprox_SimpleApprox.SomTab (method)
  SomTab(): NCollection_HArray1_double;

  // AdvApprox_SimpleApprox.DifTab (method)
  DifTab(): NCollection_HArray1_double;

  // AdvApprox_SimpleApprox.MaxError (method)
  MaxError(Index: number): number;

  // AdvApprox_SimpleApprox.AverageError (method)
  AverageError(Index: number): number;

  // AdvApprox_SimpleApprox.delete (method)
  delete(): void;

  // AdvApprox_SimpleApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
