# libcascade — Geom2d

16 top-level symbols. Signatures are verbatim typescript.

Geom2d_AxisPlacement: declare class Geom2d_AxisPlacement extends Geom2d_Geometry

constructor

Reverse(): void;

Reversed(): Geom2d_AxisPlacement;

SetAxis(A: gp_Ax2d): void;

SetDirection(V: gp_Dir2d): void;

SetLocation(P: gp_Pnt2d): void;

Angle(Other: Geom2d_AxisPlacement): number;

Ax2d(): gp_Ax2d;

Direction(): gp_Dir2d;

Location(): gp_Pnt2d;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_BSplineCurve: declare class Geom2d_BSplineCurve extends Geom2d_BoundedCurve

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

ClearEvalRepresentation(): void;

IncreaseDegree(Degree: number): void;

IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;
IncreaseMultiplicity(Index: number, M: number): void;
IncreaseMultiplicity(I1: number, I2: number, M: number): void;

IncrementMultiplicity(I1: number, I2: number, M: number): void;

InsertKnot(U: number, M?: number, ParametricTolerance?: number): void;

InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

InsertPoleAfter(Index: number, P: gp_Pnt2d, Weight?: number): void;

InsertPoleBefore(Index: number, P: gp_Pnt2d, Weight?: number): void;

RemovePole(Index: number): void;

Reverse(): void;

ReversedParameter(U: number): number;

Segment(U1: number, U2: number, theTolerance?: number): void;

SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;
SetKnot(Index: number, K: number): void;
SetKnot(Index: number, K: number, M: number): void;

SetKnots(K: NCollection_Array1_double): void;

PeriodicNormalization(U?: number): { U: number };

SetPeriodic(): void;

SetOrigin(Index: number): void;

SetNotPeriodic(): void;

SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;
SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;

SetWeight(Index: number, Weight: number): void;

MovePoint(U: number, P: gp_Pnt2d, Index1: number, Index2: number, FirstModifiedPole?: number, LastModifiedPole?: number): { FirstModifiedPole: number; LastModifiedPole: number };

MovePointAndTangent(U: number, P: gp_Pnt2d, Tangent: gp_Vec2d, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

IsCN(N: number): boolean;

IsG1(theTf: number, theTl: number, theAngTol: number): boolean;

IsClosed(): boolean;

IsPeriodic(): boolean;

IsRational(): boolean;

Continuity(): GeomAbs_Shape;

Degree(): number;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

LocalValue(U: number, FromK1: number, ToK2: number): gp_Pnt2d;

LocalD0(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d): void;

LocalD1(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

LocalD2(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

LocalD3(U: number, FromK1: number, ToK2: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

LocalDN(U: number, FromK1: number, ToK2: number, N: number): gp_Vec2d;

EndPoint(): gp_Pnt2d;

FirstUKnotIndex(): number;

FirstParameter(): number;

Knot(Index: number): number;

// DEPRECATED
Knots(K: NCollection_Array1_double): void;
Knots(): NCollection_Array1_double;
Knots(K: NCollection_Array1_double): void;
Knots(): NCollection_Array1_double;

// DEPRECATED
KnotSequence(K: NCollection_Array1_double): void;
KnotSequence(): NCollection_Array1_double;
KnotSequence(K: NCollection_Array1_double): void;
KnotSequence(): NCollection_Array1_double;

KnotDistribution(): GeomAbs_BSplKnotDistribution;

LastUKnotIndex(): number;

LastParameter(): number;

LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

Multiplicity(Index: number): number;

// DEPRECATED
Multiplicities(M: NCollection_Array1_int): void;
Multiplicities(): NCollection_Array1_int;
Multiplicities(M: NCollection_Array1_int): void;
Multiplicities(): NCollection_Array1_int;

NbKnots(): number;

NbPoles(): number;

Pole(Index: number): gp_Pnt2d;

// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;

StartPoint(): gp_Pnt2d;

Weight(Index: number): number;

// DEPRECATED
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;

WeightsArray(): NCollection_Array1_double;

Transform(T: gp_Trsf2d): void;

static MaxDegree(): number;

Resolution(ToleranceUV: number, UTolerance?: number): { UTolerance: number };

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_BezierCurve: declare class Geom2d_BezierCurve extends Geom2d_BoundedCurve

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

ClearEvalRepresentation(): void;

Increase(Degree: number): void;

InsertPoleAfter(Index: number, P: gp_Pnt2d, Weight?: number): void;

InsertPoleBefore(Index: number, P: gp_Pnt2d, Weight?: number): void;

RemovePole(Index: number): void;

Reverse(): void;

ReversedParameter(U: number): number;

Segment(U1: number, U2: number): void;

SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;
SetPole(Index: number, P: gp_Pnt2d): void;
SetPole(Index: number, P: gp_Pnt2d, Weight: number): void;

SetWeight(Index: number, Weight: number): void;

IsClosed(): boolean;

IsCN(N: number): boolean;

IsPeriodic(): boolean;

IsRational(): boolean;

Continuity(): GeomAbs_Shape;

Degree(): number;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

EndPoint(): gp_Pnt2d;

FirstParameter(): number;

LastParameter(): number;

NbPoles(): number;

Pole(Index: number): gp_Pnt2d;

// DEPRECATED
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;
Poles(P: NCollection_Array1_gp_Pnt2d): void;
Poles(): NCollection_Array1_gp_Pnt2d;

StartPoint(): gp_Pnt2d;

Weight(Index: number): number;

// DEPRECATED
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;
Weights(W: NCollection_Array1_double): void;
Weights(): NCollection_Array1_double;

WeightsArray(): NCollection_Array1_double;

Transform(T: gp_Trsf2d): void;

static MaxDegree(): number;

Resolution(ToleranceUV: number, UTolerance?: number): { UTolerance: number };

Copy(): Geom2d_Geometry;

Knots(): NCollection_Array1_double;

Multiplicities(): NCollection_Array1_int;

KnotSequence(): NCollection_Array1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_BoundedCurve: declare class Geom2d_BoundedCurve extends Geom2d_Curve

EndPoint(): gp_Pnt2d;

StartPoint(): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_CartesianPoint: declare class Geom2d_CartesianPoint extends Geom2d_Point

constructor

SetCoord(X: number, Y: number): void;

SetPnt2d(P: gp_Pnt2d): void;

SetX(X: number): void;

SetY(Y: number): void;

Coord(X: number, Y: number): { X: number; Y: number };

Pnt2d(): gp_Pnt2d;

X(): number;

Y(): number;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Circle: declare class Geom2d_Circle extends Geom2d_Conic

constructor

SetCirc2d(C: gp_Circ2d): void;

SetRadius(R: number): void;

Circ2d(): gp_Circ2d;

Radius(): number;

ReversedParameter(U: number): number;

Eccentricity(): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Conic: declare class Geom2d_Conic extends Geom2d_Curve

SetAxis(theA: gp_Ax22d): void;

SetXAxis(theAX: gp_Ax2d): void;

SetYAxis(theAY: gp_Ax2d): void;

SetLocation(theP: gp_Pnt2d): void;

XAxis(): gp_Ax2d;

YAxis(): gp_Ax2d;

Eccentricity(): number;

Location(): gp_Pnt2d;

Position(): gp_Ax22d;

Reverse(): void;

ReversedParameter(U: number): number;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Curve: declare class Geom2d_Curve extends Geom2d_Geometry

Reverse(): void;

ReversedParameter(U: number): number;

TransformedParameter(U: number, T: gp_Trsf2d): number;

ParametricTransformation(T: gp_Trsf2d): number;

Reversed(): Geom2d_Curve;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

D0(U: number, P: gp_Pnt2d): void;

D1(U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

DN(U: number, N: number): gp_Vec2d;

Value(U: number): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Direction: declare class Geom2d_Direction extends Geom2d_Vector

constructor

SetCoord(X: number, Y: number): void;

SetDir2d(V: gp_Dir2d): void;

SetX(X: number): void;

SetY(Y: number): void;

Dir2d(): gp_Dir2d;

Magnitude(): number;

SquareMagnitude(): number;

Crossed(Other: Geom2d_Vector): number;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Ellipse: declare class Geom2d_Ellipse extends Geom2d_Conic

constructor

SetElips2d(E: gp_Elips2d): void;

SetMajorRadius(MajorRadius: number): void;

SetMinorRadius(MinorRadius: number): void;

Elips2d(): gp_Elips2d;

ReversedParameter(U: number): number;

Directrix1(): gp_Ax2d;

Directrix2(): gp_Ax2d;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt2d;

Focus2(): gp_Pnt2d;

MajorRadius(): number;

MinorRadius(): number;

Parameter(): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Geometry: declare class Geom2d_Geometry extends Standard_Transient

Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;
Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;

Rotate(P: gp_Pnt2d, Ang: number): void;

Scale(P: gp_Pnt2d, S: number): void;

Translate(V: gp_Vec2d): void;
Translate(P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Translate(V: gp_Vec2d): void;
Translate(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

Transform(T: gp_Trsf2d): void;

Mirrored(P: gp_Pnt2d): Geom2d_Geometry;
Mirrored(A: gp_Ax2d): Geom2d_Geometry;
Mirrored(P: gp_Pnt2d): Geom2d_Geometry;
Mirrored(A: gp_Ax2d): Geom2d_Geometry;

Rotated(P: gp_Pnt2d, Ang: number): Geom2d_Geometry;

Scaled(P: gp_Pnt2d, S: number): Geom2d_Geometry;

Transformed(T: gp_Trsf2d): Geom2d_Geometry;

Translated(V: gp_Vec2d): Geom2d_Geometry;
Translated(P1: gp_Pnt2d, P2: gp_Pnt2d): Geom2d_Geometry;
Translated(V: gp_Vec2d): Geom2d_Geometry;
Translated(P1: gp_Pnt2d, P2: gp_Pnt2d): Geom2d_Geometry;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Hyperbola: declare class Geom2d_Hyperbola extends Geom2d_Conic

constructor

SetHypr2d(H: gp_Hypr2d): void;

SetMajorRadius(MajorRadius: number): void;

SetMinorRadius(MinorRadius: number): void;

Hypr2d(): gp_Hypr2d;

ReversedParameter(U: number): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Asymptote1(): gp_Ax2d;

Asymptote2(): gp_Ax2d;

ConjugateBranch1(): gp_Hypr2d;

ConjugateBranch2(): gp_Hypr2d;

Directrix1(): gp_Ax2d;

Directrix2(): gp_Ax2d;

Eccentricity(): number;

Focal(): number;

Focus1(): gp_Pnt2d;

Focus2(): gp_Pnt2d;

MajorRadius(): number;

MinorRadius(): number;

OtherBranch(): gp_Hypr2d;

Parameter(): number;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Line: declare class Geom2d_Line extends Geom2d_Curve

constructor

SetLin2d(L: gp_Lin2d): void;

SetDirection(V: gp_Dir2d): void;

Direction(): gp_Dir2d;

SetLocation(P: gp_Pnt2d): void;

Location(): gp_Pnt2d;

SetPosition(A: gp_Ax2d): void;

Position(): gp_Ax2d;

Lin2d(): gp_Lin2d;

Reverse(): void;

ReversedParameter(U: number): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Continuity(): GeomAbs_Shape;

Distance(P: gp_Pnt2d): number;

IsCN(N: number): boolean;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

Transform(T: gp_Trsf2d): void;

TransformedParameter(U: number, T: gp_Trsf2d): number;

ParametricTransformation(T: gp_Trsf2d): number;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_OffsetCurve: declare class Geom2d_OffsetCurve extends Geom2d_Curve

constructor

HasEvalRepresentation(): boolean;

EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

ClearEvalRepresentation(): void;

Reverse(): void;

ReversedParameter(U: number): number;

SetBasisCurve(C: Geom2d_Curve, isNotCheckC0?: boolean): void;

SetOffsetValue(D: number): void;

BasisCurve(): Geom2d_Curve;

Continuity(): GeomAbs_Shape;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

FirstParameter(): number;

LastParameter(): number;

Offset(): number;

IsClosed(): boolean;

IsCN(N: number): boolean;

IsPeriodic(): boolean;

Period(): number;

Transform(T: gp_Trsf2d): void;

TransformedParameter(U: number, T: gp_Trsf2d): number;

ParametricTransformation(T: gp_Trsf2d): number;

Copy(): Geom2d_Geometry;

GetBasisCurveContinuity(): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Parabola: declare class Geom2d_Parabola extends Geom2d_Conic

constructor

SetFocal(Focal: number): void;

SetParab2d(Prb: gp_Parab2d): void;

Parab2d(): gp_Parab2d;

ReversedParameter(U: number): number;

FirstParameter(): number;

LastParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Directrix(): gp_Ax2d;

Eccentricity(): number;

Focus(): gp_Pnt2d;

Focal(): number;

Parameter(): number;

EvalD0(U: number): gp_Pnt2d;

EvalD1(U: number): Geom2d_Curve_ResD1;

EvalD2(U: number): Geom2d_Curve_ResD2;

EvalD3(U: number): Geom2d_Curve_ResD3;

EvalDN(U: number, N: number): gp_Vec2d;

Transform(T: gp_Trsf2d): void;

TransformedParameter(U: number, T: gp_Trsf2d): number;

ParametricTransformation(T: gp_Trsf2d): number;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Point: declare class Geom2d_Point extends Geom2d_Geometry

Coord(X: number, Y: number): { X: number; Y: number };

Pnt2d(): gp_Pnt2d;

X(): number;

Y(): number;

Distance(Other: Geom2d_Point): number;

SquareDistance(Other: Geom2d_Point): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
