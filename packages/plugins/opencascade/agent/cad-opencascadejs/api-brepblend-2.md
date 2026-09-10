# libcascade — BRepBlend (2)

7 top-level symbols. Signatures are verbatim typescript.

// Definition of an intersection point between a line and a restriction on a surface
BRepBlend_PointOnRst: declare class BRepBlend_PointOnRst

constructor

// Sets the values of a point which is on the arc A, at parameter Param
SetArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

// Returns the arc of restriction containing the vertex
Arc(): Adaptor2d_Curve2d;

// Returns the transition of the point on the line on surface
TransitionOnLine(): IntSurf_Transition;

// Returns the transition of the point on the arc returned by `Arc()`
TransitionOnArc(): IntSurf_Transition;

// Returns the parameter of the point on the arc returned by the method `Arc()`
ParameterOnArc(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Copy of CSConstRad with a pcurve on surface as support
BRepBlend_RstRstConstRad: declare class BRepBlend_RstRstConstRad extends Blend_RstRstFunction

constructor

// Returns 2
NbVariables(): number;

// Returns 2
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
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;

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

// Allows implementing a specific termination criterion for the function
Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;
// NRst1: Mutated in place
// TgRst1: Mutated in place
// NRst2: Mutated in place
// TgRst2: Mutated in place

// Give the center of circle define by PtRst1, PtRst2 and radius ray
CenterCircleRst1Rst2(PtRst1: gp_Pnt, PtRst2: gp_Pnt, np: gp_Vec, Center: gp_Pnt, VdMed: gp_Vec): boolean;
// Center: Mutated in place
// VdMed: Mutated in place

// Used for the first and last section
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

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

// Function to approximate by AppSurface for Edge/Edge and evolutif radius
BRepBlend_RstRstEvolRad: declare class BRepBlend_RstRstEvolRad extends Blend_RstRstFunction

constructor

// Returns 2
NbVariables(): number;

// Returns 2
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(First: number, Last: number): void;
Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;

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

// Enables implementation of a criterion of decrochage specific to the function
Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;
// NRst1: Mutated in place
// TgRst1: Mutated in place
// NRst2: Mutated in place
// TgRst2: Mutated in place

// Gives the center of circle defined by PtRst1, PtRst2 and radius ray
CenterCircleRst1Rst2(PtRst1: gp_Pnt, PtRst2: gp_Pnt, np: gp_Vec, Center: gp_Pnt, VdMed: gp_Vec): boolean;
// Center: Mutated in place
// VdMed: Mutated in place

// Used for the first and last section
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

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

// This class processes the data resulting from Blend_CSWalking but it takes in consideration the Surface supporting the curve to detect the breakpoint
BRepBlend_RstRstLineBuilder: declare class BRepBlend_RstRstLineBuilder

constructor

Perform(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

PerformFirstSection(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pdep: number, Pmax: number, Soldep: math_VectorBase_double, Tol3d: number, TolGuide: number, RecRst1: boolean, RecP1: boolean, RecRst2: boolean, RecP2: boolean, Psol: number, ParSol: math_VectorBase_double): { returnValue: boolean; Psol: number };

Complete(Func: Blend_RstRstFunction, Finv1: Blend_SurfCurvFuncInv, FinvP1: Blend_CurvPointFuncInv, Finv2: Blend_SurfCurvFuncInv, FinvP2: Blend_CurvPointFuncInv, Pmin: number): boolean;

IsDone(): boolean;

Line(): BRepBlend_Line;

Decroch1Start(): boolean;

Decroch1End(): boolean;

Decroch2Start(): boolean;

Decroch2End(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function of reframing between a restriction surface of the surface and a curve
BRepBlend_SurfCurvConstRadInv: declare class BRepBlend_SurfCurvConstRadInv extends Blend_SurfCurvFuncInv

constructor

// Set the restriction on which a solution has to be found
Set(R: number, Choix: number): void;
Set(Rst: Adaptor2d_Curve2d): void;
Set(R: number, Choix: number): void;
Set(Rst: Adaptor2d_Curve2d): void;

// returns 3
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function of reframing between a surface restriction of the surface and a curve
BRepBlend_SurfCurvEvolRadInv: declare class BRepBlend_SurfCurvEvolRadInv extends Blend_SurfCurvFuncInv

constructor

// Set the restriction on which a solution has to be found
Set(Choix: number): void;
Set(Rst: Adaptor2d_Curve2d): void;
Set(Choix: number): void;
Set(Rst: Adaptor2d_Curve2d): void;

// returns 3
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function of reframing between a point and a surface
BRepBlend_SurfPointConstRadInv: declare class BRepBlend_SurfPointConstRadInv extends Blend_SurfPointFuncInv

constructor

// Set the Point on which a solution has to be found
Set(R: number, Choix: number): void;
Set(P: gp_Pnt): void;
Set(R: number, Choix: number): void;
Set(P: gp_Pnt): void;

// returns 3
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
