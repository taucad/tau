# libcascade — math

45 top-level symbols. Signatures are verbatim typescript.

math: declare class math

  // math.constructor (constructor)
  constructor();

  // math.GaussPointsMax (method)
  static GaussPointsMax(): number;

  // math.GaussPoints (method)
  static GaussPoints(Index: number, Points: math_VectorBase_double): void;

  // math.GaussWeights (method)
  static GaussWeights(Index: number, Weights: math_VectorBase_double): void;

  // math.KronrodPointsMax (method)
  static KronrodPointsMax(): number;

  // math.OrderedGaussPointsAndWeights (method)
  static OrderedGaussPointsAndWeights(Index: number, Points: math_VectorBase_double, Weights: math_VectorBase_double): boolean;

  // math.KronrodPointsAndWeights (method)
  static KronrodPointsAndWeights(Index: number, Points: math_VectorBase_double, Weights: math_VectorBase_double): boolean;

  // math.delete (method)
  delete(): void;

  // math.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_BFGS: declare class math_BFGS

  // math_BFGS.constructor (constructor)
  constructor(NbVariables: number, Tolerance?: number, NbIterations?: number, ZEPS?: number);

  // math_BFGS.SetBoundary (method)
  SetBoundary(theLeftBorder: math_VectorBase_double, theRightBorder: math_VectorBase_double): void;

  // math_BFGS.Perform (method)
  Perform(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double): void;

  // math_BFGS.IsSolutionReached (method)
  IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

  // math_BFGS.IsDone (method)
  IsDone(): boolean;

  // math_BFGS.Location (method)
  Location(): math_VectorBase_double;
  Location(Loc: math_VectorBase_double): void;

  // math_BFGS.Minimum (method)
  Minimum(): number;

  // math_BFGS.Gradient (method)
  Gradient(): math_VectorBase_double;
  Gradient(Grad: math_VectorBase_double): void;

  // math_BFGS.NbIterations (method)
  NbIterations(): number;

  // math_BFGS.delete (method)
  delete(): void;

  // math_BFGS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_BissecNewton: declare class math_BissecNewton

  // math_BissecNewton.constructor (constructor)
  constructor(theXTolerance: number);

  // math_BissecNewton.Perform (method)
  Perform(F: math_FunctionWithDerivative, Bound1: number, Bound2: number, NbIterations?: number): void;

  // math_BissecNewton.IsSolutionReached (method)
  IsSolutionReached(theFunction: math_FunctionWithDerivative): boolean;

  // math_BissecNewton.IsDone (method)
  IsDone(): boolean;

  // math_BissecNewton.Root (method)
  Root(): number;

  // math_BissecNewton.Derivative (method)
  Derivative(): number;

  // math_BissecNewton.Value (method)
  Value(): number;

  // math_BissecNewton.delete (method)
  delete(): void;

  // math_BissecNewton.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_BracketMinimum: declare class math_BracketMinimum

  // math_BracketMinimum.constructor (constructor)
  constructor(A: number, B: number);
  constructor(F: math_Function, A: number, B: number);
  constructor(F: math_Function, A: number, B: number, FA: number);
  constructor(F: math_Function, A: number, B: number, FA: number, FB: number);

  // math_BracketMinimum.SetLimits (method)
  SetLimits(theLeft: number, theRight: number): void;

  // math_BracketMinimum.SetFA (method)
  SetFA(theValue: number): void;

  // math_BracketMinimum.SetFB (method)
  SetFB(theValue: number): void;

  // math_BracketMinimum.Perform (method)
  Perform(F: math_Function): void;

  // math_BracketMinimum.IsDone (method)
  IsDone(): boolean;

  // math_BracketMinimum.Values (method)
  Values(A?: number, B?: number, C?: number): { A: number; B: number; C: number };

  // math_BracketMinimum.FunctionValues (method)
  FunctionValues(FA?: number, FB?: number, FC?: number): { FA: number; FB: number; FC: number };

  // math_BracketMinimum.delete (method)
  delete(): void;

  // math_BracketMinimum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_BracketedRoot: declare class math_BracketedRoot

  // math_BracketedRoot.constructor (constructor)
  constructor(F: math_Function, Bound1: number, Bound2: number, Tolerance: number, NbIterations?: number, ZEPS?: number);

  // math_BracketedRoot.IsDone (method)
  IsDone(): boolean;

  // math_BracketedRoot.Root (method)
  Root(): number;

  // math_BracketedRoot.Value (method)
  Value(): number;

  // math_BracketedRoot.NbIterations (method)
  NbIterations(): number;

  // math_BracketedRoot.delete (method)
  delete(): void;

  // math_BracketedRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_BrentMinimum: declare class math_BrentMinimum

  // math_BrentMinimum.constructor (constructor)
  constructor(TolX: number, NbIterations?: number, ZEPS?: number);
  constructor(TolX: number, Fbx: number, NbIterations?: number, ZEPS?: number);

  // math_BrentMinimum.Perform (method)
  Perform(F: math_Function, Ax: number, Bx: number, Cx: number): void;

  // math_BrentMinimum.IsSolutionReached (method)
  IsSolutionReached(theFunction: math_Function): boolean;

  // math_BrentMinimum.IsDone (method)
  IsDone(): boolean;

  // math_BrentMinimum.Location (method)
  Location(): number;

  // math_BrentMinimum.Minimum (method)
  Minimum(): number;

  // math_BrentMinimum.NbIterations (method)
  NbIterations(): number;

  // math_BrentMinimum.delete (method)
  delete(): void;

  // math_BrentMinimum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_BullardGenerator: declare class math_BullardGenerator

  // math_BullardGenerator.constructor (constructor)
  constructor(theSeed?: number);

  // math_BullardGenerator.SetSeed (method)
  SetSeed(theSeed?: number): void;

  // math_BullardGenerator.NextInt (method)
  NextInt(): number;

  // math_BullardGenerator.NextReal (method)
  NextReal(): number;

  // math_BullardGenerator.delete (method)
  delete(): void;

  // math_BullardGenerator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_ComputeGaussPointsAndWeights: declare class math_ComputeGaussPointsAndWeights

  // math_ComputeGaussPointsAndWeights.constructor (constructor)
  constructor(Number: number);

  // math_ComputeGaussPointsAndWeights.IsDone (method)
  IsDone(): boolean;

  // math_ComputeGaussPointsAndWeights.Points (method)
  Points(): math_VectorBase_double;

  // math_ComputeGaussPointsAndWeights.Weights (method)
  Weights(): math_VectorBase_double;

  // math_ComputeGaussPointsAndWeights.delete (method)
  delete(): void;

  // math_ComputeGaussPointsAndWeights.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_ComputeKronrodPointsAndWeights: declare class math_ComputeKronrodPointsAndWeights

  // math_ComputeKronrodPointsAndWeights.constructor (constructor)
  constructor(Number: number);

  // math_ComputeKronrodPointsAndWeights.IsDone (method)
  IsDone(): boolean;

  // math_ComputeKronrodPointsAndWeights.Points (method)
  Points(): math_VectorBase_double;

  // math_ComputeKronrodPointsAndWeights.Weights (method)
  Weights(): math_VectorBase_double;

  // math_ComputeKronrodPointsAndWeights.delete (method)
  delete(): void;

  // math_ComputeKronrodPointsAndWeights.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Crout: declare class math_Crout

  // math_Crout.constructor (constructor)
  constructor(A: math_Matrix, MinPivot?: number);

  // math_Crout.IsDone (method)
  IsDone(): boolean;

  // math_Crout.Solve (method)
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;

  // math_Crout.Inverse (method)
  Inverse(): math_Matrix;

  // math_Crout.Invert (method)
  Invert(Inv: math_Matrix): void;

  // math_Crout.Determinant (method)
  Determinant(): number;

  // math_Crout.delete (method)
  delete(): void;

  // math_Crout.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_DirectPolynomialRoots: declare class math_DirectPolynomialRoots

  // math_DirectPolynomialRoots.constructor (constructor)
  constructor(theA: number, theB: number);
  constructor(theA: number, theB: number, theC: number);
  constructor(theA: number, theB: number, theC: number, theD: number);
  constructor(theA: number, theB: number, theC: number, theD: number, theE: number);

  // math_DirectPolynomialRoots.IsDone (method)
  IsDone(): boolean;

  // math_DirectPolynomialRoots.InfiniteRoots (method)
  InfiniteRoots(): boolean;

  // math_DirectPolynomialRoots.NbSolutions (method)
  NbSolutions(): number;

  // math_DirectPolynomialRoots.Value (method)
  Value(theIndex: number): number;

  // math_DirectPolynomialRoots.delete (method)
  delete(): void;

  // math_DirectPolynomialRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_DoubleTab: declare class math_DoubleTab

  // math_DoubleTab.constructor (constructor)
  constructor(theOther: math_DoubleTab);
  constructor(theLowerRow: number, theUpperRow: number, theLowerCol: number, theUpperCol: number);

  // math_DoubleTab.Init (method)
  Init(theInitValue: number): void;

  // math_DoubleTab.Copy (method)
  Copy(theOther: math_DoubleTab): void;

  // math_DoubleTab.IsDeletable (method)
  IsDeletable(): boolean;

  // math_DoubleTab.SetLowerRow (method)
  SetLowerRow(theLowerRow: number): void;

  // math_DoubleTab.SetLowerCol (method)
  SetLowerCol(theLowerCol: number): void;

  // math_DoubleTab.LowerRow (method)
  LowerRow(): number;

  // math_DoubleTab.UpperRow (method)
  UpperRow(): number;

  // math_DoubleTab.LowerCol (method)
  LowerCol(): number;

  // math_DoubleTab.UpperCol (method)
  UpperCol(): number;

  // math_DoubleTab.NbRows (method)
  NbRows(): number;

  // math_DoubleTab.NbColumns (method)
  NbColumns(): number;

  // math_DoubleTab.Value (method)
  Value(theRowIndex: number, theColIndex: number): number;

  // math_DoubleTab.delete (method)
  delete(): void;

  // math_DoubleTab.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_EigenValuesSearcher: declare class math_EigenValuesSearcher

  // math_EigenValuesSearcher.constructor (constructor)
  constructor(theDiagonal: NCollection_Array1_double, theSubdiagonal: NCollection_Array1_double);

  // math_EigenValuesSearcher.IsDone (method)
  IsDone(): boolean;

  // math_EigenValuesSearcher.Dimension (method)
  Dimension(): number;

  // math_EigenValuesSearcher.EigenValue (method)
  EigenValue(theIndex: number): number;

  // math_EigenValuesSearcher.EigenVector (method)
  EigenVector(theIndex: number): math_VectorBase_double;

  // math_EigenValuesSearcher.delete (method)
  delete(): void;

  // math_EigenValuesSearcher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FRPR: declare class math_FRPR

  // math_FRPR.constructor (constructor)
  constructor(theFunction: math_MultipleVarFunctionWithGradient, theTolerance: number, theNbIterations?: number, theZEPS?: number);

  // math_FRPR.Perform (method)
  Perform(theFunction: math_MultipleVarFunctionWithGradient, theStartingPoint: math_VectorBase_double): void;

  // math_FRPR.IsSolutionReached (method)
  IsSolutionReached(theFunction: math_MultipleVarFunctionWithGradient): boolean;

  // math_FRPR.IsDone (method)
  IsDone(): boolean;

  // math_FRPR.Location (method)
  Location(): math_VectorBase_double;
  Location(Loc: math_VectorBase_double): void;

  // math_FRPR.Minimum (method)
  Minimum(): number;

  // math_FRPR.Gradient (method)
  Gradient(): math_VectorBase_double;
  Gradient(Grad: math_VectorBase_double): void;

  // math_FRPR.NbIterations (method)
  NbIterations(): number;

  // math_FRPR.delete (method)
  delete(): void;

  // math_FRPR.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Function: declare class math_Function

  // math_Function.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // math_Function.GetStateNumber (method)
  GetStateNumber(): number;

  // math_Function.delete (method)
  delete(): void;

  // math_Function.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionAllRoots: declare class math_FunctionAllRoots

  // math_FunctionAllRoots.constructor (constructor)
  constructor(F: math_FunctionWithDerivative, S: math_FunctionSample, EpsX: number, EpsF: number, EpsNul: number);

  // math_FunctionAllRoots.IsDone (method)
  IsDone(): boolean;

  // math_FunctionAllRoots.NbIntervals (method)
  NbIntervals(): number;

  // math_FunctionAllRoots.GetInterval (method)
  GetInterval(Index: number, A?: number, B?: number): { A: number; B: number };

  // math_FunctionAllRoots.GetIntervalState (method)
  GetIntervalState(Index: number, IFirst?: number, ILast?: number): { IFirst: number; ILast: number };

  // math_FunctionAllRoots.NbPoints (method)
  NbPoints(): number;

  // math_FunctionAllRoots.GetPoint (method)
  GetPoint(Index: number): number;

  // math_FunctionAllRoots.GetPointState (method)
  GetPointState(Index: number): number;

  // math_FunctionAllRoots.delete (method)
  delete(): void;

  // math_FunctionAllRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionRoot: declare class math_FunctionRoot

  // math_FunctionRoot.constructor (constructor)
  constructor(F: math_FunctionWithDerivative, Guess: number, Tolerance: number, NbIterations?: number);
  constructor(F: math_FunctionWithDerivative, Guess: number, Tolerance: number, A: number, B: number, NbIterations?: number);

  // math_FunctionRoot.IsDone (method)
  IsDone(): boolean;

  // math_FunctionRoot.Root (method)
  Root(): number;

  // math_FunctionRoot.Derivative (method)
  Derivative(): number;

  // math_FunctionRoot.Value (method)
  Value(): number;

  // math_FunctionRoot.NbIterations (method)
  NbIterations(): number;

  // math_FunctionRoot.delete (method)
  delete(): void;

  // math_FunctionRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionRoots: declare class math_FunctionRoots

  // math_FunctionRoots.constructor (constructor)
  constructor(F: math_FunctionWithDerivative, A: number, B: number, NbSample: number, EpsX?: number, EpsF?: number, EpsNull?: number, K?: number);

  // math_FunctionRoots.IsDone (method)
  IsDone(): boolean;

  // math_FunctionRoots.IsAllNull (method)
  IsAllNull(): boolean;

  // math_FunctionRoots.NbSolutions (method)
  NbSolutions(): number;

  // math_FunctionRoots.Value (method)
  Value(Nieme: number): number;

  // math_FunctionRoots.StateNumber (method)
  StateNumber(Nieme: number): number;

  // math_FunctionRoots.delete (method)
  delete(): void;

  // math_FunctionRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionSample: declare class math_FunctionSample

  // math_FunctionSample.constructor (constructor)
  constructor(A: number, B: number, N: number);

  // math_FunctionSample.Bounds (method)
  Bounds(A: number, B: number): { A: number; B: number };

  // math_FunctionSample.NbPoints (method)
  NbPoints(): number;

  // math_FunctionSample.GetParameter (method)
  GetParameter(Index: number): number;

  // math_FunctionSample.delete (method)
  delete(): void;

  // math_FunctionSample.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionSet: declare class math_FunctionSet

  // math_FunctionSet.NbVariables (method)
  NbVariables(): number;

  // math_FunctionSet.NbEquations (method)
  NbEquations(): number;

  // math_FunctionSet.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // math_FunctionSet.GetStateNumber (method)
  GetStateNumber(): number;

  // math_FunctionSet.delete (method)
  delete(): void;

  // math_FunctionSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionSetRoot: declare class math_FunctionSetRoot

  // math_FunctionSetRoot.constructor (constructor)
  constructor(F: math_FunctionSetWithDerivatives, NbIterations?: number);
  constructor(F: math_FunctionSetWithDerivatives, Tolerance: math_VectorBase_double, NbIterations?: number);

  // math_FunctionSetRoot.SetTolerance (method)
  SetTolerance(Tolerance: math_VectorBase_double): void;

  // math_FunctionSetRoot.IsSolutionReached (method)
  IsSolutionReached(argNo0: math_FunctionSetWithDerivatives): boolean;

  // math_FunctionSetRoot.Perform (method)
  Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theStopOnDivergent: boolean): void;
  Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theStopOnDivergent: boolean): void;

  // math_FunctionSetRoot.IsDone (method)
  IsDone(): boolean;

  // math_FunctionSetRoot.NbIterations (method)
  NbIterations(): number;

  // math_FunctionSetRoot.StateNumber (method)
  StateNumber(): number;

  // math_FunctionSetRoot.Root (method)
  Root(): math_VectorBase_double;
  Root(Root: math_VectorBase_double): void;

  // math_FunctionSetRoot.Derivative (method)
  Derivative(): math_Matrix;
  Derivative(Der: math_Matrix): void;

  // math_FunctionSetRoot.FunctionSetErrors (method)
  FunctionSetErrors(): math_VectorBase_double;
  FunctionSetErrors(Err: math_VectorBase_double): void;

  // math_FunctionSetRoot.IsDivergent (method)
  IsDivergent(): boolean;

  // math_FunctionSetRoot.delete (method)
  delete(): void;

  // math_FunctionSetRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionSetWithDerivatives: declare class math_FunctionSetWithDerivatives extends math_FunctionSet

  // math_FunctionSetWithDerivatives.NbVariables (method)
  NbVariables(): number;

  // math_FunctionSetWithDerivatives.NbEquations (method)
  NbEquations(): number;

  // math_FunctionSetWithDerivatives.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // math_FunctionSetWithDerivatives.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // math_FunctionSetWithDerivatives.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // math_FunctionSetWithDerivatives.delete (method)
  delete(): void;

  // math_FunctionSetWithDerivatives.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_FunctionWithDerivative: declare class math_FunctionWithDerivative extends math_Function

  // math_FunctionWithDerivative.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // math_FunctionWithDerivative.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // math_FunctionWithDerivative.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // math_FunctionWithDerivative.delete (method)
  delete(): void;

  // math_FunctionWithDerivative.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Gauss: declare class math_Gauss

  // math_Gauss.constructor (constructor)
  constructor(A: math_Matrix, MinPivot?: number, theProgress?: Message_ProgressRange);

  // math_Gauss.IsDone (method)
  IsDone(): boolean;

  // math_Gauss.Solve (method)
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double): void;

  // math_Gauss.Determinant (method)
  Determinant(): number;

  // math_Gauss.Invert (method)
  Invert(Inv: math_Matrix): void;

  // math_Gauss.delete (method)
  delete(): void;

  // math_Gauss.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_GaussLeastSquare: declare class math_GaussLeastSquare

  // math_GaussLeastSquare.constructor (constructor)
  constructor(A: math_Matrix, MinPivot?: number);

  // math_GaussLeastSquare.IsDone (method)
  IsDone(): boolean;

  // math_GaussLeastSquare.Solve (method)
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;

  // math_GaussLeastSquare.delete (method)
  delete(): void;

  // math_GaussLeastSquare.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_GaussMultipleIntegration: declare class math_GaussMultipleIntegration

  // math_GaussMultipleIntegration.constructor (constructor)
  constructor(F: math_MultipleVarFunction, Lower: math_VectorBase_double, Upper: math_VectorBase_double, Order: math_VectorBase_int);

  // math_GaussMultipleIntegration.IsDone (method)
  IsDone(): boolean;

  // math_GaussMultipleIntegration.Value (method)
  Value(): number;

  // math_GaussMultipleIntegration.delete (method)
  delete(): void;

  // math_GaussMultipleIntegration.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_GaussSetIntegration: declare class math_GaussSetIntegration

  // math_GaussSetIntegration.constructor (constructor)
  constructor(F: math_FunctionSet, Lower: math_VectorBase_double, Upper: math_VectorBase_double, Order: math_VectorBase_int);

  // math_GaussSetIntegration.IsDone (method)
  IsDone(): boolean;

  // math_GaussSetIntegration.Value (method)
  Value(): math_VectorBase_double;

  // math_GaussSetIntegration.delete (method)
  delete(): void;

  // math_GaussSetIntegration.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_GaussSingleIntegration: declare class math_GaussSingleIntegration

  // math_GaussSingleIntegration.constructor (constructor)
  constructor();
  constructor(F: math_Function, Lower: number, Upper: number, Order: number);
  constructor(F: math_Function, Lower: number, Upper: number, Order: number, Tol: number);

  // math_GaussSingleIntegration.IsDone (method)
  IsDone(): boolean;

  // math_GaussSingleIntegration.Value (method)
  Value(): number;

  // math_GaussSingleIntegration.delete (method)
  delete(): void;

  // math_GaussSingleIntegration.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_GlobOptMin: declare class math_GlobOptMin

  // math_GlobOptMin.constructor (constructor)
  constructor(theFunc: math_MultipleVarFunction, theLowerBorder: math_VectorBase_double, theUpperBorder: math_VectorBase_double, theC?: number, theDiscretizationTol?: number, theSameTol?: number);

  // math_GlobOptMin.SetGlobalParams (method)
  SetGlobalParams(theFunc: math_MultipleVarFunction, theLowerBorder: math_VectorBase_double, theUpperBorder: math_VectorBase_double, theC?: number, theDiscretizationTol?: number, theSameTol?: number): void;

  // math_GlobOptMin.SetLocalParams (method)
  SetLocalParams(theLocalA: math_VectorBase_double, theLocalB: math_VectorBase_double): void;

  // math_GlobOptMin.SetTol (method)
  SetTol(theDiscretizationTol: number, theSameTol: number): void;

  // math_GlobOptMin.GetTol (method)
  GetTol(theDiscretizationTol?: number, theSameTol?: number): { theDiscretizationTol: number; theSameTol: number };

  // math_GlobOptMin.Perform (method)
  Perform(isFindSingleSolution?: boolean): void;

  // math_GlobOptMin.Points (method)
  Points(theIndex: number, theSol: math_VectorBase_double): void;

  // math_GlobOptMin.SetContinuity (method)
  SetContinuity(theCont: number): void;

  // math_GlobOptMin.GetContinuity (method)
  GetContinuity(): number;

  // math_GlobOptMin.SetFunctionalMinimalValue (method)
  SetFunctionalMinimalValue(theMinimalValue: number): void;

  // math_GlobOptMin.GetFunctionalMinimalValue (method)
  GetFunctionalMinimalValue(): number;

  // math_GlobOptMin.SetLipConstState (method)
  SetLipConstState(theFlag: boolean): void;

  // math_GlobOptMin.GetLipConstState (method)
  GetLipConstState(): boolean;

  // math_GlobOptMin.isDone (method)
  isDone(): boolean;

  // math_GlobOptMin.GetF (method)
  GetF(): number;

  // math_GlobOptMin.NbExtrema (method)
  NbExtrema(): number;

  // math_GlobOptMin.delete (method)
  delete(): void;

  // math_GlobOptMin.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Jacobi: declare class math_Jacobi

  // math_Jacobi.constructor (constructor)
  constructor(A: math_Matrix);

  // math_Jacobi.IsDone (method)
  IsDone(): boolean;

  // math_Jacobi.Values (method)
  Values(): math_VectorBase_double;

  // math_Jacobi.Value (method)
  Value(Num: number): number;

  // math_Jacobi.Vectors (method)
  Vectors(): math_Matrix;

  // math_Jacobi.Vector (method)
  Vector(Num: number, V: math_VectorBase_double): void;

  // math_Jacobi.delete (method)
  delete(): void;

  // math_Jacobi.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_KronrodSingleIntegration: declare class math_KronrodSingleIntegration

  // math_KronrodSingleIntegration.constructor (constructor)
  constructor();
  constructor(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number);
  constructor(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number, theTolerance: number, theMaxNbIter: number);

  // math_KronrodSingleIntegration.Perform (method)
  Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number): void;
  Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number, theTolerance: number, theMaxNbIter: number): void;

  // math_KronrodSingleIntegration.IsDone (method)
  IsDone(): boolean;

  // math_KronrodSingleIntegration.Value (method)
  Value(): number;

  // math_KronrodSingleIntegration.ErrorReached (method)
  ErrorReached(): number;

  // math_KronrodSingleIntegration.AbsolutError (method)
  AbsolutError(): number;

  // math_KronrodSingleIntegration.OrderReached (method)
  OrderReached(): number;

  // math_KronrodSingleIntegration.NbIterReached (method)
  NbIterReached(): number;

  // math_KronrodSingleIntegration.GKRule (method)
  static GKRule(theFunction: math_Function, theLower: number, theUpper: number, theGaussP: math_VectorBase_double, theGaussW: math_VectorBase_double, theKronrodP: math_VectorBase_double, theKronrodW: math_VectorBase_double, theValue?: number, theError?: number): { returnValue: boolean; theValue: number; theError: number };

  // math_KronrodSingleIntegration.delete (method)
  delete(): void;

  // math_KronrodSingleIntegration.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Matrix: declare class math_Matrix

  // math_Matrix.constructor (constructor)
  constructor(Other: math_Matrix);
  constructor(LowerRow: number, UpperRow: number, LowerCol: number, UpperCol: number);
  constructor(LowerRow: number, UpperRow: number, LowerCol: number, UpperCol: number, InitialValue: number);

  // math_Matrix.Init (method)
  Init(InitialValue: number): void;

  // math_Matrix.RowNumber (method)
  RowNumber(): number;

  // math_Matrix.ColNumber (method)
  ColNumber(): number;

  // math_Matrix.LowerRow (method)
  LowerRow(): number;

  // math_Matrix.UpperRow (method)
  UpperRow(): number;

  // math_Matrix.LowerCol (method)
  LowerCol(): number;

  // math_Matrix.UpperCol (method)
  UpperCol(): number;

  // math_Matrix.Determinant (method)
  Determinant(): number;

  // math_Matrix.Transpose (method)
  Transpose(): void;

  // math_Matrix.Invert (method)
  Invert(): void;

  // math_Matrix.Multiply (method)
  Multiply(Right: number): void;
  Multiply(Right: math_Matrix): void;
  Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
  Multiply(Left: math_Matrix, Right: math_Matrix): void;

  // math_Matrix.Multiplied (method)
  Multiplied(Right: number): math_Matrix;
  Multiplied(Right: math_Matrix): math_Matrix;
  Multiplied(Right: math_VectorBase_double): math_VectorBase_double;

  // math_Matrix.TMultiplied (method)
  TMultiplied(Right: number): math_Matrix;

  // math_Matrix.Divide (method)
  Divide(Right: number): void;

  // math_Matrix.Divided (method)
  Divided(Right: number): math_Matrix;

  // math_Matrix.Add (method)
  Add(Right: math_Matrix): void;
  Add(Left: math_Matrix, Right: math_Matrix): void;

  // math_Matrix.Added (method)
  Added(Right: math_Matrix): math_Matrix;

  // math_Matrix.Subtract (method)
  Subtract(Right: math_Matrix): void;
  Subtract(Left: math_Matrix, Right: math_Matrix): void;

  // math_Matrix.Subtracted (method)
  Subtracted(Right: math_Matrix): math_Matrix;

  // math_Matrix.Set (method)
  Set(I1: number, I2: number, J1: number, J2: number, M: math_Matrix): void;

  // math_Matrix.SetRow (method)
  SetRow(Row: number, V: math_VectorBase_double): void;

  // math_Matrix.SetCol (method)
  SetCol(Col: number, V: math_VectorBase_double): void;

  // math_Matrix.SetDiag (method)
  SetDiag(Value: number): void;

  // math_Matrix.Row (method)
  Row(Row: number): math_VectorBase_double;

  // math_Matrix.Col (method)
  Col(Col: number): math_VectorBase_double;

  // math_Matrix.SwapRow (method)
  SwapRow(Row1: number, Row2: number): void;

  // math_Matrix.SwapCol (method)
  SwapCol(Col1: number, Col2: number): void;

  // math_Matrix.Transposed (method)
  Transposed(): math_Matrix;

  // math_Matrix.Inverse (method)
  Inverse(): math_Matrix;

  // math_Matrix.TMultiply (method)
  TMultiply(Right: math_Matrix): math_Matrix;
  TMultiply(TLeft: math_Matrix, Right: math_Matrix): void;

  // math_Matrix.Value (method)
  Value(Row: number, Col: number): number;

  // math_Matrix.Initialized (method)
  Initialized(Other: math_Matrix): math_Matrix;

  // math_Matrix.Opposite (method)
  Opposite(): math_Matrix;

  // math_Matrix.delete (method)
  delete(): void;

  // math_Matrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_MultipleVarFunction: declare class math_MultipleVarFunction

  // math_MultipleVarFunction.NbVariables (method)
  NbVariables(): number;

  // math_MultipleVarFunction.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // math_MultipleVarFunction.GetStateNumber (method)
  GetStateNumber(): number;

  // math_MultipleVarFunction.delete (method)
  delete(): void;

  // math_MultipleVarFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_MultipleVarFunctionWithGradient: declare class math_MultipleVarFunctionWithGradient extends math_MultipleVarFunction

  // math_MultipleVarFunctionWithGradient.NbVariables (method)
  NbVariables(): number;

  // math_MultipleVarFunctionWithGradient.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // math_MultipleVarFunctionWithGradient.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // math_MultipleVarFunctionWithGradient.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // math_MultipleVarFunctionWithGradient.delete (method)
  delete(): void;

  // math_MultipleVarFunctionWithGradient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_MultipleVarFunctionWithHessian: declare class math_MultipleVarFunctionWithHessian extends math_MultipleVarFunctionWithGradient

  // math_MultipleVarFunctionWithHessian.NbVariables (method)
  NbVariables(): number;

  // math_MultipleVarFunctionWithHessian.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // math_MultipleVarFunctionWithHessian.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // math_MultipleVarFunctionWithHessian.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  // math_MultipleVarFunctionWithHessian.delete (method)
  delete(): void;

  // math_MultipleVarFunctionWithHessian.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_NewtonFunctionRoot: declare class math_NewtonFunctionRoot

  // math_NewtonFunctionRoot.constructor (constructor)
  constructor(F: math_FunctionWithDerivative, Guess: number, EpsX: number, EpsF: number, NbIterations?: number);
  constructor(A: number, B: number, EpsX: number, EpsF: number, NbIterations?: number);
  constructor(F: math_FunctionWithDerivative, Guess: number, EpsX: number, EpsF: number, A: number, B: number, NbIterations?: number);

  // math_NewtonFunctionRoot.Perform (method)
  Perform(F: math_FunctionWithDerivative, Guess: number): void;

  // math_NewtonFunctionRoot.IsDone (method)
  IsDone(): boolean;

  // math_NewtonFunctionRoot.Root (method)
  Root(): number;

  // math_NewtonFunctionRoot.Derivative (method)
  Derivative(): number;

  // math_NewtonFunctionRoot.Value (method)
  Value(): number;

  // math_NewtonFunctionRoot.NbIterations (method)
  NbIterations(): number;

  // math_NewtonFunctionRoot.delete (method)
  delete(): void;

  // math_NewtonFunctionRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_NotSquare: declare class math_NotSquare extends Standard_DimensionError

  // math_NotSquare.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // math_NotSquare.ExceptionType (method)
  ExceptionType(): string;

  // math_NotSquare.delete (method)
  delete(): void;

  // math_NotSquare.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_PSO: declare class math_PSO

  // math_PSO.constructor (constructor)
  constructor(theFunc: math_MultipleVarFunction, theLowBorder: math_VectorBase_double, theUppBorder: math_VectorBase_double, theSteps: math_VectorBase_double, theNbParticles?: number, theNbIter?: number);

  // math_PSO.Perform (method)
  Perform(theSteps: math_VectorBase_double, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
  Perform(theParticles: math_PSOParticlesPool, theNbParticles: number, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };

  // math_PSO.delete (method)
  delete(): void;

  // math_PSO.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_PSOParticlesPool: declare class math_PSOParticlesPool

  // math_PSOParticlesPool.constructor (constructor)
  constructor(theParticlesCount: number, theDimensionCount: number);

  // math_PSOParticlesPool.GetParticle (method)
  GetParticle(theIdx: number): PSO_Particle;

  // math_PSOParticlesPool.GetBestParticle (method)
  GetBestParticle(): PSO_Particle;

  // math_PSOParticlesPool.GetWorstParticle (method)
  GetWorstParticle(): PSO_Particle;

  // math_PSOParticlesPool.delete (method)
  delete(): void;

  // math_PSOParticlesPool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Powell: declare class math_Powell

  // math_Powell.constructor (constructor)
  constructor(theFunction: math_MultipleVarFunction, theTolerance: number, theNbIterations?: number, theZEPS?: number);

  // math_Powell.Perform (method)
  Perform(theFunction: math_MultipleVarFunction, theStartingPoint: math_VectorBase_double, theStartingDirections: math_Matrix): void;

  // math_Powell.IsSolutionReached (method)
  IsSolutionReached(theFunction: math_MultipleVarFunction): boolean;

  // math_Powell.IsDone (method)
  IsDone(): boolean;

  // math_Powell.Location (method)
  Location(): math_VectorBase_double;
  Location(Loc: math_VectorBase_double): void;

  // math_Powell.Minimum (method)
  Minimum(): number;

  // math_Powell.NbIterations (method)
  NbIterations(): number;

  // math_Powell.delete (method)
  delete(): void;

  // math_Powell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_SVD: declare class math_SVD

  // math_SVD.constructor (constructor)
  constructor(A: math_Matrix);

  // math_SVD.IsDone (method)
  IsDone(): boolean;

  // math_SVD.Solve (method)
  Solve(B: math_VectorBase_double, X: math_VectorBase_double, Eps?: number): void;

  // math_SVD.PseudoInverse (method)
  PseudoInverse(Inv: math_Matrix, Eps?: number): void;

  // math_SVD.delete (method)
  delete(): void;

  // math_SVD.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_SingularMatrix: declare class math_SingularMatrix extends Standard_Failure

  // math_SingularMatrix.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // math_SingularMatrix.ExceptionType (method)
  ExceptionType(): string;

  // math_SingularMatrix.delete (method)
  delete(): void;

  // math_SingularMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_Status: typeof math_Status[keyof typeof math_Status]

  readonly math_OK: 'math_OK'

  readonly math_TooManyIterations: 'math_TooManyIterations'

  readonly math_FunctionError: 'math_FunctionError'

  readonly math_DirectionSearchError: 'math_DirectionSearchError'

  readonly math_NotBracketed: 'math_NotBracketed'

math_TrigonometricEquationFunction: declare class math_TrigonometricEquationFunction extends math_FunctionWithDerivative

  // math_TrigonometricEquationFunction.constructor (constructor)
  constructor(A: number, B: number, C: number, D: number, E: number);

  // math_TrigonometricEquationFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // math_TrigonometricEquationFunction.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // math_TrigonometricEquationFunction.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // math_TrigonometricEquationFunction.delete (method)
  delete(): void;

  // math_TrigonometricEquationFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_TrigonometricFunctionRoots: declare class math_TrigonometricFunctionRoots

  // math_TrigonometricFunctionRoots.constructor (constructor)
  constructor(D: number, E: number, InfBound: number, SupBound: number);
  constructor(C: number, D: number, E: number, InfBound: number, SupBound: number);
  constructor(A: number, B: number, C: number, D: number, E: number, InfBound: number, SupBound: number);

  // math_TrigonometricFunctionRoots.IsDone (method)
  IsDone(): boolean;

  // math_TrigonometricFunctionRoots.InfiniteRoots (method)
  InfiniteRoots(): boolean;

  // math_TrigonometricFunctionRoots.Value (method)
  Value(Index: number): number;

  // math_TrigonometricFunctionRoots.NbSolutions (method)
  NbSolutions(): number;

  // math_TrigonometricFunctionRoots.delete (method)
  delete(): void;

  // math_TrigonometricFunctionRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
