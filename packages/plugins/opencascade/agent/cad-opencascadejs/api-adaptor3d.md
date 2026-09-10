# libcascade — Adaptor3d

8 top-level symbols. Signatures are verbatim typescript.

// Root class for 3D curves on which geometric algorithms work
Adaptor3d_Curve: declare class Adaptor3d_Curve extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Computes the point of parameter U on the curve
Value(theU: number): gp_Pnt;

// Computes the point of parameter U on the curve
D0(theU: number, theP: gp_Pnt): void;
// theP: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
D1(theU: number, theP: gp_Pnt, theV: gp_Vec): void;
// theP: Mutated in place
// theV: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
D2(theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): void;
// theP: Mutated in place
// theV1: Mutated in place
// theV2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
D3(theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;
// theP: Mutated in place
// theV1: Mutated in place
// theV2: Mutated in place
// theV3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
DN(theU: number, theN: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Hyperbola(): gp_Hypr;

Parabola(): gp_Parab;

Degree(): number;

IsRational(): boolean;

NbPoles(): number;

NbKnots(): number;

Bezier(): Geom_BezierCurve;

BSpline(): Geom_BSplineCurve;

OffsetCurve(): Geom_OffsetCurve;

// Computes the point of parameter U on the curve
EvalD0(theU: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(theU: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(theU: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(theU: number): Geom_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(theU: number, theN: number): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An interface between the services provided by a curve lying on a surface from the package Geom and those required of the curve by algorithms which use it
Adaptor3d_CurveOnSurface: declare class Adaptor3d_CurveOnSurface extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Changes the surface
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor2d_Curve2d): void;
Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor2d_Curve2d): void;
Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;
Load(S: Adaptor3d_Surface): void;
Load(C: Adaptor2d_Curve2d): void;
Load(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): void;

GetCurve(): Adaptor2d_Curve2d;

GetSurface(): Adaptor3d_Surface;

ChangeCurve(): Adaptor2d_Curve2d;

ChangeSurface(): Adaptor3d_Surface;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Point evaluation
EvalD0(theU: number): gp_Pnt;

// D1 evaluation
EvalD1(theU: number): Geom_Curve_ResD1;

// D2 evaluation
EvalD2(theU: number): Geom_Curve_ResD2;

// D3 evaluation
EvalD3(theU: number): Geom_Curve_ResD3;

// DN evaluation
EvalDN(theU: number, theN: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Hyperbola(): gp_Hypr;

Parabola(): gp_Parab;

Degree(): number;

IsRational(): boolean;

NbPoles(): number;

NbKnots(): number;

Bezier(): Geom_BezierCurve;

BSpline(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Adaptor3d_HSurfaceTool: declare class Adaptor3d_HSurfaceTool

constructor

static FirstUParameter(theSurf: Adaptor3d_Surface): number;

static FirstVParameter(theSurf: Adaptor3d_Surface): number;

static LastUParameter(theSurf: Adaptor3d_Surface): number;

static LastVParameter(theSurf: Adaptor3d_Surface): number;

static NbUIntervals(theSurf: Adaptor3d_Surface, theSh: GeomAbs_Shape): number;

static NbVIntervals(theSurf: Adaptor3d_Surface, theSh: GeomAbs_Shape): number;

static UIntervals(theSurf: Adaptor3d_Surface, theTab: NCollection_Array1_double, theSh: GeomAbs_Shape): void;

static VIntervals(theSurf: Adaptor3d_Surface, theTab: NCollection_Array1_double, theSh: GeomAbs_Shape): void;

// If <First> >= <Last>
static UTrim(theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number): Adaptor3d_Surface;

// If <First> >= <Last>
static VTrim(theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number): Adaptor3d_Surface;

static IsUClosed(theSurf: Adaptor3d_Surface): boolean;

static IsVClosed(theSurf: Adaptor3d_Surface): boolean;

static IsUPeriodic(theSurf: Adaptor3d_Surface): boolean;

static UPeriod(theSurf: Adaptor3d_Surface): number;

static IsVPeriodic(theSurf: Adaptor3d_Surface): boolean;

static VPeriod(theSurf: Adaptor3d_Surface): number;

static Value(theSurf: Adaptor3d_Surface, theU: number, theV: number): gp_Pnt;

static D0(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt): void;

static D1(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec): void;

static D2(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec): void;

static D3(theSurf: Adaptor3d_Surface, theU: number, theV: number, thePnt: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec, theD3U: gp_Vec, theD3V: gp_Vec, theD3UUV: gp_Vec, theD3UVV: gp_Vec): void;

static DN(theSurf: Adaptor3d_Surface, theU: number, theV: number, theNU: number, theNV: number): gp_Vec;

static UResolution(theSurf: Adaptor3d_Surface, theR3d: number): number;

static VResolution(theSurf: Adaptor3d_Surface, theR3d: number): number;

static GetType(theSurf: Adaptor3d_Surface): GeomAbs_SurfaceType;

static Plane(theSurf: Adaptor3d_Surface): gp_Pln;

static Cylinder(theSurf: Adaptor3d_Surface): gp_Cylinder;

static Cone(theSurf: Adaptor3d_Surface): gp_Cone;

static Torus(theSurf: Adaptor3d_Surface): gp_Torus;

static Sphere(theSurf: Adaptor3d_Surface): gp_Sphere;

static Bezier(theSurf: Adaptor3d_Surface): Geom_BezierSurface;

static BSpline(theSurf: Adaptor3d_Surface): Geom_BSplineSurface;

static AxeOfRevolution(theSurf: Adaptor3d_Surface): gp_Ax1;

static Direction(theSurf: Adaptor3d_Surface): gp_Dir;

static BasisCurve(theSurf: Adaptor3d_Surface): Adaptor3d_Curve;

static BasisSurface(theSurf: Adaptor3d_Surface): Adaptor3d_Surface;

static OffsetValue(theSurf: Adaptor3d_Surface): number;

static IsSurfG1(theSurf: Adaptor3d_Surface, theAlongU: boolean, theAngTol?: number): boolean;

static NbSamplesU(S: Adaptor3d_Surface): number;
static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;
static NbSamplesU(S: Adaptor3d_Surface): number;
static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

static NbSamplesV(S: Adaptor3d_Surface): number;
static NbSamplesV(argNo0: Adaptor3d_Surface, v1: number, v2: number): number;
static NbSamplesV(S: Adaptor3d_Surface): number;
static NbSamplesV(argNo0: Adaptor3d_Surface, v1: number, v2: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Adaptor3d_HVertex: declare class Adaptor3d_HVertex extends Standard_Transient

constructor

Value(): gp_Pnt2d;

Parameter(C: Adaptor2d_Curve2d): number;

// Parametric resolution (2d)
Resolution(C: Adaptor2d_Curve2d): number;

Orientation(): TopAbs_Orientation;

IsSame(Other: Adaptor3d_HVertex): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Used to find the points U(t) = U0 or V(t) = V0 in order to determine the Cn discontinuities of an Adpator_CurveOnSurface relatively to the discontinuities of the surface
Adaptor3d_InterFunc: declare class Adaptor3d_InterFunc extends math_FunctionWithDerivative

constructor

// computes the value <F>of the function for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an isoparametric curve on a surface
Adaptor3d_IsoCurve: declare class Adaptor3d_IsoCurve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Curve;

// Changes the surface
Load(S: Adaptor3d_Surface): void;
Load(Iso: GeomAbs_IsoType, Param: number): void;
Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;
Load(S: Adaptor3d_Surface): void;
Load(Iso: GeomAbs_IsoType, Param: number): void;
Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;
Load(S: Adaptor3d_Surface): void;
Load(Iso: GeomAbs_IsoType, Param: number): void;
Load(Iso: GeomAbs_IsoType, Param: number, WFirst: number, WLast: number): void;

Surface(): Adaptor3d_Surface;

Iso(): GeomAbs_IsoType;

Parameter(): number;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a curve equivalent of <me> between parameters <First> and <Last>
Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Computes the point of parameter theU on the curve
EvalD0(theU: number): gp_Pnt;

// Computes the point of parameter theU on the curve with its first derivative
EvalD1(theU: number): Geom_Curve_ResD1;

// Returns the point and the first and second derivatives at parameter theU
EvalD2(theU: number): Geom_Curve_ResD2;

// Returns the point and the first, second and third derivatives at parameter theU
EvalD3(theU: number): Geom_Curve_ResD3;

// Returns the derivative of order theN at parameter theU
EvalDN(theU: number, theN: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin;

Circle(): gp_Circ;

Ellipse(): gp_Elips;

Hyperbola(): gp_Hypr;

Parabola(): gp_Parab;

Degree(): number;

IsRational(): boolean;

NbPoles(): number;

NbKnots(): number;

Bezier(): Geom_BezierCurve;

BSpline(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for surfaces on which geometric algorithms work
Adaptor3d_Surface: declare class Adaptor3d_Surface extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Surface;

FirstUParameter(): number;

LastUParameter(): number;

FirstVParameter(): number;

LastVParameter(): number;

UContinuity(): GeomAbs_Shape;

VContinuity(): GeomAbs_Shape;

// Returns the number of U intervals for continuity
NbUIntervals(S: GeomAbs_Shape): number;

// Returns the number of V intervals for continuity
NbVIntervals(S: GeomAbs_Shape): number;

// Returns the intervals with the requested continuity in the U direction
UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the intervals with the requested continuity in the V direction
VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a surface trimmed in the U direction equivalent of <me> between parameters <First> and <Last>
UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

// Returns a surface trimmed in the V direction between parameters <First> and <Last>
VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

UPeriod(): number;

IsVPeriodic(): boolean;

VPeriod(): number;

// Computes the point of parameters U,V on the surface
Value(theU: number, theV: number): gp_Pnt;

// Computes the point of parameters U,V on the surface
D0(theU: number, theV: number, theP: gp_Pnt): void;
// theP: Mutated in place

// Computes the point and the first derivatives on the surface
D1(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec): void;
// theP: Mutated in place
// theD1U: Mutated in place
// theD1V: Mutated in place

// Computes the point, the first and second derivatives on the surface
D2(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec): void;
// theP: Mutated in place
// theD1U: Mutated in place
// theD1V: Mutated in place
// theD2U: Mutated in place
// theD2V: Mutated in place
// theD2UV: Mutated in place

// Computes the point, the first, second and third derivatives on the surface
D3(theU: number, theV: number, theP: gp_Pnt, theD1U: gp_Vec, theD1V: gp_Vec, theD2U: gp_Vec, theD2V: gp_Vec, theD2UV: gp_Vec, theD3U: gp_Vec, theD3V: gp_Vec, theD3UUV: gp_Vec, theD3UVV: gp_Vec): void;
// theP: Mutated in place
// theD1U: Mutated in place
// theD1V: Mutated in place
// theD2U: Mutated in place
// theD2V: Mutated in place
// theD2UV: Mutated in place
// theD3U: Mutated in place
// theD3V: Mutated in place
// theD3UUV: Mutated in place
// theD3UVV: Mutated in place

// Computes the derivative of order Nu in the direction U and Nv in the direction V at the point P(U, V)
DN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

// Returns the parametric U resolution corresponding to the real space resolution <R3d>
UResolution(R3d: number): number;

// Returns the parametric V resolution corresponding to the real space resolution <R3d>
VResolution(R3d: number): number;

// Returns the type of the surface
GetType(): GeomAbs_SurfaceType;

Plane(): gp_Pln;

Cylinder(): gp_Cylinder;

Cone(): gp_Cone;

Sphere(): gp_Sphere;

Torus(): gp_Torus;

UDegree(): number;

NbUPoles(): number;

VDegree(): number;

NbVPoles(): number;

NbUKnots(): number;

NbVKnots(): number;

IsURational(): boolean;

IsVRational(): boolean;

Bezier(): Geom_BezierSurface;

BSpline(): Geom_BSplineSurface;

AxeOfRevolution(): gp_Ax1;

Direction(): gp_Dir;

BasisCurve(): Adaptor3d_Curve;

BasisSurface(): Adaptor3d_Surface;

OffsetValue(): number;

// Computes the point of parameters (U, V) on the surface
EvalD0(theU: number, theV: number): gp_Pnt;

// Computes the point and first partial derivatives at (U, V)
EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

// Computes the point and partial derivatives up to 2nd order at (U, V)
EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

// Computes the point and partial derivatives up to 3rd order at (U, V)
EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in U and Nv in V at (U, V)
EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides a default topological tool, based on the Umin,Vmin,Umax,Vmax of an HSurface from Adaptor3d
Adaptor3d_TopolTool: declare class Adaptor3d_TopolTool extends Standard_Transient

constructor

Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;
Initialize(): void;
Initialize(S: Adaptor3d_Surface): void;
Initialize(Curve: Adaptor2d_Curve2d): void;

Init(): void;

More(): boolean;

Value(): Adaptor2d_Curve2d;

Next(): void;

InitVertexIterator(): void;

MoreVertex(): boolean;

Vertex(): Adaptor3d_HVertex;

NextVertex(): void;

Classify(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): TopAbs_State;

IsThePointOn(P: gp_Pnt2d, Tol: number, ReacdreOnPeriodic?: boolean): boolean;

// If the function returns the orientation of the arc
Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;
Orientation(C: Adaptor2d_Curve2d): TopAbs_Orientation;
Orientation(V: Adaptor3d_HVertex): TopAbs_Orientation;

// Returns True if the vertices V1 and V2 are identical
Identical(V1: Adaptor3d_HVertex, V2: Adaptor3d_HVertex): boolean;

// answers if arcs and vertices may have 3d representations, so that we could use Tol3d and Pnt methods
Has3d(): boolean;

// returns 3d tolerance of the arc C returns 3d tolerance of the vertex V
Tol3d(C: Adaptor2d_Curve2d): number;
Tol3d(V: Adaptor3d_HVertex): number;
Tol3d(C: Adaptor2d_Curve2d): number;
Tol3d(V: Adaptor3d_HVertex): number;

// returns 3d point of the vertex V
Pnt(V: Adaptor3d_HVertex): gp_Pnt;

ComputeSamplePoints(): void;

// compute the sample-points for the intersections algorithms
NbSamplesU(): number;

// compute the sample-points for the intersections algorithms
NbSamplesV(): number;

// compute the sample-points for the intersections algorithms
NbSamples(): number;

// return the set of U parameters on the surface obtained by the method SamplePnts
UParameters(theArray: NCollection_Array1_double): void;
// theArray: Mutated in place

// return the set of V parameters on the surface obtained by the method SamplePnts
VParameters(theArray: NCollection_Array1_double): void;
// theArray: Mutated in place

SamplePoint(Index: number, P2d: gp_Pnt2d, P3d: gp_Pnt): void;

DomainIsInfinite(): boolean;

// Compute the sample-points for the intersections algorithms by adaptive algorithm for BSpline surfaces
SamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;
// theDefl: a required deflection
// theNUmin: minimal nb points for U
// theNVmin: minimal nb points for V

// Compute the sample-points for the intersections algorithms by adaptive algorithm for BSpline surfaces - is used in SamplePnts
BSplSamplePnts(theDefl: number, theNUmin: number, theNVmin: number): void;
// theDefl: required deflection
// theNUmin: minimal nb points for U
// theNVmin: minimal nb points for V

// Returns true if provide uniform sampling of points
IsUniformSampling(): boolean;

// Computes the cone's apex parameters
static GetConeApexParam(theC: gp_Cone, theU?: number, theV?: number): { theU: number; theV: number };
// theC: conical surface
// theU: U parameter of cone's apex
// theV: V parameter of cone's apex

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
