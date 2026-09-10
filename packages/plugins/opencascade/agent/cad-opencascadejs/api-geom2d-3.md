# libcascade — Geom2d (3)

6 top-level symbols. Signatures are verbatim typescript.

// Describes a branch of a hyperbola in the plane (2D space)
Geom2d_Hyperbola: declare class Geom2d_Hyperbola extends Geom2d_Conic

constructor

// Converts the {@link gp_Hypr2d`gp_Hypr2d`} hyperbola H into this hyperbola
SetHypr2d(H: gp_Hypr2d): void;

// Assigns a value to the major or minor radius of this hyperbola
SetMajorRadius(MajorRadius: number): void;

// Assigns a value to the major or minor radius of this hyperbola
SetMinorRadius(MinorRadius: number): void;

// Converts this hyperbola into a {@link gp_Hypr2d`gp_Hypr2d`} one
Hypr2d(): gp_Hypr2d;

// Computes the parameter on the reversed hyperbola, for the point of parameter U on this hyperbola
ReversedParameter(U: number): number;

// Returns RealFirst from {@link Standard `Standard`}
FirstParameter(): number;

// returns RealLast from {@link Standard `Standard`}
LastParameter(): number;

// Returns False
IsClosed(): boolean;

// return False for an hyperbola
IsPeriodic(): boolean;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = (B/A)\*X where A is the major radius of the hyperbola and B is the minor radius of the hyperbola
Asymptote1(): gp_Ax2d;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = -(B/A)\*X
Asymptote2(): gp_Ax2d;

// Computes the first conjugate branch relative to this hyperbola
ConjugateBranch1(): gp_Hypr2d;

// Computes the second conjugate branch relative to this hyperbola
ConjugateBranch2(): gp_Hypr2d;

// This directrix is the line normal to the XAxis of the hyperbola in the local plane (Z = 0) at a distance d = MajorRadius / e from the center of the hyperbola, where e is the eccentricity of the hyperbola
Directrix1(): gp_Ax2d;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the "YAxis" of the hyperbola
Directrix2(): gp_Ax2d;

// Returns the eccentricity of the hyperbola (e > 1)
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the hyperbola
Focus1(): gp_Pnt2d;

// Returns the second focus of the hyperbola
Focus2(): gp_Pnt2d;

// Returns the major or minor radius of this hyperbola
MajorRadius(): number;

// Returns the major or minor radius of this hyperbola
MinorRadius(): number;

// Computes the "other" branch of this hyperbola
OtherBranch(): gp_Hypr2d;

// Computes the parameter of this hyperbola
Parameter(): number;

// Returns in P the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Returns the point P of parameter U and the first derivative V1
EvalD1(U: number): Geom2d_Curve_ResD1;

// Returns the point P of parameter U, the first and second derivatives V1 and V2
EvalD2(U: number): Geom2d_Curve_ResD2;

// Returns the point P of parameter U, the first second and third derivatives V1 V2 and V3
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this hyperbola, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Applies the transformation T to this hyperbola
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this hyperbola
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an infinite line in the plane (2D space)
Geom2d_Line: declare class Geom2d_Line extends Geom2d_Curve

constructor

// Set <me> so that <me> has the same geometric properties as L
SetLin2d(L: gp_Lin2d): void;

// changes the direction of the line
SetDirection(V: gp_Dir2d): void;

// changes the direction of the line
Direction(): gp_Dir2d;

// Changes the "Location" point (origin) of the line
SetLocation(P: gp_Pnt2d): void;

// Changes the "Location" point (origin) of the line
Location(): gp_Pnt2d;

// Changes the "Location" and a the "Direction" of <me>
SetPosition(A: gp_Ax2d): void;

Position(): gp_Ax2d;

// Returns non persistent line from gp with the same geometric properties as <me>
Lin2d(): gp_Lin2d;

// Changes the orientation of this line
Reverse(): void;

// Computes the parameter on the reversed line for the point of parameter U on this line
ReversedParameter(U: number): number;

// Returns RealFirst from {@link Standard `Standard`}
FirstParameter(): number;

// Returns RealLast from {@link Standard `Standard`}
LastParameter(): number;

// Returns False
IsClosed(): boolean;

// Returns False
IsPeriodic(): boolean;

// Returns GeomAbs_CN, which is the global continuity of any line
Continuity(): GeomAbs_Shape;

// Computes the distance between <me> and the point P
Distance(P: gp_Pnt2d): number;

// Returns True
IsCN(N: number): boolean;

// Returns in P the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Returns the point P of parameter u and the first derivative V1
EvalD1(U: number): Geom2d_Curve_ResD1;

// Returns the point P of parameter U, the first and second derivatives V1 and V2
EvalD2(U: number): Geom2d_Curve_ResD2;

// V2 and V3 are vectors with null magnitude for a line
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this line, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Applies the transformation T to this line
Transform(T: gp_Trsf2d): void;

// Computes the parameter on the line transformed by T for the point of parameter U on this line
TransformedParameter(U: number, T: gp_Trsf2d): number;

// Returns the coefficient required to compute the parametric transformation of this line when transformation T is applied
ParametricTransformation(T: gp_Trsf2d): number;

// Creates a new object, which is a copy of this line
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the basis services for the creation, edition, modification and evaluation of planar offset curve
Geom2d_OffsetCurve: declare class Geom2d_OffsetCurve extends Geom2d_Curve

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): Geom2dEval_RepCurveDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: Geom2dEval_RepCurveDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Changes the direction of parametrization of <me>
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this offset curve
ReversedParameter(U: number): number;

// Changes this offset curve by assigning C as the basis curve from which it is built
SetBasisCurve(C: Geom2d_Curve, isNotCheckC0?: boolean): void;

// Changes this offset curve by assigning D as the offset value
SetOffsetValue(D: number): void;

// Returns the basis curve of this offset curve
BasisCurve(): Geom2d_Curve;

// Continuity of the Offset curve
Continuity(): GeomAbs_Shape;

// Warning! this should not be called if the basis curve is not at least C1
EvalD0(U: number): gp_Pnt2d;

// Warning! this should not be called if the continuity of the basis curve is not C2
EvalD1(U: number): Geom2d_Curve_ResD1;

// Warning! This should not be called if the continuity of the basis curve is not C3
EvalD2(U: number): Geom2d_Curve_ResD2;

// Warning! This should not be called if the continuity of the basis curve is not C4
EvalD3(U: number): Geom2d_Curve_ResD3;

// The returned vector gives the value of the derivative for the order of derivation N
EvalDN(U: number, N: number): gp_Vec2d;

// Returns the value of the first parameter of this offset curve
FirstParameter(): number;

// Returns the value of the last parameter of this offset curve
LastParameter(): number;

// Returns the offset value of this offset curve
Offset(): number;

// Returns True if the distance between the start point and the end point of the curve is lower or equal to Resolution from package gp
IsClosed(): boolean;

// Is the order of continuity of the curve N ? Warnings
IsCN(N: number): boolean;

// Is the parametrization of a curve is periodic ? If the basis curve is a circle or an ellipse the corresponding OffsetCurve is periodic
IsPeriodic(): boolean;

// Returns the period of this offset curve, i.e
Period(): number;

// Applies the transformation T to this offset curve
Transform(T: gp_Trsf2d): void;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf2d): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf2d): number;

// Creates a new object, which is a copy of this offset curve
Copy(): Geom2d_Geometry;

// Returns continuity of the basis curve
GetBasisCurveContinuity(): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a parabola in the plane (2D space)
Geom2d_Parabola: declare class Geom2d_Parabola extends Geom2d_Conic

constructor

// Assigns the value Focal to the focal length of this parabola
SetFocal(Focal: number): void;

// Converts the {@link gp_Parab2d`gp_Parab2d`} parabola Prb into this parabola
SetParab2d(Prb: gp_Parab2d): void;

// Returns the non persistent parabola from gp with the same geometric properties as <me>
Parab2d(): gp_Parab2d;

// Computes the parameter on the reversed parabola for the point of parameter U on this parabola
ReversedParameter(U: number): number;

// Returns RealFirst from {@link Standard `Standard`}
FirstParameter(): number;

// Returns RealLast from {@link Standard `Standard`}
LastParameter(): number;

// Returns False
IsClosed(): boolean;

// Returns False
IsPeriodic(): boolean;

// The directrix is parallel to the "YAxis" of the parabola
Directrix(): gp_Ax2d;

// Returns the eccentricity e = 1.0
Eccentricity(): number;

// Computes the focus of this parabola The focus is on the positive side of the "X Axis" of the local coordinate system of the parabola
Focus(): gp_Pnt2d;

// Computes the focal length of this parabola
Focal(): number;

// Computes the parameter of this parabola, which is the distance between its focus and its directrix
Parameter(): number;

// Returns in P the point of parameter U
EvalD0(U: number): gp_Pnt2d;

// Returns the point P of parameter U and the first derivative V1
EvalD1(U: number): Geom2d_Curve_ResD1;

// Returns the point P of parameter U, the first and second derivatives V1 and V2
EvalD2(U: number): Geom2d_Curve_ResD2;

// Returns the point P of parameter U, the first second and third derivatives V1 V2 and V3
EvalD3(U: number): Geom2d_Curve_ResD3;

// For the point of parameter U of this parabola, computes the vector corresponding to the Nth derivative
EvalDN(U: number, N: number): gp_Vec2d;

// Applies the transformation T to this parabola
Transform(T: gp_Trsf2d): void;

// Computes the parameter on the transformed parabola, for the point of parameter U on this parabola
TransformedParameter(U: number, T: gp_Trsf2d): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf2d): number;

// Creates a new object, which is a copy of this parabola
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class Point describes the common behavior of geometric points in 2D space
Geom2d_Point: declare class Geom2d_Point extends Geom2d_Geometry

// returns the Coordinates of <me>
Coord(X: number, Y: number): { X: number; Y: number };

// returns a non persistent copy of <me>
Pnt2d(): gp_Pnt2d;

// returns the X coordinate of <me>
X(): number;

// returns the Y coordinate of <me>
Y(): number;

// computes the distance between <me> and <Other>
Distance(Other: Geom2d_Point): number;

// computes the square distance between <me> and <Other>
SquareDistance(Other: Geom2d_Point): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class Transformation allows to create Translation, Rotation, Symmetry, Scaling and complex transformations obtained by combination of the previous elementary transformations
Geom2d_Transformation: declare class Geom2d_Transformation extends Standard_Transient

constructor

// Makes the transformation into a symmetrical transformation with respect to a point P
SetMirror(P: gp_Pnt2d): void;
SetMirror(A: gp_Ax2d): void;
SetMirror(P: gp_Pnt2d): void;
SetMirror(A: gp_Ax2d): void;

// Assigns to this transformation the geometric properties of a rotation at angle Ang (in radians) about point P
SetRotation(P: gp_Pnt2d, Ang: number): void;

// Makes the transformation into a scale
SetScale(P: gp_Pnt2d, S: number): void;

// Makes a transformation allowing passage from the coordinate system "FromSystem1" to the coordinate system "ToSystem2"
SetTransformation(FromSystem1: gp_Ax2d, ToSystem2: gp_Ax2d): void;
SetTransformation(ToSystem: gp_Ax2d): void;
SetTransformation(FromSystem1: gp_Ax2d, ToSystem2: gp_Ax2d): void;
SetTransformation(ToSystem: gp_Ax2d): void;

// Makes the transformation into a translation
SetTranslation(V: gp_Vec2d): void;
SetTranslation(P1: gp_Pnt2d, P2: gp_Pnt2d): void;
SetTranslation(V: gp_Vec2d): void;
SetTranslation(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

// Makes the transformation into a transformation T from package gp
SetTrsf2d(T: gp_Trsf2d): void;

// Checks whether this transformation is an indirect transformation
IsNegative(): boolean;

// Returns the nature of this transformation as a value of the gp_TrsfForm enumeration
Form(): gp_TrsfForm;

// Returns the scale value of the transformation
ScaleFactor(): number;

// Converts this transformation into a {@link gp_Trsf2d`gp_Trsf2d`} transformation
Trsf2d(): gp_Trsf2d;

// Returns the coefficients of the global matrix of transformation
Value(Row: number, Col: number): number;

// Computes the inverse of this transformation and assigns the result to this transformation
Invert(): void;

// Computes the inverse of this transformation and creates a new one
Inverted(): Geom2d_Transformation;

// Computes the transformation composed with Other and <me>
Multiplied(Other: Geom2d_Transformation): Geom2d_Transformation;

// Computes the transformation composed with Other and <me>
Multiply(Other: Geom2d_Transformation): void;

// Raised if N < 0 and if the transformation is not inversible
Power(N: number): void;

// Raised if N < 0 and if the transformation is not inversible
Powered(N: number): Geom2d_Transformation;

// Computes the matrix of the transformation composed with <me> and Other
PreMultiply(Other: Geom2d_Transformation): void;

// Applies the transformation <me> to the triplet {X, Y}
Transforms(X?: number, Y?: number): { X: number; Y: number };

// Creates a new object, which is a copy of this transformation
Copy(): Geom2d_Transformation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
