# libcascade — Geom2dAdaptor

5 top-level symbols. Signatures are verbatim typescript.

// this package contains the geometric definition of 2d curves compatible with the Adaptor package templates
Geom2dAdaptor: declare class Geom2dAdaptor

constructor

// Inherited from GHCurve
static MakeCurve(HC: Adaptor2d_Curve2d): Geom2d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An interface between the services provided by any curve from the package Geom2d and those required of the curve by algorithms which use it
Geom2dAdaptor_Curve: declare class Geom2dAdaptor_Curve extends Adaptor2d_Curve2d

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

// Reset currently loaded curve (undone `Load()`)
Reset(): void;

// Standard_ConstructionError is raised if theUFirst > theULast + `Precision::PConfusion()`
Load(theCurve: Geom2d_Curve): void;
Load(theCurve: Geom2d_Curve, theUFirst: number, theULast: number): void;
Load(theCurve: Geom2d_Curve): void;
Load(theCurve: Geom2d_Curve, theUFirst: number, theULast: number): void;

// Returns true if the adaptor has been loaded with a curve
IsInitialized(): boolean;

Curve(): Geom2d_Curve;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor2d_Curve2d;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Computes the point of parameter U on the curve
Value(U: number): gp_Pnt2d;

// Computes the point of parameter U
D0(U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
// P: Mutated in place
// V: Mutated in place

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

// The returned vector gives the value of the derivative for the order of derivation N
DN(U: number, N: number): gp_Vec2d;

// returns the parametric resolution
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin2d;

Circle(): gp_Circ2d;

Ellipse(): gp_Elips2d;

Hyperbola(): gp_Hypr2d;

Parabola(): gp_Parab2d;

Degree(): number;

IsRational(): boolean;

NbPoles(): number;

NbKnots(): number;

NbSamples(): number;

Bezier(): Geom2d_BezierCurve;

BSpline(): Geom2d_BSplineCurve;

// Point evaluation
EvalD0(theU: number): gp_Pnt2d;

// D1 evaluation
EvalD1(theU: number): Geom2d_Curve_ResD1;

// D2 evaluation
EvalD2(theU: number): Geom2d_Curve_ResD2;

// D3 evaluation
EvalD3(theU: number): Geom2d_Curve_ResD3;

// DN evaluation
EvalDN(theU: number, theN: number): gp_Vec2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dAdaptor_Curve_OffsetData: interface Geom2dAdaptor_Curve_OffsetData

BasisAdaptor: Geom2dAdaptor_Curve

Offset: number

EvalRep: Geom2dEval_RepCurveDesc_Base

Geom2dAdaptor_Curve_BezierData: interface Geom2dAdaptor_Curve_BezierData

Curve: Geom2d_BezierCurve

Cache: BSplCLib_Cache

EvalRep: Geom2dEval_RepCurveDesc_Base

Geom2dAdaptor_Curve_BSplineData: interface Geom2dAdaptor_Curve_BSplineData

Curve: Geom2d_BSplineCurve

Cache: BSplCLib_Cache

EvalRep: Geom2dEval_RepCurveDesc_Base
