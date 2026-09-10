# libcascade — Blend (2)

5 top-level symbols. Signatures are verbatim typescript.

Blend_Point: declare class Blend_Point

constructor

// Creates a point on two curves
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, PC1: number, PC2: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number): void;
SetValue(Pts: gp_Pnt, Ptc: gp_Pnt, Param: number, U: number, V: number, W: number, Tgs: gp_Vec, Tgc: gp_Vec, Tg2d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;
SetValue(Pt1: gp_Pnt, Pt2: gp_Pnt, Param: number, U1: number, V1: number, U2: number, V2: number, PC1: number, PC2: number, Tg1: gp_Vec, Tg2: gp_Vec, Tg12d: gp_Vec2d, Tg22d: gp_Vec2d): void;

// Changes parameter on existing point
SetParameter(Param: number): void;

Parameter(): number;

// Returns true if it was not possible to compute the tangent vectors at PointOnS1 and/or PointOnS2
IsTangencyPoint(): boolean;

PointOnS1(): gp_Pnt;

PointOnS2(): gp_Pnt;

ParametersOnS1(U?: number, V?: number): { U: number; V: number };

ParametersOnS2(U?: number, V?: number): { U: number; V: number };

TangentOnS1(): gp_Vec;

TangentOnS2(): gp_Vec;

Tangent2dOnS1(): gp_Vec2d;

Tangent2dOnS2(): gp_Vec2d;

PointOnS(): gp_Pnt;

PointOnC(): gp_Pnt;

ParametersOnS(U?: number, V?: number): { U: number; V: number };

ParameterOnC(): number;

TangentOnS(): gp_Vec;

TangentOnC(): gp_Vec;

Tangent2d(): gp_Vec2d;

PointOnC1(): gp_Pnt;

PointOnC2(): gp_Pnt;

ParameterOnC1(): number;

ParameterOnC2(): number;

TangentOnC1(): gp_Vec;

TangentOnC2(): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Deferred class for a function used to compute a blending surface between a surface and a pcurve on an other Surface, using a guide line
Blend_RstRstFunction: declare class Blend_RstRstFunction extends Blend_AppFunction

// Returns 2 (default value)
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

// Returns in the vector Tolerance the parametric tolerance for each variable
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each variables
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
PointOnRst1(): gp_Pnt;

// Returns the point on the curve
PointOnRst2(): gp_Pnt;

// Returns U,V coordinates of the point on the surface
Pnt2dOnRst1(): gp_Pnt2d;

// Returns U,V coordinates of the point on the curve on surface
Pnt2dOnRst2(): gp_Pnt2d;

// Returns parameter of the point on the curve
ParameterOnRst1(): number;

// Returns parameter of the point on the curve
ParameterOnRst2(): number;

// Returns True when it is not possible to compute the tangent vectors at PointOnS and/or PointOnRst
IsTangencyPoint(): boolean;

// Returns the tangent vector at PointOnS, in 3d space
TangentOnRst1(): gp_Vec;

// Returns the tangent vector at PointOnS, in the parametric space of the first surface
Tangent2dOnRst1(): gp_Vec2d;

// Returns the tangent vector at PointOnC, in 3d space
TangentOnRst2(): gp_Vec;

// Returns the tangent vector at PointOnRst, in the parametric space of the second surface
Tangent2dOnRst2(): gp_Vec2d;

// Enables to implement a criterion of decrochage specific to the function
Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;
// NRst1: Mutated in place
// TgRst1: Mutated in place
// NRst2: Mutated in place
// TgRst2: Mutated in place

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
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Blend_Status: typeof Blend_Status[keyof typeof Blend_Status]

// Deferred class for a function used to compute a blending surface between a surface and a curve, using a guide line
Blend_SurfCurvFuncInv: declare class Blend_SurfCurvFuncInv extends math_FunctionSetWithDerivatives

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
Set(Rst: Adaptor2d_Curve2d): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Deferred class for a function used to compute a blending surface between a surface and a curve, using a guide line
Blend_SurfPointFuncInv: declare class Blend_SurfPointFuncInv extends math_FunctionSetWithDerivatives

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
