# libcascade — BRepApprox

19 top-level symbols. Signatures are verbatim typescript.

BRepApprox_ApproxLine: declare class BRepApprox_ApproxLine extends Standard_Transient

  // BRepApprox_ApproxLine.constructor (constructor)
  constructor(lin: IntSurf_LineOn2S, theTang?: boolean);
  constructor(CurveXYZ: Geom_BSplineCurve, CurveUV1: Geom2d_BSplineCurve, CurveUV2: Geom2d_BSplineCurve);

  // BRepApprox_ApproxLine.NbPnts (method)
  NbPnts(): number;

  // BRepApprox_ApproxLine.Point (method)
  Point(Index: number): IntSurf_PntOn2S;

  // BRepApprox_ApproxLine.get_type_name (method)
  static get_type_name(): string;

  // BRepApprox_ApproxLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepApprox_ApproxLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepApprox_ApproxLine.delete (method)
  delete(): void;

  // BRepApprox_ApproxLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox extends math_BFGS

  // BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox.constructor (constructor)
  constructor(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double, Tolerance3d: number, Tolerance2d: number, Eps: number, NbIterations?: number);

  // BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox extends math_MultipleVarFunctionWithGradient

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NbPol: number);

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.NbVariables (method)
  NbVariables(): number;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.NewParameters (method)
  NewParameters(): math_VectorBase_double;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.CurveValue (method)
  CurveValue(): AppParCurves_MultiBSpCurve;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.Error (method)
  Error(IPoint: number, CurveIndex: number): number;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.MaxError3d (method)
  MaxError3d(): number;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.MaxError2d (method)
  MaxError2d(): number;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.Index (method)
  Index(): math_VectorBase_int;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.FirstConstraint (method)
  FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.LastConstraint (method)
  LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.SetFirstLambda (method)
  SetFirstLambda(l1: number): void;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.SetLastLambda (method)
  SetLastLambda(l2: number): void;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.Perform (method)
  Perform(Parameters: math_VectorBase_double): void;
  Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.BezierValue (method)
  BezierValue(): AppParCurves_MultiCurve;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.BSplineValue (method)
  BSplineValue(): AppParCurves_MultiBSpCurve;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.ErrorGradient (method)
  ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.Distance (method)
  Distance(): math_Matrix;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.FirstLambda (method)
  FirstLambda(): number;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.LastLambda (method)
  LastLambda(): number;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.Points (method)
  Points(): math_Matrix;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.Poles (method)
  Poles(): math_Matrix;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.KIndex (method)
  KIndex(): math_VectorBase_int;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox extends math_BFGS

  // BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox.constructor (constructor)
  constructor(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double, Tolerance3d: number, Tolerance2d: number, Eps: number, NbIterations?: number);

  // BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox.delete (method)
  delete(): void;

  // BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox extends math_BFGS

  // BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox.constructor (constructor)
  constructor(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double, Tolerance3d: number, Tolerance2d: number, Eps: number, NbIterations?: number);

  // BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_MyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_MyBSplGradientOfTheComputeLineOfApprox

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Deg: number, Tol3d: number, Tol2d: number, NbIterations?: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Deg: number, Tol3d: number, Tol2d: number, NbIterations: number, lambda1: number, lambda2: number);

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.Value (method)
  Value(): AppParCurves_MultiBSpCurve;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.Error (method)
  Error(Index: number): number;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.MaxError3d (method)
  MaxError3d(): number;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.MaxError2d (method)
  MaxError2d(): number;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.AverageError (method)
  AverageError(): number;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_MyBSplGradientOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_MyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_MyGradientOfTheComputeLineBezierOfApprox

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number, Tol3d: number, Tol2d: number, NbIterations?: number);

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.Value (method)
  Value(): AppParCurves_MultiCurve;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.Error (method)
  Error(Index: number): number;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.MaxError3d (method)
  MaxError3d(): number;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.MaxError2d (method)
  MaxError2d(): number;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.AverageError (method)
  AverageError(): number;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.delete (method)
  delete(): void;

  // BRepApprox_MyGradientOfTheComputeLineBezierOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_MyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_MyGradientbisOfTheComputeLineOfApprox

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number, Tol3d: number, Tol2d: number, NbIterations?: number);

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.Value (method)
  Value(): AppParCurves_MultiCurve;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.Error (method)
  Error(Index: number): number;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.MaxError3d (method)
  MaxError3d(): number;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.MaxError2d (method)
  MaxError2d(): number;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.AverageError (method)
  AverageError(): number;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_MyGradientbisOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox extends math_MultipleVarFunctionWithGradient

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number);

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.NbVariables (method)
  NbVariables(): number;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.NewParameters (method)
  NewParameters(): math_VectorBase_double;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.CurveValue (method)
  CurveValue(): AppParCurves_MultiCurve;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.Error (method)
  Error(IPoint: number, CurveIndex: number): number;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.MaxError3d (method)
  MaxError3d(): number;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.MaxError2d (method)
  MaxError2d(): number;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.FirstConstraint (method)
  FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.LastConstraint (method)
  LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.delete (method)
  delete(): void;

  // BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox extends math_MultipleVarFunctionWithGradient

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number);

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.NbVariables (method)
  NbVariables(): number;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.NewParameters (method)
  NewParameters(): math_VectorBase_double;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.CurveValue (method)
  CurveValue(): AppParCurves_MultiCurve;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.Error (method)
  Error(IPoint: number, CurveIndex: number): number;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.MaxError3d (method)
  MaxError3d(): number;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.MaxError2d (method)
  MaxError2d(): number;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.FirstConstraint (method)
  FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.LastConstraint (method)
  LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.Perform (method)
  Perform(Parameters: math_VectorBase_double): void;
  Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.BezierValue (method)
  BezierValue(): AppParCurves_MultiCurve;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.BSplineValue (method)
  BSplineValue(): AppParCurves_MultiBSpCurve;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.ErrorGradient (method)
  ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.Distance (method)
  Distance(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.FirstLambda (method)
  FirstLambda(): number;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.LastLambda (method)
  LastLambda(): number;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.Points (method)
  Points(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.Poles (method)
  Poles(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.KIndex (method)
  KIndex(): math_VectorBase_int;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.delete (method)
  delete(): void;

  // BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.constructor (constructor)
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: BRepApprox_TheMultiLineOfApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.Perform (method)
  Perform(Parameters: math_VectorBase_double): void;
  Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.BezierValue (method)
  BezierValue(): AppParCurves_MultiCurve;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.BSplineValue (method)
  BSplineValue(): AppParCurves_MultiBSpCurve;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.ErrorGradient (method)
  ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.Distance (method)
  Distance(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.FirstLambda (method)
  FirstLambda(): number;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.LastLambda (method)
  LastLambda(): number;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.Points (method)
  Points(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.Poles (method)
  Poles(): math_Matrix;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.KIndex (method)
  KIndex(): math_VectorBase_int;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_SurfaceTool: declare class BRepApprox_SurfaceTool

  // BRepApprox_SurfaceTool.constructor (constructor)
  constructor();

  // BRepApprox_SurfaceTool.FirstUParameter (method)
  static FirstUParameter(S: BRepAdaptor_Surface): number;

  // BRepApprox_SurfaceTool.FirstVParameter (method)
  static FirstVParameter(S: BRepAdaptor_Surface): number;

  // BRepApprox_SurfaceTool.LastUParameter (method)
  static LastUParameter(S: BRepAdaptor_Surface): number;

  // BRepApprox_SurfaceTool.LastVParameter (method)
  static LastVParameter(S: BRepAdaptor_Surface): number;

  // BRepApprox_SurfaceTool.NbUIntervals (method)
  static NbUIntervals(S: BRepAdaptor_Surface, Sh: GeomAbs_Shape): number;

  // BRepApprox_SurfaceTool.NbVIntervals (method)
  static NbVIntervals(S: BRepAdaptor_Surface, Sh: GeomAbs_Shape): number;

  // BRepApprox_SurfaceTool.UIntervals (method)
  static UIntervals(S: BRepAdaptor_Surface, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

  // BRepApprox_SurfaceTool.VIntervals (method)
  static VIntervals(S: BRepAdaptor_Surface, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

  // BRepApprox_SurfaceTool.UTrim (method)
  static UTrim(S: BRepAdaptor_Surface, First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // BRepApprox_SurfaceTool.VTrim (method)
  static VTrim(S: BRepAdaptor_Surface, First: number, Last: number, Tol: number): Adaptor3d_Surface;

  // BRepApprox_SurfaceTool.IsUClosed (method)
  static IsUClosed(S: BRepAdaptor_Surface): boolean;

  // BRepApprox_SurfaceTool.IsVClosed (method)
  static IsVClosed(S: BRepAdaptor_Surface): boolean;

  // BRepApprox_SurfaceTool.IsUPeriodic (method)
  static IsUPeriodic(S: BRepAdaptor_Surface): boolean;

  // BRepApprox_SurfaceTool.UPeriod (method)
  static UPeriod(S: BRepAdaptor_Surface): number;

  // BRepApprox_SurfaceTool.IsVPeriodic (method)
  static IsVPeriodic(S: BRepAdaptor_Surface): boolean;

  // BRepApprox_SurfaceTool.VPeriod (method)
  static VPeriod(S: BRepAdaptor_Surface): number;

  // BRepApprox_SurfaceTool.Value (method)
  static Value(S: BRepAdaptor_Surface, u: number, v: number): gp_Pnt;

  // BRepApprox_SurfaceTool.D0 (method)
  static D0(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt): void;

  // BRepApprox_SurfaceTool.D1 (method)
  static D1(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1u: gp_Vec, D1v: gp_Vec): void;

  // BRepApprox_SurfaceTool.D2 (method)
  static D2(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

  // BRepApprox_SurfaceTool.D3 (method)
  static D3(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

  // BRepApprox_SurfaceTool.DN (method)
  static DN(S: BRepAdaptor_Surface, u: number, v: number, Nu: number, Nv: number): gp_Vec;

  // BRepApprox_SurfaceTool.UResolution (method)
  static UResolution(S: BRepAdaptor_Surface, R3d: number): number;

  // BRepApprox_SurfaceTool.VResolution (method)
  static VResolution(S: BRepAdaptor_Surface, R3d: number): number;

  // BRepApprox_SurfaceTool.GetType (method)
  static GetType(S: BRepAdaptor_Surface): GeomAbs_SurfaceType;

  // BRepApprox_SurfaceTool.Plane (method)
  static Plane(S: BRepAdaptor_Surface): gp_Pln;

  // BRepApprox_SurfaceTool.Cylinder (method)
  static Cylinder(S: BRepAdaptor_Surface): gp_Cylinder;

  // BRepApprox_SurfaceTool.Cone (method)
  static Cone(S: BRepAdaptor_Surface): gp_Cone;

  // BRepApprox_SurfaceTool.Torus (method)
  static Torus(S: BRepAdaptor_Surface): gp_Torus;

  // BRepApprox_SurfaceTool.Sphere (method)
  static Sphere(S: BRepAdaptor_Surface): gp_Sphere;

  // BRepApprox_SurfaceTool.Bezier (method)
  static Bezier(S: BRepAdaptor_Surface): Geom_BezierSurface;

  // BRepApprox_SurfaceTool.BSpline (method)
  static BSpline(S: BRepAdaptor_Surface): Geom_BSplineSurface;

  // BRepApprox_SurfaceTool.AxeOfRevolution (method)
  static AxeOfRevolution(S: BRepAdaptor_Surface): gp_Ax1;

  // BRepApprox_SurfaceTool.Direction (method)
  static Direction(S: BRepAdaptor_Surface): gp_Dir;

  // BRepApprox_SurfaceTool.BasisCurve (method)
  static BasisCurve(S: BRepAdaptor_Surface): Adaptor3d_Curve;

  // BRepApprox_SurfaceTool.NbSamplesU (method)
  static NbSamplesU(S: BRepAdaptor_Surface): number;
  static NbSamplesU(S: BRepAdaptor_Surface, u1: number, u2: number): number;

  // BRepApprox_SurfaceTool.NbSamplesV (method)
  static NbSamplesV(S: BRepAdaptor_Surface): number;
  static NbSamplesV(S: BRepAdaptor_Surface, v1: number, v2: number): number;

  // BRepApprox_SurfaceTool.delete (method)
  delete(): void;

  // BRepApprox_SurfaceTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_TheComputeLineBezierOfApprox: declare class BRepApprox_TheComputeLineBezierOfApprox

  // BRepApprox_TheComputeLineBezierOfApprox.constructor (constructor)
  constructor(Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: BRepApprox_TheMultiLineOfApprox, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: BRepApprox_TheMultiLineOfApprox, Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);

  // BRepApprox_TheComputeLineBezierOfApprox.Init (method)
  Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

  // BRepApprox_TheComputeLineBezierOfApprox.Perform (method)
  Perform(Line: BRepApprox_TheMultiLineOfApprox): void;

  // BRepApprox_TheComputeLineBezierOfApprox.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // BRepApprox_TheComputeLineBezierOfApprox.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // BRepApprox_TheComputeLineBezierOfApprox.SetConstraints (method)
  SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

  // BRepApprox_TheComputeLineBezierOfApprox.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // BRepApprox_TheComputeLineBezierOfApprox.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // BRepApprox_TheComputeLineBezierOfApprox.Error (method)
  Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // BRepApprox_TheComputeLineBezierOfApprox.NbMultiCurves (method)
  NbMultiCurves(): number;

  // BRepApprox_TheComputeLineBezierOfApprox.Value (method)
  Value(Index?: number): AppParCurves_MultiCurve;

  // BRepApprox_TheComputeLineBezierOfApprox.ChangeValue (method)
  ChangeValue(Index?: number): AppParCurves_MultiCurve;

  // BRepApprox_TheComputeLineBezierOfApprox.SplineValue (method)
  SplineValue(): AppParCurves_MultiBSpCurve;

  // BRepApprox_TheComputeLineBezierOfApprox.Parametrization (method)
  Parametrization(): Approx_ParametrizationType;

  // BRepApprox_TheComputeLineBezierOfApprox.Parameters (method)
  Parameters(Index: number): NCollection_Array1_double;

  // BRepApprox_TheComputeLineBezierOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheComputeLineBezierOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_TheComputeLineOfApprox: declare class BRepApprox_TheComputeLineOfApprox

  // BRepApprox_TheComputeLineOfApprox.constructor (constructor)
  constructor(Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: BRepApprox_TheMultiLineOfApprox, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: BRepApprox_TheMultiLineOfApprox, Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);

  // BRepApprox_TheComputeLineOfApprox.Interpol (method)
  Interpol(Line: BRepApprox_TheMultiLineOfApprox): void;

  // BRepApprox_TheComputeLineOfApprox.Init (method)
  Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

  // BRepApprox_TheComputeLineOfApprox.Perform (method)
  Perform(Line: BRepApprox_TheMultiLineOfApprox): void;

  // BRepApprox_TheComputeLineOfApprox.SetParameters (method)
  SetParameters(ThePar: math_VectorBase_double): void;

  // BRepApprox_TheComputeLineOfApprox.SetKnots (method)
  SetKnots(Knots: NCollection_Array1_double): void;

  // BRepApprox_TheComputeLineOfApprox.SetKnotsAndMultiplicities (method)
  SetKnotsAndMultiplicities(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int): void;

  // BRepApprox_TheComputeLineOfApprox.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // BRepApprox_TheComputeLineOfApprox.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // BRepApprox_TheComputeLineOfApprox.SetContinuity (method)
  SetContinuity(C: number): void;

  // BRepApprox_TheComputeLineOfApprox.SetConstraints (method)
  SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

  // BRepApprox_TheComputeLineOfApprox.SetPeriodic (method)
  SetPeriodic(thePeriodic: boolean): void;

  // BRepApprox_TheComputeLineOfApprox.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // BRepApprox_TheComputeLineOfApprox.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // BRepApprox_TheComputeLineOfApprox.Error (method)
  Error(tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // BRepApprox_TheComputeLineOfApprox.Value (method)
  Value(): AppParCurves_MultiBSpCurve;

  // BRepApprox_TheComputeLineOfApprox.ChangeValue (method)
  ChangeValue(): AppParCurves_MultiBSpCurve;

  // BRepApprox_TheComputeLineOfApprox.Parameters (method)
  Parameters(): NCollection_Array1_double;

  // BRepApprox_TheComputeLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheComputeLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_TheImpPrmSvSurfacesOfApprox: declare class BRepApprox_TheImpPrmSvSurfacesOfApprox extends ApproxInt_SvSurfaces

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.constructor (constructor)
  constructor(Surf1: BRepAdaptor_Surface, Surf2: IntSurf_Quadric);
  constructor(Surf1: IntSurf_Quadric, Surf2: BRepAdaptor_Surface);

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.Compute (method)
  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.Pnt (method)
  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.SeekPoint (method)
  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.Tangency (method)
  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.TangencyOnSurf1 (method)
  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.TangencyOnSurf2 (method)
  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.FillInitialVectorOfSolution (method)
  FillInitialVectorOfSolution(u1: number, v1: number, u2: number, v2: number, binfu: number, bsupu: number, binfv: number, bsupv: number, X: math_VectorBase_double, TranslationU?: number, TranslationV?: number): { returnValue: boolean; TranslationU: number; TranslationV: number };

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheImpPrmSvSurfacesOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox: declare class BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.constructor (constructor)
  constructor(S1: BRepAdaptor_Surface, S2: BRepAdaptor_Surface, TolTangency: number);
  constructor(Param: NCollection_Array1_double, S1: BRepAdaptor_Surface, S2: BRepAdaptor_Surface, TolTangency: number);

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.Perform (method)
  Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
  Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.IsDone (method)
  IsDone(): boolean;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.Point (method)
  Point(): IntSurf_PntOn2S;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.IsTangent (method)
  IsTangent(): boolean;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.Direction (method)
  Direction(): gp_Dir;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.DirectionOnS1 (method)
  DirectionOnS1(): gp_Dir2d;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.DirectionOnS2 (method)
  DirectionOnS2(): gp_Dir2d;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.ChangePoint (method)
  ChangePoint(): IntSurf_PntOn2S;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_TheMultiLineOfApprox: declare class BRepApprox_TheMultiLineOfApprox

  // BRepApprox_TheMultiLineOfApprox.constructor (constructor)
  constructor();
  constructor(line: BRepApprox_ApproxLine, NbP3d: number, NbP2d: number, ApproxU1V1: boolean, ApproxU2V2: boolean, xo: number, yo: number, zo: number, u1o: number, v1o: number, u2o: number, v2o: number, P2DOnFirst: boolean, IndMin?: number, IndMax?: number);

  // BRepApprox_TheMultiLineOfApprox.FirstPoint (method)
  FirstPoint(): number;

  // BRepApprox_TheMultiLineOfApprox.LastPoint (method)
  LastPoint(): number;

  // BRepApprox_TheMultiLineOfApprox.NbP2d (method)
  NbP2d(): number;

  // BRepApprox_TheMultiLineOfApprox.NbP3d (method)
  NbP3d(): number;

  // BRepApprox_TheMultiLineOfApprox.WhatStatus (method)
  WhatStatus(): Approx_Status;

  // BRepApprox_TheMultiLineOfApprox.Value (method)
  Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

  // BRepApprox_TheMultiLineOfApprox.Tangency (method)
  Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  // BRepApprox_TheMultiLineOfApprox.MakeMLBetween (method)
  MakeMLBetween(Low: number, High: number, NbPointsToInsert: number): BRepApprox_TheMultiLineOfApprox;

  // BRepApprox_TheMultiLineOfApprox.MakeMLOneMorePoint (method)
  MakeMLOneMorePoint(Low: number, High: number, indbad: number, OtherLine: BRepApprox_TheMultiLineOfApprox): boolean;

  // BRepApprox_TheMultiLineOfApprox.Dump (method)
  Dump(): void;

  // BRepApprox_TheMultiLineOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheMultiLineOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
