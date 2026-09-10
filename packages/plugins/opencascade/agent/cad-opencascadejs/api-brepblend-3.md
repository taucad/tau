# libcascade — BRepBlend (3)

4 top-level symbols. Signatures are verbatim typescript.

// Function of reframing between a point and a surface
BRepBlend_SurfPointEvolRadInv: declare class BRepBlend_SurfPointEvolRadInv extends Blend_SurfPointFuncInv

constructor

// Set the Point on which a solution has to be found
Set(Choix: number): void;
Set(P: gp_Pnt): void;
Set(Choix: number): void;
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

// Copy of CSConstRad with pcurve on surface as support
BRepBlend_SurfRstConstRad: declare class BRepBlend_SurfRstConstRad extends Blend_SurfRstFunction

constructor

// Returns 3
NbVariables(): number;

// Returns 3
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
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;
Set(Param: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Radius: number, Choix: number): void;

// Returns in the vector Tolerance the parametric tolerance for each variable
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each variable
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Returns the minimal Distance between two extremities of calculated sections
GetMinimalDistance(): number;

// Returns the point on the surface
PointOnS(): gp_Pnt;

// Returns the point on the curve
PointOnRst(): gp_Pnt;

// Returns U,V coordinates of the point on the surface
Pnt2dOnS(): gp_Pnt2d;

// Returns U,V coordinates of the point on the curve on surface
Pnt2dOnRst(): gp_Pnt2d;

// Returns parameter of the point on the curve
ParameterOnRst(): number;

// Returns True when it is not possible to compute the tangent vectors at PointOnS and/or PointOnRst
IsTangencyPoint(): boolean;

// Returns the tangent vector at PointOnS, in 3d space
TangentOnS(): gp_Vec;

// Returns the tangent vector at PointOnS, in the parametric space of the first surface
Tangent2dOnS(): gp_Vec2d;

// Returns the tangent vector at PointOnC, in 3d space
TangentOnRst(): gp_Vec;

// Returns the tangent vector at PointOnRst, in the parametric space of the second surface
Tangent2dOnRst(): gp_Vec2d;

// Enables implementation of a criterion of decrochage specific to the function
Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;
// NS: Mutated in place
// TgS: Mutated in place

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

// Function to approximate by AppSurface for Edge/Face and evolutif radius
BRepBlend_SurfRstEvolRad: declare class BRepBlend_SurfRstEvolRad extends Blend_SurfRstFunction

constructor

// Returns 3
NbVariables(): number;

// Returns 3
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
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(Choix: number): void;
Set(TypeSection: BlendFunc_SectionShape): void;
Set(SurfRef: Adaptor3d_Surface, RstRef: Adaptor2d_Curve2d): void;
Set(First: number, Last: number): void;

// Returns in the vector Tolerance the parametric tolerance for each variable
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

// Returns in the vector InfBound the lowest values allowed for each variable
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Returns the minimal Distance between two extremities of calculated sections
GetMinimalDistance(): number;

// Returns the point on the surface
PointOnS(): gp_Pnt;

// Returns the point on the curve
PointOnRst(): gp_Pnt;

// Returns U,V coordinates of the point on the surface
Pnt2dOnS(): gp_Pnt2d;

// Returns U,V coordinates of the point on the curve on surface
Pnt2dOnRst(): gp_Pnt2d;

// Returns parameter of the point on the curve
ParameterOnRst(): number;

// Returns True when it is not possible to compute the tangent vectors at PointOnS and/or PointOnRst
IsTangencyPoint(): boolean;

// Returns the tangent vector at PointOnS, in 3d space
TangentOnS(): gp_Vec;

// Returns the tangent vector at PointOnS, in the parametric space of the first surface
Tangent2dOnS(): gp_Vec2d;

// Returns the tangent vector at PointOnC, in 3d space
TangentOnRst(): gp_Vec;

// Returns the tangent vector at PointOnRst, in the parametric space of the second surface
Tangent2dOnRst(): gp_Vec2d;

// Permet d'implementer un critere de decrochage specifique a la fonction
Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;
// NS: Mutated in place
// TgS: Mutated in place

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

// This class processes data resulting from Blend_CSWalking taking in consideration the Surface supporting the curve to detect the breakpoint
BRepBlend_SurfRstLineBuilder: declare class BRepBlend_SurfRstLineBuilder

constructor

Perform(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, Tol2d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

PerformFirstSection(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pdep: number, Pmax: number, Soldep: math_VectorBase_double, Tol3d: number, Tol2d: number, TolGuide: number, RecRst: boolean, RecP: boolean, RecS: boolean, Psol: number, ParSol: math_VectorBase_double): { returnValue: boolean; Psol: number };

Complete(Func: Blend_SurfRstFunction, Finv: Blend_FuncInv, FinvP: Blend_SurfPointFuncInv, FinvC: Blend_SurfCurvFuncInv, Pmin: number): boolean;

ArcToRecadre(Sol: math_VectorBase_double, PrevIndex: number, pt2d: gp_Pnt2d, lastpt2d: gp_Pnt2d, ponarc?: number): { returnValue: number; ponarc: number };

IsDone(): boolean;

Line(): BRepBlend_Line;

DecrochStart(): boolean;

DecrochEnd(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
