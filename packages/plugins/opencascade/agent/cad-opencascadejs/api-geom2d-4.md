# libcascade — Geom2d (4)

8 top-level symbols. Signatures are verbatim typescript.

// Defines a portion of a curve limited by two values of parameters inside the parametric domain of the curve
Geom2d_TrimmedCurve: declare class Geom2d_TrimmedCurve extends Geom2d_BoundedCurve

constructor

// Changes the direction of parametrization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Changes this trimmed curve, by redefining the parameter values U1 and U2, which limit its basis curve
SetTrim(U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean): void;

// Returns the basis curve
BasisCurve(): Geom2d_Curve;

// Returns the global continuity of the basis curve of this trimmed curve
Continuity(): GeomAbs_Shape;

// -- Purpose Returns True if the order of continuity of the trimmed curve is N
IsCN(N: number): boolean;

// Returns the end point of <me>
EndPoint(): gp_Pnt2d;

// Returns the value of the first parameter of <me>
FirstParameter(): number;

// Returns TRUE if the basis curve is periodic and the trim spans exactly one full period, or if the distance between the StartPoint and the EndPoint is within computational precision
IsClosed(): boolean;

// Returns TRUE if the basis curve is periodic and the trim spans exactly one full period
IsPeriodic(): boolean;

// Returns the period of the basis curve of this trimmed curve
Period(): number;

// Returns the value of the last parameter of <me>
LastParameter(): number;

// Returns the start point of <me>
StartPoint(): gp_Pnt2d;

// If the basis curve is an OffsetCurve sometimes it is not possible to do the evaluation of the curve at the parameter U (see class OffsetCurve)
EvalD0(U: number): gp_Pnt2d;

// Raised if the continuity of the curve is not C1
EvalD1(U: number): Geom2d_Curve_ResD1;

// Raised if the continuity of the curve is not C2
EvalD2(U: number): Geom2d_Curve_ResD2;

// Raised if the continuity of the curve is not C3
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this trimmed curve, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Applies the transformation T to this trimmed curve
Transform(T: gp_Trsf2d): void;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf2d): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf2d): number;

// Creates a new object, which is a copy of this trimmed curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2d_UndefinedDerivative: declare class Geom2d_UndefinedDerivative extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2d_UndefinedValue: declare class Geom2d_UndefinedValue extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Vector describes the common behavior of vectors in 2D space
Geom2d_Vector: declare class Geom2d_Vector extends Geom2d_Geometry

// Reverses the vector <me>
Reverse(): void;

// Returns a copy of <me> reversed
Reversed(): Geom2d_Vector;

// Computes the angular value, in radians, between this vector and vector Other
Angle(Other: Geom2d_Vector): number;

// Returns the coordinates of <me>
Coord(X?: number, Y?: number): { X: number; Y: number };

// Returns the Magnitude of <me>
Magnitude(): number;

// Returns the square magnitude of <me>
SquareMagnitude(): number;

// Returns the X coordinate of <me>
X(): number;

// Returns the Y coordinate of <me>
Y(): number;

// Cross product of <me> with the vector <Other>
Crossed(Other: Geom2d_Vector): number;

// Returns the scalar product of 2 Vectors
Dot(Other: Geom2d_Vector): number;

// Returns a non persistent copy of <me>
Vec2d(): gp_Vec2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a vector with magnitude
Geom2d_VectorWithMagnitude: declare class Geom2d_VectorWithMagnitude extends Geom2d_Vector

constructor

// Set <me> to X, Y coordinates
SetCoord(X: number, Y: number): void;

SetVec2d(V: gp_Vec2d): void;

// Changes the X coordinate of <me>
SetX(X: number): void;

// Changes the Y coordinate of <me>
SetY(Y: number): void;

// Returns the magnitude of <me>
Magnitude(): number;

// Returns the square magnitude of <me>
SquareMagnitude(): number;

// Adds the Vector Other to <me>
Add(Other: Geom2d_Vector): void;

// Adds the vector Other to <me>
Added(Other: Geom2d_Vector): Geom2d_VectorWithMagnitude;

// Computes the cross product between <me> and Other <me> ^ Other
Crossed(Other: Geom2d_Vector): number;

// Divides <me> by a scalar
Divide(Scalar: number): void;

// Divides <me> by a scalar
Divided(Scalar: number): Geom2d_VectorWithMagnitude;

// Computes the product of the vector <me> by a scalar
Multiplied(Scalar: number): Geom2d_VectorWithMagnitude;

// Computes the product of the vector <me> by a scalar
Multiply(Scalar: number): void;

// Normalizes <me>
Normalize(): void;

// Returns a copy of <me> Normalized
Normalized(): Geom2d_VectorWithMagnitude;

// Subtracts the Vector Other to <me>
Subtract(Other: Geom2d_Vector): void;

// Subtracts the vector Other to <me>
Subtracted(Other: Geom2d_Vector): Geom2d_VectorWithMagnitude;

// Applies the transformation T to this vector
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this vector
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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
