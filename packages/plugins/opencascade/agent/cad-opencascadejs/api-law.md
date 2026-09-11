# libcascade — Law

12 top-level symbols. Signatures are verbatim typescript.

Law: declare class Law

constructor

static MixBnd(Lin: Law_Linear): Law_BSpFunc;
static MixBnd(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Lin: Law_Linear): NCollection_HArray1_double;
static MixBnd(Lin: Law_Linear): Law_BSpFunc;
static MixBnd(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Lin: Law_Linear): NCollection_HArray1_double;

static MixTgt(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NulOnTheRight: boolean, Index: number): NCollection_HArray1_double;

static Reparametrize(Curve: Adaptor3d_Curve, First: number, Last: number, HasDF: boolean, HasDL: boolean, DFirst: number, DLast: number, Rev: boolean, NbPoints: number): Law_BSpline;

static Scale(First: number, Last: number, HasF: boolean, HasL: boolean, VFirst: number, VLast: number): Law_BSpline;

static ScaleCub(First: number, Last: number, HasF: boolean, HasL: boolean, VFirst: number, VLast: number): Law_BSpline;

delete(): void;

[Symbol.dispose](): void;

Law_BSpFunc: declare class Law_BSpFunc extends Law_Function

constructor

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Value(X: number): number;

D1(X: number, F: number, D: number): { F: number; D: number };

D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

Curve(): Law_BSpline;

SetCurve(C: Law_BSpline): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_BSpline: declare class Law_BSpline extends Standard_Transient

constructor

IncreaseDegree(Degree: number): void;

IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;

IncrementMultiplicity(I1: number, I2: number, M: number): void;

InsertKnot(U: number, M?: number, ParametricTolerance?: number, Add?: boolean): void;

InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

Reverse(): void;

ReversedParameter(U: number): number;

Segment(U1: number, U2: number): void;

SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;

SetKnots(K: NCollection_Array1_double): void;

PeriodicNormalization(U?: number): { U: number };

SetPeriodic(): void;

SetOrigin(Index: number): void;

SetNotPeriodic(): void;

SetPole(Index: number, P: number): void;
SetPole(Index: number, P: number, Weight: number): void;
SetPole(Index: number, P: number): void;
SetPole(Index: number, P: number, Weight: number): void;

SetWeight(Index: number, Weight: number): void;

IsCN(N: number): boolean;

IsClosed(): boolean;

IsPeriodic(): boolean;

IsRational(): boolean;

Continuity(): GeomAbs_Shape;

Degree(): number;

Value(U: number): number;

D0(U: number, P?: number): { P: number };

D1(U: number, P?: number, V1?: number): { P: number; V1: number };

D2(U: number, P?: number, V1?: number, V2?: number): { P: number; V1: number; V2: number };

D3(U: number, P?: number, V1?: number, V2?: number, V3?: number): { P: number; V1: number; V2: number; V3: number };

DN(U: number, N: number): number;

LocalValue(U: number, FromK1: number, ToK2: number): number;

LocalD0(U: number, FromK1: number, ToK2: number, P?: number): { P: number };

LocalD1(U: number, FromK1: number, ToK2: number, P?: number, V1?: number): { P: number; V1: number };

LocalD2(U: number, FromK1: number, ToK2: number, P?: number, V1?: number, V2?: number): { P: number; V1: number; V2: number };

LocalD3(U: number, FromK1: number, ToK2: number, P?: number, V1?: number, V2?: number, V3?: number): { P: number; V1: number; V2: number; V3: number };

LocalDN(U: number, FromK1: number, ToK2: number, N: number): number;

EndPoint(): number;

FirstUKnotIndex(): number;

FirstParameter(): number;

Knot(Index: number): number;

Knots(K: NCollection_Array1_double): void;

KnotSequence(K: NCollection_Array1_double): void;

KnotDistribution(): GeomAbs_BSplKnotDistribution;

LastUKnotIndex(): number;

LastParameter(): number;

LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

Multiplicity(Index: number): number;

Multiplicities(M: NCollection_Array1_int): void;

NbKnots(): number;

NbPoles(): number;

Pole(Index: number): number;

Poles(P: NCollection_Array1_double): void;

StartPoint(): number;

Weight(Index: number): number;

Weights(W: NCollection_Array1_double): void;

static MaxDegree(): number;

MovePointAndTangent(U: number, NewValue: number, Derivative: number, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

Copy(): Law_BSpline;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_BSplineKnotSplitting: declare class Law_BSplineKnotSplitting

constructor

NbSplits(): number;

Splitting(SplitValues: NCollection_Array1_int): void;

SplitValue(Index: number): number;

delete(): void;

[Symbol.dispose](): void;

Law_Composite: declare class Law_Composite extends Law_Function

constructor

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Value(X: number): number;

D1(X: number, F: number, D: number): { F: number; D: number };

D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

ChangeElementaryLaw(W: number): Law_Function;

ChangeLaws(): NCollection_List_handle_Law_Function;

IsPeriodic(): boolean;

SetPeriodic(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_Constant: declare class Law_Constant extends Law_Function

constructor

Set(Radius: number, PFirst: number, PLast: number): void;

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Value(X: number): number;

D1(X: number, F: number, D: number): { F: number; D: number };

D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_Function: declare class Law_Function extends Standard_Transient

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Value(X: number): number;

D1(X: number, F: number, D: number): { F: number; D: number };

D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_Interpol: declare class Law_Interpol extends Law_BSpFunc

constructor

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

delete(): void;

[Symbol.dispose](): void;

Law_Interpolate: declare class Law_Interpolate

constructor

Load(InitialTangent: number, FinalTangent: number): void;
Load(Tangents: NCollection_Array1_double, TangentFlags: NCollection_HArray1_bool): void;
Load(InitialTangent: number, FinalTangent: number): void;
Load(Tangents: NCollection_Array1_double, TangentFlags: NCollection_HArray1_bool): void;

Perform(): void;

Curve(): Law_BSpline;

IsDone(): boolean;

delete(): void;

[Symbol.dispose](): void;

Law_Linear: declare class Law_Linear extends Law_Function

constructor

Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Value(X: number): number;

D1(X: number, F: number, D: number): { F: number; D: number };

D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_S: declare class Law_S extends Law_BSpFunc

constructor

Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;
Set(Pdeb: number, Valdeb: number, Ddeb: number, Pfin: number, Valfin: number, Dfin: number): void;
Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;
Set(Pdeb: number, Valdeb: number, Ddeb: number, Pfin: number, Valfin: number, Dfin: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Law_Laws: NCollection_List_handle_Law_Function
