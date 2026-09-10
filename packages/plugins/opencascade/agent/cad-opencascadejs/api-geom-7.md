# libcascade — Geom (7)

5 top-level symbols. Signatures are verbatim typescript.

// Describes a surface of linear extrusion ("extruded surface"), e.g
Geom_SurfaceOfLinearExtrusion: declare class Geom_SurfaceOfLinearExtrusion extends Geom_SweptSurface

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Assigns V as the "direction of extrusion" for this surface of linear extrusion
SetDirection(V: gp_Dir): void;

// Modifies this surface of linear extrusion by redefining its "basis curve" (the "extruded curve")
SetBasisCurve(C: Geom_Curve): void;

// Changes the orientation of this surface of linear extrusion in the u parametric direction
UReverse(): void;

// Computes the u parameter on the modified surface, produced by reversing its u parametric direction, for any point of u parameter U on this surface of linear extrusion
UReversedParameter(U: number): number;

// Changes the orientation of this surface of linear extrusion in the v parametric direction
VReverse(): void;

// Computes the v parameter on the modified surface, produced by reversing its u v parametric direction, for any point of v parameter V on this surface of linear extrusion
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this surface of linear extrusion
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// IsUClosed returns true if the "basis curve" of this surface of linear extrusion is closed
IsUClosed(): boolean;

// IsVClosed always returns false
IsVClosed(): boolean;

// IsCNu returns true if the degree of continuity for the "basis curve" of this surface of linear extrusion is at least N
IsCNu(N: number): boolean;

// IsCNv always returns true
IsCNv(N: number): boolean;

// IsUPeriodic returns true if the "basis curve" of this surface of linear extrusion is periodic
IsUPeriodic(): boolean;

// IsVPeriodic always returns false
IsVPeriodic(): boolean;

// Computes the U isoparametric curve of this surface of linear extrusion
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve of this surface of linear extrusion
VIso(V: number): Geom_Curve;

// Computes the point P (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at (U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this surface of linear extrusion
Transform(T: gp_Trsf): void;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Creates a new object which is a copy of this surface of linear extrusion
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a surface of revolution (revolved surface)
Geom_SurfaceOfRevolution: declare class Geom_SurfaceOfRevolution extends Geom_SweptSurface

constructor

// Returns true if an evaluation representation is attached
HasEvalRepresentation(): boolean;

// Returns the current evaluation representation descriptor (may be null)
EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

// Sets a new evaluation representation
SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

// Removes the evaluation representation
ClearEvalRepresentation(): void;

// Changes the axis of revolution
SetAxis(A1: gp_Ax1): void;

// Changes the direction of the revolution axis
SetDirection(V: gp_Dir): void;

// Changes the revolved curve of the surface
SetBasisCurve(C: Geom_Curve): void;

// Changes the location point of the revolution axis
SetLocation(P: gp_Pnt): void;

// Returns the revolution axis of the surface
Axis(): gp_Ax1;

// Returns the location point of the axis of revolution
Location(): gp_Pnt;

// Computes the position of the reference plane of the surface defined by the basis curve and the symmetry axis
ReferencePlane(): gp_Ax2;

// Changes the orientation of this surface of revolution in the u parametric direction
UReverse(): void;

// Computes the u parameter on the modified surface, when reversing its u parametric direction, for any point of u parameter U on this surface of revolution
UReversedParameter(U: number): number;

// Changes the orientation of this surface of revolution in the v parametric direction
VReverse(): void;

// Computes the v parameter on the modified surface, when reversing its v parametric direction, for any point of v parameter V on this surface of revolution
VReversedParameter(V: number): number;

// Computes the parameters on the transformed surface for the transform of the point of parameters U,V on <me>
TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

// Returns a 2d transformation used to find the new parameters of a point on the transformed surface
ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

// Returns the parametric bounds U1, U2 , V1 and V2 of this surface
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// IsUClosed always returns true
IsUClosed(): boolean;

// IsVClosed returns true if the meridian of this surface of revolution is closed
IsVClosed(): boolean;

// IsCNu always returns true
IsCNu(N: number): boolean;

// IsCNv returns true if the degree of continuity of the meridian of this surface of revolution is at least N
IsCNv(N: number): boolean;

// Returns True
IsUPeriodic(): boolean;

// IsVPeriodic returns true if the meridian of this surface of revolution is periodic
IsVPeriodic(): boolean;

// Computes the U isoparametric curve of this surface of revolution
UIso(U: number): Geom_Curve;

// Computes the U isoparametric curve of this surface of revolution
VIso(V: number): Geom_Curve;

// Computes the point P (U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at (U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Applies the transformation T to this surface of revolution
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this surface of revolution
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the common behavior for surfaces constructed by sweeping a curve with another curve
Geom_SweptSurface: declare class Geom_SweptSurface extends Geom_Surface

// returns the continuity of the surface
Continuity(): GeomAbs_Shape;

// Returns the reference direction of the swept surface
Direction(): gp_Dir;

// Returns the referenced curve of the surface
BasisCurve(): Geom_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a torus
Geom_ToroidalSurface: declare class Geom_ToroidalSurface extends Geom_ElementarySurface

constructor

// Modifies this torus by changing its major radius
SetMajorRadius(MajorRadius: number): void;

// Modifies this torus by changing its minor radius
SetMinorRadius(MinorRadius: number): void;

// Converts the {@link gp_Torus`gp_Torus`} torus T into this torus
SetTorus(T: gp_Torus): void;

// Returns the non transient torus with the same geometric properties as <me>
Torus(): gp_Torus;

// Return the parameter on the Ureversed surface for the point of parameter U on <me>
UReversedParameter(U: number): number;

// Return the parameter on the Ureversed surface for the point of parameter U on <me>
VReversedParameter(V: number): number;

// Computes the area of the surface
Area(): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this torus
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns the coefficients of the implicit equation of the surface in the absolute cartesian coordinate system
Coefficients(Coef: NCollection_Array1_double): void;
// Coef: Mutated in place

// Returns the major radius, or the minor radius, of this torus
MajorRadius(): number;

// Returns the major radius, or the minor radius, of this torus
MinorRadius(): number;

// Computes the volume
Volume(): number;

// Returns True
IsUClosed(): boolean;

// Returns True
IsVClosed(): boolean;

// Returns True
IsUPeriodic(): boolean;

// Returns True
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

// Applies the transformation T to this torus
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this torus
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes how to construct the following elementary transformations
Geom_Transformation: declare class Geom_Transformation extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Makes the transformation into a symmetrical transformation with respect to a point P
SetMirror(thePnt: gp_Pnt): void;
SetMirror(theA1: gp_Ax1): void;
SetMirror(theA2: gp_Ax2): void;
SetMirror(thePnt: gp_Pnt): void;
SetMirror(theA1: gp_Ax1): void;
SetMirror(theA2: gp_Ax2): void;
SetMirror(thePnt: gp_Pnt): void;
SetMirror(theA1: gp_Ax1): void;
SetMirror(theA2: gp_Ax2): void;

// Makes the transformation into a rotation
SetRotation(theA1: gp_Ax1, theAng: number): void;

// Makes the transformation into a scale
SetScale(thePnt: gp_Pnt, theScale: number): void;

// Makes a transformation allowing passage from the coordinate system "FromSystem1" to the coordinate system "ToSystem2"
SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
SetTransformation(theToSystem: gp_Ax3): void;
SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
SetTransformation(theToSystem: gp_Ax3): void;

// Makes the transformation into a translation
SetTranslation(theVec: gp_Vec): void;
SetTranslation(P1: gp_Pnt, P2: gp_Pnt): void;
SetTranslation(theVec: gp_Vec): void;
SetTranslation(P1: gp_Pnt, P2: gp_Pnt): void;

// Converts the {@link gp_Trsf`gp_Trsf`} transformation T into this transformation
SetTrsf(theTrsf: gp_Trsf): void;

// Checks whether this transformation is an indirect transformation
IsNegative(): boolean;

// Returns the nature of this transformation as a value of the gp_TrsfForm enumeration
Form(): gp_TrsfForm;

// Returns the scale value of the transformation
ScaleFactor(): number;

// Returns a non transient copy of <me>
Trsf(): gp_Trsf;

// Returns the coefficients of the global matrix of transformation
Value(theRow: number, theCol: number): number;

// Raised if the transformation is singular
Invert(): void;

// Raised if the transformation is singular
Inverted(): Geom_Transformation;

// Computes the transformation composed with Other and <me>
Multiplied(Other: Geom_Transformation): Geom_Transformation;

// Computes the transformation composed with Other and <me>
Multiply(theOther: Geom_Transformation): void;

// Computes the following composition of transformations if N > 0 <me> _ <me> _ .......\* <me>
Power(N: number): void;

// Raised if N < 0 and if the transformation is not inversible
Powered(N: number): Geom_Transformation;

// Computes the matrix of the transformation composed with <me> and Other
PreMultiply(Other: Geom_Transformation): void;

// Applies the transformation <me> to the triplet {X, Y, Z}
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

// Creates a new object which is a copy of this transformation
Copy(): Geom_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
