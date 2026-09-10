# libcascade — GeomEval (2)

10 top-level symbols. Signatures are verbatim typescript.

GeomEval_RepSurfaceDesc_Base: declare class GeomEval_RepSurfaceDesc_Base extends Standard_Transient

Representation: Geom_Surface

GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Base_Kind: typeof GeomEval_RepSurfaceDesc_Base_Kind[keyof typeof GeomEval_RepSurfaceDesc_Base_Kind]

GeomEval_RepSurfaceDesc_DerivBounded: declare class GeomEval_RepSurfaceDesc_DerivBounded extends GeomEval_RepSurfaceDesc_Base

constructor

MaxDerivOrder: number

GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Domain2d: declare class GeomEval_RepSurfaceDesc_Domain2d

constructor

UFirst: number

ULast: number

VFirst: number

VLast: number

Contains(theU: number, theV: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Full: declare class GeomEval_RepSurfaceDesc_Full extends GeomEval_RepSurfaceDesc_Base

constructor

GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Map2d: declare class GeomEval_RepSurfaceDesc_Map2d

constructor

ScaleU: number

OffsetU: number

ScaleV: number

OffsetV: number

SwapUV: boolean

IsIdentity(): boolean;

IsValid(): boolean;

Map(theU: number, theV: number, theURep?: number, theVRep?: number): { theURep: number; theVRep: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Mapped: declare class GeomEval_RepSurfaceDesc_Mapped extends GeomEval_RepSurfaceDesc_Base

constructor

MaxDerivOrder: number

Domain: GeomEval_RepSurfaceDesc_Domain2d | null | undefined

ParamMap: GeomEval_RepSurfaceDesc_Map2d

GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a 3D sine wave curve
GeomEval_SineWaveCurve: declare class GeomEval_SineWaveCurve extends Geom_Curve

constructor

// Returns the local coordinate system
Position(): gp_Ax2;

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
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom_Curve_ResD3;

// Computes the N-th derivative at parameter U
EvalDN(U: number, N: number): gp_Vec;

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

// 3D Trigonometric Bezier curve
GeomEval_TBezierCurve: declare class GeomEval_TBezierCurve extends Geom_BoundedCurve

constructor

// Returns the poles array
Poles(): NCollection_Array1_gp_Pnt;

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
StartPoint(): gp_Pnt;

// Returns the end point C(Pi/alpha)
EndPoint(): gp_Pnt;

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
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at U
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at U
EvalD3(U: number): Geom_Curve_ResD3;

// Computes the N-th derivative at U
EvalDN(U: number, N: number): gp_Vec;
// U: parameter value
// N: derivative order (must be >= 1)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this T-Bezier curve
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tensor-product Trigonometric Bezier surface
GeomEval_TBezierSurface: declare class GeomEval_TBezierSurface extends Geom_BoundedSurface

constructor

// Returns the poles grid
Poles(): NCollection_Array2_gp_Pnt;

// Returns the weights grid (empty if non-rational)
Weights(): NCollection_Array2_double;

// Returns the frequency parameter alpha in the U direction
AlphaU(): number;

// Returns the frequency parameter alpha in the V direction
AlphaV(): number;

// Returns the number of poles in the U direction
NbUPoles(): number;

// Returns the number of poles in the V direction
NbVPoles(): number;

// Returns the trigonometric order in U (NbUPoles = 2\*nU + 1)
OrderU(): number;

// Returns the trigonometric order in V (NbVPoles = 2\*nV + 1)
OrderV(): number;

// Returns true if the surface is rational
IsRational(): boolean;

// Reversal is not supported for this eval surface
UReverse(): void;

// Reversal is not supported for this eval surface
UReversedParameter(U: number): number;

// Reversal is not supported for this eval surface
VReverse(): void;

// Reversal is not supported for this eval surface
VReversedParameter(V: number): number;

// Returns the parametric bounds
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };
// U1: lower U bound (0)
// U2: upper U bound (Pi/alphaU)
// V1: lower V bound (0)
// V2: upper V bound (Pi/alphaV)

// Returns true if the surface is closed in U
IsUClosed(): boolean;

// Returns true if the surface is closed in V
IsVClosed(): boolean;

// Returns false
IsUPeriodic(): boolean;

// Returns false
IsVPeriodic(): boolean;

// Returns GeomAbs_CN
Continuity(): GeomAbs_Shape;

// Returns true for all N
IsCNu(N: number): boolean;

// Returns true for all N
IsCNv(N: number): boolean;

// Isoparametric curve extraction is not supported for this eval surface
UIso(U: number): Geom_Curve;

// Isoparametric curve extraction is not supported for this eval surface
VIso(V: number): Geom_Curve;

// Computes the point S(U, V)
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
// Nu: derivative order in U (must be >= 0)
// Nv: derivative order in V (must be >= 0)

// Transformation is not supported for this eval geometry
Transform(T: gp_Trsf): void;

// Creates a new object which is a copy of this T-Bezier surface
Copy(): Geom_Geometry;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
