# libcascade — Geom (6)

6 top-level symbols. Signatures are verbatim typescript.

// Describes a parabola in 3D space
Geom_Parabola: declare class Geom_Parabola extends Geom_Conic

constructor

// Assigns the value Focal to the focal distance of this parabola
SetFocal(Focal: number): void;

// Converts the {@link gp_Parab`gp_Parab`} parabola Prb into this parabola
SetParab(Prb: gp_Parab): void;

// Returns the non transient parabola from gp with the same geometric properties as <me>
Parab(): gp_Parab;

// Computes the parameter on the reversed parabola, for the point of parameter U on this parabola
ReversedParameter(U: number): number;

// Returns the value of the first or last parameter of this parabola
FirstParameter(): number;

// Returns the value of the first or last parameter of this parabola
LastParameter(): number;

// Returns False
IsClosed(): boolean;

// Returns False
IsPeriodic(): boolean;

// Computes the directrix of this parabola
Directrix(): gp_Ax1;

// Returns 1
Eccentricity(): number;

// Computes the focus of this parabola
Focus(): gp_Pnt;

// Computes the focal distance of this parabola The focal distance is the distance between the apex and the focus of the parabola
Focal(): number;

// Computes the parameter of this parabola which is the distance between its focus and its directrix
Parameter(): number;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Returns the point of parameter U and the first derivative
EvalD1(U: number): Geom_Curve_ResD1;

// Returns the point of parameter U, the first and second derivatives
EvalD2(U: number): Geom_Curve_ResD2;

// Returns the point of parameter U, the first, second and third derivatives
EvalD3(U: number): Geom_Curve_ResD3;

// For the point of parameter U of this parabola, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec;

// Applies the transformation T to this parabola
Transform(T: gp_Trsf): void;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf): number;

// Creates a new object which is a copy of this parabola
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a plane in 3D space
Geom_Plane: declare class Geom_Plane extends Geom_ElementarySurface

constructor

// Set <me> so that <me> has the same geometric properties as Pl
SetPln(Pl: gp_Pln): void;

// Converts this plane into a {@link gp_Pln`gp_Pln`} plane
Pln(): gp_Pln;

// Changes the orientation of this plane in the u (or v) parametric direction
UReverse(): void;

// Computes the u parameter on the modified plane, produced when reversing the u parametric of this plane, for any point of u parameter U on this plane
UReversedParameter(U: number): number;

// Changes the orientation of this plane in the u (or v) parametric direction
VReverse(): void;

// Computes the v parameter on the modified plane, produced when reversing the v parametric of this plane, for any point of v parameter V on this plane
VReversedParameter(V: number): number;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Returns the parametric bounds U1, U2, V1 and V2 of this plane
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Computes the normalized coefficients of the plane's cartesian equation
Coefficients(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

// return False
IsUClosed(): boolean;

// return False
IsVClosed(): boolean;

// return False
IsUPeriodic(): boolean;

// return False
IsVPeriodic(): boolean;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// Computes the point P (U, V) on <me>
EvalD0(U: number, V: number): gp_Pnt;

// Computes the current point and the first derivatives in the directions U and V
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the current point, the first and the second derivatives in the directions U and V
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the current point, the first,the second and the third derivatives in the directions U and V
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this plane
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this plane
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Point describes the common behavior of geometric points in 3D space
Geom_Point: declare class Geom_Point extends Geom_Geometry

// returns the Coordinates of <me>
Coord(X: number, Y: number, Z: number): { X: number; Y: number; Z: number };

// returns a non transient copy of <me>
Pnt(): gp_Pnt;

// returns the X coordinate of <me>
X(): number;

// returns the Y coordinate of <me>
Y(): number;

// returns the Z coordinate of <me>
Z(): number;

// Computes the distance between <me> and <Other>
Distance(Other: Geom_Point): number;

// Computes the square distance between <me> and <Other>
SquareDistance(Other: Geom_Point): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a portion of a surface (a patch) limited by two values of the u parameter in the u parametric direction, and two values of the v parameter in the v parametric direction
Geom_RectangularTrimmedSurface: declare class Geom_RectangularTrimmedSurface extends Geom_BoundedSurface

constructor

// Modifies this patch by changing the trim values applied to the original surface The u parametric direction of this patch is oriented from U1 to U2
SetTrim(U1: number, U2: number, V1: number, V2: number, USense: boolean, VSense: boolean): void;
SetTrim(Param1: number, Param2: number, UTrim: boolean, Sense: boolean): void;
SetTrim(U1: number, U2: number, V1: number, V2: number, USense: boolean, VSense: boolean): void;
SetTrim(Param1: number, Param2: number, UTrim: boolean, Sense: boolean): void;

// Returns the Basis surface of <me>
BasisSurface(): Geom_Surface;

// Changes the orientation of this patch in the u parametric direction
UReverse(): void;

// Computes the u parameter on the modified surface, produced by when reversing its u parametric direction, for any point of u parameter U on this patch
UReversedParameter(U: number): number;

// Changes the orientation of this patch in the v parametric direction
VReverse(): void;

// Computes the v parameter on the modified surface, produced by when reversing its v parametric direction, for any point of v parameter V on this patch
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this patch
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the continuity of the surface
Continuity(): GeomAbs_Shape;

// Returns true if this patch is closed in U
IsUClosed(): boolean;

// Returns true if this patch is closed in V
IsVClosed(): boolean;

// Returns true if the order of derivation in the U parametric direction is N
IsCNu(N: number): boolean;

// Returns true if the order of derivation in the V parametric direction is N
IsCNv(N: number): boolean;

// Returns true if the basis surface is U-periodic and either not trimmed in U, or the trim spans an integer multiple of the U period
IsUPeriodic(): boolean;

// Returns the period of this patch in the u parametric direction
UPeriod(): number;

// Returns true if the basis surface is V-periodic and either not trimmed in V, or the trim spans an integer multiple of the V period
IsVPeriodic(): boolean;

// Returns the period of this patch in the v parametric direction
VPeriod(): number;

// computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// Computes the point of parameter (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at (U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this patch
Transform(T: gp_Trsf): void;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Creates a new object which is a copy of this patch
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a sphere
Geom_SphericalSurface: declare class Geom_SphericalSurface extends Geom_ElementarySurface

constructor

// Assigns the value R to the radius of this sphere
SetRadius(R: number): void;

// Converts the {@link gp_Sphere`gp_Sphere`} S into this sphere
SetSphere(S: gp_Sphere): void;

// Returns a non persistent sphere with the same geometric properties as <me>
Sphere(): gp_Sphere;

// Computes the u parameter on the modified surface, when reversing its u parametric direction, for any point of u parameter U on this sphere
UReversedParameter(U: number): number;

// Computes the v parameter on the modified surface, when reversing its v parametric direction, for any point of v parameter V on this sphere
VReversedParameter(V: number): number;

// Computes the area of the spherical surface
Area(): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this sphere
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the coefficients of the implicit equation of the quadric in the absolute cartesian coordinates system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

// Computes the coefficients of the implicit equation of this quadric in the absolute Cartesian coordinate system
Radius(): number;

// Computes the volume of the spherical surface
Volume(): number;

// Returns True
IsUClosed(): boolean;

// Returns False
IsVClosed(): boolean;

// Returns True
IsUPeriodic(): boolean;

// Returns False
IsVPeriodic(): boolean;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// Computes the point P (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the current point and the first derivatives in the directions U and V
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the current point, the first and the second derivatives in the directions U and V
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the current point, the first,the second and the third derivatives in the directions U and V
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this sphere
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this sphere
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the common behavior of surfaces in 3D space
Geom_Surface: declare class Geom_Surface extends Geom_Geometry

// Reverses the U direction of parametrization of <me>
UReverse(): void;

// Reverses the U direction of parametrization of <me>
UReversed(): Geom_Surface;

// Returns the parameter on the Ureversed surface for the point of parameter U on <me>
UReversedParameter(U: number): number;

// Reverses the V direction of parametrization of <me>
VReverse(): void;

// Reverses the V direction of parametrization of <me>
VReversed(): Geom_Surface;

// Returns the parameter on the Vreversed surface for the point of parameter V on <me>
VReversedParameter(V: number): number;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Returns the parametric bounds U1, U2, V1 and V2 of this surface
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Checks whether this surface is closed in the u parametric direction
IsUClosed(): boolean;

// Checks whether this surface is closed in the u parametric direction
IsVClosed(): boolean;

// Checks if this surface is periodic in the u parametric direction
IsUPeriodic(): boolean;

// Returns the period of this surface in the u parametric direction
UPeriod(): number;

// Checks if this surface is periodic in the v parametric direction
IsVPeriodic(): boolean;

// Returns the period of this surface in the v parametric direction
VPeriod(): number;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// Returns the Global Continuity of the surface in direction U and V
Continuity(): GeomAbs_Shape;

// Returns the order of continuity of the surface in the U parametric direction
IsCNu(N: number): boolean;

// Returns the order of continuity of the surface in the V parametric direction
IsCNv(N: number): boolean;

// Computes the point of parameter (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at the point (U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Computes the point of parameter (U, V)
D0(U: number, V: number, P: gp_Pnt): void;
// P: Mutated in place

// Computes the point and first partial derivatives
D1(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place

// Computes the point and partial derivatives up to 2nd order
D2(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place
// D2U: Mutated in place
// D2V: Mutated in place
// D2UV: Mutated in place

// Computes the point and partial derivatives up to 3rd order
D3(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;
// P: Mutated in place
// D1U: Mutated in place
// D1V: Mutated in place
// D2U: Mutated in place
// D2V: Mutated in place
// D2UV: Mutated in place
// D3U: Mutated in place
// D3V: Mutated in place
// D3UUV: Mutated in place
// D3UVV: Mutated in place

// Computes the derivative of order Nu in U and Nv in V
DN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Computes the point of parameter (U, V) on the surface
Value(U: number, V: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
