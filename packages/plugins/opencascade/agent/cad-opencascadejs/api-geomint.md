# libcascade — GeomInt

23 top-level symbols. Signatures are verbatim typescript.

GeomInt: declare class GeomInt

  // GeomInt.constructor (constructor)
  constructor();

  // GeomInt.AdjustPeriodic (method)
  static AdjustPeriodic(thePar: number, theParMin: number, theParMax: number, thePeriod: number, theNewPar: number, theOffset: number, theEps: number): { returnValue: boolean; theNewPar: number; theOffset: number };

  // GeomInt.delete (method)
  delete(): void;

  // GeomInt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox extends math_BFGS

  // GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double, Tolerance3d: number, Tolerance2d: number, Eps: number, NbIterations?: number);

  // GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox extends math_MultipleVarFunctionWithGradient

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NbPol: number);

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.NbVariables (method)
  NbVariables(): number;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.NewParameters (method)
  NewParameters(): math_VectorBase_double;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.CurveValue (method)
  CurveValue(): AppParCurves_MultiBSpCurve;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.Error (method)
  Error(IPoint: number, CurveIndex: number): number;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.MaxError3d (method)
  MaxError3d(): number;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.MaxError2d (method)
  MaxError2d(): number;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.Index (method)
  Index(): math_VectorBase_int;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.FirstConstraint (method)
  FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.LastConstraint (method)
  LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.SetFirstLambda (method)
  SetFirstLambda(l1: number): void;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.SetLastLambda (method)
  SetLastLambda(l2: number): void;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.Perform (method)
  Perform(Parameters: math_VectorBase_double): void;
  Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.BezierValue (method)
  BezierValue(): AppParCurves_MultiCurve;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.BSplineValue (method)
  BSplineValue(): AppParCurves_MultiBSpCurve;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.ErrorGradient (method)
  ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.Distance (method)
  Distance(): math_Matrix;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.FirstLambda (method)
  FirstLambda(): number;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.LastLambda (method)
  LastLambda(): number;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.Points (method)
  Points(): math_Matrix;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.Poles (method)
  Poles(): math_Matrix;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.KIndex (method)
  KIndex(): math_VectorBase_int;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox extends math_BFGS

  // GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox.constructor (constructor)
  constructor(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double, Tolerance3d: number, Tolerance2d: number, Eps: number, NbIterations?: number);

  // GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox extends math_BFGS

  // GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double, Tolerance3d: number, Tolerance2d: number, Eps: number, NbIterations?: number);

  // GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_IntSS: declare class GeomInt_IntSS

  // GeomInt_IntSS.constructor (constructor)
  constructor();
  constructor(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx?: boolean, ApproxS1?: boolean, ApproxS2?: boolean);

  // GeomInt_IntSS.Perform (method)
  Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
  Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
  Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
  Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;

  // GeomInt_IntSS.IsDone (method)
  IsDone(): boolean;

  // GeomInt_IntSS.TolReached3d (method)
  TolReached3d(): number;

  // GeomInt_IntSS.TolReached2d (method)
  TolReached2d(): number;

  // GeomInt_IntSS.NbLines (method)
  NbLines(): number;

  // GeomInt_IntSS.Line (method)
  Line(Index: number): Geom_Curve;

  // GeomInt_IntSS.HasLineOnS1 (method)
  HasLineOnS1(Index: number): boolean;

  // GeomInt_IntSS.LineOnS1 (method)
  LineOnS1(Index: number): Geom2d_Curve;

  // GeomInt_IntSS.HasLineOnS2 (method)
  HasLineOnS2(Index: number): boolean;

  // GeomInt_IntSS.LineOnS2 (method)
  LineOnS2(Index: number): Geom2d_Curve;

  // GeomInt_IntSS.NbBoundaries (method)
  NbBoundaries(): number;

  // GeomInt_IntSS.Boundary (method)
  Boundary(Index: number): Geom_Curve;

  // GeomInt_IntSS.NbPoints (method)
  NbPoints(): number;

  // GeomInt_IntSS.Point (method)
  Point(Index: number): gp_Pnt;

  // GeomInt_IntSS.Pnt2d (method)
  Pnt2d(Index: number, OnFirst: boolean): gp_Pnt2d;

  // GeomInt_IntSS.BuildPCurves (method)
  static BuildPCurves(theFirst: number, theLast: number, theUmin: number, theUmax: number, theVmin: number, theVmax: number, theTol: number, theSurface: Geom_Surface, theCurve: Geom_Curve): { theTol: number; theCurve2d: Geom2d_Curve; [Symbol.dispose](): void };
  static BuildPCurves(f: number, l: number, Tol: number, S: Geom_Surface, C: Geom_Curve): { Tol: number; C2d: Geom2d_Curve; [Symbol.dispose](): void };

  // GeomInt_IntSS.TrimILineOnSurfBoundaries (method)
  static TrimILineOnSurfBoundaries(theC2d1: Geom2d_Curve, theC2d2: Geom2d_Curve, theBound1: Bnd_Box2d, theBound2: Bnd_Box2d, theArrayOfParameters: NCollection_DynamicArray_double): void;

  // GeomInt_IntSS.MakeBSpline (method)
  static MakeBSpline(WL: IntPatch_WLine, ideb: number, ifin: number): Geom_Curve;

  // GeomInt_IntSS.MakeBSpline2d (method)
  static MakeBSpline2d(theWLine: IntPatch_WLine, ideb: number, ifin: number, onFirst: boolean): Geom2d_BSplineCurve;

  // GeomInt_IntSS.delete (method)
  delete(): void;

  // GeomInt_IntSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_LineConstructor: declare class GeomInt_LineConstructor

  // GeomInt_LineConstructor.constructor (constructor)
  constructor();

  // GeomInt_LineConstructor.Load (method)
  Load(D1: Adaptor3d_TopolTool, D2: Adaptor3d_TopolTool, S1: GeomAdaptor_Surface, S2: GeomAdaptor_Surface): void;

  // GeomInt_LineConstructor.Perform (method)
  Perform(L: IntPatch_Line): void;

  // GeomInt_LineConstructor.IsDone (method)
  IsDone(): boolean;

  // GeomInt_LineConstructor.NbParts (method)
  NbParts(): number;

  // GeomInt_LineConstructor.Part (method)
  Part(I: number, WFirst?: number, WLast?: number): { WFirst: number; WLast: number };

  // GeomInt_LineConstructor.delete (method)
  delete(): void;

  // GeomInt_LineConstructor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_LineTool: declare class GeomInt_LineTool

  // GeomInt_LineTool.constructor (constructor)
  constructor();

  // GeomInt_LineTool.NbVertex (method)
  static NbVertex(L: IntPatch_Line): number;

  // GeomInt_LineTool.Vertex (method)
  static Vertex(L: IntPatch_Line, I: number): IntPatch_Point;

  // GeomInt_LineTool.FirstParameter (method)
  static FirstParameter(L: IntPatch_Line): number;

  // GeomInt_LineTool.LastParameter (method)
  static LastParameter(L: IntPatch_Line): number;

  // GeomInt_LineTool.DecompositionOfWLine (method)
  static DecompositionOfWLine(theWLine: IntPatch_WLine, theSurface1: GeomAdaptor_Surface, theSurface2: GeomAdaptor_Surface, aTolSum: number, theLConstructor: GeomInt_LineConstructor, theNewLines: NCollection_Sequence_handle_IntPatch_Line): boolean;

  // GeomInt_LineTool.delete (method)
  delete(): void;

  // GeomInt_LineTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Deg: number, Tol3d: number, Tol2d: number, NbIterations?: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Deg: number, Tol3d: number, Tol2d: number, NbIterations: number, lambda1: number, lambda2: number);

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.Value (method)
  Value(): AppParCurves_MultiBSpCurve;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.Error (method)
  Error(Index: number): number;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.MaxError3d (method)
  MaxError3d(): number;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.MaxError2d (method)
  MaxError2d(): number;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.AverageError (method)
  AverageError(): number;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number, Tol3d: number, Tol2d: number, NbIterations?: number);

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.Value (method)
  Value(): AppParCurves_MultiCurve;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.Error (method)
  Error(Index: number): number;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.MaxError3d (method)
  MaxError3d(): number;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.MaxError2d (method)
  MaxError2d(): number;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.AverageError (method)
  AverageError(): number;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_MyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_MyGradientbisOfTheComputeLineOfWLApprox

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number, Tol3d: number, Tol2d: number, NbIterations?: number);

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.Value (method)
  Value(): AppParCurves_MultiCurve;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.Error (method)
  Error(Index: number): number;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.MaxError3d (method)
  MaxError3d(): number;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.MaxError2d (method)
  MaxError2d(): number;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.AverageError (method)
  AverageError(): number;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_MyGradientbisOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox extends math_MultipleVarFunctionWithGradient

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number);

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.NbVariables (method)
  NbVariables(): number;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.NewParameters (method)
  NewParameters(): math_VectorBase_double;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.CurveValue (method)
  CurveValue(): AppParCurves_MultiCurve;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.Error (method)
  Error(IPoint: number, CurveIndex: number): number;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.MaxError3d (method)
  MaxError3d(): number;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.MaxError2d (method)
  MaxError2d(): number;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.FirstConstraint (method)
  FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.LastConstraint (method)
  LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox extends math_MultipleVarFunctionWithGradient

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Parameters: math_VectorBase_double, Deg: number);

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.NbVariables (method)
  NbVariables(): number;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.NewParameters (method)
  NewParameters(): math_VectorBase_double;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.CurveValue (method)
  CurveValue(): AppParCurves_MultiCurve;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.Error (method)
  Error(IPoint: number, CurveIndex: number): number;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.MaxError3d (method)
  MaxError3d(): number;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.MaxError2d (method)
  MaxError2d(): number;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.FirstConstraint (method)
  FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.LastConstraint (method)
  LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.Perform (method)
  Perform(Parameters: math_VectorBase_double): void;
  Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.BezierValue (method)
  BezierValue(): AppParCurves_MultiCurve;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.BSplineValue (method)
  BSplineValue(): AppParCurves_MultiBSpCurve;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.ErrorGradient (method)
  ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.Distance (method)
  Distance(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.FirstLambda (method)
  FirstLambda(): number;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.LastLambda (method)
  LastLambda(): number;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.Points (method)
  Points(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.Poles (method)
  Poles(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.KIndex (method)
  KIndex(): math_VectorBase_int;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, NbPol: number);
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, FirstPoint: number, LastPoint: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Parameters: math_VectorBase_double, NbPol: number);

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.Perform (method)
  Perform(Parameters: math_VectorBase_double): void;
  Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
  Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.BezierValue (method)
  BezierValue(): AppParCurves_MultiCurve;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.BSplineValue (method)
  BSplineValue(): AppParCurves_MultiBSpCurve;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.FunctionMatrix (method)
  FunctionMatrix(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.DerivativeFunctionMatrix (method)
  DerivativeFunctionMatrix(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.ErrorGradient (method)
  ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.Distance (method)
  Distance(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.FirstLambda (method)
  FirstLambda(): number;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.LastLambda (method)
  LastLambda(): number;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.Points (method)
  Points(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.Poles (method)
  Poles(): math_Matrix;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.KIndex (method)
  KIndex(): math_VectorBase_int;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ParameterAndOrientation: declare class GeomInt_ParameterAndOrientation

  // GeomInt_ParameterAndOrientation.constructor (constructor)
  constructor();
  constructor(P: number, Or1: TopAbs_Orientation, Or2: TopAbs_Orientation);

  // GeomInt_ParameterAndOrientation.SetOrientation1 (method)
  SetOrientation1(Or: TopAbs_Orientation): void;

  // GeomInt_ParameterAndOrientation.SetOrientation2 (method)
  SetOrientation2(Or: TopAbs_Orientation): void;

  // GeomInt_ParameterAndOrientation.Parameter (method)
  Parameter(): number;

  // GeomInt_ParameterAndOrientation.Orientation1 (method)
  Orientation1(): TopAbs_Orientation;

  // GeomInt_ParameterAndOrientation.Orientation2 (method)
  Orientation2(): TopAbs_Orientation;

  // GeomInt_ParameterAndOrientation.delete (method)
  delete(): void;

  // GeomInt_ParameterAndOrientation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, SCurv: AppParCurves_MultiCurve, FirstPoint: number, LastPoint: number, Constraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Bern: math_Matrix, DerivativeBern: math_Matrix, Tolerance?: number);

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.ConstraintMatrix (method)
  ConstraintMatrix(): math_Matrix;

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.Duale (method)
  Duale(): math_VectorBase_double;

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.ConstraintDerivative (method)
  ConstraintDerivative(SSP: GeomInt_TheMultiLineOfWLApprox, Parameters: math_VectorBase_double, Deg: number, DA: math_Matrix): math_Matrix;

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.InverseMatrix (method)
  InverseMatrix(): math_Matrix;

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.constructor (constructor)
  constructor(SSP: GeomInt_TheMultiLineOfWLApprox, SCurv: AppParCurves_MultiCurve, FirstPoint: number, LastPoint: number, Constraints: NCollection_HArray1_AppParCurves_ConstraintCouple, Bern: math_Matrix, DerivativeBern: math_Matrix, Tolerance?: number);

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.ConstraintMatrix (method)
  ConstraintMatrix(): math_Matrix;

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.Duale (method)
  Duale(): math_VectorBase_double;

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.ConstraintDerivative (method)
  ConstraintDerivative(SSP: GeomInt_TheMultiLineOfWLApprox, Parameters: math_VectorBase_double, Deg: number, DA: math_Matrix): math_Matrix;

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.InverseMatrix (method)
  InverseMatrix(): math_Matrix;

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_TheComputeLineBezierOfWLApprox: declare class GeomInt_TheComputeLineBezierOfWLApprox

  // GeomInt_TheComputeLineBezierOfWLApprox.constructor (constructor)
  constructor(Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: GeomInt_TheMultiLineOfWLApprox, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: GeomInt_TheMultiLineOfWLApprox, Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);

  // GeomInt_TheComputeLineBezierOfWLApprox.Init (method)
  Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

  // GeomInt_TheComputeLineBezierOfWLApprox.Perform (method)
  Perform(Line: GeomInt_TheMultiLineOfWLApprox): void;

  // GeomInt_TheComputeLineBezierOfWLApprox.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // GeomInt_TheComputeLineBezierOfWLApprox.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // GeomInt_TheComputeLineBezierOfWLApprox.SetConstraints (method)
  SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

  // GeomInt_TheComputeLineBezierOfWLApprox.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // GeomInt_TheComputeLineBezierOfWLApprox.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // GeomInt_TheComputeLineBezierOfWLApprox.Error (method)
  Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // GeomInt_TheComputeLineBezierOfWLApprox.NbMultiCurves (method)
  NbMultiCurves(): number;

  // GeomInt_TheComputeLineBezierOfWLApprox.Value (method)
  Value(Index?: number): AppParCurves_MultiCurve;

  // GeomInt_TheComputeLineBezierOfWLApprox.ChangeValue (method)
  ChangeValue(Index?: number): AppParCurves_MultiCurve;

  // GeomInt_TheComputeLineBezierOfWLApprox.SplineValue (method)
  SplineValue(): AppParCurves_MultiBSpCurve;

  // GeomInt_TheComputeLineBezierOfWLApprox.Parametrization (method)
  Parametrization(): Approx_ParametrizationType;

  // GeomInt_TheComputeLineBezierOfWLApprox.Parameters (method)
  Parameters(Index: number): NCollection_Array1_double;

  // GeomInt_TheComputeLineBezierOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheComputeLineBezierOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_TheComputeLineOfWLApprox: declare class GeomInt_TheComputeLineOfWLApprox

  // GeomInt_TheComputeLineOfWLApprox.constructor (constructor)
  constructor(Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: GeomInt_TheMultiLineOfWLApprox, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean);
  constructor(Line: GeomInt_TheMultiLineOfWLApprox, Parameters: math_VectorBase_double, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, Squares?: boolean);

  // GeomInt_TheComputeLineOfWLApprox.Interpol (method)
  Interpol(Line: GeomInt_TheMultiLineOfWLApprox): void;

  // GeomInt_TheComputeLineOfWLApprox.Init (method)
  Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

  // GeomInt_TheComputeLineOfWLApprox.Perform (method)
  Perform(Line: GeomInt_TheMultiLineOfWLApprox): void;

  // GeomInt_TheComputeLineOfWLApprox.SetParameters (method)
  SetParameters(ThePar: math_VectorBase_double): void;

  // GeomInt_TheComputeLineOfWLApprox.SetKnots (method)
  SetKnots(Knots: NCollection_Array1_double): void;

  // GeomInt_TheComputeLineOfWLApprox.SetKnotsAndMultiplicities (method)
  SetKnotsAndMultiplicities(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int): void;

  // GeomInt_TheComputeLineOfWLApprox.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // GeomInt_TheComputeLineOfWLApprox.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // GeomInt_TheComputeLineOfWLApprox.SetContinuity (method)
  SetContinuity(C: number): void;

  // GeomInt_TheComputeLineOfWLApprox.SetConstraints (method)
  SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

  // GeomInt_TheComputeLineOfWLApprox.SetPeriodic (method)
  SetPeriodic(thePeriodic: boolean): void;

  // GeomInt_TheComputeLineOfWLApprox.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // GeomInt_TheComputeLineOfWLApprox.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // GeomInt_TheComputeLineOfWLApprox.Error (method)
  Error(tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // GeomInt_TheComputeLineOfWLApprox.Value (method)
  Value(): AppParCurves_MultiBSpCurve;

  // GeomInt_TheComputeLineOfWLApprox.ChangeValue (method)
  ChangeValue(): AppParCurves_MultiBSpCurve;

  // GeomInt_TheComputeLineOfWLApprox.Parameters (method)
  Parameters(): NCollection_Array1_double;

  // GeomInt_TheComputeLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheComputeLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_TheImpPrmSvSurfacesOfWLApprox: declare class GeomInt_TheImpPrmSvSurfacesOfWLApprox extends ApproxInt_SvSurfaces

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.constructor (constructor)
  constructor(Surf1: Adaptor3d_Surface, Surf2: IntSurf_Quadric);
  constructor(Surf1: IntSurf_Quadric, Surf2: Adaptor3d_Surface);

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.Compute (method)
  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.Pnt (method)
  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.SeekPoint (method)
  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.Tangency (method)
  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.TangencyOnSurf1 (method)
  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.TangencyOnSurf2 (method)
  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.FillInitialVectorOfSolution (method)
  FillInitialVectorOfSolution(u1: number, v1: number, u2: number, v2: number, binfu: number, bsupu: number, binfv: number, bsupv: number, X: math_VectorBase_double, TranslationU?: number, TranslationV?: number): { returnValue: boolean; TranslationU: number; TranslationV: number };

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheImpPrmSvSurfacesOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox: declare class GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.constructor (constructor)
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, TolTangency: number);
  constructor(Param: NCollection_Array1_double, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, TolTangency: number);

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.Perform (method)
  Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
  Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.IsEmpty (method)
  IsEmpty(): boolean;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.Point (method)
  Point(): IntSurf_PntOn2S;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.IsTangent (method)
  IsTangent(): boolean;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.Direction (method)
  Direction(): gp_Dir;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.DirectionOnS1 (method)
  DirectionOnS1(): gp_Dir2d;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.DirectionOnS2 (method)
  DirectionOnS2(): gp_Dir2d;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.ChangePoint (method)
  ChangePoint(): IntSurf_PntOn2S;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
