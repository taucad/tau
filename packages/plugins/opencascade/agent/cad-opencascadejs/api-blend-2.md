# libcascade — Blend (2)

5 top-level symbols. Signatures are verbatim typescript.

Blend_RstRstFunction: declare class Blend_RstRstFunction extends Blend_AppFunction

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(First: number, Last: number): void;

GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

GetMinimalDistance(): number;

Pnt1(): gp_Pnt;

Pnt2(): gp_Pnt;

PointOnRst1(): gp_Pnt;

PointOnRst2(): gp_Pnt;

Pnt2dOnRst1(): gp_Pnt2d;

Pnt2dOnRst2(): gp_Pnt2d;

ParameterOnRst1(): number;

ParameterOnRst2(): number;

IsTangencyPoint(): boolean;

TangentOnRst1(): gp_Vec;

Tangent2dOnRst1(): gp_Vec2d;

TangentOnRst2(): gp_Vec;

Tangent2dOnRst2(): gp_Vec2d;

Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;

IsRational(): boolean;

GetSectionSize(): number;

GetMinimalWeight(Weigths: NCollection_Array1_double): void;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

Knots(TKnots: NCollection_Array1_double): void;

Mults(TMults: NCollection_Array1_int): void;

Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

delete(): void;

[Symbol.dispose](): void;

Blend_Status: typeof Blend_Status[keyof typeof Blend_Status]

Blend_SurfCurvFuncInv: declare class Blend_SurfCurvFuncInv extends math_FunctionSetWithDerivatives

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Set(Rst: Adaptor2d_Curve2d): void;

GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

delete(): void;

[Symbol.dispose](): void;

Blend_SurfPointFuncInv: declare class Blend_SurfPointFuncInv extends math_FunctionSetWithDerivatives

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Set(P: gp_Pnt): void;

GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

delete(): void;

[Symbol.dispose](): void;

Blend_SurfRstFunction: declare class Blend_SurfRstFunction extends Blend_AppFunction

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Set(Param: number): void;
Set(First: number, Last: number): void;
Set(Param: number): void;
Set(First: number, Last: number): void;

GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

GetMinimalDistance(): number;

Pnt1(): gp_Pnt;

Pnt2(): gp_Pnt;

PointOnS(): gp_Pnt;

PointOnRst(): gp_Pnt;

Pnt2dOnS(): gp_Pnt2d;

Pnt2dOnRst(): gp_Pnt2d;

ParameterOnRst(): number;

IsTangencyPoint(): boolean;

TangentOnS(): gp_Vec;

Tangent2dOnS(): gp_Vec2d;

TangentOnRst(): gp_Vec;

Tangent2dOnRst(): gp_Vec2d;

Decroch(Sol: math_VectorBase_double, NS: gp_Vec, TgS: gp_Vec): boolean;

IsRational(): boolean;

GetSectionSize(): number;

GetMinimalWeight(Weigths: NCollection_Array1_double): void;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

Knots(TKnots: NCollection_Array1_double): void;

Mults(TMults: NCollection_Array1_int): void;

Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

delete(): void;

[Symbol.dispose](): void;
