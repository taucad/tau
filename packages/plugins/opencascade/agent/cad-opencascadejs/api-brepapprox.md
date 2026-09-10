# libcascade — BRepApprox

14 top-level symbols. Signatures are verbatim typescript.

BRepApprox_ApproxLine: declare class BRepApprox_ApproxLine extends Standard_Transient

constructor

NbPnts(): number;

Point(Index: number): IntSurf_PntOn2S;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox extends math_BFGS

constructor

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox extends math_MultipleVarFunctionWithGradient

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

BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox

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

BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox extends math_BFGS

constructor

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox extends math_BFGS

constructor

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_MyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_MyBSplGradientOfTheComputeLineOfApprox

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

BRepApprox_MyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_MyGradientOfTheComputeLineBezierOfApprox

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

BRepApprox_MyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_MyGradientbisOfTheComputeLineOfApprox

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

BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox extends math_MultipleVarFunctionWithGradient

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

BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox extends math_MultipleVarFunctionWithGradient

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

BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox

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

BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox

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

BRepApprox_SurfaceTool: declare class BRepApprox_SurfaceTool

constructor

static FirstUParameter(S: BRepAdaptor_Surface): number;

static FirstVParameter(S: BRepAdaptor_Surface): number;

static LastUParameter(S: BRepAdaptor_Surface): number;

static LastVParameter(S: BRepAdaptor_Surface): number;

static NbUIntervals(S: BRepAdaptor_Surface, Sh: GeomAbs_Shape): number;

static NbVIntervals(S: BRepAdaptor_Surface, Sh: GeomAbs_Shape): number;

static UIntervals(S: BRepAdaptor_Surface, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

static VIntervals(S: BRepAdaptor_Surface, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

// If <First> >= <Last>
static UTrim(S: BRepAdaptor_Surface, First: number, Last: number, Tol: number): Adaptor3d_Surface;

// If <First> >= <Last>
static VTrim(S: BRepAdaptor_Surface, First: number, Last: number, Tol: number): Adaptor3d_Surface;

static IsUClosed(S: BRepAdaptor_Surface): boolean;

static IsVClosed(S: BRepAdaptor_Surface): boolean;

static IsUPeriodic(S: BRepAdaptor_Surface): boolean;

static UPeriod(S: BRepAdaptor_Surface): number;

static IsVPeriodic(S: BRepAdaptor_Surface): boolean;

static VPeriod(S: BRepAdaptor_Surface): number;

static Value(S: BRepAdaptor_Surface, u: number, v: number): gp_Pnt;

static D0(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt): void;

static D1(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1u: gp_Vec, D1v: gp_Vec): void;

static D2(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

static D3(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

static DN(S: BRepAdaptor_Surface, u: number, v: number, Nu: number, Nv: number): gp_Vec;

static UResolution(S: BRepAdaptor_Surface, R3d: number): number;

static VResolution(S: BRepAdaptor_Surface, R3d: number): number;

static GetType(S: BRepAdaptor_Surface): GeomAbs_SurfaceType;

static Plane(S: BRepAdaptor_Surface): gp_Pln;

static Cylinder(S: BRepAdaptor_Surface): gp_Cylinder;

static Cone(S: BRepAdaptor_Surface): gp_Cone;

static Torus(S: BRepAdaptor_Surface): gp_Torus;

static Sphere(S: BRepAdaptor_Surface): gp_Sphere;

static Bezier(S: BRepAdaptor_Surface): Geom_BezierSurface;

static BSpline(S: BRepAdaptor_Surface): Geom_BSplineSurface;

static AxeOfRevolution(S: BRepAdaptor_Surface): gp_Ax1;

static Direction(S: BRepAdaptor_Surface): gp_Dir;

static BasisCurve(S: BRepAdaptor_Surface): Adaptor3d_Curve;

static NbSamplesU(S: BRepAdaptor_Surface): number;
static NbSamplesU(S: BRepAdaptor_Surface, u1: number, u2: number): number;
static NbSamplesU(S: BRepAdaptor_Surface): number;
static NbSamplesU(S: BRepAdaptor_Surface, u1: number, u2: number): number;

static NbSamplesV(S: BRepAdaptor_Surface): number;
static NbSamplesV(S: BRepAdaptor_Surface, v1: number, v2: number): number;
static NbSamplesV(S: BRepAdaptor_Surface): number;
static NbSamplesV(S: BRepAdaptor_Surface, v1: number, v2: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
