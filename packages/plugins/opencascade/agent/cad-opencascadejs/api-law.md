# libcascade — Law

10 top-level symbols. Signatures are verbatim typescript.

// Multiple services concerning 1d functions
Law: declare class Law

constructor

// This algorithm searches the knot values corresponding to the splitting of a given B-spline law into several arcs with the same continuity
static MixBnd(Lin: Law_Linear): Law_BSpFunc;
static MixBnd(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Lin: Law_Linear): NCollection_HArray1_double;
static MixBnd(Lin: Law_Linear): Law_BSpFunc;
static MixBnd(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Lin: Law_Linear): NCollection_HArray1_double;

// Builds the poles of the 1d bspline that is null on the right side of Knots(Index) (on the left if NulOnTheRight is false) and that is like a t\*(1-t)(1-t) curve on the left side of Knots(Index) (on the right if NulOnTheRight is false)
static MixTgt(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NulOnTheRight: boolean, Index: number): NCollection_HArray1_double;

// Computes a 1d curve to reparametrize a curve
static Reparametrize(Curve: Adaptor3d_Curve, First: number, Last: number, HasDF: boolean, HasDL: boolean, DFirst: number, DLast: number, Rev: boolean, NbPoints: number): Law_BSpline;

// Computes a 1d curve to scale a field of tangency
static Scale(First: number, Last: number, HasF: boolean, HasL: boolean, VFirst: number, VLast: number): Law_BSpline;

static ScaleCub(First: number, Last: number, HasF: boolean, HasL: boolean, VFirst: number, VLast: number): Law_BSpline;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Law`Law`} Function based on a BSpline curve 1d
Law_BSpFunc: declare class Law_BSpFunc extends Law_Function

constructor

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the value of the function at the point of parameter X
Value(X: number): number;

// Returns the value F and the first derivative D of the function at the point of parameter X
D1(X: number, F: number, D: number): { F: number; D: number };

// Returns the value, first and second derivatives at parameter X
D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

// Returns a law equivalent of <me> between parameters <First> and <Last>
Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

// Returns the parametric bounds of the function
Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

Curve(): Law_BSpline;

SetCurve(C: Law_BSpline): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of the 1D B_spline curve
Law_BSpline: declare class Law_BSpline extends Standard_Transient

constructor

// Increase the degree to <Degree>
IncreaseDegree(Degree: number): void;

// Increases the multiplicity of the knot <Index> to <M>
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;

// Increment the multiplicities of the knots in [I1,I2] by <M>
IncrementMultiplicity(I1: number, I2: number, M: number): void;

// Inserts a knot value in the sequence of knots
InsertKnot(U: number, M?: number, ParametricTolerance?: number, Add?: boolean): void;

// Inserts a set of knots values in the sequence of knots
InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

// Decrement the knots multiplicity to <M>
RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

// Changes the direction of parametrization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Segments the curve between U1 and U2
Segment(U1: number, U2: number): void;

// Changes the knot of range Index
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;

// Changes all the knots of the curve The multiplicity of the knots are not modified
SetKnots(K: NCollection_Array1_double): void;

// returns the parameter normalized within the period if the curve is periodic
PeriodicNormalization(U?: number): { U: number };

// Makes a closed B-spline into a periodic curve
SetPeriodic(): void;

// Set the origin of a periodic curve at Knot(index) KnotVector and poles are modified
SetOrigin(Index: number): void;

// Makes a non periodic curve
SetNotPeriodic(): void;

// Substitutes the Pole of range Index with P
SetPole(Index: number, P: number): void;
SetPole(Index: number, P: number, Weight: number): void;
SetPole(Index: number, P: number): void;
SetPole(Index: number, P: number, Weight: number): void;

// Changes the weight for the pole of range Index
SetWeight(Index: number, Weight: number): void;

// Returns the continuity of the curve, the curve is at least C0
IsCN(N: number): boolean;

// Returns true if the distance between the first point and the last point of the curve is lower or equal to Resolution from package gp
IsClosed(): boolean;

// Returns True if the curve is periodic
IsPeriodic(): boolean;

// Returns True if the weights are not identical
IsRational(): boolean;

// Returns the global continuity of the curve
Continuity(): GeomAbs_Shape;

// Computation of value and derivatives
Degree(): number;

Value(U: number): number;

D0(U: number, P?: number): { P: number };

D1(U: number, P?: number, V1?: number): { P: number; V1: number };

D2(U: number, P?: number, V1?: number, V2?: number): { P: number; V1: number; V2: number };

D3(U: number, P?: number, V1?: number, V2?: number, V3?: number): { P: number; V1: number; V2: number; V3: number };

// The following functions computes the point of parameter U and the derivatives at this point on the B-spline curve arc defined between the knot FromK1 and the knot ToK2
DN(U: number, N: number): number;

LocalValue(U: number, FromK1: number, ToK2: number): number;

LocalD0(U: number, FromK1: number, ToK2: number, P?: number): { P: number };

LocalD1(U: number, FromK1: number, ToK2: number, P?: number, V1?: number): { P: number; V1: number };

LocalD2(U: number, FromK1: number, ToK2: number, P?: number, V1?: number, V2?: number): { P: number; V1: number; V2: number };

LocalD3(U: number, FromK1: number, ToK2: number, P?: number, V1?: number, V2?: number, V3?: number): { P: number; V1: number; V2: number; V3: number };

LocalDN(U: number, FromK1: number, ToK2: number, N: number): number;

// Returns the last point of the curve
EndPoint(): number;

// For a B-spline curve the first parameter (which gives the start point of the curve) is a knot value but if the multiplicity of the first knot index is lower than Degree + 1 it is not the first knot of the curve
FirstUKnotIndex(): number;

// Computes the parametric value of the start point of the curve
FirstParameter(): number;

// Returns the knot of range Index
Knot(Index: number): number;

// returns the knot values of the B-spline curve
Knots(K: NCollection_Array1_double): void;
// K: Mutated in place

// Returns the knots sequence
KnotSequence(K: NCollection_Array1_double): void;
// K: Mutated in place

// Returns NonUniform or Uniform or QuasiUniform or PiecewiseBezier
KnotDistribution(): GeomAbs_BSplKnotDistribution;

// For a BSpline curve the last parameter (which gives the end point of the curve) is a knot value but if the multiplicity of the last knot index is lower than Degree + 1 it is not the last knot of the curve
LastUKnotIndex(): number;

// Computes the parametric value of the end point of the curve
LastParameter(): number;

// Locates the parametric value U in the sequence of knots
LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

// Returns the multiplicity of the knots of range Index
Multiplicity(Index: number): number;

// Returns the multiplicity of the knots of the curve
Multiplicities(M: NCollection_Array1_int): void;
// M: Mutated in place

// Returns the number of knots
NbKnots(): number;

// Returns the number of poles
NbPoles(): number;

// Returns the pole of range Index
Pole(Index: number): number;

// Returns the poles of the B-spline curve;
Poles(P: NCollection_Array1_double): void;
// P: Mutated in place

// Returns the start point of the curve
StartPoint(): number;

// Returns the weight of the pole of range Index
Weight(Index: number): number;

// Returns the weights of the B-spline curve;
Weights(W: NCollection_Array1_double): void;
// W: Mutated in place

// Returns the value of the maximum degree of the normalized B-spline basis functions in this package
static MaxDegree(): number;

// Changes the value of the {@link Law`Law`} at parameter U to NewValue
MovePointAndTangent(U: number, NewValue: number, Derivative: number, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

// given Tolerance3D returns UTolerance such that if f(t) is the curve we have | t1 - t0| < Utolerance ===> |f(t1) - f(t0)| < Tolerance3D
Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

Copy(): Law_BSpline;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// For a B-spline curve the discontinuities are localised at the knot values and between two knots values the B-spline is infinitely continuously differentiable
Law_BSplineKnotSplitting: declare class Law_BSplineKnotSplitting

constructor

// Returns the number of knots corresponding to the splitting
NbSplits(): number;

// Returns the indexes of the BSpline curve knots corresponding to the splitting
Splitting(SplitValues: NCollection_Array1_int): void;
// SplitValues: Mutated in place

// Returns the index of the knot corresponding to the splitting of range Index
SplitValue(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Loi composite constituee d une liste de lois de ranges consecutifs
Law_Composite: declare class Law_Composite extends Law_Function

constructor

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the value at parameter X
Value(X: number): number;

// Returns the value and the first derivative at parameter X
D1(X: number, F: number, D: number): { F: number; D: number };

// Returns the value, first and second derivatives at parameter X
D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

// Returns a law equivalent of <me> between parameters <First> and <Last>
Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

// Returns the parametric bounds of the function
Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

// Returns the elementary function of the composite used to compute at parameter W
ChangeElementaryLaw(W: number): Law_Function;

ChangeLaws(): NCollection_List_handle_Law_Function;

IsPeriodic(): boolean;

SetPeriodic(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Loi constante
Law_Constant: declare class Law_Constant extends Law_Function

constructor

// Set the radius and the range of the constant {@link Law`Law`}
Set(Radius: number, PFirst: number, PLast: number): void;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns 1
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the value at parameter X
Value(X: number): number;

// Returns the value and the first derivative at parameter X
D1(X: number, F: number, D: number): { F: number; D: number };

// Returns the value, first and second derivatives at parameter X
D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

// Returns a law equivalent of <me> between parameters <First> and <Last>
Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

// Returns the parametric bounds of the function
Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for evolution laws
Law_Function: declare class Law_Function extends Standard_Transient

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the value of the function at the point of parameter X
Value(X: number): number;

// Returns the value F and the first derivative D of the function at the point of parameter X
D1(X: number, F: number, D: number): { F: number; D: number };

// Returns the value, first and second derivatives at parameter X
D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

// Returns a law equivalent of <me> between parameters <First> and <Last>
Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

// Returns the parametric bounds of the function
Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides an evolution law that interpolates a set of parameter and value pairs (wi, radi)
Law_Interpol: declare class Law_Interpol extends Law_BSpFunc

constructor

// Defines this evolution law by interpolating the set of 2D points ParAndRad
Set(ParAndRad: NCollection_Array1_gp_Pnt2d, Periodic: boolean): void;
Set(ParAndRad: NCollection_Array1_gp_Pnt2d, Dd: number, Df: number, Periodic: boolean): void;
Set(ParAndRad: NCollection_Array1_gp_Pnt2d, Periodic: boolean): void;
Set(ParAndRad: NCollection_Array1_gp_Pnt2d, Dd: number, Df: number, Periodic: boolean): void;

SetInRelative(ParAndRad: NCollection_Array1_gp_Pnt2d, Ud: number, Uf: number, Periodic: boolean): void;
SetInRelative(ParAndRad: NCollection_Array1_gp_Pnt2d, Ud: number, Uf: number, Dd: number, Df: number, Periodic: boolean): void;
SetInRelative(ParAndRad: NCollection_Array1_gp_Pnt2d, Ud: number, Uf: number, Periodic: boolean): void;
SetInRelative(ParAndRad: NCollection_Array1_gp_Pnt2d, Ud: number, Uf: number, Dd: number, Df: number, Periodic: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to interpolate a BsplineCurve passing through an array of points, with a C2 Continuity if tangency is not requested at the point
Law_Interpolate: declare class Law_Interpolate

constructor

// loads initial and final tangents if any
Load(InitialTangent: number, FinalTangent: number): void;
Load(Tangents: NCollection_Array1_double, TangentFlags: NCollection_HArray1_bool): void;
Load(InitialTangent: number, FinalTangent: number): void;
Load(Tangents: NCollection_Array1_double, TangentFlags: NCollection_HArray1_bool): void;

// Makes the interpolation
Perform(): void;

Curve(): Law_BSpline;

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an linear evolution law
Law_Linear: declare class Law_Linear extends Law_Function

constructor

// Defines this linear evolution law by assigning both
Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns 1
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the value of this function at the point of parameter X
Value(X: number): number;

// Returns the value F and the first derivative D of this function at the point of parameter X
D1(X: number, F: number, D: number): { F: number; D: number };

// Returns the value, first and second derivatives at parameter X
D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

// Returns a law equivalent of <me> between parameters <First> and <Last>
Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

// Returns the parametric bounds of the function
Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
