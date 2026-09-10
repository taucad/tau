# libcascade — Geom (8)

11 top-level symbols. Signatures are verbatim typescript.

// Describes a portion of a curve (termed the "basis curve") limited by two parameter values inside the parametric domain of the basis curve
Geom_TrimmedCurve: declare class Geom_TrimmedCurve extends Geom_BoundedCurve

constructor

// Changes the orientation of this trimmed curve
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this trimmed curve
ReversedParameter(U: number): number;

// Changes this trimmed curve, by redefining the parameter values U1 and U2 which limit its basis curve
SetTrim(U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean): void;

// Returns the basis curve
BasisCurve(): Geom_Curve;

// Returns the continuity of the curve
Continuity(): GeomAbs_Shape;

// Returns true if the degree of continuity of the basis curve of this trimmed curve is at least N
IsCN(N: number): boolean;

// Returns the end point of <me>
EndPoint(): gp_Pnt;

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
StartPoint(): gp_Pnt;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Raised if the continuity of the curve is not C1
EvalD1(U: number): Geom_Curve_ResD1;

// Raised if the continuity of the curve is not C2
EvalD2(U: number): Geom_Curve_ResD2;

// Raised if the continuity of the curve is not C3
EvalD3(U: number): Geom_Curve_ResD3;

// N is the order of derivation
EvalDN(U: number, N: number): gp_Vec;

// Applies the transformation T to this trimmed curve
Transform(T: gp_Trsf): void;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf): number;

// Creates a new object which is a copy of this trimmed curve
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom_UndefinedDerivative: declare class Geom_UndefinedDerivative extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom_UndefinedValue: declare class Geom_UndefinedValue extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Vector describes the common behavior of vectors in 3D space
Geom_Vector: declare class Geom_Vector extends Geom_Geometry

// Reverses the vector <me>
Reverse(): void;

// Returns a copy of <me> reversed
Reversed(): Geom_Vector;

// Computes the angular value, in radians, between this vector and vector Other
Angle(Other: Geom_Vector): number;

// Computes the angular value, in radians, between this vector and vector Other
AngleWithRef(Other: Geom_Vector, VRef: Geom_Vector): number;

// Returns the coordinates X, Y and Z of this vector
Coord(X?: number, Y?: number, Z?: number): { X: number; Y: number; Z: number };

// Returns the Magnitude of <me>
Magnitude(): number;

// Returns the square magnitude of <me>
SquareMagnitude(): number;

// Returns the X coordinate of <me>
X(): number;

// Returns the Y coordinate of <me>
Y(): number;

// Returns the Z coordinate of <me>
Z(): number;

// Computes the cross product between <me> and <Other>
Cross(Other: Geom_Vector): void;

// Computes the cross product between <me> and <Other>
Crossed(Other: Geom_Vector): Geom_Vector;

// Computes the triple vector product <me> ^(V1 ^ V2)
CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

// Computes the triple vector product <me> ^(V1 ^ V2)
CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

// Computes the scalar product of this vector and vector Other
Dot(Other: Geom_Vector): number;

// Computes the triple scalar product
DotCross(V1: Geom_Vector, V2: Geom_Vector): number;

// Converts this vector into a {@link gp_Vec`gp_Vec`} vector
Vec(): gp_Vec;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a vector with magnitude
Geom_VectorWithMagnitude: declare class Geom_VectorWithMagnitude extends Geom_Vector

constructor

// Assigns the values X, Y and Z to the coordinates of this vector
SetCoord(X: number, Y: number, Z: number): void;

// Converts the {@link gp_Vec`gp_Vec`} vector V into this vector
SetVec(V: gp_Vec): void;

// Changes the X coordinate of <me>
SetX(X: number): void;

// Changes the Y coordinate of <me>
SetY(Y: number): void;

// Changes the Z coordinate of <me>
SetZ(Z: number): void;

// Returns the magnitude of <me>
Magnitude(): number;

// Returns the square magnitude of <me>
SquareMagnitude(): number;

// Adds the Vector Other to <me>
Add(Other: Geom_Vector): void;

// Adds the vector Other to <me>
Added(Other: Geom_Vector): Geom_VectorWithMagnitude;

// Computes the cross product between <me> and Other <me> ^ Other
Cross(Other: Geom_Vector): void;

// Computes the cross product between <me> and Other <me> ^ Other
Crossed(Other: Geom_Vector): Geom_Vector;

// Computes the triple vector product <me> ^ (V1 ^ V2)
CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

// Computes the triple vector product <me> ^ (V1 ^ V2)
CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

// Divides <me> by a scalar
Divide(Scalar: number): void;

// Divides <me> by a scalar
Divided(Scalar: number): Geom_VectorWithMagnitude;

// Computes the product of the vector <me> by a scalar
Multiplied(Scalar: number): Geom_VectorWithMagnitude;

// Computes the product of the vector <me> by a scalar
Multiply(Scalar: number): void;

// Normalizes <me>
Normalize(): void;

// Returns a copy of <me> Normalized
Normalized(): Geom_VectorWithMagnitude;

// Subtracts the Vector Other to <me>
Subtract(Other: Geom_Vector): void;

// Subtracts the vector Other to <me>
Subtracted(Other: Geom_Vector): Geom_VectorWithMagnitude;

// Applies the transformation T to this vector
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this vector
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom_Curve_ResD1: interface Geom_Curve_ResD1

Point: gp_Pnt

D1: gp_Vec

Geom_Curve_ResD2: interface Geom_Curve_ResD2

Point: gp_Pnt

D1: gp_Vec

D2: gp_Vec

Geom_Curve_ResD3: interface Geom_Curve_ResD3

Point: gp_Pnt

D1: gp_Vec

D2: gp_Vec

D3: gp_Vec

Geom_Surface_ResD1: interface Geom_Surface_ResD1

Point: gp_Pnt

D1U: gp_Vec

D1V: gp_Vec

Geom_Surface_ResD2: interface Geom_Surface_ResD2

Point: gp_Pnt

D1U: gp_Vec

D1V: gp_Vec

D2U: gp_Vec

D2V: gp_Vec

D2UV: gp_Vec

Geom_Surface_ResD3: interface Geom_Surface_ResD3

Point: gp_Pnt

D1U: gp_Vec

D1V: gp_Vec

D2U: gp_Vec

D2V: gp_Vec

D2UV: gp_Vec

D3U: gp_Vec

D3V: gp_Vec

D3UUV: gp_Vec

D3UVV: gp_Vec
