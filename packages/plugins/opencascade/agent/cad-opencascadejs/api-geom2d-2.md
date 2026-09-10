# libcascade — Geom2d (2)

8 top-level symbols. Signatures are verbatim typescript.

// The abstract class BoundedCurve describes the common behavior of bounded curves in 2D space
Geom2d_BoundedCurve: declare class Geom2d_BoundedCurve extends Geom2d_Curve

// Returns the end point of the curve
EndPoint(): gp_Pnt2d;

// Returns the start point of the curve
StartPoint(): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a point in 2D space
Geom2d_CartesianPoint: declare class Geom2d_CartesianPoint extends Geom2d_Point

constructor

// Set <me> to X, Y coordinates
SetCoord(X: number, Y: number): void;

// Set <me> to P.X(), P.Y() coordinates
SetPnt2d(P: gp_Pnt2d): void;

// Changes the X coordinate of me
SetX(X: number): void;

// Changes the Y coordinate of me
SetY(Y: number): void;

// Returns the coordinates of <me>
Coord(X: number, Y: number): { X: number; Y: number };

// Returns a non persistent cartesian point with the same coordinates as <me>
Pnt2d(): gp_Pnt2d;

// Returns the X coordinate of <me>
X(): number;

// Returns the Y coordinate of <me>
Y(): number;

// Transformation of a geometric object
Transform(T: gp_Trsf2d): void;

Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a circle in the plane (2D space)
Geom2d_Circle: declare class Geom2d_Circle extends Geom2d_Conic

constructor

// Converts the {@link gp_Circ2d`gp_Circ2d`} circle C into this circle
SetCirc2d(C: gp_Circ2d): void;

SetRadius(R: number): void;

// Returns the non persistent circle from gp with the same geometric properties as <me>
Circ2d(): gp_Circ2d;

// Returns the radius of this circle
Radius(): number;

// Computes the parameter on the reversed circle for the point of parameter U on this circle
ReversedParameter(U: number): number;

// Returns 0., which is the eccentricity of any circle
Eccentricity(): number;

// Returns 0.0
FirstParameter(): number;

// Returns 2\*PI
LastParameter(): number;

// returns True
IsClosed(): boolean;

// returns True
IsPeriodic(): boolean;

// Returns in P the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Returns the point P of parameter U and the first derivative V1
EvalD1(U: number): Geom2d_Curve_ResD1;

// Returns the point P of parameter U, the first and second derivatives V1 and V2
EvalD2(U: number): Geom2d_Curve_ResD2;

// Returns the point P of parameter u, the first second and third derivatives V1 V2 and V3
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this circle, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Applies the transformation T to this circle
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this circle
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Conic describes the common behavior of conic curves in 2D space and, in particular, their general characteristics
Geom2d_Conic: declare class Geom2d_Conic extends Geom2d_Curve

// Modifies this conic, redefining its local coordinate system partially, by assigning theA as its axis
SetAxis(theA: gp_Ax22d): void;

// Assigns the origin and unit vector of axis theA to the origin of the local coordinate system of this conic and X Direction
SetXAxis(theAX: gp_Ax2d): void;

// Assigns the origin and unit vector of axis theA to the origin of the local coordinate system of this conic and Y Direction
SetYAxis(theAY: gp_Ax2d): void;

// Modifies this conic, redefining its local coordinate system partially, by assigning theP as its origin
SetLocation(theP: gp_Pnt2d): void;

// Returns the "XAxis" of the conic
XAxis(): gp_Ax2d;

// Returns the "YAxis" of the conic
YAxis(): gp_Ax2d;

// returns the eccentricity value of the conic e
Eccentricity(): number;

// Returns the location point of the conic
Location(): gp_Pnt2d;

// Returns the local coordinates system of the conic
Position(): gp_Ax22d;

// Reverses the direction of parameterization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Returns GeomAbs_CN which is the global continuity of any conic
Continuity(): GeomAbs_Shape;

// Returns True, the order of continuity of a conic is infinite
IsCN(N: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Curve describes the common behavior of curves in 2D space
Geom2d_Curve: declare class Geom2d_Curve extends Geom2d_Geometry

// Changes the direction of parametrization of <me>
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this curve
ReversedParameter(U: number): number;

// Computes the parameter on the curve transformed by T for the point of parameter U on this curve
TransformedParameter(U: number, T: gp_Trsf2d): number;

// Returns the coefficient required to compute the parametric transformation of this curve when transformation T is applied
ParametricTransformation(T: gp_Trsf2d): number;

// Creates a reversed duplicate Changes the orientation of this curve
Reversed(): Geom2d_Curve;

// Returns the value of the first parameter
FirstParameter(): number;

// Value of the last parameter
LastParameter(): number;

// Returns true if the curve is closed
IsClosed(): boolean;

// Returns true if the parameter of the curve is periodic
IsPeriodic(): boolean;

// Returns the period of this curve
Period(): number;

// It is the global continuity of the curve
Continuity(): GeomAbs_Shape;

// Returns true if the degree of continuity of this curve is at least N
IsCN(N: number): boolean;

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

// Returns in P the point of parameter U
D0(U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Returns the point P of parameter U and the first derivative V1
D1(U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// Computes the Nth derivative vector
DN(U: number, N: number): gp_Vec2d;

// Computes the point of parameter U on <me>
Value(U: number): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class Direction specifies a vector that is never null
Geom2d_Direction: declare class Geom2d_Direction extends Geom2d_Vector

constructor

// Assigns the coordinates X and Y to this unit vector, then normalizes it
SetCoord(X: number, Y: number): void;

// Converts the {@link gp_Dir2d`gp_Dir2d`} unit vector V into this unit vector
SetDir2d(V: gp_Dir2d): void;

// Assigns a value to the X coordinate of this unit vector, then normalizes it
SetX(X: number): void;

// Assigns a value to the Y coordinate of this unit vector, then normalizes it
SetY(Y: number): void;

// Converts this unit vector into a {@link gp_Dir2d`gp_Dir2d`} unit vector
Dir2d(): gp_Dir2d;

// returns 1.0
Magnitude(): number;

// returns 1.0
SquareMagnitude(): number;

// Computes the cross product between <me> and <Other>
Crossed(Other: Geom2d_Vector): number;

// Applies the transformation T to this unit vector, then normalizes it
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this unit vector
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an ellipse in the plane (2D space)
Geom2d_Ellipse: declare class Geom2d_Ellipse extends Geom2d_Conic

constructor

// Converts the {@link gp_Elips2d`gp_Elips2d`} ellipse E into this ellipse
SetElips2d(E: gp_Elips2d): void;

// Assigns a value to the major radius of this ellipse
SetMajorRadius(MajorRadius: number): void;

// Assigns a value to the minor radius of this ellipse
SetMinorRadius(MinorRadius: number): void;

// Converts this ellipse into a {@link gp_Elips2d`gp_Elips2d`} ellipse
Elips2d(): gp_Elips2d;

// Computes the parameter on the reversed ellipse for the point of parameter U on this ellipse
ReversedParameter(U: number): number;

// Computes the directrices of this ellipse
Directrix1(): gp_Ax2d;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the "YAxis" of the ellipse
Directrix2(): gp_Ax2d;

// Returns the eccentricity of the ellipse between 0.0 and 1.0 If f is the distance between the center of the ellipse and the Focus1 then the eccentricity e = f / MajorRadius
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the ellipse
Focus1(): gp_Pnt2d;

// Returns the second focus of the ellipse
Focus2(): gp_Pnt2d;

// Returns the major radius of this ellipse
MajorRadius(): number;

// Returns the minor radius of this ellipse
MinorRadius(): number;

// Computes the parameter of this ellipse
Parameter(): number;

// Returns the value of the first parameter of this ellipse
FirstParameter(): number;

// Returns the value of the last parameter of this ellipse
LastParameter(): number;

// return True
IsClosed(): boolean;

// return True
IsPeriodic(): boolean;

// Returns in P the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Returns the point P of parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Returns the point P of parameter U, the first second and third derivatives V1 V2 and V3
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this ellipse, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Applies the transformation T to this ellipse
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this ellipse
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The general abstract class Geometry in 2D space describes the common behaviour of all the geometric entities
Geom2d_Geometry: declare class Geom2d_Geometry extends Standard_Transient

// Performs the symmetrical transformation of a Geometry with respect to the point P which is the center of the symmetry and assigns the result to this geometric object
Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;
Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;

// Rotates a Geometry
Rotate(P: gp_Pnt2d, Ang: number): void;

// Scales a Geometry
Scale(P: gp_Pnt2d, S: number): void;

// Translates a Geometry
Translate(V: gp_Vec2d): void;
Translate(P1: gp_Pnt2d, P2: gp_Pnt2d): void;
Translate(V: gp_Vec2d): void;
Translate(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

// Transformation of a geometric object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
