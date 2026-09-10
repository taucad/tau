# libcascade — GeomEval

16 top-level symbols. Signatures are verbatim typescript.

// 3D Algebraic-Hyperbolic-Trigonometric Bezier curve
GeomEval_AHTBezierCurve: declare class GeomEval_AHTBezierCurve extends Geom_BoundedCurve

constructor

// Returns the array of poles
Poles(): NCollection_Array1_gp_Pnt;

// Returns the array of weights
Weights(): NCollection_Array1_double;

// Returns the algebraic polynomial degree
AlgDegree(): number;

// Returns the hyperbolic frequency parameter
Alpha(): number;

// Returns the trigonometric frequency parameter
Beta(): number;

// Returns the number of poles
NbPoles(): number;

// Returns true if the curve is rational (has explicit weights)
IsRational(): boolean;

// Returns the start point of the curve (at parameter 0)
StartPoint(): gp_Pnt;

// Returns the end point of the curve (at parameter 1)
EndPoint(): gp_Pnt;

// Reversal is not supported for this eval curve
Reverse(): void;

// Reversal is not supported for this eval curve
ReversedParameter(U: number): number;

// Returns the value of the first parameter
FirstParameter(): number;

// Returns the value of the last parameter
LastParameter(): number;

// Returns true if the curve is closed
IsClosed(): boolean;

// Returns false
IsPeriodic(): boolean;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns true for any N
IsCN(N: number): boolean;

// Computes the point at parameter U
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec;
// U: the parameter value
// N: the derivative order (must be >= 1)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this curve
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tensor-product Algebraic-Hyperbolic-Trigonometric Bezier surface
GeomEval_AHTBezierSurface: declare class GeomEval_AHTBezierSurface extends Geom_BoundedSurface

constructor

// Returns the 2D array of poles
Poles(): NCollection_Array2_gp_Pnt;

// Returns the 2D array of weights
Weights(): NCollection_Array2_double;

// Returns the algebraic polynomial degree in U
AlgDegreeU(): number;

// Returns the algebraic polynomial degree in V
AlgDegreeV(): number;

// Returns the hyperbolic frequency in U
AlphaU(): number;

// Returns the hyperbolic frequency in V
AlphaV(): number;

// Returns the trigonometric frequency in U
BetaU(): number;

// Returns the trigonometric frequency in V
BetaV(): number;

// Returns the number of poles in U direction
NbPolesU(): number;

// Returns the number of poles in V direction
NbPolesV(): number;

// Returns true if the surface is rational in U direction
IsURational(): boolean;

// Returns true if the surface is rational in V direction
IsVRational(): boolean;

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns the parametric bounds
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };
// U1: lower U bound (0)
// U2: upper U bound (1)
// V1: lower V bound (0)
// V2: upper V bound (1)

// Returns false
IsUClosed(): boolean;

// Returns false
IsVClosed(): boolean;

// Returns false
IsUPeriodic(): boolean;

// Returns false
IsVPeriodic(): boolean;

// Isoparametric curve extraction is not supported for this eval surface
UIso(U: number): Geom_Curve;

// Isoparametric curve extraction is not supported for this eval surface
VIso(V: number): Geom_Curve;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns true for any N
IsCNu(N: number): boolean;

// Returns true for any N
IsCNv(N: number): boolean;

// Computes the point at parameters (U, V)
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;
// U: the u parameter
// V: the v parameter
// Nu: derivative order in u (must be >= 0)
// Nv: derivative order in v (must be >= 0)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this surface
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a circular helicoid surface
GeomEval_CircularHelicoidSurface: declare class GeomEval_CircularHelicoidSurface extends Geom_ElementarySurface

constructor

// Returns the pitch
Pitch(): number;

// Sets a new pitch value
SetPitch(thePitch: number): void;
// thePitch: the new pitch (must be != 0)

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns infinite bounds for both parameters
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns false
IsUClosed(): boolean;

// Returns false
IsVClosed(): boolean;

// Returns false
IsUPeriodic(): boolean;

// Returns false
IsVPeriodic(): boolean;

// Isoparametric curve extraction is not supported for this eval surface
UIso(U: number): Geom_Curve;

// Isoparametric curve extraction is not supported for this eval surface
VIso(V: number): Geom_Curve;

// Computes the point S(U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in u and Nv in v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this surface
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a circular helix in 3D space
GeomEval_CircularHelixCurve: declare class GeomEval_CircularHelixCurve extends Geom_Curve

constructor

// Returns the local coordinate system
Position(): gp_Ax2;

// Returns the helix radius
Radius(): number;

// Returns the pitch (axial advance per 2\*Pi turn)
Pitch(): number;

// Reversal of parametrization is not supported for this eval geometry
Reverse(): void;

// Reversal of parametrization is not supported for this eval geometry
ReversedParameter(U: number): number;

// Returns -`Precision::Infinite()`
FirstParameter(): number;

// Returns `Precision::Infinite()`
LastParameter(): number;

// Returns false
IsClosed(): boolean;

// Returns false
IsPeriodic(): boolean;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns true for any N >= 0
IsCN(N: number): boolean;

// Computes the point at parameter U
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec;
// U: the parameter value
// N: the derivative order (must be >= 1)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this curve
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a triaxial ellipsoid surface
GeomEval_EllipsoidSurface: declare class GeomEval_EllipsoidSurface extends Geom_ElementarySurface

constructor

// Returns the semi-axis A (along XDir)
SemiAxisA(): number;

// Returns the semi-axis B (along YDir)
SemiAxisB(): number;

// Returns the semi-axis C (along ZDir)
SemiAxisC(): number;

// Assigns the value theA to the semi-axis A
SetSemiAxisA(theA: number): void;
// theA: the new semi-axis value (must be > 0)

// Assigns the value theB to the semi-axis B
SetSemiAxisB(theB: number): void;
// theB: the new semi-axis value (must be > 0)

// Assigns the value theC to the semi-axis C
SetSemiAxisC(theC: number): void;
// theC: the new semi-axis value (must be > 0)

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this ellipsoid
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };
// U1: lower U bound (0)
// U2: upper U bound (2\*Pi)
// V1: lower V bound (-Pi/2)
// V2: upper V bound (Pi/2)

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

// Computes the point P(U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and the first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;
// U: the u parameter
// V: the v parameter
// Nu: derivative order in u (must be >= 0)
// Nv: derivative order in v (must be >= 0)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this ellipsoid
Copy(): Geom_Geometry;

// Returns the coefficients of the implicit equation of the quadric in the absolute Cartesian coordinate system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a hyperbolic paraboloid (saddle surface)
GeomEval_HypParaboloidSurface: declare class GeomEval_HypParaboloidSurface extends Geom_ElementarySurface

constructor

// Returns the first semi-axis length A
SemiAxisA(): number;

// Returns the second semi-axis length B
SemiAxisB(): number;

// Assigns the value theA to the first semi-axis length
SetSemiAxisA(theA: number): void;
// theA: the new first semi-axis length (must be > 0)

// Assigns the value theB to the second semi-axis length
SetSemiAxisB(theB: number): void;
// theB: the new second semi-axis length (must be > 0)

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this surface
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };
// U1: lower U bound (-`Precision::Infinite()`)
// U2: upper U bound (`Precision::Infinite()`)
// V1: lower V bound (-`Precision::Infinite()`)
// V2: upper V bound (`Precision::Infinite()`)

// Returns False
IsUClosed(): boolean;

// Returns False
IsVClosed(): boolean;

// Returns False
IsUPeriodic(): boolean;

// Returns False
IsVPeriodic(): boolean;

// Computes the U isoparametric curve
UIso(U: number): Geom_Curve;

// Computes the V isoparametric curve
VIso(V: number): Geom_Curve;

// Computes the point P(U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and the first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;
// U: the u parameter
// V: the v parameter
// Nu: derivative order in u (must be >= 0)
// Nv: derivative order in v (must be >= 0)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this hyperbolic paraboloid
Copy(): Geom_Geometry;

// Returns the coefficients of the implicit equation of the quadric in the absolute Cartesian coordinate system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a hyperboloid of revolution surface (one-sheet or two-sheet)
GeomEval_HyperboloidSurface: declare class GeomEval_HyperboloidSurface extends Geom_ElementarySurface

constructor

// Returns the first semi-axis radius
R1(): number;

// Returns the second semi-axis radius
R2(): number;

// Returns the sheet mode
Mode(): GeomEval_HyperboloidSurface_SheetMode;

// Assigns the value theR1 to the first semi-axis radius
SetR1(theR1: number): void;
// theR1: the new first semi-axis radius (must be > 0)

// Assigns the value theR2 to the second semi-axis radius
SetR2(theR2: number): void;
// theR2: the new second semi-axis radius (must be > 0)

// Sets the sheet mode
SetMode(theMode: GeomEval_HyperboloidSurface_SheetMode): void;
// theMode: one-sheet or two-sheet mode

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this hyperboloid
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };
// U1: lower U bound (0)
// U2: upper U bound (2\*Pi)
// V1: lower V bound (-`Precision::Infinite()`)
// V2: upper V bound (`Precision::Infinite()`)

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

// Computes the point P(U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and the first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;
// U: the u parameter
// V: the v parameter
// Nu: derivative order in u (must be >= 0)
// Nv: derivative order in v (must be >= 0)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this hyperboloid
Copy(): Geom_Geometry;

// Returns the coefficients of the implicit equation of the quadric in the absolute Cartesian coordinate system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sheet mode selector
GeomEval_HyperboloidSurface_SheetMode: typeof GeomEval_HyperboloidSurface_SheetMode[keyof typeof GeomEval_HyperboloidSurface_SheetMode]

// Describes a circular paraboloid surface of revolution
GeomEval_ParaboloidSurface: declare class GeomEval_ParaboloidSurface extends Geom_ElementarySurface

constructor

// Returns the focal distance of this paraboloid
Focal(): number;

// Assigns the value theFocal to the focal distance of this paraboloid
SetFocal(theFocal: number): void;
// theFocal: the new focal distance (must be > 0)

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns the parametric bounds U1, U2, V1 and V2 of this paraboloid
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };
// U1: lower U bound (0)
// U2: upper U bound (2\*Pi)
// V1: lower V bound (-`Precision::Infinite()`)
// V2: upper V bound (`Precision::Infinite()`)

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

// Computes the point P(U, V) on the surface
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point and the first partial derivatives at (U, V)
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction u and Nv in the direction v
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;
// U: the u parameter
// V: the v parameter
// Nu: derivative order in u (must be >= 0)
// Nv: derivative order in v (must be >= 0)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this paraboloid
Copy(): Geom_Geometry;

// Returns the coefficients of the implicit equation of the quadric in the absolute Cartesian coordinate system
Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepCurveDesc_Base: declare class GeomEval_RepCurveDesc_Base extends Standard_Transient

Representation: Geom_Curve

GetKind(): GeomEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepCurveDesc_Base_Kind: typeof GeomEval_RepCurveDesc_Base_Kind[keyof typeof GeomEval_RepCurveDesc_Base_Kind]

GeomEval_RepCurveDesc_DerivBounded: declare class GeomEval_RepCurveDesc_DerivBounded extends GeomEval_RepCurveDesc_Base

constructor

MaxDerivOrder: number

GetKind(): GeomEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepCurveDesc_Domain1d: declare class GeomEval_RepCurveDesc_Domain1d

constructor

First: number

Last: number

Contains(theU: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepCurveDesc_Full: declare class GeomEval_RepCurveDesc_Full extends GeomEval_RepCurveDesc_Base

constructor

GetKind(): GeomEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepCurveDesc_Map1d: declare class GeomEval_RepCurveDesc_Map1d

constructor

Scale: number

Offset: number

IsIdentity(): boolean;

IsValid(): boolean;

Map(theU: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepCurveDesc_Mapped: declare class GeomEval_RepCurveDesc_Mapped extends GeomEval_RepCurveDesc_Base

constructor

MaxDerivOrder: number

Domain: GeomEval_RepCurveDesc_Domain1d | null | undefined

ParamMap: GeomEval_RepCurveDesc_Map1d

GetKind(): GeomEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
