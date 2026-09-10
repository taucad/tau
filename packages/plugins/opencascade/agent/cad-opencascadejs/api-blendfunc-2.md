# libcascade — BlendFunc (2)

10 top-level symbols. Signatures are verbatim typescript.

BlendFunc_ChAsymInv: declare class BlendFunc_ChAsymInv extends Blend_FuncInv

constructor

// Sets the CurveOnSurface on which a solution has to be found
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(Dist1: number, Angle: number, Choix: number): void;
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(Dist1: number, Angle: number, Choix: number): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 4 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 4 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the derivatives for the variable <X> between DegF and DegL
ComputeValues(X: math_VectorBase_double, DegF: number, DegL: number): boolean;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for a function used to compute a chamfer with two constant distances on a surface's boundary
BlendFunc_ChamfInv: declare class BlendFunc_ChamfInv extends BlendFunc_GenChamfInv

constructor

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the CurveOnSurface on which a solution has to be found
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(Dist1: number, Dist2: number, Choix: number): void;
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(Dist1: number, Dist2: number, Choix: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for a function used to compute a "ordinary" chamfer
BlendFunc_Chamfer: declare class BlendFunc_Chamfer extends BlendFunc_GenChamfer

constructor

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(Dist1: number, Dist2: number, Choix: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(Dist1: number, Dist2: number, Choix: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(Dist1: number, Dist2: number, Choix: number): void;
Set(First: number, Last: number): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

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

// Returns the length of the maximum section
GetSectionSize(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BlendFunc_ConstRad: declare class BlendFunc_ConstRad extends Blend_Function

constructor

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

// Useful for a quick and approximate visualization of the surface area
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(Param: number, U1: number, V1: number, U2: number, V2: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
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

AxeRot(Prm: number): gp_Ax1;

Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BlendFunc_ConstRadInv: declare class BlendFunc_ConstRadInv extends Blend_FuncInv

constructor

// Sets the CurveOnSurface on which a solution has to be found
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(R: number, Choix: number): void;
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(R: number, Choix: number): void;

// Returns in the vector Tolerance the parametric tolerance for each of the 4 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 4 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for a function used to compute a symmetric chamfer with constant throat that is the height of isosceles triangle in section
BlendFunc_ConstThroat: declare class BlendFunc_ConstThroat extends BlendFunc_GenChamfer

constructor

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the value of the parameter along the guide line
Set(Param: number): void;
Set(aThroat: number, argNo1: number, Choix: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(aThroat: number, argNo1: number, Choix: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(aThroat: number, argNo1: number, Choix: number): void;
Set(First: number, Last: number): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

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

// Returns the length of the maximum section
GetSectionSize(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for a function used to compute a ConstThroat chamfer on a surface's boundary
BlendFunc_ConstThroatInv: declare class BlendFunc_ConstThroatInv extends BlendFunc_GenChamfInv

constructor

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Sets the CurveOnSurface on which a solution has to be found
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(Dist1: number, Dist2: number, Choix: number): void;
Set(OnFirst: boolean, COnSurf: Adaptor2d_Curve2d): void;
Set(Dist1: number, Dist2: number, Choix: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for a function used to compute a chamfer with constant throat
BlendFunc_ConstThroatWithPenetration: declare class BlendFunc_ConstThroatWithPenetration extends BlendFunc_ConstThroat

constructor

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Returns the tangent vector at PointOnS1, in 3d space
TangentOnS1(): gp_Vec;

// Returns the tangent vector at PointOnS1, in the parametric space of the first surface
Tangent2dOnS1(): gp_Vec2d;

// Returns the tangent vector at PointOnS2, in 3d space
TangentOnS2(): gp_Vec;

// Returns the tangent vector at PointOnS2, in the parametric space of the second surface
Tangent2dOnS2(): gp_Vec2d;

// Returns the tangent vector at the section, at the beginning and the end of the section, and returns the normal (of the surfaces) at these points
GetSectionSize(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for a function used to compute a ConstThroatWithPenetration chamfer on a surface's boundary
BlendFunc_ConstThroatWithPenetrationInv: declare class BlendFunc_ConstThroatWithPenetrationInv extends BlendFunc_ConstThroatInv

constructor

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This function calculates point (pts) on the curve of intersection between the normal to a curve (guide) in a chosen parameter and a surface (surf), so that pts was at a given distance from the guide
BlendFunc_Corde: declare class BlendFunc_Corde

constructor

SetParam(Param: number): void;

SetDist(Dist: number): void;

// computes the values <F> of the Function for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

PointOnS(): gp_Pnt;

// returns the point of parameter on CGuide
PointOnGuide(): gp_Pnt;

// returns the normal to CGuide at Ptgui
NPlan(): gp_Vec;

// Returns True when it is not possible to compute the tangent vectors at PointOnS
IsTangencyPoint(): boolean;

// Returns the tangent vector at PointOnS, in 3d space
TangentOnS(): gp_Vec;

// Returns the tangent vector at PointOnS, in the parametric space of the first surface
Tangent2dOnS(): gp_Vec2d;

// Derived of the function compared to the parameter of the guideline
DerFguide(Sol: math_VectorBase_double, DerF: gp_Vec2d): void;
// DerF: Mutated in place

// Returns False if Sol is not solution else returns True and updates the fields tgs and tg2d
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
