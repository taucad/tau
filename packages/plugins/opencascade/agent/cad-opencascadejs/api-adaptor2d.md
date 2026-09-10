# libcascade — Adaptor2d

3 top-level symbols. Signatures are verbatim typescript.

// Root class for 2D curves on which geometric algorithms work
Adaptor2d_Curve2d: declare class Adaptor2d_Curve2d extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

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

// Computes the point of parameter U on the curve
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

// Returns the parametric resolution corresponding to the real space resolution <R3d>
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

// Computes the point of parameter U on the curve
EvalD0(theU: number): gp_Pnt2d;

// Computes the point and first derivative at parameter U
EvalD1(theU: number): Geom2d_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(theU: number): Geom2d_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(theU: number): Geom2d_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(theU: number, theN: number): gp_Vec2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Use by the TopolTool to trim a surface
Adaptor2d_Line2d: declare class Adaptor2d_Line2d extends Adaptor2d_Curve2d

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

Load(L: gp_Lin2d): void;
Load(L: gp_Lin2d, UFirst: number, ULast: number): void;
Load(L: gp_Lin2d): void;
Load(L: gp_Lin2d, UFirst: number, ULast: number): void;

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

// Computes the point of parameter U on the curve
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

// Returns the parametric resolution corresponding to the real space resolution <R3d>
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

Bezier(): Geom2d_BezierCurve;

BSpline(): Geom2d_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an Offset curve (algorithmic 2d curve)
Adaptor2d_OffsetCurve: declare class Adaptor2d_OffsetCurve extends Adaptor2d_Curve2d

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor2d_Curve2d;

// Changes the curve
Load(S: Adaptor2d_Curve2d): void;
Load(Offset: number): void;
Load(Offset: number, WFirst: number, WLast: number): void;
Load(S: Adaptor2d_Curve2d): void;
Load(Offset: number): void;
Load(Offset: number, WFirst: number, WLast: number): void;
Load(S: Adaptor2d_Curve2d): void;
Load(Offset: number): void;
Load(Offset: number, WFirst: number, WLast: number): void;

Curve(): Adaptor2d_Curve2d;

Offset(): number;

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

// Computes the point of parameter U on the curve
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

// Returns the parametric resolution corresponding to the real space resolution <R3d>
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

Bezier(): Geom2d_BezierCurve;

BSpline(): Geom2d_BSplineCurve;

NbSamples(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
