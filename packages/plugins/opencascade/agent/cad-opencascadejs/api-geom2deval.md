# libcascade — Geom2dEval

13 top-level symbols. Signatures are verbatim typescript.

// 2D Algebraic-Hyperbolic-Trigonometric Bezier curve
Geom2dEval_AHTBezierCurve: declare class Geom2dEval_AHTBezierCurve extends Geom2d_BoundedCurve

constructor

// Returns the array of poles
Poles(): NCollection_Array1_gp_Pnt2d;

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
StartPoint(): gp_Pnt2d;

// Returns the end point of the curve (at parameter 1)
EndPoint(): gp_Pnt2d;

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
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;
// U: the parameter value
// N: the derivative order (must be >= 1)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a 2D Archimedean spiral curve
Geom2dEval_ArchimedeanSpiralCurve: declare class Geom2dEval_ArchimedeanSpiralCurve extends Geom2d_Curve

constructor

// Returns the local coordinate system
Position(): gp_Ax2d;

// Returns the initial radius
InitialRadius(): number;

// Returns the growth rate per radian
GrowthRate(): number;

// Reversal is not supported for this eval curve
Reverse(): void;

// Reversal is not supported for this eval curve
ReversedParameter(U: number): number;

// Returns 0
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
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a 2D involute of a circle
Geom2dEval_CircleInvoluteCurve: declare class Geom2dEval_CircleInvoluteCurve extends Geom2d_Curve

constructor

// Returns the local coordinate system
Position(): gp_Ax2d;

// Returns the base circle radius
Radius(): number;

// Reversal is not supported for this eval curve
Reverse(): void;

// Reversal is not supported for this eval curve
ReversedParameter(U: number): number;

// Returns 0
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
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a 2D logarithmic (equiangular) spiral curve
Geom2dEval_LogarithmicSpiralCurve: declare class Geom2dEval_LogarithmicSpiralCurve extends Geom2d_Curve

constructor

// Returns the local coordinate system
Position(): gp_Ax2d;

// Returns the scale factor
Scale(): number;
Scale(P: gp_Pnt2d, S: number): void;
Scale(): number;
Scale(P: gp_Pnt2d, S: number): void;

// Returns the growth exponent
GrowthExponent(): number;

// Reversal is not supported for this eval curve
Reverse(): void;

// Reversal is not supported for this eval curve
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
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Base: declare class Geom2dEval_RepCurveDesc_Base extends Standard_Transient

Representation: Geom2d_Curve

GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Base_Kind: typeof Geom2dEval_RepCurveDesc_Base_Kind[keyof typeof Geom2dEval_RepCurveDesc_Base_Kind]

Geom2dEval_RepCurveDesc_DerivBounded: declare class Geom2dEval_RepCurveDesc_DerivBounded extends Geom2dEval_RepCurveDesc_Base

constructor

MaxDerivOrder: number

GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Domain1d: declare class Geom2dEval_RepCurveDesc_Domain1d

constructor

First: number

Last: number

Contains(theU: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Full: declare class Geom2dEval_RepCurveDesc_Full extends Geom2dEval_RepCurveDesc_Base

constructor

GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Map1d: declare class Geom2dEval_RepCurveDesc_Map1d

constructor

Scale: number

Offset: number

IsIdentity(): boolean;

IsValid(): boolean;

Map(theU: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Mapped: declare class Geom2dEval_RepCurveDesc_Mapped extends Geom2dEval_RepCurveDesc_Base

constructor

MaxDerivOrder: number

Domain: Geom2dEval_RepCurveDesc_Domain1d | null | undefined

ParamMap: Geom2dEval_RepCurveDesc_Map1d

GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a 2D sine wave curve
Geom2dEval_SineWaveCurve: declare class Geom2dEval_SineWaveCurve extends Geom2d_Curve

constructor

// Returns the local coordinate system
Position(): gp_Ax2d;

// Returns the amplitude
Amplitude(): number;

// Returns the angular frequency
Omega(): number;

// Returns the phase shift
Phase(): number;

// Reversal is not supported for this eval curve
Reverse(): void;

// Reversal is not supported for this eval curve
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
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec2d;

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// 2D Trigonometric Bezier curve
Geom2dEval_TBezierCurve: declare class Geom2dEval_TBezierCurve extends Geom2d_BoundedCurve

constructor

// Returns the poles array
Poles(): NCollection_Array1_gp_Pnt2d;

// Returns the weights array (empty if non-rational)
Weights(): NCollection_Array1_double;

// Returns the frequency parameter alpha
Alpha(): number;

// Returns the number of poles
NbPoles(): number;

// Returns the trigonometric order n (NbPoles = 2\*n + 1)
Order(): number;

// Returns true if the curve is rational
IsRational(): boolean;

// Returns the start point C(0)
StartPoint(): gp_Pnt2d;

// Returns the end point C(Pi/alpha)
EndPoint(): gp_Pnt2d;

// Reversal is not supported for this eval curve
Reverse(): void;

// Reversal is not supported for this eval curve
ReversedParameter(U: number): number;

// Returns the first parameter value
FirstParameter(): number;

// Returns the last parameter value
LastParameter(): number;

// Returns true if StartPoint and EndPoint coincide
IsClosed(): boolean;

// Returns false
IsPeriodic(): boolean;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns true for all N
IsCN(N: number): boolean;

// Computes the point C(U)
EvalD0(U: number): gp_Pnt2d;

// Computes the point and first derivative at U
EvalD1(U: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at U
EvalD2(U: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at U
EvalD3(U: number): Geom2d_Curve_ResD3;

// Computes the N-th derivative at U
EvalDN(U: number, N: number): gp_Vec2d;
// U: parameter value
// N: derivative order (must be >= 1)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf2d): void;

// Creates a new object which is a copy of this T-Bezier curve
Copy(): Geom2d_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
