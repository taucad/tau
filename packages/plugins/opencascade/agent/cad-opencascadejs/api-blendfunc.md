# libcascade — BlendFunc

4 top-level symbols. Signatures are verbatim typescript.

// This package provides a set of generic functions, that can instantiated to compute blendings between two surfaces (Constant radius, Evolutive radius, Ruled surface)
BlendFunc: declare class BlendFunc

constructor

static GetMinimalWeights(SectShape: BlendFunc_SectionShape, TConv: Convert_ParameterisationType, AngleMin: number, AngleMax: number, Weigths: NCollection_Array1_double): void;

// Used to obtain the next level of continuity
static NextShape(S: GeomAbs_Shape): GeomAbs_Shape;

static ComputeNormal(Surf: Adaptor3d_Surface, p2d: gp_Pnt2d, Normal: gp_Vec): boolean;

static ComputeDNormal(Surf: Adaptor3d_Surface, p2d: gp_Pnt2d, Normal: gp_Vec, DNu: gp_Vec, DNv: gp_Vec): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BlendFunc_CSCircular: declare class BlendFunc_CSCircular extends Blend_CSFunction

constructor

// Returns 3 (default value)
NbVariables(): number;

// returns the number of equations of the function (3)
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

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

// Returns the tangent vector at the section, at the beginning and the end of the section, and returns the normal (of the surface) at these points
Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;
// TgS: Mutated in place
// NormS: Mutated in place

// Used for the first and last section
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

GetSection(Param: number, U: number, V: number, W: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

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

Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BlendFunc_CSConstRad: declare class BlendFunc_CSConstRad extends Blend_CSFunction

constructor

// returns the number of equations of the function (3)
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

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

// Returns the tangent vector at the section, at the beginning and the end of the section, and returns the normal (of the surface) at these points
Tangent(U: number, V: number, TgS: gp_Vec, NormS: gp_Vec): void;
// TgS: Mutated in place
// NormS: Mutated in place

// Used for the first and last section
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U: number, V: number, W: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

GetSection(Param: number, U: number, V: number, W: number, tabP: NCollection_Array1_gp_Pnt, tabV: NCollection_Array1_gp_Vec): boolean;

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

Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BlendFunc_ChAsym: declare class BlendFunc_ChAsym extends Blend_Function

constructor

// returns the number of equations of the function
NbEquations(): number;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Dist1: number, Angle: number, Choix: number): void;
Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Dist1: number, Angle: number, Choix: number): void;
Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Dist1: number, Angle: number, Choix: number): void;

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

// computes the values <F> of the derivatives for the variable <X> between DegF and DegL
ComputeValues(X: math_VectorBase_double, DegF: number, DegL: number): boolean;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

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

TwistOnS1(): boolean;

TwistOnS2(): boolean;

// Returns the tangent vector at the section, at the beginning and the end of the section, and returns the normal (of the surfaces) at these points
Tangent(U1: number, V1: number, U2: number, V2: number, TgFirst: gp_Vec, TgLast: gp_Vec, NormFirst: gp_Vec, NormLast: gp_Vec): void;
// TgFirst: Mutated in place
// TgLast: Mutated in place
// NormFirst: Mutated in place
// NormLast: Mutated in place

// Utile pour une visu rapide et approximative de la surface
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Lin): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
// C: Mutated in place

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

Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
