# libcascade — Geom (4)

7 top-level symbols. Signatures are verbatim typescript.

// The abstract class Conic describes the common behavior of conic curves in 3D space and, in particular, their general characteristics
Geom_Conic: declare class Geom_Conic extends Geom_Curve

// Changes the orientation of the conic's plane
SetAxis(theA1: gp_Ax1): void;

// changes the location point of the conic
SetLocation(theP: gp_Pnt): void;

// changes the local coordinate system of the conic
SetPosition(theA2: gp_Ax2): void;

// Returns the "main Axis" of this conic
Axis(): gp_Ax1;

// Returns the location point of the conic
Location(): gp_Pnt;

// Returns the local coordinates system of the conic
Position(): gp_Ax2;

// Returns the eccentricity value of the conic e
Eccentricity(): number;

// Returns the XAxis of the conic
XAxis(): gp_Ax1;

// Returns the YAxis of the conic
YAxis(): gp_Ax1;

// Reverses the direction of parameterization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// The continuity of the conic is Cn
Continuity(): GeomAbs_Shape;

// Returns True
IsCN(N: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a cone
Geom_ConicalSurface: declare class Geom_ConicalSurface extends Geom_ElementarySurface

constructor

// Set <me> so that <me> has the same geometric properties as C
SetCone(C: gp_Cone): void;

// Changes the radius of the conical surface in the placement plane (Z = 0, V = 0)
SetRadius(R: number): void;

// Changes the semi angle of the conical surface
SetSemiAngle(Ang: number): void;

// Returns a non transient cone with the same geometric properties as <me>
Cone(): gp_Cone;

// Eeturn 2.PI - U
UReversedParameter(U: number): number;

// Computes the u (or v) parameter on the modified surface, when reversing its u (or v) parametric direction, for any point of u parameter U (or of v parameter V) on this cone
VReversedParameter(V: number): number;

// Changes the orientation of this cone in the v parametric direction
VReverse(): void;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Computes the apex of this cone
Apex(): gp_Pnt;

// The conical surface is infinite in the V direction so V1 = Realfirst from {@link Standard `Standard`} and V2 = RealLast
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the coefficients of the implicit equation of the quadric in the absolute cartesian coordinate system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

// Returns the reference radius of this cone
RefRadius(): number;

// Returns the semi-angle at the apex of this cone
SemiAngle(): number;

// returns True
IsUClosed(): boolean;

// returns False
IsVClosed(): boolean;

// Returns True
IsUPeriodic(): boolean;

// Returns False
IsVPeriodic(): boolean;

// Builds the U isoparametric line of this cone
UIso(U: number): Geom_Curve;

// Builds the V isoparametric circle of this cone
VIso(V: number): Geom_Curve;

// Computes the point P (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the current point and the first derivatives in the directions U and V
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the current point, the first and the second derivatives in the directions U and V
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the current point, the first,the second and the third derivatives in the directions U and V
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the u parametric direction, and Nv in the v parametric direction at the point of parameters (U, V) of this cone
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this cone
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this cone
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Curve describes the common behavior of curves in 3D space
Geom_Curve: declare class Geom_Curve extends Geom_Geometry

// Changes the direction of parametrization of <me>
Reverse(): void;

// Returns the parameter on the reversed curve for the point of parameter U on <me>
ReversedParameter(U: number): number;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf): number;

// Returns a copy of <me> reversed
Reversed(): Geom_Curve;

// Returns the value of the first parameter
FirstParameter(): number;

// Returns the value of the last parameter
LastParameter(): number;

// Returns true if the curve is closed
IsClosed(): boolean;

// Is the parametrization of the curve periodic ? It is possible only if the curve is closed and if the following relation is satisfied
IsPeriodic(): boolean;

// Returns the period of this curve
Period(): number;

// It is the global continuity of the curve C0
Continuity(): GeomAbs_Shape;

// Returns true if the degree of continuity of this curve is at least N
IsCN(N: number): boolean;

// Computes the point of parameter U
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(U: number, N: number): gp_Vec;

// Returns in P the point of parameter U
D0(U: number, P: gp_Pnt): void;
// P: Mutated in place

// Returns the point P of parameter U and the first derivative V1
D1(U: number, P: gp_Pnt, V1: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
D2(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
D3(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
DN(U: number, N: number): gp_Vec;

// Computes the point of parameter U on <me>
Value(U: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines the infinite cylindrical surface
Geom_CylindricalSurface: declare class Geom_CylindricalSurface extends Geom_ElementarySurface

constructor

// Set <me> so that <me> has the same geometric properties as C
SetCylinder(C: gp_Cylinder): void;

// Changes the radius of the cylinder
SetRadius(R: number): void;

// returns a non transient cylinder with the same geometric properties as <me>
Cylinder(): gp_Cylinder;

// Return the parameter on the Ureversed surface for the point of parameter U on <me>
UReversedParameter(U: number): number;

// Return the parameter on the Vreversed surface for the point of parameter V on <me>
VReversedParameter(V: number): number;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// The CylindricalSurface is infinite in the V direction so V1 = Realfirst, V2 = RealLast from package {@link Standard `Standard`}
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the coefficients of the implicit equation of the quadric in the absolute cartesian coordinate system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

// Returns the radius of this cylinder
Radius(): number;

// Returns True
IsUClosed(): boolean;

// Returns False
IsVClosed(): boolean;

// Returns True
IsUPeriodic(): boolean;

// Returns False
IsVPeriodic(): boolean;

// The UIso curve is a Line
UIso(U: number): Geom_Curve;

// The VIso curve is a circle
VIso(V: number): Geom_Curve;

// Computes the point P (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the current point and the first derivatives in the directions U and V
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the current point, the first and the second derivatives in the directions U and V
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the current point, the first, the second and the third derivatives in the directions U and V
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this cylinder
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this cylinder
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class Direction specifies a vector that is never null
Geom_Direction: declare class Geom_Direction extends Geom_Vector

constructor

// Sets <me> to X,Y,Z coordinates
SetCoord(X: number, Y: number, Z: number): void;

// Converts the {@link gp_Dir`gp_Dir`} unit vector V into this unit vector
SetDir(V: gp_Dir): void;

// Changes the X coordinate of <me>
SetX(X: number): void;

// Changes the Y coordinate of <me>
SetY(Y: number): void;

// Changes the Z coordinate of <me>
SetZ(Z: number): void;

// Returns the non transient direction with the same coordinates as <me>
Dir(): gp_Dir;

// returns 1.0 which is the magnitude of any unit vector
Magnitude(): number;

// returns 1.0 which is the square magnitude of any unit vector
SquareMagnitude(): number;

// Computes the cross product between <me> and <Other>
Cross(Other: Geom_Vector): void;

// Computes the triple vector product <me> ^(V1 ^ V2)
CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

// Computes the cross product between <me> and <Other>
Crossed(Other: Geom_Vector): Geom_Vector;

// Computes the triple vector product <me> ^(V1 ^ V2)
CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

// Applies the transformation T to this unit vector, then normalizes it
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this unit vector
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the common behavior of surfaces which have a simple parametric equation in a local coordinate system
Geom_ElementarySurface: declare class Geom_ElementarySurface extends Geom_Surface

// Changes the main axis (ZAxis) of the elementary surface
SetAxis(theA1: gp_Ax1): void;

// Changes the location of the local coordinates system of the surface
SetLocation(theLoc: gp_Pnt): void;

// Changes the local coordinates system of the surface
SetPosition(theAx3: gp_Ax3): void;

// Returns the main axis of the surface (ZAxis)
Axis(): gp_Ax1;

// Returns the location point of the local coordinate system of the surface
Location(): gp_Pnt;

// Returns the local coordinates system of the surface
Position(): gp_Ax3;

// Reverses the U parametric direction of the surface
UReverse(): void;

// Return the parameter on the Ureversed surface for the point of parameter U on <me>
UReversedParameter(U: number): number;

// Reverses the V parametric direction of the surface
VReverse(): void;

// Return the parameter on the Vreversed surface for the point of parameter V on <me>
VReversedParameter(V: number): number;

// Returns GeomAbs_CN, the global continuity of any elementary surface
Continuity(): GeomAbs_Shape;

// Returns True
IsCNu(N: number): boolean;

// Returns True
IsCNv(N: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an ellipse in 3D space
Geom_Ellipse: declare class Geom_Ellipse extends Geom_Conic

constructor

// Converts the {@link gp_Elips`gp_Elips`} ellipse E into this ellipse
SetElips(E: gp_Elips): void;

// Assigns a value to the major radius of this ellipse
SetMajorRadius(MajorRadius: number): void;

// Assigns a value to the minor radius of this ellipse
SetMinorRadius(MinorRadius: number): void;

// returns the non transient ellipse from gp with the same
Elips(): gp_Elips;

// Computes the parameter on the reversed ellipse for the point of parameter U on this ellipse
ReversedParameter(U: number): number;

// This directrix is the line normal to the XAxis of the ellipse in the local plane (Z = 0) at a distance d = MajorRadius / e from the center of the ellipse, where e is the eccentricity of the ellipse
Directrix1(): gp_Ax1;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the "YAxis" of the ellipse
Directrix2(): gp_Ax1;

// Returns the eccentricity of the ellipse between 0.0 and 1.0 If f is the distance between the center of the ellipse and the Focus1 then the eccentricity e = f / MajorRadius
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the ellipse
Focus1(): gp_Pnt;

// Returns the second focus of the ellipse
Focus2(): gp_Pnt;

// Returns the major radius of this ellipse
MajorRadius(): number;

// Returns the minor radius of this ellipse
MinorRadius(): number;

// Returns p = (1 - e _ e) _ MajorRadius where e is the eccentricity of the ellipse
Parameter(): number;

// Returns the value of the first parameter of this ellipse
FirstParameter(): number;

// Returns the value of the last parameter of this ellipse
LastParameter(): number;

// return True
IsClosed(): boolean;

// return True
IsPeriodic(): boolean;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Returns the point of parameter U and the first derivative
EvalD1(U: number): Geom_Curve_ResD1;

// Returns the point of parameter U and the first and second derivatives
EvalD2(U: number): Geom_Curve_ResD2;

// Returns the point of parameter U, the first, second and third derivatives
EvalD3(U: number): Geom_Curve_ResD3;

// For the point of parameter U of this ellipse, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec;

// Applies the transformation T to this ellipse
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this ellipse
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
