# libcascade — Bisector

11 top-level symbols. Signatures are verbatim typescript.

// This package provides the bisecting line between two geometric elements
Bisector: declare class Bisector

constructor

static IsConvex(Cu: Geom2d_Curve, Sign: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Bisec provides the bisecting line between two elements This line is trimmed by a point
Bisector_Bisec: declare class Bisector_Bisec

constructor

// Performs the bisecting line between the curve <Cu1> and the point <Pnt>
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;

// Returns the Curve of <me>
Value(): Geom2d_TrimmedCurve;

// Returns the Curve of <me>
ChangeValue(): Geom2d_TrimmedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides the bisecting line between two geometric elements.The elements are Circles,Lines or Points
Bisector_BisecAna: declare class Bisector_BisecAna extends Bisector_Curve

constructor

// Performs the bisecting line between the curve <Cu1> and the point <Pnt>
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;

Init(bisector: Geom2d_TrimmedCurve): void;

IsExtendAtStart(): boolean;

IsExtendAtEnd(): boolean;

// Trim <me> by a domain defined by the curve <Cu>
SetTrim(Cu: Geom2d_Curve): void;
SetTrim(uf: number, ul: number): void;
SetTrim(Cu: Geom2d_Curve): void;
SetTrim(uf: number, ul: number): void;

// Changes the direction of parametrization of <me>
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this curve
ReversedParameter(U: number): number;

// Returns the order of continuity of the curve
IsCN(N: number): boolean;

Copy(): Geom2d_Geometry;

// Transformation of a geometric object
Transform(T: gp_Trsf2d): void;

// Returns the value of the first parameter
FirstParameter(): number;

// Value of the last parameter
LastParameter(): number;

// Returns true if the curve is closed
IsClosed(): boolean;

// Returns true if the parameter of the curve is periodic
IsPeriodic(): boolean;

// It is the global continuity of the curve
Continuity(): GeomAbs_Shape;

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

Geom2dCurve(): Geom2d_Curve;

Parameter(P: gp_Pnt2d): number;

ParameterOfStartPoint(): number;

ParameterOfEndPoint(): number;

// If necessary, breaks the curve in intervals of continuity <C1>
NbIntervals(): number;

// Returns the first parameter of the current interval
IntervalFirst(Index: number): number;

// Returns the last parameter of the current interval
IntervalLast(Index: number): number;

Dump(Deep?: number, Offset?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Construct the bisector between two curves
Bisector_BisecCC: declare class Bisector_BisecCC extends Bisector_Curve

constructor

// Computes the bisector between the curves <Cu1> and <Cu2>
Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, Side1: number, Side2: number, Origin: gp_Pnt2d, DistMax?: number): void;

IsExtendAtStart(): boolean;

IsExtendAtEnd(): boolean;

// Changes the direction of parametrization of <me>
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this curve
ReversedParameter(U: number): number;

// Returns the order of continuity of the curve
IsCN(N: number): boolean;

// The parameter on <me> is linked to the parameter on the first curve
ChangeGuide(): Bisector_BisecCC;

Copy(): Geom2d_Geometry;

// Transformation of a geometric object
Transform(T: gp_Trsf2d): void;

// Returns the value of the first parameter
FirstParameter(): number;

// Value of the last parameter
LastParameter(): number;

// It is the global continuity of the curve
Continuity(): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity <C1>
NbIntervals(): number;

// Returns the first parameter of the current interval
IntervalFirst(Index: number): number;

// Returns the last parameter of the current interval
IntervalLast(Index: number): number;

IntervalContinuity(): GeomAbs_Shape;

// Returns true if the curve is closed
IsClosed(): boolean;

// Returns true if the parameter of the curve is periodic
IsPeriodic(): boolean;

// Returns the point of parameter U
ValueAndDist(U: number, U1?: number, U2?: number, Distance?: number): { returnValue: gp_Pnt2d; U1: number; U2: number; Distance: number; [Symbol.dispose](): void };

// Returns the point of parameter U
ValueByInt(U: number, U1?: number, U2?: number, Distance?: number): { returnValue: gp_Pnt2d; U1: number; U2: number; Distance: number; [Symbol.dispose](): void };

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

IsEmpty(): boolean;

// Returns the parameter on the curve1 of the projection of the point of parameter U on <me>
LinkBisCurve(U: number): number;

// Returns the reciproque of LinkBisCurve
LinkCurveBis(U: number): number;

Parameter(P: gp_Pnt2d): number;

Curve(IndCurve: number): Geom2d_Curve;

Polygon(): Bisector_PolyBis;

Dump(Deep?: number, Offset?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides the bisector between a point and a curve
Bisector_BisecPC: declare class Bisector_BisecPC extends Bisector_Curve

constructor

// Construct the bisector between the point
Perform(Cu: Geom2d_Curve, P: gp_Pnt2d, Side: number, DistMax?: number): void;

// Returns True if the bisector is extended at start
IsExtendAtStart(): boolean;

// Returns True if the bisector is extended at end
IsExtendAtEnd(): boolean;

// Changes the direction of parametrization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

Copy(): Geom2d_Geometry;

// Transformation of a geometric object
Transform(T: gp_Trsf2d): void;

// Returns the order of continuity of the curve
IsCN(N: number): boolean;

// Value of the first parameter
FirstParameter(): number;

// Value of the last parameter
LastParameter(): number;

// It is the global continuity of the curve
Continuity(): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity <C1>
NbIntervals(): number;

// Returns the first parameter of the current interval
IntervalFirst(Index: number): number;

// Returns the last parameter of the current interval
IntervalLast(Index: number): number;

IntervalContinuity(): GeomAbs_Shape;

// Returns true if the curve is closed
IsClosed(): boolean;

// Returns true if the parameter of the curve is periodic
IsPeriodic(): boolean;

// Returns the distance between the point of parameter U on <me> and my point or my curve
Distance(U: number): number;

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

Dump(Deep?: number, Offset?: number): void;

// Returns the parameter on the curve1 of the projection of the point of parameter U on <me>
LinkBisCurve(U: number): number;

// Returns the reciproque of LinkBisCurve
LinkCurveBis(U: number): number;

// Returns the parameter on <me> corresponding to
Parameter(P: gp_Pnt2d): number;

// Returns <True> if the bisector is empty
IsEmpty(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Bisector_Curve: declare class Bisector_Curve extends Geom2d_Curve

Parameter(P: gp_Pnt2d): number;

IsExtendAtStart(): boolean;

IsExtendAtEnd(): boolean;

// If necessary, breaks the curve in intervals of continuity <C1>
NbIntervals(): number;

// Returns the first parameter of the current interval
IntervalFirst(Index: number): number;

// Returns the last parameter of the current interval
IntervalLast(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// H(v) = (T1.P2(v) - P1) _ ||T(v)|| - 2 2 (T(v).P2(v) - P1) _ ||T1||
Bisector_FunctionH: declare class Bisector_FunctionH extends math_FunctionWithDerivative

constructor

// Computes the values of the Functions for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Returns the values of the functions and the derivatives for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// 2 2 F(u) = (PC(u) - PBis1(u)) + (PC(u) - PBis2(u))
Bisector_FunctionInter: declare class Bisector_FunctionInter extends math_FunctionWithDerivative

constructor

Perform(C: Geom2d_Curve, Bis1: Bisector_Curve, Bis2: Bisector_Curve): void;

// Computes the values of the Functions for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Returns the values of the functions and the derivatives for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Intersection between two <Bisec> from {@link Bisector`Bisector`}
Bisector_Inter: declare class Bisector_Inter extends IntRes2d_Intersection

constructor

// Intersection between 2 curves
Perform(C1: Bisector_Bisec, D1: IntRes2d_Domain, C2: Bisector_Bisec, D2: IntRes2d_Domain, TolConf: number, Tol: number, ComunElement: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Bisector_PointOnBis: declare class Bisector_PointOnBis

constructor

ParamOnC1(Param: number): void;
ParamOnC1(): number;
ParamOnC1(Param: number): void;
ParamOnC1(): number;

ParamOnC2(Param: number): void;
ParamOnC2(): number;
ParamOnC2(Param: number): void;
ParamOnC2(): number;

ParamOnBis(Param: number): void;
ParamOnBis(): number;
ParamOnBis(Param: number): void;
ParamOnBis(): number;

Distance(Distance: number): void;
Distance(): number;
Distance(Distance: number): void;
Distance(): number;

IsInfinite(Infinite: boolean): void;
IsInfinite(): boolean;
IsInfinite(Infinite: boolean): void;
IsInfinite(): boolean;

Point(P: gp_Pnt2d): void;
Point(): gp_Pnt2d;
Point(P: gp_Pnt2d): void;
Point(): gp_Pnt2d;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Polygon of PointOnBis
Bisector_PolyBis: declare class Bisector_PolyBis

constructor

Append(Point: Bisector_PointOnBis): void;

Length(): number;

IsEmpty(): boolean;

Value(Index: number): Bisector_PointOnBis;

First(): Bisector_PointOnBis;

Last(): Bisector_PointOnBis;

Interval(U: number): number;

Transform(T: gp_Trsf2d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
