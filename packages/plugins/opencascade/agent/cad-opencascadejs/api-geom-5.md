# libcascade — Geom (5)

5 top-level symbols. Signatures are verbatim typescript.

// The abstract class Geometry for 3D space is the root class of all geometric objects from the Geom package
Geom_Geometry: declare class Geom_Geometry extends Standard_Transient

// Performs the symmetrical transformation of a Geometry with respect to the point P which is the center of the symmetry
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;

// Rotates a Geometry
Rotate(A1: gp_Ax1, Ang: number): void;

// Scales a Geometry
Scale(P: gp_Pnt, S: number): void;

// Translates a Geometry
Translate(V: gp_Vec): void;
Translate(P1: gp_Pnt, P2: gp_Pnt): void;
Translate(V: gp_Vec): void;
Translate(P1: gp_Pnt, P2: gp_Pnt): void;

// Transformation of a geometric object
Transform(T: gp_Trsf): void;

Mirrored(P: gp_Pnt): Geom_Geometry;
Mirrored(A1: gp_Ax1): Geom_Geometry;
Mirrored(A2: gp_Ax2): Geom_Geometry;
Mirrored(P: gp_Pnt): Geom_Geometry;
Mirrored(A1: gp_Ax1): Geom_Geometry;
Mirrored(A2: gp_Ax2): Geom_Geometry;
Mirrored(P: gp_Pnt): Geom_Geometry;
Mirrored(A1: gp_Ax1): Geom_Geometry;
Mirrored(A2: gp_Ax2): Geom_Geometry;

Rotated(A1: gp_Ax1, Ang: number): Geom_Geometry;

Scaled(P: gp_Pnt, S: number): Geom_Geometry;

Transformed(T: gp_Trsf): Geom_Geometry;

Translated(V: gp_Vec): Geom_Geometry;
Translated(P1: gp_Pnt, P2: gp_Pnt): Geom_Geometry;
Translated(V: gp_Vec): Geom_Geometry;
Translated(P1: gp_Pnt, P2: gp_Pnt): Geom_Geometry;

// Creates a new object which is a copy of this geometric object
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a branch of a hyperbola in 3D space
Geom_Hyperbola: declare class Geom_Hyperbola extends Geom_Conic

constructor

// Converts the {@link gp_Hypr`gp_Hypr`} hyperbola H into this hyperbola
SetHypr(H: gp_Hypr): void;

// Assigns a value to the major radius of this hyperbola
SetMajorRadius(MajorRadius: number): void;

// Assigns a value to the minor radius of this hyperbola
SetMinorRadius(MinorRadius: number): void;

// returns the non transient parabola from gp with the same geometric properties as <me>
Hypr(): gp_Hypr;

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

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = (B/A)\*X
Asymptote1(): gp_Ax1;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = -(B/A)\*X
Asymptote2(): gp_Ax1;

// This branch of hyperbola is on the positive side of the YAxis of <me>
ConjugateBranch1(): gp_Hypr;

// This branch of hyperbola is on the negative side of the YAxis of <me>
ConjugateBranch2(): gp_Hypr;

// This directrix is the line normal to the XAxis of the hyperbola in the local plane (Z = 0) at a distance d = MajorRadius / e from the center of the hyperbola, where e is the eccentricity of the hyperbola
Directrix1(): gp_Ax1;

// This line is obtained by the symmetrical transformation of "directrix1" with respect to the YAxis of the hyperbola
Directrix2(): gp_Ax1;

// Returns the eccentricity of the hyperbola (e > 1)
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the hyperbola
Focus1(): gp_Pnt;

// Returns the second focus of the hyperbola
Focus2(): gp_Pnt;

// Returns the major or minor radius of this hyperbola
MajorRadius(): number;

// Returns the major or minor radius of this hyperbola
MinorRadius(): number;

// Computes the "other" branch of this hyperbola
OtherBranch(): gp_Hypr;

// Returns p = (e _ e - 1) _ MajorRadius where e is the eccentricity of the hyperbola
Parameter(): number;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Returns the point of parameter U and the first derivative
EvalD1(U: number): Geom_Curve_ResD1;

// Returns the point of parameter U, the first and second derivatives
EvalD2(U: number): Geom_Curve_ResD2;

// Returns the point of parameter U, the first, second and third derivatives
EvalD3(U: number): Geom_Curve_ResD3;

// Returns the vector corresponding to the derivative for the order of derivation N
EvalDN(U: number, N: number): gp_Vec;

// Applies the transformation T to this hyperbola
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this hyperbola
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an infinite line
Geom_Line: declare class Geom_Line extends Geom_Curve

constructor

// Set <me> so that <me> has the same geometric properties as L
SetLin(L: gp_Lin): void;

// changes the direction of the line
SetDirection(V: gp_Dir): void;

// changes the "Location" point (origin) of the line
SetLocation(P: gp_Pnt): void;

// changes the "Location" and a the "Direction" of <me>
SetPosition(A1: gp_Ax1): void;

// Returns non transient line from gp with the same geometric properties as <me>
Lin(): gp_Lin;

// Returns the positioning axis of this line
Position(): gp_Ax1;

// Changes the orientation of this line
Reverse(): void;

// Computes the parameter on the reversed line for the point of parameter U on this line
ReversedParameter(U: number): number;

// Returns the value of the first parameter of this line
FirstParameter(): number;

// Returns the value of the last parameter of this line
LastParameter(): number;

// returns False
IsClosed(): boolean;

// returns False
IsPeriodic(): boolean;

// Returns GeomAbs_CN, which is the global continuity of any line
Continuity(): GeomAbs_Shape;

// returns True
IsCN(N: number): boolean;

// Returns the point of parameter U
EvalD0(U: number): gp_Pnt;

// Returns the point of parameter U and the first derivative
EvalD1(U: number): Geom_Curve_ResD1;

// Returns the point of parameter U, the first and second derivatives
EvalD2(U: number): Geom_Curve_ResD2;

// Returns the point of parameter U, the first, second and third derivatives
EvalD3(U: number): Geom_Curve_ResD3;

// Returns the vector corresponding to the derivative for the order of derivation N
EvalDN(U: number, N: number): gp_Vec;

// Applies the transformation T to this line
Transform(T: gp_Trsf): void;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf): number;

// Creates a new object which is a copy of this line
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the basis services for an offset curve in 3D space
Geom_OffsetCurve: declare class Geom_OffsetCurve extends Geom_Curve

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepCurveDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepCurveDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Changes the orientation of this offset curve
Reverse(): void;

// Computes the parameter on the reversed curve for the point of parameter U on this offset curve
ReversedParameter(U: number): number;

// Changes this offset curve by assigning C as the basis curve from which it is built
SetBasisCurve(C: Geom_Curve, isNotCheckC0?: boolean): void;

// Changes this offset curve by assigning V as the reference vector used to compute the offset direction
SetDirection(V: gp_Dir): void;

// Changes this offset curve by assigning D as the offset value
SetOffsetValue(D: number): void;

// Returns the basis curve of this offset curve
BasisCurve(): Geom_Curve;

// Returns the global continuity of this offset curve as a value of the GeomAbs_Shape enumeration
Continuity(): GeomAbs_Shape;

// Returns the reference vector of this offset curve
Direction(): gp_Dir;

// Warning! this should not be called if the basis curve is not at least C1
EvalD0(U: number): gp_Pnt;

// Warning! this should not be called if the continuity of the basis curve is not C2
EvalD1(U: number): Geom_Curve_ResD1;

// Warning! this should not be called if the continuity of the basis curve is not C3
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom_Curve_ResD3;

// The returned vector gives the value of the derivative for the order of derivation N
EvalDN(U: number, N: number): gp_Vec;

// Returns the value of the first parameter of this offset curve
FirstParameter(): number;

// Returns the value of the last parameter of this offset curve
LastParameter(): number;

// Returns the offset value of this offset curve
Offset(): number;

// Returns True if the distance between the start point and the end point of the curve is lower or equal to Resolution from package gp
IsClosed(): boolean;

// Returns true if the degree of continuity of the basis curve of this offset curve is at least N + 1
IsCN(N: number): boolean;

// Returns true if this offset curve is periodic, i.e
IsPeriodic(): boolean;

// Returns the period of this offset curve, i.e
Period(): number;

// Applies the transformation T to this offset curve
Transform(T: gp_Trsf): void;

// Returns the parameter on the transformed curve for the transform of the point of parameter U on <me>
TransformedParameter(U: number, T: gp_Trsf): number;

// Returns a coefficient to compute the parameter on the transformed curve for the transform of the point on <me>
ParametricTransformation(T: gp_Trsf): number;

// Creates a new object which is a copy of this offset curve
Copy(): Geom_Geometry;

// Returns continuity of the basis curve
GetBasisCurveContinuity(): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an offset surface in 3D space
Geom_OffsetSurface: declare class Geom_OffsetSurface extends Geom_Surface

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Raised if S is not at least C1
SetBasisSurface(S: Geom_Surface, isNotCheckC0?: boolean): void;

// Changes this offset surface by assigning D as the offset value
SetOffsetValue(D: number): void;

// Returns the offset value of this offset surface
Offset(): number;

// Returns the basis surface of this offset surface
BasisSurface(): Geom_Surface;

// Changes the orientation of this offset surface in the u parametric direction
UReverse(): void;

// Computes the u parameter on the modified surface, produced by reversing the u parametric direction of this offset surface, for any point of u parameter U on this offset surface
UReversedParameter(U: number): number;

// Changes the orientation of this offset surface in the v parametric direction
VReverse(): void;

// Computes the v parameter on the modified surface, produced by reversing the or v parametric direction of this offset surface, for any point of v parameter V on this offset surface
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this offset surface
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// This method returns the continuity of the basis surface - 1
Continuity(): GeomAbs_Shape;

// This method answer True if the continuity of the basis surface is N + 1 in the U parametric direction
IsCNu(N: number): boolean;

// This method answer True if the continuity of the basis surface is N + 1 in the V parametric direction
IsCNv(N: number): boolean;

// Checks whether this offset surface is closed in the u parametric direction
IsUClosed(): boolean;

// Checks whether this offset surface is closed in the u or v parametric direction
IsVClosed(): boolean;

// Returns true if this offset surface is periodic in the u parametric direction, i.e
IsUPeriodic(): boolean;

// Returns the period of this offset surface in the u parametric direction respectively, i.e
UPeriod(): number;

// Returns true if this offset surface is periodic in the v parametric direction, i.e
IsVPeriodic(): boolean;

// Returns the period of this offset surface in the v parametric direction respectively, i.e
VPeriod(): number;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// `P(U,V)=Pbasis+Offset*Ndir`
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at (U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this offset surface
Transform(T: gp_Trsf): void;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Creates a new object which is a copy of this offset surface
Copy(): Geom_Geometry;

// returns an equivalent surface of the offset surface when the basis surface is a canonic surface or a rectangular limited surface on canonic surface or if the offset is null
Surface(): Geom_Surface;

// if true, L is the local osculating surface along U at the point U,V
UOsculatingSurface(U: number, V: number, IsOpposite?: boolean): { returnValue: boolean; IsOpposite: boolean; UOsculSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

// if true, L is the local osculating surface along V at the point U,V
VOsculatingSurface(U: number, V: number, IsOpposite?: boolean): { returnValue: boolean; IsOpposite: boolean; VOsculSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

// Returns continuity of the basis surface
GetBasisSurfContinuity(): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
