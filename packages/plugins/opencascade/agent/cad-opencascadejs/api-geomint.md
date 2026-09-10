# libcascade — GeomInt

15 top-level symbols. Signatures are verbatim typescript.

// Provides intersections on between two surfaces of Geom
GeomInt: declare class GeomInt

constructor

// Adjusts the parameter <thePar> to the range [theParMin, theParMax]
static AdjustPeriodic(thePar: number, theParMin: number, theParMax: number, thePeriod: number, theNewPar: number, theOffset: number, theEps: number): { returnValue: boolean; theNewPar: number; theOffset: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox extends math_BFGS

constructor

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox extends math_MultipleVarFunctionWithGradient

constructor

// returns the number of variables of the function
NbVariables(): number;

// this method computes the new approximation of the MultiLine SSP and calculates F = sum (||Pui - Bi\*Pi||2) for each point of the MultiLine
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// returns the gradient G of the sum above for the parameters Xi
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// returns the value F=sum(||Pui - Bi\*Pi||)2
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

// returns the new parameters of the MultiLine
NewParameters(): math_VectorBase_double;

// returns the MultiBSpCurve approximating the set after computing the value F or Grad(F)
CurveValue(): AppParCurves_MultiBSpCurve;

// returns the distance between the MultiPoint of range IPoint and the curve CurveIndex
Error(IPoint: number, CurveIndex: number): number;

// returns the maximum distance between the points and the MultiBSpCurve
MaxError3d(): number;

// returns the maximum distance between the points and the MultiBSpCurve
MaxError2d(): number;

// returns the function matrix used to approximate the multiline
FunctionMatrix(): math_Matrix;

// returns the derivative function matrix used to approximate the multiline
DerivativeFunctionMatrix(): math_Matrix;

// Returns the indexes of the first non null values of A and DA
Index(): math_VectorBase_int;

FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

SetFirstLambda(l1: number): void;

SetLastLambda(l2: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox

constructor

// Is used after having initialized the fields
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

// returns True if all has been correctly done
IsDone(): boolean;

// returns the result of the approximation, i.e
BezierValue(): AppParCurves_MultiCurve;

// returns the result of the approximation, i.e
BSplineValue(): AppParCurves_MultiBSpCurve;

// returns the function matrix used to approximate the set
FunctionMatrix(): math_Matrix;

// returns the derivative function matrix used to approximate the set
DerivativeFunctionMatrix(): math_Matrix;

// returns the maximum errors between the MultiLine and the approximation curves
ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

// returns the distances between the points of the multiline and the approximation curves
Distance(): math_Matrix;

// returns the maximum errors between the MultiLine and the approximation curves
Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

// returns the value (P2 - P1)/ V1 if the first point was a tangency point
FirstLambda(): number;

// returns the value (PN - PN-1)/ VN if the last point was a tangency point
LastLambda(): number;

// returns the matrix of points value
Points(): math_Matrix;

// returns the matrix of resulting control points value
Poles(): math_Matrix;

// Returns the indexes of the first non null values of A and DA
KIndex(): math_VectorBase_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox extends math_BFGS

constructor

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox extends math_BFGS

constructor

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_IntSS: declare class GeomInt_IntSS

constructor

// general intersection of two surfaces intersection of adapted surfaces general intersection using a starting point intersection of adapted surfaces using a starting point
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;

IsDone(): boolean;

TolReached3d(): number;

TolReached2d(): number;

NbLines(): number;

Line(Index: number): Geom_Curve;

HasLineOnS1(Index: number): boolean;

LineOnS1(Index: number): Geom2d_Curve;

HasLineOnS2(Index: number): boolean;

LineOnS2(Index: number): Geom2d_Curve;

NbBoundaries(): number;

Boundary(Index: number): Geom_Curve;

NbPoints(): number;

Point(Index: number): gp_Pnt;

Pnt2d(Index: number, OnFirst: boolean): gp_Pnt2d;

// creates 2D-curve on given surface from given 3D-curve
static BuildPCurves(theFirst: number, theLast: number, theUmin: number, theUmax: number, theVmin: number, theVmax: number, theTol: number, theSurface: Geom_Surface, theCurve: Geom_Curve): { theTol: number; theCurve2d: Geom2d_Curve; [Symbol.dispose](): void };
static BuildPCurves(f: number, l: number, Tol: number, S: Geom_Surface, C: Geom_Curve): { Tol: number; C2d: Geom2d_Curve; [Symbol.dispose](): void };
static BuildPCurves(theFirst: number, theLast: number, theUmin: number, theUmax: number, theVmin: number, theVmax: number, theTol: number, theSurface: Geom_Surface, theCurve: Geom_Curve): { theTol: number; theCurve2d: Geom2d_Curve; [Symbol.dispose](): void };
static BuildPCurves(f: number, l: number, Tol: number, S: Geom_Surface, C: Geom_Curve): { Tol: number; C2d: Geom2d_Curve; [Symbol.dispose](): void };

// puts into theArrayOfParameters the parameters of intersection points of given theC2d1 and theC2d2 curves with the boundaries of the source surface
static TrimILineOnSurfBoundaries(theC2d1: Geom2d_Curve, theC2d2: Geom2d_Curve, theBound1: Bnd_Box2d, theBound2: Bnd_Box2d, theArrayOfParameters: NCollection_DynamicArray_double): void;
// theArrayOfParameters: Mutated in place

static MakeBSpline(WL: IntPatch_WLine, ideb: number, ifin: number): Geom_Curve;

static MakeBSpline2d(theWLine: IntPatch_WLine, ideb: number, ifin: number, onFirst: boolean): Geom2d_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Splits given Line
GeomInt_LineConstructor: declare class GeomInt_LineConstructor

constructor

// Initializes me by two surfaces and corresponding tools which represent boundaries of surfaces
Load(D1: Adaptor3d_TopolTool, D2: Adaptor3d_TopolTool, S1: GeomAdaptor_Surface, S2: GeomAdaptor_Surface): void;

// Splits line
Perform(L: IntPatch_Line): void;

// Returns True if splitting was successful
IsDone(): boolean;

// Returns number of splits
NbParts(): number;

// Return first and last parameters for given index of split
Part(I: number, WFirst?: number, WLast?: number): { WFirst: number; WLast: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_LineTool: declare class GeomInt_LineTool

constructor

static NbVertex(L: IntPatch_Line): number;

static Vertex(L: IntPatch_Line, I: number): IntPatch_Point;

static FirstParameter(L: IntPatch_Line): number;

static LastParameter(L: IntPatch_Line): number;

static DecompositionOfWLine(theWLine: IntPatch_WLine, theSurface1: GeomAdaptor_Surface, theSurface2: GeomAdaptor_Surface, aTolSum: number, theLConstructor: GeomInt_LineConstructor, theNewLines: NCollection_Sequence_handle_IntPatch_Line): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox

constructor

// returns True if all has been correctly done
IsDone(): boolean;

// returns all the BSpline curves approximating the MultiLine SSP after minimization of the parameter
Value(): AppParCurves_MultiBSpCurve;

// returns the difference between the old and the new approximation
Error(Index: number): number;

// returns the maximum difference between the old and the new approximation
MaxError3d(): number;

// returns the maximum difference between the old and the new approximation
MaxError2d(): number;

// returns the average error between the old and the new approximation
AverageError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox

constructor

// returns True if all has been correctly done
IsDone(): boolean;

// returns all the Bezier curves approximating the MultiLine SSP after minimization of the parameter
Value(): AppParCurves_MultiCurve;

// returns the difference between the old and the new approximation
Error(Index: number): number;

// returns the maximum difference between the old and the new approximation
MaxError3d(): number;

// returns the maximum difference between the old and the new approximation
MaxError2d(): number;

// returns the average error between the old and the new approximation
AverageError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_MyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_MyGradientbisOfTheComputeLineOfWLApprox

constructor

// returns True if all has been correctly done
IsDone(): boolean;

// returns all the Bezier curves approximating the MultiLine SSP after minimization of the parameter
Value(): AppParCurves_MultiCurve;

// returns the difference between the old and the new approximation
Error(Index: number): number;

// returns the maximum difference between the old and the new approximation
MaxError3d(): number;

// returns the maximum difference between the old and the new approximation
MaxError2d(): number;

// returns the average error between the old and the new approximation
AverageError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox extends math_MultipleVarFunctionWithGradient

constructor

// returns the number of variables of the function
NbVariables(): number;

// this method computes the new approximation of the MultiLine SSP and calculates F = sum (||Pui - Bi\*Pi||2) for each point of the MultiLine
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// returns the gradient G of the sum above for the parameters Xi
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// returns the value F=sum(||Pui - Bi\*Pi||)2
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

// returns the new parameters of the MultiLine
NewParameters(): math_VectorBase_double;

// returns the MultiCurve approximating the set after computing the value F or Grad(F)
CurveValue(): AppParCurves_MultiCurve;

// returns the distance between the MultiPoint of range IPoint and the curve CurveIndex
Error(IPoint: number, CurveIndex: number): number;

// returns the maximum distance between the points and the MultiCurve
MaxError3d(): number;

// returns the maximum distance between the points and the MultiCurve
MaxError2d(): number;

FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox extends math_MultipleVarFunctionWithGradient

constructor

// returns the number of variables of the function
NbVariables(): number;

// this method computes the new approximation of the MultiLine SSP and calculates F = sum (||Pui - Bi\*Pi||2) for each point of the MultiLine
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// returns the gradient G of the sum above for the parameters Xi
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// returns the value F=sum(||Pui - Bi\*Pi||)2
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

// returns the new parameters of the MultiLine
NewParameters(): math_VectorBase_double;

// returns the MultiCurve approximating the set after computing the value F or Grad(F)
CurveValue(): AppParCurves_MultiCurve;

// returns the distance between the MultiPoint of range IPoint and the curve CurveIndex
Error(IPoint: number, CurveIndex: number): number;

// returns the maximum distance between the points and the MultiCurve
MaxError3d(): number;

// returns the maximum distance between the points and the MultiCurve
MaxError2d(): number;

FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox

constructor

// Is used after having initialized the fields
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

// returns True if all has been correctly done
IsDone(): boolean;

// returns the result of the approximation, i.e
BezierValue(): AppParCurves_MultiCurve;

// returns the result of the approximation, i.e
BSplineValue(): AppParCurves_MultiBSpCurve;

// returns the function matrix used to approximate the set
FunctionMatrix(): math_Matrix;

// returns the derivative function matrix used to approximate the set
DerivativeFunctionMatrix(): math_Matrix;

// returns the maximum errors between the MultiLine and the approximation curves
ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

// returns the distances between the points of the multiline and the approximation curves
Distance(): math_Matrix;

// returns the maximum errors between the MultiLine and the approximation curves
Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

// returns the value (P2 - P1)/ V1 if the first point was a tangency point
FirstLambda(): number;

// returns the value (PN - PN-1)/ VN if the last point was a tangency point
LastLambda(): number;

// returns the matrix of points value
Points(): math_Matrix;

// returns the matrix of resulting control points value
Poles(): math_Matrix;

// Returns the indexes of the first non null values of A and DA
KIndex(): math_VectorBase_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
