# libcascade — math

47 top-level symbols. Signatures are verbatim typescript.

math: declare class math

constructor

static GaussPointsMax(): number;

static GaussPoints(Index: number, Points: math_VectorBase_double): void;

static GaussWeights(Index: number, Weights: math_VectorBase_double): void;

static KronrodPointsMax(): number;

static OrderedGaussPointsAndWeights(Index: number, Points: math_VectorBase_double, Weights: math_VectorBase_double): boolean;

static KronrodPointsAndWeights(Index: number, Points: math_VectorBase_double, Weights: math_VectorBase_double): boolean;

delete(): void;

[Symbol.dispose](): void;

math_BFGS: declare class math_BFGS

constructor

SetBoundary(theLeftBorder: math_VectorBase_double, theRightBorder: math_VectorBase_double): void;

Perform(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double): void;

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

IsDone(): boolean;

Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;

Minimum(): number;

Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;
Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_BissecNewton: declare class math_BissecNewton

constructor

Perform(F: math_FunctionWithDerivative, Bound1: number, Bound2: number, NbIterations?: number): void;

IsSolutionReached(theFunction: math_FunctionWithDerivative): boolean;

IsDone(): boolean;

Root(): number;

Derivative(): number;

Value(): number;

delete(): void;

[Symbol.dispose](): void;

math_BracketMinimum: declare class math_BracketMinimum

constructor

SetLimits(theLeft: number, theRight: number): void;

SetFA(theValue: number): void;

SetFB(theValue: number): void;

Perform(F: math_Function): void;

IsDone(): boolean;

Values(A?: number, B?: number, C?: number): { A: number; B: number; C: number };

FunctionValues(FA?: number, FB?: number, FC?: number): { FA: number; FB: number; FC: number };

delete(): void;

[Symbol.dispose](): void;

math_BracketedRoot: declare class math_BracketedRoot

constructor

IsDone(): boolean;

Root(): number;

Value(): number;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_BrentMinimum: declare class math_BrentMinimum

constructor

Perform(F: math_Function, Ax: number, Bx: number, Cx: number): void;

IsSolutionReached(theFunction: math_Function): boolean;

IsDone(): boolean;

Location(): number;

Minimum(): number;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_BullardGenerator: declare class math_BullardGenerator

constructor

SetSeed(theSeed?: number): void;

NextInt(): number;

NextReal(): number;

delete(): void;

[Symbol.dispose](): void;

math_ComputeGaussPointsAndWeights: declare class math_ComputeGaussPointsAndWeights

constructor

IsDone(): boolean;

Points(): math_VectorBase_double;

Weights(): math_VectorBase_double;

delete(): void;

[Symbol.dispose](): void;

math_ComputeKronrodPointsAndWeights: declare class math_ComputeKronrodPointsAndWeights

constructor

IsDone(): boolean;

Points(): math_VectorBase_double;

Weights(): math_VectorBase_double;

delete(): void;

[Symbol.dispose](): void;

math_Crout: declare class math_Crout

constructor

IsDone(): boolean;

Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;

Inverse(): math_Matrix;

Invert(Inv: math_Matrix): void;

Determinant(): number;

delete(): void;

[Symbol.dispose](): void;

math_DirectPolynomialRoots: declare class math_DirectPolynomialRoots

constructor

IsDone(): boolean;

InfiniteRoots(): boolean;

NbSolutions(): number;

Value(theIndex: number): number;

delete(): void;

[Symbol.dispose](): void;

math_DoubleTab: declare class math_DoubleTab

constructor

Init(theInitValue: number): void;

Copy(theOther: math_DoubleTab): void;

IsDeletable(): boolean;

SetLowerRow(theLowerRow: number): void;

SetLowerCol(theLowerCol: number): void;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

NbRows(): number;

NbColumns(): number;

Value(theRowIndex: number, theColIndex: number): number;

delete(): void;

[Symbol.dispose](): void;

math_EigenValuesSearcher: declare class math_EigenValuesSearcher

constructor

IsDone(): boolean;

Dimension(): number;

EigenValue(theIndex: number): number;

EigenVector(theIndex: number): math_VectorBase_double;

delete(): void;

[Symbol.dispose](): void;

math_FRPR: declare class math_FRPR

constructor

Perform(theFunction: math_MultipleVarFunctionWithGradient, theStartingPoint: math_VectorBase_double): void;

IsSolutionReached(theFunction: math_MultipleVarFunctionWithGradient): boolean;

IsDone(): boolean;

Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;

Minimum(): number;

Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;
Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_Function: declare class math_Function

Value(X: number, F: number): { returnValue: boolean; F: number };

GetStateNumber(): number;

delete(): void;

[Symbol.dispose](): void;

math_FunctionAllRoots: declare class math_FunctionAllRoots

constructor

IsDone(): boolean;

NbIntervals(): number;

GetInterval(Index: number, A?: number, B?: number): { A: number; B: number };

GetIntervalState(Index: number, IFirst?: number, ILast?: number): { IFirst: number; ILast: number };

NbPoints(): number;

GetPoint(Index: number): number;

GetPointState(Index: number): number;

delete(): void;

[Symbol.dispose](): void;

math_FunctionRoot: declare class math_FunctionRoot

constructor

IsDone(): boolean;

Root(): number;

Derivative(): number;

Value(): number;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_FunctionRoots: declare class math_FunctionRoots

constructor

IsDone(): boolean;

IsAllNull(): boolean;

NbSolutions(): number;

Value(Nieme: number): number;

StateNumber(Nieme: number): number;

delete(): void;

[Symbol.dispose](): void;

math_FunctionSample: declare class math_FunctionSample

constructor

Bounds(A: number, B: number): { A: number; B: number };

NbPoints(): number;

GetParameter(Index: number): number;

delete(): void;

[Symbol.dispose](): void;

math_FunctionSet: declare class math_FunctionSet

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

GetStateNumber(): number;

delete(): void;

[Symbol.dispose](): void;

math_FunctionSetRoot: declare class math_FunctionSetRoot

constructor

SetTolerance(Tolerance: math_VectorBase_double): void;

IsSolutionReached(argNo0: math_FunctionSetWithDerivatives): boolean;

Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theStopOnDivergent: boolean): void;
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theStopOnDivergent: boolean): void;
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theStopOnDivergent: boolean): void;
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theStopOnDivergent: boolean): void;

IsDone(): boolean;

NbIterations(): number;

StateNumber(): number;

Root(): math_VectorBase_double;
Root(Root: math_VectorBase_double): void;
Root(): math_VectorBase_double;
Root(Root: math_VectorBase_double): void;

Derivative(): math_Matrix;
Derivative(Der: math_Matrix): void;
Derivative(): math_Matrix;
Derivative(Der: math_Matrix): void;

FunctionSetErrors(): math_VectorBase_double;
FunctionSetErrors(Err: math_VectorBase_double): void;
FunctionSetErrors(): math_VectorBase_double;
FunctionSetErrors(Err: math_VectorBase_double): void;

IsDivergent(): boolean;

delete(): void;

[Symbol.dispose](): void;

math_FunctionSetWithDerivatives: declare class math_FunctionSetWithDerivatives extends math_FunctionSet

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

delete(): void;

[Symbol.dispose](): void;

math_FunctionWithDerivative: declare class math_FunctionWithDerivative extends math_Function

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

delete(): void;

[Symbol.dispose](): void;

math_Gauss: declare class math_Gauss

constructor

IsDone(): boolean;

Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double): void;
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double): void;

Determinant(): number;

Invert(Inv: math_Matrix): void;

delete(): void;

[Symbol.dispose](): void;

math_GaussLeastSquare: declare class math_GaussLeastSquare

constructor

IsDone(): boolean;

Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;

delete(): void;

[Symbol.dispose](): void;

math_GaussMultipleIntegration: declare class math_GaussMultipleIntegration

constructor

IsDone(): boolean;

Value(): number;

delete(): void;

[Symbol.dispose](): void;

math_GaussSetIntegration: declare class math_GaussSetIntegration

constructor

IsDone(): boolean;

Value(): math_VectorBase_double;

delete(): void;

[Symbol.dispose](): void;

math_GaussSingleIntegration: declare class math_GaussSingleIntegration

constructor

IsDone(): boolean;

Value(): number;

delete(): void;

[Symbol.dispose](): void;

math_GlobOptMin: declare class math_GlobOptMin

constructor

SetGlobalParams(theFunc: math_MultipleVarFunction, theLowerBorder: math_VectorBase_double, theUpperBorder: math_VectorBase_double, theC?: number, theDiscretizationTol?: number, theSameTol?: number): void;

SetLocalParams(theLocalA: math_VectorBase_double, theLocalB: math_VectorBase_double): void;

SetTol(theDiscretizationTol: number, theSameTol: number): void;

GetTol(theDiscretizationTol?: number, theSameTol?: number): { theDiscretizationTol: number; theSameTol: number };

Perform(isFindSingleSolution?: boolean): void;

Points(theIndex: number, theSol: math_VectorBase_double): void;

SetContinuity(theCont: number): void;

GetContinuity(): number;

SetFunctionalMinimalValue(theMinimalValue: number): void;

GetFunctionalMinimalValue(): number;

SetLipConstState(theFlag: boolean): void;

GetLipConstState(): boolean;

isDone(): boolean;

GetF(): number;

NbExtrema(): number;

delete(): void;

[Symbol.dispose](): void;

math_Jacobi: declare class math_Jacobi

constructor

IsDone(): boolean;

Values(): math_VectorBase_double;

Value(Num: number): number;

Vectors(): math_Matrix;

Vector(Num: number, V: math_VectorBase_double): void;

delete(): void;

[Symbol.dispose](): void;

math_KronrodSingleIntegration: declare class math_KronrodSingleIntegration

constructor

Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number): void;
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number, theTolerance: number, theMaxNbIter: number): void;
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number): void;
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number, theTolerance: number, theMaxNbIter: number): void;

IsDone(): boolean;

Value(): number;

ErrorReached(): number;

AbsolutError(): number;

OrderReached(): number;

NbIterReached(): number;

static GKRule(theFunction: math_Function, theLower: number, theUpper: number, theGaussP: math_VectorBase_double, theGaussW: math_VectorBase_double, theKronrodP: math_VectorBase_double, theKronrodW: math_VectorBase_double, theValue?: number, theError?: number): { returnValue: boolean; theValue: number; theError: number };

delete(): void;

[Symbol.dispose](): void;

math_Matrix: declare class math_Matrix

constructor

Init(InitialValue: number): void;

RowNumber(): number;

ColNumber(): number;

LowerRow(): number;

UpperRow(): number;

LowerCol(): number;

UpperCol(): number;

Determinant(): number;

Transpose(): void;

Invert(): void;

Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;

Multiplied(Right: number): math_Matrix;
Multiplied(Right: math_Matrix): math_Matrix;
Multiplied(Right: math_VectorBase_double): math_VectorBase_double;
Multiplied(Right: number): math_Matrix;
Multiplied(Right: math_Matrix): math_Matrix;
Multiplied(Right: math_VectorBase_double): math_VectorBase_double;
Multiplied(Right: number): math_Matrix;
Multiplied(Right: math_Matrix): math_Matrix;
Multiplied(Right: math_VectorBase_double): math_VectorBase_double;

TMultiplied(Right: number): math_Matrix;

Divide(Right: number): void;

Divided(Right: number): math_Matrix;

Add(Right: math_Matrix): void;
Add(Left: math_Matrix, Right: math_Matrix): void;
Add(Right: math_Matrix): void;
Add(Left: math_Matrix, Right: math_Matrix): void;

Added(Right: math_Matrix): math_Matrix;

Subtract(Right: math_Matrix): void;
Subtract(Left: math_Matrix, Right: math_Matrix): void;
Subtract(Right: math_Matrix): void;
Subtract(Left: math_Matrix, Right: math_Matrix): void;

Subtracted(Right: math_Matrix): math_Matrix;

Set(I1: number, I2: number, J1: number, J2: number, M: math_Matrix): void;

SetRow(Row: number, V: math_VectorBase_double): void;

SetCol(Col: number, V: math_VectorBase_double): void;

SetDiag(Value: number): void;

Row(Row: number): math_VectorBase_double;

Col(Col: number): math_VectorBase_double;

SwapRow(Row1: number, Row2: number): void;

SwapCol(Col1: number, Col2: number): void;

Transposed(): math_Matrix;

Inverse(): math_Matrix;

TMultiply(Right: math_Matrix): math_Matrix;
TMultiply(TLeft: math_Matrix, Right: math_Matrix): void;
TMultiply(Right: math_Matrix): math_Matrix;
TMultiply(TLeft: math_Matrix, Right: math_Matrix): void;

Value(Row: number, Col: number): number;

Initialized(Other: math_Matrix): math_Matrix;

Opposite(): math_Matrix;

delete(): void;

[Symbol.dispose](): void;

math_MultipleVarFunction: declare class math_MultipleVarFunction

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

GetStateNumber(): number;

delete(): void;

[Symbol.dispose](): void;

math_MultipleVarFunctionWithGradient: declare class math_MultipleVarFunctionWithGradient extends math_MultipleVarFunction

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

delete(): void;

[Symbol.dispose](): void;

math_MultipleVarFunctionWithHessian: declare class math_MultipleVarFunctionWithHessian extends math_MultipleVarFunctionWithGradient

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

delete(): void;

[Symbol.dispose](): void;

math_NewtonFunctionRoot: declare class math_NewtonFunctionRoot

constructor

Perform(F: math_FunctionWithDerivative, Guess: number): void;

IsDone(): boolean;

Root(): number;

Derivative(): number;

Value(): number;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_NotSquare: declare class math_NotSquare extends Standard_DimensionError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

math_PSO: declare class math_PSO

constructor

Perform(theSteps: math_VectorBase_double, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
Perform(theParticles: math_PSOParticlesPool, theNbParticles: number, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
Perform(theSteps: math_VectorBase_double, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
Perform(theParticles: math_PSOParticlesPool, theNbParticles: number, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };

delete(): void;

[Symbol.dispose](): void;

math_PSOParticlesPool: declare class math_PSOParticlesPool

constructor

GetParticle(theIdx: number): PSO_Particle;

GetBestParticle(): PSO_Particle;

GetWorstParticle(): PSO_Particle;

delete(): void;

[Symbol.dispose](): void;

math_Powell: declare class math_Powell

constructor

Perform(theFunction: math_MultipleVarFunction, theStartingPoint: math_VectorBase_double, theStartingDirections: math_Matrix): void;

IsSolutionReached(theFunction: math_MultipleVarFunction): boolean;

IsDone(): boolean;

Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;

Minimum(): number;

NbIterations(): number;

delete(): void;

[Symbol.dispose](): void;

math_SVD: declare class math_SVD

constructor

IsDone(): boolean;

Solve(B: math_VectorBase_double, X: math_VectorBase_double, Eps?: number): void;

PseudoInverse(Inv: math_Matrix, Eps?: number): void;

delete(): void;

[Symbol.dispose](): void;

math_SingularMatrix: declare class math_SingularMatrix extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

math_Status: typeof math_Status[keyof typeof math_Status]

math_TrigonometricEquationFunction: declare class math_TrigonometricEquationFunction extends math_FunctionWithDerivative

constructor

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

delete(): void;

[Symbol.dispose](): void;

math_TrigonometricFunctionRoots: declare class math_TrigonometricFunctionRoots

constructor

IsDone(): boolean;

InfiniteRoots(): boolean;

Value(Index: number): number;

NbSolutions(): number;

delete(): void;

[Symbol.dispose](): void;

math_Uzawa: declare class math_Uzawa

constructor

IsDone(): boolean;

Value(): math_VectorBase_double;

InitialError(): math_VectorBase_double;

Duale(V: math_VectorBase_double): void;

Error(): math_VectorBase_double;

NbIterations(): number;

InverseCont(): math_Matrix;

delete(): void;

[Symbol.dispose](): void;

math_ValueAndWeight: declare class math_ValueAndWeight

constructor

Value(): number;

Weight(): number;

delete(): void;

[Symbol.dispose](): void;
