# libcascade — Geom2d (2)

9 top-level symbols. Signatures are verbatim typescript.

Geom2d_Transformation: declare class Geom2d_Transformation extends Standard_Transient

constructor

SetMirror(P: gp_Pnt2d): void;
SetMirror(A: gp_Ax2d): void;
SetMirror(P: gp_Pnt2d): void;
SetMirror(A: gp_Ax2d): void;

SetRotation(P: gp_Pnt2d, Ang: number): void;

SetScale(P: gp_Pnt2d, S: number): void;

SetTransformation(FromSystem1: gp_Ax2d, ToSystem2: gp_Ax2d): void;
SetTransformation(ToSystem: gp_Ax2d): void;
SetTransformation(FromSystem1: gp_Ax2d, ToSystem2: gp_Ax2d): void;
SetTransformation(ToSystem: gp_Ax2d): void;

SetTranslation(V: gp_Vec2d): void;
SetTranslation(P1: gp_Pnt2d, P2: gp_Pnt2d): void;
SetTranslation(V: gp_Vec2d): void;
SetTranslation(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

SetTrsf2d(T: gp_Trsf2d): void;

IsNegative(): boolean;

Form(): gp_TrsfForm;

ScaleFactor(): number;

Trsf2d(): gp_Trsf2d;

Value(Row: number, Col: number): number;

Invert(): void;

Inverted(): Geom2d_Transformation;

Multiplied(Other: Geom2d_Transformation): Geom2d_Transformation;

Multiply(Other: Geom2d_Transformation): void;

Power(N: number): void;

Powered(N: number): Geom2d_Transformation;

PreMultiply(Other: Geom2d_Transformation): void;

Transforms(X?: number, Y?: number): { X: number; Y: number };

Copy(): Geom2d_Transformation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_TrimmedCurve: declare class Geom2d_TrimmedCurve extends Geom2d_BoundedCurve

constructor

Reverse(): void;

ReversedParameter(U: number): number;

SetTrim(U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean): void;

BasisCurve(): Geom2d_Curve;

Continuity(): GeomAbs_Shape;

IsCN(N: number): boolean;

EndPoint(): gp_Pnt2d;

FirstParameter(): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

LastParameter(): number;

StartPoint(): gp_Pnt2d;

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

Geom2d_UndefinedDerivative: declare class Geom2d_UndefinedDerivative extends Standard_DomainError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Geom2d_UndefinedValue: declare class Geom2d_UndefinedValue extends Standard_DomainError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Vector: declare class Geom2d_Vector extends Geom2d_Geometry

Reverse(): void;

Reversed(): Geom2d_Vector;

Angle(Other: Geom2d_Vector): number;

Coord(X?: number, Y?: number): { X: number; Y: number };

Magnitude(): number;

SquareMagnitude(): number;

X(): number;

Y(): number;

Crossed(Other: Geom2d_Vector): number;

Dot(Other: Geom2d_Vector): number;

Vec2d(): gp_Vec2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_VectorWithMagnitude: declare class Geom2d_VectorWithMagnitude extends Geom2d_Vector

constructor

SetCoord(X: number, Y: number): void;

SetVec2d(V: gp_Vec2d): void;

SetX(X: number): void;

SetY(Y: number): void;

Magnitude(): number;

SquareMagnitude(): number;

Add(Other: Geom2d_Vector): void;

Added(Other: Geom2d_Vector): Geom2d_VectorWithMagnitude;

Crossed(Other: Geom2d_Vector): number;

Divide(Scalar: number): void;

Divided(Scalar: number): Geom2d_VectorWithMagnitude;

Multiplied(Scalar: number): Geom2d_VectorWithMagnitude;

Multiply(Scalar: number): void;

Normalize(): void;

Normalized(): Geom2d_VectorWithMagnitude;

Subtract(Other: Geom2d_Vector): void;

Subtracted(Other: Geom2d_Vector): Geom2d_VectorWithMagnitude;

Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Geom2d_Curve_ResD1: interface Geom2d_Curve_ResD1

Point: gp_Pnt2d

D1: gp_Vec2d

Geom2d_Curve_ResD2: interface Geom2d_Curve_ResD2

Point: gp_Pnt2d

D1: gp_Vec2d

D2: gp_Vec2d

Geom2d_Curve_ResD3: interface Geom2d_Curve_ResD3

Point: gp_Pnt2d

D1: gp_Vec2d

D2: gp_Vec2d

D3: gp_Vec2d
