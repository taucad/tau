# libcascade — Blend

6 top-level symbols. Signatures are verbatim typescript.

// Deferred class for a function used to compute a blending surface between two surfaces, using a guide line
Blend_AppFunction: declare class Blend_AppFunction extends math_FunctionSetWithDerivatives

// returns the number of variables of the function
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(First: number, Last: number): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 4 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each of the 4 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Returns the minimal Distance between two extremities of calculated sections
GetMinimalDistance(): number;

// Returns the point on the first support
Pnt1(): gp_Pnt;

// Returns the point on the first support
Pnt2(): gp_Pnt;

// Returns if the section is rational
IsRational(): boolean;

// Returns the length of the maximum section
GetSectionSize(): number;

// Compute the minimal value of weight for each poles of all sections
GetMinimalWeight(Weigths: NCollection_Array1_double): void;
// Weigths: Mutated in place

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

Knots(TKnots: NCollection_Array1_double): void;

Mults(TMults: NCollection_Array1_int): void;

// Used for the first and last section The method returns true if the derivatives are computed, otherwise it returns false
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Returns the parameter of the point P
Parameter(P: Blend_Point): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Deferred class for a function used to compute a blending surface between a surface and a curve, using a guide line
Blend_CSFunction: declare class Blend_CSFunction extends Blend_AppFunction

// Returns 3 (default value)
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(First: number, Last: number): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Returns the minimal Distance between two extremities of calculated sections
GetMinimalDistance(): number;

// Returns the point on the first support
Pnt1(): gp_Pnt;

// Returns the point on the second support
Pnt2(): gp_Pnt;

// Returns the point on the surface
PointOnS(): gp_Pnt;

// Returns the point on the curve
PointOnC(): gp_Pnt;

// Returns U,V coordinates of the point on the surface
Pnt2d(): gp_Pnt2d;

// Returns parameter of the point on the curve
ParameterOnC(): number;

// Returns True when it is not possible to compute the tangent vectors at PointOnS and/or PointOnC
IsTangencyPoint(): boolean;

// Returns the tangent vector at PointOnS, in 3d space
TangentOnS(): gp_Vec;

// Returns the tangent vector at PointOnS, in the parametric space of the first surface
Tangent2d(): gp_Vec2d;

// Returns the tangent vector at PointOnC, in 3d space
TangentOnC(): gp_Vec;

// Returns the tangent vector at the section, at the beginning and the end of the section, and returns the normal (of the surfaces) at these points
Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;
// TgS: Mutated in place
// NormS: Mutated in place

GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

Knots(TKnots: NCollection_Array1_double): void;

Mults(TMults: NCollection_Array1_int): void;

// Used for the first and last section The method returns true if the derivatives are computed, otherwise it returns false
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Deferred class for a function used to compute a blending surface between a surface and a curve, using a guide line
Blend_CurvPointFuncInv: declare class Blend_CurvPointFuncInv extends math_FunctionSetWithDerivatives

// Returns 3
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Set the Point on which a solution has to be found
Set(P: gp_Pnt): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Blend_DecrochStatus: typeof Blend_DecrochStatus[keyof typeof Blend_DecrochStatus]

// Deferred class for a function used to compute a blending surface between two surfaces, using a guide line
Blend_FuncInv: declare class Blend_FuncInv extends math_FunctionSetWithDerivatives

// Returns 4
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the CurveOnSurface on which a solution has to be found
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 4 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 4 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Deferred class for a function used to compute a blending surface between two surfaces, using a guide line
Blend_Function: declare class Blend_Function extends Blend_AppFunction

// Returns 4
NbVariables(): number;

// Returns the point on the first support
Pnt1(): gp_Pnt;

// Returns the point on the second support
Pnt2(): gp_Pnt;

// Returns the point on the first surface, at parameter Sol(1),Sol(2) (Sol is the vector used in the call of IsSolution
PointOnS1(): gp_Pnt;

// Returns the point on the second surface, at parameter Sol(3),Sol(4) (Sol is the vector used in the call of IsSolution
PointOnS2(): gp_Pnt;

// Returns True when it is not possible to compute the tangent vectors at PointOnS1 and/or PointOnS2
IsTangencyPoint(): boolean;

// Returns the tangent vector at PointOnS1, in 3d space
TangentOnS1(): gp_Vec;

// Returns the tangent vector at PointOnS1, in the parametric space of the first surface
Tangent2dOnS1(): gp_Vec2d;

// Returns the tangent vector at PointOnS2, in 3d space
TangentOnS2(): gp_Vec;

// Returns the tangent vector at PointOnS2, in the parametric space of the second surface
Tangent2dOnS2(): gp_Vec2d;

// Returns the tangent vector at the section, at the beginning and the end of the section, and returns the normal (of the surfaces) at these points
Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;
// TgFirst: Mutated in place
// TgLast: Mutated in place
// NormFirst: Mutated in place
// NormLast: Mutated in place

TwistOnS1(): boolean;

TwistOnS2(): boolean;

// Used for the first and last section The method returns true if the derivatives are computed, otherwise it returns false
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
